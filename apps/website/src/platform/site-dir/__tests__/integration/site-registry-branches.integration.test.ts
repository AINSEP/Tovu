import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { InitDirNotEmptyError, ValidationError } from "../../errors.js";
import type { InitSiteRestorePort } from "../../init-site.js";
import type { initSite } from "#src/server/runtime/composition/site-dir";
import { describeSiteBinding, includeServingSite, listSites, listSitesForBinding, reconcileSiteCreation, type SiteCreationAllocation } from "../../site-registry.js";
import { createSite } from "#src/server/runtime/composition/site-dir";
import { resolveSiteDatabasePaths } from "../../site-databases.js";
import { SITE_SELECTION_PINNED_ENV } from "../../site-root.js";
import { createSitesWorkspace, type SitesWorkspace } from "../../sites-home.js";

/** Branch pins for site-registry: catalog-backed discovery, import-safe creation and rollback,
 * interrupted-import reconciliation and the ambient (process cwd/env) defaults. initSite is a
 * typed fake so each test controls exactly which step fails; every test owns one temp root.
 */
function tempRoot(t: TestContext): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-registry-branches-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const workspaceOptions = (root: string) => ({ homeDir: root, cwd: root, env: { TOVU_SITES_HOME: path.join(root, "home") }, platform: "linux" as const, sourceRoots: [] });
/** Discovery roots travel through listSites' options to the workspace (not part of its declared type). */
const withSourceRoots = (root: string, sourceRoots: string[]) => ({ ...workspaceOptions(root), sourceRoots });
function writeSite(dir: string, siteId: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: `Site ${siteId}` }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "starter", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09" }));
}
/** A typed initSite stand-in that commits a minimal valid site and reports its allocation. */
function fakeInit({ siteId, dbPath }: { siteId: string; dbPath?: (dir: string) => string }): { init: typeof initSite; names: string[] } {
  const names: string[] = [];
  const init: typeof initSite = async ({ dir, name }, { onAllocated } = {}) => {
    names.push(name ?? "");
    writeSite(dir, siteId);
    onAllocated?.({ siteId, dir, dbPath: dbPath ? dbPath(dir) : path.join(dir, "data.nosync", "content.db") });
    return { siteId, dir };
  };
  return { init, names };
}
const restore: InitSiteRestorePort = { restore: async () => {} };
function withCwd(dir: string, run: () => void): void {
  const previous = process.cwd();
  process.chdir(dir);
  try { run(); } finally { process.chdir(previous); }
}

test("listSites with no options scans the process cwd checkout", (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, "apps", "website", "src"), { recursive: true });
  writeSite(path.join(root, "sites", "alpha"), "ambient-alpha-id");
  withCwd(root, () => assert.deepEqual(listSites().filter((site) => site.dir.startsWith(root)).map((site) => site.name), ["alpha"]));
});

test("listSites lists a site reached through two roots only once", (t) => {
  const root = tempRoot(t);
  const site = path.join(root, "home", "alpha");
  writeSite(site, "alpha-id");
  fs.symlinkSync(path.join(root, "home"), path.join(root, "alias-root"));
  assert.deepEqual(listSites(withSourceRoots(root, [path.join(root, "alias-root")])).map((entry) => entry.dir), [site]);
});

test("listSites lists a site once when a catalog row reaches it through a later symlink", (t) => {
  const root = tempRoot(t);
  const site = path.join(root, "home", "alpha");
  writeSite(site, "alpha-id");
  // Registered before the alias existed, so the catalog keeps the alias spelling.
  createSitesWorkspace({}, workspaceOptions(root)).registry({}).merge({ entries: [{ id: "alias-id", name: "alias", path: path.join(root, "alias"), createdBy: "test", lastOpened: null }] });
  fs.symlinkSync(site, path.join(root, "alias"));
  assert.deepEqual(listSites(workspaceOptions(root)).map((entry) => entry.dir), [site]);
});

test("listSites rethrows a root that cannot be listed for a reason other than absence", (t) => {
  const root = tempRoot(t);
  fs.writeFileSync(path.join(root, "not-a-folder"), "");
  assert.throws(() => listSites(withSourceRoots(root, [path.join(root, "not-a-folder")])), { code: "ENOTDIR" });
});

