import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sql } from "kysely";
import { openSqliteFileKernel } from "@jini-ai/db/kernel/sqlite";
import { runMigrations } from "@jini-ai/db/migrate";
import { OWNER_STORE_LEDGER, ownerStoreMigrations } from "@jini-ai/db/owner-store";
import { SqlSecretsVaultRepo } from "@jini-ai/db/secrets-vault";
import { AesGcmSecretSealer, EnvOrFileKeyring, generateFileSiteKey } from "@jini-ai/platform/secrets";
import { SecretsVaultService, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { ownerContext } from "@jini-ai/server/owner-store";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { childProcessCoverageEnv } from "#src/contracts/core/__tests__/helpers/child-process-coverage-env";
import { runOwnerStoreCommand, type OwnerStoreAction, type OwnerStoreEntry } from "../../commands/owner-store.js";
import { openProjectStore } from '#src/server/runtime/composition/project-store';
import { createProjectKeys } from '#src/features/project-keys/service';

/** S2 boundary integration: a real project.db and, where a test needs one, a real legacy owner.db
 * at ledger 0000 written the way published 0.6.12 wrote it. Scoped to the CLI adapter; Jini owns
 * the reader's crypto and read-only tests, owner-store-import.unit.test.ts the per-entry plan.
 */
async function fixture() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-owner-cli-")));
  const userDataDir = path.join(home, "profile");
  fs.mkdirSync(userDataDir);
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: userDataDir });
  const output: string[] = [];
  const invoke = async ({ action, request = {}, profile = userDataDir }: {
    action: OwnerStoreAction; request?: Record<string, unknown>; profile?: string;
  }) => {
    let exitCode = 0;
    const reply = await runOwnerStoreCommand({ action }, { home, workspace,
      readRequest: async () => JSON.stringify({ userDataDir: profile, ...request }),
      output: line => output.push(line), setExitCode: code => { exitCode = code; } });
    assert.equal(exitCode, reply.ok ? 0 : 1);
    assert.equal(output.at(-1)?.trim().split("\n").length, 1);
    return reply;
  };
  const close = async () => { fs.rmSync(home, { recursive: true, force: true }); };
  return { home, userDataDir, output, invoke, close };
}

const entry = ({ value, label = "Deployment key", provider = "vercel", id, expectedRevision = null }: {
  value: string; label?: string; provider?: string; id?: string; expectedRevision?: number | null;
}) => ({
  kind: "vendor", label, provider, id, expectedRevision,
  meta: { credentialType: "vendor", worksFor: [provider] }, payload: { vendorId: provider, token: value },
});

/** No production code writes an owner store any more, so the test writes one with the vault directly:
 * WAL, ledger 0000, sealed Tovu-owned entries under owner.key, optional grants to site folders.
 */
async function legacyOwnerStore({ userDataDir, entries, grants = [] }: {
  userDataDir: string; entries: ReturnType<typeof entry>[]; grants?: { entryIndex: number; site: string }[];
}) {
  const filePath = path.join(userDataDir, "owner.db"), keyFilePath = path.join(userDataDir, "owner.key");
  generateFileSiteKey({ keyFilePath });
  const kernel = openSqliteFileKernel<unknown>({ filePath, open: openNativeSqlite });
  const saved: VaultSummary[] = [];
  try {
    await kernel.query(sql`PRAGMA journal_mode = WAL`);
    await runMigrations(kernel, ownerStoreMigrations, { ledgerTable: OWNER_STORE_LEDGER, appName: "owner store" });
    const keyring = new EnvOrFileKeyring({ env: { read: () => undefined }, envVarName: "OWNER_STORE_KEY",
      keyFilePath, hkdfSalt: "jini-owner-store-v1", allowFileFallback: true, allowFileAutoGenerate: false });
    const registry = createTovuVaultKinds({ policy: { validateMeta: ({ meta }) => meta,
      legacyPublishCredential: () => undefined, tokenField: () => undefined } });
    const vault = new SecretsVaultService({ repo: new SqlSecretsVaultRepo({ kernel: kernel as never }), keyring,
      sealer: new AesGcmSecretSealer({ keyring }), metaParsers: registry.metaParsers, authorize: async () => {},
      now: () => new Date().toISOString(), newId: () => randomUUID() });
    for (const { kind, label, provider, meta, payload } of entries) {
      const input = { kind: kind as "vendor", ownerKey: "tovu", binding: null, label, provider, meta, payload, expectedRevision: null };
      saved.push(await vault.put({ ...input, ...ownerContext(input) }));
    }
    for (const grant of grants) {
      await kernel.execute(sql`INSERT INTO owner_grants (entry_id, consumer_id, created_at) VALUES (${saved[grant.entryIndex]!.id}, ${grant.site}, ${new Date().toISOString()})`);
    }
  } finally { await kernel.close(); }
  return { filePath, keyFilePath, saved };
}

