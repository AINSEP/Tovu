import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { resolveSiteDatabasePaths } from "../../site-databases.js";
import { createSitesWorkspace } from "../../sites-home.js";
import type { listSites, SiteListEntry } from "../../site-registry.js";
import {
  assertManagedSiteDirectory, listSiteTrash, permanentlyDeleteTrashedSite, restoreSite, siteTrashName, trashSite,
} from "../../site-trash.js";

/**
 * @file Real-filesystem pins for every refusal and skip in `site-trash.ts`: the name/path rule
 * shared with the registry, Trash-id validation, symlink and non-directory refusals, Trash listing
 * skips, restore collisions and the permanent-delete confirmation gate.
 */

type Context = { after: (fn: () => void) => void };
const SITE_ID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";

/** A real temp base with the sites home at `<base>/home` and the legacy checkout root at `<base>/sites`. */
function fixture(t: Context) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "site-trash-pins-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const options = { homeDir: base, env: { TOVU_SITES_HOME: path.join(base, "home") } };
  return { base, options, home: path.join(base, "home") };
}

/** Writes a readable site folder (config + meta + content) at `dir`. */
function writeSite({ dir, displayName = "Alpha", siteId = "id" }: { dir: string; displayName?: string; siteId?: string }): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: displayName }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "starter", templateVersion: "1.0.0", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-08T00:00:00Z" }));
  fs.writeFileSync(path.join(dir, "content.db"), "precious content");
  return dir;
}

/** Places a folder straight into `<base>/site-trash/<id>` (as an operator or an older build might). */
function trashFolder({ base, id }: { base: string; id: string }): string {
  const dir = path.join(base, "site-trash", id);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  return dir;
}

test("assertManagedSiteDirectory returns the real directory of a site directly under the sites home", (t) => {
  const { base, options, home } = fixture(t);
  const dir = writeSite({ dir: path.join(home, "alpha") });
  assert.equal(assertManagedSiteDirectory({ base, name: "alpha" }, options), dir);
});

test("assertManagedSiteDirectory accepts a site directly under the legacy checkout sites/ folder", (t) => {
  const { base, options } = fixture(t);
  fs.mkdirSync(path.join(base, "apps", "website", "src"), { recursive: true }); // makes base a checkout
  const dir = writeSite({ dir: path.join(base, "sites", "alpha") });
  assert.equal(assertManagedSiteDirectory({ base, name: "alpha" }, options), dir);
});

test("assertManagedSiteDirectory refuses a path-like name with VALIDATION_ERROR", (t) => {
  const { base, options } = fixture(t);
  assert.throws(() => assertManagedSiteDirectory({ base, name: "../alpha" }, options), { code: "VALIDATION_ERROR" });
});

test("assertManagedSiteDirectory refuses a symlinked entry in the legacy sites/ folder with SITE_PATH_UNSAFE", (t) => {
  const { base, options, home } = fixture(t);
  const real = writeSite({ dir: path.join(home, "real") });
  fs.mkdirSync(path.join(base, "sites"));
  fs.symlinkSync(real, path.join(base, "sites", "link"));
  assert.throws(() => assertManagedSiteDirectory({ base, name: "link" }, options), { code: "SITE_PATH_UNSAFE" });
});

test("assertManagedSiteDirectory refuses a dangling symlink in the sites home with SITE_PATH_UNSAFE", (t) => {
  const { base, options, home } = fixture(t);
  fs.mkdirSync(home);
  fs.symlinkSync(path.join(base, "gone"), path.join(home, "alpha"));
  assert.throws(() => assertManagedSiteDirectory({ base, name: "alpha" }, options), { code: "SITE_PATH_UNSAFE" });
});

test("assertManagedSiteDirectory rethrows a filesystem error other than a missing entry", (t) => {
  const { base, options } = fixture(t);
  fs.writeFileSync(path.join(base, "sites"), "not a folder");
  assert.throws(() => assertManagedSiteDirectory({ base, name: "alpha" }, options), { code: "ENOTDIR" });
});

