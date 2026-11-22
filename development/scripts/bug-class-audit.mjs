#!/usr/bin/env node
// Bug-class audit: finds seven known bug classes by static analysis (syntax tree only, no type
// checker), so the owner gets a repeatable list instead of a model reading every file.
// Report-only: it never changes code. Every hit is a CANDIDATE that a person confirms.
//
// Usage:
//   node development/scripts/bug-class-audit.mjs [--repo name=dir ...] [--out dir]
// Defaults: tovu=/Users/la/Programming/Tovu, jini=/Users/la/Programming/tovu-integration-clones/ui-jini,
//           out=<Tovu>/ADS-memory/.local-artifacts/extraction-survey/<today>/bug-classes
// Read-only on the repos (git ls-files + file reads). Writes one TSV per check + summary.md into --out.
// TSV columns: repo, file, line, symbol, detail.
//
// File set = tracked prod source, same filter as size-hotspots.mjs (prodFiles): no tests, fixtures,
// mocks, dist, build, vendor, .d.ts or stories; Tovu = apps|packages|content minus versioned plugin
// bundles; Jini = packages/*/src only.
//
// LIMITS THAT APPLY TO EVERY CHECK (read these before trusting a count):
// - One file at a time. Calls into other files are opaque; a helper that lives in another file and
//   does the right thing is invisible (false positive), and one that does the wrong thing is too
//   (false negative). Same-file helpers ARE followed, up to 3 calls deep, by plain name only.
// - Names, not types: "write", "limit", "secret" etc. are recognised by identifier spelling.
// - Text order stands in for control flow where order matters (check 3's "await after check").
//
// CHECKS — what each matches, and its known false positives (FP) / false negatives (FN):
//
// 1 silent-truncation: a function that sets or defaults a list limit — a variable/parameter named
//   limit|pageSize|perPage|take|maxResults|maxItems|... initialised with a number, a property of
//   that name given a number (>= 2), a query-builder `.limit(N)`/`.take(N)`, or SQL `LIMIT N` — while
//   nothing in the same function (callbacks included) mentions cursor / next* / hasMore / truncated /
//   total / offset / continuation / partial. One row per function.
//   FP: limits that are deliberate caps on purpose-built views (e.g. "latest 5"), callers that page
//   elsewhere, limits whose truncation is reported by a caller in another file. FN: limits read
//   from a constant in another file, a `total` that exists but is never returned to the user,
//   functions that page with `offset` but never tell the caller there is more.
//
// 2 lost-update: whole-record writes with no concurrency precondition:
//   (a) Kysely `updateTable(..).set(X)` where X is a variable, call, spread or >= 4-field object and
//       the chain's `.where(..)` args never name revision/version/etag/expected*/updatedAt/precondition;
//   (b) `onConflict(..).doUpdateSet(X)` upserts of a full row with no such `.where`;
//   (c) SQL strings `UPDATE t SET` / `ON CONFLICT .. DO UPDATE SET` with >= 3 assignments and no such token;
//   (d) Express `.put(path, ...)` routes whose same-file handler code never names such a token;
//   (e) tool handlers whose tool id says update/replace/save/set/edit/configure and whose same-file
//       code never names such a token.
//   FP: tables with one writer, last-writer-wins by design, writes whose caller (other file) already
//   checked a revision. FN: `version` meaning a schema/plugin version counts as a precondition;
//   JSON-file / key-value stores and ORMs other than Kysely are not inspected.
//
// 3 abort-not-reaching-writes: tool handlers (a `handler:` function in a registration object with
//   `descriptor`/`policy`, values of a `Record<string, ToolHandler>` / `handlers:` map, or anything
//   typed `ToolHandler`) that call a write (method named insert*/update*/upsert*/delete*/remove*/
//   save*/write*/put*/replace*/publish*/send*/install*/... or Kysely insertInto/updateTable/deleteFrom,
//   fs writes, `fetch` with POST/PUT/PATCH/DELETE) and either (i) never read `signal`/`abortSignal`/
//   `aborted`/`throwIfAborted`, or (ii) read it but `await` something after the last read and before
//   a write that does not itself receive the signal.
//   Skipped (recall traded for precision): handlers that pass their whole context object to another
//   file's function, since that function may read the signal. FP: writes that are fast/local and
//   harmless to finish after a cancel. FN: writes named outside the verb list; (ii) uses text order.
//
// 4 unenforced-permission: tools whose catalog entry declares `authorization: { permission }` and
//   whose registration authorizes with a constant 'allow' (buildDomainRegistrations always does; or
//   an explicit `policy: { authorize: () => 'allow' }`), while the handler and its same-file helpers
//   never mention authorize / permission / principal / actor / role / owner.
//   FP: handlers calling a service that was bound to the caller elsewhere and checks there.
//   FN: any mention of `principal` counts as a check, even if it is only logged or passed along.
//
// 5 hung-express-handler: async functions passed directly to an Express route/middleware call
//   (`.get/.post/.put/.patch/.delete/.all/.use` with a (req, res[, next]) parameter list) with an
//   `await` or `throw` not inside a try block that has a catch, and not `await x.catch(..)`.
//   Express 4 drops the rejection and the request hangs. A handler passed through a wrapper call is
//   not flagged (assumed wrapped). apps/desktop is skipped (Express 5 forwards rejections).
//   FP: wrappers that catch but are written as a named middleware. FN: named handler functions
//   defined in another file; async functions handed to non-route callbacks.
//
// 6 replace-dollar-expansion: `.replace(a, b)` / `.replaceAll(a, b)` where b is not a function and not
//   a plain string literal — an identifier, template with substitutions, call, or property — so a
//   `$&`, `$'`, `` $` `` or `$1` in the data is expanded. Same-file `const X = 'literal'` is resolved and
//   skipped. b that already escapes `$` (`.replace(/\$/g, '$$$$')`) is skipped.
//   FP: replacement values that can never contain `$` (numbers, fixed enums from another file).
//   FN: none known for direct calls; calls through `String.prototype.replace.call` are missed.
//
// 7 secrets-in-logs: console.* calls and `<x>.log|info|warn|error|debug|trace|fatal(..)` where x is
//   named like log/logger/console, whose arguments reference an identifier or property named like
//   token, secret, password, apiKey/privateKey/accessKey/..., authorization, cookie, credential,
//   bootToken. Not counted: names that only describe a secret (has*/is*/*Name/*Id/*Env/*Count/
//   *Length/...), LLM token counts (*Tokens, maxTokens, ...), pagination tokens, and references inside
//   redact(..)/mask*(..)/hash*(..)/Boolean(..)/typeof/`!x`/`.length`/comparisons/conditions.
//   FP: an object that is named like a secret but holds only metadata. FN: a bare `key`, secrets
//   reached through a generically named object (`config`, `env`, `req.headers`), and loggers
//   with other names.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const repoArgs = argv.flatMap((a, i) => (a === "--repo" ? [argv[i + 1]] : []));
const REPOS = (repoArgs.length ? repoArgs : [
  "tovu=/Users/la/Programming/Tovu",
  "jini=/Users/la/Programming/tovu-integration-clones/ui-jini",
]).map((s) => { const [name, dir] = s.split("="); return { name, dir: path.resolve(dir) }; });
const TOVU = "/Users/la/Programming/Tovu";
const today = new Date().toLocaleDateString("en-CA"); // local date, matches the survey folder names
const OUT = path.resolve(opt("--out") ?? path.join(TOVU, "ADS-memory/.local-artifacts/extraction-survey", today, "bug-classes"));
const ts = createRequire(path.join(TOVU, "package.json"))("typescript");

