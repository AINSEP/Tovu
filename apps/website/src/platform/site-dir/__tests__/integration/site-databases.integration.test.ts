import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveSiteDatabasePaths, resolveSiteDirForDatabase } from "../../site-databases.js";
import { createSitesWorkspace } from "../../sites-home.js";

/**
 * @file Database placement and identity rules for a site folder: legacy and configured layouts,
 * non-SQLite storage, app-data identity admission and reservation, and the reverse lookup from a
 * database path to its site folder.
 */

/** A temp home with one site folder (`site`) and a workspace whose app-data lives in the temp home. */
function fixture({ databases = "inSite" }: { databases?: "inSite" | "appData" } = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-databases-")));
  const dir = path.join(home, "site");
  fs.mkdirSync(dir);
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, platform: "linux", appDataDir: path.join(home, "app-data") });
  workspace.updateConfig({ patch: { databases } });
  const appData = (id: string, filename: string) => path.join(home, "app-data", "databases", id, filename);
  return { home, dir, workspace, appData, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}
function writeMeta({ dir }: { dir: string }, meta: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(meta));
}
const pathIdentity = (dir: string) => createHash("sha256").update(path.resolve(dir)).digest("hex");

test("an in-site layout resolves both databases under data.nosync", () => {
  const f = fixture();
  try {
    writeMeta(f, { siteId: "site-a" });
    assert.deepEqual(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), {
      siteId: "site-a", contentDbPath: path.join(f.dir, "data.nosync", "content.db"), chatDbPath: path.join(f.dir, "data.nosync", "chat.db"),
    });
  } finally { f.cleanup(); }
});

test("a markerless folder uses its path identity", () => {
  const f = fixture();
  try { assert.equal(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }).siteId, pathIdentity(f.dir)); } finally { f.cleanup(); }
});

test("metadata with only a siteKeyId uses it as the identity", () => {
  const f = fixture();
  try {
    writeMeta(f, { siteKeyId: "key-a" });
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }).siteId, "key-a");
  } finally { f.cleanup(); }
});

test("metadata without any identity falls back to the path identity", () => {
  const f = fixture();
  try {
    writeMeta(f, { templateId: "starter" });
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }).siteId, pathIdentity(f.dir));
  } finally { f.cleanup(); }
});

test("an explicit siteId wins over the folder's metadata", () => {
  const f = fixture();
  try {
    writeMeta(f, { siteId: "site-a" });
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir, siteId: "fresh-id" }, { workspace: f.workspace }).siteId, "fresh-id");
  } finally { f.cleanup(); }
});

test("unparseable metadata is surfaced", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.dir, ".site-meta.json"), "{broken");
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), { name: "SyntaxError" });
  } finally { f.cleanup(); }
});

test("unreadable metadata is surfaced", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.dir, ".site-meta.json"));
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), { code: "EISDIR" });
  } finally { f.cleanup(); }
});

test("a non-SQLite site keeps its named files in the folder whatever the placement", () => {
  const f = fixture({ databases: "appData" });
  try {
    writeMeta(f, { siteId: "site-a", storage: { kind: "pglite" } });
    assert.deepEqual(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), {
      siteId: "site-a", contentDbPath: path.join(f.dir, "content.db"), chatDbPath: path.join(f.dir, "chat.db"),
    });
  } finally { f.cleanup(); }
});

test("an explicit SQLite storage follows the configured placement", () => {
  const f = fixture();
  try {
    writeMeta(f, { siteId: "site-a", storage: { kind: "sqlite" } });
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }).contentDbPath, path.join(f.dir, "data.nosync", "content.db"));
  } finally { f.cleanup(); }
});

test("app-data placement refuses a folder without a stable identity", () => {
  const f = fixture({ databases: "appData" });
  try {
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), {
      message: "App-data databases require .site-meta.json with a stable siteId. Initialize this folder before starting it.",
    });
  } finally { f.cleanup(); }
});

test("app-data placement refuses an explicit placement without a minted siteId on a markerless folder", () => {
  const f = fixture();
  try {
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace, placement: "appData" }), {
      message: "App-data databases require .site-meta.json with a stable siteId. Initialize this folder before starting it.",
    });
  } finally { f.cleanup(); }
});

test("initSite's minted siteId and explicit placement resolve app-data paths without reserving them", () => {
  const f = fixture();
  try {
    assert.deepEqual(resolveSiteDatabasePaths({ dir: f.dir, siteId: "minted" }, { workspace: f.workspace, placement: "appData" }), {
      siteId: "minted", contentDbPath: f.appData("minted", "content.db"), chatDbPath: f.appData("minted", "chat.db"),
    });
    assert.deepEqual(f.workspace.registry({}).list({}), []);
  } finally { f.cleanup(); }
});