const digest = (filePath: string) => createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

// Before: listed deepEqual'd { entries: [metadata], grants: [] }; list no longer reads or returns legacy grants.
test('desktop project saves and inventory share project_keys_list without opening owner.db or attaching', async () => {
  const f = await fixture();
  const value = ['fixture', 'project', String(314)].join('-');
  try {
    const saved = await f.invoke({ action: 'put', request: { store: 'project', entry: entry({ value }) } });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const metadata = saved.data.entry as OwnerStoreEntry;
    const listed = await f.invoke({ action: 'list', request: { store: 'project' } });
    assert.deepEqual(listed, { version: 1, ok: true, action: 'list', data: { entries: [metadata] } });
    assert.equal(fs.existsSync(path.join(f.userDataDir, 'owner.db')), false);
    assert.equal(fs.existsSync(path.join(f.userDataDir, 'owner.key')), false);
    const workspace = createSitesWorkspace({}, { homeDir: f.home, cwd: f.home, env: {}, sourceRoots: [], appDataDir: f.userDataDir });
    const project = await openProjectStore({ sitesHome: workspace.home({}), home: f.home });
    try {
      const keys = createProjectKeys({ vault: project.vault.repo, attachments: project.attachments, transaction: project.transaction,
        siteId: 'first', siteName: 'First', providerUsage: async () => assert.fail("custom keys have no provider usage"), reapply: async () => 'now' });
      assert.deepEqual(await keys.list({}), [{ keyId: metadata.id, name: 'Deployment key', kind: 'vendor', usedByThisSite: false, usedBy: [] }]);
      assert.deepEqual(await project.attachments.usersOf({ keyId: metadata.id }), []);
      await keys.use({ keyId: metadata.id, use: true });
      const replacement = await f.invoke({ action: 'put', request: { store: 'project', entry: entry({ value: `${value}-replacement`, id: metadata.id, expectedRevision: metadata.revision }) } });
      assert.equal(replacement.ok, true);
      assert.deepEqual(await project.attachments.usersOf({ keyId: metadata.id }), [{ siteId: 'first', siteName: 'First' }]);
    } finally { project.close({}); }
    assert.equal(f.output.join('').includes(value), false);
  } finally { await f.close(); }
});

test("status and import on a profile without owner.db report none/empty and create no owner file", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.invoke({ action: "status" }), { version: 1, ok: true, action: "status", data: { legacy: "none", entries: 0, grants: 0 } });
    assert.deepEqual(await f.invoke({ action: "import", request: { source: "owner-store", apply: true } }),
      { version: 1, ok: true, action: "import", data: { applied: false, items: [], pending: [] } });
    for (const file of ["owner.db", "owner.db-wal", "owner.db-shm", "owner.key"]) assert.equal(fs.existsSync(path.join(f.userDataDir, file)), false, file);
  } finally { await f.close(); }
});