// ---------- file set (copied from size-hotspots.mjs prodFiles) ----------
const EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP_DIR = /(^|\/)(node_modules|dist|vendor|__tests__|__mocks__|__measurements__|fixtures|__fixtures__|test|tests|e2e|coverage|\.build|build|release)\//;
const SKIP_FILE = /\.(test|spec|typecheck|stories|test-support)\.|\.d\.(ts|mts|cts)$/;
const VERSIONED_BUNDLE = /^packages\/provider-plugins\/plugins\/[^/]+\/\d+\.\d+\.\d+\/|\/plugins\/[^/]+\/\d+\.\d+\.\d+\//;
function prodFiles(repo) {
  const all = execFileSync("git", ["-C", repo.dir, "ls-files"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n");
  return all.filter((f) => {
    if (!EXT.test(f) || SKIP_DIR.test(f) || SKIP_FILE.test(f)) return false;
    if (repo.name === "jini") return /^packages\/[^/]+\/src\//.test(f);
    return /^(apps|packages|content)\//.test(f) && !VERSIONED_BUNDLE.test(f);
  }).filter((f) => fs.existsSync(path.join(repo.dir, f)));
}

// ---------- AST helpers ----------
const K = ts.SyntaxKind;
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)
  || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
const unwrap = (n) => { while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isTypeAssertionExpression?.(n))) n = n.expression; return n; };
const propName = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isPrivateIdentifier(n)) ? n.text : n && ts.isComputedPropertyName(n) ? n.expression.getText() : undefined);
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const calleeName = (call) => { const e = unwrap(call.expression); return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ts.isElementAccessExpression(e) ? propName(e.argumentExpression) : undefined; };
const isAsync = (fn) => (ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) !== 0 || !!fn.modifiers?.some((m) => m.kind === K.AsyncKeyword);
function walk(node, cb, { nested = true } = {}) {
  const v = (c) => { if (cb(c) === false) return; if (!nested && isFn(c)) return; ts.forEachChild(c, v); };
  ts.forEachChild(node, v);
}
const fnName = (n) => {
  if (n.name) return n.name.getText();
  const p = n.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p))) return propName(p.name) ?? p.name.getText();
  if (p && ts.isBinaryExpression(p)) return p.left.getText().slice(0, 60);
  if (p && ts.isExportAssignment(p)) return "default";
  if (p && ts.isCallExpression(p)) return `<arg of ${p.expression.getText().slice(0, 40).replace(/\s+/g, " ")}>`;
  return "<anonymous>";
};
/** Nearest enclosing function that is not an inline callback argument (so `db => db.select…` inside a method counts as the method). */
function namedEnclosing(node) {
  let fallback;
  for (let p = node.parent; p; p = p.parent) {
    if (!isFn(p)) continue;
    fallback ??= p;
    const par = p.parent;
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && par && (ts.isCallExpression(par) || ts.isNewExpression(par)) && par.expression !== p) continue;
    return p;
  }
  return fallback;
}
/** Every identifier name, property name and string literal text in a subtree. */
function words(node) {
  const out = [];
  const v = (c) => {
    if (ts.isIdentifier(c) || ts.isPrivateIdentifier(c)) out.push(c.text);
    else if (ts.isStringLiteralLike(c) || ts.isTemplateHead(c) || ts.isTemplateMiddle(c) || ts.isTemplateTail(c)) out.push(c.text);
    ts.forEachChild(c, v);
  };
  v(node);
  return out;
}
/** Per-file map of plain-named functions: `function f`, `const f = () =>`, `const f = function`. */
function localFunctions(sf) {
  const m = new Map();
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) m.set(n.name.text, n);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const i = unwrap(n.initializer);
      if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) m.set(n.name.text, i);
    }
  });
  return m;
}
/** The node plus every same-file function it calls or references by plain name, up to `depth` hops. */
function expand(node, locals, depth = 3) {
  const seen = new Set([node]);
  let frontier = [node];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const f of frontier) walk(f, (c) => {
      if (ts.isIdentifier(c) && locals.has(c.text)) { const t = locals.get(c.text); if (!seen.has(t)) { seen.add(t); next.push(t); } }
    });
    frontier = next;
  }
  return [...seen];
}
const anyWord = (nodes, re) => nodes.some((n) => words(n).some((w) => re.test(w)));
const clean = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

