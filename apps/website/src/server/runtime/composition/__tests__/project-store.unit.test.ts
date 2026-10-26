import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { ensureProjectKey, openProjectStore, projectDbPath, projectIdFor, projectKeyFilePath } from "../project-store.js";
import { ProviderConfigUnreadableError } from "../provider-config-source.js";

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

test("a project.db that cannot be migrated is closed and the error surfaces", async (t) => {
  const { home, sitesHome, projectId } = dirs(t);
  fs.mkdirSync(path.dirname(projectDbPath({ home, projectId })), { recursive: true });
  fs.writeFileSync(projectDbPath({ home, projectId }), "this is not a sqlite database, it is plain text padding ".repeat(20));
  await assert.rejects(openProjectStore({ sitesHome, home }));
});
