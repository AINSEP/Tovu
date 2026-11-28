/** Keys saved on one site of this install, picked from another: real files and SQLite, fake tokens only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sql } from "kysely";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { type VaultMeta } from "@jini-ai/core/contracts/vault";
import { vaultRepo } from "#src/platform/db/__tests__/vault-credential.fixture";
import { fingerprintSiteKeyHex, FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { secretsVaultStatements } from "#src/platform/db/migrations/0012_secrets_vault";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { attachedOnlyVault } from "@jini-ai/user-management/project-keys/attached-vault";
import { createProjectKeys } from "#src/features/project-keys/host-bindings";
import { openProjectStore } from "../project-store.js";
import { createOtherSiteKeys } from "../other-site-keys.js";
import { composeProviderConfig } from "../site-deps/provider-identity.js";
import { attachedVaultPolicy } from "#src/features/project-keys/vault-policy";

const stamp = "2026-11-08T12:00:00.000Z";
const FAKE_TOKEN = "fake-vercel-token-not-real-1234";
const metaParsers = createTovuVaultKinds({ policy: { validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined } }).metaParsers;
const vendorMeta: VaultMeta = { credentialType: "vendor", worksFor: ["vercel"] };

async function fixture() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-other-site-keys-")));
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: path.join(home, "app") });
  const openKernels: { close: () => Promise<unknown> }[] = [];
  const site = async (id: string, hex: string) => {
    const dir = path.join(home, id);
    fs.mkdirSync(dir);
    fs.mkdirSync(path.join(home, ".tovu", "site-keys"), { recursive: true });
    const keyPath = path.join(home, ".tovu", "site-keys", `${id}.hex`);
    fs.writeFileSync(keyPath, hex);
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: id, siteKeyId: id, siteKeyFingerprint: fingerprintSiteKeyHex({ hex }), storage: { kind: "sqlite" } }));
    workspace.registry({}).merge({ entries: [{ id, path: dir, name: id, createdBy: "key-share-test", lastOpened: null }] });
    const dbPath = resolveSiteDatabasePaths({ dir }, { workspace, placement: "inSite", reserveIdentity: false }).contentDbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const kernel = openSqliteFileKernel<ContentDatabase>({ filePath: dbPath });
    openKernels.push(kernel);
    await kernel.execute(sql`CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT, slug TEXT, created_at TEXT)`);
    await kernel.execute(sql`CREATE TABLE principals(id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO workspaces VALUES(${id},${id},${id},${stamp})`);
    for (const statement of secretsVaultStatements({ dialect: "sqlite" })) await kernel.execute(sql.raw(statement));
    const keyring = new FixedSiteKeyKeyring({ hex });
    const service = new SecretsVaultService({ repo: vaultRepo(kernel), keyring, sealer: new AesGcmSecretSealer({ keyring }), metaParsers,
      authorize: async () => {}, now: () => stamp, newId: () => "unused" });
    return { id, dir, dbPath, keyPath, service, kernel };
  };
  const save = (s: Awaited<ReturnType<typeof site>>, id: string, label: string, token = FAKE_TOKEN) =>
    s.service.put({ workspaceId: s.id, kind: "vendor", ownerKey: "tovu", principalId: null, binding: null, id, expectedRevision: null,
      provider: "vercel", label, meta: vendorMeta, payload: { vendorId: "vercel", token }, hintToken: token });
  const a = await site("site-a", "11".repeat(32));
  const b = await site("site-b", "22".repeat(32));
  const store = await openProjectStore({ sitesHome: workspace.home({}), home, appDataDir: path.join(home, "app") });
  const project = new SecretsVaultService({ repo: store.vault.repo, keyring: store.vault.keyring, sealer: store.vault.sealer, metaParsers,
    authorize: async () => {}, now: () => stamp, newId: () => "unused" });
  const siteKeys = createOtherSiteKeys({ target: { siteId: b.id, name: b.id, dir: b.dir, file: b.dbPath }, project: store.vault }, { workspace, home });
  const keysOnB = createProjectKeys({ vault: store.vault.repo, attachments: store.attachments, siteId: b.id, siteName: b.id, siteKeys,
    providerUsage: async () => ({ store: "project", usedByThisSite: false, usedBy: [] }), reapply: async () => "now", transaction: input => store.transaction(input) });
  const projectRows = () => project.list({ workspaceId: "project", kind: "vendor", ownerKey: "tovu", principalId: null });
  return { home, a, b, c: () => site("site-c", "33".repeat(32)), save, store, project, siteKeys, keysOnB, projectRows,
    close: async () => { store.close({}); for (const kernel of openKernels) await kernel.close(); fs.rmSync(home, { recursive: true, force: true }); } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const siteRow = (rows: { name: string; keyId: string; locked?: string }[], name: string) => {
  const row = rows.find(item => item.name === name);
  assert.ok(row, `expected a row named ${name}, got ${rows.map(item => item.name).join(" | ")}`);
  return row;
};
const projectToken = async (f: Fixture, id: string) => {
  const stored = await f.project.get({ workspaceId: "project", id, kind: "vendor", ownerKey: "tovu", principalId: null, binding: null });
  return (stored?.payload as { token?: string } | null | undefined)?.token;
};

test("a key saved only on site A is listed on site B and usable there after approval", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    const before = fs.readFileSync(f.a.dbPath);
    const listed = await f.keysOnB.listChoices({});
    const row = siteRow(listed, "Vercel, site-a");
    assert.equal(row.locked, undefined);
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(FAKE_TOKEN), "listing never carries a token");

    const used = await f.keysOnB.use({ keyId: row.keyId, use: true });
    assert.doesNotMatch(JSON.stringify(used), new RegExp(FAKE_TOKEN), "use result never carries a token");
    assert.equal(used.usedByThisSite, true);
    assert.equal(await projectToken(f, used.keyId), FAKE_TOKEN, "the owner store holds the key, re-sealed");
    const granted = attachedOnlyVault({ vault: f.store.vault.repo, attachments: f.store.attachments, siteId: f.b.id, policy: attachedVaultPolicy });
    assert.equal((await granted.find({ workspaceId: "project", id: used.keyId }))?.id, used.keyId, "site B can read it through its grant");
    const grantedOnA = attachedOnlyVault({ vault: f.store.vault.repo, attachments: f.store.attachments, siteId: f.a.id, policy: attachedVaultPolicy });
    assert.equal(await grantedOnA.find({ workspaceId: "project", id: used.keyId }), null, "only the approving site gets a grant");
    assert.deepEqual(fs.readFileSync(f.a.dbPath), before, "the source vault is never written");
  } finally { await f.close(); }
});

test("picker keeps fifty per source and reports each omitted count", async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 51; index++) await f.save(f.a, `key-${index}`, `A key ${index}`);
    for (let index = 0; index < 52; index++) await f.save(f.b, `key-${index}`, `B key ${index}`);
    const rows = await f.keysOnB.listChoices({});
    for (const { site, count } of [{ site: f.a, count: 1 }, { site: f.b, count: 2 }]) {
      const choices = rows.filter(row => row.siteName === site.id);
      assert.equal(choices.length, 50, "each source offers fifty actual saved keys");
      assert.deepEqual(choices.filter(row => row.omittedCount !== undefined).map(row => row.omittedCount), [count], "each source reports its omitted count exactly once");
    }
  } finally { await f.close(); }
});

test("an approved saved key remains usable after fifty earlier keys are inserted on its source site", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    const row = siteRow(await f.keysOnB.listChoices({}), "Vercel, site-a");
    for (let index = 0; index < 50; index++) {
      await f.save(f.a, `ahead-${String(index).padStart(2, "0")}`, `Earlier key ${index}`, "fake-earlier-token-not-real-5678");
    }
    const before = fs.readFileSync(f.a.dbPath);
    const used = await f.keysOnB.use({ keyId: row.keyId, use: true });
    assert.equal(used.keyId, "vercel-a", "the captured saved-key ID adopts the original row beyond the picker limit");
    assert.equal(used.usedByThisSite, true, "the approving site receives the saved key");
    assert.equal(await projectToken(f, used.keyId), FAKE_TOKEN, "the original key is re-sealed into the owner store");
    const granted = attachedOnlyVault({ vault: f.store.vault.repo, attachments: f.store.attachments, siteId: f.b.id, policy: attachedVaultPolicy });
    assert.equal((await granted.find({ workspaceId: "project", id: used.keyId }))?.id, used.keyId, "site B can read the adopted key through its grant");
    assert.deepEqual(fs.readFileSync(f.a.dbPath), before, "adopting the captured key leaves the source vault unchanged");
  } finally { await f.close(); }
});

test("a key on this site can be added to Shared Keys from the same picker", async () => {
  const f = await fixture();
  try {
    await f.save(f.b, "vercel-b", "Vercel");
    const row = siteRow(await f.keysOnB.listChoices({}), "Vercel, this site");
    const used = await f.keysOnB.use({ keyId: row.keyId, use: true });
    assert.equal(await projectToken(f, used.keyId), FAKE_TOKEN);
  } finally { await f.close(); }
});

test("a source site whose key cannot be unlocked says so in plain words and adds nothing", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    fs.rmSync(f.a.keyPath);
    const listed = await f.keysOnB.listChoices({});
    const row = siteRow(listed, "Vercel, site-a");
    assert.match(row.locked ?? "", /site-a/);
    assert.match(row.locked ?? "", /recover/i, "tells the owner what to do");
    await assert.rejects(f.keysOnB.use({ keyId: row.keyId, use: true }), /site-a/);
    assert.deepEqual(await f.projectRows(), [], "a locked key never reaches the owner store");
  } finally { await f.close(); }
});

test("a key that still needs its site's upgrade says so and is not added", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    await f.a.kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify({ credentialType: "vendor" })} WHERE id='vercel-a'`);
    const row = siteRow(await f.keysOnB.listChoices({}), "Vercel, site-a");
    assert.match(row.locked ?? "", /update this key/);
    await assert.rejects(f.keysOnB.use({ keyId: row.keyId, use: true }), /update this key/);
    assert.deepEqual(await f.projectRows(), []);
  } finally { await f.close(); }
});

test("the same token picked from two sites stays one Shared Key; a different token with the same label stays distinct", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    const c = await f.c();
    await f.save(c, "vercel-c", "Vercel", "fake-other-token-not-real-9999");
    await f.save(f.b, "vercel-b", "Vercel", FAKE_TOKEN);
    const rows = await f.keysOnB.listChoices({});
    const first = await f.keysOnB.use({ keyId: siteRow(rows, "Vercel, site-a").keyId, use: true });
    const again = await f.keysOnB.use({ keyId: siteRow(rows, "Vercel, this site").keyId, use: true });
    assert.equal(again.keyId, first.keyId, "same secret reuses the existing Shared Key");
    const other = await f.keysOnB.use({ keyId: siteRow(rows, "Vercel, site-c").keyId, use: true });
    assert.notEqual(other.keyId, first.keyId);
    assert.equal(await projectToken(f, other.keyId), "fake-other-token-not-real-9999");
    assert.equal((await f.projectRows()).length, 2, "the label collision did not overwrite or fail");
  } finally { await f.close(); }
});

test("a label that looks like a token is never shown, on the row or in its lock reason", async () => {
  const f = await fixture();
  try {
    const tokenLabel = `ghp_${"a".repeat(36)}`;
    await f.save(f.a, "vercel-a", tokenLabel);
    const listed = await f.keysOnB.listChoices({});
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(tokenLabel));
    const row = siteRow(listed, "Key with an unsafe name, site-a");
    assert.match(row.locked ?? "", /unsafe name/);
    await assert.rejects(f.keysOnB.use({ keyId: row.keyId, use: true }), /unsafe name/);
    assert.deepEqual(await f.projectRows(), []);
  } finally { await f.close(); }
});

test("a source database that breaks after listing is reported in plain words, not as a driver error", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    const row = siteRow(await f.keysOnB.listChoices({}), "Vercel, site-a");
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${f.a.dbPath}${suffix}`, { force: true });
    fs.writeFileSync(f.a.dbPath, "this is not a database file at all, only some text");
    await assert.rejects(f.keysOnB.permissionFor({ keyId: row.keyId }), (error: Error) => {
      assert.equal(error.name, "ToolInputError");
      assert.match(error.message, /site-a can't be read right now/);
      return true;
    });
  } finally { await f.close(); }
});

test("a key id that no longer resolves is refused without touching the owner store", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    const row = siteRow(await f.keysOnB.listChoices({}), "Vercel, site-a");
    fs.rmSync(path.dirname(f.a.keyPath), { recursive: true });
    await assert.rejects(f.keysOnB.use({ keyId: `${row.keyId}x`, use: true }));
    assert.deepEqual(await f.projectRows(), []);
  } finally { await f.close(); }
});

test("composed owner keyring cannot derive for the site", async () => {
  const f = await fixture();
  try {
    let derivations = 0;
    const owner = f.store.vault.keyring;
    const keyring = { activeKey: owner.activeKey.bind(owner),
      derive: async () => { derivations++; return new Uint8Array(32); },
      deriveSigningSecret: async () => { derivations++; return new Uint8Array(32); } };
    const store = { ...f.store, vault: { ...f.store.vault, keyring } };
    const composed = await composeProviderConfig({ overrides: { openProjectStore: async () => store }, runtimeMode: "local",
      onStoreClose: () => {}, site: store.config, binding: { dir: f.b.dir, name: f.b.id }, references: { set: async () => {}, has: async () => false, remove: async () => {} } });
    const vault = composed.projectVault;
    assert.ok(vault, "the composed project vault is present");
    assert.deepEqual(await vault.keyring.activeKey({}), await owner.activeKey({}), "the active handle is forwarded");
    await assert.rejects(vault.keyring.derive({ workspaceId: "project", purpose: "secrets", info: "anything" }), /private to Shared Keys/);
    await assert.rejects(vault.keyring.deriveSigningSecret({ workspaceId: "project", subscriptionId: "sub", version: 1 }), /private to Shared Keys/);
    assert.equal(derivations, 0, "no derivation reaches the owner keyring");
  } finally { await f.close(); }
});

test("different secrets with matching display hints and source row IDs get distinct shared records", async () => {
  const f = await fixture();
  try {
    const c = await f.c();
    const firstToken = "fake-demo-secret-east-1234";
    const secondToken = "fake-demo-secret-west-1234";
    await f.save(f.a, "same-source-row", "Deploy", firstToken);
    await f.save(c, "same-source-row", "Deploy", secondToken);
    const choices = await f.keysOnB.listChoices({});
    const first = await f.keysOnB.use({ keyId: siteRow(choices, "Vercel, Deploy, site-a").keyId, use: true });
    const second = await f.keysOnB.use({ keyId: siteRow(choices, "Vercel, Deploy, site-c").keyId, use: true });
    assert.equal(first.keyId, "same-source-row");
    assert.match(second.keyId, /^same-source-row-[a-f0-9]{8}$/);
    assert.deepEqual(
      (await f.projectRows()).map(({ id, label }) => [id, label]).sort(),
      [[first.keyId, "Deploy"], [second.keyId, "Deploy (site-c)"]].sort(),
    );
    assert.equal(await projectToken(f, first.keyId), firstToken);
    assert.equal(await projectToken(f, second.keyId), secondToken);
  } finally { await f.close(); }
});

test("the permission lookup reads one source row's metadata, and a row removed from its site reads as missing", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Deploy");
    await f.save(f.a, "vercel-gone", "Old");
    const choices = await f.siteKeys.list({});
    const keyId = siteRow(choices, "Vercel, Deploy, site-a").keyId;
    assert.equal(keyId, "saved-on-site:site-a:vercel-a");
    assert.deepEqual(await f.siteKeys.find({ keyId }), {
      workspaceId: "project", id: "vercel-a", kind: "vendor", label: "Deploy", ownerKey: "tovu", principalId: null, binding: null,
      provider: "vercel", isDefault: false, revision: 1, sealed: null, last4: null, tokenLength: null, meta: vendorMeta, createdAt: "", updatedAt: "",
    }, "metadata only: no sealed payload, no token hint");
    const goneId = siteRow(choices, "Vercel, Old, site-a").keyId;
    await f.a.service.delete({ workspaceId: f.a.id, id: "vercel-gone", kind: "vendor", ownerKey: "tovu", principalId: null, binding: null, expectedRevision: 1 });
    assert.equal(await f.siteKeys.find({ keyId: goneId }), null);
    assert.deepEqual(await f.projectRows(), [], "a lookup never writes the owner store");
  } finally { await f.close(); }
});

test("a source site that cannot be read while listing becomes one locked row and other sites stay listed", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Deploy");
    await f.save(f.b, "vercel-b", "Preview");
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${f.a.dbPath}${suffix}`, { force: true });
    fs.writeFileSync(f.a.dbPath, "this is not a database file at all, only some text");
    const choices = await f.siteKeys.list({});
    const broken = siteRow(choices, "Keys saved on site-a");
    assert.deepEqual(broken, { keyId: "saved-on-site:site-a:", kind: "vendor", name: "Keys saved on site-a", siteName: "site-a",
      locked: "site-a can't be read right now. Open it in Tovu, then try again. Details: P25_SITE_KEYS_UNREADABLE; secret values omitted." });
    const own = siteRow(choices, "Vercel, Preview, this site");
    assert.equal(own.locked, undefined, "this site's own key stays usable");
    assert.deepEqual(choices.map(row => row.siteName).sort(), ["site-a", "site-b"]);
  } finally { await f.close(); }
});

test("a key id without the saved-on-site prefix, or without a site before its separator, is refused in plain words", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Deploy");
    for (const keyId of ["vercel-a", "saved-on-site:site-a", "saved-on-site::vercel-a", "saved-on-site:site-gone:vercel-a"]) {
      await assert.rejects(f.siteKeys.find({ keyId }), (error: Error) => {
        assert.equal(error.name, "ToolInputError", keyId);
        assert.equal(error.message, "This saved key is no longer on any site here. Open Use a saved key again.", keyId);
        return true;
      });
    }
  } finally { await f.close(); }
});

test("a site whose database has no vault table offers no keys and no locked row", async () => {
  const f = await fixture();
  try {
    await f.save(f.b, "vercel-b", "Preview");
    const c = await f.c();
    await c.kernel.execute(sql`DROP TABLE secrets_vault`);
    const choices = await f.siteKeys.list({});
    assert.deepEqual(choices.map(row => row.name), ["Vercel, Preview, this site"]);
  } finally { await f.close(); }
});

test("a saved key whose sealed value was damaged on its site is refused with the unlock help and adds nothing", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Deploy");
    await f.a.kernel.execute(sql`UPDATE secrets_vault SET sealed_ciphertext = 'AAAA' WHERE id = 'vercel-a'`);
    const row = siteRow(await f.keysOnB.listChoices({}), "Vercel, Deploy, site-a");
    assert.equal(row.locked, undefined, "metadata alone cannot tell the value is damaged");
    await assert.rejects(f.keysOnB.use({ keyId: row.keyId, use: true }), (error: Error) => {
      assert.equal(error.message, "site-a's keys can't be unlocked on this computer. Open site-a in Tovu and recover its key, then try again. Details: P25_SITE_KEY_LOCKED.");
      assert.doesNotMatch(error.message, /AAAA|cipher|decrypt/i);
      return true;
    });
    assert.deepEqual(await f.projectRows(), []);
  } finally { await f.close(); }
});

test("a key whose label and site-qualified label are both taken in Shared Keys gets the site label plus a site suffix", async () => {
  const f = await fixture();
  try {
    const c = await f.c();
    await f.save(f.a, "deploy-a", "Deploy", "fake-deploy-one-1111");
    await f.save(f.a, "deploy-a2", "Deploy (site-c)", "fake-deploy-two-2222");
    await f.save(c, "deploy-c", "Deploy", "fake-deploy-three-3333");
    const ids = [];
    for (const keyId of ["saved-on-site:site-a:deploy-a", "saved-on-site:site-a:deploy-a2", "saved-on-site:site-c:deploy-c"]) {
      ids.push((await f.siteKeys.adopt({ keyId })).keyId);
    }
    assert.deepEqual(ids, ["deploy-a", "deploy-a2", "deploy-c"], "free source ids are kept");
    const labels = new Map((await f.projectRows()).map(({ id, label }) => [id, label]));
    assert.equal(labels.get("deploy-a"), "Deploy");
    assert.equal(labels.get("deploy-a2"), "Deploy (site-c)");
    assert.match(labels.get("deploy-c") ?? "", /^Deploy \(site-c\) [a-f0-9]{8}$/);
    assert.equal(await projectToken(f, "deploy-c"), "fake-deploy-three-3333");
  } finally { await f.close(); }
});
