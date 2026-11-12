#!/usr/bin/env node
// Code-hygiene audit over Tovu + Jini: one read-only pass, one TSV per check, plus summary.md.
// Why a script: the owner wants these counts repeatable and cheap — no model reading product code.
//
// Usage:
//   node development/scripts/hygiene-audit.mjs [--repo name=dir ...] [--out dir] [--skip-audit]
// Defaults: tovu=/Users/la/Programming/Tovu, jini=/Users/la/Programming/tovu-integration-clones/ui-jini,
//           out=<Tovu>/ADS-memory/.local-artifacts/extraction-survey/<today>/hygiene
// Read-only on the repos: git ls-files, file reads, `npm audit` (network, read-only; never `audit fix`).
// Writes only into --out. Env var VALUES are never read or printed — names only.
//
// File set = tracked prod source, same filter as size-hotspots.mjs (no tests/fixtures/mocks/dist/
// build/vendor/d.ts/stories; Tovu = apps|packages|content minus versioned plugin bundles; Jini =
// packages/*/src only). Parsing = TypeScript createSourceFile only (no type checker).
//
// LIMITS (each check, stated up front — owner rule):
// 1 i18n-missing-keys: finds locale-keyed object literals (>=3 locale-code keys) whose values are
//   object/array literals, plus per-locale files `<name>.<locale>.ts`. Keys are read statically:
//   literal/identifier names, `[CONST]` computed keys resolved to a same-file string const,
//   `...translationEntry("k", "v")`, and `...SAME_FILE_CONST`. Any other spread (e.g. `...X[locale]`)
//   or a locale value that is an import is "unresolved" → rows get confidence=low. Dictionaries
//   built at runtime (Object.fromEntries over arrays) are checked only through their array-valued
//   source (array length vs the sibling *_KEYS array or the longest locale). Expected locales = the
//   locales present in at least half of the repo's dictionaries; a dictionary missing one gets a
//   single "locale-block-missing" row. A missing key is DROPPED (counted in the notes) when the
//   common dictionary (dicts in a *common* i18n file + its *_KEYS arrays) or another dict in the
//   same file has it for that locale — so a same-file dict that is NOT merged can hide a real gap.
//   An `en` block under 90% of the union is an override block (raw key = English) and is not
//   checked for missing keys. `helper([...])`/`helper({...})` locale values are read through
//   their literal argument. It does not check translation quality or that a key is still used.
// 2 i18n-hardcoded-jsx: JsxText with letters, `{"string"}` children, and string literals (incl.
//   ternary/?? branches) in title/placeholder/aria-label/alt/label props. Tovu = apps/admin/src only;
//   Jini = every packages/*/src .tsx. Skips text inside code/pre/kbd/samp/style/script, data-*,
//   no-letter text, single letters, and single tokens that look like identifiers/classes/URLs
//   (contain - _ . / : # @ = or camelCase). Brand names in camelCase (GitHub) are therefore skipped;
//   intentionally untranslated copy (vendor names) still shows up. Strings built in variables and
//   passed as props are not seen.
// 3 version-pin-drift: (a) code pins = object literals with string `pluginId` + semver `version`,
//   compared with installed plugin bundle folders (<repo>/node_modules/@*/*/plugins/<id>/<ver>,
//   <repo>/packages/*/plugins/<id>/<ver>, <repo>/content/plugins/<id>/<ver>); (b) bundle folder name
//   vs its jini.plugin.json version; (c) a package's versioned bundle folder vs the package version;
//   (d) the same plugin id at different versions across repos; (e) package.json dependency ranges
//   (dependencies/dev/optional, not peer) vs the installed package.json found by walking up
//   node_modules; workspace:/file:-tgz specifiers are checked, link:/git/url ones skipped; (f) Tovu
//   package-lock.json vs installed for root direct deps. Pins held only in a database (site
//   settings) are not seen.
// 4 env-sprawl: `process.env.X`, `process.env["X"]`, `process.env[CONST]` (same-file string const),
//   `const {X} = process.env`, `import.meta.env.X`, aliases (`const e = process.env`), and ALL_CAPS
//   reads on injected env objects (`env.X`, `deps.env.X`, `env[CONST]`; source=env-param, lower
//   confidence). source=name-literal = a "TOVU_…"/"JINI_…" string literal anywhere in prod code
//   (catches names read through helpers/lists, also catches copy that merely mentions a name).
//   Dynamic `process.env[expr]` goes to env-dynamic-reads.tsv. Schema = names on `NAME=` /
//   `# NAME=` lines in tracked .env*.example files; a zod/env schema module, if one existed, would
//   need adding here. "read-not-in-schema" ignores name-literal-only vars; "schema-not-read" means
//   the name appears nowhere in prod code (it may be read by scripts, Docker or CI).
// 5 stale-comments: path-like tokens in comments (apps/ packages/ src/ development/ content/
//   scripts/ docs/ sites/ themes/ prefixes, or any token ending .ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs).
//   Resolved against the repo root, the file's folder, the nearest package root, and every other
//   repo root (Jini/ and Tovu/ prefixes map to those repos); .js<->.ts and .ts<->.tsx swaps count as
//   found. A partial path (`features/x/y.ts`, written relative to some src/) counts as found when
//   ANY tracked file in either repo ends with it — so a citation pointing at the wrong package but
//   a real suffix is missed. Bare file names (no slash) count as found if that basename is tracked
//   anywhere in either repo, so a renamed-but-common name (index.ts) is never flagged. URLs, globs,
//   <placeholders>, absolute paths and `.x.ts` fragments (a name wrapped across comment lines) are
//   skipped. Comments that narrate history ("moved from X") are flagged but marked historic=yes.
//   `file:line` citations are flagged when the line is past the end of the file.
// 6 npm-audit: `npm audit --json --omit=dev` and without --omit=dev at each repo root. Needs network
//   and a package-lock.json; Jini is pnpm (no lockfile) so npm audit fails there and `pnpm audit
//   --json [--prod]` is tried instead (still read-only). Advisory data is whatever the registry
//   returns today.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const repoArgs = argv.flatMap((a, i) => (a === "--repo" ? [argv[i + 1]] : []));
const REPOS = (repoArgs.length ? repoArgs : [
  "tovu=/Users/la/Programming/Tovu",
  "jini=/Users/la/Programming/tovu-integration-clones/ui-jini",
]).map((s) => { const [name, dir] = s.split("="); return { name, dir: path.resolve(dir) }; });
const today = new Date().toLocaleDateString("en-CA");
const OUT = path.resolve(opt("--out") ?? `/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/extraction-survey/${today}/hygiene`);
const SKIP_AUDIT = argv.includes("--skip-audit");
const req = createRequire(path.join(REPOS[0].dir, "package.json"));
const ts = req("typescript");
const semver = req("semver");
fs.mkdirSync(OUT, { recursive: true });

