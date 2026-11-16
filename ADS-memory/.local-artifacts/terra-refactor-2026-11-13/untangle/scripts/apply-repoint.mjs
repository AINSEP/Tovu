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
//             Any other identifier the template needs must already be bound in the file, else the row is STALE.
//   same spec (new_spec == old_spec) with `Old->New`: in-place rename of the imported name (and its uses, or the alias
//             kept with the `(... as ...)` hint); works for import, export-from and inline import('<spec>').Old rows.
//   Unknown syntax in the rename column, or an `action` that is not an UPPER-CASE label (`SK-CORE+MOVE`), is a GrammarError:
//   printed as ERROR, nothing written, exit 1 (v1 silently ignored `=>`).
// A row whose names are in neither old_spec nor new_spec's statement is STALE: the run prints it, writes nothing, exits 1.
// Known limits: no scope analysis for renames (a declaration of the same name in the file is a STOP instead);
// DROP rows with names absent count as already applied (cannot tell stale from done).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function loadTs() {
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

function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].end > sorted[i - 1].start) throw new Error('internal: overlapping edits');
  }
  let out = text;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

function scriptKind(ts, file) {
  if (/\.(tsx|jsx)$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.(js|mjs|cjs)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

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
  typeOnly: !!el.isTypeOnly || K.declType(d),
});

const nameMatches = (n, info) => info.first === n.first && (n.second === undefined || info.second === n.second);

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

