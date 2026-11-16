// Read-only re-check of SITES.tsv rows from the COMPLETE try/catch (judge finding 11). It is also the
// executable prototype of the gate's pure-parse exemption (DESIGN 3.7): it prints, per row, whether the
// site would pass `catch-reads-error` unchanged.
// Usage: node fp-recheck.cjs <SITES.tsv> <jiniRoot> <tovuRoot> [class=FP]
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const [tsv, jiniRoot, tovuRoot, wantClass = 'FP'] = process.argv.slice(2);

// Callees allowed inside an exempt try block. Listed, never inferred from shape.
const PURE_GLOBALS = new Set(['JSON.parse', 'decodeURIComponent', 'decodeURI', 'atob', 'BigInt', 'Number', 'String', 'Boolean',
  'Array.isArray', 'Array.from', 'Object.keys', 'Object.values', 'Object.entries', 'Object.fromEntries', 'Number.isFinite',
  'Number.isInteger', 'Number.isSafeInteger', 'Number.parseInt', 'Number.parseFloat', 'parseInt', 'parseFloat', 'URL.canParse',
  'Buffer.from', 'Buffer.byteLength', 'Date.parse', 'Math.min', 'Math.max', 'structuredClone', 'isRecord']);
const PURE_NEW = new Set(['URL', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Set', 'Map', 'TextDecoder', 'RegExp', 'Date', 'URLSearchParams', 'Uint8Array', 'Intl.Locale', 'Intl.DateTimeFormat', 'Intl.NumberFormat']);
// Member names of built-in string / array / regex / decoder / URL methods. A project helper is NOT here.
const PURE_MEMBERS = new Set(['test', 'decode', 'trim', 'toLowerCase', 'toUpperCase', 'startsWith', 'endsWith', 'includes', 'slice',
  'split', 'join', 'map', 'filter', 'every', 'some', 'find', 'replace', 'replaceAll', 'match', 'has', 'get', 'toString', 'normalize',
  'indexOf', 'lastIndexOf', 'localeCompare', 'sort', 'entries', 'keys', 'values', 'padStart', 'at', 'charCodeAt', 'codePointAt',
  'substring', 'flatMap', 'reduce', 'isArray', 'push', 'add', 'set', 'toISOString', 'getTime', 'format', 'trimEnd', 'trimStart']);
// `get`, `set`, `has`, `push`, `add` are also names of I/O methods on project objects; the prototype counts a
// row that needs one of them as "pure only by member name" so the number is visible.
const AMBIGUOUS_MEMBERS = new Set(['get', 'set', 'has', 'push', 'add', 'find', 'format', 'entries', 'keys', 'values']);

function calleeName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) { const left = calleeName(node.expression); return left && /^[A-Z]/.test(left) && !left.includes('.') ? `${left}.${node.name.text}` : `.${node.name.text}`; }
  return '?';
}
function inspectTry(tryBlock) {
  const impure = []; let hasAwait = false; let ambiguous = false;
  (function walk(node) {
    if (ts.isFunctionLike(node)) { ts.forEachChild(node, walk); return; }
    if (ts.isAwaitExpression(node) || ts.isYieldExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier)) hasAwait = true;
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name.startsWith('.')) { const member = name.slice(1); if (!PURE_MEMBERS.has(member)) impure.push(name); else if (AMBIGUOUS_MEMBERS.has(member)) ambiguous = true; }
      else if (!PURE_GLOBALS.has(name)) impure.push(name);
    }
    if (ts.isNewExpression(node)) { const name = calleeName(node.expression).replace(/^\./, ''); if (!PURE_NEW.has(name)) impure.push(`new ${name}`); }
    ts.forEachChild(node, walk);
  })(tryBlock);
  return { impure: [...new Set(impure)], hasAwait, ambiguous, statements: tryBlock.statements.length };
}
function catchShape(block) {
  if (!block || block.statements.length === 0) return 'empty';
  const last = block.statements[block.statements.length - 1];
  if (ts.isThrowStatement(last)) return 'throw'; if (ts.isReturnStatement(last)) return 'return'; return 'other';
}
function readsBinding(clause) {
  const decl = clause.variableDeclaration; if (!decl || !ts.isIdentifier(decl.name)) return false;
  const name = decl.name.text; let read = false;
  (function walk(node) { if (ts.isIdentifier(node) && node.text === name) read = true; ts.forEachChild(node, walk); })(clause.block);
  return read;
}
const cache = new Map();
function sourceOf(file) { if (!cache.has(file)) cache.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)); return cache.get(file); }
function lineOf(sf, pos) { return sf.getLineAndCharacterOfPosition(pos).line + 1; }