// ---------- shared: tool handlers ----------
const CTX_TYPE = /\bToolHandler\b|ToolHandlerContext|ToolExecutionContext|ToolCallContext/;
/** Resolve a handler-map value to the function(s) that actually run. */
function handlerFns(value, locals) {
  const v = unwrap(value);
  if (!v) return [];
  if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) return [v];
  if (ts.isIdentifier(v) && locals.has(v.text)) return [locals.get(v.text)];
  if (ts.isCallExpression(v)) return v.arguments.flatMap((a) => handlerFns(a, locals)).concat(
    ts.isIdentifier(unwrap(v.expression)) && locals.has(unwrap(v.expression).text) ? [locals.get(unwrap(v.expression).text)] : []);
  // wrapper options ({ prepare, run, handler, ... }): every function-valued property runs as part of the tool
  if (ts.isObjectLiteralExpression(v)) return v.properties.flatMap((p) => ts.isPropertyAssignment(p) && [ts.isArrowFunction, ts.isFunctionExpression].some((g) => g(unwrap(p.initializer))) ? handlerFns(p.initializer, locals) : ts.isMethodDeclaration(p) ? [p] : []);
  return [];
}
/** All tool handlers in a file: { id, fns, node, registration, policyAllow }. */
function toolHandlers(sf, locals) {
  const out = [];
  const usesKit = /buildDomainRegistrations\s*\(/.test(sf.text);
  if (/\.(tsx|jsx)$/.test(sf.fileName)) return out; // UI event-handler maps, never tool registrations
  const toolFile = usesKit || /\bToolHandler\b|\bToolRegistration\b/.test(sf.text);
  walk(sf, (n) => {
    // (1) registration object literal: { descriptor | policy, handler }
    if (ts.isObjectLiteralExpression(n)) {
      const props = new Map(n.properties.filter((p) => p.name).map((p) => [propName(p.name), p]));
      const h = props.get("handler");
      if (h && (props.has("descriptor") || props.has("policy"))) {
        const fns = ts.isMethodDeclaration(h) ? [h] : ts.isPropertyAssignment(h) ? handlerFns(h.initializer, locals) : ts.isShorthandPropertyAssignment(h) && locals.has("handler") ? [locals.get("handler")] : [];
        let id;
        const d = props.get("descriptor");
        if (d && ts.isPropertyAssignment(d) && ts.isObjectLiteralExpression(unwrap(d.initializer))) {
          const idp = unwrap(d.initializer).properties.find((p) => propName(p.name) === "id");
          if (idp && ts.isPropertyAssignment(idp) && ts.isStringLiteralLike(unwrap(idp.initializer))) id = unwrap(idp.initializer).text;
        }
        const pol = props.get("policy");
        let policyAllow = false;
        if (pol && ts.isPropertyAssignment(pol) && ts.isObjectLiteralExpression(unwrap(pol.initializer))) {
          const a = unwrap(pol.initializer).properties.find((p) => propName(p.name) === "authorize");
          const f = a && ts.isPropertyAssignment(a) ? unwrap(a.initializer) : a;
          if (f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f) || ts.isMethodDeclaration(f))) {
            const body = ts.isArrowFunction(f) && !ts.isBlock(f.body) ? f.body : f.body;
            const t = body.getText().replace(/[\s{}();]|return|async|await/g, "");
            policyAllow = /^["']allow["'](asconst)?$/.test(t);
          }
        }
        if (fns.length) out.push({ id, fns, node: h, registration: true, policyAllow });
      }
      // (2) handler map: `const handlers: Record<string, ToolHandler> = {..}` or `handlers: {..}`
      const par = n.parent;
      const typed = par && ts.isVariableDeclaration(par) && par.type && CTX_TYPE.test(par.type.getText());
      const asHandlers = par && ts.isPropertyAssignment(par) && propName(par.name) === "handlers";
      if ((typed || asHandlers) && toolFile) {
        for (const p of n.properties) {
          const id = propName(p.name);
          const fns = ts.isMethodDeclaration(p) ? [p] : ts.isPropertyAssignment(p) ? handlerFns(p.initializer, locals) : ts.isShorthandPropertyAssignment(p) && locals.has(p.name.text) ? [locals.get(p.name.text)] : [];
          if (fns.length) out.push({ id, fns, node: p, registration: false, policyAllow: usesKit });
        }
      }
    }
    // (3) `const x: ToolHandler = async ctx => ..`
    if (ts.isVariableDeclaration(n) && n.type && /^ToolHandler\b/.test(n.type.getText()) && n.initializer) {
      const fns = handlerFns(n.initializer, locals);
      if (fns.length) out.push({ id: undefined, fns, node: n, registration: false, policyAllow: false });
    }
  });
  // de-dupe by first function node
  const seen = new Set();
  return out.filter((h) => { const k = h.fns[0]; if (seen.has(k)) return false; seen.add(k); return true; });
}
const handlerSymbol = (h) => h.id ?? fnName(h.fns[0]);

// ---------- check 1: silent truncation ----------
const LIMIT_VAR = /^(limit|pageSize|page_size|perPage|per_page|take|maxResults|maxItems|maxRows|maxRecords|maxEntries|maxCount|defaultLimit|maxPageSize|max_results)$/;
const LIMIT_PROP = /^(limit|pageSize|page_size|perPage|per_page|take|first|maxResults|maxRows|maxRecords|maxEntries|max_results)$/;
const PAGING_WORD = /cursor|^next([A-Z_]|$)|hasMore|has_more|hasNext|truncat|^total|Total$|_total$|offset|Offset$|continuation|partial|Partial|moreAvailable|pageToken|nextPage|^more$|isComplete|complete$/;
// The function must look like it reads a list: otherwise `limit` is usually a byte/char/retry cap.
const LIST_WORD = /^(list|query|search|find|select|selectFrom|fetch|scan|browse|recent|history|page|rows|items|entries|results|records|members|hits|all)([A-Z_]|$)|(List|Query|Rows|Items|Entries|Results|Records|Members|Hits|History|Recent)$/;
// 2 = "is it ambiguous" probes; N+1 (11, 51, 101, 201..) = over-fetch-by-one to detect "more".
// Powers of two from 512 up are byte/char caps far more often than row caps.
const isTruncatingLimit = (v) => v >= 3 && !(v > 10 && v % 10 === 1) && !(v >= 512 && (v & (v - 1)) === 0);
function checkTruncation(ctx) {
  const { sf, emit } = ctx;
  const nums = new Map();
  walk(sf, (n) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isNumericLiteral(unwrap(n.initializer))) nums.set(n.name.text, Number(unwrap(n.initializer).text)); });
  /** First limit-sized number in a subtree, resolving same-file numeric consts. */
  const numIn = (node) => { let hit; const v = (c) => { if (hit !== undefined || isFn(c)) return;
    if (ts.isNumericLiteral(c) && isTruncatingLimit(Number(c.text))) hit = c.text;
    else if (ts.isIdentifier(c) && nums.has(c.text) && isTruncatingLimit(nums.get(c.text))) hit = `${c.text}=${nums.get(c.text)}`;
    else ts.forEachChild(c, v); }; v(node); return hit; };
  const byFn = new Map();
  const add = (n, what) => {
    const fn = namedEnclosing(n);
    if (!fn) return;
    if (!byFn.has(fn)) byFn.set(fn, { line: lineOf(sf, n), what: [] });
    byFn.get(fn).what.push(what);
  };
  walk(sf, (n) => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && LIMIT_VAR.test(n.name.text) && n.initializer) {
      if (!namedEnclosing(n)) return; // module constants are picked up where they are used
      const v = numIn(n.initializer); if (v) add(n, `${n.name.text}=${v}`);
    } else if (ts.isPropertyAssignment(n) && LIMIT_PROP.test(propName(n.name) ?? "")) {
      // only object literals handed to a call (query/list options) or returned, not config tables
      const holder = n.parent?.parent;
      if (!holder || !(ts.isCallExpression(holder) || ts.isReturnStatement(holder) || ts.isArrowFunction(holder))) return;
      const v = numIn(n.initializer); if (v) add(n, `${propName(n.name)}: ${v}`);
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(limit|take)$/.test(n.expression.name.text) && n.arguments.length === 1) {
      const v = numIn(n.arguments[0]); if (v) add(n, `.${n.expression.name.text}(${v})`);
    } else if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
      const t = n.getText();
      if (!/\bSELECT\b/i.test(t)) { if (ts.isTemplateExpression(n)) return false; return; }
      const m = /\bLIMIT\s+(\d+)/.exec(t); if (m && isTruncatingLimit(Number(m[1]))) add(n, `SQL LIMIT ${m[1]}`);
      if (ts.isTemplateExpression(n)) {
        // sql`... LIMIT ${CONST}` — the limit is the substitution right after the keyword
        let before = n.head.text;
        for (const span of n.templateSpans) {
          if (/\bLIMIT\s*$/i.test(before)) { const v = numIn(span.expression); if (v) add(n, `SQL LIMIT ${v}`); }
          before = span.literal.text;
        }
        return false;
      }
    }
  });
  for (const [fn, info] of byFn) {
    if (anyWord([fn], PAGING_WORD)) continue;
    const w = [fnName(fn), ...words(fn)];
    if (!w.some((x) => LIST_WORD.test(x)) && !info.what.some((x) => /^SQL|^\.limit|^\.take/.test(x))) continue;
    emit({ file: ctx.file, line: info.line, symbol: fnName(fn), detail: [...new Set(info.what)].join("; ") });
  }
}

