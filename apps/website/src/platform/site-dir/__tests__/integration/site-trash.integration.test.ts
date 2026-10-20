import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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
