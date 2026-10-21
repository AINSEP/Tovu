/** Owner acceptance: all-files coverage report dispatch, 2026-10-20. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeSource, buildReport, main, runReport, type CoveragePorts } from '../coverage-all-files.js';

const loc = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 20 } });
const lcov = (file: string, first = 1, second = 0) => `SF:${file}\nFN:1,choose\nFNDA:${first},choose\nDA:1,${first}\nDA:2,${second}\nBRDA:1,0,0,${first}\nBRDA:1,0,1,${second}\nend_of_record\n`;
const json = (file: string) => JSON.stringify({ [file]: { path: file,
  statementMap: { 0: loc(1), 1: loc(2) }, s: { 0: 0, 1: 3 },
  fnMap: { 0: { name: 'choose', loc: loc(1) } }, f: { 0: 2 },
  branchMap: { 0: { line: 1, loc: loc(1), locations: [loc(1), loc(1)] } }, b: { 0: [0, 4] },
} });

test('tracked fixture: type-only exclusion, never-loaded AST denominator, remote LCOV + JSON max merge and both outputs', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'coverage-all-files-'));
  try {
    const files: Record<string, string> = {
      'packages/core/src/choose.ts': 'export function choose(x: boolean) {\nreturn x ? 1 : 2;\n}',
      'packages/core/src/never.ts': '// comment\nexport function never(x: boolean) {\n if (x) return 1;\n return 2;\n}\n',
      'packages/core/src/types.ts': 'import type { X } from "./x"; export interface I {}\nexport type T = I; export type { X }; declare const ambient: number; export {};',
      'packages/core/src/testish-name.ts': 'export const runtime = 1;',
      'migrations/001.ts': 'export const migration = 1;',
      'config.ts': 'export const config = 1;',
      'plugins/runtime.mjs': 'export const plugin = 1;',
      'development/scripts/task.cts': 'console.log(1);',
      'src/x.d.ts': 'declare const x: number;',
      '__tests__/x.ts': 'throw 1;', 'src/a.test.ts': 'throw 1;', 'src/a.spec.tsx': 'throw 1;',
      'src/a.fixture.ts': 'throw 1;', 'fixtures/x.ts': 'throw 1;', 'e2e/x.ts': 'throw 1;',
      'generated/x.ts': 'throw 1;', 'src/a.generated.ts': 'throw 1;',
      'node_modules/a.ts': 'throw 1;', 'dist/a.js': 'throw 1;', 'build/a.ts': 'throw 1;', 'out/a.ts': 'throw 1;', 'coverage/a.ts': 'throw 1;',
      'README.md': 'text',
    };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      writeFileSync(path.join(repo, file), text);
    }
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-C', repo, 'add', '-f', '.']);
    writeFileSync(path.join(repo, 'untracked.ts'), 'throw 1;');
    const first = path.join(repo, 'input.info'), second = path.join(repo, 'coverage-final.json');
    const remote = '/home/runner/work/old-checkout/packages/core/src/choose.ts';
    writeFileSync(first, lcov(remote) + lcov('/tmp/not-in-repo/absent.ts') + 'SF:/tmp/repo/src/types-absent.ts\nDA:1,1\nend_of_record\n');
    writeFileSync(second, json('C:\\work\\different\\packages\\core\\src\\choose.ts'));
    const ports: CoveragePorts = {
      listFiles: ({ repo }) => execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean),
      readText: ({ file }) => readFileSync(file, 'utf8'),
      writeText: ({ file, text }) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); },
    };
    const report = runReport({ repo, coverage: [first, second, first], out: path.join(repo, 'report'), ports });
    const loaded = report.files.find(row => row.file.endsWith('/choose.ts'))!;
    assert.equal(loaded.status, 'LOADED');
    assert.deepEqual(loaded.lines, { covered: 2, total: 2, pct: 100 });
    assert.deepEqual(loaded.branches, { covered: 2, total: 2, pct: 100 });
    assert.deepEqual(loaded.functions, { covered: 1, total: 1, pct: 100 });
    assert.deepEqual(loaded.hits, { lines: { 1: 1, 2: 3 }, branches: { '1:0': 1, '1:1': 4 }, functions: { '1:0': 2 } });
    const never = report.files.find(row => row.file.endsWith('/never.ts'))!;
    assert.equal(never.status, 'NEVER-LOADED');
    assert.deepEqual(never.lines, { covered: 0, total: 3, pct: 0 });
    assert.deepEqual(never.functions, { covered: 0, total: 1, pct: 0 });
    assert.deepEqual(never.branches, { covered: 0, total: 2, pct: 0 });
    assert.equal(report.files.length, 7);
    assert.equal(report.neverLoaded, 6);
    assert.equal(report.runnerTotals.lines.pct, 100);
    assert.equal(report.totals.lines.total, 10);
    assert.ok(report.totals.lines.pct === 20);
    assert.deepEqual(Object.fromEntries(report.exclusions.map(group => [group.group, group.count])), {
      explicit: 0, vendor: 0, 'non-source': 1, 'dependencies/build/output': 5, 'test/fixture': 6, declaration: 1, generated: 2, 'type-only': 1,
    });
    assert.equal(report.exclusions.find(group => group.group === 'test/fixture')!.examples.length, 5);
    assert.equal(report.unmatched.length, 4);
    assert.equal(report.areas.find(area => area.area === 'packages/core')!.files, 3);
    assert.equal(report.files.some(row => row.file === 'untracked.ts'), false);
    assert.equal(report.files[0].file, never.file);
    assert.deepEqual(JSON.parse(readFileSync(path.join(repo, 'report/coverage-all-files.json'), 'utf8')), report);
    const markdown = readFileSync(path.join(repo, 'report/coverage-all-files.md'), 'utf8');
    for (const heading of ['TRUE: all files', 'RUNNER: records only', 'Exclusions', 'Packages / top-level areas', 'Full never-loaded list', 'Unmatched coverage records']) assert.ok(markdown.includes(heading));
    for (const row of report.files.filter(row => row.status === 'NEVER-LOADED')) assert.ok(markdown.includes(`- ${row.file}`));
    const logs: string[] = [];
    main({ args: ['--repo', repo, '--coverage', first, '--coverage', second, '--out', path.join(repo, 'cli-report')], ports, log: message => logs.push(message) });
    assert.match(logs[0], /7 files; 6 NEVER-LOADED/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('AST recognizes type syntax rather than filenames and retains runtime imports, enums, configs and effects', () => {
  for (const text of ['interface I {}', 'type T = string;', 'import type T from "x";', 'export type * from "x";', 'import { type T } from "x";', 'export { type T } from "x";', 'declare namespace X { const y: number; }', 'export {};', '']) {
    assert.equal(analyzeSource({ file: 'anything.ts', text }).typeOnly, true, text);
  }
  for (const text of ['import "x";', 'import {} from "x";', 'export {} from "x";', 'import { X } from "x";', 'export * from "x";', 'enum E { A }', 'const x = 1;', 'console.log(1);']) {
    assert.equal(analyzeSource({ file: 'types.ts', text }).typeOnly, false, text);
  }
  const result = analyzeSource({ file: 'x.tsx', text: 'export const f = () => 1;\n// ignored\n\nexport const jsx = <div />;' });
  assert.equal(Object.keys(result.image.lines).length, 2);
  assert.equal(Object.keys(result.image.functions).length, 1);
});

test('longest unique suffix wins, ambiguous basenames are unmatched, excluded records stay separate, merge order is stable', () => {
  const sources = new Map([
    ['packages/a/src/x.ts', 'export const x = 1;'], ['packages/b/src/x.ts', 'export const x = 1;'],
    ['src/y.test.ts', 'throw 1;'], ['src/zero.ts', 'export const x = 1;'],
  ]);
  const input = { name: 'remote.info', text: lcov('/tmp/build/packages/a/src/x.ts') + lcov('/tmp/x.ts') + lcov('/tmp/build/src/y.test.ts') + 'SF:src/zero.ts\nDA:1,0\nend_of_record\n' };
  const jsonInput = { name: 'json', text: json('packages/a/src/x.ts') };
  const report = buildReport({ sources, inputs: [input, jsonInput] });
  assert.equal(report.unmatched.length, 1);
  assert.equal(report.excludedCoverage.length, 1);
  assert.equal(report.files.find(row => row.file === 'src/zero.ts')!.status, 'LOADED');
  assert.deepEqual(report.files, buildReport({ sources, inputs: [jsonInput, input] }).files);
  assert.equal(report.files.find(row => row.file.includes('/a/'))!.lines.total, 2);
});

test('CLI reports usage, malformed coverage and I/O errors without throwing or changing exit code', () => {
  const logs: string[] = [];
  const ports: CoveragePorts = {
    listFiles: () => ['x.ts'], readText: ({ file }) => file.endsWith('x.ts') ? 'export const x = 1;' : '{bad json', writeText: () => {},
  };
  const before = process.exitCode;
  for (const args of [[], ['--bad', 'value'], ['--repo'], ['--repo', '/repo', '--out', '/out', '--coverage', 'bad.json']]) {
    assert.doesNotThrow(() => main({ args, ports, log: message => logs.push(message) }));
  }
  main({ args: ['--repo', '/repo', '--out', '/out', '--coverage', 'bad.json'], ports: { ...ports, listFiles: () => { throw new Error('git unavailable'); } }, log: message => logs.push(message) });
  assert.equal(logs.length, 5);
  assert.ok(logs.every(message => message.startsWith('Coverage report unavailable:')));
  assert.match(logs.at(-1)!, /git unavailable/);
  assert.equal(process.exitCode, before);
});

test('--root limits the denominator to the named directories', () => {
  const written = new Map<string, string>();
  const report = runReport({
    repo: '/repo', coverage: ['/cov.info'], out: '/out',
    ports: {
      listFiles: () => ['packages/a/src/run.ts', 'AI-Dev-Shop/tool.ts', 'packagesX/b.ts'],
      readText: ({ file }) => (file === '/cov.info' ? '' : 'export const run = () => 1;\n'),
      writeText: ({ file, text }) => { written.set(file, text); },
    },
  }, { roots: ['packages/'] });
  assert.deepEqual(report.files.map(row => row.file), ['packages/a/src/run.ts']);
});

test('a malformed LCOV record is skipped with a warning instead of failing the report', () => {
  const lcov = ['SF:/elsewhere/linked.ts', 'DA:1,1', 'LF:1', 'LH:0', 'end_of_record', 'SF:/x/packages/a/src/run.ts', 'DA:1,1', 'LF:1', 'LH:1', 'end_of_record', ''].join('\n');
  const report = runReport({
    repo: '/x', coverage: ['/cov.info'], out: '/out',
    ports: {
      listFiles: () => ['packages/a/src/run.ts'],
      readText: ({ file }) => (file === '/cov.info' ? lcov : 'export const run = () => 1;\n'),
      writeText: () => {},
    },
  });
  assert.equal(report.neverLoaded, 0);
  assert.ok(report.warnings.some(w => w.includes('skipped malformed LCOV record')));
});

test('vendor directories at any depth are excluded, while similar path segments remain counted', () => {
  const vendors = ['vendor/root.ts', 'apps/desktop/src/renderer/public/vendor/kuinetic/engine.js', 'packages/a/vendor/component.tsx'];
  const owned = ['packages/vendorized/src/run.ts', 'src/my-vendor/run.ts', 'src/vendor.ts'];
  const sources = new Map([...vendors, ...owned].map(file => [file, 'export const runtime = 1;']));
  const report = buildReport({ sources, inputs: [{ name: 'vendor.info', text: lcov(vendors[1]) }] });
  assert.deepEqual(report.files.map(row => row.file).sort(), [...owned].sort());
  assert.deepEqual(report.exclusions.find(group => group.group === 'vendor'), { group: 'vendor', count: 3, examples: [...vendors].sort() });
  assert.deepEqual(report.excludedCoverage, [{ input: 'vendor.info', file: vendors[1], matched: vendors[1] }]);
  assert.deepEqual(report.unmatched, []);
  assert.equal(report.totals.lines.total, 3);
  assert.equal(report.neverLoaded, 3);
});

test('explicit exclusions match directory boundaries, normalize trailing slashes, and count overlapping matches once', () => {
  const omitted = ['packages/commerce/src/cart.ts', 'packages/commerce/vendor/payment.js', 'apps/demo/src/main.ts'];
  const kept = ['packages/commerce-extra/src/cart.ts', 'packages/commerce.ts', 'apps/demo-copy/src/main.ts'];
  const sources = new Map([...omitted, ...kept].map(file => [file, 'export const runtime = 1;']));
  const inputs = [{ name: 'remote.info', text: omitted.map(file => lcov(`/runner/${file}`)).join('') }];
  const report = buildReport({ sources, inputs }, { excludes: ['packages/commerce/', 'packages/commerce/src', 'apps/demo', 'absent'] });
  assert.deepEqual(report.files.map(row => row.file).sort(), [...kept].sort());
  assert.deepEqual(report.exclusions.find(group => group.group === 'explicit'), { group: 'explicit', count: 3, examples: [...omitted].sort() });
  assert.equal(report.exclusions.find(group => group.group === 'vendor')!.count, 0);
  assert.deepEqual(report.excludedCoverage.map(row => row.matched), omitted);
  assert.deepEqual(report.unmatched, []);
  assert.equal(report.totals.lines.total, 3);
  const baseline = buildReport({ sources, inputs: [] });
  assert.equal(baseline.files.length, 5, 'commerce is included unless its owner explicitly excludes it');
});

test('repeatable --exclude reaches both reports without reading vendor or explicitly excluded source', () => {
  const written = new Map<string, string>(), reads: string[] = [], logs: string[] = [];
  const vendor = 'apps/desktop/src/renderer/public/vendor/kuinetic/runtime.js';
  const omitted = ['packages/commerce/src/cart.ts', 'apps/demo/src/main.ts'];
  const ports: CoveragePorts = {
    listFiles: () => [vendor, ...omitted, 'apps/website/src/main.ts', 'outside/root.ts'],
    readText: ({ file }) => {
      reads.push(file);
      if (file === '/cov.info') return [vendor, ...omitted].map(file => lcov(file)).join('');
      assert.equal(file, '/repo/apps/website/src/main.ts', 'excluded sources must not be read');
      return 'export const runtime = 1;';
    },
    writeText: ({ file, text }) => { written.set(file, text); },
  };
  main({ args: ['--repo', '/repo', '--coverage', '/cov.info', '--out', '/out', '--root', 'apps', '--root', 'packages',
    '--exclude', 'packages/commerce/', '--exclude', 'apps/demo', '--exclude', 'apps/demo/src'], ports, log: message => logs.push(message) });
  assert.deepEqual(reads, ['/repo/apps/website/src/main.ts', '/cov.info']);
  assert.equal(written.size, 2);
  const report = JSON.parse(written.get('/out/coverage-all-files.json')!);
  assert.deepEqual(report.files.map((row: { file: string }) => row.file), ['apps/website/src/main.ts']);
  assert.equal(report.exclusions.find((group: { group: string }) => group.group === 'vendor').count, 1);
  assert.equal(report.exclusions.find((group: { group: string }) => group.group === 'explicit').count, 2);
  assert.equal(report.excludedCoverage.length, 3);
  assert.match(written.get('/out/coverage-all-files.md')!, /\| explicit \| 2 \|/);
  assert.match(written.get('/out/coverage-all-files.md')!, /\| vendor \| 1 \|/);
  assert.match(logs[0], /1 files; 1 NEVER-LOADED/);
});

test('--exclude requires a directory value and remains a report-only CLI error', () => {
  const logs: string[] = [];
  const ports: CoveragePorts = {
    listFiles: () => assert.fail('invalid CLI input must not access the repository'),
    readText: () => assert.fail('invalid CLI input must not read files'),
    writeText: () => assert.fail('invalid CLI input must not write reports'),
  };
  const before = process.exitCode;
  for (const tail of [['--exclude'], ['--exclude', '--root', 'apps']]) {
    main({ args: ['--repo', '/repo', '--coverage', '/cov.info', '--out', '/out', ...tail], ports, log: message => logs.push(message) });
  }
  assert.deepEqual(logs, Array(2).fill('Coverage report unavailable: Missing value for --exclude'));
  assert.equal(process.exitCode, before);
});
