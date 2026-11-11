#!/usr/bin/env node
/**
 * Tier-0 dossier for the Tovu -> Jini extraction survey.
 *
 * Precomputes per-file FACTS (no judgement) so later model passes (Claude and Codex, blind to each
 * other) can label every Tovu file cheaply: imports/importers with barrel and re-export resolution,
 * Jini same-name exports, shape twins, port-implementation edges, private-format coupling, product
 * literals, stale path references, bug-pass hints, feature SCCs and leaf-first batches.
 *
 * Method notes (see ADS-memory/.local-artifacts/codex/2026-11-10/extract-canary*.md):
 * - Imports come from the TypeScript AST, one file at a time (ts.createSourceFile, no Program, no
 *   type checker). The CBM graph is NOT used: its TS import edges are wrong (canary #1).
 * - The Jini tree compared against is a plain checkout of the Jini repo (default: the freshest
 *   survey clone; pass --jini to change). Only its packages/<pkg>/src files are read.
 *
 * Usage: node development/scripts/extraction-dossier.mjs [--tovu DIR] [--jini DIR] [--out DIR]
 * Read-only on both repos; writes only under --out.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const TOVU = path.resolve(arg("--tovu", process.cwd()));
const JINI = path.resolve(arg("--jini", "/Users/la/Programming/tovu-integration-clones/ui-jini"));
const today = new Date().toISOString().slice(0, 10);
const OUT = path.resolve(arg("--out", path.join(TOVU, `ADS-memory/.local-artifacts/extraction-survey/${today}/dossier`)));
// --drift DIR [--batch bNNN]: reviewers read a newer HEAD than the dossier was built at. A bare HEAD
// mismatch was a false alarm in the pilot (DE #9: the only new commit added this script), so count
// only the commits since the build that touch the batch's files (or apps/ packages/).
if (arg("--drift")) {
  const dir = path.resolve(arg("--drift")); const stamp = JSON.parse(fs.readFileSync(path.join(dir, "stamp.json"), "utf8"));
  const batch = arg("--batch");
  const paths = batch ? fs.readFileSync(path.join(dir, "batches", `${batch}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).path) : ["apps", "packages"];
  const since = (repo, list) => execFileSync("git", ["-C", repo.dir, "log", "--oneline", `${repo.head}..HEAD`, "--", ...list], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n").filter(Boolean);
  const t = since(stamp.tovu, paths); const j = since(stamp.jini, ["packages"]);
  console.log(`commits since build touching slice files: ${t.length}${batch ? ` (batch ${batch})` : ""}`); t.slice(0, 20).forEach((l) => console.log(`  ${l}`));
  console.log(`Jini commits since build touching packages/: ${j.length}`); j.slice(0, 10).forEach((l) => console.log(`  ${l}`));
  // v4 (judge 2 #11): refuse to judge across a mismatch: non-zero exit when the slice or Jini moved.
  const headNow = execFileSync("git", ["-C", stamp.tovu.dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (headNow !== stamp.tovu.head) console.log(`Tovu HEAD ${headNow.slice(0, 9)} != dossier ${stamp.tovu.head.slice(0, 9)}${t.length ? "" : " (no slice file changed)"}`);
  if (t.length || j.length) { console.log("DRIFT: rebuild the dossier or re-check these files before judging."); process.exit(1); }
  process.exit(0);
}
const ts = createRequire(import.meta.url)(path.join(TOVU, "node_modules/typescript"));
const t0 = Date.now();

// ---------------------------------------------------------------------------------------------
// Tunables. Each is a noise/recall trade-off chosen on the canary slices.
// ---------------------------------------------------------------------------------------------
const MIN_UNIT_STATEMENTS = 5;     // bodies under ~5 statements are one-liners: twins there are noise
const MIN_UNIT_SHINGLES = 25;      // ...and so are bodies with too few distinct node-kind 5-grams
const SHINGLE_K = 5;
const MINHASH_N = 64, LSH_BANDS = 16; // 16 bands x 4 rows: candidate pairs from Jaccard ~0.5 up
const LSH_BUCKET_CAP = 30;         // a bucket shared by >30 bodies is a generic idiom, not a twin
const TWIN_REPORT = 0.6;           // report body twins at Jaccard >= 0.6 ...
const TWIN_STRONG = 0.75;          // ...but only >= 0.75 (or a type-shape twin) triggers Tier 2
const SHAPE_BUCKET_CAP = 8;        // a type shape shared by >8 declarations is a common idiom
const TWIN_STRONG_TT = 0.8;        // Tovu<->Tovu body twins >= 0.8 with >= 5 statements are Tier 2 (pilot DE: a sim-1
const TWIN_STRONG_TT_STMTS = 5;    // twin of 5 statements sat at Tier 1 under the old 0.9/8 bar)
const SMALL_EXACT_MIN_CHARS = 30;  // one-liner bodies twin only on identical text (whitespace/comments stripped) this long
const SMALL_EXACT_BUCKET_CAP = 3;  // ...and only when that exact text appears at <= 3 sites (else it is an idiom)
const BATCH_MAX_FILES = 25;        // pilot: 20-25 file batches with up to 9k lines overran a reviewer's context;
const BATCH_MAX_LOC = 3500;        // cap by lines as well as files (a single bigger file is its own batch)
const FEATURE_SPLIT = 120;         // a folder with >120 files (server/inbound, contracts/core) is split one level deeper
const LIST_CAP = 15;               // cap long per-file lists in the dossier (counts stay exact)
// Behaviour fingerprint (LEGACY-TWIN pre-pass): tokens in more than this share of all parsed files are
// vocabulary (map, length, useState, "id"), not behaviour, and are dropped before the Jaccard.
const BEH_MAX_DF_SHARE = 0.01;
const LEGACY_MIN_SIM = 0.2;        // LEGACY-TWIN: behaviour Jaccard >= 0.2, or overlap (shared / smaller
const LEGACY_MIN_OVERLAP = 0.2;    // side) >= 0.2, and always >= 20 shared distinctive tokens (smaller
const LEGACY_MIN_SHARED = 20;      // modules say too little). Calibrated on admin media (overlap 0.23).
// v3 floor (round-2 judge 1 #1): trash routes (j0.12) and api-connections/oauth-callback (j0.02) were
// false LEGACY-TWINs. A Jaccard floor of 0.05 drops the 0.02-0.04 noise but keeps admin media (0.06,
// pilot-proven). An admin->@jini-ai/admin name match keeps the old bar: same app, same module name.
const LEGACY_FLOOR = 0.05;
// v4 (judge 3 #9): a LEGACY-TWIN lifts a file only when the file itself shares this many distinctive tokens.
const LEGACY_OWN_MIN_SHARED = 8;
// Same-name twins (round-2 judge 1 #2, judge 3 #2): names this long, defined in <= this many files.
const NAME_TWIN_MIN_LEN = 8, NAME_TWIN_MAX_SITES = 6;
// Small structural twins: one-statement bodies with >= this many AST nodes hash by node kinds only
// (identifier-agnostic), so `return { a: d.x, ... }` mappers copied with renamed params still match.
const SMALL_KINDS_MIN = 40, SMALL_KINDS_BUCKET_CAP = 4;
// Reviewer rule (round-2 judge 2): helpers under ~12 lines in a MIXED file default to STAY.
const SMALL_HELPER_LINES = 12;
// "Core" for CORE-CONTRACT-NEEDED: a file that would move into Jini but imports >= 2 Jini packages
// other than these needs a contract in core first (owner 11-07: no package above domains).
const CORE_PKGS = new Set(["@jini-ai/core"]);
// v4 (round-3 judges). Exact-small twins need >= 3 statements or a long body: a one-statement
// `appendRevision` or a 2-statement ValidationError constructor matched by accident (judge 1 #3, judge 2 #4).
const EXACT_SMALL_MIN_STMTS = 3, EXACT_SMALL_LONG_CHARS = 160;
// Normalised-text twins (identifiers declared in the body renamed positionally, quotes unified, types
// dropped): withoutKey <-> omitKeys-style copies scored sim 0 by name (judge 3 #8). Bodies this long.
const NORM_MIN_CHARS = 60, NORM_BUCKET_CAP = 6;
// Behaviour twins per unit (name-independent): distinctive tokens (strings, callees, property names)
// shared with one Jini unit. Calibrated so decodeSseFrames / createBrowserSessionStore-style
// restructured copies surface (judge 1 #2) without matching every CRUD helper.
const UNIT_BEH_MIN_SHARED = 8, UNIT_BEH_MIN_JACCARD = 0.5, UNIT_BEH_MAX_DF = 40;
const UNIT_BEH_TT_MIN_SHARED = 12, UNIT_BEH_TT_MIN_JACCARD = 0.6; // Tovu<->Tovu beh twins (report-only)
const UNIT_BEH_CONTAIN = 0.75, UNIT_BEH_CONTAIN_MIN = 0.4; // containment path of the beh pass (see there)
// A module-level Jini twin: summed best-unit similarity >= this with >= 2 matched units, or one unit
// >= 0.8 that is >= 5 statements (judge 1 #2: rank by summed similarity, not a same-name hit).
const MODULE_TWIN_MIN_SUM = 1.2;
// Tier 2 when a Tovu<->Jini code twin reaches this (judge 1 #10); Tovu<->Tovu keeps TWIN_STRONG_TT.
const TWIN_TIER2_JINI = 0.6;
// A barrel with this many re-exports no prod file imports is not mechanical (judge 2 #6: media index.ts ~49).
const DEAD_REEXPORT_TIER1 = 3;
// Permission-name shape ("content.read", "admin.security.site-key.manage").
const PERM_RE = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*){1,4}$/;
// Generic error wording a user cannot act on (owner 11-03: no generic errors).
const GENERIC_ERR_RE = /^\s*(something went wrong|failed|error|unknown error|internal error|an error occurred|request failed|operation failed)[.!]?\s*$/i;
// Hand-written permission checks inside tool handlers (the design view: permission declared on the
// tool, enforced centrally by the runner; each of these is a check the runner should own).
const HAND_CHECK_RE = /^(requireToolPermission|requireWidgetPermission|requireFederatedPermission|assert\w*Permission|check\w*Permission|hasPermission|authorize\w*|ensure\w*Permission)$/;

const VENDORS = ["github", "gitlab", "bitbucket", "vercel", "netlify", "cloudflare", "fly", "stripe", "shopify",
  "posthog", "openai", "anthropic", "gemini", "formspree", "higgsfield", "supabase", "resend", "sendgrid",
  "mailchimp", "slack", "discord", "twilio", "sentry", "google", "aws", "azure", "heroku", "railway", "render"];
const CRUD_RE = /^(save|list|update|delete|create|get|remove|put|find|upsert|insert|patch|replace|load|read|write)([A-Z0-9_]\w*)?$/;
const CRUD_WRITE = new Set(["save", "update", "delete", "create", "remove", "put", "upsert", "insert", "patch", "replace", "write"]);
// A call is a "write" when its callee name starts with a mutating verb (commitSiteToSourceControl,
// vault.put, fs.writeFile). `create` counts only as the exact name (createRouter is a factory) and
// bare `push` is excluded (array push); both would drown the list.
// Pilot judges (ABC #4, DE #3): the bare-verb rule flagged hash.update, String.replace, RegExp.exec,
// Map.delete, removeEventListener, setState and `deploymentRefusal` (prefix without a word break),
// and missed bridge.createSite, api.trashMedia, ledger settle and db.pragma('wal_checkpoint').
// Now: a METHOD call is a write only on a store-like receiver (any verb incl. create/set/import/
// cancel/trash/restore/settle/pragma); a BARE call needs a mutating verb followed by a noun
// (writeFile, commitSiteToSourceControl, importSiteArchive). Verbs must end at a word break.
const STORE_RECEIVER_RE = /(api|port|store|repo|repository|db|bridge|ledger|client|vault|fs|fsp|promises)$/i;
const RECEIVER_VERB_RE = /^(put|set|write|append|rm|rmdir|unlink|rename|mkdir|copy|cp|insert|upsert|update|delete|remove|save|commit|push|patch|replace|create|import|cancel|trash|restore|checkpoint|settle|run|exec|pragma|publish|deploy|upload|send|post|revoke|clear|drop|move|purge|archive)([A-Z0-9_]|$)/;
const BARE_VERB_RE = /^(write|append|unlink|rename|mkdir|insert|upsert|update|delete|remove|save|commit|push|patch|publish|deploy|upload|import|cancel|trash|restore|revoke|purge|archive|settle)[A-Z0-9_]/;
// Callees that read like verbs but never touch persisted state (DOM, React, collections, strings).
const NON_MUTATING = new Set(["update", "replace", "replaceAll", "exec", "test", "apply", "removeEventListener", "removeAllRanges",
  "setState", "removeChild", "removeAttribute", "removeProperty", "deleteProperty", "postMessage", "importKey", "exportKey", "updateDigest"]);
const recvName = (e) => { e = unwrap(e); if (!e) return null; if (ts.isCallExpression(e)) return recvName(e.expression); if (ts.isPropertyAccessExpression(e)) return e.name.text; if (ts.isIdentifier(e)) return e.text; if (e.kind === ts.SyntaxKind.ThisKeyword) return "this"; return null; };
// Round-2 judge 1 #3: `db.run(SELECT ...)` / `db.run(db.selectFrom(...))` read as writes. A store
// call that executes a statement is a write only when the statement (literal, local string const or
// builder chain) is not a pure read.
const SQL_EXEC_VERBS = new Set(["run", "exec", "execute", "query", "all", "get", "prepare"]);
const SQL_WRITE_RE = /\b(insertInto|updateTable|deleteFrom|replaceInto|INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|DROP|ALTER|VACUUM|wal_checkpoint)\b/;
const SQL_READ_RE = /\b(selectFrom|SELECT|WITH)\b|^\s*PRAGMA\s+\w+\s*;?\s*$/i;
/** -> "write" (persisted state changes), "bare" (a bare verb-noun call: a write only if the callee
 * itself writes, resolved one hop later), or null. `strOf` maps a local identifier to its string. */
function writeKind(call, strOf = () => null) {
  const callee = unwrap(call.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    const verb = callee.name.text; if (NON_MUTATING.has(verb)) return null;
    const recv = recvName(callee.expression);
    if (!recv || !STORE_RECEIVER_RE.test(recv) || !RECEIVER_VERB_RE.test(verb)) return null;
    if (SQL_EXEC_VERBS.has(verb) && call.arguments[0]) {
      const a0 = unwrap(call.arguments[0]);
      const sql = ts.isIdentifier(a0) ? (strOf(a0.text) ?? "") : a0.getText();
      if (sql && !SQL_WRITE_RE.test(sql) && SQL_READ_RE.test(sql)) return null;
    }
    return "write";
  }
  if (!ts.isIdentifier(callee) || NON_MUTATING.has(callee.text)) return null;
  // Bare fetch is a write only with a mutating method in its init object (judge 3 #6: `fetch@94` was a
  // HEAD probe; HEAD/OPTIONS/GET read). Same for a fetch-like injected `send(url, { method })`.
  if (callee.text === "fetch" || /^(send|request|fetchImpl|doFetch)$/.test(callee.text)) return call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => ts.isPropertyAssignment(p) && memberName(p) === "method" && ts.isStringLiteralLike(p.initializer) && /^(POST|PUT|PATCH|DELETE)$/i.test(p.initializer.text))) ? "write" : null;
  return BARE_VERB_RE.test(callee.text) ? "bare" : null;
}
// Writes through injected ports and callbacks (judge 3 #6: `deps.createSite`, `onSave`, a `grant`
// param were missed because the receiver is not store-named). A method on a deps/ports-like receiver,
// or a call to the function's own parameter, with a write verb.
const PORT_RECEIVER_RE = /^(deps|ports?|options|opts|services?|svc|host|bridge|routeDeps|sink|target|backend|adapter|driver|controller)$/i;
const PORT_VERB_RE = /^(create|remove|delete|save|grant|acknowledge|start|stop|revoke|publish|commit|persist|write|update|upsert|insert|put|trash|restore|cancel|apply|install|uninstall|enqueue|send|upload|mint|rotate|reset)([A-Z0-9_]|$)/;
const isWriteCall = (call, strOf) => !!writeKind(call, strOf);
const KEEP_GENERIC_TYPES = new Set(["Promise", "Readonly", "ReadonlyArray", "Array", "Record", "Partial", "Required", "Pick", "Omit",
  "Map", "ReadonlyMap", "Set", "ReadonlySet", "Date", "Error", "Uint8Array", "AbortSignal", "NonNullable", "Exclude", "Extract"]);
const NODE_BUILTINS = new Set(createRequire(import.meta.url)("node:module").builtinModules);

// ---------------------------------------------------------------------------------------------
// Inventory (rg --files). Tovu: apps/** + packages/**; development/** + content/** are parsed only
// as extra importers so exports used by scripts/plugins are not reported unused.
// ---------------------------------------------------------------------------------------------
const CODE_GLOB = "*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}";
const SKIP_DIRS = ["node_modules", "dist", "build", "coverage", ".next", "out", "release", ".turbo", ".vite"];
function rgFiles(cwd, roots, glob = CODE_GLOB) {
  const args = ["--files", "-g", glob, ...SKIP_DIRS.flatMap((d) => ["-g", `!**/${d}/**`]), ...roots];
  try { return execFileSync("rg", args, { cwd, encoding: "utf8", maxBuffer: 256 << 20 }).split("\n").filter(Boolean); }
  catch (error) { if (error.status === 1) return []; throw error; }
}
// Tests are recorded (counted per subject) but never labelled.
const TEST_RE = /(\.test\.|\.spec\.|__tests__\/|__mocks__\/|\/tests?\/|\/e2e\/|\/fixtures?\/|\/test-support\/|test-helpers?\.|__measurements__\/)/;
const isDts = (p) => /\.d\.[mc]?ts$/.test(p);

// Not product code: apps/website/src/sites/<site>/ is a local, git-excluded site folder that comes
// and goes while agents run (themes, vendored kUInetic up to 16k lines), and */vendor/* is third-party
// code we never extract. Counting them made the file total flap (3,355 vs 3,413) and added 16k-line batches.
const NOT_PRODUCT_RE = /(^apps\/website\/src\/sites\/|\/vendor\/)/;
const tovuMain = rgFiles(TOVU, ["apps", "packages"]).filter((p) => !isDts(p) && !NOT_PRODUCT_RE.test(p));
const tovuAux = rgFiles(TOVU, ["development", "content"]).filter((p) => !isDts(p) && !p.startsWith("development/coverage"));
const jiniAll = rgFiles(JINI, ["packages"]).filter((p) => /^packages\/[^/]+\/src\//.test(p) && !isDts(p));
const jiniFiles = jiniAll.filter((p) => !TEST_RE.test(p));
// Jini test helpers (memory fixtures, RecordingHttpClient under __tests__/) are twin TARGETS only:
// Tovu often carries its own copy of a Jini fixture (pilot ABC #3). Spec files themselves are not.
const jiniHelpers = jiniAll.filter((p) => TEST_RE.test(p) && !/\.(test|spec)\.[mc]?[jt]sx?$/.test(p));
const FIXTURE_RE = /(^|\/)(__tests__|__mocks__|testing|fixtures?|test-support)\//;

/** key = absolute path. role: main (labelled) | test | aux (importer only) | jini.
 * Jini `fixture` = under a testing/fixture dir (twin scope "tovu-jini-fixture", never Tier 2);
 * `helper` = matched TEST_RE (kept out of the export, literal and rule indexes). */
const files = new Map();
for (const rel of tovuMain) files.set(path.join(TOVU, rel), { rel, repo: "tovu", role: TEST_RE.test(rel) ? "test" : "main" });
for (const rel of tovuAux) files.set(path.join(TOVU, rel), { rel, repo: "tovu", role: "aux" });
for (const rel of jiniFiles) files.set(path.join(JINI, rel), { rel, repo: "jini", role: "jini", fixture: FIXTURE_RE.test(rel) });
for (const rel of jiniHelpers) files.set(path.join(JINI, rel), { rel, repo: "jini", role: "jini", fixture: true, helper: true });
const jiniPkgOfRel = (rel) => jiniPkgByDir.get(rel.split("/")[1]) ?? `@jini-ai/${rel.split("/")[1]}`;
/** "@jini-ai/cms/core" -> "@jini-ai/cms" (the package the import NAMES, not where the symbol lives). */
const specPkg = (spec) => (/^(@jini-ai\/[^/]+)/.exec(spec ?? "") ?? [])[1] ?? null;
const display = (abs) => { const f = files.get(abs); return f ? (f.repo === "jini" ? `jini:${f.rel}` : f.rel) : abs; };

// Jini package map: "@jini-ai/x" -> { dir, exports } for subpath resolution to src files.
const jiniPkgs = new Map(); const jiniPkgByDir = new Map();
for (const dir of fs.readdirSync(path.join(JINI, "packages"))) {
  const pj = path.join(JINI, "packages", dir, "package.json");
  if (!fs.existsSync(pj)) continue;
  const json = JSON.parse(fs.readFileSync(pj, "utf8"));
  if (json.name?.startsWith("@jini-ai/")) { jiniPkgs.set(json.name, { dir: path.join(JINI, "packages", dir), exports: json.exports ?? {},
    // v4 (judge 1 #6, judge 3 #11): declared @jini-ai deps, for CORE-CONTRACT-NEEDED from the package graph.
    deps: Object.keys({ ...json.dependencies, ...json.peerDependencies }).filter((d) => d.startsWith("@jini-ai/")) }); jiniPkgByDir.set(dir, json.name); }
}

// ---------------------------------------------------------------------------------------------
// Per-file extraction (one AST at a time; nothing but plain facts is kept).
// ---------------------------------------------------------------------------------------------
const STATEMENT_KINDS = new Set([ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.VariableStatement, ts.SyntaxKind.ReturnStatement,
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement, ts.SyntaxKind.SwitchStatement, ts.SyntaxKind.ThrowStatement,
  ts.SyntaxKind.TryStatement, ts.SyntaxKind.BreakStatement, ts.SyntaxKind.ContinueStatement]);
const SKIP_KINDS = new Set([ts.SyntaxKind.Identifier, ts.SyntaxKind.PrivateIdentifier, ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.RegularExpressionLiteral, ts.SyntaxKind.BigIntLiteral]);

const hasExport = (node) => !!ts.getModifiers?.(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const hasDefault = (node) => !!ts.getModifiers?.(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
const unwrap = (e) => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isNonNullExpression(e) || ts.isAwaitExpression(e) || ts.isTypeAssertionExpression?.(e))) e = e.expression; return e; };
const rootIdent = (e) => { e = unwrap(e); while (e && (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isCallExpression(e))) e = unwrap(e.expression); return e && ts.isIdentifier(e) ? e.text : null; };
const lastName = (e) => { e = unwrap(e); if (ts.isPropertyAccessExpression(e)) return e.name.text; if (ts.isIdentifier(e)) return e.text; return null; };
const typeRoot = (t) => { if (!t) return null; if (ts.isTypeReferenceNode(t)) { let n = t.typeName; while (ts.isQualifiedName(n)) n = n.left; return n.text; } return null; };
const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** FNV-style rolling hash of a window of node kinds. */
function shinglesOf(kinds) {
  const out = new Set();
  for (let i = 0; i + SHINGLE_K <= kinds.length; i++) {
    let h = 2166136261;
    for (let j = 0; j < SHINGLE_K; j++) h = Math.imul(h ^ kinds[i + j], 16777619);
    out.add(h >>> 0);
  }
  return Uint32Array.from(out).sort();
}
/** Body fingerprint: pre-order node-kind sequence with identifiers, literals and type annotations
 * stripped, so renamed or retyped copies still match (the CBM `fp` idea, recomputed locally). */
function bodyKinds(node) {
  const kinds = []; let statements = 0;
  const walk = (n) => {
    if (SKIP_KINDS.has(n.kind) || ts.isTypeNode(n)) return;
    if (STATEMENT_KINDS.has(n.kind)) statements++;
    kinds.push(n.kind); ts.forEachChild(n, walk);
  };
  walk(node);
  return { kinds, statements };
}

/** Normalised type text for shape hashing: member names and literal types kept, referenced type
 * names erased to R (except well-known generics), type parameters made positional, so a renamed
 * copy (CredentialProjectHalf<R> vs CredentialSetProjectScope<C>) hashes the same. */
function normType(node, tparams) {
  if (!node) return "?";
  if (ts.isTypeReferenceNode(node)) {
    const name = ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text;
    const args = node.typeArguments ? `<${node.typeArguments.map((a) => normType(a, tparams)).join(",")}>` : "";
    if (tparams.has(name)) return `P${tparams.get(name)}${args}`;
    return `${KEEP_GENERIC_TYPES.has(name) ? name : "R"}${args}`;
  }
  if (ts.isLiteralTypeNode(node)) return node.literal.getText();
  if (ts.isTypeLiteralNode(node)) return `{${membersOf(node.members, tparams).sort().join(";")}}`;
  if (ts.isUnionTypeNode(node)) return node.types.map((x) => normType(x, tparams)).sort().join("|");
  if (ts.isIntersectionTypeNode(node)) return node.types.map((x) => normType(x, tparams)).sort().join("&");
  if (ts.isArrayTypeNode(node)) return `${normType(node.elementType, tparams)}[]`;
  if (ts.isFunctionTypeNode(node)) return `(${node.parameters.map((p) => normType(p.type, tparams)).join(",")})=>${normType(node.type, tparams)}`;
  if (ts.isParenthesizedTypeNode(node)) return normType(node.type, tparams);
  if (ts.isTypeOperatorNode(node)) return `${ts.tokenToString(node.operator)} ${normType(node.type, tparams)}`;
  if (node.kind >= ts.SyntaxKind.FirstKeyword && node.kind <= ts.SyntaxKind.LastKeyword) return ts.tokenToString(node.kind) ?? String(node.kind);
  const parts = []; ts.forEachChild(node, (c) => { parts.push(normType(c, tparams)); });
  return `${ts.SyntaxKind[node.kind]}(${parts.join(",")})`;
}
function memberName(m) { return m.name ? (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : m.name.getText()) : ""; }
function membersOf(members, tparams) {
  return members.map((m) => {
    const q = m.questionToken ? "?" : "";
    if (ts.isPropertySignature(m)) return `${memberName(m)}${q}:${normType(m.type, tparams)}`;
    if (ts.isMethodSignature(m)) return `${memberName(m)}${q}(${m.parameters.map((p) => normType(p.type, tparams)).join(",")})=>${normType(m.type, tparams)}`;
    if (ts.isIndexSignatureDeclaration(m)) return `[${normType(m.parameters[0]?.type, tparams)}]:${normType(m.type, tparams)}`;
    return ts.SyntaxKind[m.kind];
  });
}
function shapeOf(decl) {
  const tparams = new Map((decl.typeParameters ?? []).map((p, i) => [p.name.text, i]));
  let members; let names;
  if (ts.isInterfaceDeclaration(decl)) { members = membersOf(decl.members, tparams); names = decl.members.map(memberName); }
  else if (ts.isTypeLiteralNode(decl.type)) { members = membersOf(decl.type.members, tparams); names = decl.type.members.map(memberName); }
  else if (ts.isUnionTypeNode(decl.type) && decl.type.types.every((x) => ts.isLiteralTypeNode(x))) {
    members = decl.type.types.map((x) => x.literal.getText()); names = members;
    // Literal unions need >=3 members; their literal values make them distinctive. Two-member
    // unions ("critical" | "optional", BootCriticality) twin by accident (pilot DE #6).
    return members.length >= 3 ? { strict: `U:${members.sort().join("|")}`, loose: null, size: members.length } : null;
  } else return null;
  // Object shapes: strict needs >=3 members, the names-only loose hash needs >=4.
  // `mem` (normalised members) feeds the same-name type verdict: exact / subset / diverged (round-2 judge 2 #2).
  if (members.length < 3) return members.length ? { strict: null, loose: null, size: members.length, mem: members.sort() } : null;
  return { strict: `O:${members.sort().join(";")}`, loose: names.length >= 4 ? `N:${[...names].sort().join(",")}` : null, size: members.length, mem: members };
}

// String literals that look like a persisted format/prefix ("secrets-vault:v1:", `plugin-state:${id}:x`).
// Persisted ids are lowercase ("Region:" is UI copy); og:/twitter: are HTML standards, not Jini's.
const FORMAT_RE = /^[a-z][\w.-]*:[\w.:${}-]*$/;
const NOT_FORMAT_RE = /^(https?|node|data|file|mailto|javascript|vbscript|blob|wss?|about|chrome|tel|og|twitter|article|fb|xmlns|xlink|urn):/i;
const isFormatLike = (s) => s.length >= 6 && FORMAT_RE.test(s) && !NOT_FORMAT_RE.test(s) && /[A-Za-z]{3}/.test(s);
const RESIDUE_RE = /tovu/i;
const vendorHit = (s) => s.toLowerCase().split(/[^a-z0-9]+/).find((tok) => VENDORS.includes(tok));

/** Where a literal sits: object key vs value (with key name), call arg (with callee), comparison... */
function literalContext(node) {
  const p = node.parent;
  if (!p) return "other";
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node) return "key";
  if (ts.isComputedPropertyName(p) || (ts.isElementAccessExpression(p) && p.argumentExpression === node)) return "key";
  if (ts.isPropertyAssignment(p)) return `value(${memberName(p)})`;
  if (ts.isLiteralTypeNode(p)) return "type";
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) return `arg(${short(p.expression.getText(), 40)})`;
  if (ts.isBinaryExpression(p)) return /=/.test(ts.tokenToString(p.operatorToken.kind) ?? "") ? "compare" : "expr";
  if (ts.isCaseClause(p)) return "case";
  if (ts.isVariableDeclaration(p)) return `init(${p.name.getText()})`;
  if (ts.isReturnStatement(p)) return "return";
  if (ts.isArrayLiteralExpression(p)) return "array";
  if (ts.isJsxAttribute(p)) return "jsx-attr";
  return ts.SyntaxKind[p.kind];
}
const isModuleSpecifier = (n) => {
  const p = n.parent;
  return p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p) && ts.isImportTypeNode(p.parent)
    || (ts.isCallExpression(p) && (p.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(p.expression) && p.expression.text === "require"))));
};
const templatePattern = (n) => ts.isTemplateExpression(n) ? n.head.text + n.templateSpans.map((s) => "${}" + s.literal.text).join("") : n.text;