// ---------- check 2: lost update ----------
const CONC = /revision|version|etag|e_tag|ifMatch|if-match|^expected(?!Count|Host|Prefix|Id$|AccountId|Source)[A-Z]|updated_?At|updated_at|precondition|compareAnd|lock_?Version|baseSeq|expectedSeq/i;
const isFullRecord = (arg) => {
  const a = unwrap(arg);
  if (!a) return false;
  if (ts.isIdentifier(a) || ts.isCallExpression(a) || ts.isPropertyAccessExpression(a)) return true;
  if (ts.isObjectLiteralExpression(a)) return a.properties.some(ts.isSpreadAssignment) || a.properties.length >= 4;
  return false;
};
/** Climb a fluent chain `a.b(..).c(..)` to its outermost call. */
function chainTop(n) { let t = n; while (t.parent && (ts.isPropertyAccessExpression(t.parent) && t.parent.expression === t || ts.isCallExpression(t.parent) && t.parent.expression === t)) t = t.parent; return t; }
function chainCalls(top) { const out = []; let t = top; while (t) { t = unwrap(t); if (ts.isCallExpression(t)) { out.push(t); t = t.expression; } else if (ts.isPropertyAccessExpression(t)) t = t.expression; else break; } return out; }
const SQL_UPDATE = /\bUPDATE\s+["`\w.]+\s+SET\b|\bDO\s+UPDATE\s+SET\b/i;
// Tool ids are snake_case (`webhooks_update`); a bare `replace` key is a menu/command handler, not a tool.
const WRITE_TOOL_ID = /^[a-z0-9]+(_[a-z0-9]+)*_(update|replace|set|edit|configure|put)(_[a-z0-9]+)*$/;
// A where-clause that compares current state/status/lease is a compare-and-set guard too.
const WHERE_GUARD = /status|state|lease|fence|owner_?token|claimed/i;
function checkLostUpdate(ctx) {
  const { sf, emit, locals, handlers } = ctx;
  if (/(^|\/)migrations?\//.test(ctx.file)) return; // one-off schema/data moves, no concurrent writers
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const m = n.expression.name.text;
      if ((m === "set" || m === "doUpdateSet") && n.arguments.length === 1 && isFullRecord(n.arguments[0])) {
        const top = chainTop(n);
        const calls = chainCalls(top);
        const isUpdate = m === "doUpdateSet" || calls.some((c) => calleeName(c) === "updateTable");
        if (!isUpdate) return;
        const wheres = calls.filter((c) => /^where/.test(calleeName(c) ?? ""));
        if (m === "doUpdateSet") {
          // the where for an upsert sits on the onConflict builder (oc.doUpdateSet(x).where(..))
          let p = n; while (p.parent && (ts.isPropertyAccessExpression(p.parent) || ts.isCallExpression(p.parent) && p.parent.expression === p)) { p = p.parent; if (ts.isCallExpression(p) && /^where/.test(calleeName(p) ?? "")) wheres.push(p); }
        }
        if (wheres.some((w) => anyWord(w.arguments, CONC) || anyWord(w.arguments, WHERE_GUARD))) return;
        const table = calls.map((c) => (calleeName(c) === "updateTable" || calleeName(c) === "insertInto") && c.arguments[0] ? c.arguments[0].getText() : undefined).find(Boolean);
        const fn = namedEnclosing(n);
        emit({ file: ctx.file, line: lineOf(sf, n), symbol: fn ? fnName(fn) : "<module>", detail: `${m === "set" ? "updateTable.set" : "upsert doUpdateSet"}(${clean(n.arguments[0].getText()).slice(0, 40)}) ${table ?? ""} no revision in where` });
      }
      // (d) Express PUT route
      if (m === "put" && n.arguments.length >= 2 && ts.isStringLiteralLike(unwrap(n.arguments[0])) && unwrap(n.arguments[0]).text.startsWith("/")) {
        const fns = n.arguments.slice(1).flatMap((a) => handlerFns(a, locals));
        if (!fns.length) return;
        if (fns.flatMap((f) => expand(f, locals)).some((f) => anyWord([f], CONC))) return;
        emit({ file: ctx.file, line: lineOf(sf, n), symbol: `PUT ${unwrap(n.arguments[0]).text}`, detail: "PUT route handler never names a revision/version/etag/If-Match" });
      }
    }
    if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
      const t = n.getText();
      if (SQL_UPDATE.test(t)) {
        const set = t.split(/\bSET\b/i).slice(1).join(" ").split(/\bWHERE\b|\bRETURNING\b/i)[0];
        const assigns = (set.match(/=/g) ?? []).length;
        if (assigns >= 3 && !CONC.test(t.replace(/\$\{[^}]*\}/g, (s) => s))) {
          const fn = namedEnclosing(n);
          emit({ file: ctx.file, line: lineOf(sf, n), symbol: fn ? fnName(fn) : "<module>", detail: `SQL ${/DO\s+UPDATE/i.test(t) ? "upsert" : "UPDATE"} of ${assigns} columns, no revision in statement` });
        }
      }
      if (ts.isTemplateExpression(n)) return false;
    }
  });
  for (const h of handlers) {
    if (!h.id || !WRITE_TOOL_ID.test(h.id)) continue;
    if (h.fns.flatMap((f) => expand(f, locals)).some((f) => anyWord([f], CONC))) continue;
    emit({ file: ctx.file, line: lineOf(sf, h.node), symbol: h.id, detail: "write tool: handler and same-file helpers never name a revision/version/etag" });
  }
}

