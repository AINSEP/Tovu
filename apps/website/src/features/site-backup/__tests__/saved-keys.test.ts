import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo, SecretsVaultService, createVaultMetaParsers, buildVaultAad } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { AesGcmSecretSealer, openWithPassphrase, sealWithPassphrase } from "@jini-ai/platform/secrets";
import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { createSiteSavedKeys, type SavedKeysStore } from "../saved-keys.js";

function store(workspaceId: string): SavedKeysStore & { keyring: InMemoryKeyring; sealer: AesGcmSecretSealer } {
  const repo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring({ hkdfSalt: "saved-keys-test" }, { keyId: workspaceId });
  const sealer = new AesGcmSecretSealer({ keyring });
  const vault = new SecretsVaultService({ repo, keyring, sealer, metaParsers: createVaultMetaParsers({}), authorize: async () => {},
    now: () => "2026-10-31T00:00:00Z", newId: () => "unused" });
  return { workspaceId, repo, vault, keyring, sealer, settings: new InMemorySettingsRepo(), close: async () => {},
    transaction: async ({ run }) => run() };
}
const context = (workspaceId: string) => ({ workspaceId, kind: "vendor" as const, ownerKey: "tovu", principalId: null, binding: null });
async function seed(s: ReturnType<typeof store>, id = "credential", label = "Hosting", token = "private-provider-key") {
  await s.vault.put({ ...context(s.workspaceId), id, label, provider: "hosting", expectedRevision: null,
    meta: { credentialType: "vendor", worksFor: ["hosting"] }, payload: { token } });
}
function adapter(source: ReturnType<typeof store>, target: ReturnType<typeof store>, project?: SavedKeysStore) {
  return createSiteSavedKeys({ workspaceId: source.workspaceId, keyring: source.keyring, sealer: source.sealer,
    openSnapshot: async () => source, openRecipient: async () => target,
    ...(project ? { captureProject: async ({ run }) => run(project) } : {}), trustedDefinitions: async () => [] });
}
const capture = { snapshot: Buffer.from("snapshot"), shareId: "share", workspaceId: "source" };
const destination = { siteId: "meta-uuid", dir: "/recipient", dbPath: "/recipient/content.db" };