// ---------- file set (copied from size-hotspots.mjs) ----------
const EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP_DIR = /(^|\/)(node_modules|dist|vendor|__tests__|__mocks__|__measurements__|fixtures|__fixtures__|test|tests|e2e|coverage|\.build|build|release)\//;
const SKIP_FILE = /\.(test|spec|typecheck|stories|test-support)\.|\.d\.(ts|mts|cts)$/;
const VERSIONED_BUNDLE = /^packages\/provider-plugins\/plugins\/[^/]+\/\d+\.\d+\.\d+\/|\/plugins\/[^/]+\/\d+\.\d+\.\d+\//;
const tracked = (repo) => execFileSync("git", ["-C", repo.dir, "ls-files"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean);
function prodFiles(repo) {
  return repo.tracked.filter((f) => {
    if (!EXT.test(f) || SKIP_DIR.test(f) || SKIP_FILE.test(f)) return false;
    if (repo.name === "jini") return /^packages\/[^/]+\/src\//.test(f);
    return /^(apps|packages|content)\//.test(f) && !VERSIONED_BUNDLE.test(f);
  }).filter((f) => fs.existsSync(path.join(repo.dir, f)));
}

// ---------- helpers ----------
const cell = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ").slice(0, 300);
const writeTsv = (name, head, rows) => fs.writeFileSync(path.join(OUT, name), [head, ...rows].map((r) => r.map(cell).join("\t")).join("\n") + "\n");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return undefined; } };
const unwrap = (n) => { while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isParenthesizedExpression(n) || ts.isTypeAssertionExpression?.(n))) n = n.expression; return n; };
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const strOf = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
function propName(p, consts) {
  const n = p.name;
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isPrivateIdentifier?.(n)) return n.text;
  if (ts.isComputedPropertyName(n)) {
    const e = unwrap(n.expression);
    if (strOf(e) !== undefined) return strOf(e);
    if (ts.isIdentifier(e) && typeof consts.get(e.text) === "string") return consts.get(e.text);
  }
  return undefined;
}
// Top-level `const X = <init>` map: string values for literals, the node otherwise.
function topConsts(sf) {
  const m = new Map();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = unwrap(d.initializer);
      m.set(d.name.text, strOf(init) ?? init);
    }
  }
  return m;
}

// ---------- 1. i18n dictionaries ----------
const LOCALES = new Set(("en es de it fr pt pt-BR pt-PT zh zh-CN zh-TW zh-Hans zh-Hant ar fa ru ja id ko pl hu uk tr th hi ur bn "
  + "nl sv he vi cs da fi nb no el ro ms sk bg hr sr lt lv et sl ca").split(" ").map((l) => l.toLowerCase()));