// ---------- check 3: abort not reaching writes ----------
// Bare names count only when unambiguous; verb+Suffix names (updatePost, setCommentsSettings) count for
// methods and free functions alike, minus factories/timers/in-memory collection ops.
const WRITE_BARE = /^(insert|update|upsert|save|write|unlink|rmdir|mkdir|rename|append|purge|publish|install|uninstall|deploy|persist|commit|trash|archive|moderate|restore|enqueue|deleteFrom|insertInto|updateTable|writeFile|appendFile|copyFile|rm|cp)$/;
const WRITE_PREFIXED = /^(insert|update|upsert|delete|remove|save|write|replace|unlink|rename|append|purge|publish|send|install|uninstall|import|restore|deploy|persist|moderate|trash|archive|move|copy|approve|revoke|rotate|issue|enqueue|schedule|execute|commit|store|put|patch|set|create|enable|disable|unpublish|unschedule|cancel|merge|promote|transfer)[A-Z_]/;
const NOT_WRITE = /^(setTimeout|setInterval|setImmediate|setHeader|setStatus|setAttribute|setProperty|storeGet|create\w*(Store|Clock|Generator|Scheduler|Deps|Error|Context|Service|Client|Registry|Adapter|Port|Handler|View|Id|Uuid|Hash|Logger|Map|Set|Reader|Writer|Factory|Kernel|Runtime|Router|App|Server|Controller|Signal|Url|URL|Request|Response|Result|Validator|Schema|Parser|Formatter|Builder|Emitter|Tracker|Limiter|Cache|Queue|Pool|Hmac|Hash|Cipher|Decipher|Element|TextNode|Ref|Slice|Selector|Tool|Tools|Registration|Registrations|Options|Config|Policy)|cancel\w*Timer|\w+(View|Views|Loader|Ports|Checks|Hooks|Options|Deps|Config|Snapshot|Preview|Plan|Input|Inputs|Payload|Summary|Status|Result|Results|Targets|Answers|State)$)$/;
const FS_FREE = /^(writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rm|rmSync|rmdir|mkdir|mkdirSync|rename|renameSync|copyFile|cp)$/;
const SIGNAL_WORD = /^(signal|abortSignal|aborted|throwIfAborted)$/;
function writeCalls(nodes) {
  const out = [];
  for (const f of nodes) walk(f, (c) => {
    if (!ts.isCallExpression(c)) return;
    const e = unwrap(c.expression);
    const name = calleeName(c);
    if (!name) return;
    if (FS_FREE.test(name) || (WRITE_BARE.test(name) || WRITE_PREFIXED.test(name)) && !NOT_WRITE.test(name)) out.push({ node: c, name });
    else if (name === "fetch" && c.arguments[1] && /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)/i.test(c.arguments[1].getText())) out.push({ node: c, name: "fetch(write)" });
  });
  return out;
}
/** True when the handler hands its whole context object (`fn(ctx)`, `{ ctx }`, `{ ...ctx }`) to a function
 * outside this file, which may read the signal / check the caller there. */
function passesContextAway(h, all, locals) {
  const param = h.fns[0].parameters?.[0];
  const ctxName = param && ts.isIdentifier(param.name) ? param.name.text : undefined;
  if (!ctxName) return false;
  let found = false;
  const isCtx = (a) => { const u = unwrap(a); return ts.isIdentifier(u) && u.text === ctxName
    || ts.isObjectLiteralExpression(u) && u.properties.some((p) => ts.isShorthandPropertyAssignment(p) && p.name.text === ctxName || ts.isSpreadAssignment(p) && p.expression.getText() === ctxName
      || ts.isPropertyAssignment(p) && ts.isIdentifier(unwrap(p.initializer)) && unwrap(p.initializer).text === ctxName); };
  for (const f of all) walk(f, (c) => {
    if (found || !ts.isCallExpression(c)) return;
    const callee = unwrap(c.expression);
    if (ts.isIdentifier(callee) && locals.has(callee.text)) return;
    if (c.arguments.some(isCtx)) found = true;
  });
  return found;
}
function checkAbort(ctx) {
  const { sf, emit, locals, handlers } = ctx;
  for (const h of handlers) {
    const all = h.fns.flatMap((f) => expand(f, locals));
    const writes = writeCalls(all);
    if (!writes.length) continue;
    const signalRefs = [];
    for (const f of all) walk(f, (c) => { if ((ts.isIdentifier(c) && SIGNAL_WORD.test(c.text))) signalRefs.push(c); });
    if (!signalRefs.length) {
      if (passesContextAway(h, all, locals)) continue; // another file's function may read the signal
      emit({ file: ctx.file, line: lineOf(sf, h.node), symbol: handlerSymbol(h), detail: `never reads signal; writes: ${[...new Set(writes.map((w) => w.name))].slice(0, 6).join(", ")}` });
      continue;
    }
    // (ii) text order inside the handler's own body
    const own = writes.filter((w) => h.fns.some((f) => w.node.pos >= f.pos && w.node.end <= f.end) && !/signal/i.test(w.node.getText()));
    const ownRefs = signalRefs.filter((s) => h.fns.some((f) => s.pos >= f.pos && s.end <= f.end));
    const awaits = [];
    for (const f of h.fns) walk(f, (c) => { if (ts.isAwaitExpression(c)) awaits.push(c); });
    for (const w of own) {
      const last = ownRefs.filter((s) => s.end <= w.node.pos).at(-1);
      if (!last) continue;
      const between = awaits.find((a) => a.pos >= last.end && a.end <= w.node.pos && !/signal/i.test(a.getText()));
      if (between) {
        emit({ file: ctx.file, line: lineOf(sf, w.node), symbol: handlerSymbol(h), detail: `awaits (line ${lineOf(sf, between)}) after last signal read (line ${lineOf(sf, last)}) before write ${w.name}` });
        break;
      }
    }
  }
}