test("capture encrypts, password is 24 random bytes and registry sealing binds workspace and share", { timeout: 10000 }, async () => {
  const source = store("source"), target = store("recipient");
  await seed(source);
  const keys = adapter(source, target);
  const result = await keys.capture(capture);
  const { password } = await keys.reveal({ ...capture, sealedPassword: result.sealedPassword });
  assert.match(password, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(Buffer.from(password, "base64url").length, 24);
  const wire = Buffer.concat([result.encryptedKeys, Buffer.from(JSON.stringify(result.sealedPassword))]).toString();
  for (const secret of [password, "private-provider-key"]) assert.equal(wire.includes(secret), false);
  await assert.rejects(keys.reveal({ ...capture, shareId: "other", sealedPassword: result.sealedPassword }));
  await assert.rejects(keys.reveal({ ...capture, workspaceId: "other", sealedPassword: result.sealedPassword }));
  const second = await keys.capture(capture);
  assert.notEqual((await keys.reveal({ ...capture, sealedPassword: second.sealedPassword })).password, password);
});

test("correct password re-seals under recipient; wrong, missing and malformed passwords leave keys out", { timeout: 10000 }, async () => {
  const source = store("source"), target = store("recipient");
  await seed(source);
  const keys = adapter(source, target), result = await keys.capture(capture);
  const { password } = await keys.reveal({ ...capture, sealedPassword: result.sealedPassword });
  for (const supplied of [undefined, "wrong"]) {
    assert.equal((await keys.restore({ ...destination, encryptedKeys: result.encryptedKeys, password: supplied })).notices.length, 1);
    assert.deepEqual(await target.repo.list(context("recipient")), []);
  }
  assert.equal((await keys.restore({ ...destination, encryptedKeys: Buffer.from("bad"), password })).notices.length, 1);
  assert.deepEqual(await keys.restore({ ...destination, encryptedKeys: result.encryptedKeys, password }), { notices: [] });
  const imported = (await target.repo.find({ workspaceId: "recipient", id: "credential" }))!;
  assert.deepEqual((await target.vault.get({ ...context("recipient"), id: imported.id }))?.payload, { token: "private-provider-key" });
  await assert.rejects(source.sealer.open({ sealed: imported.sealed! }, { aad: buildVaultAad(imported) }));
});

test("site label overrides attached project; personal and MCP state is excluded", { timeout: 10000 }, async () => {
  const source = store("source"), project = store("project"), target = store("recipient");
  await seed(source);
  await seed(project, "shadow", "Hosting", "shadowed-project-token");
  await seed(project, "attached", "Other", "attached-project-token");
  await project.vault.put({ ...context("project"), id: "attached", label: "Other", provider: "hosting", expectedRevision: 1,
    isDefault: true, meta: { credentialType: "vendor", worksFor: ["hosting"] } });
  await source.vault.put({ ...context("source"), kind: "personal-execution", principalId: "person", id: "personal", expectedRevision: null, provider: null, label: "Personal", meta: {}, payload: { token: "personal-token" } });
  for (const kind of ["mcp-env", "mcp-auth"] as const) {
    await source.vault.put({ ...context("source"), kind, id: kind, expectedRevision: null, provider: null, label: kind, meta: {}, payload: { token: `private-${kind}-token` } });
  }
  const keys = adapter(source, target, project), result = await keys.capture(capture);
  const { password } = await keys.reveal({ ...capture, sealedPassword: result.sealedPassword });
  const payload = await openWithPassphrase({ envelope: result.encryptedKeys.toString(), passphrase: password });
  for (const omitted of ["personal-token", "private-mcp-env-token", "private-mcp-auth-token", "shadowed-project-token"]) assert.equal(payload.includes(omitted), false);
  await keys.restore({ ...destination, encryptedKeys: result.encryptedKeys, password });
  assert.deepEqual((await target.repo.list(context("recipient"))).map(row => row.id).sort(), ["attached", "credential"]);
  assert.equal((await target.repo.findDefault!({ ...context("recipient"), provider: "hosting" }))?.id, "credential", "the site's provider default overrides the project's default");
});

test("all v1 site credential kinds retain their logical configuration through recipient re-sealing", { timeout: 10000 }, async () => {
  const source = store("source"), target = store("recipient"), keys = adapter(source, target);
  for (const kind of ["site-assistant", "media-provider", "source-control", "publish-peer", "database-destination", "vendor"] as const) {
    const meta = kind === "vendor" ? { credentialType: "custom", worksFor: ["provider"], category: "general" } : {};
    await source.vault.put({ ...context("source"), kind, id: kind, label: kind, provider: "provider", meta,
      payload: kind === "database-destination" ? { connectionString: "postgres://user:password@private/db" } : { token: `${kind}-private-token` }, expectedRevision: null });
  }
  const captured = await keys.capture(capture), revealed = await keys.reveal({ ...capture, sealedPassword: captured.sealedPassword });
  assert.deepEqual(await keys.restore({ ...destination, encryptedKeys: captured.encryptedKeys, password: revealed.password }), { notices: [] });
  for (const kind of ["site-assistant", "media-provider", "source-control", "publish-peer", "database-destination", "vendor"] as const) {
    const imported = await target.vault.get({ ...context("recipient"), kind, id: kind });
    assert.deepEqual(imported?.payload, kind === "database-destination" ? { connectionString: "postgres://user:password@private/db" } : { token: `${kind}-private-token` });
  }
});

test("authenticated but invalid optional payload never writes a partial credential set", { timeout: 10000 }, async () => {
  const source = store("source"), target = store("recipient"), keys = adapter(source, target);
  const encryptedKeys = Buffer.from(await sealWithPassphrase({ passphrase: "password", payload: JSON.stringify({ format: "tovu-site-saved-keys", version: 1, credentials: [{ kind: "personal-execution" }], settings: [] }) }));
  assert.equal((await keys.restore({ ...destination, encryptedKeys, password: "password" })).notices.length, 1);
  assert.deepEqual(await target.repo.list(context("recipient")), []);
});

test("modified ciphertext, unsupported KDF and oversized optional envelopes leave recipient unchanged", { timeout: 10000 }, async () => {
  const source = store("source"), target = store("recipient"), keys = adapter(source, target);
  await seed(source);
  const result = await keys.capture(capture);
  const { password } = await keys.reveal({ ...capture, sealedPassword: result.sealedPassword });
  const tampered = JSON.parse(result.encryptedKeys.toString());
  const ciphertext = Buffer.from(tampered.sealed.ciphertext, "base64"); ciphertext[0] = ciphertext[0]! ^ 1;
  tampered.sealed.ciphertext = ciphertext.toString("base64");
  const expensive = JSON.parse(result.encryptedKeys.toString()); expensive.header.kdf.N = 1073741824;
  for (const encryptedKeys of [Buffer.from(JSON.stringify(tampered)), Buffer.from(JSON.stringify(expensive)), Buffer.alloc(24 * 1024 * 1024 + 1)]) {
    const response = await keys.restore({ ...destination, encryptedKeys, password });
    assert.equal(response.notices.length, 1);
    assert.equal(JSON.stringify(response).includes(password), false);
    assert.deepEqual(await target.repo.list(context("recipient")), []);
  }
});

test("an unsupported current secret setting is omitted with a safe notice", { timeout: 10000 }, async () => {
  const source = store("source"), target = store("recipient"), keys = adapter(source, target);
  await source.settings.saveDefinition({ settingId: "secret", workspaceId: "source", namespace: "site.private", key: "credential", version: 1,
    ownerKind: "site", ownerId: null, schema: { type: "string" }, defaultValue: null, scopes: 2, secret: true, status: "active",
    aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z" });
  await source.settings.saveWorkspaceValue({ settingId: "secret", workspaceId: "source", principalId: null, scope: "workspace", state: "set",
    valueJson: { secret: "invalid-setting-secret" }, defVersion: 1, seq: 0, updatedBy: "share", updatedAt: "2026-10-31T00:00:00Z", originPluginId: null });
  const captured = await keys.capture(capture);
  assert.equal(captured.notices.length, 1);
  assert.equal(JSON.stringify(captured.notices).includes("invalid-setting-secret"), false);
  const revealed = await keys.reveal({ ...capture, sealedPassword: captured.sealedPassword });
  assert.deepEqual(await keys.restore({ ...destination, encryptedKeys: captured.encryptedKeys, password: revealed.password }), { notices: [] });
});