const isLocale = (k) => typeof k === "string" && LOCALES.has(k.replace("_", "-").toLowerCase());
// Reads one locale block's keys. Returns {keys: Map<key, empty?>, unresolved, len (array blocks)}.
function blockKeys(node, consts, depth = 0) {
  const out = { keys: new Map(), unresolved: 0, len: undefined };
  node = unwrap(node);
  if (ts.isIdentifier(node) && consts.get(node.text) && typeof consts.get(node.text) !== "string" && depth < 3) return blockKeys(consts.get(node.text), consts, depth + 1);
  // `helper([..values..])` / `helper({..})` locale blocks (e.g. auditTranslationEntries([...])): read the literal argument
  if (ts.isCallExpression(node) && node.arguments.length === 1 && (ts.isArrayLiteralExpression(unwrap(node.arguments[0])) || ts.isObjectLiteralExpression(unwrap(node.arguments[0])))) return blockKeys(node.arguments[0], consts, depth + 1);
  if (ts.isArrayLiteralExpression(node)) { out.len = node.elements.length; out.emptyIdx = node.elements.flatMap((e, i) => (strOf(unwrap(e))?.trim() === "" ? [i] : [])); return out; }
  if (!ts.isObjectLiteralExpression(node)) { out.unresolved++; return out; }
  for (const p of node.properties) {
    if (ts.isSpreadAssignment(p)) {
      const e = unwrap(p.expression);
      if (ts.isCallExpression(e) && /translationEntry$/.test(e.expression.getText()) && strOf(unwrap(e.arguments[0])) !== undefined) {
        out.keys.set(strOf(unwrap(e.arguments[0])), strOf(unwrap(e.arguments[1]))?.trim() === "");
      } else if (ts.isIdentifier(e) && consts.get(e.text) && typeof consts.get(e.text) !== "string" && depth < 3) {
        const inner = blockKeys(consts.get(e.text), consts, depth + 1);
        for (const [k, v] of inner.keys) out.keys.set(k, v);
        out.unresolved += inner.unresolved;
      } else out.unresolved++;
      continue;
    }
    const k = propName(p, consts);
    if (k === undefined) { out.unresolved++; continue; }
    const v = ts.isPropertyAssignment(p) ? unwrap(p.initializer) : undefined;
    const s = strOf(v);
    out.keys.set(k, s !== undefined ? s.trim() === "" : (v && (v.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(v) && v.text === "undefined"))) || false);
  }
  return out;
}
function findDicts(sf, file, consts) {
  const dicts = [];
  const visit = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const props = n.properties.filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p));
      const loc = props.filter((p) => isLocale(propName(p, consts)));
      const blocks = loc.filter((p) => { const v = unwrap(ts.isPropertyAssignment(p) ? p.initializer : p.name); return ts.isObjectLiteralExpression(v) || ts.isArrayLiteralExpression(v) || ts.isIdentifier(v); });
      if (loc.length >= 3 && loc.length >= 0.6 * n.properties.length && blocks.length >= 2) {
        let name = "(inline)";
        const par = n.parent && unwrap(n.parent) === n ? n.parent : n.parent;
        for (let a = par; a; a = a.parent) { if (ts.isVariableDeclaration(a) && ts.isIdentifier(a.name)) { name = a.name.text; break; } if (ts.isBlock(a) || ts.isSourceFile(a)) break; }
        const locales = new Map();
        for (const p of loc) locales.set(propName(p, consts), blockKeys(ts.isPropertyAssignment(p) ? p.initializer : p.name, consts));
        dicts.push({ file, name, line: lineOf(sf, n), locales });
        return; // locale blocks are not dictionaries themselves
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return dicts;
}
// Jini-style per-locale files: <dir>/<base>.<locale>.ts each exporting one object literal.
function perLocaleFileDicts(repo, files, parsed) {
  const groups = new Map();
  for (const f of files) {
    const m = /^(.*)\.([a-z]{2}(?:-[A-Za-z]{2,4})?)\.(ts|tsx|mts|js|mjs)$/.exec(f);
    if (!m || !isLocale(m[2])) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push([m[2], f]);
  }
  const dicts = [];
  for (const [base, members] of groups) {
    if (members.length < 3) continue;
    const locales = new Map();
    for (const [loc, f] of members) {
      const p = parsed(f);
      if (!p) continue;
      const obj = [...p.consts.values()].find((v) => typeof v !== "string" && ts.isObjectLiteralExpression(v));
      locales.set(loc, obj ? blockKeys(obj, p.consts) : { keys: new Map(), unresolved: 1 });
    }
    dicts.push({ file: `${base}.<locale>.ts`, name: path.basename(base), line: 1, locales });
  }
  return dicts;
}
function dictRows(repo, dicts) {
  const freq = new Map();
  for (const d of dicts) for (const l of d.locales.keys()) freq.set(l, (freq.get(l) ?? 0) + 1);
  const expected = [...freq].filter(([, c]) => c >= dicts.length / 2).map(([l]) => l);
  const rows = [];
  let covered = 0;
  // A key missing from one dict is covered when the shared/common dictionary (any dict in a
  // *common* i18n file, plus its *_KEYS arrays) or another dict in the SAME file has it for that
  // locale — feature dicts fall back to common, and same-file dicts are merged into one translator.
  const commonDicts = dicts.filter((d) => /common/i.test(path.basename(d.file)));
  const keysIn = (ds, l) => ds.flatMap((x) => [...(x.locales.get(l)?.keys.keys() ?? [])]);
  const fallback = (d, l) => new Set([...keysIn(commonDicts, l), ...keysIn(dicts.filter((x) => x.file === d.file && x !== d), l), ...(commonKeyArrays.get(repo.name) ?? [])]);
  for (const d of dicts) {
    const arr = [...d.locales.values()].some((b) => b.len !== undefined);
    const conf = [...d.locales.values()].some((b) => b.unresolved) ? "low" : "high";
    const blen = (b) => b.len ?? b.keys.size;
    const nKeys = arr ? Math.max(...[...d.locales.values()].map(blen)) : new Set([...d.locales.values()].flatMap((b) => [...b.keys.keys()])).size;
    for (const l of expected) if (!d.locales.has(l) && d.locales.size >= 3) rows.push([repo.name, d.file, d.name, d.line, l, "*", "locale-block-missing", `${nKeys} keys`, conf]);
    if (arr) {
      const keysArr = d.keysLen ?? nKeys;
      for (const [l, b] of d.locales) {
        if (blen(b) < keysArr) rows.push([repo.name, d.file, d.name, d.line, l, `[${blen(b)}..${keysArr - 1}]`, "array-short", `${blen(b)} of ${keysArr}`, b.unresolved ? "low" : "high"]);
        for (const i of b.emptyIdx ?? []) rows.push([repo.name, d.file, d.name, d.line, l, `[${i}]`, "empty", "", conf]);
      }
      continue;
    }
    const union = new Set([...d.locales.values()].flatMap((b) => [...b.keys.keys()]));
    for (const [l, b] of d.locales) {
      const c = b.unresolved ? "low" : conf;
      // an `en` block much smaller than the union is an override block: the raw key IS the English text
      if (l === "en" && b.keys.size < 0.9 * union.size) continue;
      const fb = fallback(d, l);
      for (const k of union) if (!b.keys.has(k) && fb.has(k)) covered++;
      for (const k of union) if (!b.keys.has(k) && !fb.has(k)) rows.push([repo.name, d.file, d.name, d.line, l, k, "missing", "", c]);
      const fragments = union.size <= 4 && [...union].every((k) => /^[a-z]\w*$/.test(k));
      for (const [k, empty] of b.keys) if (empty) rows.push([repo.name, d.file, d.name, d.line, l, k, "empty", fragments ? "sentence-fragment dict: empty may be intentional word order" : "", c]);
    }
  }
  return { rows, expected, covered };
}