test("assertManagedSiteDirectory refuses an unknown site with SITE_NOT_FOUND", (t) => {
  const { base, options } = fixture(t);
  assert.throws(() => assertManagedSiteDirectory({ base, name: "alpha" }, options), { code: "SITE_NOT_FOUND" });
});

test("assertManagedSiteDirectory refuses an adopted external folder with SITE_PATH_UNSAFE", (t) => {
  const { base, options } = fixture(t);
  const external = writeSite({ dir: path.join(base, "elsewhere", "beta"), siteId: "beta-id" });
  createSitesWorkspace({}, { ...options, cwd: base }).registry({}).merge({ entries: [{ id: "beta-id", name: "Beta", path: external, createdBy: "discovered", lastOpened: null }] });
  assert.throws(() => assertManagedSiteDirectory({ base, name: "beta" }, options), { code: "SITE_PATH_UNSAFE" });
});

/** A typed `listSites` port that reports one site named `alpha` at `dir`, as a racing registry could. */
function listingAt({ dir }: { dir: string }): { listSites: typeof listSites } {
  const entry: SiteListEntry = { name: "alpha", dir, displayName: "Alpha", createdAt: "2026-10-08T00:00:00Z", active: false, running: null };
  return { listSites: () => [entry] };
}

test("assertManagedSiteDirectory refuses a listed site folder that is a symlink with SITE_PATH_UNSAFE", (t) => {
  const { base, options, home } = fixture(t);
  const real = writeSite({ dir: path.join(base, "outside", "beta") });
  fs.mkdirSync(home);
  fs.symlinkSync(real, path.join(home, "beta"));
  const optional = { ...options, ...listingAt({ dir: path.join(home, "beta") }) };
  assert.throws(() => assertManagedSiteDirectory({ base, name: "alpha" }, optional), { code: "SITE_PATH_UNSAFE" });
});

test("assertManagedSiteDirectory refuses a listed site path that is a file with SITE_PATH_UNSAFE", (t) => {
  const { base, options, home } = fixture(t);
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, "beta"), "not a site folder");
  const optional = { ...options, ...listingAt({ dir: path.join(home, "beta") }) };
  assert.throws(() => assertManagedSiteDirectory({ base, name: "alpha" }, optional), { code: "SITE_PATH_UNSAFE" });
});

test("siteTrashName returns the site name inside a valid Trash id", () => {
  assert.equal(siteTrashName({ id: `alpha--${SITE_ID}` }), "alpha");
});

test("siteTrashName refuses an id that is not <name>--<uuid> with VALIDATION_ERROR", () => {
  assert.throws(() => siteTrashName({ id: "alpha--not-a-uuid" }), { code: "VALIDATION_ERROR" });
});

test("trashSite moves the site into site-trash under a <name>--<uuid> id", (t) => {
  const { base, options, home } = fixture(t);
  writeSite({ dir: path.join(home, "alpha") });
  const row = trashSite({ base, name: "alpha" }, options);
  assert.match(row.id, /^alpha--[0-9a-f-]{36}$/);
  assert.deepEqual({ name: row.name, displayName: row.displayName }, { name: "alpha", displayName: "Alpha" });
  assert.equal(fs.readFileSync(path.join(base, "site-trash", row.id, "content.db"), "utf8"), "precious content");
});

test("trashSite drops the trashed site from the catalog", (t) => {
  const { base, options, home } = fixture(t);
  const dir = writeSite({ dir: path.join(home, "alpha") });
  trashSite({ base, name: "alpha" }, options);
  assert.equal(createSitesWorkspace({}, { ...options, cwd: base }).registry({}).list({}).some((entry) => entry.path === dir), false);
});

test("listSiteTrash returns no rows when there is no site-trash folder", (t) => {
  const { base, options } = fixture(t);
  assert.deepEqual(listSiteTrash({ base }, options), []);
});

