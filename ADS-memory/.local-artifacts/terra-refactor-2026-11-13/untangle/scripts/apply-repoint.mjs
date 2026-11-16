#!/usr/bin/env node
// Scripted repoint applier for the untangle waves (review item B5).
//
// Usage:
//   node apply-repoint.mjs --tsv <a.tsv> [b.tsv ...] --repo-root jini=/path/jini --repo-root tovu=/path/tovu \
//        [--phase wave|all|a,b] [--dry-run]
//   --repo-root <path>        (bare path) used for every row whose repo has no name=path mapping
//   --phase                   rows whose phase is in the list are applied (default `wave`; an empty phase counts as `wave`)
//
// Row semantics (columns: repo file old_spec names new_spec [rename phase note ...], read by header name):
//   old_spec  `<spec>`                import { names } from '<spec>'
//             `export-from <spec>`    export { names } from '<spec>'
//             `export * from <spec>`  star re-export (only DROP acts: deletes the line)
//             `import('<spec>')`      type query / dynamic import specifier string (names pick `import('x').Name`)
//             `vi.mock('<spec>')`     vi.mock/doMock/unmock/importActual (also jest.*) specifier string
//   new_spec  <spec>   move the names there (merge into an existing statement, keep type-ness and aliases)
//             DROP / -  delete the names (statement goes if empty)
//             KEEP      no edit (counted)       MANUAL   no edit (listed)
//   rename    `Old->New[,..]` (a trailing `(... as ...)` keeps the old local name as an alias); other text is ignored.
//             Import rows: every in-file use of the local `Old` is renamed. Export rows: the exported name changes.
//             `Old<X> => Old<Args using X>[ (clauses)]`   type-argument template (v2): every `Old<T>` use (exactly one type
//             argument, T substituted for X) is rewritten; without `<X>`, every bare `Old` use becomes the template (uses that
//             already carry type arguments stay). Applies to type references and extends/implements. Clauses, `;`-separated:
//             `add import [type] { A, B } from "spec"` (also `add/merge import ...`: merged into an existing import of that
//             spec, else a new statement after the last import), or the notes `core`, `every bare type use`, `X from core`.
//             Any other identifier the template needs must already be bound in the file (or be a TypeScript lib global
//             such as HTMLElement), else the row is STALE.
//   same spec (new_spec == old_spec) with `Old->New`: in-place rename of the imported name (and its uses, or the alias
//             kept with the `(... as ...)` hint); works for import, export-from and inline import('<spec>').Old rows.
//   Unknown syntax in the rename column, or an `action` that is not an UPPER-CASE label (`SK-CORE+MOVE`), is a GrammarError:
//   printed as ERROR, nothing written, exit 1 (v1 silently ignored `=>`).
// A row whose names are in neither old_spec nor new_spec's statement is STALE: the run prints it, writes nothing, exits 1.
// v3 (Codex review r2):
//   - renames and templates resolve each use with the TypeScript checker (one file, no lib): shadowed bindings
//     (params, locals, type parameters, destructuring, catch, class/function names) are left alone; a binding of the
//     new name (or of a template identifier) that would capture a use is STALE; an unresolvable use is STALE.
//   - "already applied" needs the row's full postcondition (imported name, alias, type-only form when the row says
//     `type`, in new_spec; for a template, every use transformed), else STALE.
//   - templates and every changed file are parsed: a parse error in the template is a GrammarError, a new parse error
//     in the output is STALE (GrammarError for template rows). Templates on import()/vi.mock/export-from/DROP rows and
//     a new_spec that is not a module specifier are GrammarErrors.
//   - moved names keep their statement form: `import type { T }` stays declaration-level, `import { type T }` inline.
//   - writes are staged (temp file + rename per file, both repos); any failure rolls every file back.
//   - rows of one file apply in TSV order (later rows see earlier results).
// Known limits: DROP rows with names absent count as already applied (cannot tell stale from done).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

let tsCache;
export function loadTs() {
  if (tsCache) return tsCache;
  tsCache = findTs();
  return tsCache;
}

function findTs() {
  const roots = [
    process.env.TS_PATH,
    '/Users/la/Programming/jini-terra-base/node_modules/typescript',
    '/Users/la/Programming/Tovu/node_modules/typescript',
  ].filter(Boolean);
  for (const r of roots) {
    try {
      return require(r);
    } catch {
      /* try next */
    }
  }
  return require('typescript');
}

export class StaleRowError extends Error {}
export class GrammarError extends Error {}

const MOCK_METHODS = new Set(['mock', 'doMock', 'unmock', 'importActual', 'importMock', 'requireActual']);