// ---------- check 4: unenforced permission ----------
const ENFORCE_WORD = /authori[sz]|permission|principal|assertcan|requireadmin|requireoperator|^(actor|role|roles|owner|can)$|Actor|Role|Owner|_ROLE|_OWNER/i;
function catalogPermissions(sf, map, file, strConsts) {
  walk(sf, (n) => {
    if (!ts.isObjectLiteralExpression(n)) return;
    let id, perm;
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const k = propName(p.name), v = unwrap(p.initializer);
      if ((k === "id" || k === "name") && ts.isStringLiteralLike(v)) id = v.text;
      else if ((k === "id" || k === "name") && ts.isIdentifier(v) && strConsts.has(v.text)) id = strConsts.get(v.text);
      if (k === "authorization" && ts.isObjectLiteralExpression(v)) {
        const pp = v.properties.find((q) => propName(q.name) === "permission");
        if (pp && ts.isPropertyAssignment(pp)) perm = ts.isStringLiteralLike(unwrap(pp.initializer)) ? unwrap(pp.initializer).text : pp.initializer.getText();
      }
    }
    if (id && perm && !map.has(id)) map.set(id, { perm, file });
  });
}
function checkPermission(ctx, catalog, strConsts) {
  const { sf, emit, locals, handlers } = ctx;
  for (const h of handlers) {
    if (!h.id || !h.policyAllow) continue;
    const id = strConsts.get(h.id) ?? h.id; // `[FOO_TOOL_ID]: handler` keys
    const decl = catalog.get(id);
    if (!decl) continue;
    const all = h.fns.flatMap((f) => expand(f, locals));
    if (anyWord(all, ENFORCE_WORD) || passesContextAway(h, all, locals)) continue;
    emit({ file: ctx.file, line: lineOf(sf, h.node), symbol: id, detail: `declares ${decl.perm} (${decl.file}); policy allow; handler never names authorize/permission/principal` });
  }
}

// ---------- check 5: hung express handler ----------
const ROUTE_METHOD = /^(get|post|put|patch|delete|del|all|use|options|head)$/;
const REQ = /^_?(req|request)$/, RES = /^_?(res|response)$/;
function uncovered(fn) {
  const bad = [];
  const v = (c) => {
    if (isFn(c)) return;
    if (ts.isTryStatement(c)) { if (c.catchClause) { v2(c.catchClause.block); if (c.finallyBlock) v2(c.finallyBlock); return; } }
    if (ts.isAwaitExpression(c)) {
      const e = unwrap(c.expression);
      if (ts.isCallExpression(e) && calleeName(e) === "catch") return;
      bad.push(c);
    } else if (ts.isThrowStatement(c)) bad.push(c);
    ts.forEachChild(c, v);
  };
  const v2 = (b) => ts.forEachChild(b, v); // catch/finally bodies are themselves uncovered
  if (fn.body) ts.forEachChild(fn.body, v);
  return bad;
}
function checkHungHandler(ctx) {
  const { sf, emit, locals } = ctx;
  if (/^apps\/desktop\//.test(ctx.file)) return;
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || !ROUTE_METHOD.test(n.expression.name.text)) return;
    const first = n.arguments[0] && unwrap(n.arguments[0]);
    const route = !first || isFn(first) ? "" : ts.isStringLiteralLike(first) ? first.text : first.getText().slice(0, 60);
    for (const a of n.arguments) {
      let f = unwrap(a);
      if (ts.isIdentifier(f) && locals.has(f.text)) f = locals.get(f.text);
      if (!(ts.isArrowFunction(f) || ts.isFunctionExpression(f) || ts.isFunctionDeclaration(f)) || !isAsync(f)) continue;
      const ps = f.parameters.map((p) => p.name.getText());
      if (ps.length < 2 || !REQ.test(ps[0]) || !RES.test(ps[1])) continue;
      const bad = uncovered(f);
      if (!bad.length) continue;
      emit({ file: ctx.file, line: lineOf(sf, a), symbol: `${n.expression.name.text.toUpperCase()} ${route || "<middleware>"}`, detail: `async handler, ${bad.length} await/throw outside try/catch (first line ${lineOf(sf, bad[0])})${f !== unwrap(a) ? ` via ${unwrap(a).getText()}` : ""}` });
    }
  });
}