test("listSiteTrash skips a Trash entry whose folder name is not a Trash id", (t) => {
  const { base, options } = fixture(t);
  writeSite({ dir: trashFolder({ base, id: "not-an-id" }) });
  assert.deepEqual(listSiteTrash({ base }, options), []);
});

test("listSiteTrash skips a Trash entry whose site files cannot be read", (t) => {
  const { base, options } = fixture(t);
  fs.mkdirSync(trashFolder({ base, id: `alpha--${SITE_ID}` }));
  assert.deepEqual(listSiteTrash({ base }, options), []);
});

test("listSiteTrash skips a Trash entry that is a symlink to a readable site", (t) => {
  const { base, options } = fixture(t);
  const real = writeSite({ dir: path.join(base, "outside", "alpha") });
  fs.symlinkSync(real, trashFolder({ base, id: `alpha--${SITE_ID}` }));
  assert.deepEqual(listSiteTrash({ base }, options), []);
});

test("listSiteTrash lists a readable Trash entry by id, site name and display name", (t) => {
  const { base, options } = fixture(t);
  writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }), displayName: "Alpha Site" });
  assert.deepEqual(listSiteTrash({ base }, options), [{ id: `alpha--${SITE_ID}`, name: "alpha", displayName: "Alpha Site" }]);
});

test("listSiteTrash refuses a symlinked site-trash folder with SITE_PATH_UNSAFE", (t) => {
  const { base, options } = fixture(t);
  fs.mkdirSync(path.join(base, "elsewhere"));
  fs.symlinkSync(path.join(base, "elsewhere"), path.join(base, "site-trash"));
  assert.throws(() => listSiteTrash({ base }, options), { code: "SITE_PATH_UNSAFE" });
});

test("restoreSite refuses a malformed Trash id with VALIDATION_ERROR", (t) => {
  const { base, options } = fixture(t);
  assert.throws(() => restoreSite({ base, id: "alpha" }, options), { code: "VALIDATION_ERROR" });
});

test("restoreSite refuses a valid id with no Trash folder with SITE_NOT_FOUND", (t) => {
  const { base, options } = fixture(t);
  assert.throws(() => restoreSite({ base, id: `alpha--${SITE_ID}` }, options), { code: "SITE_NOT_FOUND" });
});

test("restoreSite refuses a Trash entry that is a symlink with SITE_PATH_UNSAFE", (t) => {
  const { base, options } = fixture(t);
  const real = writeSite({ dir: path.join(base, "outside", "alpha") });
  fs.symlinkSync(real, trashFolder({ base, id: `alpha--${SITE_ID}` }));
  assert.throws(() => restoreSite({ base, id: `alpha--${SITE_ID}` }, options), { code: "SITE_PATH_UNSAFE" });
});

test("restoreSite refuses a Trash entry that is a file with SITE_PATH_UNSAFE", (t) => {
  const { base, options } = fixture(t);
  fs.writeFileSync(trashFolder({ base, id: `alpha--${SITE_ID}` }), "not a site");
  assert.throws(() => restoreSite({ base, id: `alpha--${SITE_ID}` }, options), { code: "SITE_PATH_UNSAFE" });
});

test("restoreSite refuses a symlinked site-trash folder with SITE_PATH_UNSAFE", (t) => {
  const { base, options } = fixture(t);
  writeSite({ dir: path.join(base, "elsewhere", `alpha--${SITE_ID}`) });
  fs.symlinkSync(path.join(base, "elsewhere"), path.join(base, "site-trash"));
  assert.throws(() => restoreSite({ base, id: `alpha--${SITE_ID}` }, options), { code: "SITE_PATH_UNSAFE" });
});