test("an empty legacy store (0 entries, 0 grants) reports empty and the CLI leaves deleting it to the desktop", async () => {
  const f = await fixture();
  try {
    const store = await legacyOwnerStore({ userDataDir: f.userDataDir, entries: [] });
    const before = digest(store.filePath);
    assert.deepEqual(await f.invoke({ action: "status" }), { version: 1, ok: true, action: "status", data: { legacy: "empty", entries: 0, grants: 0 } });
    assert.equal(digest(store.filePath), before);
    assert.equal(fs.existsSync(store.keyFilePath), true);
  } finally { await f.close(); }
});

test("a legacy store imports only on apply, non-default, reports site copies, and is never modified", async () => {
  const f = await fixture();
  const values = ["legacy-deploy-secret-1234567890", "legacy-mail-secret-1234567890"];
  const site = path.join(f.home, "blog");
  try {
    const store = await legacyOwnerStore({ userDataDir: f.userDataDir, grants: [{ entryIndex: 0, site }],
      entries: [entry({ value: values[0]! }), entry({ value: values[1]!, label: "Mail key", provider: "resend" })] });
    const before = { db: digest(store.filePath), key: fs.readFileSync(store.keyFilePath, "utf8") };
    const status = await f.invoke({ action: "status" });
    assert.deepEqual(status, { version: 1, ok: true, action: "status", data: { legacy: "available", entries: 2, grants: 1 } });
    const item = (index: number, status: string) => ({ id: store.saved[index]!.id, label: store.saved[index]!.label, kind: "vendor",
      provider: store.saved[index]!.provider, status });
    const byId = (items: unknown) => [...(items as { id: string }[])].sort((a, b) => a.id.localeCompare(b.id));
    const dryRun = await f.invoke({ action: "import", request: { source: "owner-store", apply: false } });
    assert.ok(dryRun.ok);
    assert.equal(dryRun.data.applied, false);
    assert.deepEqual(byId(dryRun.data.items), byId([item(0, "new"), item(1, "new")]));
    assert.deepEqual(dryRun.data.pending, [{ entryId: store.saved[0]!.id, site, reason: "keeps-copy" }]);
    const empty = await f.invoke({ action: "list", request: { store: "project" } });
    assert.ok(empty.ok);
    assert.deepEqual(empty.data.entries, [], "a dry run writes nothing");
    // Before: apply took no digest. An apply now names the dry run it confirms.
    const applied = await f.invoke({ action: "import", request: { source: "owner-store", apply: true, expectedDigest: dryRun.data.sourceDigest } });
    assert.ok(applied.ok);
    assert.equal(applied.data.applied, true);
    assert.deepEqual(byId(applied.data.items), byId([item(0, "imported"), item(1, "imported")]));
    const listed = await f.invoke({ action: "list", request: { store: "project" } });
    assert.ok(listed.ok);
    const entries = listed.data.entries as OwnerStoreEntry[];
    assert.deepEqual(entries.map(row => row.id).sort(), store.saved.map(row => row.id).sort(), "imported rows keep their ids");
    assert.ok(entries.every(row => row.isDefault === false), "an import never makes or moves a default");
    const again = await f.invoke({ action: "import", request: { source: "owner-store", apply: false } });
    assert.ok(again.ok);
    assert.deepEqual(byId(again.data.items), byId([item(0, "already-imported"), item(1, "already-imported")]));
    assert.deepEqual(await f.invoke({ action: "status" }), { version: 1, ok: true, action: "status", data: { legacy: "settled", entries: 2, grants: 1 } });
    assert.equal(digest(store.filePath), before.db, "owner.db is only read");
    assert.equal(fs.readFileSync(store.keyFilePath, "utf8"), before.key);
    for (const value of values) assert.equal(f.output.join("").includes(value), false);
  } finally { await f.close(); }
});

