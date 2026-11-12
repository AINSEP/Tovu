// Extracts every failing test from node:test TAP files and vitest JSON result files into failures.tsv.
// Classification is heuristic (column `basis` says which rule fired):
//   ENV         error text names a missing container facility: Postgres socket/5432, Chromium/Playwright browser,
//               IPv6/::1/EADDRNOTAVAIL, EPERM/EACCES, semgrep/docker missing.
//   TEST DRIFT  assertion-shaped mismatch in the error message (AssertionError, expected/received, snapshot mismatch), a missing
//               module/export the test imports, or a timeout — i.e. the test's expectation no longer matches.
//   PRODUCT     a runtime exception thrown from non-test source (TypeError/ReferenceError/... whose first stack
//               frame is outside __tests__/test files).
//   Remaining unmatched rows are TEST DRIFT with basis "default". Usage:
//   node extract-failures.mjs <out.tsv> <repo>:<tap|vitest>:<file> ...
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [out, ...inputs] = process.argv.slice(2);
const rows = [];
const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 600);
function classify(err, stack) {
  const t = `${err}\n${stack}`;
  if (/PGSQL|:5432|postgres(ql)?:\/\/|ECONNREFUSED 127\.0\.0\.1:5432|psql: error|pg_ctl|initdb/i.test(t)) return ['ENV', 'postgres'];
  if (/chromium|playwright|Executable doesn't exist|browserType\.launch/i.test(t)) return ['ENV', 'chromium'];
  if (/EADDRNOTAVAIL|::1|IPv6|EAFNOSUPPORT/.test(t)) return ['ENV', 'ipv6'];
  if (/\bEPERM\b|\bEACCES\b|operation not permitted/i.test(t)) return ['ENV', 'eperm'];
  if (/semgrep|docker: not found|spawn docker/i.test(t)) return ['ENV', 'tool-missing'];
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN|network/i.test(t) && /fetch|request|connect/i.test(t)) return ['ENV', 'network'];
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|does not provide an export|is not exported|Failed to load url|Failed to resolve import/i.test(t)) return ['TEST DRIFT', 'module-resolution'];
  if (/AssertionError|expected .* to |Expected|Received|toMatchSnapshot|Snapshot .* mismatched|deepStrictEqual|strictEqual|ERR_ASSERTION/i.test(err)) return ['TEST DRIFT', 'assertion-mismatch'];
  if (/Test timed out|timed out after|ERR_TEST_TIMEOUT|cancelledByParent|test timed out/i.test(t)) return ['TEST DRIFT', 'timeout'];
  const firstFrame = (stack.split('\n').find(l => /\//.test(l)) || '');
  if (/(TypeError|ReferenceError|RangeError|SyntaxError|Error):/.test(err) && firstFrame && !/__tests__|\.test\.|\.spec\.|test-support|node:internal/.test(firstFrame)) return ['PRODUCT', 'exception-in-source'];
  return ['TEST DRIFT', 'default'];
}
function fromTap(repo, file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)not ok \d+ - (.*)$/);
    if (!m) continue;
    const ind = m[1].length; const name = m[2];
    let loc = '', ftype = '', err = '', stack = '', mode = '';
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.startsWith(' '.repeat(ind) + '  ...')) break;
      const body = l.slice(ind + 2);
      let mm;
      if ((mm = body.match(/^location: '(.*)'/))) { loc = mm[1]; mode = ''; }
      else if ((mm = body.match(/^failureType: '(.*)'/))) { ftype = mm[1]; mode = ''; }
      else if ((mm = body.match(/^error: (.*)$/))) { mode = 'err'; if (!/^[|>]-?$/.test(mm[1])) err += mm[1]; }
      else if (/^stack: /.test(body)) mode = 'stack';
      else if (/^[a-zA-Z_]+: /.test(body)) mode = '';
      else if (mode === 'err') err += ' ' + body.trim();
      else if (mode === 'stack') stack += body.trim() + '\n';
    }
    if (ftype === 'subtestsFailed') continue; // parent of failing children: children are listed
    const testFile = (loc.replace(/:\d+:\d+$/, '') || name).replace(/^\/home\/user\/(Tovu|Jini)\//, '');
    const [cls, basis] = classify(err, stack);
    rows.push({ repo, file: testFile, test: name, error: clean(err) || ftype, cls, basis, source: file.split('/').pop() });
  }
}
function fromVitest(repo, file) {
  if (!existsSync(file)) return;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  for (const tr of j.testResults || []) {
    const f = tr.name.replace(/^\/home\/user\/(Tovu|Jini)\//, '');
    const failed = (tr.assertionResults || []).filter(a => a.status === 'failed');
    for (const a of failed) {
      const msg = (a.failureMessages || []).join('\n');
      const [cls, basis] = classify(msg.split('\n')[0], msg);
      rows.push({ repo, file: f, test: a.fullName || a.title, error: clean(msg.split('\n').slice(0, 3).join(' ')), cls, basis, source: file.split('/').pop() });
    }
    if (tr.status === 'failed' && !failed.length) {
      const [cls, basis] = classify(tr.message || '', tr.message || '');
      rows.push({ repo, file: f, test: '(file/suite failed to run)', error: clean(tr.message), cls, basis, source: file.split('/').pop() });
    }
  }
}
for (const spec of inputs) {
  const [repo, kind, file] = spec.split(':');
  if (kind === 'tap') fromTap(repo, file); else fromVitest(repo, file);
}
writeFileSync(out, ['repo\tfile\ttest\tclass\tbasis\terror\tsource', ...rows.map(r => [r.repo, r.file, r.test, r.cls, r.basis, r.error, r.source].map(x => String(x).replace(/\t/g, ' ')).join('\t'))].join('\n') + '\n');
const t = {};
for (const r of rows) { const k = `${r.repo}\t${r.cls}`; t[k] = (t[k] || 0) + 1; }
console.log(rows.length, t);
