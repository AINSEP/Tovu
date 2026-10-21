import { isolatedCatalogHome } from "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import Database from "better-sqlite3";

import { cleanupAndRethrow, initSite, type InitSiteRestorePort } from "../../init-site.js";
import { InitDirNotEmptyError, InternalError, ValidationError } from "../../errors.js";
import { createSitesWorkspace } from "../../sites-home.js";

/**
 * @file `initSite` branch pins not owned by the SPEC-003 certification suites: verified-import
 * admission and restore, the allocation journal, app-data database placement and its cleanup,
 * storage/connection-string agreement, and `cleanupAndRethrow`'s error mapping.
 */

/** A fresh parent folder; the init target inside it does not exist yet. */
function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-init-branches-"));
  return { parent, target: path.join(parent, "site"), cleanup: () => fs.rmSync(parent, { recursive: true, force: true }) };
}

/** A workspace that keeps databases in app-data, outside the site folder. */
function appDataWorkspace({ parent }: { parent: string }) {
  const workspace = createSitesWorkspace({}, { homeDir: parent, cwd: parent, env: {}, platform: "linux", appDataDir: path.join(parent, "app-data") });
  workspace.updateConfig({ patch: { databases: "appData" } });
  return workspace;
}

/** A restore port that copies a real initialized content database into place, recording each call. */
async function restoreFrom({ parent }: { parent: string }, { signal }: { signal?: AbortSignal } = {}) {
  const source = path.join(parent, "source");
  await initSite({ dir: source, name: "Source" });
  const sourceDb = path.join(source, "data.nosync", "content.db");
  const db = new Database(sourceDb);
  db.exec("CREATE TABLE restored_marker (id INTEGER); INSERT INTO restored_marker VALUES (7);"); db.close();
  const calls: { dir: string; dbPath: string; siteId: string }[] = [];
  const port: InitSiteRestorePort = { signal, restore: async (required) => { calls.push(required); fs.copyFileSync(sourceDb, required.dbPath); } };
  return { port, calls };
}

