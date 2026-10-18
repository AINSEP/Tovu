import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runJiniRebuild } from '../codex-jini-rebuild.mjs';

// C: exercise the real porcelain reader, snapshots and selection with fake process calls.
// Removing source/status comparison, reversing build order or counting __tests__ must fail.
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'jini-rebuild-test-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, 'packages'));
  const snapshotFile = path.join(repo, 'before.json'), log = path.join(repo, 'build.log');
  let porcelain = '';
  const builds = [], summaries = [];
  const deps = {
    execFileSync(command, args) {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['-C', repo, 'status', '--porcelain=v1', '-z', '--untracked-files=all']);
      return porcelain;
    },
    spawnSync(command, args, options) {
      assert.equal(command, 'npm');
      assert.deepEqual(args, ['run', '-s', 'build']);
      builds.push(path.basename(options.cwd));
      return { status: 0 };
    },
    console: { log: line => summaries.push(line) },
  };
  return {
    repo, snapshotFile, log, builds, summaries,
    status(value) { porcelain = value; },
    write(file, value = 'export const value = 1;') {
      const target = path.join(repo, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, value);
    },
    capture() { runJiniRebuild({ mode: 'snapshot', repo, snapshotFile }, deps); },
    rebuild() { runJiniRebuild({ mode: 'rebuild', repo, snapshotFile, log }, deps); },
  };
}

test('C: dirty source changes, deletions and untracked files select packages in dependency order', t => {
  const f = fixture(t);
  for (const pkg of ['chat', 'daemon', 'agent-runtime', 'core', 'protocol']) f.write(`packages/${pkg}/src/index.ts`);
  f.status(' M packages/core/src/index.ts\0');
  f.capture();
  // Same porcelain status, different contents: a pre-existing dirty file still needs rebuilding.
  f.write('packages/core/src/index.ts', 'export const changedWhileDirty = 12345;');
  fs.rmSync(path.join(f.repo, 'packages/protocol/src/index.ts'));
  f.write('packages/chat/src/new.ts');
  f.write('packages/daemon/src/new.ts');
  f.write('packages/agent-runtime/src/new.ts');
  f.status('?? packages/chat/src/new.ts\0 M packages/core/src/index.ts\0 D packages/protocol/src/index.ts\0?? packages/daemon/src/new.ts\0?? packages/agent-runtime/src/new.ts\0');
  f.rebuild();
  assert.deepEqual(f.builds, ['protocol', 'core', 'agent-runtime', 'daemon', 'chat']);
  assert.deepEqual(f.summaries, ['jini-rebuild: protocol=0 core=0 agent-runtime=0 daemon=0 chat=0']);
  const after = JSON.parse(fs.readFileSync(`${f.snapshotFile}.after`, 'utf8'));
  assert.equal(after.porcelain, '?? packages/chat/src/new.ts\0 M packages/core/src/index.ts\0 D packages/protocol/src/index.ts\0?? packages/daemon/src/new.ts\0?? packages/agent-runtime/src/new.ts\0');
  assert.equal(after.files['packages/protocol/src/index.ts'], 'missing: D');
});

test('C: test-only, dist and documentation edits never trigger a build', t => {
  const f = fixture(t);
  f.write('packages/chat/src/index.ts');
  f.write('packages/chat/src/__tests__/old.test.ts');
  f.capture();
  f.write('packages/chat/src/__tests__/old.test.ts', 'changed test');
  f.write('packages/chat/src/__tests__/new.test.ts');
  f.write('packages/chat/dist/index.js');
  f.write('packages/chat/README.md');
  f.status(' M packages/chat/src/__tests__/old.test.ts\0?? packages/chat/src/__tests__/new.test.ts\0 M packages/chat/dist/index.js\0 M packages/chat/README.md\0');
  f.rebuild();
  assert.deepEqual(f.builds, []);
  assert.deepEqual(f.summaries, ['jini-rebuild: none']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(`${f.snapshotFile}.after`, 'utf8')).files), ['packages/chat/src/index.ts']);
});

test('C: porcelain-only status changes are detected even when source bytes and mtimes are unchanged', t => {
  const f = fixture(t);
  f.write('packages/daemon/src/index.ts');
  f.status(' M packages/daemon/src/index.ts\0');
  f.capture();
  f.status('M  packages/daemon/src/index.ts\0');
  f.rebuild();
  assert.deepEqual(f.builds, ['daemon']);
});

test('C: porcelain -z renames include both source and destination packages, including spaces', t => {
  const f = fixture(t);
  f.write('packages/core/src/old name.ts');
  f.capture();
  f.write('packages/chat/src/new name.ts');
  fs.rmSync(path.join(f.repo, 'packages/core/src/old name.ts'));
  f.status('R  packages/chat/src/new name.ts\0packages/core/src/old name.ts\0');
  f.rebuild();
  assert.deepEqual(f.builds, ['core', 'chat']);
});

test('C: unchanged dirty files stay skipped and repeated changes in one package build it once', t => {
  const f = fixture(t);
  f.write('packages/core/src/index.ts');
  f.status(' M packages/core/src/index.ts\0');
  f.capture();
  f.rebuild();
  assert.deepEqual(f.builds, []);
  f.write('packages/daemon/src/a.ts');
  f.write('packages/daemon/src/b.ts');
  f.rebuild();
  assert.deepEqual(f.builds, ['daemon']);
});
