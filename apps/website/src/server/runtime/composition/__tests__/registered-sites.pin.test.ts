import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSitesWorkspace } from '#src/platform/site-dir/sites-home';
import { resolveSiteDatabasePaths } from '#src/platform/site-dir/site-databases';
import { registeredSources } from '../registered-sites.js';

function fixture({ t }: { t: { after(callback: () => unknown): void } }, _options = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'L058b-sites-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const base = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: path.join(home, 'app') });
  const registry = base.registry({});
  const entries: ReturnType<typeof registry.list> = [];
  const workspace = { ...base, registry: () => ({ ...registry, list: () => entries }) };
  const add = ({ id, siteId = id, name = id }: { id: string; siteId?: unknown; name?: string }, _options = {}) => {
    const dir = path.join(home, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.site-meta.json'), JSON.stringify({ siteId, storage: { kind: 'sqlite' } }));
    entries.push({ id, name, path: dir, createdBy: 'pin', lastOpened: null });
    return dir;
  };
  const targetSiteDir = add({ id: 'target' });
  const list = ({ targetFile }: { targetFile?: string } = {}, _options = {}) => registeredSources({ workspace, targetSiteDir, targetSiteId: 'target', targetFile });
  const database = ({ dir }: { dir: string }, _options = {}) => {
    const file = resolveSiteDatabasePaths({ dir }, { workspace, reserveIdentity: false }).contentDbPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'database fixture');
    return file;
  };
  return { home, entries, workspace, add, list, database, targetSiteDir };
}

test('L058b registry scanning skips invalid folders and metadata while preserving order and labels', t => {
  const f = fixture({ t });
  const first = f.add({ id: 'first', name: 'First label' });
  const second = f.add({ id: 'second' });
  f.add({ id: 'empty', siteId: '' });
  f.add({ id: 'numeric', siteId: 42 });
  const corrupt = f.add({ id: 'corrupt' });
  fs.writeFileSync(path.join(corrupt, '.site-meta.json'), '{');
  const noMeta = f.add({ id: 'no-meta' });
  fs.unlinkSync(path.join(noMeta, '.site-meta.json'));
  const missing = f.add({ id: 'missing' });
  fs.rmSync(missing, { recursive: true });
  const plainFile = f.add({ id: 'plain-file' });
  fs.rmSync(plainFile, { recursive: true });
  fs.writeFileSync(plainFile, 'file');
  const trashed = path.join(f.home, 'site-trash', 'trashed');
  fs.mkdirSync(trashed, { recursive: true });
  fs.writeFileSync(path.join(trashed, '.site-meta.json'), JSON.stringify({ siteId: 'trashed' }));
  f.entries.push({ id: 'trashed', name: 'Trashed', path: trashed, createdBy: 'pin', lastOpened: null });
  assert.deepEqual(f.list(), [
    { siteId: 'first', registeredId: 'first', name: 'First label', dir: first },
    { siteId: 'second', registeredId: 'second', name: 'second', dir: second },
  ]);
});

test('L058b excludes mismatched identities, both collision sides, target ids and canonical target folders', t => {
  const f = fixture({ t });
  const healthy = f.add({ id: 'healthy' });
  f.add({ id: 'mismatch', siteId: 'elsewhere' });
  f.add({ id: 'duplicate' });
  f.add({ id: 'copy', siteId: 'duplicate' });
  const aliased = f.add({ id: 'aliased' });
  const alias = path.join(f.home, 'alias');
  fs.symlinkSync(aliased, alias);
  f.entries.push({ id: 'alias', name: 'Alias', path: alias, createdBy: 'pin', lastOpened: null });
  assert.deepEqual(f.list().map(source => source.dir), [healthy]);
  assert.deepEqual(registeredSources({ workspace: f.workspace, targetSiteDir: healthy, targetSiteId: 'other', targetFile: undefined }), [
    { siteId: 'target', registeredId: 'target', name: 'target', dir: f.targetSiteDir },
  ]);
});

test('L058b database probes keep missing sources and memory targets, reject shared inodes and fail closed on unreadable targets', t => {
  const f = fixture({ t });
  const source = f.add({ id: 'source' });
  assert.equal(f.list({ targetFile: path.join(f.home, 'absent') }).length, 1);
  const sourceFile = f.database({ dir: source });
  assert.equal(f.list().length, 1);
  assert.equal(f.list({ targetFile: ':memory:' }).length, 1);
  const targetFile = f.database({ dir: f.targetSiteDir });
  assert.equal(f.list({ targetFile }).length, 1);
  assert.deepEqual(f.list({ targetFile: path.join(f.home, 'absent') }), []);
  fs.unlinkSync(sourceFile);
  fs.linkSync(targetFile, sourceFile);
  assert.deepEqual(f.list({ targetFile }), []);
  fs.unlinkSync(sourceFile);
  fs.symlinkSync(targetFile, sourceFile);
  assert.deepEqual(f.list({ targetFile }), []);
});

test('L058b a missing target folder still propagates its canonicalization error', t => {
  const f = fixture({ t });
  fs.rmSync(f.targetSiteDir, { recursive: true });
  assert.throws(() => f.list(), { code: 'ENOENT' });
});
