/** Persisted Tovu discovery roots reuse the durable JSON owner and survive MRU/card changes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSiteFolders } from './site-folders.ts';

function fixture(t: test.TestContext) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-site-folders-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const statePath = path.join(dir, 'profile', 'desktop-state.json');
  const root = path.join(dir, 'Documents', 'sites');
  fs.mkdirSync(root, { recursive: true });
  return { dir, root, statePath };
}

test('creation roots and extra roots persist beside the MRU without changing it', (t) => {
  const { dir, root, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath));
  const mru = '{"recentSiteDirs":["/existing/site"]}';
  fs.writeFileSync(statePath, mru);
  const folders = createSiteFolders({ statePath, defaultRoots: ['/repo/sites'] });
  folders.rememberCreated({ siteDir: path.join(root, 'created') });
  const extra = path.join(dir, 'Documents', 'extra');
  fs.mkdirSync(extra);
  folders.add({ root: extra });
  const restarted = createSiteFolders({ statePath, defaultRoots: ['/repo/sites'] });
  assert.deepEqual(restarted.read({}), { roots: ['/repo/sites', root, extra], extraRoots: [extra] });
  restarted.remove({ root: extra });
  assert.deepEqual(folders.read({}), { roots: ['/repo/sites', root], extraRoots: [] });
  assert.equal(fs.readFileSync(statePath, 'utf8'), mru);
});

test('home is omitted when unset and read once when supplied', (t) => {
  const { root, statePath } = fixture(t);
  assert.deepEqual(createSiteFolders({ statePath, defaultRoots: [] }).read({}), { roots: [], extraRoots: [] });
  let reads = 0;
  const folders = createSiteFolders({ statePath, defaultRoots: [], home: () => { reads++; return root; } });
  assert.deepEqual(folders.read({}), { home: root, roots: [root], extraRoots: [] });
  assert.equal(reads, 1);
  assert.deepEqual(createSiteFolders({ statePath, defaultRoots: [], home: () => '' }).read({}), { roots: [], extraRoots: [] });
});

test('broad filesystem, home and volume roots are refused by both settings adapters before saving', async (t) => {
  const { dir, statePath } = fixture(t);
  const folders = createSiteFolders({ statePath, defaultRoots: [] });
  const { createSitesWorkspace } = await import('./shared-sites.ts');
  const workspace = createSitesWorkspace({}, { homeDir: dir, env: {}, cwd: dir, platform: 'linux', sourceRoots: [] });
  const shared = createSiteFolders({ statePath, defaultRoots: [], workspace });
  for (const adapter of [folders, shared]) {
    for (const root of ['/', adapter === shared ? dir : os.homedir(), '~', '/Volumes', '/Volumes/Remote', '\\\\server\\share', 'C:\\']) {
      assert.throws(() => adapter.add({ root }), {
        message: `Sites folder is too broad: ${root}. Choose a specific folder containing your Tovu websites.`,
      });
    }
  }
  assert.deepEqual(folders.read({}), { roots: [], extraRoots: [] });
  assert.deepEqual(shared.read({}).extraRoots, []);
  assert.equal(fs.existsSync(path.join(path.dirname(statePath), 'desktop-site-folders.json')), false);
});

test('a symlink to the home directory cannot bypass the broad-root refusal', (t) => {
  const { dir, statePath } = fixture(t), alias = path.join(dir, 'home-alias');
  fs.symlinkSync(os.homedir(), alias, 'dir');
  assert.throws(() => createSiteFolders({ statePath, defaultRoots: [] }).add({ root: alias }), {
    message: `Sites folder is too broad: ${fs.realpathSync(os.homedir())}. Choose a specific folder containing your Tovu websites.`,
  });
});

test('legacy creation rows contribute parent roots and aliases never duplicate them', (t) => {
  const { dir, root, statePath } = fixture(t);
  const alias = path.join(dir, 'alias');
  fs.symlinkSync(root, alias, 'dir');
  const folders = createSiteFolders({ statePath, defaultRoots: [root], createdSiteDirs: () => [path.join(alias, 'old-site')] });
  folders.add({ root: alias });
  assert.deepEqual(folders.read({}), { roots: [root], extraRoots: [root] });
  folders.remove({ root });
  assert.deepEqual(folders.read({}), { roots: [root], extraRoots: [] });
});

test('a missing saved extra root remains visible and removable', (t) => {
  const { root, statePath } = fixture(t);
  const folders = createSiteFolders({ statePath, defaultRoots: [] });
  folders.add({ root });
  fs.rmdirSync(root);
  assert.deepEqual(folders.read({}).roots, [root]);
  folders.remove({ root });
  assert.deepEqual(folders.read({}).roots, []);
});

test('adding a regular file reports the real folder error and saves nothing', (t) => {
  const { dir, statePath } = fixture(t);
  const file = path.join(dir, 'file');
  fs.writeFileSync(file, '');
  const folders = createSiteFolders({ statePath, defaultRoots: [] });
  assert.throws(() => folders.add({ root: file }), { message: `Sites folder is not a directory: ${file}` });
  assert.deepEqual(folders.read({}), { roots: [], extraRoots: [] });
});

test('damaged settings do not block default discovery and are preserved before the next change', (t) => {
  const { root, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath));
  const damagedPath = path.join(path.dirname(statePath), 'desktop-site-folders.json');
  fs.writeFileSync(damagedPath, '{broken');
  const folders = createSiteFolders({ statePath, defaultRoots: ['/repo/sites'] });
  assert.deepEqual(folders.read({}).roots, ['/repo/sites']);
  folders.add({ root });
  const backup = fs.readdirSync(path.dirname(statePath)).find((name) => name.startsWith('desktop-site-folders.json.corrupt-'));
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(path.dirname(statePath), backup), 'utf8'), '{broken');
  assert.deepEqual(folders.read({}).extraRoots, [root]);
});

test('desktop imports profile roots once and edits the shared web config without further legacy writes', async (t) => {
  const { createSitesWorkspace } = await import('./shared-sites.ts');
  const { dir, root, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const legacy = path.join(path.dirname(statePath), 'desktop-site-folders.json');
  const bytes = JSON.stringify({ creationRoots: [root], extraRoots: [] }); fs.writeFileSync(legacy, bytes);
  const options = { homeDir: dir, cwd: dir, env: {}, platform: 'linux' as const, sourceRoots: [] };
  const web = createSitesWorkspace({}, options), desktop = createSitesWorkspace({}, options);
  const folders = createSiteFolders({ statePath, defaultRoots: ['/unused'], workspace: desktop });
  assert.deepEqual(web.config({}).siteRoots, [root]);
  const extra = path.join(dir, 'Documents', 'extra'); fs.mkdirSync(extra); folders.add({ root: extra });
  assert.deepEqual(web.config({}).siteRoots, [root, extra]);
  web.updateConfig({ patch: { databases: 'appData', sitesHome: path.join(dir, 'new-home') } });
  assert.equal(folders.read({}).databases, 'appData'); assert.equal(folders.read({}).home, path.join(dir, 'new-home'));
  folders.remove({ root });
  createSiteFolders({ statePath, defaultRoots: [], workspace: createSitesWorkspace({}, options) });
  assert.deepEqual(web.config({}).siteRoots, [extra]);
  assert.equal(fs.readFileSync(legacy, 'utf8'), bytes); assert.equal(fs.existsSync(statePath), false);
});

test("damaged legacy settings cannot stop shared discovery and are quarantined before marking import", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, statePath } = fixture(t); fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const legacy = path.join(path.dirname(statePath), "desktop-site-folders.json"); fs.writeFileSync(legacy, "{broken");
  const workspace = createSitesWorkspace({}, { homeDir: dir, cwd: dir, env: {}, platform: "linux", sourceRoots: [] });
  const folders = createSiteFolders({ statePath, defaultRoots: [], workspace });
  assert.deepEqual(folders.read({}).extraRoots, []);
  assert.equal(workspace.registry({}).hasMigration({ migration: "desktop-roots-config-v1" }), true);
  const backup = fs.readdirSync(path.dirname(legacy)).find((name) => name.startsWith("desktop-site-folders.json.corrupt-"));
  assert.ok(backup); assert.equal(fs.readFileSync(path.join(path.dirname(legacy), backup), "utf8"), "{broken");
});


test("deskfx S2: default/home roots never become removable extras and last removal restores implicit config", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, root, statePath } = fixture(t);
  const workspace = createSitesWorkspace({}, { homeDir: dir, env: {}, cwd: dir, platform: "linux", sourceRoots: [root] });
  workspace.updateConfig({ patch: { databases: "appData" } });
  const before = fs.readFileSync(workspace.config({}).configPath, "utf8");
  const folders = createSiteFolders({ statePath, defaultRoots: [root], workspace });
  assert.deepEqual(folders.read({}).extraRoots, []);
  const extra = path.join(dir, "Documents", "extra"); fs.mkdirSync(extra);
  folders.add({ root: extra }); folders.add({ root: root });
  assert.deepEqual(folders.read({}).extraRoots, [extra]);
  assert.deepEqual(JSON.parse(fs.readFileSync(workspace.config({}).configPath, "utf8")).siteRoots, [extra]);
  folders.remove({ root: extra });
  assert.equal(fs.readFileSync(workspace.config({}).configPath, "utf8"), before);
  assert.ok(folders.read({}).roots.includes(root)); assert.ok(folders.read({}).roots.includes(workspace.home({})));
  assert.deepEqual(folders.read({}).extraRoots, []);
});

test("deskfx S3: refuses user collection roots but allows a specific sites home", async (t) => {
  const { assertSpecificSiteRoot } = await import("./site-scan-policy.ts");
  const { dir } = fixture(t); const homeDir = path.join(dir, "owner");
  for (const root of ["/Users", "/home", homeDir, "~", "~/Documents", "~/Downloads", "~/Desktop", ...["Documents", "Downloads", "Desktop", "Pictures", "Music", "Library"].map((name) => path.join(homeDir, name))]) {
    assert.throws(() => assertSpecificSiteRoot({ root }, { homeDir }), /Sites folder is too broad/);
  }
  assert.doesNotThrow(() => assertSpecificSiteRoot({ root: path.join(homeDir, "Documents", "Tovu") }, { homeDir }));
});


test("deskfx S2: removing the only extra restores a previously absent shared config file", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, root, statePath } = fixture(t);
  const workspace = createSitesWorkspace({}, { homeDir: dir, env: {}, cwd: dir, platform: "linux", sourceRoots: [root] });
  const folders = createSiteFolders({ statePath, defaultRoots: [root], workspace });
  const file = workspace.config({}).configPath; assert.equal(fs.existsSync(file), false);
  const extra = path.join(dir, "Documents", "extra"); fs.mkdirSync(extra);
  folders.add({ root: extra }); assert.equal(fs.existsSync(file), true);
  folders.remove({ root: extra }); assert.equal(fs.existsSync(file), false);
  assert.deepEqual(folders.read({}).extraRoots, []); assert.ok(folders.read({}).roots.includes(root));
});

test("shared settings: the one-time import also adopts the parent folders of sites this app created", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, root, statePath } = fixture(t);
  const options = { homeDir: dir, cwd: dir, env: {}, platform: "linux" as const, sourceRoots: [] };
  const workspace = createSitesWorkspace({}, options);
  createSiteFolders({ statePath, defaultRoots: [], workspace, createdSiteDirs: () => [path.join(root, "made-here")] });
  assert.deepEqual(createSitesWorkspace({}, options).config({}).siteRoots, [root]);
  assert.equal(workspace.registry({}).hasMigration({ migration: "desktop-roots-config-v1" }), true);
});

test("shared settings: an import that cannot complete warns, keeps the port usable, and retries next boot", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, root, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(statePath), "desktop-site-folders.json"), JSON.stringify({ creationRoots: [root], extraRoots: [] }));
  const real = createSitesWorkspace({}, { homeDir: dir, cwd: dir, env: {}, platform: "linux", sourceRoots: [] });
  // The real workspace, except that saving the imported roots fails (e.g. a locked or full disk).
  const workspace = { ...real, updateRoots: () => { throw new Error("settings write failed"); } };
  const warn = t.mock.method(console, "warn", () => {});
  const folders = createSiteFolders({ statePath, defaultRoots: [], workspace });
  assert.deepEqual(warn.mock.calls.map((entry) => entry.arguments), [["tovu desktop: legacy sites folder import could not complete; using shared settings and retrying next boot."]]);
  assert.equal(workspace.registry({}).hasMigration({ migration: "desktop-roots-config-v1" }), false, "not marked, so the next boot retries");
  assert.equal(typeof folders.add, "function");
});

test("shared settings: adding a regular file reports the real folder error and saves nothing", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, statePath } = fixture(t);
  const file = path.join(dir, "Documents", "not-a-folder");
  fs.writeFileSync(file, "");
  const options = { homeDir: dir, cwd: dir, env: {}, platform: "linux" as const, sourceRoots: [] };
  const folders = createSiteFolders({ statePath, defaultRoots: [], workspace: createSitesWorkspace({}, options) });
  assert.throws(() => folders.add({ root: file }), { message: `Sites folder is not a directory: ${file}` });
  assert.deepEqual(createSitesWorkspace({}, options).config({}).siteRoots, []);
});

test("shared settings: a created site's folder is remembered once, and never when it is already a root", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, root, statePath } = fixture(t);
  const options = { homeDir: dir, cwd: dir, env: {}, platform: "linux" as const, sourceRoots: [] };
  const folders = createSiteFolders({ statePath, defaultRoots: [], workspace: createSitesWorkspace({}, options) });
  folders.rememberCreated({ siteDir: path.join(root, "first") });
  assert.deepEqual(createSitesWorkspace({}, options).config({}).siteRoots, [root]);
  const configPath = createSitesWorkspace({}, options).config({}).configPath;
  const before = fs.readFileSync(configPath, "utf8");
  folders.rememberCreated({ siteDir: path.join(root, "second") });
  assert.equal(fs.readFileSync(configPath, "utf8"), before, "an existing root is not rewritten");
});

test("damaged settings that cannot be preserved block the change and keep the damaged bytes", (t) => {
  const { root, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath));
  const damagedPath = path.join(path.dirname(statePath), "desktop-site-folders.json");
  fs.writeFileSync(damagedPath, "{broken");
  const folders = createSiteFolders({ statePath, defaultRoots: [] }, { quarantine: () => false });
  assert.throws(() => folders.add({ root }), { message: `Could not preserve damaged sites folders settings at ${damagedPath}. Nothing was saved.` });
  assert.equal(fs.readFileSync(damagedPath, "utf8"), "{broken");
});

test("shared settings: damaged legacy bytes that cannot be preserved leave the import unmarked for a retry", async (t) => {
  const { createSitesWorkspace } = await import("./shared-sites.ts");
  const { dir, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const legacy = path.join(path.dirname(statePath), "desktop-site-folders.json");
  fs.writeFileSync(legacy, "{broken");
  const warn = t.mock.method(console, "warn", () => {});
  const workspace = createSitesWorkspace({}, { homeDir: dir, cwd: dir, env: {}, platform: "linux", sourceRoots: [] });
  createSiteFolders({ statePath, defaultRoots: [], workspace }, { quarantine: () => false });
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(workspace.registry({}).hasMigration({ migration: "desktop-roots-config-v1" }), false);
  assert.equal(fs.readFileSync(legacy, "utf8"), "{broken");
});