test("restoreSite refuses to rename over a dangling symlink at the destination with SITE_ALREADY_EXISTS", (t) => {
  const { base, options, home } = fixture(t);
  const dir = writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }) });
  fs.mkdirSync(home);
  fs.symlinkSync(path.join(base, "gone"), path.join(home, "alpha"));
  assert.throws(() => restoreSite({ base, id: `alpha--${SITE_ID}` }, options), { code: "SITE_ALREADY_EXISTS" });
  assert.equal(fs.existsSync(path.join(dir, "content.db")), true);
});

test("restoreSite creates a missing sites home and registers the restored site there", (t) => {
  const { base, options, home } = fixture(t);
  writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }), siteId: "restored-id" });
  restoreSite({ base, id: `alpha--${SITE_ID}` }, options);
  assert.equal(fs.readFileSync(path.join(home, "alpha", "content.db"), "utf8"), "precious content");
  const entry = createSitesWorkspace({}, { ...options, cwd: base }).registry({}).list({}).find((row) => row.id === "restored-id");
  assert.deepEqual({ path: entry?.path, createdBy: entry?.createdBy }, { path: path.join(home, "alpha"), createdBy: "restored" });
});

test("permanentlyDeleteTrashedSite refuses an unconfirmed delete with SITE_CONFIRM_REQUIRED", (t) => {
  const { base, options } = fixture(t);
  const dir = writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }) });
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: false }, options), { code: "SITE_CONFIRM_REQUIRED" });
  assert.equal(fs.existsSync(dir), true);
});

test("permanentlyDeleteTrashedSite refuses to delete a Trash folder that is not a readable site", (t) => {
  const { base, options } = fixture(t);
  const dir = trashFolder({ base, id: `alpha--${SITE_ID}` });
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "keep.txt"), "unknown data");
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options), { name: "SiteDirInvalidError", message: `config.json is missing at ${dir}` });
  assert.equal(fs.existsSync(path.join(dir, "keep.txt")), true);
});

test("permanentlyDeleteTrashedSite removes a confirmed, readable Trash entry", (t) => {
  const { base, options } = fixture(t);
  const dir = writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }) });
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options);
  assert.equal(fs.existsSync(dir), false);
});

// B229: app-data placement keeps content.db/chat.db at `<appData>/databases/<siteId>/`, outside the
// site folder, so a permanent delete must remove that one per-site folder too — and nothing else.
const OTHER_ID = "2c5f39cb-3a22-42e3-994a-1127e4ddb538";

/** A fixture whose app data lives at `<base>/appdata`, with the shared `databases/` parent. */
function appDataFixture(t: Context) {
  const { base, options, home } = fixture(t);
  const appData = path.join(base, "appdata");
  const databases = path.join(appData, "databases");
  return { base, home, appData, databases, options: { ...options, env: { ...options.env, TOVU_DESKTOP_USER_DATA_DIR: appData } } };
}

/** Writes app-data databases for `siteId` and returns their folder. */
function writeAppDataDatabases({ databases, siteId }: { databases: string; siteId: string }): string {
  const dir = path.join(databases, siteId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "content.db"), `content of ${siteId}`);
  fs.writeFileSync(path.join(dir, "chat.db"), `chat of ${siteId}`);
  return dir;
}

/** A trashed site with no in-folder DB, so its databases resolve to app-data placement. */
function writeAppDataTrashedSite({ base }: { base: string }): string {
  const dir = writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }), siteId: SITE_ID });
  fs.rmSync(path.join(dir, "content.db"));
  return dir;
}

test("B229: permanent delete of an app-data site removes its <appData>/databases/<siteId>/ folder", (t) => {
  const { base, options, databases } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  const dbDir = writeAppDataDatabases({ databases, siteId: SITE_ID });
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.existsSync(dbDir), false);
});

test("B229: permanent delete keeps a sibling site's app-data databases and the shared databases/ parent", (t) => {
  const { base, options, databases } = appDataFixture(t);
  writeAppDataTrashedSite({ base });
  writeAppDataDatabases({ databases, siteId: SITE_ID });
  const sibling = writeAppDataDatabases({ databases, siteId: OTHER_ID });
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options);
  assert.equal(fs.readFileSync(path.join(sibling, "content.db"), "utf8"), `content of ${OTHER_ID}`);
  assert.equal(fs.readFileSync(path.join(sibling, "chat.db"), "utf8"), `chat of ${OTHER_ID}`);
  assert.equal(fs.statSync(databases).isDirectory(), true);
});