function useRenameEdits(ts, sf, renames) {
  const edits = [];
  const conflict = (p, id) =>
    (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isBindingElement(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) && p.name === id;
  const walk = (n) => {
    if (ts.isImportDeclaration(n) || (ts.isExportDeclaration(n) && n.moduleSpecifier)) return;
    if (ts.isIdentifier(n) && renames.has(n.text)) {
      const { to } = renames.get(n.text);
      const p = n.parent;
      const isMemberName = p && p.name === n && (ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isEnumMember(p) || ts.isJsxAttribute(p));
      if (conflict(p, n)) throw new StaleRowError(`name conflict: the file declares its own \`${n.text}\` (rename by hand)`);
      if (p && ts.isQualifiedName(p) && p.right === n) {
        /* member name */
      } else if (isMemberName || (p && ts.isBindingElement(p) && p.propertyName === n) || (p && ts.isImportTypeNode(p))) {
        /* not a use of the binding */
      } else if (p && ts.isShorthandPropertyAssignment(p) && p.name === n) {
        edits.push({ start: n.getStart(sf), end: n.end, text: `${n.text}: ${to}` });
      } else if (p && ts.isExportSpecifier(p)) {
        if (!p.propertyName) edits.push({ start: n.getStart(sf), end: n.end, text: `${to} as ${n.text}` });
        else if (p.propertyName === n) edits.push({ start: n.getStart(sf), end: n.end, text: to });
      } else {
        edits.push({ start: n.getStart(sf), end: n.end, text: to });
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return edits;
}

function applyNamedRow(ts, text, sf, row, parsed, drop) {
  const K = makeKind(ts, parsed.kind);
  const names = parseNames(row.names);
  const { map: renames, template } = parseRename(row.rename);
  const decls = K.decls(sf);
  const olds = decls.filter((d) => d.moduleSpecifier.text === parsed.spec);
  const dests = drop ? [] : decls.filter((d) => d.moduleSpecifier.text === row.new_spec);
  const moved = [];
  let already = 0;
  for (const n of names) {
    let found = null;
    for (const d of olds) {
      const b = K.bindings(d);
      if (!b) continue;
      const hit = b.elements.map((e) => elInfo(K, d, e)).find((i) => nameMatches(n, i) && !moved.some((m) => m.el === i.el));
      if (hit) {
        found = hit;
        break;
      }
    }
    if (found) {
      moved.push(found);
      continue;
    }
    const probe = renames.get(n.first)?.to ?? n.first;
    const done = dests.some((d) => K.bindings(d)?.elements.some((e) => (e.propertyName ?? e.name).text === probe || e.name.text === probe));
    if (drop || done) already++;
    else throw new StaleRowError(`names not found in ${parsed.kind === 'import' ? 'import' : 'export-from'} of '${parsed.spec}': ${n.first}`);
  }
  if (moved.length === 0) return { edits: [], status: 'already' };

  const edits = [];
  const items = [];
  const useRenames = new Map();
  for (const m of moved) {
    const r = renames.get(m.first);
    let outFirst = m.first;
    let outAlias = m.hasAlias ? m.second : undefined;
    if (r) {
      outFirst = r.to;
      if (!m.hasAlias) {
        if (r.aliasMode && parsed.kind === 'import') outAlias = m.first;
        else if (parsed.kind === 'import') useRenames.set(m.second, r);
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

  // 2. add to the destination
  const valueItems = items.filter((i) => !i.typeOnly);
  const typeItems = items.filter((i) => i.typeOnly);
  const has = (d, it) => K.bindings(d).elements.some((e) => elInfo(K, d, e).first === it.outFirst && elInfo(K, d, e).second === (it.outAlias ?? it.outFirst));
  const appends = new Map();
  const leftoverValue = [];
  const leftoverType = [];
  const pick = (it) => {
    const usable = dests.filter((d) => K.bindings(d));
    const valueDest = usable.find((d) => !K.declType(d));
    const typeDest = usable.find((d) => K.declType(d));
    return it.typeOnly ? (typeDest ?? valueDest) : valueDest;
  };
  for (const it of [...valueItems, ...typeItems]) {
    const d = pick(it);
    if (!d) {
      (it.typeOnly ? leftoverType : leftoverValue).push(it);
      continue;
    }
    if (dests.some((x) => K.bindings(x) && has(x, it))) continue;
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
  if (useRenames.size) edits.push(...useRenameEdits(ts, sf, useRenames));
  if (template) edits.push(...settleInserts(templateEdits(ts, text, sf, template, moved), edits));
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

/** Collect the nodes naming `local` as a type (type reference or extends/implements), outside import/export-from statements. */
function typeUseSites(ts, sf, local) {
  const sites = [];
  const walk = (n) => {
    if (ts.isImportDeclaration(n) || (ts.isExportDeclaration(n) && n.moduleSpecifier)) return;
    const id = rootIdent(ts, n);
    if (id && ts.isIdentifier(id) && id.text === local) {
      sites.push(n);
      return; // nested uses inside the arguments are checked by the caller
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return sites;
}

function renderTemplate(t, local, argText) {
  const body = t.placeholder ? t.text.replace(new RegExp(`\\b${t.placeholder}\\b`, 'g'), () => argText) : t.text;
  return local + body.slice(t.old.length);
}

function templateEdits(ts, text, sf, t, moved) {
  const m = moved.find((x) => x.first === t.old);
  if (!m) throw new StaleRowError(`template names '${t.old}' but the row moves ${moved.map((x) => x.first).join(',')}`);
  const sites = typeUseSites(ts, sf, m.second);
  const edits = [];
  for (const n of sites) {
    const args = n.typeArguments ? [...n.typeArguments] : [];
    if (t.placeholder ? args.length !== 1 : args.length > 0) {
      if (t.placeholder) throw new StaleRowError(`${t.old} used with ${args.length} type arguments (need exactly one for <${t.placeholder}>): line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
      continue; // already generic
    }
    if (args.length && typeUseSites(ts, args[0], m.second).length) throw new StaleRowError(`nested use of ${t.old} inside its own type argument (rewrite by hand)`);
    edits.push({ start: n.getStart(sf), end: n.end, text: renderTemplate(t, m.second, args.length ? text.slice(args[0].getStart(sf), args[0].end) : '') });
  }
  if (!edits.length) return [];
  const bound = boundNames(ts, sf);
  for (const a of t.adds) for (const x of a.names) if (!bound.has(x)) bound.set(x, a.spec);
  const missing = t.idents.filter((i) => !bound.has(i));
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
function applyInPlaceRow(ts, text, sf, row, parsed) {
  const K = makeKind(ts, parsed.kind);
  const names = parseNames(row.names);
  const { map: renames } = parseRename(row.rename);
  const decls = K.decls(sf).filter((d) => d.moduleSpecifier.text === parsed.spec && K.bindings(d));
  const bound = boundNames(ts, sf);
  const edits = [];
  const useRenames = new Map();
  let applied = 0;
  for (const n of names) {
    const r = renames.get(n.first);
    if (!r) continue;
    const infos = decls.flatMap((d) => K.bindings(d).elements.map((e) => elInfo(K, d, e)));
    const hit = infos.find((i) => nameMatches(n, i));
    if (!hit) {
      if (infos.some((i) => i.first === r.to || i.second === r.to)) continue;
      throw new StaleRowError(`names not found in ${parsed.kind === 'import' ? 'import' : 'export-from'} of '${parsed.spec}': ${n.first}`);
    }
    const res = renameElementEdit(ts, sf, hit, r, parsed.kind);
    if (res.useRename && bound.has(r.to)) throw new StaleRowError(`name conflict: the file already binds \`${r.to}\` (rename by hand)`);
    edits.push(res.edit);
    if (res.useRename) useRenames.set(hit.second, r);
    applied++;
  }
  if (useRenames.size) edits.push(...useRenameEdits(ts, sf, useRenames));
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

/** Apply one row to a file's text. Returns { text, status: 'applied'|'already'|'skip' }; throws StaleRowError. */
export function applyRowToText(ts, text, file, row) {
  const target = (row.new_spec || '').trim();
  const parsed = parseOldSpec(row.old_spec);
  if (target === '' || target === 'KEEP' || target === 'MANUAL') return { text, status: 'skip' };
  checkAction(row.action);
  const { map: renames, template } = parseRename(row.rename);
  const drop = target === 'DROP' || target === '-';
  const inPlace = !drop && target === parsed.spec;
  if (inPlace && template) throw new GrammarError(`a type-argument template needs a move (new_spec differs from '${parsed.spec}'): ${row.rename}`);
  if (inPlace && !renames.size) return { text, status: 'skip' };
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(ts, file));
  let r;
  if (parsed.kind === 'star') r = applyStarRow(ts, text, sf, parsed, drop);
  else if (inPlace && parsed.kind !== 'dynimport' && parsed.kind !== 'mock') r = applyInPlaceRow(ts, text, sf, row, parsed);
  else if (parsed.kind === 'dynimport' || parsed.kind === 'mock') r = drop || (inPlace && parsed.kind === 'mock') ? { edits: [], status: 'skip' } : applyStringRow(ts, sf, row, parsed);
  else r = applyNamedRow(ts, text, sf, row, parsed, drop);
  return { text: r.edits.length ? applyEdits(text, r.edits) : text, status: r.status };
}

export function readTsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  const head = lines[0].split('\t');
  return lines.slice(1).map((l, i) => {
    const cells = l.split('\t');
    const row = Object.fromEntries(head.map((h, k) => [h, cells[k] ?? '']));
    row._src = `${path.basename(file)}:${i + 2}`;
    return row;
  });
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

export function run(argv, out = console.log) {
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
    if (!fs.existsSync(abs)) {
      for (const r of frows) stale.push({ row: r, why: 'file not found' });
      continue;
    }
    const orig = fs.readFileSync(abs, 'utf8');
    let text = orig;
    const st = { applied: 0, already: 0 };
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
    results.push({ abs, text, changed: text !== orig, ...st });
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
  const bad = stale.length + errors.length;
  if (!bad && !opt.dry) for (const r of results) if (r.changed) fs.writeFileSync(r.abs, r.text);
  out(`SUMMARY${opt.dry ? ' (dry run, nothing written)' : ''}: rows ${rows.length}; applied ${count.applied}, already ${count.already}, keep ${count.keep}, manual ${count.manual}, other-phase ${count.phase}, STALE ${stale.length}, ERROR ${errors.length}; files changed ${results.filter((r) => r.changed).length}${bad ? '; NOTHING WRITTEN (stale or error rows)' : ''}`);
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
