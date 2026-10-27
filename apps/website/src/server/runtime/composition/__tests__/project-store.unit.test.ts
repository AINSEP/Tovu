import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { ensureProjectKey, openProjectStore, projectDbPath, projectIdFor, projectKeyFilePath } from "../project-store.js";
import { ProviderConfigUnreadableError } from "../provider-config-source.js";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { createCustomCredential, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/store";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { PROJECT_VAULT_STATEMENTS } from "#src/platform/db/migrations/project/0000_project_vault";
import { PROJECT_CREDENTIAL_KINDS_STATEMENTS } from "#src/platform/db/migrations/project/0001_project_credential_kinds";
import { PROJECT_LEDGER_TABLE } from "#src/platform/db/migrations/index";
import { UnknownAppliedMigrationError } from "#src/platform/db/migrations/step";

/**
 * @file `project.db` on a real filesystem (temp dirs only): it and its key live in
 * `~/.tovu/projects/<projectId>/` (never the often cloud-synced sites root), the key is minted once
 * (0600), the same file serves two openers (the web app and the desktop app), its secrets are sealed
 * (plaintext never in the file), and a wrong key cannot read them.
 */

function dirs(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const sitesHome = path.join(home, "Documents", "Tovu");
  const projectId = projectIdFor({ sitesHome });
  return { home, sitesHome, projectId, keyFile: projectKeyFilePath({ home, projectId }) };
}

test("a newer project ledger refuses an older runtime instead of ignoring access-boundary migrations", async t => {
  const input = dirs(t);
  const store = await openProjectStore(input);
  const dbPath = store.dbPath;
  store.close({});
  const db = new Database(dbPath);
  try {
    db.prepare(`INSERT INTO ${PROJECT_LEDGER_TABLE} (id, checksum, applied_at) VALUES (?, ?, ?)`)
      .run("9999_future_attachment_boundary", "ab".repeat(32), "2026-10-26T00:00:00.000Z");
  } finally { db.close(); }
  await assert.rejects(openProjectStore(input), error => error instanceof UnknownAppliedMigrationError
    && error.ids.includes("9999_future_attachment_boundary"));
});

test("project.db and its key live in ~/.tovu/projects/<projectId>/, outside the sites root; each sites root is its own project", async (t) => {
  const { home, sitesHome, projectId } = dirs(t);
  const store = await openProjectStore({ sitesHome, home });
  store.close({});
  const dir = path.join(home, ".tovu", "projects", projectId);
  assert.equal(store.dbPath, path.join(dir, "project.db"));
  assert.equal(store.dbPath, projectDbPath({ home, projectId }));
  assert.equal(projectKeyFilePath({ home, projectId }), path.join(dir, "project-key.hex"));
  assert.ok(fs.existsSync(path.join(dir, "project-key.hex")));
  assert.equal(fs.existsSync(path.join(sitesHome, "project.db")), false, "nothing is written into the sites root");
  const other = await openProjectStore({ sitesHome: path.join(home, "Elsewhere"), home });
  other.close({});
  assert.notEqual(other.dbPath, store.dbPath);
  assert.notEqual(fs.readFileSync(projectKeyFilePath({ home, projectId: other.projectId }), "utf8"), fs.readFileSync(projectKeyFilePath({ home, projectId }), "utf8"));
});

test("the project key is minted once (0600, under ~/.tovu, never in the sites root) and then reused", (t) => {
  const { sitesHome, keyFile } = dirs(t);
  const first = ensureProjectKey({ keyFile }, { mint: () => "ab".repeat(32) });
  const second = ensureProjectKey({ keyFile }, { mint: () => "cd".repeat(32) });
  assert.equal(first, "ab".repeat(32));
  assert.equal(second, first, "an existing key is never replaced");
  const file = keyFile;
  assert.ok(!file.startsWith(sitesHome));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("a damaged key file is refused, never overwritten; a non-EEXIST write failure surfaces", (t) => {
  const { home, keyFile } = dirs(t);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, "not-a-key");
  assert.throws(() => ensureProjectKey({ keyFile }), /does not hold a 64-character hex key/);
  assert.equal(fs.readFileSync(keyFile, "utf8"), "not-a-key");
  const blocked = path.join(home, "blocked", "project-key.hex");
  fs.mkdirSync(blocked, { recursive: true });
  assert.throws(() => ensureProjectKey({ keyFile: blocked }), /not a regular file/);
  // A write failure while minting surfaces (here the key's folder is a file, so the key cannot be created).
  const unwritable = path.join(home, "unwritable");
  fs.mkdirSync(unwritable, { recursive: true });
  fs.writeFileSync(path.join(unwritable, ".tovu"), "");
  assert.throws(() => ensureProjectKey({ keyFile: path.join(unwritable, ".tovu", "project-key.hex") }), (error: NodeJS.ErrnoException) => error.code === "ENOTDIR" || error.code === "EEXIST");
});

test("minting never exposes the final key file before its bytes are in (a concurrent opener never reads an empty key)", (t) => {
  const { keyFile: file } = dirs(t);
  const realWriteSync = fs.writeSync;
  const seenWhileWriting: string[] = [];
  // At the moment key bytes are written, a concurrent opener (the desktop app starting with the web
  // app) would read whatever sits at the final path: it must be nothing, never an empty file.
  fs.writeSync = ((...args: Parameters<typeof fs.writeSync>) => {
    if (fs.existsSync(file)) seenWhileWriting.push(fs.readFileSync(file, "utf8"));
    return realWriteSync(...args);
  }) as typeof fs.writeSync;
  syncBuiltinESMExports();
  try { ensureProjectKey({ keyFile: file }, { mint: () => "ab".repeat(32) }); } finally { fs.writeSync = realWriteSync; syncBuiltinESMExports(); }
  assert.deepEqual(seenWhileWriting, [], "the final path appeared before the key was written");
  assert.equal(ensureProjectKey({ keyFile: file }), "ab".repeat(32));
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["project-key.hex"], "no temp file left behind");
});

test("an existing key file must be a regular file owned by this user; modes broader than 0600 are narrowed", (t) => {
  const { home, keyFile: file } = dirs(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${"ef".repeat(32)}\n`, { mode: 0o644 });
  fs.chmodSync(file, 0o644);
  assert.equal(ensureProjectKey({ keyFile: file }), "ef".repeat(32));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, "a restored 0644 key is narrowed to 0600");
  // A symlink in place of the key is refused (it could point anywhere), never followed or replaced.
  const linked = path.join(path.dirname(home), "linked.hex");
  const target = path.join(path.dirname(home), "elsewhere.hex");
  fs.writeFileSync(target, "ab".repeat(32), { mode: 0o600 });
  fs.symlinkSync(target, linked);
  assert.throws(() => ensureProjectKey({ keyFile: linked }), /not a regular file/);
  // Owned by someone else: refused.
  assert.throws(() => ensureProjectKey({ keyFile: file }, { uid: () => 4242 }), /owned by another user/);
});

test("a fresh project.db runs in WAL mode (web and desktop share it without rollback-journal contention)", async (t) => {
  const { home, sitesHome } = dirs(t);
  const store = await openProjectStore({ sitesHome, home });
  store.close({});
  const raw = new Database(store.dbPath, { readonly: true });
  t.after(() => raw.close());
  assert.equal(raw.pragma("journal_mode", { simple: true }), "wal");
});

test("web and desktop open the SAME project.db: a save through one is read by the other; secrets are sealed at rest", async (t) => {
  const { home, sitesHome, projectId } = dirs(t);
  const web = await openProjectStore({ sitesHome, home });
  const desktop = await openProjectStore({ sitesHome, home });
  t.after(() => { web.close({}); desktop.close({}); });
  assert.equal(web.dbPath, projectDbPath({ home, projectId }));
  assert.equal(desktop.dbPath, web.dbPath);
  assert.equal(web.config.scope, "project");
  await web.config.write({ pluginId: "observability-opentelemetry", config: { settings: { endpoint: "https://otlp.example.test" }, secrets: { headers: "Authorization=Basic UFJPSkVDVC1TRUNSRVQ=" } } });
  assert.deepEqual(await desktop.config.read({ pluginId: "observability-opentelemetry" }),
    { settings: { endpoint: "https://otlp.example.test" }, secrets: { headers: "Authorization=Basic UFJPSkVDVC1TRUNSRVQ=" } });
  web.close({});
  desktop.close({});
  const bytes = fs.readFileSync(web.dbPath);
  assert.equal(bytes.includes("UFJPSkVDVC1TRUNSRVQ="), false, "the secret is sealed, not stored in plaintext");
  assert.equal(bytes.includes("otlp.example.test"), false, "plugin-state values are sealed too");
});

/** One app (web or desktop) as its own process: waits for `go`, opens the store, saves `me`, then reads `other`'s save. */
const OPENER = `
import fs from "node:fs";
const [moduleUrl, sitesHome, home, me, other, ready, go] = process.argv.slice(1);
const { openProjectStore } = await import(moduleUrl);
fs.writeFileSync(ready, "");
while (!fs.existsSync(go)) await new Promise((r) => setTimeout(r, 2));
const store = await openProjectStore({ sitesHome, home });
await store.config.write({ pluginId: me, config: { settings: { by: me }, secrets: { token: me } } });
let seen = null;
for (let i = 0; i < 600 && !seen; i++) { seen = await store.config.read({ pluginId: other }); if (!seen) await new Promise((r) => setTimeout(r, 25)); }
store.close({});
process.stdout.write(JSON.stringify(seen));
`;

test("two processes opening a fresh project at the same moment create ONE key and read each other's saves", { timeout: 120_000 }, async (t) => {
  const { home, sitesHome, keyFile } = dirs(t);
  const sync = path.join(path.dirname(home), "sync");
  fs.mkdirSync(sync);
  const go = path.join(sync, "go");
  const moduleUrl = new URL("../project-store.ts", import.meta.url).href;
  const run = (me: string, other: string) => promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", OPENER,
    moduleUrl, sitesHome, home, me, other, path.join(sync, `ready-${me}`), go], { timeout: 100_000 });
  const children = Promise.all([run("web", "desktop"), run("desktop", "web")]);
  // Both are loaded and waiting before either starts, so their first opens really overlap.
  while (!["web", "desktop"].every((me) => fs.existsSync(path.join(sync, `ready-${me}`)))) await new Promise((r) => setTimeout(r, 10));
  fs.writeFileSync(go, "");
  const [web, desktop] = (await children).map(({ stdout }) => JSON.parse(stdout));
  assert.deepEqual(web, { settings: { by: "desktop" }, secrets: { token: "desktop" } });
  assert.deepEqual(desktop, { settings: { by: "web" }, secrets: { token: "web" } });
  assert.deepEqual(fs.readdirSync(path.dirname(keyFile)).filter((name) => name.includes("key")), ["project-key.hex"], "one key, no temp file left");
  assert.equal(fs.statSync(path.dirname(keyFile)).mode & 0o777, 0o700);
  const after = await openProjectStore({ sitesHome, home });
  t.after(() => after.close({}));
  assert.deepEqual(await after.config.read({ pluginId: "web" }), { settings: { by: "web" }, secrets: { token: "web" } });
});

test("reopening keeps the data (own migration ledger, idempotent); a different project key cannot read the sealed rows", async (t) => {
  const { home, sitesHome, keyFile } = dirs(t);
  const first = await openProjectStore({ sitesHome, home }, { clock: { nowMs: () => 0 } });
  await first.config.write({ pluginId: "analytics-posthog", config: { settings: { host: "https://ph.example.test" }, secrets: { apiKey: "phc" } } });
  first.close({});
  const again = await openProjectStore({ sitesHome, home });
  assert.deepEqual(await again.config.readSettings({ pluginId: "analytics-posthog" }), { settings: { host: "https://ph.example.test" }, secretNames: ["apiKey"] });
  again.close({});
  fs.writeFileSync(keyFile, `${"ef".repeat(32)}\n`);
  const wrongKey = await openProjectStore({ sitesHome, home });
  t.after(() => wrongKey.close({}));
  await assert.rejects(wrongKey.config.read({ pluginId: "analytics-posthog" }), ProviderConfigUnreadableError);
  // The card reads it as not configured, with a notice, and a save overwrites the row (the user never fixes it by hand).
  assert.deepEqual(await wrongKey.config.readSettings({ pluginId: "analytics-posthog" }), { settings: {}, secretNames: [], unreadable: true });
  await wrongKey.config.write({ pluginId: "analytics-posthog", config: { settings: { host: "https://ph2.example.test" }, secrets: { apiKey: "phc2" } } });
  assert.deepEqual(await wrongKey.config.read({ pluginId: "analytics-posthog" }), { settings: { host: "https://ph2.example.test" }, secrets: { apiKey: "phc2" } });
  assert.deepEqual(await wrongKey.config.readSettings({ pluginId: "analytics-posthog" }), { settings: { host: "https://ph2.example.test" }, secretNames: ["apiKey"] });
});

test("credentials save in the project store: sealed with the project key, read back after reopening (0001 admits credential kinds)", async (t) => {
  const { home, sitesHome } = dirs(t);
  const token = `tok-${"p".repeat(12)}`;
  const deps = (store: Awaited<ReturnType<typeof openProjectStore>>) => {
    const keyring = new InMemoryKeyring();
    const project = { workspaceId: store.vault.workspaceId, repo: new CustomCredentialVaultRepo({ vault: store.vault.repo }), sealer: store.vault.sealer, keyring: store.vault.keyring };
    return { repo: new CustomCredentialVaultRepo({ vault: new InMemoryVaultRepo({}) }, { project }), sealer: new AesGcmSecretSealer(keyring), keyring,
      clock: { nowMs: () => 0 }, idGen: { newId: () => "cred-1" } };
  };
  const first = await openProjectStore({ sitesHome, home });
  const saved = await createCustomCredential(deps(first), { workspaceId: "site-a", label: "hosting", category: "hosting", baseUrl: "https://api.example.test", connection: { token } });
  assert.equal(saved.scope, "project");
  first.close({});
  assert.equal(fs.readFileSync(projectDbPath({ home, projectId: projectIdFor({ sitesHome }) })).includes(token), false, "sealed at rest");
  const again = await openProjectStore({ sitesHome, home });
  t.after(() => again.close({}));
  assert.equal((await resolveCustomCredentialByLabel(deps(again), { workspaceId: "site-b", label: "hosting" }))?.connection.token, token);
});

test("0001 rebuilds a 0000 project vault: rows kept, credential kinds admitted, labels unique", () => {
  const db = new Database(":memory:");
  for (const statement of PROJECT_VAULT_STATEMENTS) db.exec(statement);
  const row = (kind: string, id: string, label: string) => db.prepare(`INSERT INTO secrets_vault (workspace_id, id, kind, owner_key, label, is_default, revision, meta, created_at, updated_at)
    VALUES ('project', ?, ?, 'tovu', ?, 0, 1, '{}', 't', 't')`).run(id, kind, label);
  row("api-connection", "settings", "plugin-state");
  assert.throws(() => row("vendor", "v0", "hosting"), /CHECK/);
  for (const statement of PROJECT_CREDENTIAL_KINDS_STATEMENTS) db.exec(statement);
  assert.deepEqual(db.prepare("SELECT id, kind FROM secrets_vault").all(), [{ id: "settings", kind: "api-connection" }]);
  row("vendor", "v1", "hosting");
  row("custom", "c1", "legacy");
  assert.throws(() => row("custom", "c2", "legacy"), /UNIQUE/);
  assert.throws(() => row("personal-execution", "p1", "mine"), /CHECK/);
  db.close();
});

test("a project.db that cannot be migrated is closed and the error surfaces", async (t) => {
  const { home, sitesHome, projectId } = dirs(t);
  fs.mkdirSync(path.dirname(projectDbPath({ home, projectId })), { recursive: true });
  fs.writeFileSync(projectDbPath({ home, projectId }), "this is not a sqlite database, it is plain text padding ".repeat(20));
  await assert.rejects(openProjectStore({ sitesHome, home }));
});

// --- One project per sites root however it is spelled (web vs desktop, TOVU_SITES_HOME vs sites-home.json) ---

/** A hash of the root exactly as spelled (no realpath). */
const spelledIdOf = (sitesHome: string) => `project-${createHash("sha256").update(path.resolve(sitesHome)).digest("hex").slice(0, 16)}`;

/** A real (symlink-free) temp root: on macOS `os.tmpdir()` sits under the `/var` → `/private/var` symlink. */
function realRoot(t: TestContext): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-id-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("a sites root reached through a symlink, or spelled in another case on a case-insensitive disk, is the same project", (t) => {
  const root = realRoot(t);
  const sitesHome = path.join(root, "Documents", "Tovu");
  fs.mkdirSync(sitesHome, { recursive: true });
  fs.symlinkSync(path.join(root, "Documents"), path.join(root, "Docs"));
  assert.equal(projectIdFor({ sitesHome: path.join(root, "Docs", "Tovu") }), projectIdFor({ sitesHome }));
  assert.equal(projectIdFor({ sitesHome: `${sitesHome}${path.sep}.${path.sep}` }), projectIdFor({ sitesHome }));
  const otherCase = path.join(root, "documents", "TOVU");
  if (fs.existsSync(otherCase)) assert.equal(projectIdFor({ sitesHome: otherCase }), projectIdFor({ sitesHome }), "case-insensitive disk");
  else assert.notEqual(projectIdFor({ sitesHome: otherCase }), projectIdFor({ sitesHome }), "case-sensitive disk: two folders, two projects");
});

test("an already-canonical sites root's id is the hash of the root as given (realpath changes nothing)", (t) => {
  const sitesHome = path.join(realRoot(t), "Documents", "Tovu");
  assert.equal(projectIdFor({ sitesHome }), spelledIdOf(sitesHome), "before the folder exists");
  fs.mkdirSync(sitesHome, { recursive: true });
  assert.equal(projectIdFor({ sitesHome }), spelledIdOf(sitesHome), "after");
});

test("a sites root that does not exist yet gets the id it will have once created, even under a symlinked parent", (t) => {
  const root = realRoot(t);
  fs.symlinkSync(root, path.join(root, "link"));
  const viaLink = path.join(root, "link", "Documents", "Tovu");
  const before = projectIdFor({ sitesHome: viaLink });
  fs.mkdirSync(viaLink, { recursive: true });
  assert.equal(projectIdFor({ sitesHome: viaLink }), before);
  assert.equal(projectIdFor({ sitesHome: path.join(root, "Documents", "Tovu") }), before);
});


test("0002 is recorded once; a pre-existing provider row is never auto-attached and two openers share references", async t => {
  const { sitesHome, home } = dirs(t);
  const first = await openProjectStore({ sitesHome, home });
  const second = await openProjectStore({ sitesHome, home });
  t.after(() => { second.close({}); first.close({}); });
  const pluginId = "analytics-example";
  await first.config.write({ pluginId, config: { settings: {}, secrets: { key: ["fake", "provider"].join("_") } } });
  const keyId = `plugin-state:${pluginId}:provider.config`;
  assert.deepEqual(await first.attachments.usersOf({ keyId }), []);
  await first.attachments.attach({ siteId: "uuid-a", siteName: "A", keyId });
  assert.equal(await second.attachments.isAttached({ siteId: "uuid-a", keyId }), true);
  assert.equal(await second.attachments.isAttached({ siteId: "uuid-b", keyId }), false);
  const rows = await second.providerRevisions({ siteId: "uuid-a" });
  assert.deepEqual(rows.map(row => [row.id, row.revision]), [[keyId, 1]]);
  const db = new Database(first.dbPath, { readonly: true });
  try { assert.equal((db.prepare("SELECT count(*) AS n FROM tovu_project_migrations WHERE id='0002_site_key_attachments'").get() as { n: number }).n, 1); }
  finally { db.close(); }
});

test("a transient SQLITE_BUSY while enabling project WAL is retried before migration", async t => {
  const input = dirs(t);
  const pragma = Database.prototype.pragma;
  let walAttempts = 0;
  const sleeps: number[] = [];
  t.mock.method(Atomics, "wait", (_view: Int32Array, _index: number, _value: number, timeout: number) => {
    sleeps.push(timeout);
    return "timed-out" as const;
  });
  t.mock.method(Database.prototype, "pragma", function (this: Database.Database, ...args: Parameters<Database.Database["pragma"]>) {
    if (args[0] === "journal_mode = WAL" && ++walAttempts < 3) {
      throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
    }
    return pragma.apply(this, args);
  });
  const store = await openProjectStore(input);
  try {
    assert.equal(walAttempts, 3, "fresh-project contention must not abort startup");
    assert.deepEqual(sleeps, [50, 50]);
    const raw = new Database(store.dbPath, { readonly: true });
    try { assert.equal(raw.pragma("journal_mode", { simple: true }), "wal"); }
    finally { raw.close(); }
  } finally { store.close({}); }
});

test("project WAL retry is bounded and closes the failed handle", async t => {
  const input = dirs(t);
  const pragma = Database.prototype.pragma;
  const busy = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
  let handle: Database.Database | undefined;
  let walAttempts = 0;
  let sleeps = 0;
  t.mock.method(Atomics, "wait", () => { sleeps++; return "timed-out" as const; });
  t.mock.method(Database.prototype, "pragma", function (this: Database.Database, ...args: Parameters<Database.Database["pragma"]>) {
    if (args[0] === "journal_mode = WAL") { handle = this; walAttempts++; throw busy; }
    return pragma.apply(this, args);
  });
  await assert.rejects(openProjectStore(input), error => error === busy);
  assert.equal(walAttempts, 21, "one initial attempt plus at most twenty retries");
  assert.equal(sleeps, 20);
  assert.equal(handle?.open, false, "the original close-on-error contract survives exhaustion");
});

test("a non-busy project WAL error is propagated immediately and closes the handle", async t => {
  const input = dirs(t);
  const pragma = Database.prototype.pragma;
  const failure = Object.assign(new Error("disk I/O failed"), { code: "SQLITE_IOERR" });
  let handle: Database.Database | undefined;
  t.mock.method(Atomics, "wait", () => assert.fail("only SQLITE_BUSY is retryable"));
  t.mock.method(Database.prototype, "pragma", function (this: Database.Database, ...args: Parameters<Database.Database["pragma"]>) {
    if (args[0] === "journal_mode = WAL") { handle = this; throw failure; }
    return pragma.apply(this, args);
  });
  await assert.rejects(openProjectStore(input), error => error === failure);
  assert.equal(handle?.open, false);
});
