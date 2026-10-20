import { isolatedCatalogEnv } from "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createNodeDurableJsonPorts, type DurableJsonPorts } from "@jini-ai/platform/fs";
import { assertTestHomeIsolation, createSitesWorkspace, reportSitesSyncWarning, resolveSitesHome, type SitesWorkspace } from "../../sites-home.js";
import { desktopProjectPaths } from "../../sites-project-references.js";

/** Boundary pins for the Tovu sites workspace: option defaults, test-home isolation and the
 * released 0.1.14 nested `sites` compatibility root. Each test owns one temporary home.
 */
const ISOLATION_ERROR = "Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.";
const realHome = path.resolve(os.userInfo().homedir);

function tempHome(t: TestContext): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sites-home-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "Documents"));
  return root;
}
const linuxOptions = (root: string) => ({ homeDir: root, cwd: path.join(root, "repo"), env: {}, platform: "linux" as const, sourceRoots: [] });
const nestedFolder = (root: string) => path.join(root, "Documents", "Tovu", "sites");
function writeNestedSite(root: string, name: string): string {
  const dir = path.join(nestedFolder(root), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".site-meta.json"), "{}");
  return dir;
}
function writeSavedSetting(workspace: SitesWorkspace, text: string): void {
  const file = workspace.config({}).configPath;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function withoutTestContext(run: () => void): void {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try { run(); } finally { process.env.NODE_TEST_CONTEXT = previous; }
}

test("a Tovu checkout cwd adds its sites folder as the default source root", (t) => {
  const root = tempHome(t);
  fs.mkdirSync(path.join(root, "repo", "apps", "website", "src"), { recursive: true });
  const { sourceRoots: _omitted, ...options } = linuxOptions(root);
  assert.ok(createSitesWorkspace({}, options).config({}).siteRoots.includes(path.join(root, "repo", "sites")));
});

test("a cwd without the checkout layout adds no default source root", (t) => {
  const root = tempHome(t);
  const { sourceRoots: _omitted, ...options } = linuxOptions(root);
  assert.equal(createSitesWorkspace({}, options).config({}).siteRoots.includes(path.join(root, "repo", "sites")), false);
});

test("explicit sourceRoots replace the checkout default", (t) => {
  const root = tempHome(t);
  fs.mkdirSync(path.join(root, "repo", "apps", "website", "src"), { recursive: true });
  assert.equal(createSitesWorkspace({}, linuxOptions(root)).config({}).siteRoots.includes(path.join(root, "repo", "sites")), false);
});

test("TOVU_DESKTOP_USER_DATA_DIR is trimmed and resolved against cwd for the shared desktop profile", (t) => {
  const root = tempHome(t);
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), env: { TOVU_DESKTOP_USER_DATA_DIR: "  profile  " } });
  assert.equal(workspace.config({}).appData, path.join(root, "repo", "profile"));
});

test("a blank TOVU_DESKTOP_USER_DATA_DIR keeps the platform app-data default", (t) => {
  const root = tempHome(t);
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), env: { TOVU_DESKTOP_USER_DATA_DIR: "   " } });
  assert.equal(workspace.config({}).appData, createSitesWorkspace({}, linuxOptions(root)).config({}).appData);
});

test("an explicit appDataDir wins over TOVU_DESKTOP_USER_DATA_DIR", (t) => {
  const root = tempHome(t);
  const appDataDir = path.join(root, "explicit-profile");
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), appDataDir, env: { TOVU_DESKTOP_USER_DATA_DIR: "profile" } });
  assert.equal(workspace.config({}).appData, appDataDir);
});

test("projectsPaths default to the running platform and the resolved app-data folder", (t) => {
  const root = tempHome(t);
  const { platform: _omitted, ...options } = linuxOptions(root);
  const workspace = createSitesWorkspace({}, options);
  assert.deepEqual(workspace.projectsPaths, desktopProjectPaths({ homeDir: root, env: {}, platform: process.platform, appData: workspace.config({}).appData }));
});

function staleFixtureCatalog(t: TestContext, { catalogRecovery }: { catalogRecovery: boolean }) {
  // Outside HOME, the sites home and every temp root: only the minted fixture-id pattern can discard it.
  const root = tempHome(t);
  const reported: string[] = [];
  const ports: DurableJsonPorts = { ...createNodeDurableJsonPorts({}), report: { error: ({ message }) => { reported.push(message); } } };
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), ports, catalogRecovery });
  workspace.registry({}).merge({ entries: [{ id: "minted-id-1", name: "Gone", path: "/nonexistent-tovu-fixture-parent/missing-site", createdBy: "test", lastOpened: null }] });
  return { ids: workspace.registry({}).list({}).map((entry) => entry.id), reported };
}