test("boot-time app-data resolution reserves the identity for this folder", () => {
  const f = fixture({ databases: "appData" });
  try {
    writeMeta(f, { siteId: "site-a" });
    resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.deepEqual(f.workspace.registry({}).list({}).map((entry) => [entry.id, entry.path, entry.name, entry.createdBy]), [["site-a", f.dir, "site", "database-owner"]]);
  } finally { f.cleanup(); }
});

test("move planning resolves app-data paths without reserving the identity", () => {
  const f = fixture({ databases: "appData" });
  try {
    writeMeta(f, { siteId: "site-a" });
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace, reserveIdentity: false }).contentDbPath, f.appData("site-a", "content.db"));
    assert.deepEqual(f.workspace.registry({}).list({}), []);
  } finally { f.cleanup(); }
});

test("a folder already owning its app-data identity resolves without a second reservation", () => {
  const f = fixture({ databases: "appData" });
  try {
    writeMeta(f, { siteId: "site-a" });
    f.workspace.registry({}).merge({ entries: [{ id: "site-a", path: f.dir, name: "Mine", createdBy: "Desktop", lastOpened: null }] });
    resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.deepEqual(f.workspace.registry({}).list({}).map((entry) => [entry.name, entry.createdBy]), [["Mine", "Desktop"]]);
  } finally { f.cleanup(); }
});

test("a copied folder whose app-data identity belongs to another folder is refused", () => {
  const f = fixture({ databases: "appData" });
  try {
    writeMeta(f, { siteId: "site-a" });
    const original = path.join(f.home, "original");
    f.workspace.registry({}).merge({ entries: [{ id: "site-a", path: original, name: "Original", createdBy: "Desktop", lastOpened: null }] });
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), {
      message: `This app-data database belongs to ${original}. A copied folder must get a new siteId and its own database before starting.`,
    });
  } finally { f.cleanup(); }
});

test("an app-data chat database beside an in-site content database still requires a stable identity", () => {
  const f = fixture();
  try {
    const id = pathIdentity(f.dir);
    fs.writeFileSync(path.join(f.dir, "content.db"), "");
    fs.mkdirSync(path.dirname(f.appData(id, "chat.db")), { recursive: true });
    fs.writeFileSync(f.appData(id, "chat.db"), "");
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), {
      message: "App-data databases require .site-meta.json with a stable siteId. Initialize this folder before starting it.",
    });
  } finally { f.cleanup(); }
});

test("resolveSiteDatabasePaths defaults to the ambient workspace", () => {
  const f = fixture();
  try {
    writeMeta(f, { siteId: "site-a" });
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir }).siteId, "site-a");
  } finally { f.cleanup(); }
});

test("resolveSiteDirForDatabase returns an explicit site folder as given", () => {
  assert.equal(resolveSiteDirForDatabase({ dbPath: "/anywhere/content.db", siteDir: "/sites/a" }), "/sites/a");
});

test("resolveSiteDirForDatabase maps a data.nosync database to its site folder", () => {
  assert.equal(resolveSiteDirForDatabase({ dbPath: "/sites/a/data.nosync/content.db" }), "/sites/a");
});

test("resolveSiteDirForDatabase maps a legacy in-folder database to its folder", () => {
  const f = fixture();
  try { assert.equal(resolveSiteDirForDatabase({ dbPath: "/sites/a/content.db" }, { workspace: f.workspace }), "/sites/a"); } finally { f.cleanup(); }
});

test("resolveSiteDirForDatabase maps an app-data database through the catalog", () => {
  const f = fixture();
  try {
    f.workspace.registry({}).merge({ entries: [{ id: "site-a", path: f.dir, name: "A", createdBy: "Desktop", lastOpened: null }] });
    assert.equal(resolveSiteDirForDatabase({ dbPath: f.appData("site-a", "content.db") }, { workspace: f.workspace }), f.dir);
  } finally { f.cleanup(); }
});

test("resolveSiteDirForDatabase falls back to the selected site for an uncatalogued app-data database", () => {
  const f = fixture();
  process.env.TOVU_SITE_DIR = f.dir;
  try {
    assert.equal(resolveSiteDirForDatabase({ dbPath: f.appData("unknown", "content.db") }, { workspace: f.workspace }), f.dir);
  } finally { delete process.env.TOVU_SITE_DIR; f.cleanup(); }
});