// ---------- check 6: replace $ expansion ----------
function checkReplace(ctx) {
  const { sf, emit } = ctx;
  const consts = new Map();
  walk(sf, (n) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isStringLiteralLike(unwrap(n.initializer))) consts.set(n.name.text, unwrap(n.initializer).text); });
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || !/^(replace|replaceAll)$/.test(n.expression.name.text) || n.arguments.length !== 2) return;
    const b = unwrap(n.arguments[1]);
    if (ts.isArrowFunction(b) || ts.isFunctionExpression(b)) return;
    if (ts.isIdentifier(b) && ctx.locals.has(b.text)) return; // a same-file replacer function
    if (ts.isStringLiteralLike(b)) return; // a literal `$1`/`$&` is the author's intent
    if (cannotHaveDollar(b, consts)) return;
    const t = b.getText();
    if (/\\\$\/g\s*,\s*["'`]\$\$\$\$/.test(t) || /["'`]\$\$\$\$["'`]/.test(t)) return; // already escapes $
    const kind = ts.isIdentifier(b) ? "identifier" : ts.isTemplateExpression(b) ? "template" : ts.isCallExpression(b) ? "call" : ts.isPropertyAccessExpression(b) || ts.isElementAccessExpression(b) ? "property" : "expression";
    const fn = namedEnclosing(n);
    emit({ file: ctx.file, line: lineOf(sf, n), symbol: fn ? fnName(fn) : "<module>", detail: `${n.expression.name.text}(${clean(n.arguments[0].getText()).slice(0, 50)}, <${kind}> ${clean(t).slice(0, 60)})` });
  });
}
// Values that cannot carry a `$`: literals without one, numbers, encodeURIComponent (it encodes `$`),
// String()/toFixed() of number-named values, and templates/conditionals/`??` built only from those.
const NUMERIC_NAME = /(count|Count|length|Length|size|Size|index|Index|version|Version|minutes|Minutes|seconds|Seconds|hours|Hours|days|Days|Ms|ms|num|Num|number|Number|total|Total|percent|Percent|port|Port|year|Year|^n|^i)$/;
function cannotHaveDollar(e, consts) {
  e = unwrap(e);
  if (!e) return true;
  if (ts.isStringLiteralLike(e)) return !e.text.includes("$");
  if (ts.isNumericLiteral(e) || e.kind === K.TrueKeyword || e.kind === K.FalseKeyword) return true;
  if (ts.isIdentifier(e)) return consts.has(e.text) ? !consts.get(e.text).includes("$") : NUMERIC_NAME.test(e.text);
  if (ts.isPropertyAccessExpression(e)) return NUMERIC_NAME.test(e.name.text);
  if (ts.isTemplateExpression(e)) return !e.head.text.includes("$") && e.templateSpans.every((sp) => !sp.literal.text.includes("$") && cannotHaveDollar(sp.expression, consts));
  if (ts.isConditionalExpression(e)) return cannotHaveDollar(e.whenTrue, consts) && cannotHaveDollar(e.whenFalse, consts);
  if (ts.isBinaryExpression(e) && [K.QuestionQuestionToken, K.BarBarToken].includes(e.operatorToken.kind)) return cannotHaveDollar(e.left, consts) && cannotHaveDollar(e.right, consts);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === K.PlusToken) return cannotHaveDollar(e.left, consts) && cannotHaveDollar(e.right, consts);
  if (ts.isCallExpression(e)) {
    const name = calleeName(e);
    if (name === "encodeURIComponent") return true;
    if ((name === "String" || name === "Number") && e.arguments.length === 1) return name === "Number" || cannotHaveDollar(e.arguments[0], consts);
    if (/^(toFixed|toPrecision)$/.test(name ?? "")) return true;
    if (/^(toString|toLocaleString)$/.test(name ?? "") && ts.isPropertyAccessExpression(e.expression)) return cannotHaveDollar(e.expression.expression, consts);
  }
  return false;
}

// ---------- check 7: secrets in logs ----------
const SECRET = /(token|secret|password|passwd|passphrase|apiKey|api_key|privateKey|private_key|accessKey|secretKey|signingKey|encryptionKey|authKey|masterKey|clientSecret|authorization|cookie|credential|bootToken|sessionKey|bearer)$/i;
const NOT_SECRET = /^(has|is|should|needs|with|no|use|uses|allow|require|missing|show|can)[A-Z_]|(Name|Names|EnvVar|Env|Id|Ids|Count|Length|Path|Kind|Type|Types|Status|Error|Expired|Ttl|Ms|At|Hint|Label|Field|Fields|Keys|Source|Mode|Prefix|Ref|Present|Configured|Set|Missing|Valid|Hash|Fingerprint|Header|Headers|Policy|Url|Scope|Scopes)$/;
const LLM_TOKEN = /tokens$|^(max|input|output|total|prompt|completion|cache|cached|reasoning|estimated|used|remaining)\w*token|^(next|page|continuation|cancel|cancellation|sync|resume)\w*token$|tokeni[sz]er/i;
const SAFE_WRAP = /^(redact|mask|hash|sha|fingerprint|Boolean|describe|safe|scrub|sanitize|summari[sz]e|count|len|truncateSecret|preview)/i;
function referencedSecrets(arg) {
  const hits = [];
  const v = (c) => {
    if (isFn(c)) return;
    if (ts.isCallExpression(c) && SAFE_WRAP.test(calleeName(c) ?? "")) return;
    if (ts.isTypeOfExpression(c) || ts.isPrefixUnaryExpression(c) && c.operator === K.ExclamationToken) return;
    if (ts.isBinaryExpression(c) && [K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.EqualsEqualsToken, K.ExclamationEqualsToken, K.InstanceOfKeyword, K.InKeyword].includes(c.operatorToken.kind)) return;
    if (ts.isConditionalExpression(c)) { v(c.whenTrue); v(c.whenFalse); return; }
    if (ts.isPropertyAccessExpression(c) && /^(length|size)$/.test(c.name.text)) return;
    if (ts.isPropertyAssignment(c)) { v(c.initializer); return; } // key names are labels, not values
    const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
    if (name && SECRET.test(name) && !NOT_SECRET.test(name) && !LLM_TOKEN.test(name)) {
      // `x.token` — the whole access is the value; `token.x` — only flag the leaf
      if (!(ts.isPropertyAccessExpression(c.parent) && c.parent.expression === c)) { hits.push(c.getText()); return; }
    }
    if (ts.isShorthandPropertyAssignment(c) && SECRET.test(c.name.text) && !NOT_SECRET.test(c.name.text) && !LLM_TOKEN.test(c.name.text)) { hits.push(c.name.text); return; }
    ts.forEachChild(c, v);
  };
  v(arg);
  return hits;
}
const LOG_METHOD = /^(log|info|warn|error|debug|trace|fatal)$/;
const LOGGER_OBJ = /^(console|log|logger|_logger|logging|\w*Logger|\w*Log)$/i;
function checkSecretsInLogs(ctx) {
  const { sf, emit } = ctx;
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression) || !LOG_METHOD.test(n.expression.name.text)) return;
    const obj = unwrap(n.expression.expression);
    const objName = ts.isIdentifier(obj) ? obj.text : ts.isPropertyAccessExpression(obj) ? obj.name.text : "";
    if (!LOGGER_OBJ.test(objName)) return;
    const hits = n.arguments.flatMap(referencedSecrets);
    if (!hits.length) return;
    const fn = namedEnclosing(n);
    emit({ file: ctx.file, line: lineOf(sf, n), symbol: fn ? fnName(fn) : "<module>", detail: `${objName}.${n.expression.name.text} references ${[...new Set(hits)].slice(0, 4).map(clean).join(", ")}` });
  });
}

// ---------- run ----------
const CHECKS = [
  ["silent-truncation", checkTruncation],
  ["lost-update", checkLostUpdate],
  ["abort-not-reaching-writes", checkAbort],
  ["unenforced-permission", null],
  ["hung-express-handler", checkHungHandler],
  ["replace-dollar-expansion", checkReplace],
  ["secrets-in-logs", checkSecretsInLogs],
];
const rows = Object.fromEntries(CHECKS.map(([c]) => [c, []]));
const fileCounts = {};
const parseErrors = [];
for (const repo of REPOS) {
  const files = prodFiles(repo);
  fileCounts[repo.name] = files.length;
  const parsed = [];
  const catalog = new Map();
  const strConsts = new Map();
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(path.join(repo.dir, f), "utf8"); } catch (e) { parseErrors.push(`${repo.name}:${f}: ${e.message}`); continue; }
    const kind = /\.(tsx|jsx)$/.test(f) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind);
    // UPPER_CASE string constants, repo-wide: tool ids are often `export const FOO_TOOL_ID = 'foo_bar'`
    walk(sf, (n) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z][A-Z0-9_]+$/.test(n.name.text) && n.initializer && ts.isStringLiteralLike(unwrap(n.initializer)) && !strConsts.has(n.name.text)) strConsts.set(n.name.text, unwrap(n.initializer).text); });
    parsed.push({ f, sf });
  }
  for (const { f, sf } of parsed) catalogPermissions(sf, catalog, f, strConsts);
  for (const { f, sf } of parsed) {
    const locals = localFunctions(sf);
    const handlers = toolHandlers(sf, locals);
    for (const [check, run] of CHECKS) {
      const emit = (r) => rows[check].push({ repo: repo.name, ...r });
      const ctx = { sf, file: f, locals, handlers, emit };
      try { if (run) run(ctx); else checkPermission(ctx, catalog, strConsts); } catch (e) { parseErrors.push(`${repo.name}:${f}:${check}: ${e.message}`); }
    }
  }
}

fs.mkdirSync(OUT, { recursive: true });
const seen = new Set();
for (const [check] of CHECKS) {
  const list = rows[check].filter((r) => { const k = `${check}|${r.repo}|${r.file}|${r.line}|${r.symbol}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.line - b.line);
  rows[check] = list;
  fs.writeFileSync(path.join(OUT, `${check}.tsv`), ["repo\tfile\tline\tsymbol\tdetail", ...list.map((r) => [r.repo, r.file, r.line, clean(r.symbol), clean(r.detail)].join("\t"))].join("\n") + "\n");
}