test("listSites routes unsafe, overlong and duplicate folder names by their site id", (t) => {
  const root = tempRoot(t);
  const long = "a".repeat(101);
  writeSite(path.join(root, "home", "My Site"), "spaced-id");
  writeSite(path.join(root, "home", long), "long-id");
  writeSite(path.join(root, "home", "alpha"), "first-alpha-id");
  writeSite(path.join(root, "extra", "alpha"), "second-alpha-id");
  const names = listSites(withSourceRoots(root, [path.join(root, "extra")])).map((entry) => [entry.id, entry.name]);
  assert.deepEqual(names.sort(), [["first-alpha-id", "alpha"], ["long-id", "long-id"], ["second-alpha-id", "second-alpha-id"], ["spaced-id", "spaced-id"]]);
});

test("describeSiteBinding treats a catalog-registered folder outside every sites root as switcher-compatible", (t) => {
  const root = tempRoot(t);
  const dir = path.join(root, "adopted", "alpha");
  writeSite(dir, "adopted-id");
  createSitesWorkspace({}, workspaceOptions(root)).registry({}).merge({ entries: [{ id: "adopted-id", name: "alpha", path: dir, createdBy: "test", lastOpened: null }] });
  const options = workspaceOptions(root);
  assert.equal(describeSiteBinding({ ...options, env: { ...options.env, TOVU_SITE_DIR: dir } }).switcherCompatible, true);
});

test("createSite passes the display name and onAllocated with the picked folder name", async (t) => {
  const root = tempRoot(t);
  const { init, names } = fakeInit({ siteId: "alpha-id" });
  const allocated: SiteCreationAllocation[] = [];
  const result = await createSite({ name: "alpha", displayName: "Alpha Site" }, { ...workspaceOptions(root), initSite: init, onAllocated: (allocation) => { allocated.push(allocation); } });
  assert.deepEqual(names, ["Alpha Site"]);
  assert.deepEqual(allocated, [{ siteId: "alpha-id", dir: result.dir, dbPath: path.join(result.dir, "data.nosync", "content.db"), name: "alpha" }]);
});

test("createSite without onAllocated still creates and registers the site", async (t) => {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, workspaceOptions(root));
  const result = await createSite({ name: "alpha" }, { workspace, initSite: fakeInit({ siteId: "alpha-id" }).init });
  assert.deepEqual(workspace.registry({}).list({}).map((entry) => [entry.id, entry.name]), [["alpha-id", "alpha"]]);
  assert.equal(result.name, "alpha");
});

test("createSite refuses an unavailable sites home volume before creating anything", async (t) => {
  const root = tempRoot(t);
  const workspace: SitesWorkspace = { ...createSitesWorkspace({}, workspaceOptions(root)), homeAvailable: () => false };
  await assert.rejects(createSite({ name: "alpha" }, { workspace }), { name: "ValidationError", message: `Sites home volume is unavailable: ${path.join(root, "home")}. Mount it or choose a local folder in Sites settings.` });
  assert.equal(fs.existsSync(path.join(root, "home")), false);
});

test("an ordinary create whose catalog write fails keeps the committed site (no verified restore)", async (t) => {
  const root = tempRoot(t);
  const failure = new Error("catalog write failed");
  await assert.rejects(createSite({ name: "alpha" }, { ...workspaceOptions(root), initSite: fakeInit({ siteId: "alpha-id" }).init, beforeRegister: () => { throw failure; } }), (error) => error === failure);
  assert.equal(fs.existsSync(path.join(root, "home", "alpha", ".site-meta.json")), true);
});

test("a verified import whose catalog write fails rolls back the site and its external database folder", async (t) => {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, { ...workspaceOptions(root), appDataDir: path.join(root, "profile") });
  workspace.updateConfig({ patch: { databases: "appData" } });
  const dir = path.join(root, "home", "alpha");
  const external = path.dirname(resolveSiteDatabasePaths({ dir, siteId: "alpha-id" }, { workspace, placement: "appData", reserveIdentity: false }).contentDbPath);
  assert.equal(external.startsWith(dir + path.sep), false);
  fs.mkdirSync(external, { recursive: true });
  const failure = new Error("catalog write failed");
  await assert.rejects(createSite({ name: "alpha" }, { workspace, initSite: fakeInit({ siteId: "alpha-id" }).init, verifiedRestore: restore,
    beforeRegister: () => { throw failure; } }), (error) => error === failure);
  assert.deepEqual([fs.existsSync(dir), fs.existsSync(external)], [false, false]);
  assert.deepEqual(workspace.registry({}).list({}), []);
});

