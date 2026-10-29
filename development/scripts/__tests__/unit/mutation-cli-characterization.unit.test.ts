import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { mock, type TestContext } from 'node:test';

const repo = path.resolve(import.meta.dirname, '../../../..');

function preserveProcess(t: TestContext) {
  const argv = process.argv;
  const cwd = process.cwd();
  const exitCode = process.exitCode;
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'exit', 'uncaughtException', 'unhandledRejection'];
  const listeners = new Map(signals.map((signal) => [signal, new Set(process.listeners(signal))]));
  t.after(() => {
    process.argv = argv;
    process.chdir(cwd);
    process.exitCode = exitCode;
    for (const [signal, prior] of listeners) {
      for (const listener of process.listeners(signal)) if (!prior.has(listener)) process.removeListener(signal, listener);
    }
  });
}

test('sweep CLI discovers reordered test tokens, emits each mutation, and restores its source', async (t) => {
  preserveProcess(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-sweep-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const src = 'feature/nested/adapter.stdio.ts';
  const testPath = 'feature/__tests__/mcp.stdio-adapter.test.ts';
  fs.mkdirSync(path.join(root, 'feature/nested'), { recursive: true });
  fs.mkdirSync(path.join(root, 'feature/__tests__'));
  fs.writeFileSync(path.join(root, testPath), '');
  fs.writeFileSync(path.join(root, 'feature/__tests__/stdio.test.ts'), '');
  const source = '// if (!ignored) return;\nif (allowed) return;\nconst x = input ?? 0;\nconst y = input?.value;\n';
  fs.writeFileSync(path.join(root, src), source);
  process.chdir(root);
  process.argv = [process.execPath, path.join(repo, 'development/scripts/mutation-sweep.mjs'), src, '--optional', '--json'];
  const observed: string[] = [];
  const childProcess = mock.module('node:child_process', { namedExports: {
    spawnSync(cmd: string, args: string[], options: { timeout: number }) {
      if (cmd === 'git') {
        assert.deepEqual(args, ['diff', '--quiet', '--', src]);
        return { status: 0 };
      }
      assert.equal(cmd, process.execPath);
      assert.deepEqual(args, ['--import', 'tsx', '--test', '--test-concurrency=1', '--experimental-test-module-mocks', testPath]);
      assert.equal(options.timeout, 120_000);
      observed.push(fs.readFileSync(src, 'utf8'));
      return { status: observed.length === 2 ? 1 : 0, stdout: observed.length === 2 ? 'assertion failed' : '', stderr: '' };
    },
  } });
  t.after(() => childProcess.restore());
  const outputs: string[] = [];
  t.mock.method(console, 'log', (line: string) => outputs.push(line));
  const exit = new Error('fixture process exited');
  t.mock.method(process, 'exit', (code: number) => { assert.equal(code, 0); throw exit; });
  await assert.rejects(import(new URL('../../mutation-sweep.mjs?characterization', import.meta.url).href), (error) => error === exit);
  assert.deepEqual(observed, [source,
    source.replace('if (allowed)', 'if (false)'),
    source.replace(' ?? 0', ''),
    source.replace('input?.value', 'input.value'),
  ]);
  const report = JSON.parse(outputs.join(''));
  assert.deepEqual(report.tests, [testPath]);
  assert.equal(report.total, 3);
  assert.equal(report.survived, 2);
  assert.equal(report.inconclusive, 0);
  assert.deepEqual(report.results.map(({ line, op, verdict }: { line: number; op: string; verdict: string }) => ({ line, op, verdict })), [
    { line: 2, op: 'guard-never-fires', verdict: 'killed' },
    { line: 3, op: 'drop-nullish-default', verdict: 'SURVIVED' },
    { line: 4, op: 'drop-optional-chain', verdict: 'SURVIVED' },
  ]);
  assert.equal(fs.readFileSync(src, 'utf8'), source);
});

test('lanes CLI records a sweep and a no-test row, then removes its isolated copy', async (t) => {
  preserveProcess(t);
  const out = '/fixture/mutation-out';
  const target = '/fixture/targets.md';
  const laneRepo = path.join(out, 'lanes/lane-0/repo');
  const source = 'apps/website/src/guard.ts';
  const noTests = 'apps/website/src/untested.ts';
  const testPath = 'apps/website/src/__tests__/guard.test.ts';
  const files = new Map([[target, `| 1 | T1 | \`${source}\` | \`${testPath}\` |\n| 2 | T1 | \`${noTests}\` | |`]]);
  const dirs = new Set<string>();
  const fds = new Map<number, string>();
  const removed: string[] = [];
  const commands: { cmd: string; args: string[]; cwd: string }[] = [];
  let nextFd = 10;
  // Node's CommonJS mock bridge must receive a writable copy, not the builtin's default export.
  const fakeFs = mock.module('node:fs', { defaultExport: { ...fs }, namedExports: {
    ...fs,
    existsSync: (name: string) => files.has(name) || dirs.has(name),
    mkdirSync: (name: string) => dirs.add(name),
    readdirSync(name: string) {
      assert.ok([path.join(repo, 'packages'), path.join(out, 'lanes'), path.join(repo, 'node_modules')].includes(name)
        || name.startsWith('/fixture/home/'), `unexpected listing ${name}`);
      return [];
    },
    readFileSync(name: string) { assert.ok(files.has(name), `missing fixture file ${name}`); return files.get(name)!; },
    writeFileSync: (name: string, text: string) => files.set(name, String(text)),
    appendFileSync: (name: string, text: string) => files.set(name, (files.get(name) ?? '') + text),
    openSync(name: string, mode: string) { assert.equal(mode, 'w'); const fd = nextFd; nextFd++; fds.set(fd, name); files.set(name, ''); return fd; },
    closeSync: (fd: number) => assert.ok(fds.has(fd)),
    statSync(name: string) { assert.ok(files.has(name)); return { size: files.get(name)!.length }; },
    lstatSync(name: string) { assert.ok(dirs.has(name) || files.has(name)); return { isSymbolicLink: () => false }; },
    statfsSync: () => ({ bavail: 100n, bsize: 1024n ** 3n }),
    rmSync(name: string) {
      removed.push(name);
      for (const file of files.keys()) if (file === name || file.startsWith(`${name}/`)) files.delete(file);
      for (const dir of dirs) if (dir === name || dir.startsWith(`${name}/`)) dirs.delete(dir);
    },
    cpSync: () => assert.fail('fixture has no build outputs to copy'),
    symlinkSync: () => assert.fail('fixture has no dependencies to link'),
  } });
  t.after(() => fakeFs.restore());
  const fakeOs = mock.module('node:os', { defaultExport: { ...os }, namedExports: { ...os, homedir: () => '/fixture/home', loadavg: () => [0, 0, 0] } });
  t.after(() => fakeOs.restore());
  const fakeChild = mock.module('node:child_process', { namedExports: {
    spawn(cmd: string, args: string[], options: { cwd: string; detached: boolean; stdio: (string | number)[] }) {
      commands.push({ cmd, args, cwd: options.cwd });
      assert.equal(options.detached, true);
      const child = Object.assign(new EventEmitter(), {
        stdout: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
        stderr: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
      });
      let stdout = '';
      if (cmd === 'git') {
        if (args[0] === 'ls-files') { assert.deepEqual(args, ['ls-files', '-z', '*.test.ts', '*.test.tsx', '*.test.mjs']); }
        else if (args[0] === 'rev-parse') { assert.deepEqual(args, ['rev-parse', 'HEAD']); stdout = 'fixture-sha\n'; }
        else if (args[0] === 'archive') { assert.deepEqual(args, ['archive', '--format=tar', '-o', path.join(out, 'lanes/lane-0/copy.tar'), 'fixture-sha']); }
        else { assert.ok([`fixture-sha:${source}`, `fixture-sha:${noTests}`].includes(args[1])); assert.equal(args[0], 'show'); stdout = 'if (!allowed) return;'; }
      } else if (cmd === 'tar') {
        assert.deepEqual(args, ['-xf', path.join(out, 'lanes/lane-0/copy.tar'), '-C', laneRepo]);
      } else if (cmd === 'chmod') {
        assert.deepEqual(args, ['-R', 'u+w', laneRepo]);
      } else {
        assert.equal(cmd, process.execPath);
        assert.deepEqual(args, [path.join(repo, 'development/scripts/mutation-sweep.mjs'), source, testPath,
          '--json', '--priority', '--limit=15', '--timeout=180', `--progress=${out}/logs/1.progress.jsonl`]);
        assert.equal(options.cwd, laneRepo);
        assert.equal(files.get(path.join(laneRepo, source)), 'if (!allowed) return;');
        files.set(fds.get(options.stdio[1] as number)!, JSON.stringify({ file: source, results: [
          { line: 1, op: 'guard-never-fires', before: 'if (!allowed) return;', verdict: 'SURVIVED' },
        ] }, null, 2));
      }
      queueMicrotask(() => { child.stdout.emit('data', stdout); child.emit('close', 0, null); });
      return child;
    },
  } });
  t.after(() => fakeChild.restore());
  process.argv = [process.execPath, path.join(repo, 'development/scripts/mutation-lanes.mjs'), `--targets=${target}`, `--out=${out}`, '--lanes=1'];
  t.mock.method(console, 'log', () => {});
  await import(new URL('../../mutation-lanes.mjs?characterization', import.meta.url).href);
  const lines = files.get(path.join(out, 'results.tsv'))!.trimEnd().split('\n').map((line) => line.split('\t'));
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[1].slice(0, 7), ['1', source, '1', '0', '1', '0', '0']);
  assert.equal(lines[1][8], 'rc=0');
  assert.deepEqual(lines[2].slice(0, 7), ['2', noTests, '', '', '', '', '']);
  assert.equal(lines[2][8], 'NO-TESTS');
  assert.equal(commands.filter(({ cmd }) => cmd === process.execPath).length, 1);
  assert.equal(files.has(path.join(laneRepo, source)), false);
  assert.equal(dirs.has(laneRepo), false);
  assert.match(files.get(path.join(out, 'SURVIVORS.md'))!, /row 1 \(T1\).*guard\.ts.*fixture-sha/);
  const status = JSON.parse(files.get(path.join(out, 'lanes-status.json'))!);
  assert.equal(status.rowsDone, 2);
  assert.equal(status.survivorsTotal, 1);
  assert.equal(status.lanes[0].state, 'done');
  assert.ok(removed.includes(laneRepo));
  assert.match(files.get(path.join(out, 'lanes-exit.txt'))!, / completed\n$/);
});