// Path-like references in comments ("see features/x/store.ts").
const PATH_REF_RE = /(?:^|[\s`'"(\[])((?:[@#~\w.-]+\/)+[\w.-]+\.(?:ts|tsx|mts|mjs|js|cjs|json|md|sql))\b/g;
const LINE_REF_RE = /(?:^|[\s`'"(\[])((?:[@#~\w.-]+\/)*[\w.-]+\.(?:ts|tsx|mts|mjs|js|cjs)):(\d+)(?:-(\d+))?\b/g;

function parseFile(abs, info) {
  const text = fs.readFileSync(abs, "utf8");
  const ext = path.extname(abs);
  const kind = ext === ".tsx" ? ts.ScriptKind.TSX : ext === ".jsx" ? ts.ScriptKind.JSX : /\.[mc]?js$/.test(ext) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const full = info.role !== "aux" && info.role !== "test";   // tests/aux: imports only
  // split("\n") counts the empty string after a trailing newline: every file read +1 (pilot ABC #9).
  const f = { loc: text.split("\n").length - (text.endsWith("\n") ? 1 : 0), imports: [], bindings: new Map(), nsUses: new Map(), localExports: new Map(),
    reexports: new Map(), stars: [], localNames: new Set(), units: [], shapes: [], extendsInfo: [], literals: [], hostObjects: [],
    jiniLits: null, staleCandidates: [], ports: [], bug: null, reexportOnly: false, toolRegistration: false, dataOnly: false,
    beh: new Set(), constSets: [], constKinds: new Map(), couplingCands: [], expressType: false, approvalOrCtxSignal: false,
    // v3: top-level symbols with a direct store/fs/fetch write (one-hop resolution of bare verb calls),
    // bare verb-noun call candidates, Tovu wording pieces (Tovu<->Tovu parse couplings), wire keys.
    directWriteSyms: new Set(), bareWrites: [], tPhrases: new Map(), wireKeys: [], ensureCalls: new Set(), httpRoutes: false, constVals: [], selfUses: new Map(),
    // v4: path literals that load a file by path (vite lib entries, spawn/fork, new URL(..., import.meta.url));
    // property names read / destructured (member-level dead code); returned/exported object members;
    // thrown messages and `err.message ===` compares; permission literals; route-path literals; tools.
    pathLits: [], propNames: new Set(), objMembers: [], thrown: new Set(), errCompares: [], permLits: [], routeLits: new Set(), routeDefs: [],
    tools: [], toolFile: null, implementsNames: [], hermetic: false };

  // --- imports, bindings, exports ------------------------------------------------------------
  const addImport = (spec, line, kindTag, names, typeOnly, extra = {}) => f.imports.push({ spec, line, kind: kindTag, names, typeOnly, ...extra });
  let onlyReexports = sf.statements.length > 0;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text; const c = st.importClause; const names = [];
      const typeOnly = !!c?.isTypeOnly;
      if (c?.name) { names.push("default"); f.bindings.set(c.name.text, { spec, imported: "default" }); }
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) { names.push("*"); f.bindings.set(c.namedBindings.name.text, { spec, imported: "*" }); }
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) {
        const imported = (el.propertyName ?? el.name).text; names.push(imported); f.bindings.set(el.name.text, { spec, imported });
      }
      addImport(spec, lineOf(st.getStart()), "import", names, typeOnly);
      continue;
    }
    if (ts.isImportEqualsDeclaration(st) && ts.isExternalModuleReference(st.moduleReference) && ts.isStringLiteral(st.moduleReference.expression)) {
      const spec = st.moduleReference.expression.text; f.bindings.set(st.name.text, { spec, imported: "*" });
      addImport(spec, lineOf(st.getStart()), "import", ["*"], false); continue;
    }
    if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (spec) {
        const names = [];
        if (!st.exportClause) f.stars.push(spec);
        else if (ts.isNamespaceExport(st.exportClause)) { f.reexports.set(st.exportClause.name.text, { spec, imported: "*" }); names.push("*"); }
        else for (const el of st.exportClause.elements) { const imported = (el.propertyName ?? el.name).text; f.reexports.set(el.name.text, { spec, imported }); names.push(imported); }
        addImport(spec, lineOf(st.getStart()), "reexport", st.exportClause ? names : ["*"], st.isTypeOnly);
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text; const b = f.bindings.get(local);
          if (b) f.reexports.set(el.name.text, b); else { f.localExports.set(el.name.text, { kind: "alias", line: lineOf(el.getStart()) }); onlyReexports = false; }
        }
      }
      continue;
    }
    onlyReexports = false;
    if (ts.isExportAssignment(st)) { f.localExports.set("default", { kind: "default", line: lineOf(st.getStart()) }); continue; }
    collectTopLevel(st);
  }
  f.reexportOnly = onlyReexports && (f.reexports.size > 0 || f.stars.length > 0);
  // Tovu shim of Jini (round-2 judge 1 #10: reconcile-interrupted-migration.ts = `export * from
  // "@jini-ai/db/recovery"`): every re-export names a @jini-ai package. DELETE + repoint importers.
  f.jiniShim = f.reexportOnly && [...f.stars, ...[...f.reexports.values()].map((r) => r.spec)].every((sp) => sp.startsWith("@jini-ai/"));

  function declare(name, kindTag, node, exported) {
    f.localNames.add(name);
    if (exported) f.localExports.set(hasDefault(node) ? "default" : name, { kind: kindTag, line: lineOf(node.getStart()) });
  }
  function addUnit(name, kindTag, body, node, exported, extra = {}) {
    if (!full || !body) return;
    const { kinds, statements } = bodyKinds(body);
    // One-liners (openSqliteSnapshot, safeHref) are skipped by the fingerprint; keep their exact
    // text so an identical copy in Jini still shows up (pilot ABC #3).
    let smallText = null;
    if (statements < MIN_UNIT_STATEMENTS && kindTag !== "class" && !extra.closure) {
      const t = body.getText().replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
      if (t.length >= SMALL_EXACT_MIN_CHARS && t.length <= 600) smallText = t;
    }
    // register-only: every statement is `register*(...)` (route modules). A cycle edge from such a
    // body is wiring, not logic, so it must not lift the tier (pilot DE #5).
    const registerOnly = ts.isBlock(body) && body.statements.length > 0 && body.statements.every((s) => {
      const e = ts.isExpressionStatement(s) ? unwrap(s.expression) : null;
      return e && ts.isCallExpression(e) && /^register[A-Z]/.test(lastName(e.expression) ?? "");
    });
    // Identifier-agnostic key for small bodies (round-2 judge 1 #2: identityReposFrom x4,
    // createMemberAccessResolver x3 are one `return {...}` each, below the 5-statement floor).
    let kindsKey = null;
    if (statements < MIN_UNIT_STATEMENTS && kinds.length >= SMALL_KINDS_MIN && kindTag !== "class") { let h = 2166136261; for (const k of kinds) h = Math.imul(h ^ k, 16777619); kindsKey = `${kinds.length}:${h >>> 0}`; }
    // v4: full kind-sequence hash (same-file twin pass: readSiteAssistant <-> readAdminByok, judge 3 #3),
    // normalised text hash and behaviour tokens (name-independent Jini twins, judge 1 #2, judge 2 #3).
    // >= 20 kinds (part 2: readSiteAssistant/readAdminByok, two 2-statement bodies, fell under 30).
    let kindsAll = null; if (kindTag !== "class" && kinds.length >= 20) { let h = 2166136261; for (const k of kinds) h = Math.imul(h ^ k, 16777619); kindsAll = `${kinds.length}:${h >>> 0}`; }
    const norm = kindTag !== "class" ? normHash(body, node.parameters ?? node.initializer?.parameters ?? extra.params ?? []) : null;
    const ubeh = kindTag !== "class" && statements >= 2 ? unitBeh(body) : null;
    delete extra.params;
    f.units.push({ name, kind: kindTag, line: lineOf(node.getStart()), endLine: lineOf(node.getEnd()), statements, exported, shingles: shinglesOf(kinds), smallText, kindsKey, kindsAll, norm, ubeh, registerOnly, ...extra });
  }
  /** Normalised body text -> hash: identifiers DECLARED in the unit (params, locals) renamed $0..$n in
   * order of first use, string quotes unified, type nodes and comments dropped. A renamed copy hashes the
   * same; a body calling different names does not. -> "len:hash" or null when too short. */
  function normHash(body, params) {
    const txt = body.getText(); if (txt.length < NORM_MIN_CHARS || txt.length > 6000) return null;
    const declared = new Set();
    const addName = (nm) => { if (!nm) return; if (ts.isIdentifier(nm)) declared.add(nm.text); else if (ts.isObjectBindingPattern(nm) || ts.isArrayBindingPattern(nm)) nm.elements.forEach((el) => el.name && addName(el.name)); };
    for (const p of params) addName(p.name);
    const w = (n) => { if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) addName(n.name); else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) declared.add(n.name.text); ts.forEachChild(n, w); };
    w(body);
    const ids = new Map(); const out = [];
    const emit = (n) => {
      if (ts.isTypeNode(n) && n.kind !== ts.SyntaxKind.ThisType) return;
      if (ts.isIdentifier(n)) {
        const p = n.parent; const isMember = p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n));
        if (declared.has(n.text) && !isMember) { if (!ids.has(n.text)) ids.set(n.text, `$${ids.size}`); out.push(ids.get(n.text)); } else out.push(n.text);
        return;
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { out.push(JSON.stringify(n.text)); return; }
      const kids = n.getChildren(sf);
      if (!kids.length) { out.push(n.getText(sf)); return; }
      kids.forEach(emit);
    };
    emit(body);
    let h = 2166136261; const s = out.join(" "); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return `${out.length}:${h >>> 0}`;
  }
  /** Behaviour tokens of one unit: strings (3-60 chars), callee names, property names. Filtered by
   * document frequency after the parse (common vocabulary says nothing). */
  function unitBeh(body) {
    const toks = new Set();
    const w = (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.length >= 3 && n.text.length <= 60) toks.add(`s:${n.text}`);
      else if (ts.isCallExpression(n)) { const c = lastName(n.expression); if (c) toks.add(`c:${c}`); }
      else if (ts.isPropertyAccessExpression(n)) toks.add(`p:${n.name.text}`);
      ts.forEachChild(n, w);
    };
    w(body);
    return toks.size >= UNIT_BEH_MIN_SHARED ? [...toks] : null;
  }
  /** A body that is one call (`return jiniFn(...)` or `=> jiniFn(...)`): R2 pass-through candidate.
   * Also returns what the call is FED: literals, identifiers (resolved later: npm values?) and
   * host-copy objects. R3 ALL-PASS-THROUGH is wrong for driver binders that inject npm modules or
   * product literals (pilot ABC #6): those stay in Tovu as wiring. */
  function singleCall(body, params = []) {
    let e = null;
    if (!body) return null;
    if (!ts.isBlock(body)) e = body;
    else if (body.statements.length === 1) { const s = body.statements[0]; e = ts.isReturnStatement(s) ? s.expression : ts.isExpressionStatement(s) ? s.expression : null; }
    e = unwrap(e);
    if (!e || !(ts.isCallExpression(e) || ts.isNewExpression(e))) return null;
    // Round-2 judge 1 #9, judge 2 #3: builders (buildDeployOpsRegistrations, buildSettingsRegistrations)
    // read as pass-throughs because their one call is into Jini. A pass-through FORWARDS: every argument
    // is a parameter, `...param` or `param.x` - no literals, no extra object properties, no closures.
    const pnames = new Set(params.flatMap((p) => ts.isIdentifier(p.name) ? [p.name.text] : ts.isObjectBindingPattern(p.name) ? p.name.elements.map((el) => el.name.getText()) : []));
    const fwd = (a) => { a = unwrap(a); if (ts.isSpreadElement(a) || ts.isSpreadAssignment?.(a)) a = unwrap(a.expression);
      // `{ deps }` / `{ ...opts, deps: d }` re-packs parameters: still forwarding (no new values).
      if (ts.isObjectLiteralExpression(a)) return a.properties.every((p) => ts.isShorthandPropertyAssignment(p) ? pnames.has(p.name.text) : ts.isSpreadAssignment(p) ? fwd(p.expression) : ts.isPropertyAssignment(p) && fwd(p.initializer));
      const r = ts.isIdentifier(a) ? a.text : ts.isPropertyAccessExpression(a) ? rootIdent(a) : null; return !!r && pnames.has(r); };
    const forwardsOnly = (e.arguments ?? []).every(fwd);
    const args = { lit: false, idents: [], hostMsg: false, forwardsOnly };
    const scan = (a, depth) => {
      a = unwrap(a); if (!a) return;
      if (ts.isStringLiteralLike(a) || ts.isTemplateExpression(a) || ts.isNumericLiteral(a)) args.lit = true;
      else if (ts.isIdentifier(a)) { args.idents.push(a.text); if (/messages|copy|strings|i18n|labels|wording/i.test(a.text)) args.hostMsg = true; }
      else if (ts.isPropertyAccessExpression(a)) { const r = rootIdent(a); if (r) args.idents.push(r); if (/messages|copy|strings|i18n|labels|wording/i.test(a.name.text)) args.hostMsg = true; }
      else if (depth < 2 && ts.isObjectLiteralExpression(a)) for (const p of a.properties) { if (ts.isPropertyAssignment(p)) scan(p.initializer, depth + 1); else if (ts.isShorthandPropertyAssignment(p)) scan(p.name, depth + 1); }
      else if (depth < 2 && ts.isArrayLiteralExpression(a)) a.elements.forEach((x) => scan(x, depth + 1));
    };
    for (const a of e.arguments ?? []) scan(a, 0);
    return { root: rootIdent(e.expression), args };
  }
  /** Exported const arrays / string sets (`["a","b","c"] as const`, `new Set([...])`): duplicated
   * enums are invisible to the body fingerprint (pilot ABC #3, consent enums). */
  function constSetOf(init) {
    let a = unwrap(init);
    // Regex alternations are sets too (round-2 judge 2 #8: LOCAL_HOSTS array <-> a /^(localhost|127.0.0.1|::1)$/ in
    // platform/net): `(a|b|c)` of plain tokens, >= 3, keyed like an array of the same strings.
    if (a && ts.isRegularExpressionLiteral(a)) {
      const m = /\(\??:?([\w.:\\-]+(?:\|[\w.:\\-]+){2,})\)/.exec(a.text);
      return m ? [...new Set(m[1].split("|").map((x) => x.replace(/\\(.)/g, "$1")))].sort().join("\u0001") : null;
    }
    if (a && (ts.isNewExpression(a) || ts.isCallExpression(a)) && a.arguments?.[0]) a = unwrap(a.arguments[0]);
    if (!a || !ts.isArrayLiteralExpression(a) || a.elements.length < 3 || !a.elements.every((x) => ts.isStringLiteralLike(x))) return null;
    return [...new Set(a.elements.map((x) => x.text))].sort().join("\u0001");
  }
  function constKindOf(init) { const i = unwrap(init); if (!i) return "other";
    if (ts.isStringLiteralLike(i) || ts.isNumericLiteral(i) || ts.isTemplateExpression(i) || i.kind === ts.SyntaxKind.TrueKeyword || i.kind === ts.SyntaxKind.FalseKeyword) return "literal";
    if (ts.isArrayLiteralExpression(i)) return "array";
    if (ts.isObjectLiteralExpression(i)) return "object";
    if (ts.isBinaryExpression(i) && /^[\d_\s*+\-/().]+$/.test(i.getText())) return "literal";
    if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) return "fn"; return "other"; }
  /** Members of the object a function returns (hooks/controllers: `return { items, replace, setDraftToken }`)
   * or of an exported object literal (`export const api = { setSitesHome: ... }`), judge 3 #4. */
  function objMemberNames(o) { return o.properties.filter((p) => p.name && !ts.isSpreadAssignment(p)).map(memberName).filter((n) => n.length >= 3); }
  function returnedObject(body) {
    if (!body) return null;
    if (!ts.isBlock(body)) { const e = unwrap(body); return e && ts.isObjectLiteralExpression(e) ? e : null; }
    const last = [...body.statements].reverse().find((x) => ts.isReturnStatement(x));
    const e = last?.expression ? unwrap(last.expression) : null;
    if (e && ts.isObjectLiteralExpression(e)) return e;
    // `return useMemo(() => ({ ... }), deps)`
    if (e && ts.isCallExpression(e) && /^(useMemo|useCallback)$/.test(lastName(e.expression) ?? "")) { const cb = unwrap(e.arguments[0]); if (cb && ts.isArrowFunction(cb)) return returnedObject(cb.body); }
    return null;
  }
  function collectTopLevel(st) {
    const exported = hasExport(st);
    if (full && exported && info.repo === "tovu") {
      if (ts.isFunctionDeclaration(st) && st.name) { const o = returnedObject(st.body); if (o) f.objMembers.push({ sym: st.name.text, line: lineOf(st.getStart()), members: objMemberNames(o), kind: "returns" }); }
      else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
        const i = unwrap(d.initializer); if (!i || !ts.isIdentifier(d.name)) continue;
        const o = ts.isObjectLiteralExpression(i) ? i : (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) ? returnedObject(i.body) : null;
        if (o) f.objMembers.push({ sym: d.name.text, line: lineOf(st.getStart()), members: objMemberNames(o), kind: ts.isObjectLiteralExpression(i) ? "object" : "returns" });
      }
    }
    if (ts.isFunctionDeclaration(st)) {
      const name = st.name?.text ?? "default"; declare(name, "function", st, exported);
      const sc = singleCall(st.body, st.parameters);
      addUnit(name, "fn", st.body, st, exported, { callRoot: sc?.root ?? null, callArgs: sc?.args });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) { d.name.elements?.forEach((el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && declare(el.name.text, "const", st, exported)); continue; }
        const init = unwrap(d.initializer);
        const isFn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        declare(d.name.text, isFn ? "function" : "const", st, exported);
        f.constKinds.set(d.name.text, constKindOf(init));
        if (full || info.repo === "jini") { const key = constSetOf(init); if (key) f.constSets.push({ name: d.name.text, line: lineOf(st.getStart()), exported, key, size: key.split("\u0001").length }); }
        // Constant VALUES (round-2 judge 1 #2, judge 3 #2): `50 * 1024 * 1024`, `FETCH_TIMEOUT_MS`, frozen
        // option objects. Numbers lose `_` separators; objects/strings are whitespace-stripped text.
        if (full && init) {
          const ck = f.constKinds.get(d.name.text); let inner = init;
          if (ts.isCallExpression(inner) && /^Object\.freeze$/.test(inner.expression.getText()) && inner.arguments[0]) inner = unwrap(inner.arguments[0]);
          // v4 (judge 1 #4): quotes and escapes normalised (`'askChoiceAnswerTicket'` == `"askChoiceAnswerTicket"`
          // scored sim 0); strings compare by their parsed text; regex literals are values too (SITE_NAME_PATTERN).
          const lit = unwrap(init);
          const val = lit && ts.isStringLiteralLike(lit) ? JSON.stringify(lit.text) : lit && ts.isRegularExpressionLiteral(lit) ? lit.text
            : ck === "literal" ? init.getText().replace(/_/g, "").replace(/\s+/g, "").replace(/'([^'"\\]*)'/g, '"$1"') : ts.isObjectLiteralExpression(inner) ? inner.getText().replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "").replace(/'([^'"\\]*)'/g, '"$1"') : null;
          if (val && val.length <= 400) f.constVals.push({ name: d.name.text, line: lineOf(st.getStart()), exported, val, obj: ts.isObjectLiteralExpression(inner), re: !!lit && ts.isRegularExpressionLiteral(lit), str: !!lit && ts.isStringLiteralLike(lit) });
        }
        if (isFn) { const sc = singleCall(init.body, init.parameters); addUnit(d.name.text, "fn", init.body, st, exported, { callRoot: sc?.root ?? null, callArgs: sc?.args, params: init.parameters }); }
        else if (init && ts.isIdentifier(init)) f.units.push({ name: d.name.text, kind: "alias", line: lineOf(st.getStart()), statements: 0, exported, shingles: new Uint32Array(), callRoot: init.text });
      }
    } else if (ts.isClassDeclaration(st)) {
      const name = st.name?.text ?? "default"; declare(name, "class", st, exported);
      const ext = st.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
      // v4 (judge 2 #1): a constructor-only subclass (`constructor(x) { super(f(x)) }`, no other member) is a
      // TINY-EXTENDS-ADAPTER; one that overrides ANY method (replaceWorkspace under a lock) never is.
      const ctorOnly = st.members.length > 0 && st.members.every((m) => ts.isConstructorDeclaration(m) && !!m.body && m.body.statements.length === 1
        && ts.isExpressionStatement(m.body.statements[0]) && ts.isCallExpression(unwrap(m.body.statements[0].expression)) && unwrap(m.body.statements[0].expression).expression.kind === ts.SyntaxKind.SuperKeyword
        && !(m.parameters ?? []).some((p) => ts.getModifiers?.(p)?.length));
      const overrides = st.members.filter((m) => !ts.isConstructorDeclaration(m) && m.name).map(memberName);
      if (ext) f.extendsInfo.push({ name, base: rootIdent(ext.expression), members: st.members.length, line: lineOf(st.getStart()), ctorOnly, overrides });
      // `implements` names (judge 2 #5: Sql* <-> InMemory* class-api twins implementing the same port).
      const impl = st.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword)?.types ?? [];
      for (const t of impl) { const r = rootIdent(t.expression); if (r) f.implementsNames.push({ cls: name, iface: r }); }
      // Class API fingerprint (pilot ABC #3: keyring.memory / CredentialSetVaultRepo restructured,
      // body sim .04): public method names + the set of callee names used anywhere in the class.
      const isPublic = (m) => !ts.getModifiers?.(m)?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword) && !(m.name && ts.isPrivateIdentifier(m.name)) && !/^_/.test(m.name ? memberName(m) : "_");
      const calls = new Set(); const walkCalls = (n) => { if (ts.isCallExpression(n)) { const c = lastName(n.expression); if (c) calls.add(c); } ts.forEachChild(n, walkCalls); }; walkCalls(st);
      addUnit(name, "class", st, st, exported, { methods: st.members.filter((m) => m.name && (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m) || ts.isGetAccessor(m))).map(memberName),
        publicMethods: st.members.filter((m) => m.name && (ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && isPublic(m)).map(memberName), calls: [...calls], implements: impl.map((t) => rootIdent(t.expression)).filter(Boolean) });
      for (const m of st.members) if ((ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m) || ts.isGetAccessor(m)) && m.body) addUnit(`${name}.${m.name ? memberName(m) : "constructor"}`, "method", m.body, m, exported);
    } else if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      declare(st.name.text, ts.isInterfaceDeclaration(st) ? "interface" : "type", st, exported);
      const ext = ts.isInterfaceDeclaration(st) ? st.heritageClauses?.[0]?.types[0] : null;
      if (ext) f.extendsInfo.push({ name: st.name.text, base: rootIdent(ext.expression), members: st.members.length, line: lineOf(st.getStart()), iface: true });
      if (full) { const shape = shapeOf(st); if (shape) f.shapes.push({ name: st.name.text, line: lineOf(st.getStart()), exported, ...shape }); }
    } else if (ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st)) {
      if (st.name && ts.isIdentifier(st.name)) declare(st.name.text, "enum", st, exported);
    }
  }

  // --- whole-tree walk: inline import(), require, ns uses, literals, ports, bug hints ------------
  const jiniLits = info.repo === "jini" && !info.helper ? { all: new Set(), formats: [], phrases: new Set() } : null;
  const bug = { crud: [], signalParams: [], abortChecks: [], forwards: [], writes: [], awaitGaps: [], listenerGaps: [], swallows: [], wholePut: [],
    secretLogs: [], cachedPromise: [], ctxNoSignal: [], filterAfterPage: [] };
  const tovuFull = full && info.repo === "tovu";
  const unitBodies = new Set(); for (const st of sf.statements) { /* bodies already fingerprinted as top-level units */
    if (ts.isFunctionDeclaration(st) && st.body) unitBodies.add(st.body);
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { const i = unwrap(d.initializer); if (i && (ts.isArrowFunction(i) || ts.isFunctionExpression(i))) unitBodies.add(i.body); }
    else if (ts.isClassDeclaration(st)) for (const m of st.members) if (m.body) unitBodies.add(m.body);
  }
  // `await import(x)` / `await import(x).then(...)`; `lazy(() => import(x))` is code splitting, not this.
  const awaitedCall = (cur) => { let p = cur.parent;
    while (p && (ts.isParenthesizedExpression(p) || (ts.isPropertyAccessExpression(p) && p.expression === cur) || (ts.isCallExpression(p) && p.expression === cur))) { cur = p; p = p.parent; }
    return !!p && ts.isAwaitExpression(p); };
  /** Names a dynamic import actually uses: `import(x).then(m => m.X)`, `.then(({ X }) => …)`,
   * `(await import(x)).X`, `const { X } = await import(x)`, `const m = await import(x); m.X`.
   * Without this the edge stayed on the barrel: Media.tsx showed 0 prod importers although
   * panel-pages.ts:61 does `import("./features/media").then(m => m.Media)` (pilot DE #2). */
  function dynamicNames(call) {
    let p = call.parent; while (p && (ts.isAwaitExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isObjectBindingPattern(p.name)) return { names: p.name.elements.map((el) => (el.propertyName ?? el.name).getText()) };
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return { names: ["*"], local: p.name.text };
    if (p && ts.isPropertyAccessExpression(p) && p.name.text !== "then") return { names: [p.name.text] };
    if (p && ts.isPropertyAccessExpression(p) && ts.isCallExpression(p.parent)) {
      const cb = unwrap(p.parent.arguments[0]);
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && cb.parameters[0]) {
        const pn = cb.parameters[0].name;
        if (ts.isObjectBindingPattern(pn)) return { names: pn.elements.map((el) => (el.propertyName ?? el.name).getText()) };
        if (ts.isIdentifier(pn)) {
          const used = new Set(); const w = (n) => { if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === pn.text) used.add(n.name.text); ts.forEachChild(n, w); };
          w(cb.body); if (used.size) return { names: [...used] };
        }
      }
    }
    return { names: ["*"] };
  }
  /** Per-handler timing (pilot ABC #5, DE #3). A `signal` variable name is no evidence; ORDER is:
   * bugs ABC #7-#10 were "abort checked, then awaits, then a write with no recheck"; DE 2/8/23 were
   * "an await before the close/abort listener is attached" (a client leaving during it is never
   * seen). One function body in source order; nested functions are their own handlers. An await
   * counts only if it ENDS before the write/listener starts (`await store.put()` is no gap). */
  function timing(fn, name) {
    const ev = { awaits: [], checks: [], writes: [], listeners: [], paged: [], filters: [] };
    const walk = (n) => {
      if (n !== fn.body && ts.isFunctionLike(n)) return;
      if (ts.isAwaitExpression(n)) {
        ev.awaits.push(n);
        // A paged read (`await repo.list({ limit, offset })`) followed by `.filter(` returns short pages
        // (round-2 judge 1 #11, trash/list: post-paging filter).
        const c = unwrap(n.expression);
        if (c && ts.isCallExpression(c) && c.arguments.some((a) => /\b(limit|offset|pageSize|perPage|cursor)\b/.test(a.getText()))) ev.paged.push(n);
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "filter") ev.filters.push(n);
      if (ts.isPropertyAccessExpression(n) && n.name.text === "aborted") ev.checks.push(n);
      if (ts.isCallExpression(n)) {
        const c = lastName(n.expression); const a0 = n.arguments[0];
        if (c === "throwIfAborted") ev.checks.push(n);
        if (writeKind(n, (id) => localStr.get(id)) === "write" || portWrite(n)) ev.writes.push(n);
        if ((c === "on" || c === "once" || c === "addListener") && a0 && ts.isStringLiteralLike(a0) && /^(close|aborted|abort)$/.test(a0.text)) ev.listeners.push(n);
        if (c === "addEventListener" && a0 && ts.isStringLiteralLike(a0) && a0.text === "abort") ev.listeners.push(n);
      }
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "AbortController") ev.listeners.push(n);
      ts.forEachChild(n, walk);
    };
    walk(fn.body);
    const at = (n) => lineOf(n.getStart()); const first = (l) => l.reduce((a, b) => (a.getStart() <= b.getStart() ? a : b));
    if (ev.writes.length && ev.checks.length) {
      const w = first(ev.writes); const before = ev.checks.filter((c) => c.getStart() < w.getStart());
      if (before.length) {
        const c = before.reduce((a, b) => (a.getStart() >= b.getStart() ? a : b));
        const gap = ev.awaits.filter((x) => x.getStart() > c.end && x.end <= w.getStart());
        if (gap.length) bug.awaitGaps.push(`${name}@${at(fn)}: ${gap.length} await(s) @${gap.slice(0, 3).map(at).join(",")} after abort check @${at(c)} before write @${at(w)}`);
      }
    }
    if (ev.paged.length && ev.filters.length) {
      const pg = first(ev.paged); const fl = ev.filters.find((x) => x.getStart() > pg.end);
      if (fl) bug.filterAfterPage.push(`${name}@${at(fn)}: .filter @${at(fl)} after paged read @${at(pg)}`);
    }
    // A handler handed `ctx` that awaits and writes but never reads a signal drops cancellation
    // (round-2 judge 1 #11: publish-content handlers).
    if ((fn.parameters ?? []).some((p) => ts.isIdentifier(p.name) && /^(ctx|context|toolCtx)$/.test(p.name.text)) && ev.writes.length && ev.awaits.length && !/\bsignal\b/.test(fn.body.getText())) bug.ctxNoSignal.push(`${name}@${at(fn)}`);
    // Whole-map replace that tombstones by omission (judge 2 #11): ids NOT in the submitted set are
    // deleted/tombstoned, so a stale client (or a concurrent writer) erases entries it never saw.
    if (ts.isBlock(fn.body)) { const bt = fn.body.getText();
      if (/!\s*[\w.]+\.(has|includes)\(/.test(bt) && /\b(delete|remove|tombstone|trash)\w*\s*\(|deletedAt\s*[:=]|\btombstone/i.test(bt) && /\bfor\s*\(|\.(forEach|filter|map)\(/.test(bt))
        bug.wholePut.push(`${name}@${at(fn)}: tombstones ids not in the submitted set`); }
    if (ev.listeners.length && ev.awaits.length) {
      const l = first(ev.listeners); const pre = ev.awaits.filter((x) => x.end <= l.getStart());
      if (pre.length) bug.listenerGaps.push(`${name}@${at(fn)}: await @${at(first(pre))} before close/abort listener @${at(l)}`);
    }
  }
  /** Write through an injected port or a callback parameter (see PORT_RECEIVER_RE). */
  function portWrite(call) {
    const c = unwrap(call.expression);
    if (ts.isPropertyAccessExpression(c)) { const r = recvName(c.expression); return !!r && PORT_RECEIVER_RE.test(r) && PORT_VERB_RE.test(c.name.text); }
    if (!ts.isIdentifier(c) || !PORT_VERB_RE.test(c.text)) return false;
    const fn = ts.findAncestor(call.parent, ts.isFunctionLike);
    const params = new Set((fn?.parameters ?? []).flatMap((p) => ts.isIdentifier(p.name) ? [p.name.text] : ts.isObjectBindingPattern(p.name) ? p.name.elements.map((el) => el.name.getText()) : []));
    return params.has(c.text);
  }
  const PHRASE_CALLEES = new Set(["startsWith", "endsWith", "includes", "indexOf", "lastIndexOf", "match", "split", "search", "replace"]);
  const EVENT_CALLEES = new Set(["addEventListener", "removeEventListener", "on", "once", "off", "emit", "addListener"]);
  const localStr = new Map(); // string consts seen so far in this file (name -> text)
  const coupled = new Set();
  const coupling = (kind, text, n, extra = {}) => { const line = lineOf(n.getStart()); const k = `${kind}\0${text}\0${line}`; if (coupled.has(k)) return; coupled.add(k); f.couplingCands.push({ kind, text, line, symbol: topSymbol(n), ...extra }); };
  const topSymbol = (n) => { while (n.parent && n.parent !== sf) n = n.parent; const d = n; return d.name?.text ?? (ts.isVariableStatement(d) ? d.declarationList.declarations[0]?.name.getText() : null); };
  const topExported = (n) => { while (n.parent && n.parent !== sf) n = n.parent; return hasExport(n); };
  const fnName = (fn) => fn.name ? fn.name.getText() : ts.isVariableDeclaration(fn.parent) || ts.isPropertyAssignment(fn.parent) ? fn.parent.name.getText() : "(anon)";
  let fnCount = 0;
  const visit = (n) => {
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      let q = n.qualifier; while (q && ts.isQualifiedName(q)) q = q.left;
      addImport(n.argument.literal.text, lineOf(n.getStart()), "importType", [q ? q.text : "*"], true);
    } else if (ts.isCallExpression(n) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) {
      const dyn = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const dn = dyn ? dynamicNames(n) : (() => { let p = n.parent; while (p && ts.isParenthesizedExpression(p)) p = p.parent;
        return { names: p && ts.isVariableDeclaration(p) && ts.isObjectBindingPattern(p.name) ? p.name.elements.map((el) => (el.propertyName ?? el.name).getText()) : ["*"] }; })();
      // `const m = await import(x)`: treat m as a namespace binding so `m.X` uses resolve the names.
      if (dn.local && !f.bindings.has(dn.local)) f.bindings.set(dn.local, { spec: n.arguments[0].text, imported: "*" });
      addImport(n.arguments[0].text, lineOf(n.getStart()), dyn ? "dynamic" : "require", dn.names, false, dyn ? { awaited: awaitedCall(n) } : {});
    } else if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && f.bindings.get(n.expression.text)?.imported === "*") {
      const set = f.nsUses.get(n.expression.text) ?? new Set(); set.add(n.name.text); f.nsUses.set(n.expression.text, set);
    }
    // Same-file uses of an export (round-2 judge 2 #7: importWorkerLaunch is used at :66, so it is not
    // test-only even with no prod importer).
    if (full && ts.isIdentifier(n) && f.localExports.has(n.text) && !(n.parent && n.parent.name === n) && !ts.isExportSpecifier(n.parent)) f.selfUses.set(n.text, (f.selfUses.get(n.text) ?? 0) + 1);
    if (full) {
      // Behaviour fingerprint tokens (LEGACY-TWIN pre-pass): what a module SAYS (string literals, route
      // strings), CALLS and TOUCHES (property names). Restructured siblings keep these when their
      // bodies and names differ (pilot DE #1: media 0.07/0.11 by body). Private closures included.
      // HTTP route registration, Tovu and Jini: `app.get("/x", ...)` or `{ path: "/api/..." }` (the
      // LEGACY-TWIN route gate, see the legacy pre-pass).
      if (ts.isCallExpression(n) && /^(get|post|put|patch|delete|all|route|use)$/.test(lastName(n.expression) ?? "") && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text.startsWith("/")) f.httpRoutes = true;
      else if (ts.isPropertyAssignment(n) && /^(path|route|pattern)$/.test(memberName(n)) && ts.isStringLiteralLike(n.initializer) && /^\/api\//.test(n.initializer.text)) f.httpRoutes = true;
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !isModuleSpecifier(n) && n.text.length >= 3 && n.text.length <= 60) f.beh.add(`s:${n.text}`);
      else if (ts.isCallExpression(n)) { const c = lastName(n.expression); if (c) f.beh.add(`c:${c}`); }
      else if (ts.isPropertyAccessExpression(n)) f.beh.add(`p:${n.name.text}`);
      else if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n) || ts.isMethodDeclaration(n)) && n.name && ts.isIdentifier(n.name)) f.beh.add(`p:${n.name.text}`);
    }
    if (full || jiniLits) {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && !isModuleSpecifier(n)) {
        const pattern = templatePattern(n);
        if (jiniLits) {
          if (!/\s/.test(pattern) && pattern.length >= 2 && pattern.length <= 80) {
            jiniLits.all.add(pattern);
            if (ts.isTemplateExpression(n)) for (const piece of pattern.split("${}")) if (piece) jiniLits.all.add(piece);
            for (const seg of pattern.split(/:|\$\{\}/)) if (seg) jiniLits.all.add(seg);
            if (pattern.includes(":") && /[A-Za-z]{3}/.test(pattern)) jiniLits.formats.push({ pattern, line: lineOf(n.getStart()), symbol: topSymbol(n), exported: topExported(n) });
          }
          // Wording Tovu may compare or parse ("failed to start daemon: ", pilot DE #4): >= 12 chars,
          // whitespace allowed; each static piece of a template separately.
          for (const piece of pattern.split("${}")) { const t = piece.trim(); if (t.length >= 12 && t.length <= 200) jiniLits.phrases.add(piece.length <= 200 ? piece : t); }
        } else if (info.repo === "tovu") {
          // Tovu wording too (round-2 judge 3 #1, judge 1 #4): the parser of a Tovu line is often another
          // Tovu app (desktop's /^tovu serve: bootToken=/ reads serve.ts's console line).
          if (tovuFull) for (const piece of pattern.split("${}")) { const t = piece.trim(); if (t.length >= 12 && t.length <= 200 && !f.tPhrases.has(piece)) f.tPhrases.set(piece, pattern); }
          const residue = RESIDUE_RE.test(pattern) ? "tovu" : vendorHit(pattern);
          const format = isFormatLike(pattern);
          if (residue || format) f.literals.push({ text: short(pattern, 80), line: lineOf(n.getStart()), ctx: literalContext(n), symbol: topSymbol(n), residue: residue ?? null, format });
          // Template/script contents (RELEASE_PROBE holds 'jini:release-check', /admin, .admin-content,
          // pilot DE #4): pull quoted strings, selectors/paths and colon ids out of long strings.
          if (pattern.length > 40 || /\n/.test(pattern)) {
            for (const m of pattern.matchAll(/['"]([^'"\s]{4,80})['"]/g)) coupling("template", m[1], n);
            for (const m of pattern.matchAll(/(?:^|[\s(,='"`])([./#][A-Za-z_][\w./-]{3,60})/g)) coupling("template", m[1], n);
            for (const m of pattern.matchAll(/\b([a-z][\w-]*:[a-z][\w:-]{2,60})\b/g)) coupling("template", m[1], n);
          }
        }
      }
    }
    if (tovuFull) {
      // Format couplings beyond `x:y` ids (pilot DE #4): path.join literals, event names and
      // operands Tovu compares/parses against (matched to Jini strings after the parse).
      if (ts.isCallExpression(n)) {
        const callee = lastName(n.expression); const ctext = n.expression.getText();
        const pathCall = /^(path\.(posix\.)?)?(join|resolve)$/.test(ctext) && (ctext.startsWith("path.") || /^(node:)?path$/.test(f.bindings.get(ctext)?.spec ?? ""));
        if (pathCall) for (const a of n.arguments) if (ts.isStringLiteralLike(a) && a.text.length >= 5 && (/\//.test(a.text) || /\.\w{2,4}$/.test(a.text))) coupling("path", a.text, a);
        const a0 = n.arguments[0];
        if (callee && EVENT_CALLEES.has(callee) && a0 && ts.isStringLiteralLike(a0)) coupling("event", a0.text, a0);
        // `const prefix = "failed to start daemon: "; reason.startsWith(prefix)` (pilot DE #4): follow
        // an identifier operand to a string const declared earlier in this file.
        const opText = a0 && (ts.isStringLiteralLike(a0) ? a0.text : ts.isIdentifier(a0) ? localStr.get(a0.text) : null);
        if (callee && PHRASE_CALLEES.has(callee) && opText && opText.trim().length >= 12) coupling("phrase", opText, a0);
      }
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && /^(Custom)?Event$/.test(n.expression.text) && n.arguments?.[0] && ts.isStringLiteralLike(n.arguments[0])) coupling("event", n.arguments[0].text, n);
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isStringLiteralLike(n.initializer)) localStr.set(n.name.text, n.initializer.text);
      if (ts.isBinaryExpression(n) && /^[!=]==?$/.test(ts.tokenToString(n.operatorToken.kind) ?? "")) for (const s of [n.left, n.right]) if (ts.isStringLiteralLike(s) && s.text.trim().length >= 12) coupling("phrase", s.text, s);
      if (ts.isCaseClause(n) && ts.isStringLiteralLike(n.expression) && n.expression.text.trim().length >= 12) coupling("phrase", n.expression.text, n);
      if (ts.isRegularExpressionLiteral(n)) {
        const src = n.text.slice(1, n.text.lastIndexOf("/")).replace(/\\([.\/\-:()[\]{}?*+^$|\\])/g, "$1");
        // v4 (judge 2 #8): keep the regex itself so a match is TESTED against the emitted literal.
        const re = { src: n.text.slice(1, n.text.lastIndexOf("/")), flags: n.text.slice(n.text.lastIndexOf("/") + 1) };
        for (const run of src.split(/\\[a-zA-Z]|[\^$*+?()[\]{}|]/)) if (run.trim().length >= 12) coupling("regex", run, n, { re });
      }
      if (ts.isCatchClause(n)) {
        // Swallow arms (pilot ABC #4, bugs #3/#5/#6): a catch that answers [] / null / {} / undefined,
        // or rethrows a fresh generic Error that drops the cause.
        const v = n.variableDeclaration?.name.getText(); const encl = ts.findAncestor(n, ts.isFunctionLike); const where = `${encl ? fnName(encl) : "(top)"}@${lineOf(n.getStart())}`;
        const usesErr = !!v && new RegExp(`\\b${v.replace(/[^\w$]/g, "")}\\b`).test(n.block.getText());
        // v4 calibration (judge 1 #8, judge 2 #9, judge 3 #12). A catch that sets a VISIBLE error
        // (setError, setStatus, `state.error =`) is handled, not swallowed. A fail-closed `return null/false`
        // in a predicate/parse/read helper (or a short helper) whose try block writes nothing is the
        // helper's contract (cover-image renditionRef, readSiteChatComparisonVariant). After a WRITE it is a
        // swallow (tool-confirmation.ts:30 `catch { return false }` after a POST).
        const blockText = n.block.getText();
        const visible = /\bset\w*(Error|Status|Message|Notice|Failure|Problem|Alert)\s*\(|\.(error|errorMessage|failure)\s*=[^=]|\berror\s*:\s*/.test(blockText);
        const tryBlock = ts.isTryStatement(n.parent) ? n.parent.tryBlock : null;
        let tryWrites = false; let tryCalls = false;
        if (tryBlock) { const w = (x) => { if (x !== tryBlock && ts.isFunctionLike(x)) return; if (ts.isCallExpression(x)) { tryCalls = true; if (writeKind(x, (id) => localStr.get(id)) === "write" || portWrite(x)) tryWrites = true; } ts.forEachChild(x, w); }; w(tryBlock); }
        const fnLines = encl ? lineOf(encl.getEnd()) - lineOf(encl.getStart()) + 1 : 999;
        const helper = /^(is|has|can|should|parse|try|safe|maybe|decode|probe|detect|looks|valid|check|read|to|from|normali[sz]e|coerce)[A-Z_]?/.test(encl ? fnName(encl) : "") || fnLines <= 15;
        if (!visible) for (const s0 of n.block.statements) {
          if (ts.isReturnStatement(s0) && s0.expression) {
            const e = unwrap(s0.expression);
            const empty = e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined") || (ts.isArrayLiteralExpression(e) && !e.elements.length) || (ts.isObjectLiteralExpression(e) && !e.properties.length);
            const falsy = e.kind === ts.SyntaxKind.FalseKeyword;
            if (tryWrites && (empty || falsy)) bug.swallows.push(`${where} return ${e.getText()} after a write`);
            else if (empty && !helper) bug.swallows.push(`${where} return ${e.getText()}`);
          } else if (ts.isReturnStatement(s0) || ts.isContinueStatement(s0)) {
            // `catch { continue }` / bare `return` after a read (judge 2 #9: readFileSync then continue).
            if (tryCalls && n.block.statements.length === 1) bug.swallows.push(`${where} ${ts.isContinueStatement(s0) ? "continue" : "return"} drops the error`);
          } else if (ts.isThrowStatement(s0)) {
            const e = unwrap(s0.expression);
            // Round-2 judge 3 #6: deliberate refusals (openMcpUiLink, assertLoopbackAdminUrl, reset-owner)
            // were flagged. A generic rethrow is one that BINDS the error and drops it; a message built
            // with context (template with values) or a binding-less `catch {` is a chosen refusal.
            const msg = e && ts.isNewExpression(e) ? unwrap(e.arguments?.[0]) : null;
            const withContext = !!msg && (ts.isTemplateExpression(msg) || ts.isBinaryExpression(msg));
            if (e && ts.isNewExpression(e) && /Error$/.test(e.expression.getText()) && (e.arguments?.length ?? 0) < 2 && v && !usesErr && !withContext) bug.swallows.push(`${where} rethrows generic ${short(e.getText(), 50)}`);
          }
        }
        // A catch that caches the failure in an outer variable (seed-hash:52 `catch { seedDeps = null }`
        // behind `if (seedDeps !== undefined) return seedDeps`): one transient throw sticks until restart.
        for (const st of n.block.statements) {
          const e = ts.isExpressionStatement(st) ? unwrap(st.expression) : null;
          if (e && ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(e.left) && /^(null|undefined|false)$/.test(e.right.getText())
            && encl && !new RegExp(`\\b(let|const|var)\\s+${e.left.text}\\b`).test(encl.getText())) bug.cachedPromise.push(`catch caches ${e.left.text} = ${e.right.getText()} @${lineOf(st.getStart())}`);
        }
        // ...and the silent ones (deploy-config :83, agent-plugin-tokens :95): `catch {}`. v4: a calls-only
        // catch is flagged only when it LOGS without the error (judge 1 #8: delivery/tool-registrations.ts:180
        // logs a fixed line, then returns); cleanup calls (`image.remove()` in vanilla-host) are fail-closed.
        const logs = n.block.statements.some((s0) => ts.isExpressionStatement(s0) && ts.isCallExpression(unwrap(s0.expression)) && /^(console\.\w+|\w*log(ger)?\.\w+|log\w*|warn|report\w*)$/i.test(unwrap(s0.expression).expression.getText().replace(/\s+/g, "")));
        if (!n.block.statements.length && !/\/\/|\/\*/.test(blockText)) bug.swallows.push(`${where} empty catch`);
        else if (logs && !usesErr && !visible) bug.swallows.push(`${where} logs a fixed line without the error`);
      }
      // Wire keys (round-2 judge 1 #4, judge 3 #1): res.locals keys, x-* header names, cookie names and
      // console/stdout protocol lines are formats another file (or app, or Jini) reads by name.
      if (ts.isPropertyAccessExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "locals" && /^(res|response|reply)$/i.test(recvName(n.expression.expression) ?? "")) {
        const w = ts.isBinaryExpression(n.parent) && n.parent.left === n && n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        f.wireKeys.push({ kind: "res.locals", key: n.name.text, line: lineOf(n.getStart()), write: w, symbol: topSymbol(n) });
      }
      // `res.locals[LOCAL_KEY] = ...` (render-theme-override.ts writes tovuRenderThemeIdOverride this way).
      if (ts.isElementAccessExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "locals" && /^(res|response|reply)$/i.test(recvName(n.expression.expression) ?? "")) {
        const a = unwrap(n.argumentExpression); const key = ts.isStringLiteralLike(a) ? a.text : ts.isIdentifier(a) ? localStr.get(a.text) : null;
        if (key) f.wireKeys.push({ kind: "res.locals", key, line: lineOf(n.getStart()), write: ts.isBinaryExpression(n.parent) && n.parent.left === n, symbol: topSymbol(n) });
      }
      if (ts.isStringLiteralLike(n) && !isModuleSpecifier(n)) {
        if (/^x-[a-z0-9]+(-[a-z0-9]+)+$/i.test(n.text)) f.wireKeys.push({ kind: "header", key: n.text.toLowerCase(), line: lineOf(n.getStart()), symbol: topSymbol(n) });
        const pc = n.parent && (ts.isCallExpression(n.parent) || ts.isNewExpression(n.parent)) ? lastName(n.parent.expression) ?? "" : "";
        if ((/cookie/i.test(pc) && /^[\w.-]{4,60}$/.test(n.text)) || /^[a-z][a-z0-9]*([_-][a-z0-9]+)*[_-](session|sid|csrf|auth)$/.test(n.text)) f.wireKeys.push({ kind: "cookie", key: n.text, line: lineOf(n.getStart()), symbol: topSymbol(n) });
      }
      if (ts.isCallExpression(n) && /^(console\.(log|info|warn|error)|process\.(stdout|stderr)\.write)$/.test(n.expression.getText()) && n.arguments[0]) {
        const a0 = unwrap(n.arguments[0]);
        if (ts.isStringLiteralLike(a0) || ts.isTemplateExpression(a0)) {
          const pat = templatePattern(a0); const head = pat.split("${}")[0];
          // A `prefix: key=` line is a protocol another process may parse (desktop's BOOT_TOKEN_LINE).
          if (/^[\w@./ -]{3,40}: \S*=/.test(head) || /^[\w@./ -]{3,40}: /.test(head) && /\w=\$\{\}/.test(pat)) f.wireKeys.push({ kind: "stdout-line", key: head, line: lineOf(n.getStart()), symbol: topSymbol(n) });
          // Secret-looking values printed (round-2 judge 3 #1): a `*Token=`/`*Secret=` label or an
          // interpolated mint*/token/secret/password value. Jini's log redactor keys on field names, not
          // on `bootToken=` inside a free-text line, so a log tee would keep the secret.
          const spans = ts.isTemplateExpression(a0) ? a0.templateSpans : [];
          const hit = !/tokens|count|usage|length|limit|budget|max[A-Z_]/i.test(pat + spans.map((sp) => sp.expression.getText()).join(" ")) && spans.find((sp, i) => /(token|secret|password|apikey|credential)=?\s*$/i.test(i === 0 ? a0.head.text : spans[i - 1].literal.text) || /\b(mint\w*|\w*(token|secret|password|apiKey|credential)\w*)\b/i.test(sp.expression.getText()));
          if (hit) bug.secretLogs.push(`${short(pat, 50)} @${lineOf(n.getStart())}`);
        }
      }
      if (ts.isCallExpression(n)) {
        const c = lastName(n.expression) ?? "";
        if (/^ensure[A-Z]\w*$/.test(c)) f.ensureCalls.add(c);
      }
      // Promise cached for good (round-2 judge 1 #11: seed-hash, worker-sandbox): `x ??= load()` with no
      // reset of x anywhere in the file keeps a rejected promise (or a cached null) forever.
      if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken || n.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken)) {
        const rhs = unwrap(n.right); const lhs = n.left.getText();
        // Only promises: the RHS chains/imports/builds one, or the variable is awaited / typed Promise
        // (worker-sandbox `sourceWorkers ??= compileSourceWorkers()` then `await sourceWorkers`).
        const esc = lhs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const promiseLike = /\.then\(|\bimport\(|\bPromise\./.test(rhs?.getText() ?? "") || new RegExp(`await\\s+\\(?${esc}\\b|\\b${esc}\\s*:\\s*Promise<`).test(text);
        // v4 (judge 1 #8: cli-probe-cache): `Promise.resolve(sync())` cannot cache a rejection, and a
        // variable the file reassigns elsewhere (`snapshot = Promise.resolve(result)`) is refreshed.
        const reassigned = new RegExp(`(^|[^?|&=!<>])\\b${esc}\\s*=(?!=)`, "m").test(text.replace(n.getText(), ""));
        if (rhs && ts.isCallExpression(rhs) && n.parent && !ts.isAwaitExpression(n.parent) && promiseLike && !/^Promise\.resolve$/.test(rhs.expression.getText()) && !reassigned) {
          const reset = new RegExp(`${lhs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(null|undefined)\\b|delete\\s+${lhs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
          if (!reset) bug.cachedPromise.push(`${short(n.getText().replace(/\s+/g, " "), 60)} @${lineOf(n.getStart())}`);
        }
      }
      // Whole-collection PUT (pilot DE #3, bug 3): a PUT that replaces a whole map/list loses a
      // concurrent writer's change. Flag PUT requests and PUT routes with no trailing :param.
      if (ts.isPropertyAssignment(n) && memberName(n) === "method" && ts.isStringLiteralLike(n.initializer) && n.initializer.text.toUpperCase() === "PUT") bug.wholePut.push(`PUT request @${lineOf(n.getStart())}`);
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "put" && /^(app|router|server|fastify|routes?|r)$/i.test(recvName(n.expression.expression) ?? "")
        && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text.startsWith("/")) {
        // "(collection)" only for a plural last segment with no :param (round-2 judge 1 #3: the explore PUT
        // writes one file and was tagged collection).
        const route = n.arguments[0].text; const last = route.replace(/\/$/, "").split("/").pop() ?? "";
        bug.wholePut.push(`PUT route ${route} @${lineOf(n.getStart())}${!last.startsWith(":") && /[a-z]s$/.test(last) ? " (collection)" : ""}`);
      }
    }
    // --- v4 facts --------------------------------------------------------------------------------
    // Path-loaded entries (judge 1 #1, judge 2 #2): `lib: { entry: path.resolve(dir, "src/loader-entry.ts") }`,
    // `new URL("../../x.js", import.meta.url)`, `path.join(dir, "../../inbound/assistant", "x.ts")` spawn paths.
    if (info.repo === "tovu" && info.role !== "test") {
      if (ts.isStringLiteralLike(n) && !isModuleSpecifier(n) && /\.[mc]?[jt]sx?$/.test(n.text) && n.text.includes("/") && n.text.length <= 200) f.pathLits.push(n.text);
      const pc = ts.isCallExpression(n) || ts.isNewExpression(n) ? (n.expression.getText(sf)) : "";
      if (/^(path\.(posix\.)?)?(join|resolve)$|^URL$/.test(pc) && n.arguments?.length) {
        const lits = []; for (const a0 of n.arguments) { const a = unwrap(a0);
          if (ts.isStringLiteralLike(a)) lits.push(a.text);
          else if (ts.isConditionalExpression(a)) { const b = [a.whenTrue, a.whenFalse].map(unwrap).find((x) => ts.isStringLiteralLike(x) && /\.ts$/.test(x.text)) ?? unwrap(a.whenFalse); if (ts.isStringLiteralLike(b)) lits.push(b.text); } }
        const joined = lits.join("/").replace(/\/+/g, "/");
        if (lits.length > 1 && /\.[mc]?[jt]sx?$/.test(joined)) f.pathLits.push(joined);
      }
    }
    if (full) {
      // Property names read or destructured here: member-level dead code (judge 3 #4: `replace`, `setDraftToken`).
      if (ts.isPropertyAccessExpression(n)) f.propNames.add(n.name.text);
      else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) f.propNames.add((n.propertyName ?? n.name).getText(sf));
      // Thrown messages (Tovu and Jini) and `err.message === "..."` / `.includes("...")` compares (judge 2 #8:
      // a service exact-matching another file's error text is a private format coupling).
      if (ts.isThrowStatement(n) && n.expression && ts.isNewExpression(unwrap(n.expression))) { const a = unwrap(unwrap(n.expression).arguments?.[0]); if (a && (ts.isStringLiteralLike(a) || ts.isTemplateExpression(a))) { const t = templatePattern(a).split("${}")[0].trim(); if (t.length >= 12) f.thrown.add(t); } }
      if (info.repo === "tovu") {
        const isMsg = (e) => { e = unwrap(e); return !!e && ts.isPropertyAccessExpression(e) && e.name.text === "message"; };
        if (ts.isBinaryExpression(n) && /^[!=]==?$/.test(ts.tokenToString(n.operatorToken.kind) ?? "")) { const [m, l] = isMsg(n.left) ? [n.left, n.right] : isMsg(n.right) ? [n.right, n.left] : []; if (m && ts.isStringLiteralLike(l) && l.text.trim().length >= 12) f.errCompares.push({ text: l.text.trim(), line: lineOf(n.getStart()), symbol: topSymbol(n), op: "===" }); }
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(includes|startsWith|endsWith)$/.test(n.expression.name.text) && isMsg(n.expression.expression) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text.trim().length >= 12) f.errCompares.push({ text: n.arguments[0].text.trim(), line: lineOf(n.getStart()), symbol: topSymbol(n), op: n.expression.name.text });
      }
      // Permission literals in a permission context (WIRE-DRIFT, tool-calls): `permission: "x"`,
      // `permissions: ["x"]`, `const X_PERMISSION = "x"`, `grants.has("x")`, `requireToolPermission(..."x")`.
      if (ts.isStringLiteralLike(n) && PERM_RE.test(n.text) && !isModuleSpecifier(n)) {
        let p = n.parent; if (p && ts.isArrayLiteralExpression(p)) p = p.parent;
        const def = !!p && ts.isVariableDeclaration(p) && /PERMISSION/i.test(p.name.getText(sf));
        const ctx = def || (!!p && ts.isPropertyAssignment(p) && /permission/i.test(memberName(p)))
          || (!!p && ts.isCallExpression(p) && /^(has|can|hasPermission|require\w*Permission|assert\w*Permission|authorize\w*|check\w*Permission)$/.test(lastName(p.expression) ?? ""));
        if (ctx) f.permLits.push({ value: n.text, line: lineOf(n.getStart()), def, name: def ? p.name.getText(sf) : null });
      }
      // Route-path literals (WIRE-DRIFT and client-route checks): "/system/site-key", `${base}/system/site-token`.
      if ((ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) && !isModuleSpecifier(n)) {
        const pat = templatePattern(n).replace(/^(\$\{\})+/, "").replace(/\?.*$/, "");
        if (/^\/[a-z][\w.-]*(\/[\w:.${}-]+)+\/?$/i.test(pat) && pat.length <= 160) f.routeLits.add(pat.replace(/\$\{\}|:\w+/g, ":p").replace(/\/$/, ""));
      }
      if (ts.isCallExpression(n) && /^(get|post|put|patch|delete|all)$/.test(lastName(n.expression) ?? "") && ts.isPropertyAccessExpression(n.expression) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text.startsWith("/"))
        f.routeDefs.push({ method: n.expression.name.text.toUpperCase(), path: n.arguments[0].text.replace(/:\w+/g, ":p").replace(/\/$/, ""), line: lineOf(n.getStart()) });
      // Tool definitions (TOOL-CALL check): an object literal with `name` plus `authorization`, or plus
      // `inputSchema` and `description` (AgentToolDefinition shape).
      if (info.repo === "tovu" && ts.isObjectLiteralExpression(n)) {
        const props = new Map(n.properties.filter((p) => p.name).map((p) => [memberName(p), p]));
        if (props.has("name") && (props.has("authorization") || (props.has("inputSchema") && props.has("description")))) {
          const val = (p) => { const i = p && ts.isPropertyAssignment(p) ? unwrap(p.initializer) : p && ts.isShorthandPropertyAssignment(p) ? p.name : null; if (!i) return null; if (ts.isStringLiteralLike(i)) return i.text; if (ts.isIdentifier(i)) return localStr.get(i.text) ?? `${i.text}`; return short(i.getText(sf), 40); };
          const auth = props.get("authorization"); const ai = auth && ts.isPropertyAssignment(auth) ? unwrap(auth.initializer) : null;
          const perm = ai && ts.isObjectLiteralExpression(ai) ? val(ai.properties.find((p) => p.name && memberName(p) === "permission")) : null;
          f.tools.push({ name: val(props.get("name")), line: lineOf(n.getStart()), permission: perm, hasAuthorization: !!auth, hasSchema: props.has("inputSchema") });
        }
      }
    }
    if (full) {
      if (ts.isObjectLiteralExpression(n)) collectPorts(n);
      if (ts.isFunctionLike(n) && "body" in n && n.body) {
        fnCount++;
        const name = fnName(n);
        // Jini private closures as twin targets (pilot DE #1: toWireSurfacePayload <-> a closure in
        // delegated-tool-bridge). Tovu nested functions stay out: rows label top-level symbols.
        if (info.repo === "jini" && ts.isBlock(n.body) && !unitBodies.has(n.body) && name !== "(anon)") addUnit(`${topSymbol(n) ?? "?"}>${name}`, "fn", n.body, n, false, { closure: true });
        if (tovuFull) {
          // A function that talks about process exit (SIGTERM, .kill(, exit codes) uses `signal` for
          // an OS signal, not cancellation (pilot DE #3: kill, classifyExit, computeExitReasonCode).
          // `(code, signal)` / `{ code, signal }` is a child-process exit pair.
          const osFn = /SIG[A-Z]{3,}|\.kill\(|\bexit(Code)?\b|\bkill\b/i.test(name) || (n.parameters ?? []).some((p) => /\bcode\b/.test(p.name.getText())) || ((n.parameters ?? []).some((p) => /signal/i.test(p.name.getText())) && /SIG[A-Z]{3,}|\.kill\(|exitCode|on\(["'](exit|close)["']/.test(n.getText()));
          if (!osFn) for (const p of n.parameters ?? []) {
            const pn = p.name; const ptype = p.type?.getText() ?? "";
            // OS signals (NodeJS.Signals, "SIGTERM" strings, exit-code helpers) are not cancellation.
            if (/Signals|^string|^number/.test(ptype)) continue;
            const names = ts.isIdentifier(pn) ? [pn.text] : ts.isObjectBindingPattern(pn) ? pn.elements.map((el) => el.name.getText()) : [];
            if (/AbortSignal|CancelToken/.test(ptype) || names.some((x) => /^(signal|abortSignal|cancel\w*)$/.test(x))) bug.signalParams.push(`${name}@${lineOf(n.getStart())}`);
            else if (/\bsignal\??:\s*AbortSignal/.test(ptype)) bug.signalParams.push(`${name}(opts.signal)@${lineOf(n.getStart())}`);
          }
          if (CRUD_RE.test(name)) bug.crud.push(`${name}@${lineOf(n.getStart())}`);
          timing(n, name);
        }
      }
      // Jini symbols that write, so a Tovu bare call into Jini resolves one hop too.
      if (info.repo === "jini" && ts.isCallExpression(n) && writeKind(n) === "write") { const s0 = topSymbol(n); if (s0) f.directWriteSyms.add(s0); }
      if (tovuFull && ts.isCallExpression(n)) {
        const callee = lastName(n.expression);
        if (callee === "throwIfAborted") bug.abortChecks.push(lineOf(n.getStart()));
        const encl = ts.findAncestor(n.parent, ts.isFunctionLike);
        const osSignal = /kill|exit|signal|^on$|^once$|^String$|^log$|^warn$|^error$/i.test(callee ?? "") || (!!encl && (/SIG[A-Z]{3,}|\.kill\(|exitCode/.test(encl.getText()) || (encl.parameters ?? []).some((p) => /\bcode\b/.test(p.name.getText()))));
        const passes = !osSignal && n.arguments.some((a) => (ts.isIdentifier(a) && /^(signal|abortSignal)$/.test(a.text)) || (ts.isPropertyAccessExpression(a) && a.name.text === "signal")
          || (ts.isObjectLiteralExpression(a) && a.properties.some((p) => p.name && /^signal$/.test(memberName(p)))));
        const label = short(n.expression.getText().replace(/\s+/g, ""), 48);
        if (passes) bug.forwards.push(`${label}@${lineOf(n.getStart())}`);
        // Bare verb-noun calls (settleWithin, trashDaysRemaining, pushRefusal) are writes only if the
        // callee itself writes: resolved one hop after the parse (round-2 judge 1 #3, judge 2 #9).
        const wk = writeKind(n, (id) => localStr.get(id)) ?? (portWrite(n) ? "write" : null);
        // Map-cached promise with no delete-on-reject (judge 2 #9: decoyKeyHash memoises hasher.hash() in a
        // Map; a rejected hash stays cached for the process). `M.set(k, v)` in a Promise-returning function
        // (or a Map typed with Promise) and no `M.delete(` anywhere in the file.
        if (ts.isPropertyAccessExpression(unwrap(n.expression)) && unwrap(n.expression).name.text === "set" && n.arguments.length === 2) {
          const m = unwrap(n.expression).expression.getText().replace(/\s+/g, ""); const encl = ts.findAncestor(n.parent, ts.isFunctionLike);
          const esc = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // A non-async function typed `Promise<...>` returns the cached value itself: that is a cached promise.
          const promiseFn = (!!encl && /Promise</.test(encl.type?.getText() ?? "") && !ts.getModifiers?.(encl)?.some((x) => x.kind === ts.SyntaxKind.AsyncKeyword)) || new RegExp(`${esc.split(".").pop()}[^;\\n]*Map<[^>]*Promise<`).test(text);
          const raw = n.arguments[1]; const v0 = unwrap(raw);
          const isCall = !ts.isAwaitExpression(raw) && (ts.isCallExpression(v0) || (ts.isIdentifier(v0) && !!encl && new RegExp(`\\b${v0.text}\\s*=\\s*[\\w.]+\\(`).test(encl.getText())));
          if (promiseFn && isCall && !new RegExp(`${esc}\\.(delete|clear)\\(`).test(text)) bug.cachedPromise.push(`${m}.set(...) caches a promise, no delete-on-reject @${lineOf(n.getStart())}`);
        }
        if (wk === "write") { bug.writes.push(`${label}@${lineOf(n.getStart())}${passes ? "+sig" : ""}`); const ts0 = topSymbol(n); if (ts0) f.directWriteSyms.add(ts0); }
        else if (wk === "bare") f.bareWrites.push({ callee: unwrap(n.expression).text, text: `${label}@${lineOf(n.getStart())}${passes ? "+sig" : ""}` });
      } else if (tovuFull && ts.isPropertyAccessExpression(n) && n.name.text === "aborted") bug.abortChecks.push(lineOf(n.getStart()));
    }
    ts.forEachChild(n, visit);
  };

  /** Port-implementation candidates: `key: tovuSymbol` inside an object literal that is typed with,
   * or passed into, something (resolved in pass 2 to Jini or not). Item 2 of canary-2. */
  function portContext(obj) {
    const p = obj.parent;
    if (ts.isVariableDeclaration(p) && p.type) { const r = typeRoot(p.type); return r ? { root: r, label: short(p.type.getText(), 50) } : null; }
    if ((ts.isSatisfiesExpression?.(p) || ts.isAsExpression(p)) && p.type) { const r = typeRoot(p.type); return r ? { root: r, label: short(p.type.getText(), 50) } : null; }
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(obj)) {
      const r = rootIdent(p.expression); return r ? { root: r, label: `${short(p.expression.getText(), 40)}(#${p.arguments.indexOf(obj)})` } : null;
    }
    if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.parent)) { const up = portContext(p.parent); return up ? { root: up.root, label: `${up.label}.${memberName(p)}` } : null; }
    // `function bind(): JiniPort { return { ... } }` and `(): JiniPort => ({ ... })`
    const fn = ts.isReturnStatement(p) ? ts.findAncestor(p, ts.isFunctionLike) : ts.isArrowFunction(p) && p.body === obj ? p : null;
    if (fn?.type) { const r = typeRoot(fn.type); return r ? { root: r, label: short(fn.type.getText(), 50) } : null; }
    return null;
  }
  function collectPorts(obj) {
    let ctx;
    // Key set of every top-level host object (typed with / passed into a binding): two Tovu files
    // wiring the same Jini host with the same keys are duplicate wiring even when bodies differ.
    if (obj.properties.length >= 4 && !ts.isPropertyAssignment(obj.parent)) {
      ctx = portContext(obj) ?? false;
      // vals = key=value text: two sites passing the same factory its required options share KEYS
      // by API, not by copy (pilot DE #6: createNodeDaemonProcessAdapter x6; ABC #8: DataModuleDecl).
      if (ctx) f.hostObjects.push({ line: lineOf(obj.getStart()), root: ctx.root, label: ctx.label, keys: obj.properties.map((p) => (p.name ? memberName(p) : "...")).sort(),
        vals: obj.properties.map((p) => `${p.name ? memberName(p) : "..."}=${short((ts.isPropertyAssignment(p) ? p.initializer.getText() : p.getText()).replace(/\s+/g, ""), 60)}`) });
    }
    for (const prop of obj.properties) {
      let value = null;
      if (ts.isShorthandPropertyAssignment(prop)) value = prop.name.text;
      else if (ts.isPropertyAssignment(prop)) {
        const init = unwrap(prop.initializer);
        if (ts.isIdentifier(init)) value = init.text;
        else if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) {
          const r = (() => { let e = init.body; if (ts.isBlock(e)) { if (e.statements.length !== 1) return null; const s = e.statements[0]; e = ts.isReturnStatement(s) ? s.expression : ts.isExpressionStatement(s) ? s.expression : null; } e = unwrap(e); return e && ts.isCallExpression(e) && ts.isIdentifier(unwrap(e.expression)) ? unwrap(e.expression).text : null; })();
          value = r; // a one-call wrapper `({value}) => tovuFn({value})` implements the field too
        }
      }
      if (!value || value === "undefined") continue;
      ctx ??= portContext(obj) ?? false;
      if (!ctx) return;
      f.ports.push({ line: lineOf(prop.getStart()), root: ctx.root, label: ctx.label, field: memberName(prop), value });
    }
  }
  visit(sf);

  // --- comments: stale path references (canary-2 item 8) --------------------------------------
  if (full) {
    const seen = new Set();
    const scanComments = (ranges) => { for (const r of ranges ?? []) { if (seen.has(r.pos)) continue; seen.add(r.pos);
      const c = text.slice(r.pos, r.end); for (const m of c.matchAll(PATH_REF_RE)) f.staleCandidates.push({ ref: m[1], line: lineOf(r.pos + m.index) });
      // v4 (judge 1 #9, judge 2 #11): `file.ts:44-50` line cites (bare names too) are checked against the
      // file's length, and `@jini-ai/pkg/sub` mentions against that package's `exports` map.
      for (const m of c.matchAll(LINE_REF_RE)) f.staleCandidates.push({ ref: m[1], refLine: +(m[3] ?? m[2]), line: lineOf(r.pos + m.index), kind: "line" });
      for (const m of c.matchAll(/@jini-ai\/[\w-]+(?:\/[\w-]+)*(?![\w./-]*\.\w{2,4}\b)/g)) f.staleCandidates.push({ ref: m[0], line: lineOf(r.pos + m.index), kind: "jini-spec" }); } };
    const walkC = (n) => { scanComments(ts.getLeadingCommentRanges(text, n.pos)); ts.forEachChild(n, walkC); };
    walkC(sf); scanComments(ts.getLeadingCommentRanges(text, sf.endOfFileToken.pos));
  }
  f.jiniLits = jiniLits;
  // The hermetic default composition (composition/app.ts: in-memory adapters, "what tests exercise"):
  // its edges to memory/console/seed adapters are not prod reach (judge 2 #11).
  f.hermetic = info.repo === "tovu" && /\bhermetic\b/i.test(text.slice(0, 40000)) && f.imports.length >= 30;
  // TOOL-CALL check, per file: hand-written permission checks, ctx.signal reads, hand-parsed input,
  // generic error wording. Files that define tools, or tool/registration files that hold their handlers.
  if (full && info.repo === "tovu" && (f.tools.length || /tool|registration/i.test(path.basename(info.rel)))) {
    const checks = []; const generic = []; let handParse = 0;
    const w = (n) => {
      if (ts.isCallExpression(n)) {
        const c = lastName(n.expression);
        if (c && HAND_CHECK_RE.test(c)) {
          let perm = null; for (const a of n.arguments) { const x = unwrap(a); if (ts.isStringLiteralLike(x) && PERM_RE.test(x.text)) perm = x.text;
            else if (ts.isObjectLiteralExpression(x)) { const pp = x.properties.find((q) => q.name && memberName(q) === "permission"); const iv = pp && ts.isPropertyAssignment(pp) ? unwrap(pp.initializer) : null; if (iv) perm = ts.isStringLiteralLike(iv) ? iv.text : ts.isIdentifier(iv) ? (localStr.get(iv.text) ?? iv.text) : null; } }
          checks.push({ fn: c, perm, line: lineOf(n.getStart()) });
        }
        if (/^JSON\.parse$/.test(n.expression.getText())) handParse++;
      }
      // `typeof input.x === "string"` / `typeof ctx.input...` instead of the declared schema.
      if (ts.isTypeOfExpression(n) && /^(ctx\.)?(input|args|params|raw)\b/.test(n.expression.getText())) handParse++;
      if (ts.isStringLiteralLike(n) && GENERIC_ERR_RE.test(n.text) && n.parent && ((ts.isNewExpression(n.parent) && /Error$/.test(n.parent.expression.getText())) || (ts.isPropertyAssignment(n.parent) && /^(error|message|reason)$/.test(memberName(n.parent))))) generic.push(`"${n.text}"@${lineOf(n.getStart())}`);
      ts.forEachChild(n, w);
    };
    w(sf);
    f.toolFile = { checks, ctxSignal: /\bctx\.signal\b|\{[^}]*\bsignal\b[^}]*\}\s*=\s*ctx\b|\bsignal\s*:\s*ctx\.signal/.test(text), handParse, generic };
  }
  if (full) {
    f.bug = bug; f.fnCount = fnCount;
    f.toolRegistration = /\bbuildDomainRegistrations\b|AgentToolDefinition\[\]/.test(text);
    f.dataIsh = /(i18n|locales?|copy|messages|strings)\b/i.test(info.rel);
    // An approval handler or ctx.signal use is behaviour a Tier 0 skim misses (pilot ABC #7:
    // project-keys/tools.ts and consent/tool-registrations.ts sat at Tier 0 as R9).
    f.approvalOrCtxSignal = /\b(requiresApproval|needsApproval|approvalRequired|approval\w*\s*[:(]|onApprove\w*|approve[A-Z]\w*\s*\(|ctx\.signal)/.test(text);
    // Rule check (pilot DE #7, D2): Jini must not name a specific server framework (owner 11-07).
    // Partial batches (round-2 judge 2 #1): a prepared/approval batch whose prepare step pins a
    // version/hash reads every item against ONE original; two items on the same target then conflict.
    f.batchPin = /\b(createPreparedBatchHandler|createBatchApprovalHandler)\b/.test(text) && /\bprepare\w*\s*[:(]/.test(text) && /\b\w*(Hash|hash|Version|version|etag|Etag|sha|revision)\w*\b/.test(text);
    f.expressType = f.imports.some((i) => /^(express|@types\/express)$/.test(i.spec)) || /(:\s*|<\s*)(Express|express\.(Application|Router|Request|Response))\b/.test(text);
  }
  return f;
}

const facts = new Map();
let parseErrors = 0;
for (const [abs, info] of files) {
  try { facts.set(abs, parseFile(abs, info)); } catch (error) { parseErrors++; console.error(`parse failed: ${info.rel}: ${error.message}`); }
}
const tParse = Date.now();

// ---------------------------------------------------------------------------------------------
// Specifier resolution (Tovu aliases + Jini exports maps) and name resolution through re-exports.
// ---------------------------------------------------------------------------------------------
const TOVU_ALIASES = [
  [/^#src\/(.*)$/, (m) => `apps/website/src/${m[1]}`],
  [/^@tovu\/headless$/, () => "apps/website/src/contracts/headless/index.ts"],
  [/^@tovu\/theme-layout$/, () => "apps/website/src/features/theme/theme-layout.ts"],
  [/^@tovu\/publish-content-ui$/, () => "apps/website/src/features/publish-content/ui/index.ts"],
  [/^@tovu\/assistant-run-events$/, () => "apps/website/src/contracts/core/assistant-run-events.ts"],
  [/^@tovu\/contracts\/(.*)$/, (m) => `packages/contracts/src/${m[1]}`],
  [/^@tovu\/sdk$/, () => "packages/sdk/src/index.ts"],
];
function tryFile(base) {
  const noJs = base.replace(/\.(m|c)?js$/, "");
  const cands = [base, `${noJs}.ts`, `${noJs}.tsx`, `${noJs}.mts`, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.mjs`];
  return cands.find((c) => files.has(c)) ?? null;
}
function resolveJini(spec) {
  const m = /^(@jini-ai\/[^/]+)(\/.*)?$/.exec(spec); if (!m) return null;
  const pkg = jiniPkgs.get(m[1]); if (!pkg) return null;
  const sub = `.${m[2] ?? ""}`; let entry = pkg.exports[sub];
  if (!entry) { // wildcard subpaths ("./ui-ux-design/*")
    for (const [k, v] of Object.entries(pkg.exports)) if (k.endsWith("/*") && sub.startsWith(k.slice(0, -1))) entry = typeof v === "string" ? v.replace("*", sub.slice(k.length - 1)) : null;
  }
  // Conditions can nest ({ import: { types, default } }); take the first string, preferring import.
  const pick = (e) => typeof e === "string" ? e : e && typeof e === "object" ? pick(e.import ?? e.default ?? e.node ?? e.types ?? Object.values(e)[0]) : null;
  const target = pick(entry);
  if (!target) return null;
  const srcPath = path.join(pkg.dir, target.replace(/^\.\/dist\//, "./src/").replace(/\.d\.ts$/, ".js"));
  return tryFile(srcPath);
}
const specCache = new Map();
/** -> { kind: "file", abs } | { kind: "jini", spec } (unresolvable Jini subpath) | { kind: "node" } | { kind: "npm" } | { kind: "missing" } */
function resolveSpec(fromAbs, spec) {
  const key = `${path.dirname(fromAbs)}\0${spec}`; if (specCache.has(key)) return specCache.get(key);
  let r;
  const fromRepo = files.get(fromAbs)?.repo;
  if (spec.startsWith("node:") || NODE_BUILTINS.has(spec.split("/")[0])) r = { kind: "node" };
  else if (spec.startsWith(".")) { const abs = tryFile(path.resolve(path.dirname(fromAbs), spec)); r = abs ? { kind: "file", abs } : { kind: "missing" }; }
  else if (spec.startsWith("@jini-ai/")) { const abs = resolveJini(spec); r = abs ? { kind: "file", abs } : { kind: "jini", spec }; }
  else if (fromRepo === "tovu") {
    r = { kind: "npm" };
    if (spec.startsWith("@/") && fromAbs.startsWith(path.join(TOVU, "apps/admin/"))) { const abs = tryFile(path.join(TOVU, "apps/admin/src", spec.slice(2))); r = abs ? { kind: "file", abs } : { kind: "missing" }; }
    for (const [re, to] of TOVU_ALIASES) { const m = re.exec(spec); if (m) { const abs = tryFile(path.join(TOVU, to(m))); r = abs ? { kind: "file", abs } : { kind: "missing" }; break; } }
  } else r = { kind: "npm" };
  specCache.set(key, r); return r;
}
const jiniSpecOf = (abs) => { const f = files.get(abs); return f?.repo === "jini" ? `@jini-ai/${f.rel.split("/")[1]}` : null; };

/** Follow export `name` of file `abs` through re-exports/stars to its defining file (R7 + barrels).
 * -> { abs, name } (abs may be a Jini file) | { jini: spec, name } | { ext: spec } | null */
function resolveExport(abs, name, depth = 0) {
  const f = facts.get(abs); if (!f || depth > 12) return null;
  if (name !== "*" && f.localExports.has(name)) return { abs, name };
  if (name === "*") return { abs, name };
  const re = f.reexports.get(name);
  if (re) return resolveVia(abs, re.spec, re.imported, depth);
  for (const spec of f.stars) { const r = resolveVia(abs, spec, name, depth, true); if (r) return r; }
  return null;
}
function resolveVia(fromAbs, spec, name, depth, star = false) {
  const t = resolveSpec(fromAbs, spec);
  let r;
  if (t.kind === "file") r = resolveExport(t.abs, name, depth + 1) ?? (star ? null : { abs: t.abs, name });
  else if (t.kind === "jini") r = star ? null : { jini: spec, name };
  else r = star ? null : { ext: spec };
  // Keep the OUTERMOST @jini-ai specifier on the chain: the package the importer NAMED. Jini->Jini
  // re-exports otherwise hide it (`@jini-ai/cms/core` showed as core#tool-permissions.ts, pilot
  // ABC #2), and CORE-CONTRACT-NEEDED counts named packages. Outer calls assign last, so they win.
  if (r && spec.startsWith("@jini-ai/")) r.jspec = spec;
  return r;
}
/** Resolve a local binding (import) of file `abs` to its origin. */
function resolveBinding(abs, local) {
  const b = facts.get(abs)?.bindings.get(local); if (!b) return null;
  return resolveVia(abs, b.spec, b.imported, 0);
}
const isJiniOrigin = (o) => !!o && (o.jini || (o.abs && files.get(o.abs)?.repo === "jini"));
const originLabel = (o) => o.jini ? `${o.jini}#${o.name}` : o.abs ? `${display(o.abs)}#${o.name}` : o.ext;

// ---------------------------------------------------------------------------------------------
// Edges: per import, per name, resolved to the defining file. Barrels are transparent.
// ---------------------------------------------------------------------------------------------
const importers = new Map();      // defining Tovu abs -> Map(importer abs -> Set(names))
const usedNames = new Map();      // defining abs -> Set(names) ("*" = all)
// Direct importers: files whose specifier resolves to THIS file, before re-export resolution. A
// facade/barrel (kernel/dialect.ts re-exporting @jini-ai/db) has no "defining" callers, so the
// resolved count read 0 and invited a DELETE without a repoint (pilot ABC #1).
const directImp = new Map();      // Tovu abs -> Map(importer abs -> { names: Set, reexport: bool })
const fileEdges = new Map();      // importer abs -> [{ to, names, typeOnly, via, kind }]
const addUse = (to, from, name) => {
  if (!importers.has(to)) importers.set(to, new Map());
  const m = importers.get(to); if (!m.has(from)) m.set(from, new Set()); m.get(from).add(name);
  if (!usedNames.has(to)) usedNames.set(to, new Set()); usedNames.get(to).add(name);
};
/** Every name a module exports, through named re-exports and `export *` chains. */
function exportNames(abs, seen = new Set()) {
  const out = new Set(); const f = facts.get(abs); if (!f || seen.has(abs)) return out; seen.add(abs);
  for (const n of f.localExports.keys()) out.add(n);
  for (const n of f.reexports.keys()) out.add(n);
  for (const spec of f.stars) { const t = resolveSpec(abs, spec); if (t.kind === "file") for (const n of exportNames(t.abs, seen)) if (n !== "default") out.add(n); }
  return out;
}
for (const [abs, f] of facts) {
  if (files.get(abs).repo !== "tovu") continue;
  const edges = [];
  for (const imp of f.imports) {
    const t = resolveSpec(abs, imp.spec);
    const base = { spec: imp.spec, kind: imp.kind, typeOnly: imp.typeOnly, line: imp.line, awaited: !!imp.awaited };
    if (t.kind !== "file") { edges.push({ ...base, target: t.kind === "jini" ? "jini" : t.kind, to: null, jiniPkg: specPkg(imp.spec), names: imp.names }); continue; }
    // Namespace imports (static, or `const m = await import()`): resolve the `ns.x` names used here.
    let names = imp.names;
    if (names.includes("*") && (imp.kind === "import" || imp.kind === "dynamic")) {
      const local = [...f.bindings].find(([, b]) => b.spec === imp.spec && b.imported === "*")?.[0];
      const used = local && f.nsUses.get(local);
      if (used?.size) names = [...used];
    }
    if (files.get(t.abs).repo === "tovu") {
      if (!directImp.has(t.abs)) directImp.set(t.abs, new Map());
      const d = directImp.get(t.abs); if (!d.has(abs)) d.set(abs, { names: new Set(), reexport: false, imports: false });
      // A file that imports names AND re-exports others is still a direct importer (round-2 judge 2 #7:
      // import-backend.ts imports 13 names from import-backend-steps.ts and showed "direct prod 0").
      const rec = d.get(abs); names.forEach((n) => rec.names.add(n)); if (imp.kind === "reexport") rec.reexport = true; else rec.imports = true;
    }
    // A `*` use of a barrel/facade fans out to every name it re-exports, so the defining files
    // behind it get their importers (pilot DE #2: re-export-only barrels kept the edge).
    const tf = facts.get(t.abs);
    if (names.includes("*") && imp.kind !== "reexport" && (tf.reexports.size || tf.stars.length)) names = [...new Set([...names.filter((n) => n !== "*"), ...exportNames(t.abs)])];
    const byTarget = new Map();
    for (const name of names) {
      const o = name === "*" ? { abs: t.abs, name: "*" } : resolveExport(t.abs, name) ?? { abs: t.abs, name };
      const to = o.abs ?? null;
      const jiniDef = o.jini ?? (to && files.get(to).repo === "jini" ? jiniSpecOf(to) : null);
      // The package the import NAMES: the specifier itself, or the outermost Jini spec behind a Tovu barrel.
      const named = specPkg(imp.spec) ?? specPkg(o.jspec);
      const k = `${to ?? `jini:${o.jini}`}|${named}`;
      if (!byTarget.has(k)) byTarget.set(k, { to, jini: jiniDef, jiniPkg: named, names: [] });
      byTarget.get(k).names.push(o.name);
      if (to && files.get(to).repo === "tovu" && imp.kind !== "reexport") addUse(to, abs, o.name);
    }
    for (const v of byTarget.values()) {
      const via = files.get(t.abs).repo === "tovu" && v.to !== t.abs ? display(t.abs) : null;
      edges.push({ ...base, target: v.to && files.get(v.to).repo === "tovu" ? "tovu" : "jini", to: v.to, jiniSpec: v.jini, jiniPkg: v.jiniPkg, names: v.names, via });
    }
  }
  fileEdges.set(abs, edges);
}

// ---------------------------------------------------------------------------------------------
// Features: folder under src/ (split one level deeper when the folder is large).
// ---------------------------------------------------------------------------------------------
function featureAt(rel, depth) {
  const parts = rel.split("/");
  if (parts[0] === "packages") return `pkg:${parts[1]}`;
  const app = parts[1]; const i = parts.indexOf("src");
  if (i < 0) return `${app}/${parts.length > 3 ? parts[2] : "(root)"}`;
  const under = parts.slice(i + 1, -1);
  return under.length ? `${app}/${under.slice(0, depth).join("/")}` : `${app}/(src)`;
}
const mainFiles = [...facts.keys()].filter((a) => files.get(a).role === "main");
const featureCount = new Map();
for (const a of mainFiles) { const k = featureAt(files.get(a).rel, 2); featureCount.set(k, (featureCount.get(k) ?? 0) + 1); }
const featureOf = (abs) => { const rel = files.get(abs).rel; const f2 = featureAt(rel, 2); return (featureCount.get(f2) ?? 0) > FEATURE_SPLIT ? featureAt(rel, 3) : f2; };
for (const a of facts.keys()) if (files.get(a).repo === "tovu") files.get(a).feature = featureOf(a);

// Feature graph over real (resolved) edges, type-only and inline import() included (item 4).
const featureEdges = new Map(); const crossEdges = new Map(); // abs -> Set(other feature)
for (const a of mainFiles) {
  const fa = files.get(a).feature; if (!featureEdges.has(fa)) featureEdges.set(fa, new Set());
  for (const e of fileEdges.get(a) ?? []) {
    if (e.target !== "tovu" || !e.to || files.get(e.to).role !== "main") continue;
    const fb = files.get(e.to).feature; if (fb === fa) continue;
    featureEdges.get(fa).add(fb);
    // The per-file cycle trigger uses value edges only: a type-only edge into a partner feature is
    // no runtime coupling (pilot DE #5, media card hooks). Features/SCCs keep type edges for batching.
    if (e.typeOnly || e.kind === "importType") continue;
    if (!crossEdges.has(a)) crossEdges.set(a, new Set()); crossEdges.get(a).add(fb);
  }
}
// Tarjan SCC (iterative). Tarjan emits SCCs in reverse topological order: dependencies first = leaf-first.
function tarjan(nodes, succ) {
  let index = 0; const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  for (const start of nodes) {
    if (idx.has(start)) continue;
    const work = [[start, [...(succ.get(start) ?? [])], 0]]; idx.set(start, index); low.set(start, index); index++; stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1]; const [v, next] = frame;
      if (frame[2] < next.length) {
        const w = next[frame[2]++];
        if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w); work.push([w, [...(succ.get(w) ?? [])], 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === idx.get(v)) { const comp = []; let w; do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v); out.push(comp.sort()); }
      }
    }
  }
  return out;
}
const features = [...new Set(mainFiles.map((a) => files.get(a).feature))].sort();
const sccs = tarjan(features, featureEdges);
const sccOf = new Map(); sccs.forEach((c, i) => c.forEach((ft) => sccOf.set(ft, i)));
/** Composition roots and shared contracts fold most features into one big SCC, so SCC membership
 * alone is no Tier 2 signal. The trigger is a DIRECT mutual edge between two features (canary-2
 * S5: vendor-credentials <-> source-control), ignoring parent/child folders of one split feature. */
const related = (a, b) => { const pa = a.replace(/\/\(src\)$/, ""), pb = b.replace(/\/\(src\)$/, ""); return pa.startsWith(`${pb}/`) || pb.startsWith(`${pa}/`); };
const mutual = (a, b) => a !== b && !!featureEdges.get(a)?.has(b) && !!featureEdges.get(b)?.has(a) && !related(a, b);

// ---------------------------------------------------------------------------------------------
// Twins: MinHash + LSH over body fingerprints (Tovu<->Jini and Tovu<->Tovu, any name), plus exact
// type-shape hashes. Jini<->Jini pairs are not reported.
// ---------------------------------------------------------------------------------------------
const SEEDS = Array.from({ length: MINHASH_N }, (_, i) => Math.imul(0x9e3779b1, i + 1) >>> 0);
// Scope of a pair, by the non-Tovu side: Jini fixtures are reported apart and never trigger Tier 2.
const scopeOf = (abs) => abs.startsWith(JINI) ? (files.get(abs).fixture ? "tovu-jini-fixture" : "tovu-jini") : "tovu-tovu";
const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const units = [];
for (const [abs, f] of facts) {
  const info = files.get(abs); if (info.role !== "main" && info.role !== "jini") continue;
  for (const u of f.units) if (u.statements >= MIN_UNIT_STATEMENTS && u.shingles.length >= MIN_UNIT_SHINGLES) units.push({ abs, u });
}
function jaccard(a, b) {
  let i = 0, j = 0, inter = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { inter++; i++; j++; } else if (a[i] < b[j]) i++; else j++; }
  return inter / (a.length + b.length - inter);
}
// Spot-check aid: --explain "<path>#<unit>,<path>#<unit>" prints the body Jaccard of two units.
if (arg("--explain")) {
  const find = (ref) => { const [p, n] = ref.split("#"); for (const [abs, f] of facts) if (display(abs) === p) return f.units.find((u) => u.name === n); return null; };
  const [a, b] = arg("--explain").split(",").map(find);
  console.log("explain:", a ? `${a.statements} stmts/${a.shingles.length} shingles` : "missing", b ? `${b.statements} stmts/${b.shingles.length} shingles` : "missing",
    a && b ? `jaccard ${jaccard(a.shingles, b.shingles).toFixed(2)}` : "");
  process.exit(0);
}
const buckets = new Map(); const rows = MINHASH_N / LSH_BANDS;
units.forEach((x, ui) => {
  const sig = new Uint32Array(MINHASH_N).fill(0xffffffff);
  for (const s of x.u.shingles) for (let k = 0; k < MINHASH_N; k++) { const h = fmix(s ^ SEEDS[k]); if (h < sig[k]) sig[k] = h; }
  for (let b = 0; b < LSH_BANDS; b++) { const key = `${b}:${sig.slice(b * rows, b * rows + rows).join(",")}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(ui); }
});
const twinPairs = []; const seenPair = new Set(); let skippedBuckets = 0; let suppressedSamePort = 0; let suppressedSameIface = 0; let droppedConstDiff = 0;
// Tovu importers of any file (Tovu or Jini target): "shared caller" test for class-name twins (judge 2 #4).
const tovuImportersOf = new Map();
for (const [abs, edges] of fileEdges) for (const e of edges) if (e.to) { if (!tovuImportersOf.has(e.to)) tovuImportersOf.set(e.to, new Set()); tovuImportersOf.get(e.to).add(abs); }
// Jini files reachable from a package.json `exports` entry (through re-exports and `export *`): the
// PUBLIC surface (judge 1 #2/#3: compare against exported entries; mark private counterparts).
const jiniPublic = new Set();
{
  const q = [];
  for (const [name, pkg] of jiniPkgs) for (const k of Object.keys(pkg.exports ?? {})) { if (k.includes("*") || !k.startsWith(".")) continue; const a = resolveJini(`${name}${k.slice(1)}`); if (a) q.push(a); }
  while (q.length) { const a = q.pop(); if (jiniPublic.has(a)) continue; jiniPublic.add(a); const f = facts.get(a); if (!f) continue;
    for (const sp of [...f.stars, ...[...f.reexports.values()].map((r) => r.spec)]) { const t = resolveSpec(a, sp); if (t.kind === "file") q.push(t.abs); } }
}
for (const members of buckets.values()) {
  if (members.length < 2) continue;
  if (members.length > LSH_BUCKET_CAP) { skippedBuckets++; continue; }
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const A = units[members[i]], B = units[members[j]];
    const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
    if (ra === "jini" && rb === "jini") continue;
    if (A.abs === B.abs) continue; // same-file repeats are local idioms, not extraction duplicates
    // A class pair already shows its methods; skip method-vs-class mixes.
    if ((A.u.kind === "class") !== (B.u.kind === "class")) continue;
    const key = members[i] < members[j] ? `${members[i]}|${members[j]}` : `${members[j]}|${members[i]}`;
    if (seenPair.has(key)) continue; seenPair.add(key);
    const la = A.u.shingles.length, lb = B.u.shingles.length;
    if (Math.min(la, lb) / Math.max(la, lb) < TWIN_REPORT) continue; // Jaccard bound
    const sim = jaccard(A.u.shingles, B.u.shingles);
    if (sim < TWIN_REPORT) continue;
    const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
    twinPairs.push({ kind: "body", a: display(X.abs), aUnit: X.u.name, aLine: X.u.line, b: display(Y.abs), bUnit: Y.u.name, bLine: Y.u.line,
      sim: +sim.toFixed(2), sameName: X.u.name.split(".").pop().split(">").pop() === Y.u.name.split(".").pop().split(">").pop(), scope: scopeOf(Y.abs),
      stmts: Math.min(X.u.statements, Y.u.statements) });
  }
}
// Class APIs, Tovu<->Jini only. (a) method/property-name Jaccard >= 0.6 (>= 5 members): mostly a
// Tovu SQL repo implementing the same port as a Jini in-memory repo, sometimes a diverged sibling
// whose bodies differ too much for the fingerprint (canary-2 vault-adapter vs CredentialSetVaultRepo:
// body 0.08). (b) API fingerprint: public method names >= 0.5 AND callee-name set >= 0.5 (>= 3
// public methods): a restructured copy keeps its public surface and the calls it makes even when
// fields and private helpers moved (pilot ABC #3: keyring.memory 0.04 by body).
{
  const classes = [];
  for (const [abs, f] of facts) { const info = files.get(abs); if (info.role !== "main" && info.role !== "jini") continue;
    for (const u of f.units) if (u.kind === "class" && (u.methods?.length >= 5 || u.publicMethods?.length >= 3)) classes.push({ abs, u, set: new Set(u.methods), pub: new Set(u.publicMethods), calls: new Set(u.calls) }); }
  const jac = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
  const tovuC = classes.filter((c) => files.get(c.abs).repo === "tovu"), jiniC = classes.filter((c) => files.get(c.abs).repo === "jini");
  for (const A of tovuC) for (const B of jiniC) {
    const sim = A.set.size >= 5 && B.set.size >= 5 && Math.min(A.set.size, B.set.size) / Math.max(A.set.size, B.set.size) >= 0.6 ? jac(A.set, B.set) : 0;
    const api = A.pub.size >= 3 && B.pub.size >= 3 ? Math.min(jac(A.pub, B.pub), jac(A.calls, B.calls)) : 0;
    if (sim < 0.6 && api < 0.5) continue;
    // v4 (judge 2 #5): two implementers of the SAME port (Sql*Repo <-> InMemory*Repo) share a method list by
    // contract, not by copy. Also the cross pairs (Role <-> Policy) of one port family: same interface root.
    const ifaces = (c) => new Set(c.u.implements?.map((n) => { const o = resolveBinding(c.abs, n); return o ? originLabel(o) : n.replace(/(Repo|Repository|Port|Store)$/, ""); }) ?? []);
    const ia = ifaces(A), ib = ifaces(B); if ([...ia].some((x) => ib.has(x))) { suppressedSameIface++; continue; }
    twinPairs.push({ kind: sim >= 0.6 ? "class-api" : "class-fingerprint", a: display(A.abs), aUnit: A.u.name, aLine: A.u.line, b: display(B.abs), bUnit: B.u.name, bLine: B.u.line,
      sim: +Math.max(sim, api).toFixed(2), sameName: A.u.name === B.u.name, scope: scopeOf(B.abs), members: Math.min(A.pub.size, B.pub.size) });
  }
}
// Exact small bodies (< MIN_UNIT_STATEMENTS), only when one side is Jini: identical text is a copy
// however short (pilot ABC #3: openSqliteSnapshot, safeHref). Tovu<->Tovu one-liners stay noise.
{
  const byText = new Map();
  for (const [abs, f] of facts) { const info = files.get(abs); if (info.role !== "main" && info.role !== "jini") continue;
    for (const u of f.units) if (u.smallText) { if (!byText.has(u.smallText)) byText.set(u.smallText, []); byText.get(u.smallText).push({ abs, u }); } }
  for (const [text, list] of byText) {
    // v3: identityReposFrom has 3 Tovu + 1 Jini identical bodies (bucket 4 > 3 dropped them all). A long
    // identical body (>= 120 chars) is distinctive enough for 6 sites. Tovu<->Tovu exact copies are
    // reported too (createMemberAccessResolver x3); they stay report-only (isStrongTwin).
    if (list.length < 2 || list.length > (text.length >= 120 ? NAME_TWIN_MAX_SITES : SMALL_EXACT_BUCKET_CAP)) continue;
    // v4: >= 3 statements or a long body (one-statement appendRevision / ValidationError ctor were noise).
    if (list[0].u.statements < EXACT_SMALL_MIN_STMTS && text.length < EXACT_SMALL_LONG_CHARS) continue;
    for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
      const X = list[i], Y = list[j]; const rx = files.get(X.abs).repo, ry = files.get(Y.abs).repo;
      if (rx !== "tovu" || X.abs === Y.abs || (ry === "tovu" && j <= i)) continue;
      twinPairs.push({ kind: "exact-small", a: display(X.abs), aUnit: X.u.name, aLine: X.u.line, b: display(Y.abs), bUnit: Y.u.name, bLine: Y.u.line,
        sim: 1, sameName: X.u.name === Y.u.name, scope: scopeOf(Y.abs), stmts: X.u.statements, chars: X.u.smallText.length });
    }
  }
}
// Unit-level pairs already reported, so the name/shape passes below do not repeat them.
const pairedUnits = new Set(); const unitKey = (a, u, b, v) => [`${a}#${u}`, `${b}#${v}`].sort().join("|");
const markPaired = () => { for (const p of twinPairs) pairedUnits.add(unitKey(p.a, p.aUnit, p.b, p.bUnit)); };
markPaired();
// Small structural twins (identifier-agnostic, any name): same node-kind sequence, >= SMALL_KINDS_MIN nodes.
{
  const byKinds = new Map();
  for (const [abs, f] of facts) { const info = files.get(abs); if (info.role !== "main" && info.role !== "jini") continue;
    for (const u of f.units) if (u.kindsKey) { if (!byKinds.has(u.kindsKey)) byKinds.set(u.kindsKey, []); byKinds.get(u.kindsKey).push({ abs, u }); } }
  for (const list of byKinds.values()) {
    if (list.length < 2 || list.length > SMALL_KINDS_BUCKET_CAP) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j]; const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
      if ((ra === "jini" && rb === "jini") || A.abs === B.abs) continue;
      const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
      if (pairedUnits.has(unitKey(display(X.abs), X.u.name, display(Y.abs), Y.u.name))) continue;
      twinPairs.push({ kind: "small-shape", a: display(X.abs), aUnit: X.u.name, aLine: X.u.line, b: display(Y.abs), bUnit: Y.u.name, bLine: Y.u.line,
        sim: 0.9, sameName: X.u.name === Y.u.name, scope: scopeOf(Y.abs), stmts: X.u.statements });
    }
  }
  markPaired();
}
// Same-name twins, exported OR NOT, Tovu<->Tovu and Tovu<->Jini (round-2 judge 1 #2, judge 3 #2/#3):
// fetchWithTimeout (Tovu private vs Jini exported), includeIfDefined x2, identityReposFrom (private
// Jini copy). Scored by body Jaccard, exact small text, or kinds; otherwise reported as name-only (sim 0).
{
  const byName = new Map();
  for (const [abs, f] of facts) { const info = files.get(abs); if ((info.role !== "main" && info.role !== "jini") || info.helper || info.fixture) continue;
    for (const u of f.units) if ((u.kind === "fn" || u.kind === "class") && !u.closure && u.name.length >= NAME_TWIN_MIN_LEN && !/^(default|register\w*Routes?|handler|main|render|create(Router|App)|use[A-Z]\w{0,6})$/.test(u.name)) {
      if (!byName.has(u.name)) byName.set(u.name, []); byName.get(u.name).push({ abs, u }); } }
  for (const [name, list] of byName) {
    if (list.length < 2 || list.length > NAME_TWIN_MAX_SITES || !list.some((x) => files.get(x.abs).repo === "tovu")) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j]; const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
      if ((ra === "jini" && rb === "jini") || A.abs === B.abs) continue;
      const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
      if (pairedUnits.has(unitKey(display(X.abs), name, display(Y.abs), name))) continue;
      // v4: normalised text (renamed params/locals) counts as identical (judge 3 #8: withoutKey sim 0).
      const sim = (X.u.smallText && X.u.smallText === Y.u.smallText) || (X.u.norm && X.u.norm === Y.u.norm) ? 1 : X.u.kindsKey && X.u.kindsKey === Y.u.kindsKey ? 0.9
        : X.u.shingles.length >= 10 && Y.u.shingles.length >= 10 ? jaccard(X.u.shingles, Y.u.shingles) : 0;
      // Class-name twins need a shared caller (judge 2 #4: ValidationError in site-dir vs db restore-points).
      if (X.u.kind === "class" || Y.u.kind === "class") { const ia = tovuImportersOf.get(X.abs) ?? new Set(); if (![...(tovuImportersOf.get(Y.abs) ?? [])].some((x) => ia.has(x))) continue; }
      // A Jini counterpart must be exported unless the body is a real copy (judge 1 #3 vs judge 2 #3:
      // private Jini copies like loadDocumentBytes count only at sim >= 0.6).
      if (files.get(Y.abs).repo === "jini" && !Y.u.exported && sim < TWIN_REPORT) continue;
      // A shared name with a different body says nothing (exported pairs stay in jiniSameName), except a
      // PRIVATE Tovu function named like a Jini EXPORT: a local re-implementation of a public Jini API
      // (round-2 judge 3 #2: host-kit's fetchWithTimeout vs @jini-ai/platform fetchWithTimeout).
      if (sim < 0.3 && !(files.get(Y.abs).repo === "jini" && !X.u.exported && Y.u.exported)) continue;
      twinPairs.push({ kind: "same-name", a: display(X.abs), aUnit: name, aLine: X.u.line, b: display(Y.abs), bUnit: name, bLine: Y.u.line,
        sim: +sim.toFixed(2), sameName: true, scope: scopeOf(Y.abs), stmts: Math.min(X.u.statements, Y.u.statements), exported: [X.u.exported, Y.u.exported] });
    }
  }
  markPaired();
}
// Constant values (round-2 judge 1 #2, judge 3 #2): Tovu const == a Jini EXPORTED const by value
// (distinctive: >= 8 chars of value text, or an object), or a same-name const.
// v4 (judge 2 #4, judge 3 #7): a const twin needs an EQUAL value (normalised quotes); a same-name const
// with a different value (MAX_FIELD_LENGTH 2048 vs 64, SCRYPT_KEYLEN, LOAD_FAILED) is dropped. The
// counterpart must be exported. Tovu<->Tovu: same name + equal value, or an equal regex / long string
// (SITE_NAME_PATTERN admin <-> server). Const twins are report-only: they never lift a tier.
{
  const byVal = new Map(); const byConstName = new Map();
  for (const [abs, f] of facts) { const info = files.get(abs); if ((info.role !== "main" && info.role !== "jini") || info.fixture) continue;
    for (const c of f.constVals) {
      if (info.repo === "jini" && !c.exported) continue;
      if (c.val.length >= 8 || c.obj) { if (!byVal.has(c.val)) byVal.set(c.val, []); byVal.get(c.val).push({ abs, c }); }
      if (c.name.length >= NAME_TWIN_MIN_LEN && /[A-Z_]{4}/.test(c.name)) { if (!byConstName.has(c.name)) byConstName.set(c.name, []); byConstName.get(c.name).push({ abs, c }); }
    } }
  const emit = (A, B, how) => {
    const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
    if (A.abs === B.abs || (ra === "jini" && rb === "jini")) return;
    const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
    if (X.c.val !== Y.c.val) { droppedConstDiff++; return; }
    // Tovu<->Tovu equal values are mostly idioms (60_000): only a shared name, a regex or a long string.
    if (files.get(Y.abs).repo !== "jini" && !(X.c.name === Y.c.name || X.c.re || (X.c.str && X.c.val.length >= 20))) return;
    const k = unitKey(display(X.abs), X.c.name, display(Y.abs), Y.c.name); if (pairedUnits.has(k)) return; pairedUnits.add(k);
    twinPairs.push({ kind: "const-value", a: display(X.abs), aUnit: X.c.name, aLine: X.c.line, b: display(Y.abs), bUnit: Y.c.name, bLine: Y.c.line,
      sim: 1, sameName: X.c.name === Y.c.name, scope: scopeOf(Y.abs), how });
  };
  for (const list of byVal.values()) if (list.length >= 2 && list.length <= SMALL_EXACT_BUCKET_CAP) for (const A of list) for (const B of list) if (A !== B && files.get(A.abs).repo === "tovu") emit(A, B, "value");
  for (const list of byConstName.values()) if (list.length >= 2 && list.length <= NAME_TWIN_MAX_SITES) for (const A of list) for (const B of list) if (A !== B && files.get(A.abs).repo === "tovu") emit(A, B, "name");
}
// v4 normalised-text twins (judge 3 #3/#8, judge 1 #7): identical bodies once declared identifiers are
// renamed, any name, Tovu<->Tovu across admin/desktop/website (route files included) and Tovu<->Jini.
// Same-file pairs (readSiteAssistant <-> readAdminByok) come from the full kind sequence instead: in one
// file they read different constants, so only the node-kind sequence matches.
{
  const byNorm = new Map(); const byKindsSameFile = new Map();
  for (const [abs, f] of facts) { const info = files.get(abs); if ((info.role !== "main" && info.role !== "jini") || info.helper) continue;
    for (const u of f.units) {
      if (u.norm && !u.closure) { if (!byNorm.has(u.norm)) byNorm.set(u.norm, []); byNorm.get(u.norm).push({ abs, u }); }
      if (info.repo === "tovu" && u.kindsAll && u.statements >= 2) { const k = `${abs}\0${u.kindsAll}`; if (!byKindsSameFile.has(k)) byKindsSameFile.set(k, []); byKindsSameFile.get(k).push({ abs, u }); }
    } }
  for (const list of byNorm.values()) {
    if (list.length < 2 || list.length > NORM_BUCKET_CAP || !list.some((x) => files.get(x.abs).repo === "tovu")) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j]; const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
      if (ra === "jini" && rb === "jini") continue;
      const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
      if (pairedUnits.has(unitKey(display(X.abs), X.u.name, display(Y.abs), Y.u.name))) continue;
      twinPairs.push({ kind: "norm-body", a: display(X.abs), aUnit: X.u.name, aLine: X.u.line, b: display(Y.abs), bUnit: Y.u.name, bLine: Y.u.line,
        sim: 1, sameName: X.u.name === Y.u.name, scope: scopeOf(Y.abs), stmts: X.u.statements, ...(files.get(Y.abs).repo === "jini" ? { jiniPublic: jiniPublic.has(Y.abs) && Y.u.exported } : {}), ...(X.abs === Y.abs ? { sameFile: true } : {}) });
    }
  }
  markPaired();
  for (const list of byKindsSameFile.values()) {
    if (list.length < 2 || list.length > 4) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const X = list[i], Y = list[j]; if (pairedUnits.has(unitKey(display(X.abs), X.u.name, display(Y.abs), Y.u.name))) continue;
      twinPairs.push({ kind: "same-file", a: display(X.abs), aUnit: X.u.name, aLine: X.u.line, b: display(Y.abs), bUnit: Y.u.name, bLine: Y.u.line, sim: 0.9, sameName: false, scope: "tovu-tovu", stmts: X.u.statements, sameFile: true });
    }
  }
  markPaired();
}
// Constant string sets (exported or not): the same >= 3 strings as an array/Set in two places is a
// duplicated enum the body fingerprint cannot see (pilot ABC #3, consent enums). Exact set equality.
{
  const bySet = new Map();
  for (const [abs, f] of facts) { const info = files.get(abs); if (info.role !== "main" && info.role !== "jini") continue;
    for (const c of f.constSets) { if (!bySet.has(c.key)) bySet.set(c.key, []); bySet.get(c.key).push({ abs, c }); } }
  for (const list of bySet.values()) {
    if (list.length < 2 || list.length > SHAPE_BUCKET_CAP) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j]; const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
      if ((ra === "jini" && rb === "jini") || A.abs === B.abs) continue;
      const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
      twinPairs.push({ kind: "const-set", a: display(X.abs), aUnit: X.c.name, aLine: X.c.line, b: display(Y.abs), bUnit: Y.c.name, bLine: Y.c.line,
        sim: 1, sameName: X.c.name === Y.c.name, scope: scopeOf(Y.abs), members: X.c.size });
    }
  }
}
// Type shapes: exact strict hash (score 1.0) or names-only hash (score 0.8).
for (const [field, score] of [["strict", 1], ["loose", 0.8]]) {
  const byHash = new Map();
  for (const [abs, f] of facts) {
    const info = files.get(abs); if (info.role !== "main" && info.role !== "jini") continue;
    for (const s of f.shapes) if (s[field]) { if (!byHash.has(s[field])) byHash.set(s[field], []); byHash.get(s[field]).push({ abs, s }); }
  }
  for (const list of byHash.values()) {
    if (list.length < 2 || list.length > SHAPE_BUCKET_CAP) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j]; const ra = files.get(A.abs).repo, rb = files.get(B.abs).repo;
      if ((ra === "jini" && rb === "jini") || A.abs === B.abs) continue;
      if (score < 1 && A.s.strict === B.s.strict) continue; // already reported as strict
      const [X, Y] = ra === "tovu" ? [A, B] : [B, A];
      twinPairs.push({ kind: field === "strict" ? "shape" : "shape-names", a: display(X.abs), aUnit: X.s.name, aLine: X.s.line, b: display(Y.abs), bUnit: Y.s.name, bLine: Y.s.line,
        sim: score, sameName: X.s.name === Y.s.name, scope: scopeOf(Y.abs), members: X.s.size });
    }
  }
}
// Wiring twins: two Tovu files build the same Jini host object (same origin + label) with nearly
// the same key set (canary-2 S3: credentialVault vs createTovuStoreVault both build a
// SecretsVaultService; their bodies differ too much for the body fingerprint, Jaccard 0.28).
const hostSites = new Map();
for (const abs of mainFiles) for (const h of facts.get(abs).hostObjects) {
  const o = resolveBinding(abs, h.root); if (!isJiniOrigin(o)) continue;
  const k = `${originLabel(o)} :: ${h.label.replace(/<.*>/s, "")}`;
  if (!hostSites.has(k)) hostSites.set(k, []); hostSites.get(k).push({ abs, ...h });
}
for (const [k, sites] of hostSites) {
  // A host built at >6 sites is a common API (registration kits, secret cards), not duplicated wiring.
  if (sites.length < 2 || sites.length > 6) continue;
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    const A = sites[i], B = sites[j]; if (A.abs === B.abs) continue;
    const sa = new Set(A.keys); const inter = B.keys.filter((x) => sa.has(x)).length;
    const sim = inter / (A.keys.length + B.keys.length - inter);
    if (sim < TWIN_REPORT) continue;
    // Same keys with different VALUES is the factory's option list, not copied wiring: require the
    // key=value texts to overlap too (pilot DE #6, ABC #8).
    const va = new Set(A.vals); const vInter = B.vals.filter((x) => va.has(x)).length;
    if (vInter / (A.vals.length + B.vals.length - vInter) < 0.5) continue;
    twinPairs.push({ kind: "wiring", a: display(A.abs), aUnit: k.split(" :: ")[0].split("#").pop(), aLine: A.line, b: display(B.abs), bUnit: k.split(" :: ")[0].split("#").pop(), bLine: B.line,
      sim: +sim.toFixed(2), sameName: false, scope: "tovu-tovu", members: Math.min(A.keys.length, B.keys.length) });
  }
}
const twinsByFile = new Map(); const shapePartners = new Map();
function indexTwins() { // run after the port-edge pass has dropped same-port pairs
  for (const p of twinPairs) for (const [side] of [[p.a, p.b], [p.b, p.a]]) {
    if (side.startsWith("jini:")) continue;
    if (!twinsByFile.has(side)) twinsByFile.set(side, []);
    twinsByFile.get(side).push({ ...p, self: side === p.a ? `${p.aUnit}@${p.aLine}` : `${p.bUnit}@${p.bLine}`, other: side === p.a ? `${p.b}#${p.bUnit}@${p.bLine}` : `${p.a}#${p.aUnit}@${p.aLine}` });
  }
  for (const p of twinPairs) if (p.kind === "shape" && !p.sameName) shapePartners.set(`${p.a}#${p.aUnit}`, (shapePartners.get(`${p.a}#${p.aUnit}`) ?? 0) + 1);
}
/** Which twins promote a file to Tier 2. Tovu<->Tovu body twins need near-identity and size, else
 * route boilerplate (registerAdmin*Route x100) floods Tier 2. Same-name type twins are DEDUPE
 * candidates a Tier 1 read handles (canary-2: the same-name trigger over-promoted); the
 * different-name ones are what a name match cannot see. Names-only shapes are report-only. */