test("catalogRecovery discards stale minted fixture ids from the catalog", (t) => {
  const { ids, reported } = staleFixtureCatalog(t, { catalogRecovery: true });
  assert.deepEqual(ids, []);
  assert.deepEqual(reported, ["Directory workspace: removed 1 test/temporary catalog entries: minted-id-1"]);
});

test("without catalogRecovery a stale fixture id stays listed", (t) => {
  assert.deepEqual(staleFixtureCatalog(t, { catalogRecovery: false }).ids, ["minted-id-1"]);
});

test("TOVU_SITE_ROOTS entries are trimmed and resolved against cwd before the isolation check", (t) => {
  const root = tempHome(t);
  assert.throws(() => createSitesWorkspace({}, { ...linuxOptions(root), cwd: realHome, env: { TOVU_SITE_ROOTS: "elsewhere, Tovu " } }), { message: ISOLATION_ERROR });
});

test("blank TOVU_SITE_ROOTS entries are ignored rather than resolved to cwd", (t) => {
  const root = tempHome(t);
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), cwd: realHome, env: { TOVU_SITE_ROOTS: " , " } });
  assert.equal(workspace.home({}), path.join(root, "Documents", "Tovu"));
});

test("XDG_CONFIG_HOME, sourceRoots and appDataDir inside the owner home are refused under node:test", (t) => {
  const root = tempHome(t);
  for (const options of [
    { env: { XDG_CONFIG_HOME: path.join(realHome, ".config") } },
    { sourceRoots: [path.join(realHome, "Tovu", "sites")] },
    { appDataDir: path.join(realHome, ".config", "Tovu") },
  ]) {
    assert.throws(() => createSitesWorkspace({}, { ...linuxOptions(root), ...options }), { message: ISOLATION_ERROR });
  }
});

test("assertTestHomeIsolation is a no-op outside node:test, even for the real home", () => {
  withoutTestContext(() => assert.doesNotThrow(() => assertTestHomeIsolation({ homeDir: realHome }, { paths: [path.join(realHome, "Tovu")] })));
});

test("assertTestHomeIsolation refuses the real home as homeDir", () => {
  assert.throws(() => assertTestHomeIsolation({ homeDir: realHome }), { message: ISOLATION_ERROR });
});

test("assertTestHomeIsolation refuses the real home itself as a path", () => {
  assert.throws(() => assertTestHomeIsolation({ homeDir: os.tmpdir() }, { paths: [realHome] }), { message: ISOLATION_ERROR });
});

test("assertTestHomeIsolation refuses every protected owner storage root and its descendants", () => {
  for (const root of [".tovu", "Documents/Tovu", "Tovu", "Tovu Sites", "Library/Application Support/Tovu", "AppData/Roaming/Tovu", ".local/share/Tovu", ".config/Tovu"]) {
    assert.throws(() => assertTestHomeIsolation({ homeDir: os.tmpdir() }, { paths: [path.join(realHome, root, "child")] }), { message: ISOLATION_ERROR }, root);
  }
});

test("assertTestHomeIsolation treats a child whose name starts with two dots as inside the root", () => {
  assert.throws(() => assertTestHomeIsolation({ homeDir: os.tmpdir() }, { paths: [path.join(realHome, "Tovu", "..hidden")] }), { message: ISOLATION_ERROR });
});

test("assertTestHomeIsolation allows owner-home siblings that only share a protected prefix", () => {
  assert.doesNotThrow(() => assertTestHomeIsolation({ homeDir: os.tmpdir() }, { paths: [path.join(realHome, "TovuBackup"), path.join(realHome, "Downloads")] }));
});

test("the nested 0.1.14 sites folder is discovered and its sites join the roots once", (t) => {
  const root = tempHome(t);
  writeNestedSite(root, "alpha"); writeNestedSite(root, "beta");
  const workspace = createSitesWorkspace({}, linuxOptions(root));
  assert.equal(workspace.nestedSitesRoot({}), nestedFolder(root));
  assert.equal(workspace.roots({}).filter((entry) => entry === nestedFolder(root)).length, 1);
});

test("a nested folder already listed as a root is not duplicated", (t) => {
  const root = tempHome(t);
  writeNestedSite(root, "alpha");
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), sourceRoots: [nestedFolder(root)] });
  assert.equal(workspace.roots({}).filter((entry) => entry === nestedFolder(root)).length, 1);
});

