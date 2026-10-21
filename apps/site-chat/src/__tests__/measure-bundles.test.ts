/** `scripts/measure-bundles.mjs`: per-asset raw/gzip sizes, widget totals, and the loader budget. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

import { ASSETS, LOADER_GZIP_BUDGET, assertLoaderBudget, isEntryPoint, main, measureBundles } from '../../scripts/measure-bundles.mjs';

const text = (name: string) => Buffer.from(`/* ${name} */ ${'x'.repeat(name.length * 10)}`);

test('every asset gets its raw and gzip size, then the two widget totals', () => {
  const rows = measureBundles({ read: text });
  assert.deepEqual(rows.slice(0, ASSETS.length).map((row) => row.asset), ASSETS);
  for (const row of rows.slice(0, ASSETS.length)) {
    assert.equal(row.raw, text(row.asset).length);
    assert.equal(row.gzip, gzipSync(text(row.asset), { level: 9 }).length);
  }
  const byName = new Map(rows.map((row) => [row.asset, row]));
  const sum = (names: string[], key: 'raw' | 'gzip') => names.reduce((total, name) => total + byName.get(name)![key], 0);
  assert.deepEqual(byName.get('vanilla JS+CSS'), { asset: 'vanilla JS+CSS',
    raw: sum(['site-assistant-vanilla.js', 'site-assistant-vanilla.css'], 'raw'), gzip: sum(['site-assistant-vanilla.js', 'site-assistant-vanilla.css'], 'gzip') });
  assert.deepEqual(byName.get('React JS+CSS'), { asset: 'React JS+CSS',
    raw: sum(['site-assistant.js', 'site-assistant.css'], 'raw'), gzip: sum(['site-assistant.js', 'site-assistant.css'], 'gzip') });
});

test('the loader budget passes below 3 KB gzip and fails at it', () => {
  assertLoaderBudget({ rows: [{ asset: 'site-assistant-loader.js', raw: 1, gzip: LOADER_GZIP_BUDGET - 1 }] });
  assert.throws(() => assertLoaderBudget({ rows: [{ asset: 'site-assistant-loader.js', raw: 1, gzip: LOADER_GZIP_BUDGET }] }), /exceeds the 3 KB gzip budget/);
});

test('main reads each asset from the dist directory, prints the table, then enforces the budget', () => {
  const reads: string[] = [];
  const tables: unknown[] = [];
  const rows = main({ distDir: '/built' }, { readFile: (file) => { reads.push(file); return text(path.basename(file)); }, table: (r) => void tables.push(r) });
  assert.deepEqual(reads, ASSETS.map((name) => path.join('/built', name)));
  assert.deepEqual(tables, [rows]);
  const huge = randomBytes(8000);
  const printed: unknown[] = [];
  assert.throws(() => main({ distDir: '/built' }, { readFile: () => huge, table: (r) => void printed.push(r) }), /3 KB/);
  assert.equal(printed.length, 1, 'the table is printed before the budget fails the run');
});

test('run as a script against a dist directory, it prints the table; a missing dist fails', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'measure-bundles-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ASSETS) writeFileSync(path.join(dir, name), text(name));
  const script = path.resolve(import.meta.dirname, '../../scripts/measure-bundles.mjs');
  const env = { ...process.env, NODE_OPTIONS: '' };
  const ok = spawnSync(process.execPath, [script, dir], { encoding: 'utf8', env });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /site-assistant-loader\.js/);
  const missing = spawnSync(process.execPath, [script, path.join(dir, 'nope')], { encoding: 'utf8', env });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ENOENT/);
  const defaults = spawnSync(process.execPath, ['--input-type=module', '-e', `import { main } from ${JSON.stringify(pathToFileURL(script).href)}; try { main(); } catch (error) { console.error(error.path); }`], { encoding: 'utf8', env });
  // Built tree: the table prints. Unbuilt tree: the failed read names the package's own dist/.
  assert.match(defaults.stderr + defaults.stdout, /site-chat[\\/]dist[\\/]site-assistant-loader\.js|│ 0\s+│ 'site-assistant-loader\.js'/, 'the default dist directory is the package build output');
});

test('isEntryPoint is true only for the script node was started with', () => {
  const file = path.resolve('scripts/measure-bundles.mjs');
  assert.equal(isEntryPoint({ moduleUrl: pathToFileURL(file).href, argv1: file }), true);
  assert.equal(isEntryPoint({ moduleUrl: pathToFileURL(file).href, argv1: '/elsewhere.mjs' }), false);
  assert.equal(isEntryPoint({ moduleUrl: pathToFileURL(file).href, argv1: undefined }), false);
});
