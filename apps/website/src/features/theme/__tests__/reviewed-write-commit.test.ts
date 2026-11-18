import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runReviewedThemeFileWrite } from '../reviewed-write-commit.js';
import { readThemeFileVersion, writeThemeFile } from '../theme-files.js';

/** @file A reviewed write reports the version it committed, taken from its own temp file, never from a re-read. */

function themeFolder(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewed-write-'));
  const themeDir = path.join(root, 'copy');
  fs.mkdirSync(themeDir);
  fs.writeFileSync(path.join(themeDir, 'p.css'), 'old');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, themeDir, file: { themeDir, themesRoot: root, relativePath: 'p.css' } };
}

test('the committed version is the SHA-256 of the bytes the write published', async t => {
  const { file, themeDir } = themeFolder(t);
  const prepared = { file, ...readThemeFileVersion(file) };
  const { result, committedVersion } = await runReviewedThemeFileWrite({ prepared, run: async () => { writeThemeFile({ ...file, content: 'new' }); return 'handler result'; } });
  assert.equal(result, 'handler result');
  assert.equal(committedVersion, createHash('sha256').update('new').digest('hex'));
  assert.equal(committedVersion, readThemeFileVersion({ ...file, themeDir }).version);
});

test('a handler that writes nothing commits nothing', async t => {
  const { file } = themeFolder(t);
  const prepared = { file, ...readThemeFileVersion(file) };
  const { committedVersion } = await runReviewedThemeFileWrite({ prepared, run: async () => 'no write' });
  assert.equal(committedVersion, undefined);
});

test('a write that fails the pin commits nothing and the error propagates', async t => {
  const { file } = themeFolder(t);
  const prepared = { file, ...readThemeFileVersion(file) };
  fs.writeFileSync(path.join(file.themeDir, 'p.css'), 'foreign');
  await assert.rejects(runReviewedThemeFileWrite({ prepared, run: async () => { writeThemeFile({ ...file, content: 'new' }); } }), /changed after it was read/);
  assert.equal(fs.readFileSync(path.join(file.themeDir, 'p.css'), 'utf8'), 'foreign');
});

test('a write outside any reviewed scope behaves as before', t => {
  const { file } = themeFolder(t);
  writeThemeFile({ ...file, content: 'plain' });
  assert.equal(fs.readFileSync(path.join(file.themeDir, 'p.css'), 'utf8'), 'plain');
});