test("a nested folder without site children stays out of the roots", (t) => {
  const root = tempHome(t);
  fs.mkdirSync(path.join(nestedFolder(root), "plugins"), { recursive: true });
  const workspace = createSitesWorkspace({}, linuxOptions(root));
  assert.equal(workspace.nestedSitesRoot({}), nestedFolder(root));
  assert.deepEqual(workspace.roots({}), createSitesWorkspace({}, linuxOptions(root)).roots({}).filter((entry) => entry !== nestedFolder(root)));
  assert.equal(workspace.roots({}).includes(nestedFolder(root)), false);
});

test("no nested folder means no compatibility root", (t) => {
  const root = tempHome(t);
  assert.equal(createSitesWorkspace({}, linuxOptions(root)).nestedSitesRoot({}), undefined);
});

test("a file named sites is not a compatibility root", (t) => {
  const root = tempHome(t);
  fs.mkdirSync(path.dirname(nestedFolder(root)), { recursive: true });
  fs.writeFileSync(nestedFolder(root), "not a folder");
  assert.equal(createSitesWorkspace({}, linuxOptions(root)).nestedSitesRoot({}), undefined);
});

test("a website named sites is a website, not a compatibility root", (t) => {
  const root = tempHome(t);
  fs.mkdirSync(nestedFolder(root), { recursive: true });
  fs.writeFileSync(path.join(nestedFolder(root), ".site-meta.json"), "{}");
  assert.equal(createSitesWorkspace({}, linuxOptions(root)).nestedSitesRoot({}), undefined);
});

test("a TOVU_SITES_HOME override never qualifies for the nested compatibility root", (t) => {
  const root = tempHome(t);
  const home = path.join(root, "custom-home");
  fs.mkdirSync(path.join(home, "sites", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(home, "sites", "alpha", ".site-meta.json"), "{}");
  assert.equal(createSitesWorkspace({}, { ...linuxOptions(root), env: { TOVU_SITES_HOME: home } }).nestedSitesRoot({}), undefined);
});

test("a saved sitesHome setting never qualifies for the nested compatibility root", (t) => {
  const root = tempHome(t);
  writeNestedSite(root, "alpha");
  const workspace = createSitesWorkspace({}, linuxOptions(root));
  writeSavedSetting(workspace, JSON.stringify({ sitesHome: path.join(root, "Documents", "Tovu") }));
  assert.equal(workspace.nestedSitesRoot({}), undefined);
});

test("an unreadable saved setting never authorizes the nested compatibility root", (t) => {
  const root = tempHome(t);
  writeNestedSite(root, "alpha");
  const workspace = createSitesWorkspace({}, linuxOptions(root));
  writeSavedSetting(workspace, "{ not json");
  assert.equal(workspace.nestedSitesRoot({}), undefined);
});

test("a saved setting without sitesHome, or a null setting, keeps the nested compatibility root", (t) => {
  const root = tempHome(t);
  writeNestedSite(root, "alpha");
  const workspace = createSitesWorkspace({}, linuxOptions(root));
  for (const text of [JSON.stringify({ databases: "appData" }), "null"]) {
    writeSavedSetting(workspace, text);
    assert.equal(workspace.nestedSitesRoot({}), nestedFolder(root), text);
  }
});

test("resolveSitesHome returns the shared creation home", (t) => {
  const root = tempHome(t);
  assert.equal(resolveSitesHome({}, linuxOptions(root)), path.join(root, "Documents", "Tovu"));
});

test("reportSitesSyncWarning names both remedies for a synced sites home", (t) => {
  const root = tempHome(t);
  const workspace = createSitesWorkspace({}, { ...linuxOptions(root), env: { OneDrive: path.join(root, "Documents") } });
  const messages: string[] = [];
  reportSitesSyncWarning({ workspace }, { report: (message) => { messages.push(message); } });
  assert.deepEqual(messages, [`${workspace.config({}).warning?.message} Choose appData in Sites settings or use ${path.join(root, "Tovu")}.`]);
});

test("reportSitesSyncWarning defaults to console.warn", (t) => {
  const root = tempHome(t);
  const warn = t.mock.method(console, "warn", () => {});
  reportSitesSyncWarning({ workspace: createSitesWorkspace({}, { ...linuxOptions(root), env: { OneDrive: path.join(root, "Documents") } }) });
  assert.equal(warn.mock.callCount(), 1);
});

test("reportSitesSyncWarning stays silent without a warning, using the ambient workspace by default", (t) => {
  assert.equal(process.env.TOVU_DESKTOP_USER_DATA_DIR, isolatedCatalogEnv.TOVU_DESKTOP_USER_DATA_DIR);
  const warn = t.mock.method(console, "warn", () => {});
  reportSitesSyncWarning({});
  assert.equal(warn.mock.callCount(), 0);
});