// summary.md — counts, top files, limits (from the header above), samples
const header = fs.readFileSync(new URL(import.meta.url), "utf8").split("\n");
const limitsFor = (i) => {
  const start = header.findIndex((l) => l.startsWith(`// ${i} `));
  const out = [];
  for (let j = start; j >= 0 && j < header.length && header[j].startsWith("//") && (j === start || !/^\/\/ \d /.test(header[j])); j++) out.push(header[j].replace(/^\/\/ ?/, ""));
  return out.join(" ").replace(/\s+/g, " ").trim();
};
// What each check gave up for precision (tuning notes, kept next to the code that does it).
const TRADES = {
  "silent-truncation": "Needs a list-ish word in the function; ignores limit 1-2 (lookups/ambiguity probes), N+1 over-fetch limits (11, 51, 101...) and power-of-two caps >= 512 (byte/char caps). Any paging word anywhere in the function clears it, even if the caller never sees it. Recall sanity check (11-11): members 100, visitor assistant 20, newsletter 100 and keys 50 are found; media 50 is not, because that list returns a cursor.",
  "lost-update": "Skips migrations; a where-clause comparing status/state/lease counts as a guard; upsert/set with <= 3 literal fields is treated as a partial update; tool ids must be snake_case with an update/replace/set/edit/configure/put segment (save = usually create).",
  "abort-not-reaching-writes": "Skips handlers that hand their whole context to another file; write verbs exclude builder-shaped names (*View, *Loader, *Ports, *Options...) and factories; UI .tsx handler maps are not tools.",
  "unenforced-permission": "Any authorize/permission/principal/actor/role/owner word, or handing the context to another file, counts as enforcement.",
  "hung-express-handler": "Only async functions written inline (or same-file named) in the route call; await x.catch(..) counts as covered; apps/desktop skipped (Express 5).",
  "replace-dollar-expansion": "Literal replacements are the author's intent; number-named values, String()/toFixed() of them and encodeURIComponent output are treated as $-free.",
  "secrets-in-logs": "Only console/log/logger receivers; descriptive names (has*/is*/*Name/*Id/*Env...), LLM and paging tokens, and anything inside redact/mask/hash/Boolean/typeof/comparisons are ignored.",
};
const md = [`# Bug-class audit — ${today}`, "", `Generated by \`development/scripts/bug-class-audit.mjs\`. Static syntax-tree heuristics, one file at a time; every row is a candidate to confirm, not a confirmed bug.`, "",
  `Files scanned: ${REPOS.map((r) => `${r.name} ${fileCounts[r.name]}`).join(", ")}${parseErrors.length ? `; ${parseErrors.length} read/check errors (listed at the end)` : ""}.`, "",
  "## Hits per check", "", `| check | ${REPOS.map((r) => r.name).join(" | ")} | total |`, `|---|${REPOS.map(() => "---|").join("")}---|`,
  ...CHECKS.map(([c]) => `| ${c} | ${REPOS.map((r) => rows[c].filter((x) => x.repo === r.name).length).join(" | ")} | ${rows[c].length} |`), ""];
CHECKS.forEach(([c], i) => {
  const list = rows[c];
  const byFile = new Map();
  for (const r of list) byFile.set(`${r.repo}:${r.file}`, (byFile.get(`${r.repo}:${r.file}`) ?? 0) + 1);
  const top = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const samples = [];
  const step = Math.max(1, Math.floor(list.length / 5));
  for (let j = 0; j < list.length && samples.length < 5; j += step) samples.push(list[j]);
  md.push(`## ${i + 1}. ${c} (${list.length})`, "", `**Matches and limits:** ${limitsFor(i + 1)}`, "", `**Recall given up for precision:** ${TRADES[c]}`, "",
    "**Top files:**", "", ...(top.length ? top.map(([f, n]) => `- ${n} — \`${f}\``) : ["- none"]), "",
    "**Samples:**", "", ...(samples.length ? samples.map((r) => `- ${r.repo} \`${r.file}:${r.line}\` \`${clean(r.symbol)}\` — ${clean(r.detail)}`) : ["- none"]), "");
});
if (parseErrors.length) md.push("## Read/check errors", "", ...parseErrors.slice(0, 50).map((e) => `- ${e}`), "");
fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n"));
console.log(`bug-class audit → ${OUT}`);
for (const [c] of CHECKS) console.log(`${c}\t${REPOS.map((r) => `${r.name}=${rows[c].filter((x) => x.repo === r.name).length}`).join("\t")}`);
if (parseErrors.length) console.log(`errors: ${parseErrors.length}`);
