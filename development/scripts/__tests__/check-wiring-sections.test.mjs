import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkWiringSections } from '../check-wiring-sections.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, 'fixtures/wiring-sections');
const SCRIPT = join(here, '../check-wiring-sections.mjs');
const FEATURES = 'apps/admin/src/features';

// The real inventory API, so these tests also pin how this check reads boundRoots, themeRoots and rows.
const inventoryApi = await import('../lib/extraction-inventory.mjs');

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/** Copies the fixture into a fresh git repo with one commit, plus a linked-style @jini-ai package. */
function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'wiring-sections-'));
  cpSync(FIXTURE, root, { recursive: true });
  // node_modules is gitignored in Tovu, so the fake @jini-ai package is written here, not checked in.
  const jini = join(root, 'node_modules/@jini-ai/fake/src');
  mkdirSync(jini, { recursive: true });
  writeFileSync(join(jini, 'index.ts'), 'export type SharedEngineKit = { run(): void };\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  git(root, 'init', '-q');
  git(root, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'add', '.');
  git(root, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-qm', 'base');
  return root;
}

const touch = (root, feature) => appendFileSync(join(root, FEATURES, feature, 'index.ts'), '// touched\n');
const folders = (findings) => findings.map((finding) => finding.folder.replace(`${FEATURES}/`, '')).sort();

function withRepo(run) {
  const root = fixtureRepo();
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('passes a touched folder whose Wiring section names existing ports', () => withRepo((root) => {
  touch(root, 'good-feature');
  const result = checkWiringSections({ root }, { inventoryApi, baseRef: 'HEAD' });
  assert.deepEqual(result.errors, []);
  assert.ok(result.checked.includes(`${FEATURES}/good-feature`), 'the bound folder must be checked, not skipped');
  assert.ok(!folders(result.warnings).includes('good-feature'));
}));

test('errors when a touched bound folder lacks a Wiring section', () => withRepo((root) => {
  // Committed rather than left in the working tree, so the base...HEAD diff path is what flags it.
  const base = git(root, 'rev-parse', 'HEAD');
  touch(root, 'no-wiring');
  git(root, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-qam', 'touch');
  const result = checkWiringSections({ root }, { inventoryApi, baseRef: base });
  assert.deepEqual(folders(result.errors), ['no-wiring']);
  assert.match(result.errors[0].reason, /no "## Wiring" section/);
}));

test('errors when the Wiring section names a port type that does not exist', () => withRepo((root) => {
  touch(root, 'bad-port');
  const result = checkWiringSections({ root }, { inventoryApi, baseRef: 'HEAD' });
  assert.deepEqual(folders(result.errors), ['bad-port']);
  assert.deepEqual(result.errors[0].missing, ['BadPortGhostPort']);
}));

test('only warns for an untouched folder without a Wiring section', () => withRepo((root) => {
  const result = checkWiringSections({ root }, { inventoryApi, baseRef: 'HEAD' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(folders(result.warnings), ['bad-port', 'mixed-feature', 'no-wiring', 'rooted']);
}));

test('ignores host-owned and theme folders', () => withRepo((root) => {
  touch(root, 'host-feature');
  touch(root, 'admin-themes');
  touch(root, 'skin');
  const result = checkWiringSections({ root }, { inventoryApi, baseRef: 'HEAD' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checked.map((folder) => folder.replace(`${FEATURES}/`, '')).sort(),
    ['bad-port', 'good-feature', 'mixed-feature', 'no-wiring', 'rooted']);
}));

test('exits 1 with a clear message when the inventory is missing', () => withRepo((root) => {
  rmSync(join(root, 'development/boundaries/extraction-inventory.json'));
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /extraction inventory not found/);
}));