export function parseOldSpec(old) {
  let m;
  if ((m = /^export-from\s+(.+)$/.exec(old))) return { kind: 'export', spec: m[1] };
  if ((m = /^export \* from\s+(.+)$/.exec(old))) return { kind: 'star', spec: m[1] };
  if ((m = /^import\((['"])(.*)\1\)$/.exec(old))) return { kind: 'dynimport', spec: m[2] };
  if ((m = /^(?:vi|jest)\.\w+\((['"])(.*)\1\)$/.exec(old))) return { kind: 'mock', spec: m[2] };
  return { kind: 'import', spec: old };
}

export function parseNames(names) {
  return names
    .split(',')
    .map((s) => s.trim().replace(/\s*\[.*\]$/, ''))
    .filter(Boolean)
    .map((s) => {
      const m = /^(type\s+)?([^\s]+?)(?:\s+as\s+(\S+))?$/.exec(s);
      return m ? { type: !!m[1], first: m[2], second: m[3] } : { type: false, first: s, second: undefined };
    });
}

const BUILTIN_TYPES = new Set(['unknown', 'any', 'never', 'void', 'null', 'undefined', 'string', 'number', 'boolean', 'object', 'symbol', 'bigint']);
const NOTE_CLAUSES = [/^core$/, /^every bare type use$/, /^\w+ from \w+$/];
const ADD_IMPORT = /^add(?:\/merge)? import\s+(type\s+)?\{([^{}]*)\}\s+from\s+(["'])([^"']+)\3$/;

function parseClauses(text, rename) {
  const adds = [];
  for (const c of (text || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const m = ADD_IMPORT.exec(c);
    if (m) {
      const names = m[2].split(',').map((x) => x.trim()).filter(Boolean);
      if (!names.length || names.some((n) => !/^\w+$/.test(n))) throw new GrammarError(`bad import names in clause '${c}' of rename '${rename}'`);
      adds.push({ typeOnly: !!m[1], names, spec: m[4] });
    } else if (!NOTE_CLAUSES.some((re) => re.test(c))) throw new GrammarError(`unknown clause '${c}' in rename '${rename}'`);
  }
  return adds;
}

function parseTemplate(rename) {
  const m = /^(\w+)(?:<(\w+)>)?\s*=>\s*([^()]+?)\s*(?:\(([^()]*)\))?\s*$/.exec(rename);
  if (!m) throw new GrammarError(`unknown rename syntax '${rename}'`);
  const [, old, placeholder, text, clauses] = m;
  if (!/^\w+<[\w<>, ]+>$/.test(text) || text.split('<').length !== text.split('>').length) throw new GrammarError(`bad template '${text}' in rename '${rename}'`);
  if (!new RegExp(`^${old}<`).test(text)) throw new GrammarError(`template '${text}' must start with '${old}<' (rename '${rename}')`);
  if (placeholder && !new RegExp(`\\b${placeholder}\\b`).test(text.slice(old.length))) throw new GrammarError(`placeholder ${placeholder} unused in '${text}'`);
  const ts = loadTs();
  const probe = ts.createSourceFile('template.ts', `type __T = ${text};`, ts.ScriptTarget.Latest, true);
  const alias = probe.statements[0];
  let trailingComma = false; // a checker (not parser) error in TypeScript, so look for it here
  const walk = (n) => {
    if (n.typeArguments?.hasTrailingComma) trailingComma = true;
    ts.forEachChild(n, walk);
  };
  walk(probe);
  if (probe.parseDiagnostics.length || trailingComma || probe.statements.length !== 1 || !ts.isTypeAliasDeclaration(alias) || !ts.isTypeReferenceNode(alias.type) || alias.type.typeName.getText(probe) !== old || !alias.type.typeArguments?.length) {
    throw new GrammarError(`template '${text}' is not a valid TypeScript type reference to ${old}<...> (rename '${rename}')`);
  }
  const idents = [...new Set(text.match(/[A-Za-z_]\w*/g))].filter((i) => i !== old && i !== placeholder && !BUILTIN_TYPES.has(i));
  return { old, placeholder, text, idents, adds: parseClauses(clauses, rename) };
}

/** Parse the rename column: `Old->New[ (note)][, ...]` or one `Old[<X>] => Template[ (clauses)]`; anything else is a GrammarError. */
export function parseRename(rename) {
  const map = new Map();
  const text = (rename || '').trim();
  if (!text) return { map, template: null };
  if (text.includes('=>')) return { map, template: parseTemplate(text) };
  for (const part of text.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\w+)->(\w+)(?:\s*\(([^()]*)\))?$/.exec(part);
    if (!m) throw new GrammarError(`unknown rename syntax '${part}' (expected Old->New, or Old[<X>] => Template)`);
    map.set(m[1], { to: m[2], aliasMode: !!m[3] && /\bas\b/.test(m[3]) });
  }
  return { map, template: null };
}

export function parseRenames(rename) {
  return { map: parseRename(rename).map, ignored: [] };
}

function checkAction(action) {
  const a = (action || '').trim();
  if (a && !/^[A-Z0-9][A-Z0-9+-]*$/.test(a)) throw new GrammarError(`unknown syntax in action '${a}' (expected a label like SK-CORE+MOVE)`);
}


const SPEC = /^(?:\.{1,2}|\.{1,2}\/[^\s'"`(),;+]*|@[\w.-]+\/[^\s'"`(),;+]*|node:[^\s'"`(),;+]+|[A-Za-z0-9_][^\s'"`(),;+]*)$/;

/** new_spec must be a module specifier (or DROP/-/KEEP/MANUAL, handled earlier); prose such as `C1+ (see ...)` is a GrammarError. */
function checkSpec(target) {
  if (!SPEC.test(target)) throw new GrammarError(`new_spec '${target}' is not a module specifier (use DROP, KEEP or MANUAL and put the text in note)`);
}

function applyEdits(text, edits, eol = '\n') {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].end > sorted[i - 1].start) throw new Error('internal: overlapping edits');
  }
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + (eol === '\n' ? e.text : e.text.replace(/\r?\n/g, eol)) + out.slice(e.end);
  return out;
}

function scriptKind(ts, file) {
  if (/\.(tsx|jsx)$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.(js|mjs|cjs)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

const parseSf = (ts, file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(ts, file));
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

function lineEndAfter(text, pos) {
  if (text[pos] === '\r' && text[pos + 1] === '\n') return pos + 2;
  if (text[pos] === '\n') return pos + 1;
  return pos;
}

function deleteStatement(text, node, sf) {
  const start = node.getStart(sf);
  let ls = start;
  while (ls > 0 && (text[ls - 1] === ' ' || text[ls - 1] === '\t')) ls--;
  const atLineStart = ls === 0 || text[ls - 1] === '\n';
  return { start: atLineStart ? ls : start, end: lineEndAfter(text, node.end), text: '' };
}

// ---- scope: one-file TypeScript checker (no lib, no module resolution) ----

/** Lazily builds a checker over `sf` alone; imports stay unresolved aliases, which is all the scope checks need. */
function makeScope(ts, sf) {
  let checker;
  return () => {
    if (!checker) {
      const host = {
        getSourceFile: () => sf,
        getDefaultLibFileName: () => '/__no-lib__.d.ts',
        writeFile() {},
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (f) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: () => true,
        readFile: () => undefined,
      };
      const options = { noLib: true, noResolve: true, types: [], allowJs: true, jsx: ts.JsxEmit.Preserve };
      checker = ts.createProgram({ rootNames: [sf.fileName], options, host }).getTypeChecker();
    }
    return checker;
  };
}

const anyMeaning = (ts) => ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Alias;

/** Identifier positions that never refer to a binding: member names, labels, import('x') qualifiers. */
function isNonReference(ts, n) {
  const p = n.parent;
  if (!p) return true;
  if (ts.isQualifiedName(p) && p.right === n) return true;
  const named = ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isEnumMember(p) || ts.isJsxAttribute(p);
  if (named && p.name === n) return true;
  if (ts.isBindingElement(p) && p.propertyName === n) return true;
  if (ts.isImportTypeNode(p) || ts.isMetaProperty(p)) return true;
  return ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p);
}

function refSymbol(ts, c, id) {
  const p = id.parent;
  if (ts.isShorthandPropertyAssignment(p) && p.name === id) return c.getShorthandAssignmentValueSymbol(p);
  if (ts.isExportSpecifier(p) && (p.propertyName ?? p.name) === id) return c.getExportSpecifierLocalTargetSymbol(p);
  return c.getSymbolAtLocation(id);
}

/** Reference identifiers spelled `name`, outside import / export-from statements. */
function referenceIds(ts, sf, name) {
  const out = [];
  const walk = (n) => {
    if (ts.isImportDeclaration(n) || (ts.isExportDeclaration(n) && n.moduleSpecifier)) return;
    if (ts.isIdentifier(n) && n.text === name && !isNonReference(ts, n)) out.push(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

/** The uses of binding `sym` (spelled `local`). Same-spelled identifiers bound elsewhere (shadowing) are left out; an unresolvable one is STALE. */
function usesOf(ts, sf, check, local, sym) {
  const c = check();
  return referenceIds(ts, sf, local).filter((id) => {
    const s = refSymbol(ts, c, id);
    if (!s) throw new StaleRowError(`cannot resolve \`${local}\` at line ${lineOf(sf, id)} (scope unclear; rename by hand)`);
    return s === sym;
  });
}

/** Renaming to `to` must not capture: no binding of `to` (other than `allowed`) visible at a use or at top level, and no free use of `to`. */
function checkCapture(ts, sf, check, uses, to, allowed) {
  const c = check();
  const ok = (x) => allowed.includes(x);
  for (const u of uses) {
    const x = c.resolveName(to, u, anyMeaning(ts), false);
    if (x && !ok(x)) throw new StaleRowError(`renaming to \`${to}\` would capture the use at line ${lineOf(sf, u)}: a binding of \`${to}\` is in scope there (rename by hand)`);
  }
  const top = c.resolveName(to, sf.endOfFileToken, anyMeaning(ts), false);
  if (top && !ok(top)) throw new StaleRowError(`name conflict: the file already binds \`${to}\` (rename by hand)`);
  for (const id of referenceIds(ts, sf, to)) {
    if (!refSymbol(ts, c, id)) throw new StaleRowError(`\`${to}\` is used free at line ${lineOf(sf, id)}; the rename would capture it (rename by hand)`);
  }
}

function renameUseEdits(ts, sf, uses, to) {
  return uses.map((n) => {
    const p = n.parent;
    const at = { start: n.getStart(sf), end: n.end };
    if (ts.isShorthandPropertyAssignment(p) && p.name === n) return { ...at, text: `${n.text}: ${to}` };
    if (ts.isExportSpecifier(p) && !p.propertyName) return { ...at, text: `${to} as ${n.text}` };
    return { ...at, text: to };
  });
}

// ---- generic import / export-from statements ----

function makeKind(ts, kind) {
  if (kind === 'import') {
    return {
      kw: 'import',
      decls: (sf) => sf.statements.filter((s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)),
      bindings: (d) => (d.importClause?.namedBindings && ts.isNamedImports(d.importClause.namedBindings) ? d.importClause.namedBindings : undefined),
      declType: (d) => !!d.importClause?.isTypeOnly,
      defaultName: (d) => d.importClause?.name,
    };
  }
  return {
    kw: 'export',
    decls: (sf) => sf.statements.filter((s) => ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) && s.exportClause && ts.isNamedExports(s.exportClause)),
    bindings: (d) => d.exportClause,
    declType: (d) => !!d.isTypeOnly,
    defaultName: () => undefined,
  };
}

const elInfo = (K, d, el) => ({
  el,
  decl: d,
  first: (el.propertyName ?? el.name).text,
  second: el.name.text,
  hasAlias: !!el.propertyName,
  declType: K.declType(d),
  typeOnly: !!el.isTypeOnly || K.declType(d),
});

const nameMatches = (n, info) => info.first === n.first && (n.second === undefined || info.second === n.second);

/** What a done row leaves in the destination: imported name, local name, and the type-only form when the row says `type`. */
function expectedBinding(n, r, kind) {
  const first = r ? r.to : n.first;
  let second = first;
  if (n.second !== undefined) second = n.second;
  else if (r && r.aliasMode && kind === 'import') second = n.first;
  return { first, second, type: n.type };
}

const satisfies = (info, want) => info.first === want.first && info.second === want.second && (!want.type || info.typeOnly);

function removalEdits(text, sf, K, d, removedEls) {
  const b = K.bindings(d);
  const els = [...b.elements];
  const kept = els.filter((e) => !removedEls.has(e));
  if (kept.length === 0) {
    const def = K.defaultName(d);
    if (def) return [{ start: def.end, end: b.end, text: '' }];
    return null; // whole statement goes
  }
  const edits = [];
  let i = 0;
  while (i < els.length) {
    if (!removedEls.has(els[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < els.length && removedEls.has(els[j + 1])) j++;
    if (j + 1 < els.length) edits.push({ start: els[i].getStart(sf), end: els[j + 1].getStart(sf), text: '' });
    else edits.push({ start: els[i - 1].end, end: els[j].end, text: '' });
    i = j + 1;
  }
  return edits;
}

function elementText(it, destIsType) {
  const prefix = it.typeOnly && !destIsType ? 'type ' : '';
  return prefix + it.outFirst + (it.outAlias ? ` as ${it.outAlias}` : '');
}

function newStatement(K, items, typeStmt, target, quote, semi) {
  const parts = items.map((it) => elementText(it, typeStmt));
  const head = `${K.kw}${typeStmt ? ' type' : ''}`;
  let body = `${head} { ${parts.join(', ')} } from ${quote}${target}${quote}${semi}`;
  if (body.length > 100) body = `${head} {\n${parts.map((p) => `  ${p},`).join('\n')}\n} from ${quote}${target}${quote}${semi}`;
  return body;
}

function appendEdit(text, sf, K, d, strs) {
  const b = K.bindings(d);
  if (b.elements.length === 0) return { start: b.getStart(sf) + 1, end: b.getStart(sf) + 1, text: ` ${strs.join(', ')} ` };
  const last = b.elements[b.elements.length - 1];
  const multi = text.slice(b.getStart(sf), b.end).includes('\n');
  if (!multi) return { start: last.end, end: last.end, text: strs.map((s) => `, ${s}`).join('') };
  let ls = last.getStart(sf);
  while (ls > 0 && text[ls - 1] !== '\n') ls--;
  const indent = /^[ \t]*/.exec(text.slice(ls))[0];
  return { start: last.end, end: last.end, text: strs.map((s) => `,\n${indent}${s}`).join('') };
}

/** Split the row's names into those still in old_spec (to move) and those whose postcondition already holds in new_spec. */
function locateNames(K, parsed, row, names, renames, olds, dests, drop) {
  const moved = [];
  const done = [];
  for (const n of names) {
    let found = null;
    for (const d of olds) {
      const b = K.bindings(d);
      if (!b) continue;
      found = b.elements.map((e) => elInfo(K, d, e)).find((i) => nameMatches(n, i) && !moved.some((m) => m.el === i.el));
      if (found) break;
    }
    if (found) {
      moved.push(found);
      continue;
    }
    if (drop) {
      done.push({ n });
      continue;
    }
    const want = expectedBinding(n, renames.get(n.first), parsed.kind);
    const hit = dests.flatMap((d) => K.bindings(d).elements.map((e) => elInfo(K, d, e))).find((i) => satisfies(i, want));
    if (!hit) throw new StaleRowError(`names not found in ${parsed.kind === 'import' ? 'import' : 'export-from'} of '${parsed.spec}', and '${row.new_spec}' has no ${want.type ? 'type ' : ''}${want.first}${want.second !== want.first ? ` as ${want.second}` : ''}: ${n.first}`);
    done.push({ n, hit });
  }
  return { moved, done };
}

function applyNamedRow(ts, text, sf, check, row, parsed, drop) {
  const K = makeKind(ts, parsed.kind);
  const names = parseNames(row.names);
  const { map: renames, template } = parseRename(row.rename);
  const decls = K.decls(sf);
  const olds = decls.filter((d) => d.moduleSpecifier.text === parsed.spec);
  const dests = drop ? [] : decls.filter((d) => d.moduleSpecifier.text === row.new_spec && K.bindings(d));
  const { moved, done } = locateNames(K, parsed, row, names, renames, olds, dests, drop);
  if (template) {
    const doneT = done.find((x) => x.n.first === template.old);
    if (doneT) checkTemplateDone(ts, sf, check, template, doneT.hit);
  }
  if (moved.length === 0) return { edits: [], status: 'already' };

  const edits = [];
  const items = [];
  const useRenames = [];
  for (const m of moved) {
    const r = renames.get(m.first);
    let outFirst = m.first;
    let outAlias = m.hasAlias ? m.second : undefined;
    if (r) {
      outFirst = r.to;
      if (!m.hasAlias) {
        if (r.aliasMode && parsed.kind === 'import') outAlias = m.first;
        else if (parsed.kind === 'import') useRenames.push({ m, to: r.to });
      }
    }
    if (outAlias === outFirst) outAlias = undefined;
    items.push({ ...m, outFirst, outAlias, key: `${outFirst}|${outAlias ?? outFirst}` });
  }

  // 1. remove from the old statements
  const byDecl = new Map();
  for (const m of moved) {
    if (!byDecl.has(m.decl)) byDecl.set(m.decl, new Set());
    byDecl.get(m.decl).add(m.el);
  }
  let replaceDecl = null;
  let lastOld = null;
  for (const [d, set] of byDecl) {
    const r = removalEdits(text, sf, K, d, set);
    lastOld = d;
    if (r) edits.push(...r);
    else if (!replaceDecl && !drop) replaceDecl = d;
    else edits.push(deleteStatement(text, d, sf));
  }
  if (drop) return { edits, status: 'applied' };

  // 2. add to the destination; `import type { T }` stays declaration-level, `import { type T }` stays inline (REVIEW N1)
  const has = (d, it) => K.bindings(d).elements.some((e) => elInfo(K, d, e).first === it.outFirst && elInfo(K, d, e).second === (it.outAlias ?? it.outFirst));
  const appends = new Map();
  const leftoverValue = [];
  const leftoverType = [];
  for (const it of [...items.filter((i) => !i.declType), ...items.filter((i) => i.declType)]) {
    if (dests.some((x) => has(x, it))) continue;
    const d = dests.find((x) => K.declType(x) === it.declType);
    if (!d) {
      (it.declType ? leftoverType : leftoverValue).push(it);
      continue;
    }
    if (!appends.has(d)) appends.set(d, []);
    const list = appends.get(d);
    if (!list.some((s) => s.key === it.key)) list.push({ key: it.key, str: elementText(it, K.declType(d)) });
  }
  for (const [d, list] of appends) edits.push(appendEdit(text, sf, K, d, list.map((l) => l.str)));
  const anchor = replaceDecl ?? lastOld;
  const quote = anchor.moduleSpecifier.getText(sf)[0];
  const semi = /;\s*$/.test(anchor.getText(sf)) ? ';' : '';
  const stmts = [];
  if (leftoverValue.length) stmts.push(newStatement(K, dedupe(leftoverValue), false, row.new_spec, quote, semi));
  if (leftoverType.length) stmts.push(newStatement(K, dedupe(leftoverType), true, row.new_spec, quote, semi));
  if (replaceDecl) {
    if (stmts.length) edits.push({ start: replaceDecl.getStart(sf), end: replaceDecl.end, text: stmts.join('\n') });
    else edits.push(deleteStatement(text, replaceDecl, sf));
  } else if (stmts.length) {
    edits.push({ start: lastOld.end, end: lastOld.end, text: `\n${stmts.join('\n')}` });
  }

  // 3. renamed uses: only references that resolve to the moved import; a binding of the new name in scope is STALE
  const c = useRenames.length ? check() : null;
  for (const { m, to } of useRenames) {
    const sym = c.getSymbolAtLocation(m.el.name);
    const uses = usesOf(ts, sf, check, m.second, sym);
    const allowed = dests.flatMap((d) => K.bindings(d).elements.filter((e) => (e.propertyName ?? e.name).text === to && e.name.text === to).map((e) => c.getSymbolAtLocation(e.name)));
    checkCapture(ts, sf, check, uses, to, allowed);
    edits.push(...renameUseEdits(ts, sf, uses, to));
  }
  if (template) {
    const m = moved.find((x) => x.first === template.old);
    if (!m && !done.some((x) => x.n.first === template.old)) throw new StaleRowError(`template names '${template.old}' but the row moves ${moved.map((x) => x.first).join(',')}`);
    if (m) edits.push(...settleInserts(templateEdits(ts, text, sf, check, template, m), edits));
  }
  return { edits, status: 'applied' };
}

// ---- v2: bound names, extra imports, type-argument templates, in-place rename ----

/** Local name -> module specifier ('' for a top-level declaration) for everything the file binds at top level. */
function boundNames(ts, sf) {
  const out = new Map();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause;
      const spec = ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : '';
      if (c.name) out.set(c.name.text, spec);
      const nb = c.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) out.set(nb.name.text, spec);
      if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) out.set(e.name.text, spec);
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) out.set(st.name.text, '');
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.set(d.name.text, '');
  }
  return out;
}

/** Edits that add `import [type] { names } from spec` (merged into an existing import of that spec when there is one). */
function addImportEdits(ts, text, sf, adds, bound) {
  const edits = [];
  const K = makeKind(ts, 'import');
  const imports = sf.statements.filter((st) => ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier));
  const pendingNew = new Map();
  for (const a of adds) {
    for (const name of a.names) {
      if (bound.has(name)) {
        if (bound.get(name) !== a.spec) throw new StaleRowError(`cannot add import { ${name} } from '${a.spec}': the file already binds \`${name}\`${bound.get(name) ? ` from '${bound.get(name)}'` : ''}`);
        continue;
      }
      bound.set(name, a.spec);
      const dest = imports.filter((d) => d.moduleSpecifier.text === a.spec && K.bindings(d)).sort((x, y) => Number(K.declType(y) === a.typeOnly) - Number(K.declType(x) === a.typeOnly))[0];
      if (dest && (!K.declType(dest) || a.typeOnly)) edits.push(appendEdit(text, sf, K, dest, [(a.typeOnly && !K.declType(dest) ? 'type ' : '') + name]));
      else {
        const key = `${a.spec}|${a.typeOnly}`;
        if (!pendingNew.has(key)) pendingNew.set(key, { spec: a.spec, typeOnly: a.typeOnly, items: [] });
        pendingNew.get(key).items.push({ typeOnly: a.typeOnly, outFirst: name, outAlias: undefined });
      }
    }
  }
  if (!pendingNew.size) return edits;
  const anchor = imports[imports.length - 1];
  const quote = anchor ? anchor.moduleSpecifier.getText(sf)[0] : '"';
  const semi = !anchor || /;\s*$/.test(anchor.getText(sf)) ? ';' : '';
  const stmts = [...pendingNew.values()].map((g) => newStatement(K, g.items, g.typeOnly, g.spec, quote, semi));
  edits.push(anchor ? { start: anchor.end, end: anchor.end, text: `\n${stmts.join('\n')}` } : { start: 0, end: 0, text: `${stmts.join('\n')}\n` });
  return edits;
}

const rootIdent = (ts, n) => (ts.isTypeReferenceNode(n) ? n.typeName : ts.isExpressionWithTypeArguments(n) ? n.expression : null);

/** Type uses (type reference or extends/implements) of the binding `sym`, spelled `local`. Shadowed ones are left out; a use nested in another use is STALE. */
function templateSites(ts, sf, check, local, sym, oldName) {
  const c = check();
  const sites = [];
  const walk = (n) => {
    if (ts.isImportDeclaration(n) || (ts.isExportDeclaration(n) && n.moduleSpecifier)) return;
    const id = rootIdent(ts, n);
    if (id && ts.isIdentifier(id) && id.text === local) {
      const s = c.getSymbolAtLocation(id);
      if (!s) throw new StaleRowError(`cannot resolve type \`${local}\` at line ${lineOf(sf, id)} (scope unclear; rewrite by hand)`);
      if (s === sym) sites.push(n);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  const set = new Set(sites);
  for (const n of sites) {
    for (let p = n.parent; p; p = p.parent) if (set.has(p)) throw new StaleRowError(`nested use of ${oldName} inside its own type argument at line ${lineOf(sf, n)} (rewrite by hand)`);
  }
  return sites;
}

function renderTemplate(t, local, argText) {
  const body = t.placeholder ? t.text.replace(new RegExp(`\\b${t.placeholder}\\b`, 'g'), () => argText) : t.text;
  return local + body.slice(t.old.length);
}

let libGlobalsCache;
/** Global names declared by TypeScript's own lib files (es*, dom, ...): a template may name them without an import. */
function libGlobals(ts) {
  if (libGlobalsCache) return libGlobalsCache;
  const dir = path.dirname(ts.getDefaultLibFilePath({}));
  const out = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => /^lib\..*\.d\.ts$/.test(x))) {
    const sf = ts.createSourceFile(f, fs.readFileSync(path.join(dir, f), 'utf8'), ts.ScriptTarget.Latest, false);
    for (const st of sf.statements) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
      } else if (st.name && ts.isIdentifier(st.name)) out.add(st.name.text);
    }
  }
  libGlobalsCache = out;
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex matching a use already in the template's output form (whitespace ignored). */
function templateOutputRe(t, local) {
  const body = t.text.slice(t.old.length).replace(/\s+/g, '');
  if (!t.placeholder) return new RegExp(`^${escapeRe(local + body)}$`);
  let first = true;
  const parts = body.split(new RegExp(`\\b${t.placeholder}\\b`)).map(escapeRe);
  const re = parts.reduce((acc, p, i) => {
    if (i === 0) return p;
    const g = first ? '(.+)' : '\\1';
    first = false;
    return `${acc}${g}${p}`;
  }, '');
  return new RegExp(`^${escapeRe(local)}${re}$`);
}

/** Template target already in new_spec: every use must be in the output form, else the file is half-done (STALE). */
function checkTemplateDone(ts, sf, check, t, hit) {
  const sym = check().getSymbolAtLocation(hit.el.name);
  const re = templateOutputRe(t, hit.second);
  for (const n of templateSites(ts, sf, check, hit.second, sym, t.old)) {
    const args = n.typeArguments ?? [];
    const transformed = t.placeholder ? re.test(n.getText(sf).replace(/\s+/g, '')) : args.length > 0;
    if (!transformed) throw new StaleRowError(`${t.old} is already imported from the new spec but the use at line ${lineOf(sf, n)} is not in the template form '${t.text}' (half-applied; fix by hand)`);
  }
}

function templateEdits(ts, text, sf, check, t, m) {
  const c = check();
  const sym = c.getSymbolAtLocation(m.el.name);
  const sites = templateSites(ts, sf, check, m.second, sym, t.old);
  const edits = [];
  const touched = [];
  for (const n of sites) {
    const args = n.typeArguments ? [...n.typeArguments] : [];
    if (t.placeholder ? args.length !== 1 : args.length > 0) {
      if (t.placeholder) throw new StaleRowError(`${t.old} used with ${args.length} type arguments (need exactly one for <${t.placeholder}>): line ${lineOf(sf, n)}`);
      continue; // already generic
    }
    touched.push(n);
    edits.push({ start: n.getStart(sf), end: n.end, text: renderTemplate(t, m.second, args.length ? text.slice(args[0].getStart(sf), args[0].end) : '') });
  }
  if (!edits.length) return [];
  // identifiers the template introduces must mean the top-level binding at every use (no capture by a local / type parameter)
  for (const ident of t.idents) {
    const top = c.resolveName(ident, sf.endOfFileToken, anyMeaning(ts), false);
    for (const n of touched) {
      const x = c.resolveName(ident, n, anyMeaning(ts), false);
      if (x && x !== top) throw new StaleRowError(`template identifier \`${ident}\` would be captured by a local binding at line ${lineOf(sf, n)} (rewrite by hand)`);
    }
  }
  const bound = boundNames(ts, sf);
  for (const a of t.adds) for (const x of a.names) if (!bound.has(x)) bound.set(x, a.spec);
  const missing = t.idents.filter((i) => !bound.has(i) && !libGlobals(ts).has(i));
  if (missing.length) throw new StaleRowError(`template '${t.text}' needs ${missing.join(', ')}: not bound in the file and no \`add import\` clause names it`);
  return [...edits, ...addImportEdits(ts, text, sf, t.adds, boundNames(ts, sf))];
}

/** An insert at the end of a statement the same row deletes (deleteStatement swallows the newline) moves to the start of the next line. */
function settleInserts(added, existing) {
  return added.map((e) => {
    if (e.start !== e.end) return e;
    const del = existing.find((d) => d.text === '' && d.start < e.start && e.start < d.end);
    return del ? { start: del.end, end: del.end, text: `${e.text.replace(/^\n/, '')}\n` } : e;
  });
}

function renameElementEdit(ts, sf, info, r, kind) {
  const { el } = info;
  if (info.hasAlias) return { edit: { start: el.propertyName.getStart(sf), end: el.propertyName.end, text: r.to } };
  if (kind === 'import' && r.aliasMode) return { edit: { start: el.name.getStart(sf), end: el.name.end, text: `${r.to} as ${info.first}` } };
  return { edit: { start: el.name.getStart(sf), end: el.name.end, text: r.to }, useRename: kind === 'import' };
}

/** new_spec == old_spec with `Old->New`: rename the imported (or re-exported) name in place. */
function applyInPlaceRow(ts, text, sf, check, row, parsed) {
  const K = makeKind(ts, parsed.kind);
  const names = parseNames(row.names);
  const { map: renames } = parseRename(row.rename);
  const decls = K.decls(sf).filter((d) => d.moduleSpecifier.text === parsed.spec && K.bindings(d));
  const edits = [];
  let applied = 0;
  for (const n of names) {
    const r = renames.get(n.first);
    if (!r) continue;
    const infos = decls.flatMap((d) => K.bindings(d).elements.map((e) => elInfo(K, d, e)));
    const hit = infos.find((i) => nameMatches(n, i));
    if (!hit) {
      const want = expectedBinding(n, r, parsed.kind);
      if (infos.some((i) => satisfies(i, want))) continue;
      throw new StaleRowError(`names not found in ${parsed.kind === 'import' ? 'import' : 'export-from'} of '${parsed.spec}' (neither ${n.first} nor the renamed ${want.first}${want.second !== want.first ? ` as ${want.second}` : ''}): ${n.first}`);
    }
    const res = renameElementEdit(ts, sf, hit, r, parsed.kind);
    edits.push(res.edit);
    if (res.useRename) {
      const uses = usesOf(ts, sf, check, hit.second, check().getSymbolAtLocation(hit.el.name));
      checkCapture(ts, sf, check, uses, r.to, []);
      edits.push(...renameUseEdits(ts, sf, uses, r.to));
    }
    applied++;
  }
  return { edits, status: applied ? 'applied' : 'already' };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => (seen.has(i.key) ? false : seen.add(i.key)));
}

function applyStarRow(ts, text, sf, parsed, drop) {
  if (!drop) return { edits: [], status: 'skip' };
  const hits = sf.statements.filter((s) => ts.isExportDeclaration(s) && !s.exportClause && s.moduleSpecifier?.text === parsed.spec);
  if (!hits.length) return { edits: [], status: 'already' };
  return { edits: hits.map((h) => deleteStatement(text, h, sf)), status: 'applied' };
}

function collectStringSites(ts, sf, parsed, names) {
  const sites = [];
  const bases = names.map((n) => n.first).filter((n) => n !== 'mock' && n !== '*');
  const walk = (n) => {
    if (parsed.kind === 'dynimport') {
      if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
        const q = n.qualifier ? leftmost(ts, n.qualifier) : null;
        if (!q || !bases.length || bases.includes(q.text)) sites.push({ lit: n.argument.literal, qualifier: q });
      } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        sites.push({ lit: n.arguments[0], qualifier: null });
      }
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && ['vi', 'jest'].includes(n.expression.expression.text) && MOCK_METHODS.has(n.expression.name.text) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      sites.push({ lit: n.arguments[0], qualifier: null });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return sites;
}

const leftmost = (ts, q) => (ts.isQualifiedName(q) ? leftmost(ts, q.left) : q);

function applyInPlaceString(ts, sf, row, parsed, renames) {
  const names = [...parseNames(row.names || ''), ...[...renames.values()].map((v) => ({ first: v.to }))];
  const sites = collectStringSites(ts, sf, parsed, names).filter((s) => s.lit.text === parsed.spec && s.qualifier);
  const edits = sites.filter((s) => renames.has(s.qualifier.text)).map((s) => ({ start: s.qualifier.getStart(sf), end: s.qualifier.end, text: renames.get(s.qualifier.text).to }));
  if (edits.length) return { edits, status: 'applied' };
  if (sites.some((s) => [...renames.values()].some((v) => v.to === s.qualifier.text))) return { edits: [], status: 'already' };
  throw new StaleRowError(`no ${parsed.kind === 'mock' ? 'vi.mock' : "import('')"} of '${parsed.spec}' with a renamed qualifier found`);
}

function applyStringRow(ts, sf, row, parsed) {
  const names = parseNames(row.names || '');
  const { map: renames } = parseRename(row.rename);
  if (parsed.kind === 'dynimport' && row.new_spec.trim() === parsed.spec) return applyInPlaceString(ts, sf, row, parsed, renames);
  const sites = collectStringSites(ts, sf, parsed, names);
  const todo = sites.filter((s) => s.lit.text === parsed.spec);
  if (!todo.length) {
    if (sites.some((s) => s.lit.text === row.new_spec)) return { edits: [], status: 'already' };
    throw new StaleRowError(`no ${parsed.kind === 'mock' ? 'vi.mock' : "import('')"} of '${parsed.spec}' found`);
  }
  const edits = [];
  for (const s of todo) {
    edits.push({ start: s.lit.getStart(sf) + 1, end: s.lit.end - 1, text: row.new_spec });
    if (s.qualifier && renames.has(s.qualifier.text)) edits.push({ start: s.qualifier.getStart(sf), end: s.qualifier.end, text: renames.get(s.qualifier.text).to });
  }
  return { edits, status: 'applied' };
}

const KIND_LABEL = { import: 'import', export: 'export-from', star: 'export *', dynimport: "import('')", mock: 'vi.mock' };

/** Apply one row to a file's text. Returns { text, status: 'applied'|'already'|'skip' }; throws StaleRowError / GrammarError. */
export function applyRowToText(ts, text, file, row) {
  const target = (row.new_spec || '').trim();
  const parsed = parseOldSpec(row.old_spec);
  if (target === '' || target === 'KEEP' || target === 'MANUAL') return { text, status: 'skip' };
  checkAction(row.action);
  const { map: renames, template } = parseRename(row.rename);
  const drop = target === 'DROP' || target === '-';
  if (!drop) checkSpec(target);
  const inPlace = !drop && target === parsed.spec;
  if (template) {
    if (inPlace) throw new GrammarError(`a type-argument template needs a move (new_spec differs from '${parsed.spec}'): ${row.rename}`);
    if (drop) throw new GrammarError(`a type-argument template on a DROP row does nothing: ${row.rename}`);
    if (parsed.kind !== 'import') throw new GrammarError(`type-argument templates work only on import rows, not ${KIND_LABEL[parsed.kind]} rows (rewrite by hand or split the row): ${row.rename}`);
  }
  if (inPlace && !renames.size) return { text, status: 'skip' };
  const sf = parseSf(ts, file, text);
  const check = makeScope(ts, sf);
  let r;
  if (parsed.kind === 'star') r = applyStarRow(ts, text, sf, parsed, drop);
  else if (inPlace && parsed.kind !== 'dynimport' && parsed.kind !== 'mock') r = applyInPlaceRow(ts, text, sf, check, row, parsed);
  else if (parsed.kind === 'dynimport' || parsed.kind === 'mock') r = drop || (inPlace && parsed.kind === 'mock') ? { edits: [], status: 'skip' } : applyStringRow(ts, sf, row, parsed);
  else r = applyNamedRow(ts, text, sf, check, row, parsed, drop);
  if (!r.edits.length) return { text, status: r.status };
  const out = applyEdits(text, r.edits, /\r\n/.test(text) ? '\r\n' : '\n');
  const after = parseSf(ts, file, out).parseDiagnostics;
  if (after.length > sf.parseDiagnostics.length) {
    const E = template ? GrammarError : StaleRowError;
    throw new E(`the edit would leave a TypeScript parse error (${ts.flattenDiagnosticMessageText(after[0].messageText, ' ')}); nothing written`);
  }
  return { text: out, status: r.status };
}

export function readTsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const head = lines[0].split('\t');
  const rows = [];
  lines.forEach((l, i) => {
    if (i === 0 || !l.trim()) return;
    const cells = l.split('\t');
    const row = Object.fromEntries(head.map((h, k) => [h, cells[k] ?? '']));
    row._src = `${path.basename(file)}:${i + 1}`;
    rows.push(row);
  });
  return rows;
}

function parseArgs(argv) {
  const o = { tsv: [], roots: [], dry: false, phase: 'wave' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--phase') o.phase = argv[++i];
    else if (a === '--repo-root') o.roots.push(argv[++i]);
    else if (a === '--tsv') while (argv[i + 1] && !argv[i + 1].startsWith('--')) o.tsv.push(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

/**
 * Write every changed file or none: refuse if a file changed on disk since it was read, stage each new text in a temp
 * file next to its target (same filesystem, mode copied), then rename them in; on any failure the files already renamed
 * get their original text back (same temp + rename) and the temp files are removed.
 */
export function commitFiles(changed, fsi = fs) {
  for (const r of changed) {
    if (fsi.readFileSync(r.abs, 'utf8') !== r.orig) throw new Error(`${r.abs} changed on disk since it was read`);
  }
  const staged = [];
  const cleanup = () => {
    for (const s of staged) {
      try {
        if (fsi.existsSync(s.tmp)) fsi.unlinkSync(s.tmp);
      } catch {
        /* best effort */
      }
    }
  };
  const tmpFor = (abs) => path.join(path.dirname(abs), `.${path.basename(abs)}.repoint-${process.pid}.tmp`);
  try {
    for (const r of changed) {
      const s = { r, tmp: tmpFor(r.abs) };
      staged.push(s);
      fsi.writeFileSync(s.tmp, r.text);
      fsi.chmodSync(s.tmp, fsi.statSync(r.abs).mode & 0o7777);
    }
  } catch (e) {
    cleanup();
    throw new Error(`staging failed (${e.message})`);
  }
  const done = [];
  try {
    for (const s of staged) {
      fsi.renameSync(s.tmp, s.r.abs);
      done.push(s);
    }
  } catch (e) {
    const lost = [];
    for (const s of done.reverse()) {
      try {
        fsi.writeFileSync(s.tmp, s.r.orig);
        fsi.renameSync(s.tmp, s.r.abs);
      } catch {
        lost.push(s.r.abs);
        try {
          fsi.writeFileSync(`${s.r.abs}.repoint-orig`, s.r.orig);
        } catch {
          /* reported below */
        }
      }
    }
    cleanup();
    throw new Error(`rename failed (${e.message}); ${done.length - lost.length} file(s) rolled back${lost.length ? `; COULD NOT RESTORE ${lost.join(', ')} (original saved as <file>.repoint-orig)` : ''}`);
  }
}

export function run(argv, out = console.log, deps = {}) {
  const fsi = deps.fs ?? fs;
  const opt = parseArgs(argv);
  if (!opt.tsv.length || !opt.roots.length) throw new Error('usage: --tsv <files...> --repo-root [repo=]<path> [--phase p] [--dry-run]');
  const ts = loadTs();
  const rootFor = (repo) => {
    const named = opt.roots.find((r) => r.startsWith(`${repo}=`));
    if (named) return named.slice(repo.length + 1);
    return opt.roots.find((r) => !/^\w+=/.test(r));
  };
  const phases = opt.phase === 'all' ? null : new Set(opt.phase.split(','));
  const rows = opt.tsv.flatMap(readTsv);
  const count = { applied: 0, already: 0, keep: 0, manual: 0, phase: 0, stale: 0, error: 0, noroot: 0 };
  const errors = [];
  const manual = [];
  const stale = [];
  const files = new Map();
  for (const r of rows) {
    const t = (r.new_spec || '').trim();
    if (phases && !phases.has(r.phase || 'wave')) {
      count.phase++;
      continue;
    }
    if (t === 'MANUAL') {
      count.manual++;
      manual.push(r);
      continue;
    }
    if (t === 'KEEP' || t === '') {
      count.keep++;
      continue;
    }
    const root = rootFor(r.repo);
    if (!root) {
      count.noroot++;
      stale.push({ row: r, why: `no --repo-root for repo '${r.repo}'` });
      continue;
    }
    const key = path.join(root, r.file);
    if (!files.has(key)) files.set(key, []);
    files.get(key).push(r);
  }
  const results = [];
  for (const [abs, frows] of files) {
    if (!fsi.existsSync(abs)) {
      for (const r of frows) stale.push({ row: r, why: 'file not found' });
      continue;
    }
    const orig = fsi.readFileSync(abs, 'utf8');
    let text = orig;
    const st = { applied: 0, already: 0 };
    // rows of one file apply in TSV order: each row sees the text the earlier rows produced
    for (const r of frows) {
      try {
        const res = applyRowToText(ts, text, abs, r);
        text = res.text;
        if (res.status === 'applied') st.applied++;
        else if (res.status === 'already') st.already++;
        else count.keep++;
      } catch (e) {
        if (e instanceof GrammarError) errors.push({ row: r, why: e.message });
        else if (e instanceof StaleRowError) stale.push({ row: r, why: e.message });
        else throw e;
      }
    }
    count.applied += st.applied;
    count.already += st.already;
    results.push({ abs, orig, text, changed: text !== orig, ...st });
  }
  for (const r of results) if (r.changed || r.applied) out(`${opt.dry ? 'WOULD APPLY' : 'APPLY'} ${r.abs}: ${r.applied} applied, ${r.already} already`);
  if (manual.length) {
    out(`MANUAL (${manual.length}) left to people:`);
    for (const r of manual) out(`  ${r.repo} ${r.file} ${r.old_spec} [${r.names}] ${r.note ? `- ${r.note}` : ''}`);
  }
  for (const s of stale) out(`STOP stale row ${s.row._src}: ${s.row.repo}\t${s.row.file}\t${s.row.old_spec}\t${s.row.names}\t${s.row.new_spec} -> ${s.why}`);
  for (const s of errors) out(`ERROR row ${s.row._src}: ${s.row.repo}\t${s.row.file}\t${s.row.old_spec}\t${s.row.names}\t${s.row.new_spec} -> ${s.why}`);
  count.stale = stale.length;
  count.error = errors.length;
  let bad = stale.length + errors.length;
  let commitFailed = false;
  if (!bad && !opt.dry) {
    try {
      commitFiles(results.filter((r) => r.changed), fsi);
    } catch (e) {
      commitFailed = true;
      bad++;
      out(`ERROR commit failed: ${e.message}; every file left as it was`);
    }
  }
  const why = commitFailed ? '; NOTHING WRITTEN (commit failed)' : bad ? '; NOTHING WRITTEN (stale or error rows)' : '';
  out(`SUMMARY${opt.dry ? ' (dry run, nothing written)' : ''}: rows ${rows.length}; applied ${count.applied}, already ${count.already}, keep ${count.keep}, manual ${count.manual}, other-phase ${count.phase}, STALE ${stale.length}, ERROR ${errors.length}; files changed ${results.filter((r) => r.changed).length}${why}`);
  return { count, stale, errors, manual, results, code: bad ? 1 : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(run(process.argv.slice(2)).code);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