test("B229: permanent delete of an in-folder site removes only its folder, leaving app-data databases alone", (t) => {
  const { base, options, databases } = appDataFixture(t);
  const dir = writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }), siteId: SITE_ID }); // in-folder content.db
  const sibling = writeAppDataDatabases({ databases, siteId: OTHER_ID });
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.readFileSync(path.join(sibling, "content.db"), "utf8"), `content of ${OTHER_ID}`);
});

for (const [missing, flags] of [["checkbox", { checked: false, confirmed: true }], ["confirmation", { checked: true, confirmed: false }]] as const) {
  test(`B229: a permanent delete missing its ${missing} deletes nothing: Trash folder and app-data databases stay`, (t) => {
    const { base, options, databases } = appDataFixture(t);
    const dir = writeAppDataTrashedSite({ base });
    const dbDir = writeAppDataDatabases({ databases, siteId: SITE_ID });
    assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, ...flags }, options), { code: "SITE_CONFIRM_REQUIRED" });
    assert.equal(fs.readFileSync(path.join(dbDir, "content.db"), "utf8"), `content of ${SITE_ID}`);
    assert.equal(fs.readFileSync(path.join(dbDir, "chat.db"), "utf8"), `chat of ${SITE_ID}`);
    assert.equal(fs.existsSync(path.join(dir, "config.json")), true);
  });
}

test("B229: deleting one of two Trash entries that share a siteId keeps the shared app-data databases for the other's restore", (t) => {
  const { base, options, databases, home } = appDataFixture(t);
  writeAppDataTrashedSite({ base });
  const second = writeSite({ dir: trashFolder({ base, id: `beta--${OTHER_ID}` }), displayName: "Beta", siteId: SITE_ID });
  fs.rmSync(path.join(second, "content.db"));
  const dbDir = path.join(databases, SITE_ID);
  fs.mkdirSync(dbDir, { recursive: true });
  const seeded = new Database(path.join(dbDir, "content.db"));
  seeded.exec("CREATE TABLE posts (title TEXT); INSERT INTO posts VALUES ('first'), ('second');");
  seeded.close();
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options);
  restoreSite({ base, id: `beta--${OTHER_ID}` }, options);
  assert.equal(fs.existsSync(path.join(dbDir, "content.db")), true, "the remaining Trash entry's databases were deleted");
  const restored = path.join(home, "beta");
  const workspace = createSitesWorkspace({}, { ...options, cwd: base });
  const { contentDbPath } = resolveSiteDatabasePaths({ dir: restored }, { workspace, reserveIdentity: false });
  assert.equal(contentDbPath, path.join(dbDir, "content.db"));
  const reopened = new Database(contentDbPath, { readonly: true, fileMustExist: true });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.prepare("SELECT title FROM posts ORDER BY rowid").all(), [{ title: "first" }, { title: "second" }]);
});

test("B229: a redirected (symlinked) databases/ parent is refused before anything is deleted", (t) => {
  const { base, options, appData } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  const elsewhere = path.join(base, "elsewhere");
  writeAppDataDatabases({ databases: elsewhere, siteId: SITE_ID });
  fs.mkdirSync(appData, { recursive: true });
  fs.symlinkSync(elsewhere, path.join(appData, "databases"));
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options), { code: "SITE_PATH_UNSAFE" });
  assert.equal(fs.readFileSync(path.join(elsewhere, SITE_ID, "content.db"), "utf8"), `content of ${SITE_ID}`);
  assert.equal(fs.existsSync(dir), true);
});

