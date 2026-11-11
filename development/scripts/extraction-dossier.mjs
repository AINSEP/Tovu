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
// "Core" for CORE-CONTRACT-NEEDED: a file that would move into Jini but imports >= 2 Jini packages
// other than these needs a contract in core first (owner 11-07: no package above domains).
const CORE_PKGS = new Set(["@jini-ai/core"]);

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
function isWriteCall(call) {
  const callee = unwrap(call.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    const verb = callee.name.text; if (NON_MUTATING.has(verb)) return false;
    const recv = recvName(callee.expression);
    return !!recv && STORE_RECEIVER_RE.test(recv) && RECEIVER_VERB_RE.test(verb);
  }
  if (!ts.isIdentifier(callee) || NON_MUTATING.has(callee.text)) return false;
  // Bare fetch is a write only with a non-GET method in its init object.
  if (callee.text === "fetch") return call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => ts.isPropertyAssignment(p) && memberName(p) === "method" && ts.isStringLiteralLike(p.initializer) && p.initializer.text.toUpperCase() !== "GET"));
  return BARE_VERB_RE.test(callee.text);
}
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
  if (json.name?.startsWith("@jini-ai/")) { jiniPkgs.set(json.name, { dir: path.join(JINI, "packages", dir), exports: json.exports ?? {} }); jiniPkgByDir.set(dir, json.name); }
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
  if (members.length < 3) return null;
  return { strict: `O:${members.sort().join(";")}`, loose: names.length >= 4 ? `N:${[...names].sort().join(",")}` : null, size: members.length };
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
    beh: new Set(), constSets: [], constKinds: new Map(), couplingCands: [], expressType: false, approvalOrCtxSignal: false };

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
    f.units.push({ name, kind: kindTag, line: lineOf(node.getStart()), statements, exported, shingles: shinglesOf(kinds), smallText, registerOnly, ...extra });
  }
  /** A body that is one call (`return jiniFn(...)` or `=> jiniFn(...)`): R2 pass-through candidate.
   * Also returns what the call is FED: literals, identifiers (resolved later: npm values?) and
   * host-copy objects. R3 ALL-PASS-THROUGH is wrong for driver binders that inject npm modules or
   * product literals (pilot ABC #6): those stay in Tovu as wiring. */
  function singleCall(body) {
    let e = null;
    if (!body) return null;
    if (!ts.isBlock(body)) e = body;
    else if (body.statements.length === 1) { const s = body.statements[0]; e = ts.isReturnStatement(s) ? s.expression : ts.isExpressionStatement(s) ? s.expression : null; }
    e = unwrap(e);
    if (!e || !(ts.isCallExpression(e) || ts.isNewExpression(e))) return null;
    const args = { lit: false, idents: [], hostMsg: false };
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
    if (a && (ts.isNewExpression(a) || ts.isCallExpression(a)) && a.arguments?.[0]) a = unwrap(a.arguments[0]);
    if (!a || !ts.isArrayLiteralExpression(a) || a.elements.length < 3 || !a.elements.every((x) => ts.isStringLiteralLike(x))) return null;
    return [...new Set(a.elements.map((x) => x.text))].sort().join("\u0001");
  }
  function constKindOf(init) { const i = unwrap(init); if (!i) return "other";
    if (ts.isStringLiteralLike(i) || ts.isNumericLiteral(i) || ts.isTemplateExpression(i) || i.kind === ts.SyntaxKind.TrueKeyword || i.kind === ts.SyntaxKind.FalseKeyword) return "literal";
    if (ts.isObjectLiteralExpression(i) || ts.isArrayLiteralExpression(i)) return "object";
    if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) return "fn"; return "other"; }
  function collectTopLevel(st) {
    const exported = hasExport(st);
    if (ts.isFunctionDeclaration(st)) {
      const name = st.name?.text ?? "default"; declare(name, "function", st, exported);
      const sc = singleCall(st.body);
      addUnit(name, "fn", st.body, st, exported, { callRoot: sc?.root ?? null, callArgs: sc?.args });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) { d.name.elements?.forEach((el) => ts.isBindingElement(el) && ts.isIdentifier(el.name) && declare(el.name.text, "const", st, exported)); continue; }
        const init = unwrap(d.initializer);
        const isFn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        declare(d.name.text, isFn ? "function" : "const", st, exported);
        f.constKinds.set(d.name.text, constKindOf(init));
        if (full || info.repo === "jini") { const key = constSetOf(init); if (key) f.constSets.push({ name: d.name.text, line: lineOf(st.getStart()), exported, key, size: key.split("\u0001").length }); }
        if (isFn) { const sc = singleCall(init.body); addUnit(d.name.text, "fn", init.body, st, exported, { callRoot: sc?.root ?? null, callArgs: sc?.args }); }
        else if (init && ts.isIdentifier(init)) f.units.push({ name: d.name.text, kind: "alias", line: lineOf(st.getStart()), statements: 0, exported, shingles: new Uint32Array(), callRoot: init.text });
      }
    } else if (ts.isClassDeclaration(st)) {
      const name = st.name?.text ?? "default"; declare(name, "class", st, exported);
      const ext = st.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
      if (ext) f.extendsInfo.push({ name, base: rootIdent(ext.expression), members: st.members.length, line: lineOf(st.getStart()) });
      // Class API fingerprint (pilot ABC #3: keyring.memory / CredentialSetVaultRepo restructured,
      // body sim .04): public method names + the set of callee names used anywhere in the class.
      const isPublic = (m) => !ts.getModifiers?.(m)?.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword) && !(m.name && ts.isPrivateIdentifier(m.name)) && !/^_/.test(m.name ? memberName(m) : "_");
      const calls = new Set(); const walkCalls = (n) => { if (ts.isCallExpression(n)) { const c = lastName(n.expression); if (c) calls.add(c); } ts.forEachChild(n, walkCalls); }; walkCalls(st);
      addUnit(name, "class", st, st, exported, { methods: st.members.filter((m) => m.name && (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m) || ts.isGetAccessor(m))).map(memberName),
        publicMethods: st.members.filter((m) => m.name && (ts.isMethodDeclaration(m) || ts.isGetAccessor(m)) && isPublic(m)).map(memberName), calls: [...calls] });
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
  const bug = { crud: [], signalParams: [], abortChecks: [], forwards: [], writes: [], awaitGaps: [], listenerGaps: [], swallows: [], wholePut: [] };
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
    const ev = { awaits: [], checks: [], writes: [], listeners: [] };
    const walk = (n) => {
      if (n !== fn.body && ts.isFunctionLike(n)) return;
      if (ts.isAwaitExpression(n)) ev.awaits.push(n);
      if (ts.isPropertyAccessExpression(n) && n.name.text === "aborted") ev.checks.push(n);
      if (ts.isCallExpression(n)) {
        const c = lastName(n.expression); const a0 = n.arguments[0];
        if (c === "throwIfAborted") ev.checks.push(n);
        if (isWriteCall(n)) ev.writes.push(n);
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
    if (ev.listeners.length && ev.awaits.length) {
      const l = first(ev.listeners); const pre = ev.awaits.filter((x) => x.end <= l.getStart());
      if (pre.length) bug.listenerGaps.push(`${name}@${at(fn)}: await @${at(first(pre))} before close/abort listener @${at(l)}`);
    }
  }
  const PHRASE_CALLEES = new Set(["startsWith", "endsWith", "includes", "indexOf", "lastIndexOf", "match", "split", "search", "replace"]);
  const EVENT_CALLEES = new Set(["addEventListener", "removeEventListener", "on", "once", "off", "emit", "addListener"]);
  const localStr = new Map(); // string consts seen so far in this file (name -> text)
  const coupled = new Set();
  const coupling = (kind, text, n) => { const line = lineOf(n.getStart()); const k = `${kind}\0${text}\0${line}`; if (coupled.has(k)) return; coupled.add(k); f.couplingCands.push({ kind, text, line, symbol: topSymbol(n) }); };
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
    if (full) {
      // Behaviour fingerprint tokens (LEGACY-TWIN pre-pass): what a module SAYS (string literals, route
      // strings), CALLS and TOUCHES (property names). Restructured siblings keep these when their
      // bodies and names differ (pilot DE #1: media 0.07/0.11 by body). Private closures included.
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
        for (const run of src.split(/\\[a-zA-Z]|[\^$*+?()[\]{}|]/)) if (run.trim().length >= 12) coupling("regex", run, n);
      }
      if (ts.isCatchClause(n)) {
        // Swallow arms (pilot ABC #4, bugs #3/#5/#6): a catch that answers [] / null / {} / undefined,
        // or rethrows a fresh generic Error that drops the cause.
        const v = n.variableDeclaration?.name.getText(); const encl = ts.findAncestor(n, ts.isFunctionLike); const where = `${encl ? fnName(encl) : "(top)"}@${lineOf(n.getStart())}`;
        for (const s of n.block.statements) {
          if (ts.isReturnStatement(s) && s.expression) {
            const e = unwrap(s.expression);
            if (e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined") || (ts.isArrayLiteralExpression(e) && !e.elements.length) || (ts.isObjectLiteralExpression(e) && !e.properties.length)) bug.swallows.push(`${where} return ${e.getText()}`);
          } else if (ts.isThrowStatement(s)) {
            const e = unwrap(s.expression);
            if (e && ts.isNewExpression(e) && /Error$/.test(e.expression.getText()) && (e.arguments?.length ?? 0) < 2 && !(v && e.getText().includes(v))) bug.swallows.push(`${where} rethrows generic ${short(e.getText(), 50)}`);
          }
        }
      }
      // Whole-collection PUT (pilot DE #3, bug 3): a PUT that replaces a whole map/list loses a
      // concurrent writer's change. Flag PUT requests and PUT routes with no trailing :param.
      if (ts.isPropertyAssignment(n) && memberName(n) === "method" && ts.isStringLiteralLike(n.initializer) && n.initializer.text.toUpperCase() === "PUT") bug.wholePut.push(`PUT request @${lineOf(n.getStart())}`);
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "put" && /^(app|router|server|fastify|routes?|r)$/i.test(recvName(n.expression.expression) ?? "")
        && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text.startsWith("/")) {
        const route = n.arguments[0].text; bug.wholePut.push(`PUT route ${route} @${lineOf(n.getStart())}${/\/:[\w]+\/?$/.test(route) ? "" : " (collection)"}`);
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
      if (tovuFull && ts.isCallExpression(n)) {
        const callee = lastName(n.expression);
        if (callee === "throwIfAborted") bug.abortChecks.push(lineOf(n.getStart()));
        const encl = ts.findAncestor(n.parent, ts.isFunctionLike);
        const osSignal = /kill|exit|signal|^on$|^once$|^String$|^log$|^warn$|^error$/i.test(callee ?? "") || (!!encl && (/SIG[A-Z]{3,}|\.kill\(|exitCode/.test(encl.getText()) || (encl.parameters ?? []).some((p) => /\bcode\b/.test(p.name.getText()))));
        const passes = !osSignal && n.arguments.some((a) => (ts.isIdentifier(a) && /^(signal|abortSignal)$/.test(a.text)) || (ts.isPropertyAccessExpression(a) && a.name.text === "signal")
          || (ts.isObjectLiteralExpression(a) && a.properties.some((p) => p.name && /^signal$/.test(memberName(p)))));
        const label = short(n.expression.getText().replace(/\s+/g, ""), 48);
        if (passes) bug.forwards.push(`${label}@${lineOf(n.getStart())}`);
        if (isWriteCall(n)) bug.writes.push(`${label}@${lineOf(n.getStart())}${passes ? "+sig" : ""}`);
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
      const c = text.slice(r.pos, r.end); for (const m of c.matchAll(PATH_REF_RE)) f.staleCandidates.push({ ref: m[1], line: lineOf(r.pos + m.index) }); } };
    const walkC = (n) => { scanComments(ts.getLeadingCommentRanges(text, n.pos)); ts.forEachChild(n, walkC); };
    walkC(sf); scanComments(ts.getLeadingCommentRanges(text, sf.endOfFileToken.pos));
  }
  f.jiniLits = jiniLits;
  if (full) {
    f.bug = bug; f.fnCount = fnCount;
    f.toolRegistration = /\bbuildDomainRegistrations\b|AgentToolDefinition\[\]/.test(text);
    f.dataIsh = /(i18n|locales?|copy|messages|strings)\b/i.test(info.rel);
    // An approval handler or ctx.signal use is behaviour a Tier 0 skim misses (pilot ABC #7:
    // project-keys/tools.ts and consent/tool-registrations.ts sat at Tier 0 as R9).
    f.approvalOrCtxSignal = /\b(requiresApproval|needsApproval|approvalRequired|approval\w*\s*[:(]|onApprove\w*|approve[A-Z]\w*\s*\(|ctx\.signal)/.test(text);
    // Rule check (pilot DE #7, D2): Jini must not name a specific server framework (owner 11-07).
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
      const d = directImp.get(t.abs); if (!d.has(abs)) d.set(abs, { names: new Set(), reexport: false });
      const rec = d.get(abs); names.forEach((n) => rec.names.add(n)); if (imp.kind === "reexport") rec.reexport = true;
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
const twinPairs = []; const seenPair = new Set(); let skippedBuckets = 0; let suppressedSamePort = 0;
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
  for (const list of byText.values()) {
    if (list.length < 2 || list.length > SMALL_EXACT_BUCKET_CAP) continue;
    for (const X of list) for (const Y of list) {
      if (files.get(X.abs).repo !== "tovu" || files.get(Y.abs).repo !== "jini") continue;
      twinPairs.push({ kind: "exact-small", a: display(X.abs), aUnit: X.u.name, aLine: X.u.line, b: display(Y.abs), bUnit: Y.u.name, bLine: Y.u.line,
        sim: 1, sameName: X.u.name === Y.u.name, scope: scopeOf(Y.abs), stmts: X.u.statements, chars: X.u.smallText.length });
    }
  }
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
    const exact = jiniPhraseFiles.get(t);
    if (exact && exact.size <= 5) hit = [...exact];
    else { const m = phraseList.find(([ph]) => ph.includes(t)); if (m) hit = [...m[1]]; }
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
      const rec = { tovu: tm.key, jini: `jini:${jm.key}`, jiniPkg: jpkg, sim: +sim.toFixed(2), overlap: +overlap.toFixed(2), shared: inter, files: tm.files.length, mounts: [...new Set(mounts)].slice(0, 5), mountsTotal: new Set(mounts).size, mountsInside: inside };
      legacyTwins.push(rec);
      for (const a of tm.files) { const cur = legacyByFile.get(a); if (!cur || cur.sim + cur.overlap < rec.sim + rec.overlap) legacyByFile.set(a, rec); }
    }
  }
}

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
    if (facts.get(impl.abs).constKinds.get(impl.name) === "literal") continue;
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
// Per-file rows + tier suggestion.
// ---------------------------------------------------------------------------------------------
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
  const T = [], J = [], N = new Set(), NPM = new Set(), missing = [], rules = []; const namedPkgs = new Set();
  for (const e of edges) {
    const tag = `${e.typeOnly || e.kind === "importType" ? "type " : ""}${e.kind === "dynamic" || e.kind === "importType" ? "inline " : ""}`;
    // Rule check (pilot DE #7): prod `await import()` of a first-party module (Tovu or Jini).
    if (e.kind === "dynamic" && e.awaited && (e.target === "tovu" || e.target === "jini")) rules.push(`await-import ${e.spec} @${e.line}`);
    if (e.target === "tovu") T.push(`${tag}${display(e.to)}${e.via ? ` (via ${e.via})` : ""}`);
    else if (e.target === "jini") {
      // pkg= is the package the import NAMES (may differ from where the symbol is defined).
      if (e.jiniPkg) namedPkgs.add(e.jiniPkg);
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
  const dProd = [...dmap].filter(([x, r]) => files.get(x).role === "main" && !r.reexport).map(([x]) => x);
  const dRe = [...dmap].filter(([x, r]) => files.get(x).role === "main" && r.reexport).length;
  const dTests = [...dmap.keys()].filter((x) => files.get(x).role === "test").length;
  // Per-export importer counts (prod/tests), from both resolved and direct importers, so test-only
  // exports surface (pilot DE #2: isDaemonProcessForWorkspace, the Tovu createDaemonSupervisor).
  const perName = new Map(); const bump = (n, x) => { if (!perName.has(n)) perName.set(n, { prod: new Set(), tests: new Set() }); const role = files.get(x).role; if (role === "main") perName.get(n).prod.add(x); else if (role === "test") perName.get(n).tests.add(x); };
  for (const [x, names] of importers.get(abs) ?? new Map()) for (const n of names) bump(n, x);
  for (const [x, r] of dmap) if (!r.reexport) for (const n of r.names) bump(n, x);
  const used = new Set([...(usedNames.get(abs) ?? []), ...[...dmap.values()].flatMap((r) => [...r.names])]);
  // Re-exported names are this file's API too (tag re:), or a facade reads as exporting nothing.
  const exportsList = [...[...f.localExports].map(([n, e]) => `${n}:${e.kind}@${e.line}`), ...[...f.reexports].map(([n, r]) => `re:${n}<-${r.spec}`), ...f.stars.map((sp) => `re:*<-${sp}`)];
  const allExported = [...f.localExports.keys(), ...f.reexports.keys()];
  const unused = used.has("*") ? [] : allExported.filter((n) => !used.has(n));
  const anyStar = perName.get("*"); const starProd = anyStar?.prod.size ?? 0, starTests = anyStar?.tests.size ?? 0;
  const exportImporters = allExported.filter((n) => n !== "*").map((n) => { const c = perName.get(n); return { n, prod: (c?.prod.size ?? 0) + starProd, tests: (c?.tests.size ?? 0) + starTests }; });
  // Test-only: LOCAL value exports only. A re-exported name reached by prod through an upstream barrel
  // resolves past this file, so its prod count here is 0 by construction; types prove nothing.
  const testOnly = exportImporters.filter((x) => x.prod === 0 && x.tests > 0 && f.localExports.has(x.n) && !/^(interface|type)$/.test(f.localExports.get(x.n).kind)).map((x) => x.n);
  // Same-name Jini exports, scored with the body fingerprint (R2: >=0.6 copy, 0.3-0.6 diverged).
  const sameName = [];
  for (const [name] of f.localExports) {
    const hits = jiniExportIndex.get(name); if (!hits || name === "default") continue;
    const mine = f.units.find((u) => u.name === name); const myShape = f.shapes.find((s) => s.name === name);
    let best = null;
    for (const h of hits) {
      let sim = null;
      if (mine?.shingles.length && h.unit?.shingles.length) sim = jaccard(mine.shingles, h.unit.shingles);
      else if (myShape && h.shape) sim = myShape.strict === h.shape.strict ? 1 : myShape.loose && myShape.loose === h.shape.loose ? 0.8 : 0;
      if (!best || (sim ?? -1) > (best.sim ?? -1)) best = { abs: h.abs, sim };
    }
    const passThrough = mine?.callRoot && isJiniOrigin(resolveBinding(abs, mine.callRoot));
    const verdict = passThrough ? "pass-through" : best.sim == null ? "name-only" : best.sim >= 0.6 ? "copy" : best.sim >= 0.3 ? "diverged" : "different";
    sameName.push({ name, jini: display(best.abs), others: hits.length - 1, sim: best.sim == null ? null : +best.sim.toFixed(2), verdict });
  }
  // extends: `extends <Jini same-name>` (canary-2 item 7 -> Tier 1) vs `extends Tovu*` adapters (R4).
  const ext = f.extendsInfo.map((x) => {
    const o = x.base ? (resolveBinding(abs, x.base) ?? (f.localNames.has(x.base) ? { abs, name: x.base } : null)) : null;
    const where = isJiniOrigin(o) ? "jini" : o?.abs ? "tovu" : o?.ext ? "npm" : "global";
    return { ...x, where, origin: o ? originLabel(o) : x.base, jiniSameName: where === "jini" && o.name === x.name };
  });
  // Pass-through functions (R2/R3): body is a single call into a Jini binding.
  const fnUnits = f.units.filter((u) => u.kind === "fn" || u.kind === "alias");
  const passUnits = fnUnits.filter((u) => u.callRoot && isJiniOrigin(resolveBinding(abs, u.callRoot)));
  const passThrough = passUnits.map((u) => `${u.name}@${u.line}`);
  // Driver binders inject npm modules, product literals or host copy into the Jini call: that is
  // Tovu wiring, not a pass-through to delete (pilot ABC #6: pglite*, postgres, enable-access).
  const fedHost = passUnits.some((u) => u.callArgs && (u.callArgs.lit || u.callArgs.hostMsg || u.callArgs.idents.some((id) => resolveBinding(abs, id)?.ext)));
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
  const stale = /\/vendor\//.test(rel) ? [] : f.staleCandidates.filter((c) => !refExists(c.ref));
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
  const nonCore = [...namedPkgs].filter((pk) => !CORE_PKGS.has(pk)).sort();

  // ---- tier suggestion (refined rules + canary-2's changed Tier 2 trigger) ----
  const why = [];
  let tier = 1; let auto = null;
  const classes = f.units.filter((u) => u.kind === "class");
  if (f.reexportOnly) auto = "BARREL (R4)";
  else if (ext.some((x) => !x.iface && x.members === 0) && f.units.every((u) => u.kind === "class")) auto = "EMPTY-SUBCLASS (R4)";
  else if (f.loc <= 30 && classes.length === 1 && ext.some((x) => !x.iface && x.where === "tovu" && x.members <= 3) && fnUnits.length === 0) auto = "TINY-EXTENDS-ADAPTER (R4)";
  // i18n/copy dictionaries first: their few `t()` wrappers would otherwise read as R3 pass-throughs.
  else if (f.dataIsh && classes.length === 0 && passThrough.length === fnUnits.length) auto = "DATA-ONLY";
  else if (fnUnits.length > 0 && passThrough.length === fnUnits.length && classes.length === 0 && f.loc <= 80) auto = fedHost ? "STAY-WIRING?" : "ALL-PASS-THROUGH (R3)";
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
  if (legacy) why.push(`LEGACY-TWIN ${legacy.jini} j${legacy.sim}/o${legacy.overlap}`);
  if (cycleTargets.length) why.push(`cycle-edge -> ${cycleTargets.join(", ")}`);
  const diverged = sameName.filter((s) => s.verdict === "diverged" && !ext.some((x) => x.jiniSameName && x.name === s.name));
  if (diverged.length) why.push(`diverged-pair x${diverged.length}`);
  // A cycle edge alone does not lift an R3/R4 mechanical file: it matters for batching, not reading.
  // Port-impl alone is Tier 1 (binding-only files were over-promoted, pilot ABC #7); it lifts to
  // Tier 2 only with a body twin (any score) next to it. A body twin >= 0.8 or LEGACY-TWIN is Tier 2.
  const bodyTwin = twins.some((p) => p.kind === "body" && p.scope !== "tovu-jini-fixture");
  if (strong.length || (portTriggers.length && bodyTwin) || formats.length || couplings.length || legacy || diverged.length || (cycleTargets.length && tier !== 0)) tier = 2;
  if (tier === 1 && ext.some((x) => x.jiniSameName)) why.push("extends Jini same-name (Tier 1)");

  const row = { path: rel, feature: info.feature, loc: f.loc, tier, why, ...(auto ? { auto } : {}),
    imports: { ...(T.length ? { T } : {}), ...(J.length ? { J } : {}), ...(N.size ? { N: [...N] } : {}), ...(NPM.size ? { npm: [...NPM] } : {}), ...(missing.length ? { unresolved: missing } : {}) },
    importers: { prod: prod.length, tests: testCount.get(abs) ?? 0, aux, ...(prod.length ? { list: prod.slice(0, LIST_CAP) } : {}),
      direct: { prod: dProd.length, reexporters: dRe, tests: dTests, ...(dProd.length && !prod.length ? { list: dProd.map(display).sort().slice(0, LIST_CAP) } : {}) } },
    exports: exportsList.slice(0, 40), ...(exportsList.length > 40 ? { exportsTotal: exportsList.length } : {}),
    ...(exportImporters.length > 1 || testOnly.length ? { exportProdImporters: exportImporters.slice(0, 40).map((x) => `${x.n}:${x.prod}/${x.tests}t`) } : {}),
    ...(testOnly.length ? { testOnlyExports: testOnly.slice(0, LIST_CAP) } : {}),
    ...(unused.length && allExported.length ? { noStaticImporter: unused.slice(0, LIST_CAP) } : {}),
    ...(legacy ? { legacyTwin: { tovuModule: legacy.tovu, jini: legacy.jini, sim: legacy.sim, overlap: legacy.overlap, shared: legacy.shared, mounts: legacy.mounts, mountsTotal: legacy.mountsTotal, mountsInside: legacy.mountsInside } } : {}),
    ...(nonCore.length >= 2 ? { coreContractNeeded: nonCore } : {}),
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
    ...(stale.length ? { staleRefs: stale.slice(0, LIST_CAP).map((s) => `${s.ref} @${s.line}`) } : {}),
    ...(sccSize > 1 ? { scc: { id: scc, features: sccSize, ...(cycleTargets.length ? { edgesInto: cycleTargets } : {}) } } : {}),
  };
  if (f.fnCount > 0) {
    const b = f.bug; const verbs = new Set(b.crud.map((c) => CRUD_RE.exec(c.split("@")[0])[1]));
    const store = [...verbs].some((v) => CRUD_WRITE.has(v)) && [...verbs].some((v) => !CRUD_WRITE.has(v));
    // writesWithSignal is gone: a count of `signal` arguments was read as cancellation evidence (pilot ABC #5).
    const bugRow = { ...(store ? { storeOps: b.crud.slice(0, 20) } : {}), ...(b.signalParams.length ? { acceptsSignal: b.signalParams.slice(0, 10) } : {}),
      ...(b.abortChecks.length ? { abortChecks: [...new Set(b.abortChecks)].slice(0, 10) } : {}), ...(b.forwards.length ? { forwardsSignal: b.forwards.slice(0, 10) } : {}),
      ...(b.awaitGaps.length ? { awaitAfterAbortCheck: b.awaitGaps.slice(0, 8) } : {}), ...(b.listenerGaps.length ? { awaitBeforeCloseListener: b.listenerGaps.slice(0, 8) } : {}),
      ...(b.swallows.length ? { swallows: b.swallows.slice(0, 10) } : {}), ...(b.wholePut.length ? { wholePut: b.wholePut.slice(0, 8) } : {}),
      ...(b.writes.length ? { writes: b.writes.slice(0, 12), writesTotal: b.writes.length } : {}) };
    if (Object.keys(bugRow).length) row.bug = bugRow;
  }
  rowsOut.set(abs, row);
}

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
fs.writeFileSync(path.join(OUT, "stamp.json"), JSON.stringify({ built: new Date().toISOString(), tovu: { dir: TOVU, head: head(TOVU) }, jini: { dir: JINI, head: head(JINI) } }, null, 1));
fs.writeFileSync(path.join(OUT, "sccs.json"), JSON.stringify(sccs.map((c, i) => ({ id: i, features: c, files: c.reduce((s, ft) => s + (filesByFeature.get(ft)?.length ?? 0), 0) })).filter((x) => x.features.length > 1), null, 1));

const all = [...rowsOut.values()];
const tierCount = [0, 1, 2].map((t) => all.filter((r) => r.tier === t).length);
const tierLoc = [0, 1, 2].map((t) => all.filter((r) => r.tier === t).reduce((s, r) => s + r.loc, 0));
const autoCount = {}; for (const r of all) if (r.auto && r.tier === 0) autoCount[r.auto] = (autoCount[r.auto] ?? 0) + 1;
const trig = { "strong-twin": 0, "port-impl": 0, "private-format": 0, "string-coupling": 0, "LEGACY-TWIN": 0, "cycle-edge": 0, "diverged-pair": 0 };
for (const r of all) for (const w of r.why) for (const k of Object.keys(trig)) if (w.startsWith(k)) trig[k]++;
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

- Twin pairs: ${twinPairs.length} (${["body", "exact-small", "const-set", "shape", "shape-names", "wiring", "class-api", "class-fingerprint"].map((k) => `${k} ${twinPairs.filter((p) => p.kind === k).length} [Tovu-Jini ${twinPairs.filter((p) => p.kind === k && p.scope === "tovu-jini").length}]`).join("; ")}). Strong (Tier 2 trigger): ${twinPairs.filter(isStrongTwin).length}. Jini-fixture pairs: ${twinPairs.filter((p) => p.scope === "tovu-jini-fixture").length}. Same-port body pairs dropped: ${suppressedSamePort}. LSH buckets skipped as generic idioms: ${skippedBuckets}.
- LEGACY-TWIN modules: ${legacyTwins.length} (${legacyByFile.size} Tovu files; legacy-twins.jsonl). STAY-WIRING? files: ${all.filter((r) => r.auto === "STAY-WIRING?").length}. CORE-CONTRACT-NEEDED files: ${all.filter((r) => r.coreContractNeeded).length}.
- String couplings (event/path/template/phrase/regex): ${formatCouplings.filter((c) => c.kind).length} in ${new Set(formatCouplings.filter((c) => c.kind).map((c) => c.file)).size} files.
- Rule checks: Tovu prod await-import ${all.reduce((s, r) => s + (r.rules?.length ?? 0), 0)} in ${all.filter((r) => r.rules).length} files; Jini await-import ${ruleCount("await-import")}, imports-non-core ${ruleCount("imports-non-core")} (${pkgPairs.size} package pairs; top: ${[...pkgPairs].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(", ")}), express-type ${ruleCount("express-type")} (jini-rules.jsonl).
- Port-implementation edges: ${portEdges.length} (${portsByImpl.size} implementer files).
- Private-format couplings: ${formatCouplings.filter((c) => !c.kind).length} literals in ${new Set(formatCouplings.filter((c) => !c.kind).map((c) => c.file)).size} files.
- Stale comment path refs: ${all.reduce((s, r) => s + (r.staleRefs?.length ?? 0), 0)} in ${all.filter((r) => r.staleRefs).length} files.
- Features: ${features.length}. SCCs: ${sccs.length} (${multi.length} with >1 feature; largest ${Math.max(...sccs.map((c) => c.length))} features).
- Batches: ${batches.length} (files ${Math.min(...batchIndex.map((b) => b.files))}-${Math.max(...batchIndex.map((b) => b.files))}, lines up to ${Math.max(...batchIndex.map((b) => b.loc))}; caps ${BATCH_MAX_FILES} files / ${BATCH_MAX_LOC} lines, a bigger single file alone), leaf-first in batches.json.

## Files

- \`batches.json\` ordered batch list; \`batches/bNNN.jsonl\` one JSON row per file.
- \`files.tsv\` all labelled files; \`tests.tsv\` test files and their subjects.
- \`twins.jsonl\`, \`port-edges.jsonl\`, \`format-couplings.jsonl\` (string couplings carry \`kind\`), \`legacy-twins.jsonl\`, \`jini-rules.jsonl\`, \`sccs.json\` (multi-feature SCCs), \`stamp.json\`.

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
