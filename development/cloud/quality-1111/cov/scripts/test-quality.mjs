#!/usr/bin/env node
// Static test-quality scan (report-only). Usage:
//   node test-quality.mjs --ts <path to typescript module> --out <tsv> <repoName>=<repoRoot> ...
// For each test file (git ls-files, *.test.* / *.spec.*), parses with the TypeScript AST and counts:
//   tests          test()/it() calls (incl. .each/.skip/.only/.todo/.concurrent variants, t.test subtests)
//   no_assert      tests whose callback contains no assertion call and no helper call named assert*/expect*/verify*/check*/should*
//   weak_only      tests whose every assertion is a truthiness/existence/no-throw check
//                  (ok(x), assert(x), toBeTruthy, toBeFalsy, toBeDefined, not.toBeUndefined, not.toBeNull, not.toThrow, doesNotThrow, doesNotReject)
//   snapshot_only  tests whose every assertion is a snapshot (toMatchSnapshot, toMatchInlineSnapshot, toMatchFileSnapshot, t.assert.snapshot)
//   mocks_uut      vi.mock / mock.module / jest.mock specifiers whose basename equals the test file's subject basename
//   skip / only / todo  counts of .skip/.skipIf/xit/xdescribe/{skip:}, .only/{only:}, .todo/{todo:}
//   indirect       tests with no direct assertion but a helper call named assert*/expect*/verify*/check*/should*, or a call to a
//                  same-file function that itself (transitively) asserts (not counted as no_assert)
//   Heuristic limits: helpers imported from other files with non-assert names, and tests relying on an implicit
//   throw, are counted as no_assert. Hooks (test.before/after/...) are not tests.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
let tsPath, out; const repos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ts') tsPath = args[++i];
  else if (args[i] === '--out') out = args[++i];
  else { const [name, root] = args[i].split('='); repos.push({ name, root }); }
}
const ts = createRequire(import.meta.url)(tsPath);

const TEST_NAMES = new Set(['it', 'test', 'xit', 'xtest', 'fit']);
const SUITE_NAMES = new Set(['describe', 'suite', 'xdescribe', 'fdescribe', 'context']);
const WEAK = new Set(['toBeTruthy', 'toBeFalsy', 'toBeDefined', 'ok', 'doesNotThrow', 'doesNotReject']);
const WEAK_NEG = new Set(['toBeUndefined', 'toBeNull', 'toThrow', 'toThrowError', 'toBeNaN']);
const SNAP = new Set(['toMatchSnapshot', 'toMatchInlineSnapshot', 'toMatchFileSnapshot', 'toThrowErrorMatchingSnapshot', 'toThrowErrorMatchingInlineSnapshot', 'snapshot', 'fileSnapshot']);
let LOCAL_ASSERTERS = new Set(); // same-file functions whose bodies assert (to a fixed point)
const HELPER = /^(assert|expect|verify|check|should|ensure|must)[A-Z_]/;

function chain(expr) { // flatten a.b.c(...)  -> ['a','b','c']
  const parts = [];
  let e = expr;
  for (;;) {
    if (ts.isPropertyAccessExpression(e)) { parts.unshift(e.name.text); e = e.expression; }
    else if (ts.isCallExpression(e)) { parts.unshift('()'); e = e.expression; }
    else if (ts.isIdentifier(e)) { parts.unshift(e.text); break; }
    else if (e.kind === ts.SyntaxKind.ThisKeyword) { parts.unshift('this'); break; }
    else if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e)) { e = e.expression; }
    else if (ts.isElementAccessExpression(e)) { parts.unshift('[]'); e = e.expression; }
    else { parts.unshift('?'); break; }
  }
  return parts;
}