test("an import whose label is already a project key reports label-taken and writes nothing", async () => {
  const f = await fixture();
  try {
    const project = await f.invoke({ action: "put", request: { store: "project", entry: entry({ value: "project-secret-1234567890" }) } });
    assert.ok(project.ok);
    const store = await legacyOwnerStore({ userDataDir: f.userDataDir, entries: [entry({ value: "legacy-secret-1234567890" })] });
    const dryRun = await f.invoke({ action: "import", request: { source: "owner-store", apply: false } });
    assert.ok(dryRun.ok);
    const applied = await f.invoke({ action: "import", request: { source: "owner-store", apply: true, expectedDigest: dryRun.data.sourceDigest } });
    assert.ok(applied.ok);
    assert.deepEqual(applied.data, { applied: false, pending: [], sourceDigest: dryRun.data.sourceDigest, items: [{ id: store.saved[0]!.id, label: "Deployment key", kind: "vendor",
      provider: "vercel", status: "conflict", reason: "label-taken" }] });
    const listed = await f.invoke({ action: "list", request: { store: "project" } });
    assert.ok(listed.ok);
    assert.deepEqual(listed.data.entries, [project.data.entry]);
  } finally { await f.close(); }
});

test("an apply is bound to the dry run the user confirmed: a source replaced meanwhile, or no digest, is refused and writes nothing", async () => {
  const f = await fixture();
  try {
    await legacyOwnerStore({ userDataDir: f.userDataDir, entries: [entry({ value: "reviewed-secret-1234567890" })] });
    const dryRun = await f.invoke({ action: "import", request: { source: "owner-store", apply: false } });
    assert.ok(dryRun.ok);
    assert.match(String(dryRun.data.sourceDigest), /^[0-9a-f]{64}$/);
    // Another profile's store (its own owner.key) replaces this one while the confirmation is open.
    const other = path.join(f.home, "other-profile");
    fs.mkdirSync(other);
    await legacyOwnerStore({ userDataDir: other, entries: [entry({ value: "unreviewed-secret-1234567890", label: "Swapped key" })] });
    for (const name of ["owner.db-wal", "owner.db-shm"]) fs.rmSync(path.join(f.userDataDir, name), { force: true });
    for (const name of ["owner.db", "owner.key"]) fs.copyFileSync(path.join(other, name), path.join(f.userDataDir, name));
    // In a child with a hard deadline: with the digest check gone, the apply ran into the swapped store
    // and hung for minutes instead of failing (Codex check 2026-10-27). A regression now fails in seconds.
    for (const request of [{ expectedDigest: dryRun.data.sourceDigest }, {}]) {
      const applied = ownerStoreInChild({ home: f.home, action: "import", request: { userDataDir: f.userDataDir, source: "owner-store", apply: true, ...request } });
      assert.equal(applied.signal, null, "the apply finishes on its own, never killed at the deadline");
      assert.equal(applied.status, 1);
      assert.equal(JSON.parse(applied.stdout).error.code, "source-changed");
    }
    const listed = await f.invoke({ action: "list", request: { store: "project" } });
    assert.ok(listed.ok);
    assert.deepEqual(listed.data.entries, [], "nothing unreviewed is imported");
  } finally { await f.close(); }
});

// Before: 'missing owner.key with saved credentials requires recovery and never generates a replacement'
// (the store was created by put, and status opened it). Now the store is written by the fixture,
// status reads it without the key, and the import is what needs (and refuses without) the key.
test("missing owner.key with saved credentials requires recovery and never generates a replacement", async () => {
  const f = await fixture();
  try {
    const store = await legacyOwnerStore({ userDataDir: f.userDataDir, entries: [entry({ value: "recoverable-secret-1234567890" })] });
    fs.unlinkSync(store.keyFilePath);
    const status = await f.invoke({ action: "status" });
    assert.ok(status.ok);
    assert.equal(status.data.legacy, "available", "a store holding keys still says so when it cannot be planned");
    const imported = await f.invoke({ action: "import", request: { source: "owner-store", apply: false } });
    assert.ok(!imported.ok);
    assert.equal(imported.error.code, "recovery-required");
    assert.equal(fs.existsSync(store.keyFilePath), false);
  } finally { await f.close(); }
});