test("B229: an injected database path naming a sibling site's databases/<otherId> folder is refused", (t) => {
  const { base, options, databases } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  const sibling = writeAppDataDatabases({ databases, siteId: OTHER_ID });
  const databasePaths = () => ({ contentDbPath: path.join(sibling, "content.db"), chatDbPath: path.join(sibling, "chat.db") });
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, { ...options, databasePaths }), { code: "SITE_PATH_UNSAFE" });
  assert.equal(fs.readFileSync(path.join(sibling, "content.db"), "utf8"), `content of ${OTHER_ID}`);
  assert.equal(fs.existsSync(dir), true);
});

test("B229: app-data databases now owned by a live site with the same siteId are kept", (t) => {
  const { base, options, databases, home } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  const dbDir = writeAppDataDatabases({ databases, siteId: SITE_ID });
  // e.g. a Finder copy of the folder that booted after the original went to Trash and reserved the identity.
  const live = writeSite({ dir: path.join(home, "copy"), siteId: SITE_ID });
  createSitesWorkspace({}, { ...options, cwd: base }).registry({}).merge({ entries: [{ id: SITE_ID, name: "copy", path: live, createdBy: "database-owner", lastOpened: null }] });
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.readFileSync(path.join(dbDir, "content.db"), "utf8"), `content of ${SITE_ID}`);
});

test("B229: a symlinked per-site database folder is refused before anything is deleted", (t) => {
  const { base, options, databases } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  const outside = path.join(base, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "content.db"), "not ours");
  fs.mkdirSync(databases, { recursive: true });
  fs.symlinkSync(outside, path.join(databases, SITE_ID));
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options), { code: "SITE_PATH_UNSAFE" });
  assert.equal(fs.readFileSync(path.join(outside, "content.db"), "utf8"), "not ours");
  assert.equal(fs.existsSync(dir), true);
});

test("B229: a siteId with `..` is refused (by the platform's identity check) before anything is deleted", (t) => {
  const { base, options, appData } = appDataFixture(t);
  const dir = writeSite({ dir: trashFolder({ base, id: `alpha--${SITE_ID}` }), siteId: "../escape" });
  fs.rmSync(path.join(dir, "content.db"));
  const escaped = path.join(appData, "escape");
  fs.mkdirSync(escaped, { recursive: true });
  fs.writeFileSync(path.join(escaped, "content.db"), "outside databases/");
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, options), /safe, stable site identity/);
  assert.equal(fs.readFileSync(path.join(escaped, "content.db"), "utf8"), "outside databases/");
  assert.equal(fs.existsSync(dir), true);
});

for (const [label, odd] of [
  ["the shared databases/ parent itself", (databases: string) => path.join(databases, "content.db")],
  ["a folder outside app data", (_databases: string) => path.join(os.tmpdir(), "elsewhere", "content.db")],
  ["a `..` hop out of databases/", (databases: string) => `${databases}${path.sep}..${path.sep}escape${path.sep}content.db`],
  ["a nested folder below a site's folder", (databases: string) => path.join(databases, SITE_ID, "nested", "content.db")],
] as const) {
  test(`B229: an injected database path pointing at ${label} is refused`, (t) => {
    const { base, options, databases } = appDataFixture(t);
    const dir = writeAppDataTrashedSite({ base });
    const dbDir = writeAppDataDatabases({ databases, siteId: SITE_ID });
    const databasePaths = () => ({ contentDbPath: odd(databases), chatDbPath: odd(databases) });
    assert.throws(() => permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, { ...options, databasePaths }), { code: "SITE_PATH_UNSAFE" });
    assert.equal(fs.existsSync(path.join(dbDir, "content.db")), true);
    assert.equal(fs.existsSync(dir), true);
  });
}

