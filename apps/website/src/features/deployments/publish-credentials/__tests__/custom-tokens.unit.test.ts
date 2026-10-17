import assert from "node:assert/strict";
import test from "node:test";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryVendorCredentialSetRepo } from "../repo.memory.js";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { createCustomCredential } from "#src/features/custom-credentials/store";
import { loadBundledDeployTargets } from "../../deploy-targets/__tests__/bundled-deploy-targets.fixture.js";
import { createDbPublishCredentialSource } from "../../static-publish/credentials.js";
import { createPublishCredential, listPublishCredentials, resolveForPublish, PublishCredentialSecretStoreUnconfiguredError } from "../store.js";

function fixture() {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryVendorCredentialSetRepo({});
  let id = 0;
  const deps = { repo, keyring, sealer: new AesGcmSecretSealer(keyring),
    clock: createFakeClock({ startIso: "2026-10-17T00:00:00Z" }),
    idGen: { newId: () => `custom-publish-${++id}` }, loadDeployTargets: loadBundledDeployTargets };
  const customRepo = new CustomCredentialVaultRepo({ vault: repo.vault });
  const save = (label = "Vercel", workspaceId = "site") => createCustomCredential({ ...deps, repo: customRepo }, {
    workspaceId, label, category: "general", baseUrl: "https://api.vercel.com",
    connection: { token: "synthetic-publish-token" },
  });
  return { deps, save, source: createDbPublishCredentialSource(deps) };
}

test("a custom Vercel key configures and resolves the same publish source as vendor keys", async () => {
  const f = fixture();
  const key = await f.save();
  assert.deepEqual(await f.source.isConfigured({ workspaceId: "site", target: "vercel" }), { configured: true });
  assert.deepEqual(await f.source.resolve({ workspaceId: "site", target: "vercel" }), { ok: true, token: "synthetic-publish-token" });
  assert.deepEqual(await f.source.resolve({ workspaceId: "site", target: "vercel", credentialId: key.id }), { ok: true, token: "synthetic-publish-token" });
  assert.equal((await f.source.resolve({ workspaceId: "site", target: "github-pages", credentialId: key.id })).ok, false);
  assert.equal((await f.source.resolve({ workspaceId: "other", target: "vercel", credentialId: key.id })).ok, false);
  // Capabilities need only stored metadata, even with a broken/unavailable sealer.
  const readDeps = { ...f.deps, sealer: { seal: async () => { throw new Error("must not seal"); }, open: async () => { throw new Error("must not open"); } } };
  const rows = await listPublishCredentials(readDeps, { workspaceId: "site", includeCustomTokens: true });
  assert.deepEqual(rows.map(row => [row.id, row.providerId, row.isDefault]), [[key.id, "vercel", true]]);
  assert.doesNotMatch(JSON.stringify(rows), /synthetic-publish-token|sealed|ciphertext/);
  assert.deepEqual(await listPublishCredentials(readDeps, { workspaceId: "site" }), [], "custom edit/delete remains on the custom-key card");
});

test("multiple case variants require selection; a vendor default wins without hiding custom keys", async () => {
  const f = fixture();
  const first = await f.save("Vercel");
  await f.save("vercel");
  assert.equal((await f.source.isConfigured({ workspaceId: "site", target: "vercel" })).configured, false);
  assert.equal((await f.source.resolve({ workspaceId: "site", target: "vercel" })).ok, false);
  assert.equal((await f.source.resolve({ workspaceId: "site", target: "vercel", credentialId: first.id })).ok, true);
  const vendor = await createPublishCredential(f.deps, { workspaceId: "site", label: "Vendor connection",
    connection: { providerId: "vercel", token: "synthetic-vendor-token" } });
  assert.deepEqual(await f.source.resolve({ workspaceId: "site", target: "vercel" }), { ok: true, token: "synthetic-vendor-token" });
  const rows = await listPublishCredentials(f.deps, { workspaceId: "site", includeCustomTokens: true });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.filter(row => row.isDefault).map(row => row.id), [vendor.id]);
});

test("explicit custom provider matches, while wrong ownership/binding and incomplete host credentials do not", async () => {
  const f = fixture();
  const key = await f.save("Production");
  const row = (await f.deps.repo.vault.find({ workspaceId: "site", id: key.id }))!;
  await f.deps.repo.vault.put({ record: { ...row, provider: "VeRcEl", revision: row.revision + 1 }, expectedRevision: row.revision });
  assert.equal((await f.source.resolve({ workspaceId: "site", target: "vercel" })).ok, true);
  await f.save("Cloudflare");
  assert.equal((await f.source.isConfigured({ workspaceId: "site", target: "cloudflare-pages" })).configured, false);
  const vault = f.deps.repo.vault;
  const scoped = { ...f.deps, repo: new InMemoryVendorCredentialSetRepo({ vault: {
    ...vault, list: async () => [{ ...row, ownerKey: "foreign" }, { ...row, binding: "foreign" }],
    find: vault.find.bind(vault), put: vault.put.bind(vault), patchMeta: vault.patchMeta.bind(vault), delete: vault.delete.bind(vault),
    findDefault: vault.findDefault!.bind(vault),
  } }) };
  assert.equal((await createDbPublishCredentialSource(scoped).isConfigured({ workspaceId: "site", target: "vercel" })).configured, false);
});

test("crypto failures stay typed and do not become missing-credential results", async () => {
  const f = fixture();
  const key = await f.save();
  const broken = { ...f.deps, sealer: { ...f.deps.sealer, seal: f.deps.sealer.seal.bind(f.deps.sealer),
    open: async () => { throw new Error("synthetic failure"); } } };
  await assert.rejects(resolveForPublish(broken, { workspaceId: "site", id: key.id }), PublishCredentialSecretStoreUnconfiguredError);
});

test("sharing a vendor never lets a custom token satisfy a sibling host's extra required fields", async () => {
  const f = fixture();
  const saved = await f.save();
  const registry = await loadBundledDeployTargets();
  const vercel = registry.get("vercel")!;
  const sibling = { ...vercel, descriptor: { ...vercel.descriptor, id: "vercel-with-account",
    credential: { ...vercel.descriptor.credential!, fields: [...vercel.descriptor.credential!.fields,
      { name: "accountId", label: "Account", required: true }] } } };
  const source = createDbPublishCredentialSource({ ...f.deps, loadDeployTargets: async () => ({
    ...registry, get: id => id === sibling.descriptor.id ? sibling : registry.get(id), list: () => [...registry.list(), sibling],
  }) });
  assert.equal((await source.isConfigured({ workspaceId: "site", target: sibling.descriptor.id })).configured, false);
  assert.equal((await source.resolve({ workspaceId: "site", target: sibling.descriptor.id })).ok, false);
  assert.equal((await source.resolve({ workspaceId: "site", target: sibling.descriptor.id, credentialId: saved.id })).ok, false);
});