/** Pin the next randomUUID (the minted siteId) while later ids stay random. */
function pinNextSiteId(t: TestContext, { siteId }: { siteId: string }): void {
  const original = crypto.randomUUID.bind(crypto);
  let first = true;
  t.mock.method(crypto, "randomUUID", () => {
    if (!first) return original();
    first = false;
    return siteId as ReturnType<typeof crypto.randomUUID>;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test("verified import refuses a missing owner password before anything is created", async () => {
  const f = fixture();
  try {
    await assert.rejects(initSite({ dir: f.target }, { verifiedRestore: { restore: async () => {} } }), {
      name: "ValidationError", message: "Verified import requires an explicit owner password and SQLite storage.",
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("verified import refuses non-SQLite storage before anything is created", async () => {
  const f = fixture();
  try {
    await assert.rejects(initSite({ dir: f.target, adminPassword: "import-owner-password-1", storage: { kind: "pglite" } }, { verifiedRestore: { restore: async () => {} } }), {
      name: "ValidationError", message: "Verified import requires an explicit owner password and SQLite storage.",
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("verified import restores the database instead of seeding the template and commits the marker", async () => {
  const f = fixture();
  try {
    const { port, calls } = await restoreFrom(f);
    const result = await initSite({ dir: f.target, adminPassword: "import-owner-password-1", storage: { kind: "sqlite" } }, { verifiedRestore: port });
    const dbPath = path.join(f.target, "data.nosync", "content.db");
    assert.deepEqual(calls, [{ dir: f.target, dbPath, siteId: result.siteId }]);
    const db = new Database(dbPath, { readonly: true });
    try { assert.deepEqual(db.prepare("SELECT id FROM restored_marker").all(), [{ id: 7 }]); } finally { db.close(); }
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.target, ".site-meta.json"), "utf8")).siteId, result.siteId);
  } finally { f.cleanup(); }
});

test("verified import with a live signal completes", async () => {
  const f = fixture();
  try {
    const { port } = await restoreFrom(f, { signal: new AbortController().signal });
    const result = await initSite({ dir: f.target, adminPassword: "import-owner-password-1" }, { verifiedRestore: port });
    assert.equal(fs.existsSync(path.join(f.target, ".site-meta.json")), true);
    assert.equal(result.dir, f.target);
  } finally { f.cleanup(); }
});

test("an import aborted during restore removes the partial site", async () => {
  const f = fixture();
  try {
    const controller = new AbortController();
    const { port } = await restoreFrom(f, { signal: controller.signal });
    const aborting: InitSiteRestorePort = { signal: controller.signal, restore: async (required) => { await port.restore(required); controller.abort(); } };
    await assert.rejects(initSite({ dir: f.target, adminPassword: "import-owner-password-1" }, { verifiedRestore: aborting }), {
      name: "InternalError", message: `initSite: failed while creating ${f.target}: This operation was aborted`,
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("onAllocated journals the minted identity and database path before any site bytes exist", async () => {
  const f = fixture();
  try {
    const seen: { allocation: { dir: string; siteId: string; dbPath: string }; existed: boolean }[] = [];
    const result = await initSite({ dir: f.target }, { onAllocated: (allocation) => { seen.push({ allocation, existed: fs.existsSync(f.target) }); } });
    assert.deepEqual(seen, [{ allocation: { dir: f.target, siteId: result.siteId, dbPath: path.join(f.target, "data.nosync", "content.db") }, existed: false }]);
  } finally { f.cleanup(); }
});

test("app-data placement creates the database outside the site folder", async () => {
  const f = fixture();
  try {
    const workspace = appDataWorkspace(f);
    const result = await initSite({ dir: f.target }, { workspace });
    assert.equal(fs.existsSync(path.join(f.parent, "app-data", "databases", result.siteId, "content.db")), true);
    assert.equal(fs.existsSync(path.join(f.target, "data.nosync")), false);
  } finally { f.cleanup(); }
});

test("app-data placement refuses an existing database folder for the minted site and keeps it", async (t) => {
  const f = fixture();
  try {
    const workspace = appDataWorkspace(f);
    const siteId = "00000000-0000-4000-8000-000000000001";
    const existing = path.join(f.parent, "app-data", "databases", siteId);
    fs.mkdirSync(existing, { recursive: true });
    pinNextSiteId(t, { siteId });
    await assert.rejects(initSite({ dir: f.target }, { workspace }), { name: "InternalError", message: `initSite: database target already exists at ${existing}` });
    assert.equal(fs.existsSync(existing), true); assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("a failed import under app-data placement removes the database folder it created", async () => {
  const f = fixture();
  try {
    const workspace = appDataWorkspace(f);
    let dbDir = "";
    const failing: InitSiteRestorePort = { restore: async ({ dbPath }) => { dbDir = path.dirname(dbPath); throw new Error("restore stream broke"); } };
    await assert.rejects(initSite({ dir: f.target, adminPassword: "import-owner-password-1" }, { workspace, verifiedRestore: failing }), {
      name: "InternalError", message: `initSite: failed while creating ${f.target}: restore stream broke`,
    });
    assert.equal(fs.existsSync(dbDir), false); assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("a non-sealed storage refuses a connection string before anything is created", async () => {
  const f = fixture();
  try {
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "pglite" }, connectionString: "postgresql://unused" }), {
      name: "ValidationError", message: "initSite: a pglite site takes no connection string here",
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("an env-named Postgres site refuses a whitespace-only variable before anything is created", async () => {
  const f = fixture();
  const name = "TOVU_INIT_BRANCHES_BLANK_URL";
  process.env[name] = "   ";
  try {
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "postgres", secretRef: { env: name } } }), {
      name: "ValidationError", message: `initSite: the environment variable ${name} (the site's Postgres connection string) is not set`,
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { delete process.env[name]; f.cleanup(); }
});

test("a sealed Postgres site refuses a missing connection string", async () => {
  const f = fixture();
  try {
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "postgres", secretRef: "site" } }), {
      name: "ValidationError", message: "initSite: a postgres site sealed in its folder needs its connection string",
    });
  } finally { f.cleanup(); }
});

test("a sealed Postgres site refuses a whitespace-only connection string before anything is created", async () => {
  const f = fixture();
  try {
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "postgres", secretRef: "site" }, connectionString: "  " }), {
      name: "ValidationError", message: "initSite: a postgres site sealed in its folder needs its connection string",
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("an env-named Postgres site refuses a connection string handed to init", async () => {
  const f = fixture();
  try {
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "postgres", secretRef: { env: "TOVU_INIT_BRANCHES_UNUSED_URL" } }, connectionString: "postgresql://unused" }), {
      name: "ValidationError", message: "initSite: a postgres site takes no connection string here",
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

test("a Postgres site whose database cannot be reached fails before any folder is made", async () => {
  const f = fixture();
  const name = "TOVU_INIT_BRANCHES_UNREACHABLE_URL";
  // Port 1 on loopback refuses at once; the emptiness check must fail closed without a server.
  process.env[name] = "postgresql://tovu@127.0.0.1:1/unreachable";
  try {
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "postgres", secretRef: { env: name } } }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!String(error.message).includes("tovu@127.0.0.1"), "the connection string is never echoed");
      return true;
    });
    await assert.rejects(initSite({ dir: f.target, storage: { kind: "postgres", secretRef: "site" }, connectionString: process.env[name] }), (error: unknown) => {
      assert.ok(error instanceof Error && !String(error.message).includes("tovu@127.0.0.1"), "a sealed target is checked the same way");
      return true;
    });
    assert.equal(fs.existsSync(f.target), false);
  } finally { delete process.env[name]; f.cleanup(); }
});

test("init reads stock themes from TOVU_STOCK_THEMES_DIR when it is set", async () => {
  const f = fixture();
  // An absent stock tree seeds nothing, so a missing themes/ proves the override was the source.
  process.env.TOVU_STOCK_THEMES_DIR = path.join(f.parent, "no-stock-themes");
  try {
    await initSite({ dir: f.target });
    assert.equal(fs.existsSync(path.join(f.target, "themes")), false);
    assert.equal(fs.existsSync(path.join(f.target, ".site-meta.json")), true);
  } finally { delete process.env.TOVU_STOCK_THEMES_DIR; f.cleanup(); }
});

test("init refuses a target whose parent folder does not exist, creating no ancestors", async () => {
  const f = fixture();
  try {
    const target = path.join(f.parent, "missing-parent", "site");
    await assert.rejects(initSite({ dir: target }), {
      name: "InitDirNotEmptyError", message: `initSite: the parent directory of ${target} does not exist (no recursive creation of arbitrary ancestors)`,
    });
    assert.equal(fs.existsSync(path.dirname(target)), false);
  } finally { f.cleanup(); }
});

test("cleanupAndRethrow names the partial folder when its own removal fails", () => {
  const missing = path.join(isolatedCatalogHome, "never-created-site");
  assert.throws(() => cleanupAndRethrow(new Error("disk full"), missing, true), (err: unknown) => {
    assert.ok(err instanceof InternalError);
    assert.match(err.message, new RegExp(`^initSite: cleanup failed after a mid-flight error — manual removal required at ${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: ENOENT`));
    return true;
  });
});

test("cleanupAndRethrow removes a written partial folder and wraps an unexpected error", () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.target); fs.writeFileSync(path.join(f.target, "config.json"), "{}");
    assert.throws(() => cleanupAndRethrow(new Error("disk full"), f.target, true), { name: "InternalError", message: `initSite: failed while creating ${f.target}: disk full` });
    assert.equal(fs.existsSync(f.target), false);
  } finally { f.cleanup(); }
});

for (const err of [new ValidationError("bad name"), new InitDirNotEmptyError("occupied"), new InternalError("corrupt template")]) {
  test(`cleanupAndRethrow rethrows ${err.name} unchanged and leaves an unwritten target alone`, () => {
    const f = fixture();
    try {
      fs.mkdirSync(f.target);
      assert.throws(() => cleanupAndRethrow(err, f.target, false), (thrown: unknown) => thrown === err);
      assert.equal(fs.existsSync(f.target), true);
    } finally { f.cleanup(); }
  });
}
