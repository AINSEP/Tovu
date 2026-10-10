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
  const root = path.join(dir, 'sites');
  fs.mkdirSync(root);
  return { dir, root, statePath };
}

test('creation roots and extra roots persist beside the MRU without changing it', (t) => {
  const { dir, root, statePath } = fixture(t);
  fs.mkdirSync(path.dirname(statePath));
  const mru = '{"recentSiteDirs":["/existing/site"]}';
  fs.writeFileSync(statePath, mru);
  const folders = createSiteFolders({ statePath, defaultRoots: ['/repo/sites'] });
  folders.rememberCreated({ siteDir: path.join(root, 'created') });
  const extra = path.join(dir, 'extra');
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
    for (const root of ['/', os.homedir(), '~', '/Volumes', '/Volumes/Remote', '\\\\server\\share', 'C:\\']) {
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
  const extra = path.join(dir, 'extra'); fs.mkdirSync(extra); folders.add({ root: extra });
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
