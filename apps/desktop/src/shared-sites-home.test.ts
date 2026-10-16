import { isolatedCatalogHome } from "../../website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSitesWorkspace, shareSiteDirectories, attachRunningSite, rememberSharedSiteOpen } from "./shared-sites.ts";
import { handleCreate, handleList } from "./project-ipc.ts";
import { discoverSiteDirs } from "./tracked-sites.ts";
import { assertSpecificSiteRoot } from "./site-scan-policy.ts";
import { existingRecentSiteDirs } from "./site-dir-store.ts";
function writeSite(dir: string, siteId: string, name = "Example") {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name, domain: null, port: null }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09T00:00:00.000Z" }));
}

test("desktop creates inside the shared home and reads Web/external entries as adopted records", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-shared-home-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {} });
    fs.mkdirSync(path.join(root, "Documents"), { recursive: true });
    const deps = { sharedSites: workspace, projectsPath: path.join(root, "profile", "projects.json"), statePath: path.join(root, "profile", "desktop-state.json"),
      repoRoot: path.join(root, "repo"), cliMode: "source" as const, openSites: new Map(),
      dialog: { showOpenDialog: async () => { throw new Error("Creation must not ask for another folder"); } },
      classifySiteDir: (dir: string) => fs.existsSync(path.join(dir, "config.json")) ? "site" as const : "empty" as const,
      adoptSiteDir: async ({ dir, name }: { dir: string; name?: string }) => { writeSite(dir, "11111111-1111-4111-8111-111111111111", name); return dir; },
      readSiteName: (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).name as string,
      readPreviewVersion: () => null,
    };
    const created = await handleCreate({ displayName: "My Website", database: { kind: "sqlite" } }, deps);
    assert.equal(created?.installDir, path.join(workspace.home({}), "my-website"));
    assert.equal(workspace.registry({}).list({})[0]?.createdBy, "Desktop");
    const outside = path.join(root, "elsewhere", "outside"); writeSite(outside, "22222222-2222-4222-8222-222222222222", "Web site");
    workspace.registry({}).merge({ entries: [{ id: "22222222-2222-4222-8222-222222222222", name: "Web site", path: outside, createdBy: "Web", lastOpened: null }] });
    const rows = handleList(deps);
    assert.equal(rows.length, 2); assert.equal(rows.find((row) => row.installDir === outside)?.deleteErasesFiles, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("MRU import is once-only and recent entries become a sorted view of shared lastOpened", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-shared-mru-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {} });
    const statePath = path.join(root, "desktop-state.json"), first = path.join(root, "first"), second = path.join(root, "second");
    writeSite(first, "first-id"); writeSite(second, "second-id");
    fs.writeFileSync(statePath, JSON.stringify({ recentSiteDirs: [first] }));
    assert.deepEqual(existingRecentSiteDirs(statePath, { workspace }), [first]);
    fs.writeFileSync(statePath, JSON.stringify({ recentSiteDirs: [second] }));
    assert.deepEqual(existingRecentSiteDirs(statePath, { workspace }), [first]);
    shareSiteDirectories({ workspace, dirs: [second], createdBy: "Web" });
    workspace.registry({}).opened({ path: second, at: "2026-10-09T01:00:00.000Z" });
    assert.deepEqual(existingRecentSiteDirs(statePath, { workspace }), [second, first]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("attaching to a Web server preserves its scheme/port and Stop never kills that owner", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-shared-running-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {} });
    const dir = path.join(root, "site"); fs.mkdirSync(dir);
    const claim = workspace.claim({ path: dir, app: "Web", port: 3456, scheme: "https" });
    const server = attachRunningSite({ workspace, dir });
    assert.equal(server?.external, true); assert.equal(server?.adminUrl, "https://localhost:3456/admin/");
    await server?.stop();
    assert.equal(workspace.running({ path: dir }).read({})?.token, claim.record.token);
    workspace.running({ path: dir }).release({ token: claim.record.token });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("catalog import skips copied identities, empty names and malformed JSON without losing valid siblings", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-catalog-bad-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux" });
    const good = path.join(root, "good"), copy = path.join(root, "copy"), empty = path.join(root, "empty"), broken = path.join(root, "broken");
    writeSite(good, "shared-id"); writeSite(copy, "shared-id"); writeSite(empty, "empty-id", ""); writeSite(broken, "broken-id");
    fs.writeFileSync(path.join(broken, "config.json"), "{broken");
    const warnings: string[] = [];
    const rows = shareSiteDirectories({ workspace, dirs: [good, copy, empty, broken], createdBy: "Desktop" }, { report: (message) => warnings.push(message) });
    assert.deepEqual(rows.map((row) => row.path), [good]); assert.equal(warnings.length, 3);
    assert.equal(fs.readFileSync(path.join(broken, "config.json"), "utf8"), "{broken");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("missing-volume MRU import remains pending and imports the original entry after remount", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-mru-remount-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {} }), state = path.join(root, "state.json"), missing = path.join(root, "volume", "site");
    fs.writeFileSync(state, JSON.stringify({ recentSiteDirs: [missing] }));
    assert.deepEqual(existingRecentSiteDirs(state, { workspace }), []);
    assert.equal(workspace.registry({}).hasMigration({ migration: `mru:${state}` }), false);
    writeSite(missing, "mounted-id");
    assert.deepEqual(existingRecentSiteDirs(state, { workspace }), [missing]);
    assert.equal(workspace.registry({}).hasMigration({ migration: `mru:${state}` }), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
for (const address of [{ scheme: "file", port: 3456 }, { scheme: "http", port: -1 }, { scheme: "https", port: 65536 }]) test(`attach refuses invalid lease address ${address.scheme}/${address.port}`, () => {
  const workspace = { running: () => ({ read: () => ({ ...address, pid: 10, token: "fake", app: "Web" }) }) } as unknown as Parameters<typeof attachRunningSite>[0]["workspace"];
  assert.throws(() => attachRunningSite({ workspace, dir: "/fixture" }), { message: "Invalid running site address. Stop the owning app and repair its lease before attaching." });
});

test("discovery cannot steal an unavailable appData site's reserved identity with a Finder copy", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-copy-unmounted-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux" });
    workspace.updateConfig({ patch: { databases: "appData" } });
    const old = path.join(root, "unavailable-volume", "original"), copy = path.join(root, "copy");
    workspace.registry({}).merge({ entries: [{ id: "same", path: old, name: "Original", createdBy: "Web", lastOpened: null }] });
    writeSite(copy, "same");
    shareSiteDirectories({ workspace, dirs: [copy], createdBy: "discovered" });
    assert.equal(workspace.registry({}).list({})[0]?.path, old);
    shareSiteDirectories({ workspace, dirs: [copy], createdBy: "Desktop", allowRelocation: true });
    assert.equal(workspace.registry({}).list({})[0]?.path, copy);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("successful open remains owned when catalog discovery or last-opened bookkeeping is unreadable", () => {
  let opened = 0;
  const workspace = { registry: () => ({
    list: () => { throw new Error("Unreadable catalog"); },
    opened: () => { opened++; throw new Error("Catalog write unavailable"); },
  }) } as unknown as Parameters<typeof rememberSharedSiteOpen>[0]["workspace"];
  assert.doesNotThrow(() => rememberSharedSiteOpen({ workspace, dir: "/opened-site" }));
  assert.equal(opened, 1);
});


test("deskfx2 SHOULD-1: default workspace recovery stays off even with HOME under tmp", () => {
  const workspace = createSitesWorkspace({}, { cwd: isolatedCatalogHome, sourceRoots: [] });
  const missing = path.join(os.tmpdir(), "deskfx2-unavailable-external-site");
  const entry = { id: "new-site-id-12345", name: "Unavailable", path: missing, createdBy: "test", lastOpened: null };
  workspace.registry({}).merge({ entries: [entry] });
  assert.equal(workspace.registry({}).list({}).some((row) => row.id === entry.id), true);
  assert.equal(os.homedir(), isolatedCatalogHome);
});

test("deskfx2 NIT: null legacy metadata remains an admitted shared catalog site", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-null-marker-")));
  try {
    const dir = path.join(root, "legacy"); writeSite(dir, "ignored");
    fs.writeFileSync(path.join(dir, ".site-meta.json"), "null");
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, cwd: root });
    const notices: string[] = [];
    const rows = shareSiteDirectories({ workspace, dirs: [dir], createdBy: "Desktop" }, { report: (message) => notices.push(message) });
    assert.equal(rows.length, 1); assert.equal(rows[0]?.path, dir); assert.equal(rows[0]?.name, "Example");
    assert.deepEqual(notices, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("desktop uses the single default home and transiently scans remaining nested sites", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-sitesnest-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", sourceRoots: [] });
    const old = path.join(root, "Documents", "Tovu"), nested = path.join(old, "sites");
    assert.equal(workspace.home({}), old);
    assert.deepEqual(workspace.roots({}), [old]);
    assert.equal(workspace.legacyHomes({}).includes(path.join(root, "Tovu")), false);
    writeSite(path.join(old, "alpha"), "alpha-id");
    writeSite(path.join(nested, "beta"), "beta-id");
    assert.deepEqual(workspace.roots({}), [old, nested]);
    shareSiteDirectories({ workspace, dirs: [path.join(old, "alpha")], createdBy: "test" });
    const records = handleList({ sharedSites: workspace, projectsPath: path.join(root, "profile", "desktop-projects.json"),
      openSites: new Map(), repoRoot: root, readSiteName: () => "Alpha", readPreviewVersion: () => null });
    assert.equal(records.find((record) => record.installDir === path.join(old, "alpha"))?.folderMissing, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("default discovery uses its injected home for policy and never admits the unrelated local old home", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sitesnest2-scan-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux" });
    const parent = path.join(root, "Documents", "Tovu"), local = path.join(root, "Tovu");
    writeSite(path.join(parent, "alpha"), "alpha-id"); writeSite(path.join(workspace.home({}), "sites", "beta"), "beta-id");
    writeSite(path.join(local, "keep-local"), "local-id");
    assert.throws(() => assertSpecificSiteRoot({ root: local }, { homeDir: root }), /too broad/);
    const classifySiteDir = (dir: string) => fs.existsSync(path.join(dir, "config.json")) ? "site" as const : "empty" as const;
    assert.deepEqual(discoverSiteDirs({ scanRoots: workspace.roots({}), knownDirs: [], classifySiteDir }, { homeDir: root, sitesHome: workspace.home({}) }), [path.join(parent, "alpha"), path.join(workspace.home({}), "sites", "beta")]);
    assert.throws(() => discoverSiteDirs({ scanRoots: [local], knownDirs: [], classifySiteDir }, { homeDir: root, sitesHome: workspace.home({}) }), /too broad/);
    const fallback = createSitesWorkspace({}, { homeDir: root, env: { TOVU_SITES_HOME: path.join(local, "sites") }, platform: "linux" });
    assert.deepEqual(discoverSiteDirs({ scanRoots: fallback.roots({}), knownDirs: [], classifySiteDir }, { homeDir: root, sitesHome: fallback.home({}) }), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("the selected local nested sites home permits scanning its Tovu parent", () => {
  const homeDir = isolatedCatalogHome;
  const root = path.join(homeDir, "Tovu");
  assert.doesNotThrow(() => assertSpecificSiteRoot({ root }, { homeDir, sitesHome: path.join(root, "sites") }));
  assert.throws(() => assertSpecificSiteRoot({ root }, { homeDir, sitesHome: path.join(homeDir, "Documents", "Tovu", "sites") }), /too broad/);
});

for (const oldOverride of ["documents", "local"]) test(`desktop retains sites when env selects the ${oldOverride} old home`, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sitesnest2-override-")));
  try {
    const home = oldOverride === "local" ? path.join(root, "Tovu") : path.join(root, "Documents", "Tovu");
    const dir = path.join(home, "alpha"); writeSite(dir, "alpha-id");
    const workspace = createSitesWorkspace({}, { homeDir: root, env: { TOVU_SITES_HOME: home }, platform: "linux" });
    shareSiteDirectories({ workspace, dirs: [dir], createdBy: "test" });
    const records = handleList({ sharedSites: workspace, projectsPath: path.join(root, "profile", "desktop-projects.json"),
      openSites: new Map(), repoRoot: root, readSiteName: () => "Alpha", readPreviewVersion: () => null });
    assert.equal(records.find((record) => record.installDir === dir)?.folderMissing, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