function isStrongTwin(p) {
  if (p.scope === "tovu-jini-fixture") return false;
  if (p.kind === "body") return p.scope === "tovu-jini" ? p.sim >= TWIN_STRONG : p.sim >= TWIN_STRONG_TT && p.stmts >= TWIN_STRONG_TT_STMTS;
  // Identical code or an identical enum shared with Jini is a copy, however small.
  // (A copied `sleep`/`byteLength` one-liner is reported but too small to lift a file: >= 60 chars.)
  if (p.kind === "exact-small") return p.scope === "tovu-jini" && p.chars >= 60;
  if (p.kind === "const-set") return p.scope === "tovu-jini";
  // v3 twin kinds: a same-name Tovu<->Jini body at >= 0.75, or the same named constant with the same
  // value, is a copy. Small-shape and Tovu<->Tovu same-name pairs are dedupe candidates (report-only).
  if (p.kind === "same-name") return p.scope === "tovu-jini" && p.sim >= TWIN_STRONG;
  // v4 (judge 2 #4): a const twin never lifts a tier (TOKEN_BYTES, MAX_NAME_LENGTH, NODE_TIMERS).
  if (p.kind === "const-value") return false;
  if (p.kind === "norm-body") return p.scope === "tovu-jini" || (p.stmts >= TWIN_STRONG_TT_STMTS && !p.sameFile);
  // A Tovu type that matches >2 differently named types is a common idiom shape ({ id, module,
  // source }), not a twin. Wiring twins are report-only: shared keys are often just the API's fields.
  if (p.kind === "shape") return !p.sameName && (p.scope === "tovu-jini" || p.members >= 4) && (shapePartners.get(`${p.a}#${p.aUnit}`) ?? 0) <= 2;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Jini export index (same-name exports, R2) and Jini literal index (private formats, item 3).
// ---------------------------------------------------------------------------------------------
const jiniExportIndex = new Map(); // name -> [{ abs, unit? }]
const jiniLitFiles = new Map();    // literal/segment -> Set(abs)
const jiniFormats = [];            // { pattern, head, abs, line, symbol, exported }
const jiniPhraseFiles = new Map(); // Jini wording >= 12 chars -> Set(abs) (pilot DE #4)
for (const [abs, f] of facts) {
  if (files.get(abs).repo !== "jini" || files.get(abs).helper) continue;
  for (const ph of f.jiniLits?.phrases ?? []) { if (!jiniPhraseFiles.has(ph)) jiniPhraseFiles.set(ph, new Set()); jiniPhraseFiles.get(ph).add(abs); }
  for (const name of f.localExports.keys()) {
    if (!jiniExportIndex.has(name)) jiniExportIndex.set(name, []);
    jiniExportIndex.get(name).push({ abs, unit: f.units.find((u) => u.name === name), shape: f.shapes.find((s) => s.name === name) });
  }
  for (const lit of f.jiniLits?.all ?? []) { if (!jiniLitFiles.has(lit)) jiniLitFiles.set(lit, new Set()); jiniLitFiles.get(lit).add(abs); }
  for (const fm of f.jiniLits?.formats ?? []) jiniFormats.push({ ...fm, head: fm.pattern.split("${}")[0], abs });
}
const formatByPattern = new Map(); for (const fm of jiniFormats) { if (!formatByPattern.has(fm.pattern)) formatByPattern.set(fm.pattern, []); formatByPattern.get(fm.pattern).push(fm); }
// A prefix is only meaningful if it is distinctive: heads used in >10 Jini files are generic.
const headFiles = new Map(); for (const fm of jiniFormats) if (fm.head.length >= 6 && fm.head.endsWith(":")) { if (!headFiles.has(fm.head)) headFiles.set(fm.head, new Map()); headFiles.get(fm.head).set(fm.abs, fm); }
const distinctiveHead = (head) => { const h = head.split(":")[0]; return /[-_.]/.test(h) || h.length >= 8 || head.split(":").filter(Boolean).length >= 2; };
function matchFormat(pattern) {
  const exact = formatByPattern.get(pattern);
  if (exact?.length && distinctiveHead(pattern.split("${}")[0])) return { match: "exact", fm: exact[0] };
  // Prefix: only distinctive heads ("plugin-state:", "secrets_vault:"); "event:" or "order:" are
  // words every codebase uses.
  for (const [head, byFile] of headFiles) if (byFile.size <= 10 && distinctiveHead(head) && pattern.startsWith(head)) return { match: "prefix", fm: [...byFile.values()][0] };
  // Segments: every colon segment is a string literal in ONE Jini file, one of them distinctive.
  const segs = pattern.split(/:|\$\{\}/).filter(Boolean);
  if (segs.length < 2) return null;
  const sets = segs.map((s) => jiniLitFiles.get(s) ?? new Set());
  if (!segs.some((s, i) => s.length >= 5 && sets[i].size > 0 && sets[i].size <= 10)) return null;
  const common = [...sets[0]].filter((a) => sets.every((s) => s.has(a)));
  if (!common.length || common.length > 3) return null;
  const abs = common[0]; const fm = jiniFormats.find((x) => x.abs === abs && segs.some((s) => x.pattern.includes(s)));
  return { match: "segments", fm: fm ?? { abs, line: null, symbol: null, exported: null, pattern: segs.join("|") } };
}

// String couplings beyond `x:y` formats (pilot DE #4): event names, path.join literals, template
// contents and wording Tovu compares/parses. Only Jini strings in few files count (distinctive).
const phraseList = [...jiniPhraseFiles.entries()].filter(([, set]) => set.size <= 5);
// First run's noise, now excluded: DOM/Electron events without a namespace (pointermove,
// visibilitychange), CSS declarations (display:flex) and SQL column names (principal_id) inside
// templates, well-known file names (package.json), and ids compared with === (shared enum values,
// not wording: 'api-connection', 'observability').
const CSS_DECL_RE = /^(display|position|color|background|width|height|margin|padding|border|font|overflow|cursor|opacity|flex|grid|align|justify|z-index|top|left|right|bottom|transform|transition|white-space|text|line-height|gap|box-sizing|visibility|pointer-events|content|min|max|outline|inset|fill|stroke)[\w-]*:/;
const WELL_KNOWN_FILES = new Set(["package.json", "config.json", "plugin.json", "manifest.json", "tsconfig.json", "index.html", "index.js", "index.ts", "content.db", "README.md"]);
function matchCoupling(c) {
  const lit = (t, cap) => { const set = jiniLitFiles.get(t); return set && set.size <= cap ? [...set] : null; };
  let hit = null; const t = c.text;
  if (c.kind === "event") hit = /[:.]/.test(t) ? lit(t, 10) : /-/.test(t) ? lit(t, 3) : null;
  else if (c.kind === "path") { if (t.includes("/") && !WELL_KNOWN_FILES.has(t)) hit = lit(t, 10); const leaf = t.split("/").pop(); if (!hit && leaf.length >= 10 && /-/.test(leaf) && !WELL_KNOWN_FILES.has(leaf)) hit = lit(leaf, 5); }
  else if (c.kind === "template") hit = /^[./#]|[:.]/.test(t) && !/^[a-z]+(_[a-z]+)+$/.test(t) && !CSS_DECL_RE.test(t) && t.length >= 6 ? lit(t, 5) : null;
  else {
    // Wording only: a phrase/regex operand needs a space or >= 20 chars (ids are enum values).
    if (!/\s/.test(t.trim()) && t.length < 20) return null;
    // v4: a regex operand must MATCH the Jini phrase (anchors and all), not just share a run of text.
    let rx = null; if (c.re) { try { rx = new RegExp(c.re.src, c.re.flags.replace(/[gy]/g, "")); } catch { rx = null; } }
    const ok = (ph) => !rx || rx.test(ph);
    const exact = jiniPhraseFiles.get(t);
    if (exact && exact.size <= 5 && ok(t)) hit = [...exact];
    else { const m = phraseList.find(([ph]) => ph.includes(t) && ok(ph)); if (m) hit = [...m[1]]; }
  }
  return hit ? { jini: display(hit[0]), jiniFiles: hit.length } : null;
}

// ---------------------------------------------------------------------------------------------
// LEGACY-TWIN pre-pass (pilot DE #1, the main miss of slice E): a Tovu feature folder or file whose
// NAME matches a Jini module (admin/features/media <-> @jini-ai/admin/media; assistant-run-finalizer
// <-> chat/server/run-finalizer) and whose BEHAVIOUR matches (Jaccard over string literals, called
// names and property names, private closures included), or that a Tovu host file already mounts.
// Body and name similarity cannot see restructured siblings (media scored 0.07/0.11 by body).
// ---------------------------------------------------------------------------------------------
const behDf = new Map(); let behN = 0;
const behFile = (abs) => { const i = files.get(abs); return i.role === "main" || (i.role === "jini" && !i.fixture); };
for (const [abs, f] of facts) { if (!behFile(abs)) continue; behN++; for (const t of f.beh) behDf.set(t, (behDf.get(t) ?? 0) + 1); }
const behMax = Math.max(3, Math.floor(behN * BEH_MAX_DF_SHARE));
const behOf = (list) => { const out = new Set(); for (const a of list) for (const t of facts.get(a).beh) if (behDf.get(t) <= behMax) out.add(t); return out; };
const kebab = (s) => s.replace(/\.[^.]+$/, "").replace(/\.(hooks|types|store|routes|service)$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
// Folder/file names that every package has: matching on them says nothing.
const GENERIC_NAMES = new Set(["index", "types", "type", "utils", "util", "lib", "server", "client", "react", "core", "src", "components", "hooks", "ui", "api",
  "routes", "shared", "common", "internal", "node", "browser", "config", "constants", "helpers", "store", "state", "model", "models", "schema", "contracts",
  "features", "pages", "app", "main", "adapters", "plugins", "providers", "services", "data", "assets", "styles", "views", "cli", "http", "db", "errors",
  "events", "logger", "tools", "runtime", "domain", "ports", "port", "service", "module", "modules", "registry", "context", "testing", "memory", "sqlite",
  "postgres", "shell", "panels", "settings", "admin", "public", "web", "main", "desktop", "website", "platform", "infra", "inbound", "composition", "kit", "migrations", "fixtures", "lifecycle"]);
function moduleIndex(list, rootOf) {
  const mods = new Map(); // key -> { key, name, files: [] }
  for (const abs of list) {
    const rel = files.get(abs).rel; const root = rootOf(rel); if (!root) continue;
    const add = (key, name) => { if (!mods.has(key)) mods.set(key, { key, name, files: [], root }); mods.get(key).files.push(abs); };
    add(rel, kebab(path.basename(rel)));
    const parts = rel.slice(root.length).split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) add(`${root}${parts.slice(0, i).join("/")}/`, kebab(parts[i - 1]));
  }
  return mods;
}
const tovuMods = moduleIndex(mainFiles, (rel) => (/^(apps\/[^/]+\/src\/|packages\/[^/]+\/src\/)/.exec(rel) ?? [])[0] ?? null);
const jiniMods = moduleIndex([...facts.keys()].filter((a) => files.get(a).repo === "jini" && !files.get(a).fixture), (rel) => (/^packages\/[^/]+\/src\//.exec(rel) ?? [])[0]);
const jiniImporters = new Map(); // Jini abs -> [{ imp, line }] (Tovu main importers)
for (const a of mainFiles) for (const e of fileEdges.get(a) ?? []) if (e.to && files.get(e.to).repo === "jini") { if (!jiniImporters.has(e.to)) jiniImporters.set(e.to, []); jiniImporters.get(e.to).push({ imp: a, line: e.line }); }
const jiniByName = new Map(); for (const m of jiniMods.values()) { if (GENERIC_NAMES.has(m.name) || m.name.length < 4) continue; if (!jiniByName.has(m.name)) jiniByName.set(m.name, []); jiniByName.get(m.name).push(m); }
const legacyTwins = []; const legacyByFile = new Map();
{
  const behCache = new Map(); const beh = (m) => { if (!behCache.has(m.key)) behCache.set(m.key, behOf(m.files)); return behCache.get(m.key); };
  for (const tm of tovuMods.values()) {
    if (GENERIC_NAMES.has(tm.name) || tm.name.length < 4) continue;
    // Exact name, or a Tovu-prefixed name (assistant-run-finalizer -> run-finalizer) when the Jini name is compound.
    const cands = [...(jiniByName.get(tm.name) ?? [])];
    for (let i = tm.name.indexOf("-"); i > 0; i = tm.name.indexOf("-", i + 1)) { const tail = tm.name.slice(i + 1); if (tail.includes("-")) cands.push(...(jiniByName.get(tail) ?? [])); }
    if (!cands.length) continue;
    const app = (/^apps\/([^/]+)\//.exec(files.get(tm.files[0]).rel) ?? [])[1];
    for (const jm of cands) {
      const jpkg = jiniPkgOfRel(files.get(jm.files[0]).rel);
      const strongName = /-/.test(jm.name) || jm.name.length >= 8 || (app && jpkg === `@jini-ai/${app}`);
      const jset = new Set(jm.files); const tset = new Set(tm.files);
      // Mount sites: Tovu files OUTSIDE the twin that import the Jini module (modules.hooks.ts mounts it).
      const mounts = []; let inside = 0;
      for (const ja of jm.files) for (const { imp, line } of jiniImporters.get(ja) ?? []) { if (tset.has(imp)) inside++; else mounts.push(`${display(imp)}:${line}`); }
      if (!strongName && !mounts.length) continue;
      // A name that names >3 Jini modules (repo, tool-registrations) identifies nothing on its own.
      if ((jiniByName.get(jm.name)?.length ?? 0) > 3 && !(app && jpkg === `@jini-ai/${app}`)) continue;
      const A = beh(tm), B = beh(jm); if (A.size < 15 || B.size < 15) continue;
      let inter = 0; for (const t of A) if (B.has(t)) inter++;
      const sim = inter / (A.size + B.size - inter);
      // Overlap (shared / smaller side): a folder that grew hooks/ or a Jini module that grew
      // adapters/ dilutes the Jaccard (admin media: Jaccard 0.06, overlap 0.23, 191 shared tokens).
      const overlap = inter / Math.min(A.size, B.size);
      // Spot-check aid: --legacy-debug <name> prints every candidate pair for that module name.
      if (arg("--legacy-debug") === tm.name) console.error("legacy-debug", tm.key, jm.key, JSON.stringify({ sim: +sim.toFixed(3), inter, A: A.size, B: B.size, mounts: mounts.length, inside, strongName }));
      if (inter < LEGACY_MIN_SHARED || (sim < LEGACY_MIN_SIM && overlap < LEGACY_MIN_OVERLAP)) continue;
      // v3 floor: below Jaccard 0.05 only a same-app match (admin -> @jini-ai/admin) stays a twin.
      const sameApp = !!app && jpkg === `@jini-ai/${app}`;
      if (sim < LEGACY_FLOOR && !sameApp) continue;
      // v3 route gate (round-2 judge 1 #1): a Tovu HTTP route folder twins a Jini module only when that
      // module serves HTTP too. Jini cms/trash and integrations/api-connections have no routes, so the
      // trash routes and oauth-callback only CONSUME the Jini service; shared tokens come from that use.
      const tovuRoutes = /\/(routes|inbound)\//.test(tm.key) || /-http\//.test(tm.key);
      if (tovuRoutes && !jm.files.some((ja) => facts.get(ja).httpRoutes)) continue;
      const rec = { tovu: tm.key, jini: `jini:${jm.key}`, jiniPkg: jpkg, sim: +sim.toFixed(2), overlap: +overlap.toFixed(2), shared: inter, files: tm.files.length, mounts: [...new Set(mounts)].slice(0, 5), mountsTotal: new Set(mounts).size, mountsInside: inside,
        // Every Tovu file the label lands on, so a per-batch slice of legacy-twins.jsonl (filtered by
        // file path) agrees with the per-file rows (round-2 judge 1 #1: b136 rows said legacy, slice empty).
        tovuFiles: tm.files.map((a) => files.get(a).rel),
        // v4 (judge 3 #1): a Jini twin no Tovu file mounts is an UNMOUNTED-REWRITE: the two copies drift
        // silently (security: /system/site-token vs /system/site-key, permission names). WIRE-DRIFT below.
        state: mounts.length === 0 && inside === 0 ? "UNMOUNTED-REWRITE" : "MOUNTED" };
      Object.defineProperty(rec, "jfiles", { value: jm.files, enumerable: false });
      Object.defineProperty(rec, "jbeh", { value: B, enumerable: false });
      legacyTwins.push(rec);
      for (const a of tm.files) { const cur = legacyByFile.get(a); if (!cur || cur.sim + cur.overlap < rec.sim + rec.overlap) legacyByFile.set(a, rec); }
    }
  }
}

// v4 WIRE-DRIFT (judge 3 #1): for each LEGACY-TWIN, Jini route-path literals Tovu never names, paired
// with Tovu paths that differ only in the last segment (/system/site-token vs /system/site-key), and
// Jini permission names Tovu never uses, paired with Tovu names sharing the first and last segment.
const tovuRoutes = new Set(); const tovuPerms = new Set();
for (const abs of mainFiles) { const f = facts.get(abs); for (const r of f.routeLits) tovuRoutes.add(r); for (const r of f.routeDefs) tovuRoutes.add(r.path); for (const p0 of f.permLits) tovuPerms.add(p0.value); }
const segs = (p0) => p0.split("/").filter(Boolean);
const suffixMatch = (long, short0) => { const a = segs(long), b = segs(short0); if (b.length > a.length) return false; return b.every((x, i) => { const y = a[a.length - b.length + i]; return x === y || x === ":p" || y === ":p"; }); };
const tovuRouteList = [...tovuRoutes];
const commonPrefix = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
const wireDrift = [];
for (const rec of legacyTwins) {
  const jRoutes = new Set(); const jPerms = new Set();
  for (const ja of rec.jfiles) { const f = facts.get(ja); for (const r of f.routeLits) if (segs(r).length >= 2) jRoutes.add(r); for (const p0 of f.permLits) jPerms.add(p0.value); }
  for (const r of jRoutes) {
    // Tovu-side :param must not swallow a Jini literal segment (`/system/:p` "matched" /system/site-token).
    if (tovuRouteList.some((t) => suffixMatch(t, r) && segs(t).slice(-segs(r).length).every((y, i) => y !== ":p" || segs(r)[i] === ":p"))) continue;
    const parent = `/${segs(r).slice(0, -1).join("/")}`; const last = segs(r).pop();
    const near = tovuRouteList.filter((t) => segs(t).length >= 2 && suffixMatch(`/${segs(t).slice(0, -1).join("/")}`, parent) && commonPrefix(segs(t).pop(), last) >= 4).slice(0, 3);
    if (near.length) wireDrift.push({ kind: "route", tovu: rec.tovu, jini: rec.jini, state: rec.state, jiniPath: r, tovuNear: near });
  }
  for (const p0 of jPerms) {
    if (tovuPerms.has(p0)) continue;
    // Nearest Tovu names: most shared leading segments first (admin.security.site-key.manage for
    // admin.security.tokens.manage), then same first + last segment.
    const parts = p0.split("."); const lead = (q) => { let i = 0; while (i < q.length && q[i] === parts[i]) i++; return i; };
    const near = [...tovuPerms].map((t) => ({ t, q: t.split(".") })).filter(({ q }) => q.length >= 2 && (lead(q) >= 2 || (q[0] === parts[0] && q[q.length - 1] === parts[parts.length - 1])))
      .sort((a, b) => lead(b.q) - lead(a.q) || (b.q[b.q.length - 1] === parts[parts.length - 1]) - (a.q[a.q.length - 1] === parts[parts.length - 1])).slice(0, 3).map((x) => x.t);
    wireDrift.push({ kind: "permission", tovu: rec.tovu, jini: rec.jini, state: rec.state, jiniPermission: p0, tovuNear: near });
  }
}
const wireDriftByModule = new Map(); for (const w of wireDrift) wireDriftByModule.set(w.tovu, (wireDriftByModule.get(w.tovu) ?? 0) + 1);

// ---------------------------------------------------------------------------------------------
// Rule checks on Jini (pilot DE #7): first-party `await import()`, imports of non-core Jini packages
// (CORE-CONTRACT-NEEDED precomputed), and Express types (owner 11-07: no specific server in Jini).
// ---------------------------------------------------------------------------------------------
const jiniRules = [];
for (const [abs, f] of facts) {
  const info = files.get(abs); if (info.repo !== "jini" || info.fixture) continue;
  const own = jiniPkgOfRel(info.rel);
  for (const i of f.imports) {
    if (i.kind === "dynamic" && i.awaited && (i.spec.startsWith(".") || i.spec.startsWith("@jini-ai/"))) jiniRules.push({ file: display(abs), rule: "await-import", spec: i.spec, line: i.line });
    const pk = specPkg(i.spec);
    if (pk && pk !== own && !CORE_PKGS.has(pk)) jiniRules.push({ file: display(abs), rule: "imports-non-core", pkg: own, imports: pk, spec: i.spec, line: i.line, ...(i.typeOnly ? { typeOnly: true } : {}) });
  }
  if (f.expressType) jiniRules.push({ file: display(abs), rule: "express-type" });
}

// ---------------------------------------------------------------------------------------------
// Stale path references in comments: no file in Tovu or Jini ends with the referenced path.
// ---------------------------------------------------------------------------------------------
const byBase = new Map();
const allRepoFiles = [...rgFiles(TOVU, ["."], "*.{ts,tsx,mts,mjs,js,cjs,json,md,sql}").map((r) => r), ...rgFiles(JINI, ["."], "*.{ts,tsx,mts,mjs,js,cjs,json,md,sql}")];
for (const p of allRepoFiles) { const b = path.basename(p); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(`/${p}`); }
function refExists(ref) {
  // Build output, vendored code and examples are not source references.
  if (/(^|\/)(dist|build|out|node_modules)\//.test(ref)) return true;
  let r = ref.replace(/^(Jini|Tovu)\//, "").replace(/^\.\//, "").replace(/^#src\//, "apps/website/src/").replace(/^@jini-ai\/([^/]+)\//, "packages/$1/src/").replace(/^@\//, "src/");
  r = r.replace(/^(\.\.\/)+/, "");
  const variants = [r, r.replace(/\.(m|c)?js$/, ".ts"), r.replace(/\.(m|c)?js$/, ".tsx"), r.replace(/\.ts$/, ".js"), r.replace(/^packages\/([^/]+)\/src\//, "packages/$1/")];
  return variants.some((v) => (byBase.get(path.basename(v)) ?? []).some((p) => p.endsWith(`/${v}`)));
}
// v4 (judge 1 #9, judge 2 #11): `file.ts:44-50` cites must point inside an existing file (bare names match
// any file with that basename), and `@jini-ai/pkg/sub` mentions must name a package and a subpath its
// package.json `exports` map really has (`@jini-ai/cms/identity`).
const absByBase = new Map();
for (const [root, list] of [[TOVU, rgFiles(TOVU, ["."], "*.{ts,tsx,mts,mjs,js,cjs}")], [JINI, rgFiles(JINI, ["."], "*.{ts,tsx,mts,mjs,js,cjs}")]])
  for (const p of list) { const b = path.basename(p); if (!absByBase.has(b)) absByBase.set(b, []); absByBase.get(b).push(path.join(root, p)); }
const lineCountCache = new Map();
const lineCount = (a) => { if (!lineCountCache.has(a)) { try { lineCountCache.set(a, fs.readFileSync(a, "utf8").split("\n").length); } catch { lineCountCache.set(a, 0); } } return lineCountCache.get(a); };
function staleOk(c) {
  if (c.kind === "line") {
    const r = c.ref.replace(/^(\.{1,2}\/)+/, "").replace(/^@jini-ai\/([^/]+)\//, "packages/$1/src/");
    const vs = [r, r.replace(/\.(m|c)?js$/, ".ts"), r.replace(/\.(m|c)?js$/, ".tsx")];
    const hits = vs.flatMap((v) => (absByBase.get(path.basename(v)) ?? []).filter((a) => a.endsWith(`/${v}`)));
    if (!hits.length) return true; // a missing path is already a plain path candidate; a bare name we cannot place proves nothing
    return hits.some((a) => lineCount(a) >= c.refLine);
  }
  if (c.kind === "jini-spec") {
    const pk = specPkg(c.ref); const pkg = jiniPkgs.get(pk); if (!pkg) return !/^@jini-ai\/[a-z]/.test(c.ref);
    const sub = c.ref.slice(pk.length); if (!sub || sub === "/") return true;
    const keys = typeof pkg.exports === "object" ? Object.keys(pkg.exports) : [];
    return keys.some((k) => k === `.${sub}` || (k.includes("*") && `.${sub}`.startsWith(k.split("*")[0])));
  }
  return refExists(c.ref);
}

// ---------------------------------------------------------------------------------------------
// v4 behaviour twins per unit and the module-level Jini twin pass (judge 1 #2, judge 2 #3, judge 3 #2):
// name-independent. Each Tovu unit's distinctive tokens (strings, callees, property names; document
// frequency <= UNIT_BEH_MAX_DF files) against every Jini unit, private ones included; then per Tovu
// file, the summed best similarity per Jini file (body/norm/exact/beh twins + shared export names).
// ---------------------------------------------------------------------------------------------
const moduleTwins = [];
{
  const keep = (t) => { const d = behDf.get(t) ?? 0; return d >= 1 && d <= UNIT_BEH_MAX_DF; };
  const jUnits = []; const inv = new Map();
  for (const [abs, f] of facts) { const i = files.get(abs); if (i.repo !== "jini" || i.fixture) continue;
    for (const u of f.units) { if (!u.ubeh) continue; const toks = u.ubeh.filter(keep); if (toks.length < UNIT_BEH_MIN_SHARED) continue;
      const id = jUnits.length; jUnits.push({ abs, u, n: toks.length }); for (const t of toks) { if (!inv.has(t)) inv.set(t, []); inv.get(t).push(id); } } }
  for (const abs of mainFiles) for (const u of facts.get(abs).units) {
    if (!u.ubeh) continue; const toks = u.ubeh.filter(keep); if (toks.length < UNIT_BEH_MIN_SHARED) continue;
    const shared = new Map(); for (const t of toks) for (const id of inv.get(t) ?? []) shared.set(id, (shared.get(id) ?? 0) + 1);
    let best = null;
    // Containment as well as Jaccard (part 2 calibration): a Jini helper embedded in a bigger Tovu function
    // (readStoredBytes ~ private loadDocumentBytes 9 of 11 Jini tokens; assertGrantClamp 9 of 9) has a low
    // Jaccard. Accept when one side is >= 75% contained and the other >= 40%; score = Dice coefficient.
    for (const [id, c] of shared) { if (c < UNIT_BEH_MIN_SHARED) continue; const nJ = jUnits[id].n; const jac = c / (toks.length + nJ - c);
      const cMax = c / Math.min(toks.length, nJ), cMin = c / Math.max(toks.length, nJ);
      const ok = jac >= UNIT_BEH_MIN_JACCARD || (cMax >= UNIT_BEH_CONTAIN && cMin >= UNIT_BEH_CONTAIN_MIN);
      const score = jac >= UNIT_BEH_MIN_JACCARD ? jac : (2 * c) / (toks.length + nJ);
      if (ok && (!best || score > best.jac)) best = { id, jac: score, c, how: jac >= UNIT_BEH_MIN_JACCARD ? "jaccard" : "contain" }; }
    if (!best) continue; const J0 = jUnits[best.id];
    // An already-paired unit is re-reported only when behaviour says more than its other twin can (the
    // same-name assertGrantClamp pair scored 0.4 on node-kind shingles).
    if (pairedUnits.has(unitKey(display(abs), u.name, display(J0.abs), J0.u.name)) && best.jac < 0.6) continue;
    twinPairs.push({ kind: "beh", a: display(abs), aUnit: u.name, aLine: u.line, b: display(J0.abs), bUnit: J0.u.name, bLine: J0.u.line, sim: +best.jac.toFixed(2),
      sameName: u.name === J0.u.name, scope: scopeOf(J0.abs), stmts: Math.min(u.statements, J0.u.statements), shared: best.c, how: best.how, jiniPublic: jiniPublic.has(J0.abs) && !!J0.u.exported });
  }
  markPaired();
  // Tovu<->Tovu behaviour twins (judge 2 #10: init-site <-> duplicate-site scaffolding, judge 1 #7): the same
  // index over Tovu units in OTHER files, stricter (Jaccard >= 0.6, >= 12 shared distinctive tokens), report-only.
  {
    const tUnits = []; const tinv = new Map();
    for (const abs of mainFiles) for (const u of facts.get(abs).units) { if (!u.ubeh) continue; const toks = u.ubeh.filter(keep); if (toks.length < UNIT_BEH_TT_MIN_SHARED) continue;
      const id = tUnits.length; tUnits.push({ abs, u, toks }); for (const t of toks) { if (!tinv.has(t)) tinv.set(t, []); tinv.get(t).push(id); } }
    for (let i = 0; i < tUnits.length; i++) { const A = tUnits[i]; const shared = new Map();
      for (const t of A.toks) for (const id of tinv.get(t)) if (id > i && tUnits[id].abs !== A.abs) shared.set(id, (shared.get(id) ?? 0) + 1);
      for (const [id, c] of shared) { if (c < UNIT_BEH_TT_MIN_SHARED) continue; const B = tUnits[id]; const jac = c / (A.toks.length + B.toks.length - c); if (jac < UNIT_BEH_TT_MIN_JACCARD) continue;
        if (pairedUnits.has(unitKey(display(A.abs), A.u.name, display(B.abs), B.u.name))) continue;
        twinPairs.push({ kind: "beh", a: display(A.abs), aUnit: A.u.name, aLine: A.u.line, b: display(B.abs), bUnit: B.u.name, bLine: B.u.line, sim: +jac.toFixed(2), sameName: A.u.name === B.u.name, scope: "tovu-tovu", stmts: Math.min(A.u.statements, B.u.statements), shared: c, how: "jaccard" }); } }
    markPaired();
  }
  // Module level: Tovu file x Jini file -> best sim per Tovu unit, summed.
  const CODE_KINDS = new Set(["body", "exact-small", "small-shape", "same-name", "norm-body", "beh", "class-api", "class-fingerprint"]);
  const acc = new Map(); // "tovuRel|jiniDisplay" -> Map(unit -> { sim, stmts })
  for (const p0 of twinPairs) {
    if (p0.scope !== "tovu-jini" || !CODE_KINDS.has(p0.kind) || p0.sim < 0.3) continue;
    const k = `${p0.a}|${p0.b}`; if (!acc.has(k)) acc.set(k, new Map()); const m = acc.get(k); const cur = m.get(p0.aUnit);
    if (!cur || cur.sim < p0.sim) m.set(p0.aUnit, { sim: p0.sim, stmts: p0.stmts ?? 0 });
  }
  const relAbs0 = new Map(mainFiles.map((a) => [files.get(a).rel, a])); const dispAbs = new Map([...files.keys()].map((a) => [display(a), a]));
  for (const [k, m] of acc) {
    const [a, b] = k.split("|"); const A = relAbs0.get(a), B = dispAbs.get(b); if (!A || !B) continue;
    const exA = new Set(facts.get(A).localExports.keys()); const shared = [...facts.get(B).localExports.keys()].filter((n) => n !== "default" && exA.has(n));
    const sum = [...m.values()].reduce((x, y) => x + y.sim, 0) + 0.5 * Math.min(shared.length, 4);
    const top = Math.max(...[...m.values()].map((x) => x.sim)); const bigTop = [...m.values()].some((x) => x.sim >= 0.8 && x.stmts >= 5);
    if (!((sum >= MODULE_TWIN_MIN_SUM && m.size >= 2) || bigTop)) continue;
    moduleTwins.push({ tovu: a, jini: b, jiniPkg: jiniPkgOfRel(files.get(B).rel), jiniPublic: jiniPublic.has(B), sum: +sum.toFixed(2), units: m.size, top: +top.toFixed(2),
      tovuUnits: facts.get(A).units.filter((u) => u.kind !== "class").length, sharedExports: shared.slice(0, 6), matched: [...m].sort((x, y) => y[1].sim - x[1].sim).slice(0, 6).map(([n, v]) => `${n}:${v.sim}`) });
  }
  moduleTwins.sort((x, y) => y.sum - x.sum);
}
const moduleTwinsByFile = new Map(); for (const m of moduleTwins) { if (!moduleTwinsByFile.has(m.tovu)) moduleTwinsByFile.set(m.tovu, []); moduleTwinsByFile.get(m.tovu).push(m); }

// ---------------------------------------------------------------------------------------------
// Port-implementation edges (resolved): object literal typed with / passed into a Jini binding,
// with a field whose value is a Tovu symbol. The DEFINING file is the implementer.
// ---------------------------------------------------------------------------------------------
const portEdges = [];
for (const abs of mainFiles) {
  const f = facts.get(abs);
  for (const p of f.ports) {
    const host = resolveBinding(abs, p.root);
    if (!isJiniOrigin(host)) continue;
    let impl = null;
    if (f.bindings.has(p.value)) { const o = resolveBinding(abs, p.value); if (o?.abs && files.get(o.abs).repo === "tovu") impl = o; }
    else if (f.localNames.has(p.value)) impl = { abs, name: p.value };
    if (!impl) continue;
    // A port is implemented by a function or an object, not a string/number field (pilot ABC #8:
    // `pluginId: PLUGIN_ID` read as an implementer).
    if (/^(literal|array)$/.test(facts.get(impl.abs).constKinds.get(impl.name) ?? "")) continue;
    // Round-2 judge 2 #4: `withSchemaOnRejection(x, { isShapeRejection })` callbacks read as port-impl x10.
    // A predicate/event callback handed to a call is an option, not a port member.
    if (/\(#\d+\)/.test(p.label) && /^(is|has|can|should|on)[A-Z]/.test(p.field)) continue;
    const implKind = facts.get(impl.abs).localExports.get(impl.name)?.kind ?? "local";
    portEdges.push({ site: `${display(abs)}:${p.line}`, siteAbs: abs, port: `${originLabel(host)} :: ${p.label}.${p.field}`, symbol: impl.name, implAbs: impl.abs, impl: display(impl.abs),
      implKind, crossFile: impl.abs !== abs });
  }
}
// Two Tovu bodies that implement the SAME Jini port field look alike because the port shapes them
// (pilot DE #6: stopRunsForToolAccessChange). Drop those Tovu<->Tovu body pairs before indexing.
{
  const portsOf = new Map(); for (const e of portEdges) { const k = `${e.impl}#${e.symbol}`; if (!portsOf.has(k)) portsOf.set(k, new Set()); portsOf.get(k).add(e.port); }
  const samePort = (p) => { const A = portsOf.get(`${p.a}#${p.aUnit}`), B = portsOf.get(`${p.b}#${p.bUnit}`); return !!A && !!B && [...A].some((x) => B.has(x)); };
  for (let i = twinPairs.length - 1; i >= 0; i--) if (twinPairs[i].kind === "body" && twinPairs[i].scope === "tovu-tovu" && samePort(twinPairs[i])) { twinPairs.splice(i, 1); suppressedSamePort++; }
  indexTwins();
}
const portsByImpl = new Map(); const portsBySite = new Map();
for (const e of portEdges) {
  if (!portsByImpl.has(e.implAbs)) portsByImpl.set(e.implAbs, []); portsByImpl.get(e.implAbs).push(e);
  if (!portsBySite.has(e.siteAbs)) portsBySite.set(e.siteAbs, []); portsBySite.get(e.siteAbs).push(e);
}

// ---------------------------------------------------------------------------------------------
// v3 cross-file facts computed before the rows: wire keys, Tovu<->Tovu wording couplings, boundary
// entries from .dependency-cruiser.mjs, dead clusters, composition drift.
// ---------------------------------------------------------------------------------------------
const appOf = (abs) => (/^(apps|packages)\/([^/]+)\//.exec(files.get(abs).rel) ?? [])[2] ?? "?";
// Wire keys: res.locals keys, x-* headers, cookie names, stdout protocol lines. A key used in another
// Tovu file (or a Jini file) is a private format two places must keep in step (round-2 judge 1 #4:
// res.locals.tovuRenderThemeIdOverride was the root of M2; tovu_member_session <-> MEMBER_SESSION_COOKIE).
const wireIdx = new Map();
for (const abs of mainFiles) for (const w of facts.get(abs).wireKeys) { const k = `${w.kind}\0${w.key}`; if (!wireIdx.has(k)) wireIdx.set(k, new Map()); const m = wireIdx.get(k); if (!m.has(abs)) m.set(abs, []); m.get(abs).push(w); }
const localsKeys = new Set([...wireIdx.keys()].filter((k) => k.startsWith("res.locals\0")).map((k) => k.split("\0")[1]));
const jiniPropFiles = new Map(); // res.locals key -> Jini files that name it as a property
for (const [abs, f] of facts) { if (files.get(abs).repo !== "jini" || files.get(abs).fixture) continue; for (const k of localsKeys) if (f.beh.has(`p:${k}`) || f.beh.has(`s:${k}`)) { if (!jiniPropFiles.has(k)) jiniPropFiles.set(k, []); jiniPropFiles.get(k).push(abs); } }
function wireCouplings(abs) {
  const out = [];
  const seen = new Set();
  for (const w of facts.get(abs).wireKeys) {
    const k = `${w.kind}\0${w.key}`; if (seen.has(k)) continue; seen.add(k);
    const others = [...(wireIdx.get(k)?.keys() ?? [])].filter((x) => x !== abs);
    const jini = w.kind === "res.locals" ? (jiniPropFiles.get(w.key) ?? []) : w.kind === "stdout-line" ? [] : [...(jiniLitFiles.get(w.key) ?? [])];
    if (jini.length > 5) continue; // a key in many Jini files is a standard name (x-request-id), not a private format
    // stdout lines couple through the parser's regex (Tovu wording pass below), not through key reuse.
    if (w.kind === "stdout-line" || (!others.length && !jini.length)) continue;
    if (others.length > 8) continue;
    const cross = jini.length > 0 || others.some((x) => appOf(x) !== appOf(abs) || files.get(x).feature !== files.get(abs).feature);
    out.push({ kind: w.kind, lit: w.key, line: w.line, symbol: w.symbol, cross, with: [...jini.map(display), ...others.map(display)].slice(0, 4), total: jini.length + others.length });
  }
  return out;
}
// Tovu<->Tovu wording: a regex/phrase operand in one Tovu file equal to (or a prefix of) a string piece
// another Tovu file emits (round-2 judge 3 #1: desktop BOOT_LINE / BOOT_TOKEN_LINE parse serve.ts's
// `tovu serve: dir=... port=...` and `tovu serve: bootToken=` console lines). Both files get the row.
const tPhraseIdx = new Map(); // first 12 chars -> [{ piece, abs }]
for (const abs of mainFiles) for (const [piece, full] of facts.get(abs).tPhrases) { const k = piece.trimStart().slice(0, 12); if (!tPhraseIdx.has(k)) tPhraseIdx.set(k, []); tPhraseIdx.get(k).push({ piece: piece.trimStart(), abs, full }); }
const ttCouplings = new Map(); // abs -> rows
const addTT = (abs, row) => { if (!ttCouplings.has(abs)) ttCouplings.set(abs, []); const l = ttCouplings.get(abs); if (!l.some((x) => x.lit === row.lit && x.with === row.with)) l.push(row); };
for (const abs of mainFiles) for (const c of facts.get(abs).couplingCands) {
  if (c.kind !== "regex" && c.kind !== "phrase") continue;
  // Wording or protocol only (a space, or a `key=` / `prefix:` tail): ids >= 20 chars (table and tool
  // names) matched everywhere in the first v3 run and are shared enum values, not parsed lines.
  const t = c.text.trimStart(); if (t.length < 12 || !(/\s/.test(t.trim()) || /[=:]\s*$/.test(t))) continue;
  // v4 (judge 2 #8: import-media "was never received" was paired with the ^-anchored "is not available"
  // regex): a regex coupling holds only if the regex MATCHES the emitted literal (interpolations -> "x").
  let rx = null; if (c.re) { try { rx = new RegExp(c.re.src, c.re.flags.replace(/[gy]/g, "")); } catch { rx = null; } }
  const hits = (tPhraseIdx.get(t.slice(0, 12)) ?? []).filter((x) => x.abs !== abs && (x.piece.startsWith(t) || t.startsWith(x.piece.trimEnd()))
    && (!rx || rx.test(x.full.replace(/\$\{\}/g, "x")) || rx.test(x.piece)));
  const filesHit = [...new Set(hits.map((x) => x.abs))];
  if (!filesHit.length || filesHit.length > 3) continue;
  for (const other of filesHit) {
    const cross = appOf(other) !== appOf(abs) || files.get(other).feature !== files.get(abs).feature;
    addTT(abs, { kind: `${c.kind}-parses`, lit: short(t, 60), line: c.line, symbol: c.symbol, with: display(other), cross });
    addTT(other, { kind: "emits-parsed", lit: short(t, 60), line: null, symbol: null, with: `${display(abs)}:${c.line}`, cross });
  }
}
// Boundary entries (round-2 judge 1 #8, judge 2 #6): a guarded module's index.ts and its named public
// entries are the promoted surface the boundary lint enforces, not a deletable barrel.
const boundaryEntries = new Set();
try {
  const dc = fs.readFileSync(path.join(TOVU, ".dependency-cruiser.mjs"), "utf8");
  const guarded = (/const GUARDED_MODULES = \[([\s\S]*?)\n\];/.exec(dc) ?? [])[1] ?? "";
  for (const m of guarded.replace(/\/\/[^\n]*/g, "").matchAll(/"([^"]+)"/g)) boundaryEntries.add(`apps/website/src/${m[1]}/index.ts`);
  const pub = (/const PUBLIC_ENTRIES = \{([\s\S]*?)\n\};/.exec(dc) ?? [])[1] ?? "";
  for (const m of pub.replace(/\/\/[^\n]*/g, "").matchAll(/(?:"([^"]+)"|(\w+)):\s*\[([^\]]*)\]/g)) for (const e of m[3].matchAll(/"([^"]+)"/g)) boundaryEntries.add(`apps/website/src/${m[1] ?? m[2]}/${e[1]}.ts`);
} catch { /* no dependency-cruiser config: no boundary tags */ }
// Dead clusters (round-2 judge 3 #4, judge 1 #5): "prod 3" importers that are all unreachable themselves
// (the parked desktop-chat cluster). Roots: 0 prod and 0 aux importers, not entry-like by name or a
// package.json main/bin/exports target. Then a file whose every prod importer is dead is dead too.
// Limits: files loaded by path string (new Worker(new URL(...)), html <script>, CLI spawn) look dead.
const pkgEntries = new Set();
for (const root of ["apps", "packages"]) for (const dir of fs.existsSync(path.join(TOVU, root)) ? fs.readdirSync(path.join(TOVU, root)) : []) {
  const pj = path.join(TOVU, root, dir, "package.json"); if (!fs.existsSync(pj)) continue;
  const json = JSON.parse(fs.readFileSync(pj, "utf8")); const add = (v) => { if (typeof v === "string") { const a = tryFile(path.join(TOVU, root, dir, v.replace(/^\.\/dist\//, "./src/").replace(/\.d\.ts$/, ".ts"))); if (a) pkgEntries.add(a); } else if (v && typeof v === "object") Object.values(v).forEach(add); };
  add(json.main); add(json.module); add(json.bin); add(json.exports);
  for (const sc of Object.values(json.scripts ?? {})) for (const m of String(sc).matchAll(/([\w./-]+\.(?:[mc]?[jt]sx?))/g)) { const a = tryFile(path.join(TOVU, root, dir, m[1])); if (a) pkgEntries.add(a); }
}
const ENTRY_RE = /(^|\/)(main|index|preload|server|cli|program|worker|entry|bootstrap|app|App)\.[mc]?[jt]sx?$|\.config\.[mc]?[jt]s$|\/bin\/|\/scripts?\//;
const prodImporters = (abs) => { const s2 = new Set(); for (const x of importers.get(abs)?.keys() ?? []) if (files.get(x).role === "main") s2.add(x); for (const [x, r] of directImp.get(abs) ?? []) if (files.get(x).role === "main") s2.add(x); return s2; };
const auxImported = (abs) => [...(importers.get(abs)?.keys() ?? []), ...(directImp.get(abs)?.keys() ?? [])].some((x) => files.get(x).role === "aux");
// v4 path-loaded roots (judge 1 #1, judge 2 #2): vite `build.lib.entry` / `rollupOptions.input`, spawn/fork
// paths (daemon-supervisor.ts:305, local-site-process.ts:92), `new URL("./x", import.meta.url)`, the root
// package.json `scripts` and .github/workflows/*.yml (default-credential-exposure.ts: package.json:99,
// ci.yml:288). A literal resolves against its file's dir, then its package root, then the repo root, and
// last by a unique path suffix among Tovu files (spawn paths are built from a runtime dir variable).
const pathRoots = new Map(); // abs -> "why" (first source)
{
  const relSuffix = new Map(); // "a/b.ts" (last two segments) -> [abs]
  for (const a of mainFiles) { const k = files.get(a).rel.split("/").slice(-2).join("/"); if (!relSuffix.has(k)) relSuffix.set(k, []); relSuffix.get(k).push(a); }
  const pkgRootOf = (abs) => { let d = path.dirname(abs); while (d.startsWith(TOVU) && d !== TOVU) { if (fs.existsSync(path.join(d, "package.json"))) return d; d = path.dirname(d); } return TOVU; };
  const resolveLit = (lit, dirs) => {
    for (const d of dirs) { const a = tryFile(path.resolve(d, lit)); if (a && files.get(a).role === "main") return a; }
    const clean = lit.replace(/^(\.{1,2}\/)+/, "").replace(/\.(m|c)?js$/, ".ts"); const segs0 = clean.split("/"); if (segs0.length < 2) return null;
    const cands = (relSuffix.get(segs0.slice(-2).join("/")) ?? []).concat(relSuffix.get(segs0.slice(-2).join("/").replace(/\.ts$/, ".tsx")) ?? [])
      .filter((a) => files.get(a).rel.endsWith(clean) || files.get(a).rel.endsWith(clean.replace(/\.ts$/, ".tsx")));
    return cands.length === 1 ? cands[0] : null;
  };
  const add = (a, why) => { if (a && !pathRoots.has(a)) pathRoots.set(a, why); };
  for (const abs of mainFiles) for (const lit of facts.get(abs).pathLits) add(resolveLit(lit, [path.dirname(abs), pkgRootOf(abs), TOVU]), `path literal in ${display(abs)}`);
  const PATH_TOKEN_RE = /([\w./@-]+\.(?:[mc]?[jt]sx?))\b/g;
  const scan = (text, why) => { for (const m of text.matchAll(PATH_TOKEN_RE)) add(resolveLit(m[1], [TOVU]), why); };
  try { const pj = JSON.parse(fs.readFileSync(path.join(TOVU, "package.json"), "utf8")); for (const [k, sc] of Object.entries(pj.scripts ?? {})) scan(String(sc), `package.json script ${k}`); } catch { /* no root package.json */ }
  const wf = path.join(TOVU, ".github/workflows");
  for (const n of fs.existsSync(wf) ? fs.readdirSync(wf).filter((x) => /\.ya?ml$/.test(x)) : []) scan(fs.readFileSync(path.join(wf, n), "utf8"), `.github/workflows/${n}`);
}
// `import()` targets (judge 3 #10): a lazily loaded feature boundary, not a deletable barrel. Prod only.
const dynTargets = new Set();
for (const abs of mainFiles) for (const e of fileEdges.get(abs) ?? []) if (e.kind === "dynamic" && e.to && files.get(e.to).role === "main") dynTargets.add(e.to);
const deadSet = new Set(); const deadRoot = new Set();
{
  const live = (abs) => ENTRY_RE.test(files.get(abs).rel) || pkgEntries.has(abs) || pathRoots.has(abs) || auxImported(abs);
  for (const abs of mainFiles) if (!live(abs) && prodImporters(abs).size === 0) { deadSet.add(abs); deadRoot.add(abs); }
  for (let changed = true; changed;) { changed = false;
    for (const abs of mainFiles) { if (deadSet.has(abs) || live(abs)) continue; const pi = prodImporters(abs); if (pi.size && [...pi].every((x) => deadSet.has(x) || x === abs)) { deadSet.add(abs); changed = true; } } }
}
// Hermetic-only (judge 2 #11): composition/app.ts wires in-memory adapters ("what tests exercise"). A file
// reached only through it (or through other hermetic-only files) has no prod reach, but tests use it, so it
// is not dead. Entry-like files stay live. Only in-memory/console/seed/noop ADAPTERS count: app.ts also
// mounts every route, so propagating through all its edges marked half the server (566 files on the first run).
const HERMETIC_ADAPTER_RE = /(^|[/.-])(memory|in-memory|inmemory|console|seed|noop|fake|stub)([/.-]|$)/i;
const hermeticOnly = new Set();
{
  const herm = new Set(mainFiles.filter((a) => facts.get(a).hermetic));
  for (let changed = true; changed;) { changed = false;
    for (const abs of mainFiles) { if (deadSet.has(abs) || hermeticOnly.has(abs) || herm.has(abs) || !HERMETIC_ADAPTER_RE.test(files.get(abs).rel) || ENTRY_RE.test(files.get(abs).rel) || pkgEntries.has(abs) || pathRoots.has(abs)) continue;
      const pi = [...prodImporters(abs)].filter((x) => !deadSet.has(x) && x !== abs);
      if (pi.length && pi.every((x) => herm.has(x) || hermeticOnly.has(x))) { hermeticOnly.add(abs); changed = true; } } }
}
// Per-symbol prod users (judge 2 #6, judge 1 #7): files naming `name` of `abs`, resolved through barrels
// (importers) or by direct specifier. Used for dead re-exports in barrels and member-level dead code.
const namedUsers = (abs, name) => { const s2 = new Set();
  for (const [x, names] of importers.get(abs) ?? []) if (names.has(name) || names.has("*")) s2.add(x);
  for (const [x, r] of directImp.get(abs) ?? []) if (r.imports && (r.names.has(name) || r.names.has("*"))) s2.add(x);
  return [...s2].filter((x) => files.get(x).role === "main"); };
// Member-level dead code (judge 3 #4): members of a returned controller object / exported object literal
// (`replace`, `setDraftToken`, `api.setSitesHome`) that no importer of the symbol reads as a property or
// destructures; or that only dead files read (dead roots propagate to api.* methods). Limit: a member
// named like a common property (`replace` on strings) reads as used when the importer uses that name.
const deadMembers = new Map(); // abs -> [ "sym.member (unused|dead callers only)" ]
for (const abs of mainFiles) {
  const f = facts.get(abs); if (deadSet.has(abs)) continue;
  for (const o of f.objMembers) {
    if (!f.localExports.has(o.sym) || o.members.length < 2) continue;
    // Controllers only: a hook's returned object (useX) or a client object (api, fooApi, fooClient). Data
    // maps, schemas, configs and port objects handed whole to a function read as 1,142 "unused" members.
    if (!(o.kind === "returns" ? /^use[A-Z]/.test(o.sym) : /^(api|\w+Api|\w+Client)$/.test(o.sym))) continue;
    const users = namedUsers(abs, o.sym).filter((x) => x !== abs); if (!users.length) continue;
    const out = [];
    for (const m of o.members) {
      if (f.propNames.has(m) && o.kind === "object") continue; // used inside its own file (api.x from a sibling)
      const readers = users.filter((x) => facts.get(x).propNames.has(m));
      if (!readers.length) out.push(`${o.sym}.${m} (unused)`);
      else if (readers.every((x) => deadSet.has(x))) out.push(`${o.sym}.${m} (dead callers only: ${readers.slice(0, 2).map(display).join(", ")})`);
    }
    if (out.length && out.length < o.members.length) { if (!deadMembers.has(abs)) deadMembers.set(abs, []); deadMembers.get(abs).push(...out); }
  }
}
// Admin client paths with no server route (judge 3 #4: a client action the server never registered).
// Client = apps/admin|desktop route literals; server = every router.get/post/... path and route literal in
// apps/website. Matching is by path suffix with :param wildcards, so a mounted prefix does not hide a route.
// Limit: paths built from an action union (stop-serving) are not literals and are not checked.
const serverRoutes = []; for (const a of mainFiles) if (/^apps\/website\//.test(files.get(a).rel)) for (const r of facts.get(a).routeDefs) serverRoutes.push(r.path);
const serverRouteLits = []; for (const a of mainFiles) if (/^apps\/website\/src\/server\//.test(files.get(a).rel)) for (const r of facts.get(a).routeLits) serverRouteLits.push(r);
const clientNoRoute = new Map(); // abs -> [path]
{
  const segsR = (p0) => p0.split("/").filter(Boolean);
  const sfx = (long, s) => { const a = segsR(long), b = segsR(s); if (!b.length || b.length > a.length) return false; return b.every((x, i) => { const y = a[a.length - b.length + i]; return x === y || x === ":p" || y === ":p"; }); };
  const known = [...serverRoutes, ...serverRouteLits];
  for (const a of mainFiles) {
    const rel = files.get(a).rel; if (!/^apps\/admin\/src\/.*\bapi[\w.-]*\.tsx?$/.test(rel)) continue;
    const miss = [...facts.get(a).routeLits].filter((p0) => segsR(p0).length >= 2 && !known.some((k) => sfx(k, p0) || (sfx(p0, k) && segsR(k).length >= 2)));
    if (miss.length) clientNoRoute.set(a, miss);
  }
}
// Composition drift (round-2 judge 2 #11): composition roots in one app that call different ensure*
// sets (app.ts vs deps.ts). Roots = files calling >= 4 distinct ensure* functions.
const compositionDrift = [];
{
  const roots = mainFiles.filter((a) => facts.get(a).ensureCalls.size >= 4);
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    const A = roots[i], B = roots[j]; if (appOf(A) !== appOf(B)) continue;
    const a = facts.get(A).ensureCalls, b = facts.get(B).ensureCalls; const inter = [...a].filter((x) => b.has(x)).length;
    if (inter < 3) continue; // unrelated roots
    const onlyA = [...a].filter((x) => !b.has(x)), onlyB = [...b].filter((x) => !a.has(x));
    if (onlyA.length || onlyB.length) compositionDrift.push({ a: display(A), b: display(B), shared: inter, onlyA, onlyB });
  }
}

// ---------------------------------------------------------------------------------------------
// Per-file rows + tier suggestion.
// ---------------------------------------------------------------------------------------------
// v4 error-message couplings (judge 2 #8): `err.message === "..."` / `.includes("...")` against a message
// thrown in ANOTHER file (write-service matching the repo's error strings) is a private format coupling.
const thrownBy = new Map(); // message head -> Set(abs)
for (const [abs, f] of facts) { const i = files.get(abs); if (i.role !== "main" && !(i.role === "jini" && !i.fixture)) continue; for (const t of f.thrown) { if (!thrownBy.has(t)) thrownBy.set(t, new Set()); thrownBy.get(t).add(abs); } }
const thrownList = [...thrownBy.keys()];
const errCouplingsOf = (abs) => facts.get(abs).errCompares.flatMap((c) => {
  // The thrown head is the literal part before the first ${}: equal, or the compare text starts with it.
  const hits = thrownList.filter((t) => t === c.text || (c.op !== "===" && (t.includes(c.text) || c.text.startsWith(t))) || (c.op === "===" && c.text.startsWith(t) && t.length >= 20));
  const other = [...new Set(hits.flatMap((t) => [...thrownBy.get(t)]))].filter((x) => x !== abs);
  return other.length ? [{ ...c, with: other.slice(0, 3).map(display), total: other.length }] : [];
});
// Jini package dependency closure (judge 1 #6, judge 3 #11): CORE-CONTRACT-NEEDED counts only packages the
// importing side cannot already reach: one named package depending on the other (chat -> agentic, daemon ->
// agent-runtime), or the Jini package of the Tovu app (apps/admin -> @jini-ai/admin) already depending on it.
const depClosure = new Map();
const depsOf = (pk) => { if (depClosure.has(pk)) return depClosure.get(pk); const out = new Set(); depClosure.set(pk, out);
  for (const d of jiniPkgs.get(pk)?.deps ?? []) { out.add(d); for (const x of depsOf(d)) out.add(x); } return out; };
// TOOL-CALL check (theme 12): tests of tool files, read once. Assertions = expect( / assert.* / t.assert;
// "denied" = the test names a refusal (permission/forbidden/denied/403); "bad input" = invalid/missing/schema.
const testInfo = new Map(); // subject abs -> { files, asserts, denied, badInput }
const testsOf = new Map(); for (const [abs, info] of files) { if (info.role !== "test") continue; for (const e of fileEdges.get(abs) ?? []) if (e.to && files.get(e.to)?.role === "main") { if (!testsOf.has(e.to)) testsOf.set(e.to, new Set()); testsOf.get(e.to).add(abs); } }
const testText = new Map(); const readTest = (a) => { if (!testText.has(a)) testText.set(a, fs.readFileSync(a, "utf8")); return testText.get(a); };
for (const abs of mainFiles) { if (!facts.get(abs).toolFile) continue;
  const ts0 = [...(testsOf.get(abs) ?? [])]; if (!ts0.length) continue; let asserts = 0, denied = false, badInput = false;
  for (const t of ts0) { const x = readTest(t); asserts += (x.match(/\bexpect\(|\bassert(\.\w+)?\(|\bt\.assert/g) ?? []).length;
    denied ||= /\b(denied|forbidden|not allowed|unauthori[sz]ed|permission)\b|\b403\b/i.test(x); badInput ||= /\b(invalid|missing|malformed|bad input|schema|must be)\b/i.test(x); }
  testInfo.set(abs, { files: ts0.length, asserts, denied, badInput }); }
const formatCouplings = [];
const rowsOut = new Map();
const testCount = new Map(); // subject abs -> number of test files importing it
for (const [abs, info] of files) {
  if (info.role !== "test") continue;
  for (const e of fileEdges.get(abs) ?? []) if (e.to && files.get(e.to)?.role === "main") testCount.set(e.to, (testCount.get(e.to) ?? 0) + 1);
}
for (const abs of mainFiles) {
  const info = files.get(abs); const f = facts.get(abs); const rel = info.rel;
  const edges = fileEdges.get(abs) ?? [];
  const T = [], J = [], N = new Set(), NPM = new Set(), missing = [], rules = []; const namedPkgs = new Set(); const valuePkgs = new Set();
  for (const e of edges) {
    const tag = `${e.typeOnly || e.kind === "importType" ? "type " : ""}${e.kind === "dynamic" || e.kind === "importType" ? "inline " : ""}`;
    // Rule check (pilot DE #7): prod `await import()` of a first-party module (Tovu or Jini).
    if (e.kind === "dynamic" && e.awaited && (e.target === "tovu" || e.target === "jini")) rules.push(`await-import ${e.spec} @${e.line}`);
    if (e.target === "tovu") T.push(`${tag}${display(e.to)}${e.via ? ` (via ${e.via})` : ""}`);
    else if (e.target === "jini") {
      // pkg= is the package the import NAMES (may differ from where the symbol is defined).
      if (e.jiniPkg) namedPkgs.add(e.jiniPkg);
      // CORE-CONTRACT-NEEDED counts VALUE imports named directly (round-2 judge 1 #6, judge 3 #7: it fired on
      // type-only imports and on imports through Tovu shims).
      // v4 (judge 1 #6): the ORIGIN package of the symbol (a core re-export of a cms symbol counts as cms).
      if (e.jiniPkg && !e.typeOnly && e.kind !== "importType" && e.spec.startsWith("@jini-ai/")) valuePkgs.add(e.to ? jiniPkgOfRel(files.get(e.to).rel) : e.jiniPkg);
      J.push(`${tag}${e.jiniSpec ?? e.spec}${e.to ? `#${files.get(e.to).rel.split("/src/")[1] ?? ""}` : ""}${e.jiniPkg ? ` pkg=${e.jiniPkg}` : ""}${e.spec.startsWith("@jini-ai/") ? "" : ` (R7 via ${e.via ?? e.spec})`}`);
    }
    else if (e.target === "node") N.add(e.spec.replace(/^node:/, ""));
    else if (e.target === "missing") missing.push(e.spec);
    else NPM.add(e.spec.split("/").slice(0, e.spec.startsWith("@") ? 2 : 1).join("/"));
  }
  // Importers: real callers only (names resolved through barrels); tests and aux counted apart.
  const imps = [...(importers.get(abs) ?? new Map()).keys()];
  const prod = imps.filter((x) => files.get(x).role === "main").map(display).sort();
  const aux = imps.filter((x) => files.get(x).role === "aux").length;
  // Direct importers (specifier resolves to this file): the only callers a facade/barrel has.
  const dmap = directImp.get(abs) ?? new Map();
  const dProd = [...dmap].filter(([x, r]) => files.get(x).role === "main" && r.imports).map(([x]) => x);
  const dRe = [...dmap].filter(([x, r]) => files.get(x).role === "main" && r.reexport && !r.imports).length;
  const dTests = [...dmap.keys()].filter((x) => files.get(x).role === "test").length;
  // Per-export importer counts (prod/tests), from both resolved and direct importers, so test-only
  // exports surface (pilot DE #2: isDaemonProcessForWorkspace, the Tovu createDaemonSupervisor).
  const perName = new Map(); const bump = (n, x) => { if (!perName.has(n)) perName.set(n, { prod: new Set(), tests: new Set() }); const role = files.get(x).role; if (role === "main") perName.get(n).prod.add(x); else if (role === "test") perName.get(n).tests.add(x); };
  for (const [x, names] of importers.get(abs) ?? new Map()) for (const n of names) bump(n, x);
  for (const [x, r] of dmap) if (r.imports) for (const n of r.names) bump(n, x);
  const used = new Set([...(usedNames.get(abs) ?? []), ...[...dmap.values()].flatMap((r) => [...r.names])]);
  // Re-exported names are this file's API too (tag re:), or a facade reads as exporting nothing.
  const exportsList = [...[...f.localExports].map(([n, e]) => `${n}:${e.kind}@${e.line}`), ...[...f.reexports].map(([n, r]) => `re:${n}<-${r.spec}`), ...f.stars.map((sp) => `re:*<-${sp}`)];
  const allExported = [...f.localExports.keys(), ...f.reexports.keys()];
  const unused = used.has("*") ? [] : allExported.filter((n) => !used.has(n));
  const anyStar = perName.get("*"); const starProd = anyStar?.prod.size ?? 0, starTests = anyStar?.tests.size ?? 0;
  const exportImporters = allExported.filter((n) => n !== "*").map((n) => { const c = perName.get(n); return { n, prod: (c?.prod.size ?? 0) + starProd, tests: (c?.tests.size ?? 0) + starTests }; });
  // Test-only: LOCAL value exports only. A re-exported name reached by prod through an upstream barrel
  // resolves past this file, so its prod count here is 0 by construction; types prove nothing.
  // ...and not used inside this file either (round-2 judge 2 #7: importWorkerLaunch is used at :66).
  const testOnly = exportImporters.filter((x) => x.prod === 0 && x.tests > 0 && f.localExports.has(x.n) && !/^(interface|type)$/.test(f.localExports.get(x.n).kind) && !f.selfUses.get(x.n)).map((x) => x.n);
  // Same-name Jini exports, scored with the body fingerprint (R2: >=0.6 copy, 0.3-0.6 diverged).
  const sameName = [];
  for (const [name] of f.localExports) {
    const hits = jiniExportIndex.get(name); if (!hits || name === "default") continue;
    const mine = f.units.find((u) => u.name === name); const myShape = f.shapes.find((s) => s.name === name);
    let best = null;
    for (const h of hits) {
      let sim = null; let typeVerdict = null; let delta = null;
      if (mine?.shingles.length && h.unit?.shingles.length) sim = jaccard(mine.shingles, h.unit.shingles);
      else if (mine?.smallText && h.unit?.smallText) sim = mine.smallText === h.unit.smallText ? 1 : mine.kindsKey && mine.kindsKey === h.unit.kindsKey ? 0.9 : 0;
      else if (myShape?.mem && h.shape?.mem) {
        // Types: compare normalised members (round-2 judge 2 #2: MailTestModeSetting is an exact copy,
        // AgentToolDefinition a strict subset, SourceControlProvider diverges in arguments -> ABI drift).
        const A = new Set(myShape.mem), B = new Set(h.shape.mem); const onlyT = [...A].filter((x) => !B.has(x)), onlyJ = [...B].filter((x) => !A.has(x));
        typeVerdict = !onlyT.length && !onlyJ.length ? "exact" : !onlyT.length ? "subset" : !onlyJ.length ? "superset" : "diverged";
        sim = (A.size - onlyT.length) / (A.size + onlyJ.length);
        if (onlyT.length || onlyJ.length) delta = { tovuOnly: onlyT.slice(0, 6).map((x) => short(x, 60)), jiniOnly: onlyJ.slice(0, 6).map((x) => short(x, 60)) };
      }
      if (!best || (sim ?? -1) > (best.sim ?? -1)) best = { abs: h.abs, sim, typeVerdict, delta };
    }
    // Pass-through = the one call forwards this function's own parameters (see singleCall).
    const passThrough = mine?.callRoot && mine.callArgs?.forwardsOnly !== false && isJiniOrigin(resolveBinding(abs, mine.callRoot));
    const verdict = passThrough ? "pass-through" : best.typeVerdict ?? (best.sim == null ? "name-only" : best.sim >= 0.6 ? "copy" : best.sim >= 0.3 ? "diverged" : "different");
    sameName.push({ name, jini: display(best.abs), others: hits.length - 1, sim: best.sim == null ? null : +best.sim.toFixed(2), verdict, ...(best.delta ? best.delta : {}) });
  }
  // extends: `extends <Jini same-name>` (canary-2 item 7 -> Tier 1) vs `extends Tovu*` adapters (R4).
  const ext = f.extendsInfo.map((x) => {
    const o = x.base ? (resolveBinding(abs, x.base) ?? (f.localNames.has(x.base) ? { abs, name: x.base } : null)) : null;
    const where = isJiniOrigin(o) ? "jini" : o?.abs ? "tovu" : o?.ext ? "npm" : "global";
    return { ...x, where, origin: o ? originLabel(o) : x.base, jiniSameName: where === "jini" && o.name === x.name };
  });
  // Pass-through functions (R2/R3): body is a single call into a Jini binding.
  const fnUnits = f.units.filter((u) => u.kind === "fn" || u.kind === "alias");
  // One-call-into-Jini units; a pass-through additionally forwards only its own parameters (v3).
  const jiniCallUnits = fnUnits.filter((u) => u.callRoot && isJiniOrigin(resolveBinding(abs, u.callRoot)));
  const passUnits = jiniCallUnits.filter((u) => u.callArgs?.forwardsOnly !== false);
  const passThrough = passUnits.map((u) => `${u.name}@${u.line}`);
  // Driver binders inject npm modules, product literals or host copy into the Jini call: that is
  // Tovu wiring, not a pass-through to delete (pilot ABC #6: pglite*, postgres, enable-access).
  // Builders that add their own arguments (round-2: buildDeployOpsRegistrations) are wiring too.
  const fedHost = jiniCallUnits.length > passUnits.length || jiniCallUnits.some((u) => u.callArgs && (u.callArgs.lit || u.callArgs.hostMsg || u.callArgs.idents.some((id) => resolveBinding(abs, id)?.ext)));
  // Literals: format coupling + product residue, with key-vs-value context.
  const formats = []; const residue = [];
  const couplings = [];
  for (const c of f.couplingCands) { const m = matchCoupling(c); if (m) { const row = { kind: c.kind, lit: short(c.text, 80), line: c.line, symbol: c.symbol, ...m }; couplings.push(row); formatCouplings.push({ file: rel, ...row }); } }
  for (const lit of f.literals) {
    if (lit.format) {
      const m = matchFormat(lit.text);
      if (m) {
        const c = { lit: lit.text, line: lit.line, ctx: lit.ctx, symbol: lit.symbol, match: m.match, jini: `${display(m.fm.abs)}${m.fm.line ? `:${m.fm.line}` : ""}`, jiniSymbol: m.fm.symbol, jiniExported: m.fm.exported, jiniPattern: m.fm.pattern };
        formats.push(c); formatCouplings.push({ file: rel, ...c });
      }
    }
    if (lit.residue) residue.push({ lit: lit.text, line: lit.line, ctx: lit.ctx, symbol: lit.symbol, hit: lit.residue });
  }
  const stale = /\/vendor\//.test(rel) ? [] : f.staleCandidates.filter((c) => !staleOk(c));
  const twins = (twinsByFile.get(rel) ?? []).sort((a, b) => b.sim - a.sim);
  const implPorts = portsByImpl.get(abs) ?? [];
  // Tier 2 only when ANOTHER file wires this file's exported function/class into a Jini port: the
  // implementer does not know it is one (canary-2 project-scope). Local handlers in the wiring
  // file itself, and data (i18n dictionaries, metadata consts), are plain host wiring.
  const portTriggers = implPorts.filter((e) => e.crossFile && (e.implKind === "function" || e.implKind === "class"));
  const sitePorts = portsBySite.get(abs) ?? [];
  const scc = sccOf.get(info.feature); const sccSize = sccs[scc].length;
  // A body made only of register*(app, deps) calls is route wiring: its cycle edge is no logic.
  const registerOnly = fnUnits.length > 0 && fnUnits.every((u) => u.registerOnly || u.kind === "alias");
  const cycleTargets = registerOnly ? [] : [...(crossEdges.get(abs) ?? [])].filter((ft) => mutual(info.feature, ft));
  const legacy = legacyByFile.get(abs);
  // v4: drop packages another named package (or this app's own Jini package) already depends on.
  const appPkg = `@jini-ai/${appOf(abs)}`; const appDeps = jiniPkgs.has(appPkg) ? depsOf(appPkg) : new Set();
  const nonCore0 = [...valuePkgs].filter((pk) => !CORE_PKGS.has(pk) && pk !== appPkg && !appDeps.has(pk));
  const nonCore = nonCore0.filter((pk) => !nonCore0.some((o) => o !== pk && depsOf(o).has(pk))).sort();
  const wire = wireCouplings(abs); const tt = ttCouplings.get(abs) ?? [];
  for (const w of wire) formatCouplings.push({ file: rel, kind: w.kind, lit: w.lit, line: w.line, symbol: w.symbol, with: w.with, cross: w.cross });
  for (const c of tt) formatCouplings.push({ file: rel, ...c });
  // Barrel by ratio (round-2 judge 2 #6: S/index.ts, 118 exports, lost BARREL to one real function).
  const reCount = f.reexports.size + f.stars.length; const reRatio = reCount / Math.max(1, reCount + f.localExports.size);
  const barrelish = f.reexportOnly || (reCount >= 10 && reRatio >= 0.9 && fnUnits.length <= 2 && f.units.every((u) => u.kind !== "class"));
  const boundary = boundaryEntries.has(rel);
  // Small helpers in a mixed file (round-2 judge 2: under ~12 lines -> default STAY).
  const fnLen = (u) => (u.endLine ?? u.line) - u.line + 1;
  const smallHelpers = fnUnits.some((u) => u.kind === "fn" && fnLen(u) > SMALL_HELPER_LINES) ? fnUnits.filter((u) => u.kind === "fn" && fnLen(u) <= SMALL_HELPER_LINES).map((u) => `${u.name}@${u.line}(${fnLen(u)}l)`) : [];

  // ---- tier suggestion (refined rules + canary-2's changed Tier 2 trigger) ----
  const why = [];
  let tier = 1; let auto = null;
  const classes = f.units.filter((u) => u.kind === "class");
  // v4 (judge 1 #5, judge 3 #10): a boundary label needs >= 1 prod importer (agent-daemon-port.ts had 0);
  // an `import()` target is a lazily loaded boundary too (direct counts: the barrel had direct.prod 4).
  const lazy = dynTargets.has(abs); const hasProd = prod.length > 0 || dProd.length > 0;
  const boundaryOk = (boundary || lazy) && hasProd;
  // v4 (judge 2 #1): TINY-EXTENDS-ADAPTER = every class is `constructor(x) { super(f(x)) }` and nothing else
  // (identity/members repo.sqlite.ts, many classes per file); a class overriding ANY method
  // (media-provider-credential-repo.ts replaceWorkspace) never is. Small helpers next to them are fine.
  const fnOnly = fnUnits.filter((u) => u.kind === "fn");
  const ctorAdapters = classes.length > 0 && ext.length === classes.length && ext.every((x) => x.ctorOnly && !x.overrides?.length)
    && fnOnly.length <= 2 && fnOnly.every((u) => (u.endLine ?? u.line) - u.line + 1 <= SMALL_HELPER_LINES);
  if (f.jiniShim && !boundary) auto = "JINI-SHIM (DELETE + repoint importers)";
  else if (barrelish && boundaryOk) auto = lazy && !boundary ? "BOUNDARY-ENTRY (import() target, STAY)" : "BOUNDARY-ENTRY (promoted surface, STAY)";
  else if (barrelish) auto = "BARREL (R4)";
  else if (ext.some((x) => !x.iface && x.members === 0) && f.units.every((u) => u.kind === "class")) auto = "EMPTY-SUBCLASS (R4)";
  else if (ctorAdapters) auto = "TINY-EXTENDS-ADAPTER (R4)";
  // i18n/copy dictionaries first: their few `t()` wrappers would otherwise read as R3 pass-throughs.
  else if (f.dataIsh && classes.length === 0 && jiniCallUnits.length === fnUnits.length) auto = "DATA-ONLY";
  else if (fnUnits.length > 0 && jiniCallUnits.length === fnUnits.length && classes.length === 0 && f.loc <= 80) auto = fedHost ? "STAY-WIRING?" : "ALL-PASS-THROUGH (R3)";
  else if (f.toolRegistration && f.loc <= 120) auto = "TOOL-REGISTRATION (R9)";
  if (auto) { tier = 0; why.push(auto); }
  // STAY-WIRING? needs a look to confirm; an approval handler or ctx.signal is behaviour (pilot ABC #7).
  if (auto === "STAY-WIRING?") tier = 1;
  if (tier === 0 && f.approvalOrCtxSignal) { tier = 1; why.push("approval/ctx.signal (Tier >= 1)"); }
  const strong = twins.filter(isStrongTwin);
  if (strong.length) why.push(`strong-twin x${strong.length}`);
  if (portTriggers.length) why.push(`port-impl x${portTriggers.length}`);
  if (formats.length) why.push(`private-format x${formats.length}`);
  if (couplings.length) why.push(`string-coupling x${couplings.length}`);
  // v4 (judge 3 #9): tier from the file's OWN signals. A LEGACY-TWIN lifts only a file that itself shares
  // >= LEGACY_OWN_MIN_SHARED distinctive tokens with the Jini module (not every file of the folder).
  const legacyOwn = legacy ? [...behOf([abs])].filter((t) => legacy.jbeh.has(t)).length : 0;
  const legacyLift = !!legacy && legacyOwn >= LEGACY_OWN_MIN_SHARED;
  if (legacy) why.push(`LEGACY-TWIN ${legacy.jini} j${legacy.sim}/o${legacy.overlap}${legacy.state === "UNMOUNTED-REWRITE" ? " UNMOUNTED-REWRITE" : ""}${legacyLift ? "" : ` (module only, own ${legacyOwn} tokens: no lift)`}`);
  // v4 (judge 1 #10): implements an imported Jini port type, or has a code twin in Jini at sim >= 0.6, or
  // is one side of a module-level Jini twin: Tier 2 (it is a copy or an adapter of a Jini contract).
  const jiniPort = f.implementsNames.filter((x) => isJiniOrigin(resolveBinding(abs, x.iface))).map((x) => `${x.cls} implements ${x.iface}`);
  const JINI_CODE_KINDS = /^(body|exact-small|same-name|norm-body|beh|class-api|class-fingerprint)$/;
  const jiniTwin = twins.filter((p) => p.scope === "tovu-jini" && JINI_CODE_KINDS.test(p.kind) && p.sim >= 0.6 && !(p.kind === "exact-small" && (p.chars ?? 0) < 60));
  const modTwins = moduleTwinsByFile.get(rel) ?? [];
  const errC = errCouplingsOf(abs);
  for (const c of errC) formatCouplings.push({ file: rel, kind: "err-message", lit: short(c.text, 80), line: c.line, symbol: c.symbol, with: c.with.join(", "), op: c.op });
  if (jiniPort.length) why.push(`implements-jini-port x${jiniPort.length}`);
  if (jiniTwin.length) why.push(`jini-twin>=0.6 x${jiniTwin.length}`);
  if (modTwins.length) why.push(`module-twin ${modTwins[0].jini} (${modTwins[0].sum})`);
  if (errC.length) why.push(`err-message x${errC.length}`);
  const wireCross = wire.filter((w) => w.cross); const ttCross = tt.filter((c) => c.cross);
  if (wireCross.length) why.push(`wire-key x${wireCross.length}`);
  if (ttCross.length) why.push(`parsed-line x${ttCross.length}`);
  if (cycleTargets.length) why.push(`cycle-edge -> ${cycleTargets.join(", ")}`);
  // Types diverging from a same-name Jini type count only when they mostly agree (members overlap >= 0.5):
  // that is ABI drift of one contract, not two unrelated types sharing a name.
  const diverged = sameName.filter((s) => s.verdict === "diverged" && (s.tovuOnly ? s.sim >= 0.5 : true) && !ext.some((x) => x.jiniSameName && x.name === s.name));
  if (diverged.length) why.push(`diverged-pair x${diverged.length}`);
  // A cycle edge alone does not lift an R3/R4 mechanical file: it matters for batching, not reading.
  // Port-impl alone is Tier 1 (binding-only files were over-promoted, pilot ABC #7); it lifts to
  // Tier 2 only with a body twin (any score) next to it. A body twin >= 0.8 or LEGACY-TWIN is Tier 2.
  const bodyTwin = twins.some((p) => p.kind === "body" && p.scope !== "tovu-jini-fixture");
  // v3: a cycle edge alone no longer lifts a file under 40 lines (round-2 judge 3 #5: 11-line
  // conversation-refresh). A key/line another app or feature reads by name (wire-key, parsed-line) is Tier 2.
  // v4 (judge 3 #9): no cycle lift for barrels or pure binding files (no function or class of their own).
  const ownLogic = !barrelish && (fnOnly.length > 0 || classes.length > 0);
  if (strong.length || (portTriggers.length && bodyTwin) || formats.length || couplings.length || legacyLift || diverged.length || wireCross.length || ttCross.length || (cycleTargets.length && tier !== 0 && f.loc >= 40 && ownLogic)
    || jiniPort.length || jiniTwin.length || modTwins.length || errC.length) tier = 2;
  if (tier === 1 && ext.some((x) => x.jiniSameName)) why.push("extends Jini same-name (Tier 1)");

  // v4 (judge 2 #6): dead re-exports, counted per symbol THROUGH the barrel: no prod file names it via this
  // file, and its origin has no prod user either (media index.ts, the consent cluster).
  const deadRe = [];
  if (reCount >= 3) for (const n of exportNames(abs)) {
    if (n === "default" || n === "*" || f.localExports.has(n)) continue;
    if (namedUsers(abs, n).some((x) => x !== abs)) continue;
    const o = resolveExport(abs, n);
    if (o?.abs && files.get(o.abs).repo === "tovu" && (namedUsers(o.abs, o.name).some((x) => x !== abs) || facts.get(o.abs).selfUses.get(o.name))) continue;
    if (o && !o.abs) continue; // Jini/npm origin: its users are outside this graph
    deadRe.push(n);
  }
  const reach = deadSet.has(abs) ? (deadRoot.has(abs) ? "dead-root (0 prod importers, not an entry)" : "dead-cluster (every prod importer is dead)")
    : hermeticOnly.has(abs) ? "hermetic-only (reached only through the in-memory composition)" : null;
  // v4 (judge 2 #6): a row whose label says keep (STAY/BOUNDARY/TOOL-REGISTRATION) but is dead contradicts itself.
  const labelConflict = deadSet.has(abs) && /STAY|BOUNDARY|TOOL-REGISTRATION/.test(auto ?? "") ? `${auto} but ${reach}` : null;
  if (labelConflict) why.push("LABEL-CONFLICT");
  // A mechanical barrel hiding >= 10 dead re-exports needs a read (judge 2 #6: media index.ts, ~49).
  if (tier === 0 && deadRe.length >= 10) { tier = 1; why.push(`dead-reexports x${deadRe.length} (Tier >= 1)`); }
  const row = { path: rel, feature: info.feature, loc: f.loc, tier, why, ...(auto ? { auto } : {}),
    imports: { ...(T.length ? { T } : {}), ...(J.length ? { J } : {}), ...(N.size ? { N: [...N] } : {}), ...(NPM.size ? { npm: [...NPM] } : {}), ...(missing.length ? { unresolved: missing } : {}) },
    importers: { prod: prod.length, tests: testCount.get(abs) ?? 0, aux, ...(prod.length ? { list: prod.slice(0, LIST_CAP) } : {}),
      direct: { prod: dProd.length, reexporters: dRe, tests: dTests, ...(dProd.length && !prod.length ? { list: dProd.map(display).sort().slice(0, LIST_CAP) } : {}) } },
    // Never truncated (round-2 judge 3 #9: AssistantDock.hooks.tsx stopped at 40 of 55 and the cap was read as omission).
    exports: exportsList, exportsTotal: exportsList.length,
    ...(exportImporters.length > 1 || testOnly.length ? { exportProdImporters: exportImporters.map((x) => `${x.n}:${x.prod}/${x.tests}t${f.selfUses.get(x.n) ? "+self" : ""}`) } : {}),
    ...(testOnly.length ? { testOnlyExports: testOnly.slice(0, LIST_CAP) } : {}),
    ...(unused.length && allExported.length ? { noStaticImporter: unused.slice(0, LIST_CAP) } : {}),
    ...(legacy ? { legacyTwin: { tovuModule: legacy.tovu, jini: legacy.jini, sim: legacy.sim, overlap: legacy.overlap, shared: legacy.shared, mounts: legacy.mounts, mountsTotal: legacy.mountsTotal, mountsInside: legacy.mountsInside } } : {}),
    // v4 (judge 3 #11): not on files labelled STAY (wiring / boundary): they stay in Tovu by definition.
    ...(nonCore.length >= 2 && !/STAY/.test(auto ?? "") ? { coreContractNeeded: nonCore } : {}),
    ...(boundary ? { boundaryEntry: true } : {}),
    ...(reach ? { prodReach: reach } : {}), ...(labelConflict ? { labelConflict } : {}),
    ...(pathRoots.has(abs) ? { pathLoaded: pathRoots.get(abs) } : {}), ...(lazy ? { lazyImported: true } : {}),
    ...(deadRe.length ? { deadReexports: deadRe.slice(0, LIST_CAP), deadReexportsTotal: deadRe.length } : {}),
    ...(deadMembers.has(abs) ? { deadMembers: deadMembers.get(abs).slice(0, LIST_CAP) } : {}),
    ...(clientNoRoute.has(abs) ? { clientRoutesNoServer: clientNoRoute.get(abs).slice(0, LIST_CAP) } : {}),
    ...(jiniPort.length ? { implementsJiniPort: jiniPort.slice(0, LIST_CAP) } : {}),
    ...(modTwins.length ? { moduleTwins: modTwins.slice(0, 3).map((m) => `${m.jini} sum ${m.sum} (${m.units}/${m.tovuUnits} units; ${m.matched.join(", ")})${m.jiniPublic ? "" : " [private]"}`) } : {}),
    ...(errC.length ? { errMessageCouplings: errC.slice(0, LIST_CAP).map((c) => `${c.op} "${short(c.text, 60)}" @${c.line} ~ ${c.with.join(", ")}`) } : {}),
    ...(smallHelpers.length ? { smallHelpers: smallHelpers.slice(0, LIST_CAP) } : {}),
    ...(wire.length ? { wireKeys: wire.slice(0, LIST_CAP).map((w) => `${w.kind} "${w.lit}" @${w.line} ~ ${w.with.join(", ")}${w.total > w.with.length ? ` (+${w.total - w.with.length})` : ""}${w.cross ? "" : " (same feature)"}`) } : {}),
    ...(tt.length ? { parsedLines: tt.slice(0, LIST_CAP).map((c) => `${c.kind} "${c.lit}"${c.line ? ` @${c.line}` : ""} ~ ${c.with}${c.cross ? "" : " (same feature)"}`) } : {}),
    ...(rules.length ? { rules } : {}),
    ...(couplings.length ? { stringCouplings: couplings.slice(0, LIST_CAP).map((c) => `${c.kind} "${c.lit}" @${c.line} [in ${c.symbol ?? "?"}] ~ ${c.jini}${c.jiniFiles > 1 ? ` (+${c.jiniFiles - 1})` : ""}`) } : {}),
    ...(sameName.length ? { jiniSameName: sameName.slice(0, LIST_CAP) } : {}),
    ...(ext.length ? { extends: ext.map((x) => `${x.name} extends ${x.origin} [${x.where}${x.jiniSameName ? ", same-name" : ""}, ${x.members} members]`) } : {}),
    ...(passThrough.length ? { passThrough } : {}),
    ...(twins.length ? { twins: twins.slice(0, 8).map((p) => `${p.kind}${p.sim < 1 || p.kind === "body" ? ` ${p.sim}` : ""} ${p.self} ~ ${p.other}${p.sameName ? " (same name)" : ""}`), twinsTotal: twins.length } : {}),
    ...(implPorts.length ? { implementsPorts: implPorts.sort((a, b) => b.crossFile - a.crossFile).slice(0, LIST_CAP).map((e) => `${e.symbol} -> ${e.port} @ ${e.site}${e.crossFile ? "" : " (same file)"}`) } : {}),
    ...(sitePorts.length ? { wiresPorts: sitePorts.length } : {}),
    ...(formats.length ? { privateFormats: formats.map((c) => `"${c.lit}" @${c.line} [${c.ctx}, in ${c.symbol}] ${c.match} ${c.jini} (${c.jiniSymbol ?? "?"}${c.jiniExported === false ? ", module-private" : c.jiniExported ? ", exported" : ""})`) } : {}),
    ...(residue.length ? { productLiterals: residue.slice(0, LIST_CAP).map((r) => `"${r.lit}" @${r.line} [${r.ctx}, in ${r.symbol ?? "?"}]`), productLiteralsTotal: residue.length } : {}),
    ...(stale.length ? { staleRefs: stale.slice(0, LIST_CAP).map((s) => `${s.ref}${s.kind === "line" ? ` (line ${s.refLine} past end)` : s.kind === "jini-spec" ? " (not in exports map)" : ""} @${s.line}`) } : {}),
    ...(sccSize > 1 ? { scc: { id: scc, features: sccSize, ...(cycleTargets.length ? { edgesInto: cycleTargets } : {}) } } : {}),
  };
  if (f.fnCount > 0) {
    const b = f.bug; const verbs = new Set(b.crud.map((c) => CRUD_RE.exec(c.split("@")[0])[1]));
    // Bare verb-noun calls count only when the callee writes: a local symbol with a direct write, or an
    // imported Tovu/Jini symbol with one (one hop); npm callees count only from fs/db drivers.
    const bareKept = f.bareWrites.filter((w) => {
      if (f.bindings.has(w.callee)) {
        const o = resolveBinding(abs, w.callee); if (!o) return false;
        if (o.abs) return !!facts.get(o.abs)?.directWriteSyms.has(o.name);
        if (o.jini) { w.text += " (jini, unresolved)"; return true; }
        return /^(node:)?fs|sqlite|^pg$|postgres|kysely|drizzle/.test(o.ext ?? "");
      }
      return f.directWriteSyms.has(w.callee);
    });
    const writes = [...b.writes, ...bareKept.map((w) => w.text)];
    // storeOps only in a file that really writes (round-2: URI builders, file reads, stdio helpers).
    const store = writes.length > 0 && [...verbs].some((v) => CRUD_WRITE.has(v)) && [...verbs].some((v) => !CRUD_WRITE.has(v));
    // writesWithSignal is gone: a count of `signal` arguments was read as cancellation evidence (pilot ABC #5).
    const bugRow = { ...(store ? { storeOps: b.crud.slice(0, 20) } : {}), ...(b.signalParams.length ? { acceptsSignal: b.signalParams.slice(0, 10) } : {}),
      ...(b.abortChecks.length ? { abortChecks: [...new Set(b.abortChecks)].slice(0, 10) } : {}), ...(b.forwards.length ? { forwardsSignal: b.forwards.slice(0, 10) } : {}),
      ...(b.awaitGaps.length ? { awaitAfterAbortCheck: b.awaitGaps.slice(0, 8) } : {}), ...(b.listenerGaps.length ? { awaitBeforeCloseListener: b.listenerGaps.slice(0, 8) } : {}),
      ...(b.swallows.length ? { swallows: b.swallows.slice(0, 10) } : {}), ...(b.wholePut.length ? { wholePut: b.wholePut.slice(0, 8) } : {}),
      ...(writes.length ? { writes: writes.slice(0, 12), writesTotal: writes.length } : {}),
      ...(b.secretLogs.length ? { secretToLog: b.secretLogs.slice(0, 6) } : {}), ...(b.cachedPromise.length ? { cachedPromiseNoReset: b.cachedPromise.slice(0, 6) } : {}),
      ...(b.ctxNoSignal.length ? { ctxSignalUnread: b.ctxNoSignal.slice(0, 6) } : {}), ...(b.filterAfterPage.length ? { filterAfterPaging: b.filterAfterPage.slice(0, 6) } : {}),
      ...(f.batchPin ? { batchPin: "prepared/approval batch pins a hash/version in prepare: two items on one target conflict" } : {}) };
    if (Object.keys(bugRow).length) row.bug = bugRow;
  }
  rowsOut.set(abs, row);
}
// Twin-group lift (round-2 judge 3 #5: use-chat-display-preferences sat at Tier 1 while its two twins
// were Tier 2): Tovu<->Tovu near-copies are read together, so the lower one takes the higher tier.
// Tier 0 (mechanical) files are not lifted.
let twinLifted = 0;
{
  const relAbs = new Map(mainFiles.map((a) => [files.get(a).rel, a]));
  for (let changed = true; changed;) { changed = false;
    for (const p of twinPairs) {
      // v4 (judge 2 #4): const twins never lift a tier, here either (MAX_FIELD_LENGTH = 512 in three files).
      if (p.scope !== "tovu-tovu" || !(isStrongTwin(p) || (p.sim >= 0.9 && !/^(shape-names|wiring|const-value|const-set|beh)$/.test(p.kind)))) continue;
      const A = rowsOut.get(relAbs.get(p.a)), B = rowsOut.get(relAbs.get(p.b)); if (!A || !B || A === B) continue;
      if (A.tier === B.tier || Math.min(A.tier, B.tier) === 0) continue;
      const [lo, hi] = A.tier < B.tier ? [A, B] : [B, A];
      lo.tier = hi.tier; lo.why.push(`twin-group lift <- ${hi.path}`); twinLifted++; changed = true;
    }
  }
}
// files.jsonl <-> legacy-twins.jsonl consistency (round-2 judge 1 #1): every row's legacyTwin must be a
// record that lists the row's path in tovuFiles.
const legacyMismatch = [...rowsOut.values()].filter((r) => r.legacyTwin && !legacyTwins.some((l) => l.tovu === r.legacyTwin.tovuModule && l.jini === r.legacyTwin.jini && l.tovuFiles.includes(r.path))).length;
if (legacyMismatch) console.error(`WARNING: ${legacyMismatch} rows carry a legacyTwin that legacy-twins.jsonl does not list`);

// ---------------------------------------------------------------------------------------------
// Batches: each SCC together, leaf-first; <= BATCH_MAX_FILES files AND <= BATCH_MAX_LOC lines per
// batch, whole features where possible (pilot: file-count-only batches reached 9k lines).
// ---------------------------------------------------------------------------------------------
const filesByFeature = new Map();
for (const a of mainFiles) { const ft = files.get(a).feature; if (!filesByFeature.has(ft)) filesByFeature.set(ft, []); filesByFeature.get(ft).push(a); }
const batches = [];
sccs.forEach((comp, sccId) => {
  let cur = [];
  const flush = () => { if (cur.length) batches.push({ scc: sccId, sccFeatures: comp, files: cur }); cur = []; };
  // Leaf-first inside an SCC too (greedy feedback-arc order, Eades et al.): take a feature with no
  // edges into the rest; if none, the one with the lowest out-minus-in. A mutual partner follows
  // at once so both sides of a direct cycle land in the same or the next batch.
  const order = []; const rem = new Set(comp);
  const outIn = (x) => [...(featureEdges.get(x) ?? [])].filter((z) => rem.has(z) && z !== x).length;
  const inIn = (x) => [...rem].filter((z) => z !== x && featureEdges.get(z)?.has(x)).length;
  while (rem.size) {
    const pick = [...rem].find((x) => outIn(x) === 0) ?? [...rem].sort((a, b) => (outIn(a) - inIn(a)) - (outIn(b) - inIn(b)) || a.localeCompare(b))[0];
    order.push(pick); rem.delete(pick);
    // Smallest partners first so they share the picked feature's batch where they fit.
    for (const partner of [...rem].filter((z) => mutual(pick, z)).sort((a, b) => filesByFeature.get(a).length - filesByFeature.get(b).length || a.localeCompare(b))) { order.push(partner); rem.delete(partner); }
  }
  const locOf = (a) => facts.get(a).loc; let curLoc = 0;
  const flushLoc = () => { flush(); curLoc = 0; };
  for (const ft of order) {
    const list = filesByFeature.get(ft).sort((a, b) => files.get(a).rel.localeCompare(files.get(b).rel));
    const listLoc = list.reduce((s, a) => s + locOf(a), 0);
    // A whole feature that does not fit the open batch starts a new one (order keeps cycle partners adjacent).
    if (cur.length && (cur.length + list.length > BATCH_MAX_FILES || curLoc + listLoc > BATCH_MAX_LOC)) flushLoc();
    for (const a of list) {
      if (cur.length && (cur.length + 1 > BATCH_MAX_FILES || curLoc + locOf(a) > BATCH_MAX_LOC)) flushLoc();
      cur.push(a); curLoc += locOf(a);
    }
  }
  flushLoc();
});

// ---------------------------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------------------------
fs.mkdirSync(path.join(OUT, "batches"), { recursive: true });
for (const old of fs.readdirSync(path.join(OUT, "batches"))) fs.rmSync(path.join(OUT, "batches", old));
const batchIndex = batches.map((b, i) => {
  const id = `b${String(i + 1).padStart(3, "0")}`;
  const rows = b.files.map((a) => rowsOut.get(a));
  fs.writeFileSync(path.join(OUT, "batches", `${id}.jsonl`), rows.map((r) => JSON.stringify({ batch: id, ...r })).join("\n") + "\n");
  const tiers = [0, 1, 2].map((t) => rows.filter((r) => r.tier === t).length);
  const feats = new Set(rows.map((r) => r.feature));
  // LEGACY-TWIN on the batch too: the reviewer must read the Jini module before labelling any file.
  const legacy = [...new Map(b.files.map((a) => legacyByFile.get(a)).filter(Boolean).map((l) => [`${l.tovu}|${l.jini}`, l])).values()]
    .map((l) => ({ tovu: l.tovu, jini: l.jini, sim: l.sim, mounts: l.mounts }));
  return { id, scc: b.scc, _feats: feats, sccFeatures: b.sccFeatures.length > 6 ? `${b.sccFeatures.length} features` : b.sccFeatures, features: [...new Set(rows.map((r) => r.feature))], files: rows.length, loc: rows.reduce((s, r) => s + r.loc, 0), tiers, ...(legacy.length ? { legacyTwins: legacy } : {}) };
});
// Cross-reference: batches holding a direct-cycle partner of one of this batch's features.
for (const b of batchIndex) {
  b.cyclePartnerBatches = batchIndex.filter((o) => o !== b && [...b._feats].some((x) => [...o._feats].some((y) => mutual(x, y)))).map((o) => o.id);
}
fs.writeFileSync(path.join(OUT, "batches.json"), JSON.stringify(batchIndex.map(({ _feats, ...b }) => b), null, 1));
const tsvRows = [...rowsOut.values()].sort((a, b) => a.path.localeCompare(b.path));
const batchOf = new Map(); batches.forEach((b, i) => b.files.forEach((a) => batchOf.set(rowsOut.get(a).path, `b${String(i + 1).padStart(3, "0")}`)));
fs.writeFileSync(path.join(OUT, "files.tsv"), ["path\tfeature\tbatch\tloc\ttier\twhy\tprod_importers\ttests", ...tsvRows.map((r) => [r.path, r.feature, batchOf.get(r.path), r.loc, r.tier, r.why.join("; "), r.importers.prod, r.importers.tests].join("\t"))].join("\n") + "\n");
const tests = [...files].filter(([, i]) => i.role === "test").map(([a, i]) => {
  const subj = [...new Set((fileEdges.get(a) ?? []).filter((e) => e.to && files.get(e.to)?.role === "main").map((e) => display(e.to)))];
  return [i.rel, i.feature ?? "", facts.get(a)?.loc ?? 0, subj.slice(0, 8).join(", ")].join("\t");
});
fs.writeFileSync(path.join(OUT, "tests.tsv"), ["path\tfeature\tloc\tsubjects", ...tests].join("\n") + "\n");
const jsonl = (name, list) => fs.writeFileSync(path.join(OUT, name), list.map((x) => JSON.stringify(x)).join("\n") + "\n");
jsonl("twins.jsonl", twinPairs.sort((a, b) => b.sim - a.sim));
jsonl("port-edges.jsonl", portEdges.map(({ siteAbs, implAbs, ...e }) => e));
jsonl("format-couplings.jsonl", formatCouplings);
jsonl("legacy-twins.jsonl", legacyTwins.sort((a, b) => b.sim - a.sim));
jsonl("jini-rules.jsonl", jiniRules);
jsonl("composition-drift.jsonl", compositionDrift);
jsonl("module-twins.jsonl", moduleTwins);
jsonl("wire-drift.jsonl", wireDrift);
// TOOL-CALL check (theme 12; design view: permission declared on the tool, enforced centrally by the runner).
// One row per tool definition (object literal with name + authorization, or name + inputSchema + description).
// Hand-written checks, ctx.signal, hand parsing and generic errors are per FILE (handlers share a file).
const toolRows = []; const toolFileList = mainFiles.filter((a) => facts.get(a).toolFile);
for (const abs of mainFiles) { const f = facts.get(abs); if (!f.tools.length) continue; const tf = f.toolFile ?? { checks: [], ctxSignal: false, handParse: 0, generic: [] }; const ti = testInfo.get(abs);
  for (const t of f.tools) toolRows.push({ tool: t.name, file: display(abs), line: t.line, declaredPermission: t.permission, hasAuthorization: t.hasAuthorization, hasSchema: t.hasSchema,
    fileHandChecks: tf.checks.length, handCheckNames: [...new Set(tf.checks.map((c) => `${c.fn}${c.perm ? `(${c.perm})` : ""}`))].slice(0, 8),
    readsCtxSignal: tf.ctxSignal, handParsedInput: tf.handParse, genericErrors: tf.generic.slice(0, 4),
    // namesTool: an importing test names the tool (a registration file's test often covers only a few tools).
    test: ti ? { files: ti.files, asserts: ti.asserts, coversDenied: ti.denied, coversBadInput: ti.badInput, namesTool: !!t.name && [...testsOf.get(abs)].some((x) => readTest(x).includes(t.name)) } : null }); }
// Permission names DEFINED (const X_PERMISSION = "x") in more than one Tovu file, plus Jini.
const permDefs = new Map(); for (const [abs, f] of facts) { const i = files.get(abs); if (i.role !== "main" && !(i.role === "jini" && !i.fixture)) continue; for (const p0 of f.permLits) if (p0.def) { if (!permDefs.has(p0.value)) permDefs.set(p0.value, new Set()); permDefs.get(p0.value).add(display(abs)); } }
const permDup = [...permDefs].filter(([, s2]) => s2.size > 1);
const permDupTovu = permDup.filter(([, s2]) => [...s2].filter((x) => !x.startsWith("jini:")).length > 1);
const toolTotals = { tools: toolRows.length, toolDefFiles: new Set(toolRows.map((r) => r.file)).size, toolFiles: toolFileList.length,
  handChecks: toolFileList.reduce((n, a) => n + facts.get(a).toolFile.checks.length, 0), handCheckFiles: toolFileList.filter((a) => facts.get(a).toolFile.checks.length).length,
  permDefinedTwice: permDup.length, permDefinedTwiceTovu: permDupTovu.length, ctxSignalFiles: toolFileList.filter((a) => facts.get(a).toolFile.ctxSignal).length,
  handParseFiles: toolFileList.filter((a) => facts.get(a).toolFile.handParse).length, genericErrorFiles: toolFileList.filter((a) => facts.get(a).toolFile.generic.length).length,
  noDeclaredPermission: toolRows.filter((r) => !r.declaredPermission).length, noTest: toolRows.filter((r) => !r.test).length, noNamedTest: toolRows.filter((r) => !r.test?.namesTool).length, testNoDenied: toolRows.filter((r) => r.test && !r.test.coversDenied).length };
jsonl("tool-calls.jsonl", toolRows);
fs.writeFileSync(path.join(OUT, "permission-defs.json"), JSON.stringify(Object.fromEntries(permDup.map(([k, v]) => [k, [...v]])), null, 1));
fs.writeFileSync(path.join(OUT, "stamp.json"), JSON.stringify({ built: new Date().toISOString(), tovu: { dir: TOVU, head: head(TOVU) }, jini: { dir: JINI, head: head(JINI) } }, null, 1));
fs.writeFileSync(path.join(OUT, "sccs.json"), JSON.stringify(sccs.map((c, i) => ({ id: i, features: c, files: c.reduce((s, ft) => s + (filesByFeature.get(ft)?.length ?? 0), 0) })).filter((x) => x.features.length > 1), null, 1));

const all = [...rowsOut.values()];
const tierCount = [0, 1, 2].map((t) => all.filter((r) => r.tier === t).length);
const tierLoc = [0, 1, 2].map((t) => all.filter((r) => r.tier === t).reduce((s, r) => s + r.loc, 0));
const autoCount = {}; for (const r of all) if (r.auto && r.tier === 0) autoCount[r.auto] = (autoCount[r.auto] ?? 0) + 1;
const trig = { "strong-twin": 0, "port-impl": 0, "private-format": 0, "string-coupling": 0, "wire-key": 0, "parsed-line": 0, "LEGACY-TWIN": 0, "cycle-edge": 0, "diverged-pair": 0, "twin-group lift": 0,
  "implements-jini-port": 0, "jini-twin>=0.6": 0, "module-twin": 0, "err-message": 0 };
for (const r of all) for (const w of r.why) for (const k of Object.keys(trig)) if (w.startsWith(k) && !(k === "LEGACY-TWIN" && w.includes("no lift"))) trig[k]++;
const multi = sccs.filter((c) => c.length > 1);
const ruleCount = (r) => jiniRules.filter((x) => x.rule === r).length;
const pkgPairs = new Map(); for (const r of jiniRules) if (r.rule === "imports-non-core") { const k = `${r.pkg} -> ${r.imports}`; pkgPairs.set(k, (pkgPairs.get(k) ?? 0) + 1); }
const dirtySlice = (() => { try { return execFileSync("git", ["-C", TOVU, "status", "--porcelain", "--", "apps", "packages"], { encoding: "utf8" }).split("\n").filter(Boolean).length; } catch { return "?"; } })();
const runtime = ((Date.now() - t0) / 1000).toFixed(1);
const summary = `# Extraction dossier — ${today}

Generated by \`development/scripts/extraction-dossier.mjs\` in ${runtime}s (parse ${((tParse - t0) / 1000).toFixed(1)}s). Facts only, no judgement.

- Tovu: \`${TOVU}\` @ ${git(TOVU)} (HEAD ${head(TOVU)}); Jini: \`${JINI}\` @ ${git(JINI)} (HEAD ${head(JINI)}). Uncommitted changes under apps/ packages/ at build: ${dirtySlice}.
- Drift check for reviewers: \`node development/scripts/extraction-dossier.mjs --drift <this dir> [--batch bNNN]\` prints "commits since build touching slice files: N".
- Files: ${mainFiles.length} labelled (non-test) Tovu files, ${[...files.values()].filter((i) => i.role === "test").length} test files (tests.tsv), ${tovuAux.length} aux importer-only files (development/, content/), ${jiniFiles.length} Jini src files. Parse errors: ${parseErrors}.

## Tiers (suggestion)

| Tier | Files | Lines |
|---|---|---|
| 0 | ${tierCount[0]} | ${tierLoc[0]} |
| 1 | ${tierCount[1]} | ${tierLoc[1]} |
| 2 | ${tierCount[2]} | ${tierLoc[2]} |

Tier 0 reasons: ${Object.entries(autoCount).map(([k, v]) => `${k} ${v}`).join(", ")}.
Tier 2 triggers (files; a file can have several): ${Object.entries(trig).map(([k, v]) => `${k} ${v}`).join(", ")}.

## Cross-file facts

- Twin pairs: ${twinPairs.length} (${["body", "norm-body", "same-file", "beh", "exact-small", "small-shape", "same-name", "const-set", "const-value", "shape", "shape-names", "wiring", "class-api", "class-fingerprint"].map((k) => `${k} ${twinPairs.filter((p) => p.kind === k).length} [Tovu-Jini ${twinPairs.filter((p) => p.kind === k && p.scope === "tovu-jini").length}]`).join("; ")}). Strong (Tier 2 trigger): ${twinPairs.filter(isStrongTwin).length}. Jini-fixture pairs: ${twinPairs.filter((p) => p.scope === "tovu-jini-fixture").length}. Same-port body pairs dropped: ${suppressedSamePort}; same-interface class pairs dropped: ${suppressedSameIface}; const pairs with different values dropped: ${droppedConstDiff}. Module-level Jini twins: ${moduleTwins.length} files->Jini files (${moduleTwins.filter((m) => m.jiniPublic).length} public; module-twins.jsonl). LSH buckets skipped as generic idioms: ${skippedBuckets}.
- LEGACY-TWIN modules: ${legacyTwins.length} (${legacyTwins.filter((l) => l.state === "UNMOUNTED-REWRITE").length} UNMOUNTED-REWRITE; WIRE-DRIFT rows ${wireDrift.length}: route ${wireDrift.filter((w) => w.kind === "route").length}, permission ${wireDrift.filter((w) => w.kind === "permission").length}, wire-drift.jsonl) (${legacyByFile.size} Tovu files, ${all.filter((r) => r.legacyTwin && r.why.some((w) => w.includes("no lift"))).length} module-only without lift; legacy-twins.jsonl, each record lists its tovuFiles; row/record mismatches: ${legacyMismatch}). STAY-WIRING? files: ${all.filter((r) => r.auto === "STAY-WIRING?").length}. CORE-CONTRACT-NEEDED files (value imports): ${all.filter((r) => r.coreContractNeeded).length}.
- Wire keys (res.locals / header / cookie) shared with another file or Jini: ${all.filter((r) => r.wireKeys).length} files (${all.filter((r) => r.why.some((w) => w.startsWith("wire-key"))).length} cross-feature/Jini, Tier 2). Tovu<->Tovu parsed lines (regex/phrase in one file, emitted by another): ${all.filter((r) => r.parsedLines).length} files. Secret-looking values printed to console/stdout: ${all.filter((r) => r.bug?.secretToLog).length} files.
- Dead code: ${deadRoot.size} dead-root files (0 prod importers, not entry-like), ${deadSet.size - deadRoot.size} more in dead clusters; ${pathRoots.size} files kept live as path-loaded roots (vite entries, spawn/URL paths, root scripts, workflows); ${hermeticOnly.size} hermetic-only (reached only via the in-memory composition); ${dynTargets.size} import() targets. Dead re-exports: ${all.reduce((n, r) => n + (r.deadReexportsTotal ?? 0), 0)} in ${all.filter((r) => r.deadReexports).length} files. Dead members: ${all.reduce((n, r) => n + (r.deadMembers?.length ?? 0), 0)} in ${all.filter((r) => r.deadMembers).length} files. Admin client paths with no server route: ${all.reduce((n, r) => n + (r.clientRoutesNoServer?.length ?? 0), 0)} in ${all.filter((r) => r.clientRoutesNoServer).length} files. LABEL-CONFLICT rows (keep-label on a dead file): ${all.filter((r) => r.labelConflict).length}. Boundary entries tagged: ${all.filter((r) => r.boundaryEntry).length}. Composition drift pairs: ${compositionDrift.length} (composition-drift.jsonl). Twin-group lifts: ${twinLifted}.
- New bug hints: cachedPromiseNoReset ${all.filter((r) => r.bug?.cachedPromiseNoReset).length}, ctxSignalUnread ${all.filter((r) => r.bug?.ctxSignalUnread).length}, filterAfterPaging ${all.filter((r) => r.bug?.filterAfterPaging).length}, batchPin ${all.filter((r) => r.bug?.batchPin).length}; files with writes ${all.filter((r) => r.bug?.writes).length}.
- String couplings (event/path/template/phrase/regex): ${formatCouplings.filter((c) => c.kind).length} in ${new Set(formatCouplings.filter((c) => c.kind).map((c) => c.file)).size} files.
- Rule checks: Tovu prod await-import ${all.reduce((s, r) => s + (r.rules?.length ?? 0), 0)} in ${all.filter((r) => r.rules).length} files; Jini await-import ${ruleCount("await-import")}, imports-non-core ${ruleCount("imports-non-core")} (${pkgPairs.size} package pairs; top: ${[...pkgPairs].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(", ")}), express-type ${ruleCount("express-type")} (jini-rules.jsonl).
- Port-implementation edges: ${portEdges.length} (${portsByImpl.size} implementer files).
- Private-format couplings: ${formatCouplings.filter((c) => !c.kind).length} literals in ${new Set(formatCouplings.filter((c) => !c.kind).map((c) => c.file)).size} files.
- Stale comment refs (paths, file:line past end, @jini-ai subpaths missing from exports): ${all.reduce((s, r) => s + (r.staleRefs?.length ?? 0), 0)} in ${all.filter((r) => r.staleRefs).length} files. Error-message couplings (err.message compare vs a message thrown elsewhere): ${all.filter((r) => r.errMessageCouplings).length} files.

## TOOL-CALL check (tool-calls.jsonl, permission-defs.json)

- Tools: ${toolTotals.tools} definitions in ${toolTotals.toolDefFiles} files (${toolTotals.noDeclaredPermission} with no declared permission). Hand-anchor: ~296.
- Hand-written permission checks: ${toolTotals.handChecks} in ${toolTotals.handCheckFiles} files (of ${toolTotals.toolFiles} tool/registration files). Hand-anchor: ~198 in ~79.
- Permission names defined (\`const X_PERMISSION = "..."\`) in more than one file: ${toolTotals.permDefinedTwice} (${toolTotals.permDefinedTwiceTovu} with >= 2 Tovu files). Hand-anchor: ~14.
- ctx.signal read in ${toolTotals.ctxSignalFiles} of ${toolTotals.toolFiles} tool/registration files (${toolRows.length ? new Set(toolRows.filter((r) => r.readsCtxSignal).map((r) => r.file)).size : 0} of ${toolTotals.toolDefFiles} tool-definition files). Hand-anchor: ~22 of ~120.
- Hand-parsed input (JSON.parse / typeof input.x): ${toolTotals.handParseFiles} files; generic error strings: ${toolTotals.genericErrorFiles} files.
- Tools with no test file importing their file: ${toolTotals.noTest}; with no importing test that names the tool: ${toolTotals.noNamedTest} (tests that never name a refusal: ${toolTotals.testNoDenied}). Hand-anchor: ~20.
- Limits: a tool = an object literal with \`name\` plus \`authorization\`, or \`name\` + \`inputSchema\` + \`description\`; tools built by factories from arrays are missed. Checks/ctx.signal/parse are per file, not per handler. "Has a test" = some test file imports the defining file.
- Features: ${features.length}. SCCs: ${sccs.length} (${multi.length} with >1 feature; largest ${Math.max(...sccs.map((c) => c.length))} features).
- Batches: ${batches.length} (files ${Math.min(...batchIndex.map((b) => b.files))}-${Math.max(...batchIndex.map((b) => b.files))}, lines up to ${Math.max(...batchIndex.map((b) => b.loc))}; caps ${BATCH_MAX_FILES} files / ${BATCH_MAX_LOC} lines, a bigger single file alone), leaf-first in batches.json.

## v3 -> v4 changes (round-3 judges)

- Dead code: roots from vite lib entries / rollup inputs, spawn/fork/new URL path literals, root package.json scripts and .github/workflows; import() targets are BOUNDARY (lazyImported); BOUNDARY-ENTRY needs >= 1 prod importer; LABEL-CONFLICT when a keep-label lands on a dead file; hermetic-only prod reach for files reached only via the in-memory composition (app.ts).
- Barrels and members: dead re-exports counted per symbol through barrels (deadReexports); dead controller/api members, incl. ones read only by dead files (deadMembers); admin client paths with no server route (clientRoutesNoServer).
- TINY-EXTENDS-ADAPTER = every class is a constructor-only \`super(f(x))\` subclass; a class overriding any method never is.
- Twins: norm-body (identifier-normalised text, Tovu<->Tovu across admin/desktop/website incl. routes, and Tovu<->Jini), same-file pairs, name-independent beh twins against all Jini units (private ones too), module-level Jini twins (module-twins.jsonl, ranked by summed similarity); Jini public surface from package.json exports; exact-small needs >= 3 statements or 160 chars; const twins need an equal (quote-normalised) value, exported counterpart, and never lift a tier (twin-group lift included); class-name twins need a shared caller; same-interface class-api pairs dropped.
- LEGACY-TWIN: UNMOUNTED-REWRITE state; WIRE-DRIFT rows (route-path and permission literals the Jini twin uses and Tovu does not, with near Tovu names; wire-drift.jsonl); a legacy twin lifts only files sharing >= ${LEGACY_OWN_MIN_SHARED} own tokens with the Jini module.
- Tiers: Tier 2 when the file implements an imported Jini port type, has a Jini code twin >= 0.6, a module-level Jini twin, or an err-message coupling; no cycle lift for barrels or pure binding files.
- CORE-CONTRACT-NEEDED: origin package of each value import; packages another named package (or the app's own Jini package) already depends on are dropped.
- Hints: fail-closed predicate catches and catches setting a visible error are not swallows; \`catch { continue }\`/return after reads, binding-less catch + log, Map-cached promises without delete-on-reject are; fetch by method (HEAD is a read); port/callback write verbs count as writes; regex couplings tested against the emitted literal; whole-map replace that tombstones omitted ids; err.message compares against messages thrown elsewhere.
- Stale refs: \`file.ts:N\` cites past the file's end and \`@jini-ai/pkg/sub\` mentions missing from the exports map; \`--drift\` exits 1 when slice files or Jini packages changed since the build.
- TOOL-CALL check: tool-calls.jsonl + totals above.
- Not done (expensive): JSX render-gate analysis (loadError early returns, state read in one branch), action-union client paths (stop-serving), field-level legacy checks ("no field X" vs the Jini record), per-handler (not per-file) tool checks.

## v2 -> v3 changes (round-2 judges)

- LEGACY-TWIN: Jaccard floor 0.05 (same-app admin -> @jini-ai/admin exempt); a Tovu HTTP route folder twins a Jini module only if that module serves HTTP; legacy-twins.jsonl records list \`tovuFiles\`; row/record consistency is checked.
- Twins: Tovu<->Tovu exact small bodies; exact-small bucket 6 for bodies >= 120 chars; identifier-agnostic small-shape twins; same-name twins for exported AND private functions (Tovu and Jini); const-value twins (numbers, strings, frozen objects) against Jini exports; regex alternations as const sets; same-name types get exact/subset/superset/diverged with member deltas.
- Writes: bare verb-noun calls count only if the callee writes (one hop, Tovu and Jini); SQL exec calls with a SELECT/selectFrom statement are reads; storeOps only in files that write; PUT "(collection)" only for a plural last segment.
- Wire couplings: res.locals keys, x-* headers, cookie names (vs other Tovu files and Jini literals); Tovu<->Tovu parsed lines (desktop regex <-> serve.ts console line); secret-looking values printed to console/stdout. Cross-feature/app/Jini ones lift to Tier 2.
- Exports and exportProdImporters are never truncated (exportsTotal always set; "+self" = used inside the file). testOnlyExports skip names used in-file. A file that imports AND re-exports counts as a direct importer.
- Pass-through = the one call forwards only the function's own parameters; builders adding arguments are STAY-WIRING?. JINI-SHIM auto label; BARREL by re-export ratio >= 0.9; BOUNDARY-ENTRY (dependency-cruiser guarded index.ts / public entries) = promoted surface, STAY.
- CORE-CONTRACT-NEEDED counts value imports named directly (no type-only, no Tovu-shim hops). Port edges drop predicate/event callbacks passed to calls and array constants.
- Swallows: refusals with context or binding-less catches are not "generic rethrow"; empty catches and catches that drop the error are flagged. New hints: cachedPromiseNoReset, ctxSignalUnread, filterAfterPaging, batchPin, secretToLog.
- Tier: a cycle edge alone no longer lifts files under 40 lines; Tovu<->Tovu near-copies take the higher tier of the pair (twin-group lift). Rows list smallHelpers (<= ${SMALL_HELPER_LINES} lines in a file with bigger functions): reviewer rule, a small helper flagged MIXED defaults to STAY.
- Dead code: prodReach dead-root / dead-cluster. Composition drift between ensure*-calling roots.
- Not done (expensive): one-hop writes through injected service objects, display-name validators in rollback try, desktop<->CLI DTO / JSON-stdin parser twins across apps beyond the generic passes, stale dependency-name claims in comments, request/reply pairing in shape-names twins.

## Files

- \`batches.json\` ordered batch list; \`batches/bNNN.jsonl\` one JSON row per file.
- \`files.tsv\` all labelled files; \`tests.tsv\` test files and their subjects.
- \`tool-calls.jsonl\` (one row per tool), \`permission-defs.json\` (permission names defined in > 1 file), \`module-twins.jsonl\`, \`wire-drift.jsonl\`.
- \`twins.jsonl\`, \`port-edges.jsonl\`, \`format-couplings.jsonl\` (string, wire-key and parsed-line couplings carry \`kind\`), \`legacy-twins.jsonl\`, \`jini-rules.jsonl\`, \`composition-drift.jsonl\`, \`sccs.json\` (multi-feature SCCs), \`stamp.json\`.

## Row fields

imports.T/J/N/npm (\`type\`/\`inline\` tags; J entries carry pkg= (the package the import names) and say "R7 via" when reached through a Tovu re-export), importers (real callers through barrels; prod list, tests, aux counts; direct = files whose specifier resolves to this file, the callers a facade/barrel has),
exports (re: = re-exported), exportProdImporters (name:prod/tests), testOnlyExports, legacyTwin, coreContractNeeded (>= 2 non-core Jini packages named), rules (await-import), stringCouplings, noStaticImporter (exports no file imports by name: entry points and dynamic loading are false positives), jiniSameName (verdict from body fingerprint: copy >=0.6,
diverged 0.3-0.6, pass-through, name-only), extends, passThrough, twins, implementsPorts / wiresPorts, privateFormats, productLiterals (with key/value context), staleRefs, scc, bug (storeOps,
acceptsSignal, abortChecks, forwardsSignal, awaitAfterAbortCheck, awaitBeforeCloseListener, swallows, wholePut, writes on store-like receivers with "+sig" when a signal is passed).
`;
fs.writeFileSync(path.join(OUT, "summary.md"), summary);
function head(dir) { try { return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "?"; } }
function git(dir) { try { return execFileSync("git", ["-C", dir, "log", "-1", "--format=%h (%cd)", "--date=short"], { encoding: "utf8" }).trim(); } catch { return "?"; } }
console.log(summary);