// Before: also refused a traversal `--site` for sync; sync is gone, so the backup path is checked instead.
test("relative and traversal paths are refused before any owner file is created or read", async () => {
  const f = await fixture();
  try {
    // path.join would normalize ".." away; the desktop could send it raw.
    for (const profile of ["profile", `${f.home}${path.sep}x${path.sep}..${path.sep}escaped`]) {
      const reply = await f.invoke({ action: "status", profile });
      assert.ok(!reply.ok);
      assert.equal(reply.error.code, "invalid-input");
    }
    assert.equal(fs.existsSync(path.join(f.home, "escaped")), false);
    for (const filePath of ["shared.tovu-owner-backup", `${f.home}${path.sep}x${path.sep}..${path.sep}shared.tovu-owner-backup`, path.join(f.home, "shared.json")]) {
      const reply = await f.invoke({ action: "import", request: { source: "backup", apply: false, filePath, passphrase: "unused passphrase" } });
      assert.ok(!reply.ok);
      assert.equal(reply.error.code, "invalid-input");
    }
  } finally { await f.close(); }
});

// Before: 'encrypted export restores only into an empty store and never reactivates grants'. Export
// and restore are gone; a backup is now only read by the import, which Jini's backup tests cover
// for real envelopes. Here: an empty backup changes nothing; a damaged one is refused privately.
test("a backup import never moves or rewrites the file; empty imports nothing and damaged is refused", async () => {
  const f = await fixture();
  const passphrase = "backup passphrase remains private";
  try {
    const empty = path.join(f.home, "empty.tovu-owner-backup");
    fs.writeFileSync(empty, "");
    assert.deepEqual(await f.invoke({ action: "import", request: { source: "backup", apply: true, filePath: empty, passphrase } }),
      { version: 1, ok: true, action: "import", data: { applied: false, items: [], pending: [] } });
    const damaged = path.join(f.home, "damaged.tovu-owner-backup");
    fs.writeFileSync(damaged, `{"not":"an envelope ${passphrase}"}`);
    const refused = await f.invoke({ action: "import", request: { source: "backup", apply: true, filePath: damaged, passphrase } });
    assert.ok(!refused.ok);
    assert.equal(fs.readFileSync(damaged, "utf8"), `{"not":"an envelope ${passphrase}"}`);
    assert.equal(fs.readFileSync(empty, "utf8"), "");
    const listed = await f.invoke({ action: "list", request: { store: "project" } });
    assert.ok(listed.ok);
    assert.deepEqual(listed.data.entries, []);
    assert.ok(!f.output.join("").includes(passphrase));
    assert.equal(fs.existsSync(path.join(f.userDataDir, "owner.db")), false);
  } finally { await f.close(); }
});

/** The registered `tovu owner-store <action> --json` in a child process, killed (SIGKILL) after 30 s. */
function ownerStoreInChild(required: { home: string; action: OwnerStoreAction; input?: string; request?: Record<string, unknown> }) {
  const { home } = required;
  const args = ["--import", "tsx", path.resolve(import.meta.dirname, "../../main.ts"), "owner-store", required.action, "--json"];
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL",
    input: required.input ?? JSON.stringify(required.request),
    env: { ...childProcessCoverageEnv(path.join(home, "child-coverage")), HOME: home, USERPROFILE: home, TOVU_DESKTOP_USER_DATA_DIR: home,
      APPDATA: path.join(home, "Roaming"), XDG_CONFIG_HOME: home, XDG_DATA_HOME: home } });
  return { ...result, args };
}

test("the registered CLI consumes secrets only on stdin and sanitizes malformed JSON", () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-owner-process-")));
  const secret = "must-never-appear-in-a-parser-error-12345";
  try {
    const { args, ...result } = ownerStoreInChild({ home, action: "put", input: `{"userDataDir":${JSON.stringify(home)},"entry":{"payload":"${secret}"` });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.equal(JSON.parse(result.stdout).error.code, "invalid-input");
    assert.ok(!args.join(" ").includes(secret));
    assert.ok(!result.stdout.includes(secret));
    assert.ok(!result.stderr.includes(secret));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
