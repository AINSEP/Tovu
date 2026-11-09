/** Keys saved on one site of this install, picked from another: real files and SQLite, fake tokens only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sql } from "kysely";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SecretsVaultService, type VaultMeta } from "@jini-ai/platform/secrets/credential-sets";
import { vaultRepo } from "#src/platform/db/__tests__/vault-credential.fixture";
import { fingerprintSiteKeyHex, FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { secretsVaultStatements } from "#src/platform/db/migrations/0012_secrets_vault";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { attachedOnlyVault } from "#src/features/project-keys/attached-vault";
import { createProjectKeys } from "#src/features/project-keys/service";
import { openProjectStore } from "../project-store.js";
import { createOtherSiteKeys } from "../other-site-keys.js";

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
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: id, siteKeyId: id, siteKeyFingerprint: fingerprintSiteKeyHex(hex), storage: { kind: "sqlite" } }));
    workspace.registry({}).merge({ entries: [{ id, path: dir, name: id, createdBy: "key-share-test", lastOpened: null }] });
    const dbPath = resolveSiteDatabasePaths({ dir }, { workspace, placement: "inSite", reserveIdentity: false }).contentDbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const kernel = openSqliteFileKernel<ContentDatabase>(dbPath);
    openKernels.push(kernel);
    await kernel.execute(sql`CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT, slug TEXT, created_at TEXT)`);
    await kernel.execute(sql`CREATE TABLE principals(id TEXT PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO workspaces VALUES(${id},${id},${id},${stamp})`);
    for (const statement of secretsVaultStatements({ dialect: "sqlite" })) await kernel.execute(sql.raw(statement));
    const keyring = new FixedSiteKeyKeyring(hex);
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
    const listed = await f.keysOnB.list({});
    const row = siteRow(listed, "Vercel, site-a");
    assert.equal(row.locked, undefined);
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(FAKE_TOKEN), "listing never carries a token");

    const used = await f.keysOnB.use({ keyId: row.keyId, use: true });
    assert.doesNotMatch(JSON.stringify(used), new RegExp(FAKE_TOKEN), "use result never carries a token");
    assert.equal(used.usedByThisSite, true);
    assert.equal(await projectToken(f, used.keyId), FAKE_TOKEN, "the owner store holds the key, re-sealed");
    const granted = attachedOnlyVault({ vault: f.store.vault.repo, attachments: f.store.attachments, siteId: f.b.id });
    assert.equal((await granted.find({ workspaceId: "project", id: used.keyId }))?.id, used.keyId, "site B can read it through its grant");
    const grantedOnA = attachedOnlyVault({ vault: f.store.vault.repo, attachments: f.store.attachments, siteId: f.a.id });
    assert.equal(await grantedOnA.find({ workspaceId: "project", id: used.keyId }), null, "only the approving site gets a grant");
    assert.deepEqual(fs.readFileSync(f.a.dbPath), before, "the source vault is never written");
  } finally { await f.close(); }
});

test("a key on this site can be added to Shared Keys from the same picker", async () => {
  const f = await fixture();
  try {
    await f.save(f.b, "vercel-b", "Vercel");
    const row = siteRow(await f.keysOnB.list({}), "Vercel, this site");
    const used = await f.keysOnB.use({ keyId: row.keyId, use: true });
    assert.equal(await projectToken(f, used.keyId), FAKE_TOKEN);
  } finally { await f.close(); }
});

test("a source site whose key cannot be unlocked says so in plain words and adds nothing", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    fs.rmSync(f.a.keyPath);
    const listed = await f.keysOnB.list({});
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
    const row = siteRow(await f.keysOnB.list({}), "Vercel, site-a");
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
    const rows = await f.keysOnB.list({});
    const first = await f.keysOnB.use({ keyId: siteRow(rows, "Vercel, site-a").keyId, use: true });
    const again = await f.keysOnB.use({ keyId: siteRow(rows, "Vercel, this site").keyId, use: true });
    assert.equal(again.keyId, first.keyId, "same secret reuses the existing Shared Key");
    const other = await f.keysOnB.use({ keyId: siteRow(rows, "Vercel, site-c").keyId, use: true });
    assert.notEqual(other.keyId, first.keyId);
    assert.equal(await projectToken(f, other.keyId), "fake-other-token-not-real-9999");
    assert.equal((await f.projectRows()).length, 2, "the label collision did not overwrite or fail");
  } finally { await f.close(); }
});

test("a key id that no longer resolves is refused without touching the owner store", async () => {
  const f = await fixture();
  try {
    await f.save(f.a, "vercel-a", "Vercel");
    const row = siteRow(await f.keysOnB.list({}), "Vercel, site-a");
    fs.rmSync(path.dirname(f.a.keyPath), { recursive: true });
    await assert.rejects(f.keysOnB.use({ keyId: `${row.keyId}x`, use: true }));
    assert.deepEqual(await f.projectRows(), []);
  } finally { await f.close(); }
});
