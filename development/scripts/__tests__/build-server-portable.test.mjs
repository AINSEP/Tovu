import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, stageServerRuntimeAssets } from '../build-server.mjs';

test('asset-only refresh replaces stale plugin catalogs without invoking a compiler', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'tovu-plugin-catalog-'));
  try {
    for (const dir of ['templates', 'themes', 'agent-plugins', 'public']) mkdirSync(path.join(repoRoot, 'content', dir), { recursive: true });
    mkdirSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle'), { recursive: true });
    mkdirSync(path.join(repoRoot, 'dist/content/agent-plugins/tovuize-site'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'dist/content/agent-plugins/tovuize-site/plugin.json'), 'retired');
    for (const id of ['site-import', 'tovu-theme', 'how-tovu-works']) {
      mkdirSync(path.join(repoRoot, 'content/agent-plugins', id, 'skills', id), { recursive: true });
      writeFileSync(path.join(repoRoot, 'content/agent-plugins', id, 'plugin.json'), id);
      writeFileSync(path.join(repoRoot, 'content/agent-plugins', id, 'skills', id, 'SKILL.md'), `# ${id}`);
    }
    stageServerRuntimeAssets({ repoRoot });
    assert.equal(existsSync(path.join(repoRoot, 'dist/content/agent-plugins/tovuize-site')), false);
    for (const id of ['site-import', 'tovu-theme', 'how-tovu-works']) {
      assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins', id, 'plugin.json'), 'utf8'), id);
      assert.equal(readFileSync(path.join(repoRoot, 'dist/content/agent-plugins', id, 'skills', id, 'SKILL.md'), 'utf8'), `# ${id}`);
    }
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test('portable build clears stale sources, runs compilers in order, and copies hidden content files', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'tovu-build-server-'));
  try {
    for (const dir of ['templates', 'themes', 'agent-plugins', 'public']) {
      mkdirSync(path.join(repoRoot, 'content', dir), { recursive: true });
      writeFileSync(path.join(repoRoot, 'content', dir, '.asset'), dir);
    }
    mkdirSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'apps/website/src/platform/db/drizzle/fixture.sql'), '-- fixture only');
    mkdirSync(path.join(repoRoot, 'dist/src'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'dist/src/stale.js'), 'old');
    const calls = [];
    buildServer({ repoRoot }, { npmCli: '/fake/npm-cli.js', tscCli: '/fake/tsc', runNode: ({ args }) => {
      calls.push(args);
      if (args[0] === '/fake/tsc') {
        assert.equal(existsSync(path.join(repoRoot, 'dist/src/stale.js')), false);
        mkdirSync(path.join(repoRoot, 'dist/src'), { recursive: true });
        writeFileSync(path.join(repoRoot, 'dist/src/new.js'), 'new');
      }
    } });
    assert.deepEqual(calls, [
      ['/fake/npm-cli.js', 'run', 'build', '--workspace=@tovu/sdk'],
      ['/fake/tsc', '-p', 'tsconfig.json'],
      [path.join(repoRoot, 'development/scripts/emit-dist-package-json.mjs')],
    ]);
    for (const dir of ['templates', 'themes', 'agent-plugins', 'public']) {
      assert.equal(readFileSync(path.join(repoRoot, 'dist/content', dir, '.asset'), 'utf8'), dir);
    }
    assert.equal(readFileSync(path.join(repoRoot, 'dist/src/platform/db/drizzle/fixture.sql'), 'utf8'), '-- fixture only');
    assert.equal(existsSync(path.join(repoRoot, 'dist/src/new.js')), true);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});

test('compiler failure stops the build before metadata emission and asset staging', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'tovu-build-fail-'));
  const calls = [];
  try {
    assert.throws(() => buildServer({ repoRoot }, { npmCli: '/fake/npm-cli.js', tscCli: '/fake/tsc', runNode: ({ args }) => {
      calls.push(args); if (args[0] === '/fake/tsc') throw new Error('compiler failed');
    } }), /compiler failed/);
    assert.equal(calls.length, 2);
    assert.equal(existsSync(path.join(repoRoot, 'dist/content')), false);
  } finally { rmSync(repoRoot, { recursive: true, force: true }); }
});