test("a verified import rollback keeps no stray in-site database folder", async (t) => {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, workspaceOptions(root));
  workspace.updateConfig({ patch: { databases: "inSite" } });
  const failure = new Error("catalog write failed");
  await assert.rejects(createSite({ name: "alpha" }, { workspace, initSite: fakeInit({ siteId: "alpha-id" }).init, verifiedRestore: restore,
    beforeRegister: () => { throw failure; } }), (error) => error === failure);
  assert.equal(fs.existsSync(path.join(root, "home", "alpha")), false);
});

test("collision-safe creation picks the next free suffix past existing folders and catalog names", async (t) => {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, workspaceOptions(root));
  fs.mkdirSync(path.join(root, "home", "alpha"), { recursive: true });
  workspace.registry({}).merge({ entries: [{ id: "other", name: "alpha-2", path: path.join(root, "elsewhere"), createdBy: "test", lastOpened: null }] });
  const result = await createSite({ name: "alpha" }, { workspace, collisionSafe: true, initSite: fakeInit({ siteId: "alpha-id" }).init });
  assert.equal(result.name, "alpha-3");
});

test("collision-safe creation retries the next suffix when initSite finds the folder occupied", async (t) => {
  const root = tempRoot(t);
  const { init: commit } = fakeInit({ siteId: "alpha-id" });
  const tried: string[] = [];
  const init: typeof initSite = async (required, optional) => {
    tried.push(path.basename(required.dir));
    if (tried.length === 1) throw new InitDirNotEmptyError("occupied by a concurrent create");
    return commit(required, optional);
  };
  const result = await createSite({ name: "alpha" }, { ...workspaceOptions(root), collisionSafe: true, initSite: init });
  assert.deepEqual([tried, result.name], [["alpha", "alpha-2"], "alpha-2"]);
});

test("collision-safe creation rethrows a failure that is not an occupied folder", async (t) => {
  const root = tempRoot(t);
  const failure = new Error("template unreadable");
  await assert.rejects(createSite({ name: "alpha" }, { ...workspaceOptions(root), collisionSafe: true, initSite: async () => { throw failure; } }), (error) => error === failure);
});

test("collision-safe creation moves on when an ordinary create filled the folder while it waited for the lock", async (t) => {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, workspaceOptions(root));
  let entered!: () => void, release!: () => void;
  const ordinaryEntered = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { init: commit } = fakeInit({ siteId: "ordinary-id" });
  // The ordinary creator holds alpha's per-name lock and only writes the folder once released.
  const ordinary = createSite({ name: "alpha" }, { workspace, initSite: async (required, optional) => { entered(); await gate; return commit(required, optional); } });
  await ordinaryEntered;
  const tried: string[] = [];
  const { init: importCommit } = fakeInit({ siteId: "import-id" });
  const imported = createSite({ name: "alpha" }, { workspace, collisionSafe: true, initSite: async (required, optional) => { tried.push(path.basename(required.dir)); return importCommit(required, optional); } });
  setTimeout(release, 100);
  const [first, second] = await Promise.all([ordinary, imported]);
  assert.deepEqual([first.name, second.name, tried], ["alpha", "alpha-2", ["alpha-2"]]);
});

test("collision-safe creation gives up when every suffix is taken", async (t) => {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, workspaceOptions(root));
  const entries = Array.from({ length: 10_000 }, (_, index) => ({ id: `taken-${index + 1}`, name: index === 0 ? "alpha" : `alpha-${index + 1}`,
    path: path.join(root, "taken", String(index + 1)), createdBy: "test", lastOpened: null }));
  workspace.registry({}).merge({ entries });
  await assert.rejects(createSite({ name: "alpha" }, { workspace, collisionSafe: true }), { name: "ValidationError", message: "No collision-free import site name is available." });
});

async function allocate(t: TestContext): Promise<{ root: string; workspace: SitesWorkspace; allocation: SiteCreationAllocation }> {
  const root = tempRoot(t);
  const workspace = createSitesWorkspace({}, workspaceOptions(root));
  const dir = path.join(root, "home", "alpha");
  writeSite(dir, "alpha-id");
  return { root, workspace, allocation: { siteId: "alpha-id", dir, dbPath: path.join(dir, "data.nosync", "content.db"), name: "alpha" } };
}
const register = (workspace: SitesWorkspace, entry: { id: string; path: string }) =>
  workspace.registry({}).merge({ entries: [{ ...entry, name: "alpha", createdBy: "Web", lastOpened: null }] });