test("B229: the database folder is removed through the injected filesystem port", (t) => {
  const { base, options, databases } = appDataFixture(t);
  writeAppDataTrashedSite({ base });
  const dbDir = writeAppDataDatabases({ databases, siteId: SITE_ID });
  const removed: string[] = [];
  const databaseFs = { lstatSync: fs.lstatSync, rmSync: (target: fs.PathLike) => { removed.push(String(target)); } };
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, { ...options, databaseFs });
  assert.deepEqual(removed, [dbDir]);
  assert.equal(fs.existsSync(dbDir), true);
});

// B229 serialization: permanent delete, restore and boot-time identity reservation all decide who owns
// a `databases/<siteId>/` folder, so each does its whole check-and-act inside the shared identity lock.

/** A lock that records whether `run` is executing, so the test can see what happened inside it. */
function recordingLock() {
  const seen: { appData: string }[] = [];
  let held = false;
  const lock = <T>({ appData, run }: { appData: string; run: () => T }): T => {
    seen.push({ appData });
    held = true;
    try { return run(); } finally { held = false; }
  };
  return { lock, seen, isHeld: () => held };
}

/** A lock that is never granted: anything done outside `run` would still happen. */
const neverGranted = <T>(_required: { appData: string; run: () => T }): T => undefined as T;

test("B229: permanent delete does its ownership check and both removals inside the app-data identity lock", (t) => {
  const { base, options, appData, databases } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  writeAppDataDatabases({ databases, siteId: SITE_ID });
  const { lock, seen, isHeld } = recordingLock();
  const heldDuringRemove: boolean[] = [];
  const databaseFs = { lstatSync: fs.lstatSync, rmSync: () => { heldDuringRemove.push(isHeld()); } };
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, { ...options, databaseFs, identityLock: lock });
  assert.deepEqual(seen, [{ appData }]);
  assert.deepEqual(heldDuringRemove, [true]);
  assert.equal(fs.existsSync(dir), false);
  // Withheld lock: nothing is checked or removed.
  const again = writeAppDataTrashedSite({ base });
  permanentlyDeleteTrashedSite({ base, id: `alpha--${SITE_ID}`, checked: true, confirmed: true }, { ...options, identityLock: neverGranted });
  assert.equal(fs.existsSync(again), true);
  assert.equal(fs.existsSync(path.join(databases, SITE_ID, "content.db")), true);
});

test("B229: restore moves the folder and records its siteId only inside the app-data identity lock", (t) => {
  const { base, options, appData, home } = appDataFixture(t);
  const dir = writeAppDataTrashedSite({ base });
  restoreSite({ base, id: `alpha--${SITE_ID}` }, { ...options, identityLock: neverGranted });
  assert.equal(fs.existsSync(dir), true);
  const { lock, seen } = recordingLock();
  restoreSite({ base, id: `alpha--${SITE_ID}` }, { ...options, identityLock: lock });
  assert.deepEqual(seen, [{ appData }]);
  const catalog = createSitesWorkspace({}, { ...options, cwd: base }).registry({}).list({});
  assert.deepEqual(catalog.map((entry) => [entry.id, entry.path]), [[SITE_ID, path.join(home, "alpha")]]);
});

test("B229: boot-time identity reservation happens only inside the app-data identity lock", (t) => {
  const { base, options, appData, home, databases } = appDataFixture(t);
  const live = writeSite({ dir: path.join(home, "live"), siteId: SITE_ID });
  fs.rmSync(path.join(live, "content.db"));
  const dbDir = writeAppDataDatabases({ databases, siteId: SITE_ID });
  const workspace = createSitesWorkspace({}, { ...options, cwd: base });
  assert.equal(resolveSiteDatabasePaths({ dir: live }, { workspace, identityLock: neverGranted }).contentDbPath, path.join(dbDir, "content.db"));
  assert.deepEqual(workspace.registry({}).list({}), []);
  const { lock, seen } = recordingLock();
  resolveSiteDatabasePaths({ dir: live }, { workspace, identityLock: lock });
  assert.deepEqual(seen, [{ appData }]);
  assert.deepEqual(workspace.registry({}).list({}).map((entry) => entry.id), [SITE_ID]);
});
