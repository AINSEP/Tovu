/** Add/Start must snapshot a copied site's external SQLite content before publishing its new ID. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { addSitePointer } from './add-site-pointer.ts';
import { handleAddSite, handleStart } from './project-ipc.ts';
import { createSitesWorkspace, shareSiteDirectories } from './shared-sites.ts';
import { trackSite, readTrackedSites } from './tracked-sites.ts';
import { createKeyedSerializer } from './keyed-serializer.ts';
import { createNodeAtomicFilesystem } from '@jini-ai/platform/fs';

const ID = '11111111-1111-4111-8111-111111111111';
function fixture(t: test.TestContext, linked: boolean) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'copied-external-db-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: root, cwd: root, env: {}, platform: 'linux', appDataDir: path.join(root, 'profile') });
  workspace.updateConfig({ patch: { databases: 'appData' } });
  const original = path.join(root, 'original'), copy = path.join(root, 'copy'), projectsPath = path.join(root, 'projects.json');
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, 'config.json'), JSON.stringify({ name: 'Original' }));
  fs.writeFileSync(path.join(original, '.site-meta.json'), JSON.stringify({ siteId: ID, schemaVersion: 58, siteKeyId: 'retained-key' }));
  const sourcePath = linked ? path.join(root, 'external', 'content.db') : workspace.databasePath({ dir: original, id: ID, filename: 'content.db' });
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  const source = new DatabaseSync(sourcePath);
  t.after(() => { if (source.isOpen) source.close(); });
  source.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE posts(title TEXT); INSERT INTO posts VALUES ('committed in WAL')");
  if (linked) fs.symlinkSync(sourcePath, path.join(original, 'content.db'));
  shareSiteDirectories({ workspace, dirs: [original], createdBy: 'Desktop' });
  fs.cpSync(original, copy, { recursive: true });
  return { root, workspace, original, copy, source, sourcePath, projectsPath };
}

for (const linked of [false, true]) {
  test(`Add copied folder with ${linked ? 'symlinked' : 'app-data'} database preserves WAL content in an independent database`, async (t) => {
    const f = fixture(t, linked);
    const before = fs.readFileSync(path.join(f.original, '.site-meta.json'));
    const added = await handleAddSite({ sharedSites: f.workspace, projectsPath: f.projectsPath, repoRoot: f.root,
      openSites: new Map(), readSiteName: () => 'Original', readPreviewVersion: () => null, addSitePointer,
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [f.copy] }) } });
    assert.equal(added!.installDir, f.copy);
    const meta = JSON.parse(fs.readFileSync(path.join(f.copy, '.site-meta.json'), 'utf8'));
    const copiedPath = f.workspace.databasePath({ dir: f.copy, id: meta.siteId, filename: 'content.db' });
    assert.equal(fs.existsSync(copiedPath), true, 'the copy must retain the original content');
    assert.notEqual(fs.realpathSync(copiedPath), fs.realpathSync(f.sourcePath), 'the copy must own its database');
    const copied = new DatabaseSync(copiedPath);
    try {
      assert.deepEqual(copied.prepare('SELECT title FROM posts').all().map(row => row.title), ['committed in WAL']);
      copied.exec("INSERT INTO posts VALUES ('copy only')");
      assert.equal(f.source.prepare('SELECT count(*) AS n FROM posts').get()!.n, 1);
    } finally { copied.close(); }
    assert.notEqual(meta.siteId, ID);
    assert.equal(meta.siteKeyId, 'retained-key');
    assert.deepEqual(fs.readFileSync(path.join(f.original, '.site-meta.json')), before);
    addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.copy, '.site-meta.json'), 'utf8')).siteId, meta.siteId);
  });
}

test('Start of a legacy-tracked app-data copy snapshots its content before the server opens it', async (t) => {
  const f = fixture(t, false);
  trackSite(f.projectsPath, f.copy);
  await handleStart(f.copy, {
    sharedSites: f.workspace, projectsPath: f.projectsPath, repoRoot: f.root, openSites: new Map(),
    serializer: createKeyedSerializer(), ctx: {}, readSiteName: () => 'Original', readPreviewVersion: () => null,
    openSiteServer: async () => {
      const meta = JSON.parse(fs.readFileSync(path.join(f.copy, '.site-meta.json'), 'utf8'));
      const copiedPath = f.workspace.databasePath({ dir: f.copy, id: meta.siteId, filename: 'content.db' });
      assert.equal(fs.existsSync(copiedPath), true, 'Start must not boot an empty copy');
      assert.notEqual(copiedPath, f.sourcePath);
    },
  });
});

test('an unreadable external database refuses Add without changing identity or tracking the copy', (t) => {
  const f = fixture(t, false);
  f.source.close();
  fs.writeFileSync(f.sourcePath, 'not a SQLite database');
  const before = fs.readFileSync(path.join(f.copy, '.site-meta.json'));
  assert.throws(() => addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace }), /copied website could not start/);
  assert.deepEqual(fs.readFileSync(path.join(f.copy, '.site-meta.json')), before);
  assert.deepEqual(readTrackedSites(f.projectsPath), []);
});

test('a linked data.nosync directory gives the copy independent content and chat databases', (t) => {
  const f = fixture(t, true);
  const chatPath = path.join(path.dirname(f.sourcePath), 'chat.db');
  const chat = new DatabaseSync(chatPath);
  try { chat.exec("CREATE TABLE messages(body TEXT); INSERT INTO messages VALUES ('copied history')"); } finally { chat.close(); }
  fs.unlinkSync(path.join(f.copy, 'content.db'));
  fs.symlinkSync(path.dirname(f.sourcePath), path.join(f.copy, 'data.nosync'), 'junction');
  addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });
  const meta = JSON.parse(fs.readFileSync(path.join(f.copy, '.site-meta.json'), 'utf8'));
  for (const [filename, table, expected] of [['content.db', 'posts', 'committed in WAL'], ['chat.db', 'messages', 'copied history']]) {
    const dbPath = f.workspace.databasePath({ dir: f.copy, id: meta.siteId, filename });
    assert.notEqual(fs.realpathSync(dbPath), fs.realpathSync(path.join(path.dirname(f.sourcePath), filename)));
    const db = new DatabaseSync(dbPath);
    try { assert.equal(Object.values(db.prepare(`SELECT * FROM ${table}`).get()!)[0], expected); } finally { db.close(); }
  }
  assert.equal(fs.existsSync(path.join(f.copy, 'data.nosync')), false);
  assert.equal(f.source.prepare('SELECT count(*) AS n FROM posts').get()!.n, 1);
});

test('failed marker commit restores copied database links and removes its provisional snapshots', (t) => {
  const f = fixture(t, true);
  const before = fs.readFileSync(path.join(f.copy, '.site-meta.json'));
  const filesystem = { ...createNodeAtomicFilesystem({}), rename: () => { throw new Error('marker replacement denied'); } };
  assert.throws(() => addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace, filesystem }), /copied website could not start/);
  assert.deepEqual(fs.readFileSync(path.join(f.copy, '.site-meta.json')), before);
  assert.equal(fs.readlinkSync(path.join(f.copy, 'content.db')), f.sourcePath);
  assert.deepEqual(fs.readdirSync(f.copy).sort(), fs.readdirSync(f.original).sort());
  assert.deepEqual(fs.readdirSync(path.join(f.workspace.config({}).appData, 'databases')), []);
  assert.deepEqual(readTrackedSites(f.projectsPath), []);
});