// ---------- 2. hard-coded JSX copy ----------
const COPY_PROPS = new Set(["title", "placeholder", "aria-label", "alt", "label"]);
const SKIP_TAGS = new Set(["code", "pre", "kbd", "samp", "style", "script"]);
function looksLikeToken(s) {
  if (!/[A-Za-z]/.test(s) || s.replace(/[^A-Za-z]/g, "").length < 2) return true;
  if (/^(https?:|mailto:|www\.)/.test(s) || /^[\w.+-]+@[\w-]+\.\w+$/.test(s)) return true;
  if (/\s/.test(s)) return false;
  return /[-_./:#@=$%+\\]/.test(s) || /[a-z][A-Z]/.test(s);
}
const tagOf = (el) => (el && (ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el)) ? el.tagName.getText() : el && ts.isJsxElement(el) ? el.openingElement.tagName.getText() : "");
function stringsIn(e, out = []) {
  e = unwrap(e);
  if (!e) return out;
  if (strOf(e) !== undefined) out.push(strOf(e));
  else if (ts.isTemplateExpression(e)) out.push([e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join("…"));
  else if (ts.isConditionalExpression(e)) { stringsIn(e.whenTrue, out); stringsIn(e.whenFalse, out); }
  else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(e.operatorToken.kind)) stringsIn(e.right, out);
  return out;
}
function jsxHits(sf, file) {
  const hits = [];
  const usesT = /\bt\(/.test(sf.text) ? "yes" : "no";
  const skipped = (n) => { for (let a = n.parent; a; a = a.parent) if (ts.isJsxElement(a) && SKIP_TAGS.has(tagOf(a))) return true; return false; };
  const add = (n, kind, tag, text) => { const t = text.replace(/\s+/g, " ").trim(); if (!looksLikeToken(t) && !skipped(n)) hits.push([file, lineOf(sf, n), kind, tag, t, usesT]); };
  const visit = (n) => {
    if (ts.isJsxText(n)) add(n, "text", tagOf(n.parent), n.text.replace(/&[a-z]+;|&#\d+;/g, " "));
    else if (ts.isJsxExpression(n) && n.expression && ts.isJsxElement(n.parent)) for (const s of stringsIn(n.expression)) add(n, "expr", tagOf(n.parent), s);
    else if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      if (COPY_PROPS.has(name) && n.initializer) {
        const init = ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer;
        for (const s of stringsIn(init)) add(n, `prop:${name}`, tagOf(n.parent.parent), s);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

// ---------- 4. env reads ----------
function envReads(sf, consts) {
  const reads = []; // [name, source, line]
  const aliases = new Set();
  const isProcEnv = (e) => { e = unwrap(e); return ts.isPropertyAccessExpression(e) && e.name.text === "env" && /^(globalThis\.)?process$/.test(e.expression.getText()); };
  // injected env objects: `env.X`, `deps.env.X`, `env[NAME]` — plus aliases of process.env
  const isEnvObj = (e) => { e = unwrap(e); return (ts.isIdentifier(e) && (e.text === "env" || aliases.has(e.text))) || (ts.isPropertyAccessExpression(e) && e.name.text === "env" && !isProcEnv(e) && !isMetaEnv(e)); };
  const isMetaEnv = (e) => { e = unwrap(e); return ts.isPropertyAccessExpression(e) && e.name.text === "env" && e.expression.getText() === "import.meta"; };
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer && isProcEnv(n.initializer)) {
      if (ts.isIdentifier(n.name)) aliases.add(n.name.text);
      else if (ts.isObjectBindingPattern(n.name)) for (const el of n.name.elements) { const k = el.propertyName ?? el.name; if (ts.isIdentifier(k) || ts.isStringLiteral(k)) reads.push([k.text, "destructure", lineOf(sf, el)]); }
    }
    if (ts.isPropertyAccessExpression(n)) {
      const e = n.expression;
      if (isProcEnv(e)) reads.push([n.name.text, "process.env", lineOf(sf, n)]);
      else if (isMetaEnv(e)) reads.push([n.name.text, "import.meta.env", lineOf(sf, n)]);
      else if (ts.isIdentifier(e) && aliases.has(e.text)) reads.push([n.name.text, "alias", lineOf(sf, n)]);
      else if (isEnvObj(e) && /^[A-Z][A-Z0-9_]{2,}$/.test(n.name.text)) reads.push([n.name.text, "env-param", lineOf(sf, n)]);
    } else if (ts.isElementAccessExpression(n) && (isProcEnv(n.expression) || isEnvObj(n.expression))) {
      const a = unwrap(n.argumentExpression);
      const k = strOf(a) ?? (ts.isIdentifier(a) && typeof consts.get(a.text) === "string" ? consts.get(a.text) : undefined);
      const direct = isProcEnv(n.expression) || (ts.isIdentifier(n.expression) && aliases.has(n.expression.text));
      if (k && /^[A-Z_][A-Z0-9_]*$/.test(k)) reads.push([k, direct ? "process.env[]" : "env-param[]", lineOf(sf, n)]);
      else if (direct) reads.push([ts.isIdentifier(a) ? `<dynamic:${a.text}>` : "<dynamic>", "dynamic", lineOf(sf, n)]);
    } else if (ts.isStringLiteral(n) && /^(TOVU|JINI)_[A-Z0-9_]{2,}$/.test(n.text) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) {
      reads.push([n.text, "name-literal", lineOf(sf, n)]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return reads;
}

// ---------- 5. comment path citations ----------
function comments(sf) {
  const text = sf.text, seen = new Set(), out = [];
  const take = (pos) => { for (const r of ts.getLeadingCommentRanges(text, pos) ?? []) if (!seen.has(r.pos)) { seen.add(r.pos); out.push(r); } };
  const walk = (n) => { take(n.pos); if (n.kind >= ts.SyntaxKind.FirstNode || n.kind === ts.SyntaxKind.SyntaxList) for (const c of n.getChildren(sf)) walk(c); };
  walk(sf);
  take(sf.endOfFileToken.pos);
  return out.map((r) => ({ pos: r.pos, text: text.slice(r.pos, r.end) }));
}
const PATH_RE = /(^|[\s`'"(\[<{,;=|])((?:(?:Jini|jini|Tovu|tovu)\/|\.{1,2}\/)*(?:(?:apps|packages|src|development|content|scripts|docs|sites|themes)\/[\w.@\-/[\]]*[\w\]]|[\w.@\-/]*[\w-]\.(?:tsx?|mts|cts|jsx?|mjs|cjs)(?![\w-])))((?::|#L)(\d+))?/g;
const FAMOUS_JS = /^(node|next|nuxt|vue|chart|three|express|react|solid|ember|backbone|angular|d3|p5|pixi|socket\.io|deno|bun|electron|alpine|htmx|anime|gsap|lottie|leaflet|highlight|prism|moment|day|lodash|underscore|jquery)\.js$/i;
const HISTORIC = /(moved|was|were|formerly|deleted|removed|renamed|retired|replaced|used to|old|legacy|previously|from)\b[^.]{0,40}$/i;
const swaps = (p) => [p, p.replace(/\.js$/, ".ts"), p.replace(/\.js$/, ".tsx"), p.replace(/\.jsx$/, ".tsx"), p.replace(/\.mjs$/, ".mts"), p.replace(/\.tsx$/, ".ts"), p.replace(/\.ts$/, ".tsx")];
const tail2 = (p) => p.split("/").slice(-2).join("/");
const lineCount = new Map();
const nLines = (abs) => { if (!lineCount.has(abs)) { try { lineCount.set(abs, fs.statSync(abs).isFile() ? fs.readFileSync(abs, "utf8").split("\n").length : 0); } catch { lineCount.set(abs, 0); } } return lineCount.get(abs); };
function pkgRoot(repoDir, fileAbs) {
  for (let d = path.dirname(fileAbs); d.startsWith(repoDir); d = path.dirname(d)) if (fs.existsSync(path.join(d, "package.json"))) return d;
  return repoDir;
}
function resolveCite(repo, file, cited, basenames) {
  const fileAbs = path.join(repo.dir, file);
  const stripped = cited.replace(/^(?:Jini|jini|Tovu|tovu)\//, "");
  const roots = [];
  if (/^(Jini|jini)\//.test(cited)) roots.push(...REPOS.filter((r) => r.name === "jini").map((r) => r.dir));
  else if (/^(Tovu|tovu)\//.test(cited)) roots.push(...REPOS.filter((r) => r.name === "tovu").map((r) => r.dir));
  if (/^\.{1,2}\//.test(cited)) roots.push(path.dirname(fileAbs));
  else roots.push(repo.dir, path.dirname(fileAbs), pkgRoot(repo.dir, fileAbs), ...REPOS.map((r) => r.dir));
  for (const root of roots) for (const c of swaps(stripped)) { const abs = path.resolve(root, c); if (fs.existsSync(abs)) return abs; }
  if (!stripped.includes("/")) return basenames.has(stripped) ? "basename" : undefined;
  // partial path (e.g. `features/x/y.ts` written relative to some src/): any tracked file in either
  // repo whose path ends with it counts as found.
  for (const c of swaps(stripped.replace(/^(\.{1,2}\/)+/, ""))) for (const full of suffixIndex.get(tail2(c)) ?? []) if (full === c || full.endsWith(`/${c}`)) return "suffix";
  return undefined;
}
function staleCites(repo, sf, file, basenames) {
  const rows = [];
  for (const c of comments(sf)) {
    PATH_RE.lastIndex = 0;
    let m;
    while ((m = PATH_RE.exec(c.text))) {
      const cited = m[2], ln = m[4] ? Number(m[4]) : undefined;
      const word = c.text.slice(c.text.lastIndexOf(" ", m.index + m[1].length) + 1, m.index + m[0].length);
      if (/^\/?[<*{$…]/.test(c.text.slice(m.index + m[0].length, m.index + m[0].length + 2))) continue; // glob / <placeholder>
      if (/:\/\/|^www\./.test(word) || /\.\.\.|node_modules\/|(^|\/)dist\//.test(cited)) continue;
      if (!cited.includes("/") && (FAMOUS_JS.test(cited) || /^[A-Z]\w*\.js$/.test(cited) || cited.startsWith("."))) continue; // `.x.ts` = a name wrapped across comment lines
      if (cited.startsWith("/")) continue; // absolute path (machine-specific or a placeholder)
      const found = resolveCite(repo, file, cited, basenames);
      const line = sf.getLineAndCharacterOfPosition(c.pos + m.index + m[1].length).line + 1;
      const historic = HISTORIC.test(c.text.slice(Math.max(0, m.index - 60), m.index + m[1].length)) ? "yes" : "no";
      const kind = cited.includes("/") ? "path" : "bare-name";
      if (!found) rows.push([repo.name, file, line, cited, ln ?? "", "missing", kind, historic]);
      else if (ln && !["basename", "suffix"].includes(found) && nLines(found) && ln > nLines(found)) rows.push([repo.name, file, line, cited, ln, `line-beyond-eof (${nLines(found)} lines)`, kind, historic]);
    }
  }
  return rows;
}

// ---------- 3. version pins ----------
function bundleDirs(root) {
  const out = []; // {id, ver, dir, manifestVer, owner}
  const seenReal = new Set(); // pnpm workspace links: node_modules/@scope/pkg -> packages/pkg
  const scanPlugins = (pluginsDir, owner) => {
    let ids = [];
    try { ids = fs.readdirSync(pluginsDir); } catch { return; }
    for (const id of ids) {
      let vers = [];
      try { vers = fs.readdirSync(path.join(pluginsDir, id)).filter((v) => semver.valid(v)); } catch { continue; }
      for (const ver of vers) if (!seenReal.has(fs.realpathSync(path.join(pluginsDir, id, ver))) && seenReal.add(fs.realpathSync(path.join(pluginsDir, id, ver)))) out.push({ id, ver, dir: path.join(pluginsDir, id, ver), manifestVer: readJson(path.join(pluginsDir, id, ver, "jini.plugin.json"))?.version, owner });
    }
  };
  // source folders first so a pnpm-linked copy under node_modules is reported by its source path
  for (const pkg of fs.existsSync(path.join(root, "packages")) ? fs.readdirSync(path.join(root, "packages")) : []) scanPlugins(path.join(root, "packages", pkg, "plugins"), path.join(root, "packages", pkg));
  const nm = path.join(root, "node_modules");
  for (const scope of (fs.existsSync(nm) ? fs.readdirSync(nm) : []).filter((s) => s.startsWith("@"))) {
    for (const pkg of fs.readdirSync(path.join(nm, scope))) scanPlugins(path.join(nm, scope, pkg, "plugins"), path.join(nm, scope, pkg));
  }
  scanPlugins(path.join(root, "content", "plugins"), path.join(root, "content"));
  return out;
}
function codePins(sf, file) {
  const pins = [];
  const visit = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const get = (k) => n.properties.find((p) => ts.isPropertyAssignment(p) && propName(p, new Map()) === k);
      const id = strOf(unwrap(get("pluginId")?.initializer)), ver = strOf(unwrap(get("version")?.initializer));
      if (id && ver && semver.valid(ver)) pins.push({ id, ver, file, line: lineOf(sf, n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return pins;
}
function installedPkg(fromDir, stopDir, name) {
  for (let d = fromDir; ; d = path.dirname(d)) {
    const j = readJson(path.join(d, "node_modules", name, "package.json"));
    if (j) return { version: j.version, at: path.relative(stopDir, path.join(d, "node_modules", name)) };
    if (d === stopDir || d === path.dirname(d)) return undefined;
  }
}
function depDrift(repo) {
  const rows = [];
  const wsVersions = new Map();
  const pkgFiles = repo.tracked.filter((f) => /(^|\/)package\.json$/.test(f) && !SKIP_DIR.test(f) && !/(^|\/)(examples?|templates?|assets|ADS-memory|cloud|AI-Dev-Shop)\//.test(f));
  const pkgs = pkgFiles.map((f) => ({ f, j: readJson(path.join(repo.dir, f)) })).filter((p) => p.j);
  for (const { j } of pkgs) if (j.name && j.version) wsVersions.set(j.name, j.version);
  for (const { f, j } of pkgs) {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, spec0] of Object.entries(j[field] ?? {})) {
        let spec = spec0, depName = name;
        const alias = /^npm:(@?[^@]+)@(.+)$/.exec(spec);
        if (alias) { depName = alias[1]; spec = alias[2]; }
        const inst = installedPkg(path.dirname(path.join(repo.dir, f)), repo.dir, name);
        let range;
        if (spec.startsWith("workspace:")) { const r = spec.slice(10); range = r === "*" || r === "^" || r === "~" ? "*" : r; }
        else if (/^file:.*?-(\d+\.\d+\.\d+(?:-[\w.]+)?)\.tgz$/.test(spec)) range = /-(\d+\.\d+\.\d+(?:-[\w.]+)?)\.tgz$/.exec(spec)[1];
        else if (/^(link:|file:|git|https?:|github:|[\w-]+\/[\w-]+$)/.test(spec)) continue;
        else range = spec;
        if (!semver.validRange(range)) continue;
        if (!inst) { if (field !== "optionalDependencies") rows.push([repo.name, "dep-not-installed", depName, `${field}: ${spec0}`, "", f, ""]); continue; }
        if (inst.version && !semver.satisfies(inst.version, range, { includePrerelease: true })) rows.push([repo.name, "dep-range", depName, `${field}: ${spec0}`, inst.version, f, inst.at]);
      }
    }
  }
  const lock = readJson(path.join(repo.dir, "package-lock.json"));
  const root = readJson(path.join(repo.dir, "package.json"));
  if (lock?.packages && root) {
    for (const name of Object.keys({ ...root.dependencies, ...root.devDependencies, ...root.optionalDependencies })) {
      const lv = lock.packages[`node_modules/${name}`]?.version;
      const iv = readJson(path.join(repo.dir, "node_modules", name, "package.json"))?.version;
      if (lv && iv && lv !== iv) rows.push([repo.name, "lock-vs-installed", name, `package-lock: ${lv}`, iv, "package-lock.json", `node_modules/${name}`]);
    }
  }
  return rows;
}

// ---------- 6. npm audit ----------
function runAudit(repo, args, tool = "npm") {
  const r = spawnSync(tool, ["audit", "--json", ...args], { cwd: repo.dir, encoding: "utf8", maxBuffer: 1 << 28, timeout: 240000,
    env: { ...process.env, npm_config_fund: "false", npm_config_update_notifier: "false" } });
  const label = `${tool} audit ${args.join(" ") || "(all deps)"}`;
  let j;
  try { j = JSON.parse(r.stdout); } catch { /* falls through */ }
  if (!j || j.error) return { label, error: (j?.error ? `${j.error.code ?? ""} ${j.error.summary ?? JSON.stringify(j.error)}` : (r.stderr || r.error?.message || `exit ${r.status}`)).trim().slice(0, 500) };
  fs.writeFileSync(path.join(OUT, `npm-audit-raw-${repo.name}-${tool}${args.length ? "-prod" : "-all"}.json`), r.stdout);
  const counts = j.metadata?.vulnerabilities ?? {};
  const pkgs = [];
  for (const [name, v] of Object.entries(j.vulnerabilities ?? {})) // npm 7+ shape
    if (["high", "critical"].includes(v.severity)) pkgs.push([v.severity, name, (v.nodes ?? []).join(" ; "), (v.via ?? []).map((x) => (typeof x === "string" ? `via ${x}` : x.title)).join(" ; "), JSON.stringify(v.fixAvailable ?? ""), (v.via ?? []).some((x) => typeof x !== "string") ? "advisory" : "transitive"]);
  for (const a of Object.values(j.advisories ?? {})) // pnpm / npm6 shape
    if (["high", "critical"].includes(a.severity)) pkgs.push([a.severity, a.module_name, (a.findings ?? []).flatMap((x) => x.paths ?? []).slice(0, 20).join(" ; "), a.title, a.patched_versions ?? "", "advisory"]);
  return { label, counts, pkgs };
}

// ---------- main ----------
const results = { i18nKeys: [], jsx: [], pins: [], env: [], envSchema: [], stale: [], audit: [] };
const notes = [];
const allBasenames = new Set();
const suffixIndex = new Map(); // last two path segments -> tracked paths (both repos)
for (const repo of REPOS) {
  repo.tracked = tracked(repo);
  for (const f of repo.tracked) {
    allBasenames.add(path.basename(f));
    for (let d = f; d.includes("/"); d = path.dirname(d)) { const k = tail2(d); if (!suffixIndex.has(k)) suffixIndex.set(k, new Set()); suffixIndex.get(k).add(d); }
  }
}
const bundlesByRepo = new Map(REPOS.map((r) => [r.name, bundleDirs(r.dir)]));
const envAll = new Map(); // repo -> Map(var -> {files:Set, sources:Set})
const dynEnv = [];
const commonKeyArrays = new Map(); // repo -> keys from *_KEYS arrays in the common i18n file

for (const repo of REPOS) {
  const files = prodFiles(repo);
  const cache = new Map();
  const parse = (f) => {
    if (cache.has(f)) return cache.get(f);
    let p;
    try {
      const text = fs.readFileSync(path.join(repo.dir, f), "utf8");
      const kind = /x$/.test(f) ? ts.ScriptKind.TSX : /\.(m|c)?js$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind);
      p = { sf, consts: topConsts(sf) };
    } catch (e) { console.error(`skip ${repo.name}:${f}: ${e.message}`); }
    cache.set(f, p);
    return p;
  };
  const dicts = [];
  const env = new Map();
  envAll.set(repo.name, env);
  const pins = [];
  for (const f of files) {
    const p = parse(f);
    if (!p) continue;
    const { sf, consts } = p;
    if (/common/i.test(path.basename(f)) && /i18n/i.test(f)) for (const [name, v] of consts) if (/KEYS$/.test(name) && typeof v !== "string" && ts.isArrayLiteralExpression(v)) {
      if (!commonKeyArrays.has(repo.name)) commonKeyArrays.set(repo.name, []);
      commonKeyArrays.get(repo.name).push(...v.elements.map((e) => strOf(unwrap(e))).filter((x) => x !== undefined));
    }
    for (const d of findDicts(sf, f, consts)) {
      // array-valued dicts: compare with the sibling *_KEYS array when there is one
      const sib = d.name.replace(/(VALUES|TRANSLATIONS)$/, "KEYS");
      const k = sib !== d.name ? consts.get(sib) : undefined;
      if (k && typeof k !== "string" && ts.isArrayLiteralExpression(k)) d.keysLen = k.elements.length;
      dicts.push(d);
    }
    const jsxScope = repo.name === "jini" ? /\.(tsx|jsx)$/.test(f) : /^apps\/admin\/src\/.*\.(tsx|jsx)$/.test(f);
    if (jsxScope) for (const h of jsxHits(sf, f)) results.jsx.push([repo.name, ...h]);
    for (const [name, source, line] of envReads(sf, consts)) {
      if (name.startsWith("<dynamic")) { dynEnv.push([repo.name, f, line, name]); continue; }
      if (!env.has(name)) env.set(name, { files: new Set(), sources: new Set() });
      env.get(name).files.add(`${f}:${line}`.replace(/:\d+$/, "")); env.get(name).sources.add(source);
    }
    results.stale.push(...staleCites(repo, sf, f, allBasenames));
    pins.push(...codePins(sf, f));
  }
  dicts.push(...perLocaleFileDicts(repo, files, parse));
  const { rows, expected, covered } = dictRows(repo, dicts);
  results.i18nKeys.push(...rows);
  notes.push(`${repo.name}: ${dicts.length} dictionaries found; expected locales (present in >= half): ${expected.length} (${expected.sort().join(" ")}); ${covered} missing keys dropped as covered by the common dictionary or a same-file dictionary`);
  repo.dictCount = dicts.length;

  // pins
  const bundles = bundlesByRepo.get(repo.name);
  for (const pin of pins) {
    const have = bundles.filter((b) => b.id === pin.id).map((b) => b.ver);
    if (!have.includes(pin.ver)) results.pins.push([repo.name, "code-pin", pin.id, pin.ver, have.join(",") || "(no bundle installed)", `${pin.file}:${pin.line}`, "pinned version has no installed bundle; admission refuses it"]);
  }
  for (const b of bundles) {
    if (b.manifestVer && b.manifestVer !== b.ver) results.pins.push([repo.name, "bundle-folder-vs-manifest", b.id, b.ver, b.manifestVer, path.relative(repo.dir, b.dir), "folder name and jini.plugin.json version differ"]);
    const ownerVer = readJson(path.join(b.owner, "package.json"))?.version;
    if (ownerVer && ownerVer !== b.ver) results.pins.push([repo.name, "bundle-vs-package", b.id, b.ver, ownerVer, path.relative(repo.dir, b.dir), "versioned bundle folder is named for a different version than its owning package"]);
  }
  results.pins.push(...depDrift(repo));

  // npm audit
  if (!SKIP_AUDIT) for (const args of [["--omit=dev"], []]) {
    let r = runAudit(repo, args);
    if (r.error && fs.existsSync(path.join(repo.dir, "pnpm-lock.yaml"))) {
      results.audit.push({ repo: repo.name, ...r });
      r = runAudit(repo, args.length ? ["--prod"] : [], "pnpm");
    }
    results.audit.push({ repo: repo.name, ...r });
  }
}
// cross-repo: same plugin id at different versions
if (REPOS.length > 1) {
  const [a, b] = REPOS;
  for (const x of bundlesByRepo.get(a.name)) for (const y of bundlesByRepo.get(b.name))
    if (x.id === y.id && !bundlesByRepo.get(b.name).some((z) => z.id === x.id && z.ver === x.ver))
      results.pins.push(["cross", "cross-repo-bundle", x.id, `${a.name}=${x.ver}`, `${b.name}=${y.ver}`, `${path.relative(a.dir, x.dir)} | ${path.relative(b.dir, y.dir)}`, "installed bundle differs from the other repo's source bundle"]);
}

// env schema
for (const repo of REPOS) {
  const env = envAll.get(repo.name);
  for (const [name, v] of [...env].sort((x, y) => y[1].files.size - x[1].files.size || x[0].localeCompare(y[0])))
    results.env.push([name, repo.name, v.files.size, [...v.sources].join(","), [...v.files].join(" ; ")]);
  const exampleFiles = repo.tracked.filter((f) => /(^|\/)\.env[\w.-]*\.example$|(^|\/)\.env\.example[\w.-]*$/.test(f) && !SKIP_DIR.test(f));
  const schema = new Set();
  for (const f of exampleFiles) for (const line of fs.readFileSync(path.join(repo.dir, f), "utf8").split("\n")) { const m = /^\s*#?\s*(?:export\s+)?([A-Z][A-Z0-9_]+)=/.exec(line); if (m) schema.add(m[1]); }
  repo.schemaFiles = exampleFiles;
  repo.schemaSize = schema.size;
  for (const [name, v] of env) if (!schema.has(name) && [...v.sources].some((s) => s !== "name-literal")) results.envSchema.push([repo.name, name, "read-in-code-not-in-schema", v.files.size, [...v.sources].join(",")]);
  for (const name of schema) if (!env.has(name)) results.envSchema.push([repo.name, name, "in-schema-not-read-in-prod-code", 0, exampleFiles.join(",")]);
}

// ---------- write ----------
writeTsv("i18n-missing-keys.tsv", ["repo", "file", "dict", "dict_line", "locale", "key", "problem", "detail", "confidence"], results.i18nKeys);
writeTsv("i18n-hardcoded-jsx.tsv", ["repo", "file", "line", "kind", "tag", "text", "file_uses_t"], results.jsx);
writeTsv("version-pin-drift.tsv", ["repo", "kind", "subject", "pinned_or_range", "installed", "where", "detail"], results.pins);
writeTsv("env-sprawl.tsv", ["var", "repo", "file_count", "sources", "files"], results.env);
writeTsv("env-schema-diff.tsv", ["repo", "var", "status", "file_count", "sources_or_schema"], results.envSchema);
writeTsv("env-dynamic-reads.tsv", ["repo", "file", "line", "key_expr"], dynEnv);
writeTsv("stale-comments.tsv", ["repo", "file", "line", "cited", "cited_line", "problem", "kind", "historic"], results.stale);
writeTsv("npm-audit.tsv", ["repo", "run", "severity", "package", "paths", "via", "fix", "kind"],
  results.audit.flatMap((a) => (a.error ? [[a.repo, a.label, "ERROR", "", "", a.error, ""]] : a.pkgs.map((p) => [a.repo, a.label, ...p]))));

const by = (rows, col, repo, repoCol = 0) => { const m = new Map(); for (const r of rows) if (r[repoCol] === repo) m.set(r[col], (m.get(r[col]) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const pick = (rows, n = 5) => (rows.length <= n ? rows : Array.from({ length: n }, (_, i) => rows[Math.floor((i * rows.length) / n)]));
const md = [`# Hygiene audit — ${today}`, "", `Repos: ${REPOS.map((r) => `${r.name}=${r.dir}`).join(", ")}. Script: development/scripts/hygiene-audit.mjs (read-only). One TSV per check in this folder.`, "", "## Counts", "",
  `| check | ${REPOS.map((r) => r.name).join(" | ")} |`, `|---|${REPOS.map(() => "---").join("|")}|`];
const cnt = (rows, repo, f = () => true, col = 0) => rows.filter((r) => r[col] === repo && f(r)).length;
md.push(`| i18n dictionaries found | ${REPOS.map((r) => r.dictCount).join(" | ")} |`,
  `| i18n-missing-keys rows (missing / empty / locale-block-missing / array-short) | ${REPOS.map((r) => ["missing", "empty", "locale-block-missing", "array-short"].map((p) => cnt(results.i18nKeys, r.name, (x) => x[6] === p)).join(" / ")).join(" | ")} |`,
  `| i18n-missing-keys high-confidence rows | ${REPOS.map((r) => cnt(results.i18nKeys, r.name, (x) => x[8] === "high")).join(" | ")} |`,
  `| i18n-hardcoded-jsx hits (files) | ${REPOS.map((r) => `${cnt(results.jsx, r.name)} (${by(results.jsx, 1, r.name).length})`).join(" | ")} |`,
  `| version-pin-drift rows | ${REPOS.map((r) => `${cnt(results.pins, r.name)} (${by(results.pins, 1, r.name).map(([k, v]) => `${k} ${v}`).join(", ")})`).join(" | ")} |`,
  `| env vars read (dynamic reads) | ${REPOS.map((r) => `${cnt(results.env, r.name, () => true, 1)} (${cnt(dynEnv, r.name)})`).join(" | ")} |`,
  `| env read-not-in-schema / schema-not-read | ${REPOS.map((r) => `${cnt(results.envSchema, r.name, (x) => x[2].startsWith("read"))} / ${cnt(results.envSchema, r.name, (x) => x[2].startsWith("in-schema"))}`).join(" | ")} |`,
  `| stale-comments (missing / line-beyond-eof; historic=yes) | ${REPOS.map((r) => `${cnt(results.stale, r.name, (x) => x[5] === "missing")} / ${cnt(results.stale, r.name, (x) => x[5] !== "missing")}; ${cnt(results.stale, r.name, (x) => x[7] === "yes")}`).join(" | ")} |`);
if (results.pins.some((r) => r[0] === "cross")) md.push(`| cross-repo bundle version differences | ${results.pins.filter((r) => r[0] === "cross").length} | |`);
md.push("", "## npm audit", "");
for (const a of results.audit) md.push(a.error ? `- ${a.repo} — \`${a.label}\`: FAILED — \`${a.error.replace(/`/g, "'")}\`` : `- ${a.repo} — \`${a.label}\`: ${Object.entries(a.counts).map(([k, v]) => `${k} ${v}`).join(", ")}; high/critical with their own advisory: ${[...new Map(a.pkgs.filter((p) => p[5] === "advisory").map((p) => [p[1], p[0]]))].map(([n, sev]) => `${n} (${sev})`).join(", ") || "none"}; flagged only through a dependency: ${new Set(a.pkgs.filter((p) => p[5] === "transitive").map((p) => p[1])).size}`);
md.push("", "## Notes", "", ...notes.map((n) => `- ${n}`), ...REPOS.map((r) => `- ${r.name} env schema files: ${r.schemaFiles.join(", ") || "NONE"} (${r.schemaSize} names)`), "");
md.push("## Top offenders", "");
for (const r of REPOS) {
  md.push(`### ${r.name}`, "",
    `- i18n-missing-keys by file: ${by(results.i18nKeys, 1, r.name).slice(0, 6).map(([k, v]) => `\`${k}\` ${v}`).join(", ") || "none"}`,
    `- i18n-hardcoded-jsx by file: ${by(results.jsx, 1, r.name).slice(0, 8).map(([k, v]) => `\`${k}\` ${v}`).join(", ") || "none"}`,
    `- env vars by file count: ${results.env.filter((x) => x[1] === r.name).slice(0, 10).map((x) => `${x[0]} ${x[2]}`).join(", ") || "none"}`,
    `- stale-comments by file: ${by(results.stale, 1, r.name).slice(0, 6).map(([k, v]) => `\`${k}\` ${v}`).join(", ") || "none"}`, "");
}
md.push("## Samples (auto-picked, spread across each TSV)", "");
const sampleBlock = (title, rows, fmt) => { md.push(`### ${title}`, ""); for (const r of REPOS) for (const x of pick(rows.filter((y) => y[0] === r.name || (r === REPOS[0] && y[0] === "cross")))) md.push(`- ${fmt(x)}`); md.push(""); };
sampleBlock("i18n-missing-keys", results.i18nKeys.filter((x) => x[8] === "high"), (x) => `${x[0]} \`${x[1]}\` ${x[2]}:${x[3]} ${x[4]} — ${x[6]} \`${String(x[5]).slice(0, 60)}\``);
sampleBlock("i18n-hardcoded-jsx", results.jsx, (x) => `${x[0]} \`${x[1]}:${x[2]}\` ${x[3]} <${x[4]}> "${String(x[5]).slice(0, 70)}"`);
sampleBlock("version-pin-drift", results.pins, (x) => `${x[0]} ${x[1]} ${x[2]}: ${x[3]} vs ${x[4]} (\`${x[5]}\`)`);
sampleBlock("stale-comments", results.stale, (x) => `${x[0]} \`${x[1]}:${x[2]}\` cites \`${x[3]}${x[4] ? `:${x[4]}` : ""}\` — ${x[5]}${x[7] === "yes" ? " (historic)" : ""}`);
const header = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n");
const lim = header.slice(header.findIndex((l) => l.startsWith("// LIMITS")) + 1, header.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, ""));
md.push("## Limits (copied from the script header)", "", ...lim.map((l) => (/^\d /.test(l) ? `- **${l.slice(0, 1)}** ${l.slice(2)}` : `  ${l.trim()}`)), "");
fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
console.log(md.slice(0, 22).join("\n"));
console.log(`\nwrote ${OUT}`);