test("reconcileSiteCreation reports a registered, matching import as ready", async (t) => {
  const { workspace, allocation } = await allocate(t);
  register(workspace, { id: allocation.siteId, path: allocation.dir });
  assert.equal(await reconcileSiteCreation({ allocation, workspace }), "ready");
  assert.equal(fs.existsSync(allocation.dir), true);
});

test("reconcileSiteCreation refuses a catalog row for this folder owned by another site id", async (t) => {
  const { workspace, allocation } = await allocate(t);
  register(workspace, { id: "other-id", path: allocation.dir });
  await assert.rejects(reconcileSiteCreation({ allocation, workspace }), { name: "ValidationError", message: "Interrupted import has conflicting site ownership; manual recovery required." });
});

test("reconcileSiteCreation refuses a catalog row for this site id at another folder", async (t) => {
  const { root, workspace, allocation } = await allocate(t);
  register(workspace, { id: allocation.siteId, path: path.join(root, "elsewhere") });
  await assert.rejects(reconcileSiteCreation({ allocation, workspace }), { name: "ValidationError", message: "Interrupted import has conflicting site ownership; manual recovery required." });
});

test("reconcileSiteCreation refuses a matching catalog row whose folder marker names another site", async (t) => {
  const { workspace, allocation } = await allocate(t);
  register(workspace, { id: allocation.siteId, path: allocation.dir });
  writeSite(allocation.dir, "other-id");
  await assert.rejects(reconcileSiteCreation({ allocation, workspace }), { name: "ValidationError", message: "Interrupted import has conflicting site ownership; manual recovery required." });
});

test("reconcileSiteCreation refuses to remove an unregistered folder that belongs to another site", async (t) => {
  const { workspace, allocation } = await allocate(t);
  writeSite(allocation.dir, "other-id");
  await assert.rejects(reconcileSiteCreation({ allocation, workspace }), { name: "ValidationError", message: "Interrupted import directory belongs to another site; manual recovery required." });
  assert.equal(fs.existsSync(allocation.dir), true);
});

test("reconcileSiteCreation removes an unregistered import of this site and reports failed", async (t) => {
  const { workspace, allocation } = await allocate(t);
  assert.equal(await reconcileSiteCreation({ allocation, workspace }), "failed");
  assert.equal(fs.existsSync(allocation.dir), false);
});

test("reconcileSiteCreation removes a markerless import and its external database folder", async (t) => {
  const { root, workspace, allocation } = await allocate(t);
  fs.rmSync(path.join(allocation.dir, ".site-meta.json"));
  const dbPath = path.join(root, "profile", "sites", "alpha-id", "content.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, "");
  assert.equal(await reconcileSiteCreation({ allocation: { ...allocation, dbPath }, workspace }), "failed");
  assert.deepEqual([fs.existsSync(allocation.dir), fs.existsSync(path.dirname(dbPath))], [false, false]);
});

test("describeSiteBinding with no options reads the process cwd and environment", (t) => {
  const root = tempRoot(t);
  withCwd(root, () => {
    const binding = describeSiteBinding();
    assert.deepEqual([binding.switcherBase, binding.dirOverridden], [root, process.env.TOVU_SITE_DIR !== undefined && process.env[SITE_SELECTION_PINNED_ENV] !== "1"]);
  });
});

test("listSitesForBinding uses the real listSites for a switchable binding by default", (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, "apps", "website", "src"), { recursive: true });
  writeSite(path.join(root, "sites", "alpha"), "binding-alpha-id");
  const sites = listSitesForBinding({ binding: { dir: path.join(root, "sites", "alpha"), name: "alpha", dirOverridden: false, switcherCompatible: true, switcherBase: root } });
  assert.deepEqual(sites.filter((site) => site.dir.startsWith(root)).map((site) => [site.name, site.active]), [["alpha", true]]);
});

test("a ValidationError is the refusal type for an invalid name", async () => {
  await assert.rejects(createSite({ name: "Bad Name" }), (error) => error instanceof ValidationError && error.message === "createSite: name must be 1..100 lowercase letters, digits, and dashes");
});

test("includeServingSite dates an unregistered served folder by mtime when the filesystem has no birth time", (t) => {
  const root = tempRoot(t);
  const stat = (dir: string) => Object.assign(fs.statSync(dir), { birthtimeMs: 0, mtime: new Date("2026-01-02T03:04:05.000Z") });
  const [entry] = includeServingSite({ sites: [], binding: { dir: root, name: "served", dirOverridden: true, switcherCompatible: false } }, { stat });
  assert.equal(entry?.createdAt, "2026-01-02T03:04:05.000Z");
});