// Classify one call as an assertion: returns null | 'strong' | 'weak' | 'snap' | 'helper'
function classifyCall(call) {
  const c = chain(call.expression).filter(p => p !== '()');
  if (!c.length) return null;
  const head = c[0], last = c[c.length - 1];
  const isExpectChain = c.includes('expect') || c.includes('expectTypeOf') || c.includes('assertType');
  const isAssertChain = head === 'assert' || c.includes('assert') || head === 'should' || c.includes('should');
  const isNodeAssertFn = c.length === 1 && ['ok', 'equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'notEqual', 'notStrictEqual', 'notDeepStrictEqual', 'throws', 'rejects', 'match', 'doesNotMatch', 'doesNotThrow', 'doesNotReject', 'fail', 'partialDeepStrictEqual'].includes(head);
  if (isExpectChain) {
    if (head === 'expect' && c.length === 1) return null; // bare expect(x) — the matcher call is classified
    if (c[0] === 'expect' && ['assertions', 'hasAssertions'].includes(c[1])) return 'strong';
    if (SNAP.has(last)) return 'snap';
    if (WEAK.has(last)) return 'weak';
    if (WEAK_NEG.has(last) && c.includes('not')) return 'weak';
    return 'strong';
  }
  if (isAssertChain || isNodeAssertFn) {
    if (SNAP.has(last)) return 'snap';
    if ((head === 'assert' && c.length === 1) || last === 'ok' || WEAK.has(last)) return 'weak';
    return 'strong';
  }
  if (c.length === 1 && HELPER.test(head)) return 'helper';
  if (c.length === 1 && LOCAL_ASSERTERS.has(head)) return 'helper';
  if (c.length >= 2 && HELPER.test(last)) return 'helper';
  return null;
}

function analyzeBody(fn) {
  const kinds = { strong: 0, weak: 0, snap: 0, helper: 0 };
  const visit = n => {
    if (ts.isCallExpression(n)) {
      const k = classifyCall(n);
      if (k) kinds[k]++;
      // nested test definitions are separate tests
      const c = chain(n.expression).filter(p => p !== '()');
      if (isTestCall(c)) return;
    }
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return kinds;
}

const HOOKS = new Set(['before', 'after', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'mock', 'describe', 'suite']);
function isTestCall(c) {
  if (!c.length) return false;
  if (c.slice(1).some(m => HOOKS.has(m))) return false;
  if (TEST_NAMES.has(c[0])) return true;
  if (c.length >= 2 && c[c.length - 1] === 'test' && c[0] !== 'describe') return true; // t.test(...)
  return false;
}
function modifiers(c) { return new Set(c.slice(1)); }
function subjectBase(file) {
  let b = path.basename(file).replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '');
  b = b.replace(/\.(unit|integration|int|e2e|property|contract|route|component|browser|node|dom|smoke|regression|pins?)$/g, '');
  b = b.replace(/\.(unit|integration|property)$/g, '');
  return b;
}

function scanFile(root, file) {
  const text = readFileSync(path.join(root, file), 'utf8');
  const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?jsx?$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const r = { tests: 0, no_assert: 0, weak_only: 0, snapshot_only: 0, indirect: 0, mocks_uut: 0, skip: 0, only: 0, todo: 0, examples: [] };
  const subj = subjectBase(file);
  // same-file helper functions that (transitively) assert count as assertion helpers
  const fns = new Map();
  const collect = n => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) fns.set(n.name.text, n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) fns.set(n.name.text, n.initializer);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  LOCAL_ASSERTERS = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, fn] of fns) {
      if (LOCAL_ASSERTERS.has(name)) continue;
      const k = analyzeBody(fn);
      if (k.strong + k.weak + k.snap + k.helper > 0) { LOCAL_ASSERTERS.add(name); changed = true; }
    }
  }
  const visit = n => {
    if (ts.isCallExpression(n)) {
      const c = chain(n.expression).filter(p => p !== '()' && p !== '[]');
      const mods = modifiers(c);
      const isSuite = c.length && SUITE_NAMES.has(c[0]);
      // mocks of the unit under test
      if ((c.join('.') === 'vi.mock' || c.join('.') === 'jest.mock' || c.join('.') === 'vi.doMock' || /(^|\.)mock\.module$/.test(c.join('.'))) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
        const spec = n.arguments[0].text;
        const mb = path.basename(spec).replace(/\.[cm]?[jt]sx?$/, '');
        if (mb === subj && (spec.startsWith('.') || spec.startsWith('/'))) { r.mocks_uut++; r.examples.push(`mocks_uut:${spec}@${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`); }
      }
      if (isSuite || isTestCall(c)) {
        const optsArg = n.arguments.find(a => ts.isObjectLiteralExpression(a));
        const optFlag = name => optsArg && optsArg.properties.some(p => p.name && p.name.text === name && !(p.initializer && p.initializer.kind === ts.SyntaxKind.FalseKeyword));
        if (mods.has('skip') || mods.has('skipIf') || c[0] === 'xit' || c[0] === 'xtest' || c[0] === 'xdescribe' || optFlag('skip')) r.skip++;
        if (mods.has('only') || c[0] === 'fit' || c[0] === 'fdescribe' || optFlag('only')) r.only++;
        if (mods.has('todo') || optFlag('todo')) r.todo++;
      }
      if (isTestCall(c) && !mods.has('todo')) {
        const fn = [...n.arguments].reverse().find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (fn) {
          r.tests++;
          const k = analyzeBody(fn);
          const direct = k.strong + k.weak + k.snap;
          const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          if (direct === 0 && k.helper === 0) { r.no_assert++; r.examples.push(`no_assert@${line}`); }
          else if (direct === 0) r.indirect++;
          else if (k.strong === 0 && k.snap === 0 && k.helper === 0) { r.weak_only++; r.examples.push(`weak_only@${line}`); }
          else if (k.strong === 0 && k.weak === 0 && k.helper === 0) { r.snapshot_only++; r.examples.push(`snapshot_only@${line}`); }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // node:test t.skip()/t.todo() inside bodies
  r.skip += (text.match(/\bt\.skip\(/g) || []).length;
  r.todo += (text.match(/\bt\.todo\(/g) || []).length;
  return r;
}

const rows = [];
const cols = ['tests', 'no_assert', 'weak_only', 'snapshot_only', 'indirect', 'mocks_uut', 'skip', 'only', 'todo'];
for (const { name, root } of repos) {
  const files = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n')
    .filter(f => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) && !/(^|\/)(node_modules|dist|AI-Dev-Shop|ADS-memory|foundry)\//.test(f));
  for (const f of files) {
    try { rows.push({ repo: name, file: f, ...scanFile(root, f) }); }
    catch (e) { rows.push({ repo: name, file: f, error: String(e.message || e) }); }
  }
}
const lines = [['repo', 'file', ...cols, 'locations'].join('\t')];
for (const r of rows) lines.push([r.repo, r.file, ...cols.map(c => r[c] ?? ''), (r.examples || []).join(' ') || r.error || ''].join('\t'));
writeFileSync(out, lines.join('\n') + '\n');
const tot = {};
for (const r of rows) { const k = r.repo; tot[k] ??= { files: 0 }; tot[k].files++; for (const c of cols) tot[k][c] = (tot[k][c] || 0) + (r[c] || 0); }
console.log(JSON.stringify(tot, null, 2));