function recheck(file, line) {
  const sf = sourceOf(file); let best;
  (function walk(node) {
    if (ts.isTryStatement(node) && node.catchClause) {
      const from = lineOf(sf, node.catchClause.getStart(sf)); const to = lineOf(sf, node.catchClause.end);
      if (line >= from && line <= to) best = { kind: 'try', node, span: to - from };
      else if (!best && line >= lineOf(sf, node.getStart(sf)) && line <= to) best = { kind: 'try', node, span: 1e6 };
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch') {
      const from = lineOf(sf, node.expression.name.getStart(sf)); const to = lineOf(sf, node.end);
      if (line >= from && line <= to && (!best || best.kind !== 'try' || best.span > to - from)) best = { kind: 'dot', node, span: to - from };
    }
    ts.forEachChild(node, walk);
  })(sf);
  if (!best) return { kind: 'none' };
  if (best.kind === 'dot') {
    const text = t => t.replace(/\s+/g, ' ');
    return { kind: 'dot', receiver: text(best.node.expression.expression.getText(sf)).slice(0, 70), handler: text(best.node.arguments.map(a => a.getText(sf)).join(',')).slice(0, 50) };
  }
  const info = inspectTry(best.node.tryBlock); const clause = best.node.catchClause;
  const shape = catchShape(clause.block); const reads = readsBinding(clause);
  const exempt = !reads && !info.hasAwait && info.impure.length === 0 && shape !== 'empty';
  return { kind: 'try', ...info, shape, reads, exempt };
}

const rows = fs.readFileSync(tsv, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const tally = {};
for (const [repo, site, , status, cls, pattern] of rows) {
  if (!status.startsWith('current') || cls !== wantClass) continue;
  const [rel, lineText] = [site.slice(0, site.lastIndexOf(':')), site.slice(site.lastIndexOf(':') + 1)];
  const file = path.join(repo === 'jini' ? jiniRoot : tovuRoot, rel);
  let out;
  if (!/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(rel) || !fs.existsSync(file)) out = { kind: 'unreadable' };
  else { try { out = recheck(file, Number(lineText)); } catch { out = { kind: 'unreadable' }; } }
  const verdict = out.kind === 'try' ? (out.exempt ? (out.ambiguous ? 'EXEMPT-by-member-name' : 'EXEMPT') : out.reads ? 'READS-ERROR' : `NOT-EXEMPT(${out.hasAwait ? 'await;' : ''}${out.shape === 'empty' ? 'empty-catch;' : ''}${out.impure.slice(0, 6).join(',')})`) : out.kind === 'dot' ? `DOT ${out.receiver} => ${out.handler}` : out.kind.toUpperCase();
  const key = `${pattern.split(' ')[0]}\t${verdict.split('(')[0].split(' ')[0]}`; tally[key] = (tally[key] || 0) + 1;
  console.log([repo, site, pattern.split(' ')[0], out.kind === 'try' ? `stmts=${out.statements} catch=${out.shape}` : '', verdict].join('\t'));
}
console.error(Object.entries(tally).sort().map(([k, v]) => `${v}\t${k}`).join('\n'));
