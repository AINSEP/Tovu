#!/usr/bin/env node
// Size-hotspot ranking for the big refactor: every prod file over the file limit and every
// function over the function limit(s), with git churn and a hotspot score (lines × churn90).
// Why a script: size never had a gate; the owner wants a repeatable ranking, not a model read.
//
// Usage:
//   node development/scripts/size-hotspots.mjs [--repo name=dir ...] [--out dir]
//        [--file-limit 500] [--fn-limits 80,100] [--exceptions development/scripts/size-exceptions.json]
// Defaults: tovu=/Users/la/Programming/Tovu, jini=/Users/la/Programming/tovu-integration-clones/ui-jini,
//           out=<Tovu>/ADS-memory/.local-artifacts/extraction-survey/<today>/size-hotspots
// Read-only on the repos (git ls-files + git log + file reads). Writes only into --out.
//
// Line counting matches ESLint max-lines / max-lines-per-function with
// skipBlankLines + skipComments: a line counts when it is non-blank after comments are removed.
// Nested functions are measured separately (ESLint does the same), so a long factory and a long
// inner closure are two rows.
//
// File set = tracked prod source, same filter as the 11-11 cloud static scan (filelist.sh):
// no tests/fixtures/mocks/dist/build/vendor/d.ts/stories; Tovu = apps|packages|content minus
// versioned plugin bundles; Jini = packages/*/src only.
//
// Churn = commits touching the file path in the last 90 / 365 days (no rename following).
// Functions take their file's churn. authors365 = distinct author names; days90 = distinct
// commit days in 90 days (a cheap stand-in for "sessions").
//
// Exception CANDIDATES (not decisions): generated, migration, i18n, data-table, wiring,
// embedded-text. Each gets a one-line suggested reason for the owner to accept or reject.
// ACCEPTED exceptions live in size-exceptions.json (owner 11-11); rows matching it get an `exempt`
// reason, counts show what stays over the limit, and entries that no longer match are listed so
// the list can shrink (ratchet).
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
const FILE_LIMIT = Number(opt("--file-limit") ?? 500);
const FN_LIMITS = String(opt("--fn-limits") ?? "80,100").split(",").map(Number).sort((a, b) => a - b);
const FN_MIN = FN_LIMITS[0];
const EXC_PATH = path.resolve(opt("--exceptions") ?? path.join(import.meta.dirname, "size-exceptions.json"));
const EXC = fs.existsSync(EXC_PATH) ? JSON.parse(fs.readFileSync(EXC_PATH, "utf8")) : { pathExclusions: [], entries: [] };
const excUsed = new Set();
function exemptReason(repo, kind, file, fn) {
  for (const x of EXC.pathExclusions ?? []) if ((x.repo === "*" || x.repo === repo) && new RegExp(x.pattern).test(file)) return x.reason;
  const i = (EXC.entries ?? []).findIndex((e) => e.repo === repo && e.file === file && (kind === "file" ? !e.function : e.function === fn));
  if (i < 0) return "";
  excUsed.add(i);
  return EXC.entries[i].reason;
}
const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
const OUT = path.resolve(opt("--out") ?? `/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/extraction-survey/${today}/size-hotspots`);
const ts = createRequire(path.join(REPOS[0].dir, "package.json"))("typescript");

// ---------- file set (mirrors the cloud scan's filelist.sh) ----------
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

// ---------- churn ----------
function churn(repo) {
  const out = execFileSync("git", ["-C", repo.dir, "log", "--since=365.days", "--no-renames", "--format=@@%ct\t%an", "--name-only"],
    { encoding: "utf8", maxBuffer: 1 << 30 });
  const cut90 = Date.now() / 1000 - 90 * 86400;
  const m = new Map();
  let ct = 0, author = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) { const [t, a] = line.slice(2).split("\t"); ct = Number(t); author = a; continue; }
    if (!line) continue;
    let e = m.get(line);
    if (!e) m.set(line, (e = { c90: 0, c365: 0, authors: new Set(), days90: new Set() }));
    e.c365++; e.authors.add(author);
    if (ct >= cut90) { e.c90++; e.days90.add(new Date(ct * 1000).toISOString().slice(0, 10)); }
  }
  return (f) => { const e = m.get(f); return e ? { c90: e.c90, c365: e.c365, authors: e.authors.size, days90: e.days90.size } : { c90: 0, c365: 0, authors: 0, days90: 0 }; };
}

// ---------- per-file measurement ----------
// `id`/`no` left out on purpose: they are everyday object keys (schema columns), not locales.
const LOCALE_KEY = /^["']?(en|es|fr|de|pt|it|ja|zh|ko|ar|ru|nl|sv|pl|tr|he|hi|vi|th|uk|cs|da|fi|nb|el|ro|hu)([-_][A-Za-z]{2,4})?["']?$/;
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)
  || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
const hasFn = (n) => { let found = false; const v = (c) => { if (found) return; if (isFn(c) || ts.isClassLike(c)) { found = true; return; } ts.forEachChild(c, v); }; v(n); return found; };
const isLiteralOnly = (n) => {
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword
    || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword || ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand)) return true;
  if (ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isParenthesizedExpression(n)) return isLiteralOnly(n.expression);
  if (ts.isArrayLiteralExpression(n)) return n.elements.every(isLiteralOnly);
  if (ts.isObjectLiteralExpression(n)) return n.properties.every((p) => ts.isPropertyAssignment(p) && isLiteralOnly(p.initializer));
  return false;
};
const isSimpleRef = (n) => {
  if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) && !hasFn(n) || isLiteralOnly(n)) return true;
  if (ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isParenthesizedExpression(n)) return isSimpleRef(n.expression);
  if (ts.isCallExpression(n) || ts.isNewExpression(n)) return !hasFn(n) && (n.arguments ?? []).every(isSimpleRef);
  if (ts.isObjectLiteralExpression(n)) return n.properties.every((p) => ts.isShorthandPropertyAssignment(p)
    || ts.isPropertyAssignment(p) && isSimpleRef(p.initializer) || ts.isSpreadAssignment(p) && isSimpleRef(p.expression));
  if (ts.isArrayLiteralExpression(n)) return n.elements.every((e) => ts.isSpreadElement(e) ? isSimpleRef(e.expression) : isSimpleRef(e));
  return false;
};
const fnName = (n) => {
  if (n.name) return n.name.getText();
  const p = n.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p))) return p.name.getText();
  if (p && ts.isExportAssignment(p)) return "default";
  if (p && ts.isCallExpression(p)) return `<arg of ${p.expression.getText().slice(0, 40)}>`;
  return "<anonymous>";
};

function measure(dir, f) {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  const kind = /\.(tsx|jsx)$/.test(f) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind);
  // Blank out every comment, then a line counts when anything non-blank is left.
  const chars = text.split("");
  const seen = new Set();
  const blank = createBlank(text, seen, chars);
  if (text.startsWith("#!")) for (let i = 0; i < text.indexOf("\n"); i++) chars[i] = " ";
  const walkAll = (n) => { blank(n.getFullStart()); for (const c of n.getChildren(sf)) walkAll(c); };
  walkAll(sf);
  var { prefix, lines, head, localeKeys, localeCodes, share, dataL, wireL, textL, fns } = collectSizeHotspotMasks(chars, sf, text);
  const total = prefix.at(-1);
  return {
    lines: total, rawLines: lines.length,
    generated: /@generated|auto-?generated|do not edit|generated by|this file is generated/i.test(head),
    localeKeys, localeCodes: localeCodes.size,
    fileShares: { data: share(dataL, 0, lines.length - 1), wire: share(wireL, 0, lines.length - 1), text: share(textL, 0, lines.length - 1) },
    fns: fns.filter((x) => x.lines > FN_MIN).map((x) => ({
      name: fnName(x.node), line: x.s + 1, lines: x.lines,
      shares: { data: share(dataL, x.s, x.e), wire: share(wireL, x.s, x.e), text: share(textL, x.s, x.e) },
    })),
  };
}

function collectSizeHotspotMasks(chars, sf, text) {
  const lines = chars.join("").split("\n");
  const code = lines.map((l) => l.trim() !== "");
  const prefix = [0]; for (const c of code) prefix.push(prefix.at(-1) + (c ? 1 : 0));
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line; // 0-based
  const countRange = (a, b) => prefix[b + 1] - prefix[a];

  // Line masks for candidate classification.
  const mark = (arr, node) => { for (let l = lineOf(node.getStart(sf));l <= lineOf(node.end);l++) arr[l] = 1; };
  const dataL = new Uint8Array(lines.length), wireL = new Uint8Array(lines.length), textL = new Uint8Array(lines.length);
  let localeKeys = 0;
  const localeCodes = new Set();
  const fns = [];
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isImportEqualsDeclaration(n)) { mark(wireL, n); return; }
    if (ts.isPropertyAssignment(n) && LOCALE_KEY.test(n.name.getText())) { localeKeys++; localeCodes.add(n.name.getText().replace(/["']/g, "").toLowerCase()); }
    if ((ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) && lineOf(n.end) - lineOf(n.getStart(sf)) >= 5) mark(textL, n);
    if (ts.isArrayLiteralExpression(n) || ts.isObjectLiteralExpression(n)) {
      const elems = ts.isArrayLiteralExpression(n) ? n.elements : n.properties;
      for (const e of elems) {
        const v = ts.isPropertyAssignment(e) ? e.initializer : e;
        if (isLiteralOnly(v)) mark(dataL, e);
        else if (ts.isShorthandPropertyAssignment(e) || isSimpleRef(ts.isSpreadElement(v) || ts.isSpreadAssignment(v) ? v.expression : v)) mark(wireL, e);
      }
    }
    if (isFn(n) && n.body) {
      const s = lineOf(n.getStart(sf)), e = lineOf(n.end);
      fns.push({ node: n, s, e, lines: countRange(s, e) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const share = (mask, a, b) => { let k = 0; for (let l = a;l <= b;l++) if (code[l] && mask[l]) k++; const t = countRange(a, b); return t ? k / t : 0; };
  const head = text.slice(0, 600);
  return { prefix, lines, head, localeKeys, localeCodes, share, dataL, wireL, textL, fns };
}


function createBlank(text, seen, chars) {
  return (pos) => {
    for (const r of ts.getLeadingCommentRanges(text, pos) ?? []) {
      if (seen.has(r.pos)) continue; seen.add(r.pos);
      for (let i = r.pos; i < r.end; i++) if (chars[i] !== "\n") chars[i] = " ";
    }
  };
}

// ---------- exception candidates ----------
const pct = (x) => `${Math.round(x * 100)}%`;
function classify(f, m, shares) {
  if (m.generated) return ["generated", "header says generated / do-not-edit; size follows the generator, not hand-written code"];
  if (/(^|\/)migrations?\//.test(f) || /(^|\/)\d{4}_[^/]+\.(ts|js|mjs)$/.test(f)) return ["migration", "immutable schema migration; splitting rewrites applied history"];
  if (/(^|[/._-])(i18n|l10n|locales?|translations?|messages)([/._-]|$)/i.test(f) || m.localeKeys >= 20 && m.localeCodes >= 3)
    return ["i18n", `locale dictionary (${m.localeKeys} locale keys, ${m.localeCodes} languages); one entry per string, size grows with languages`];
  if (/(^|\/)schema(\.[a-z]+)?\.(ts|js|mjs)$/.test(f) && shares.wire + shares.data >= 0.5) return ["data-table", "DB schema declaration, one line per column; splitting scatters one table set"];
  if (shares.data >= 0.7) return ["data-table", `${pct(shares.data)} of lines are literal data rows (catalog/table/fixture); logic-free`];
  if (/(^|\/)(styles?|theme|tokens?)\.(ts|tsx|js|mjs)$|\.css\.(ts|js)$/.test(f) && shares.text >= 0.6)
    return ["embedded-text", `${pct(shares.text)} of lines are CSS in a template string; a stylesheet, not logic`];
  if (shares.wire >= 0.6) return ["wiring", `${pct(shares.wire)} of lines are imports / identifier-or-call entries (registration or composition list)`];
  if (shares.text >= 0.7) return ["embedded-text", `${pct(shares.text)} of lines are one multi-line string/template (prompt, HTML, CSS)`];
  return null;
}

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
const tsv = (rows) => rows.map((r) => r.map((c) => String(c).replace(/[\t\n]/g, " ")).join("\t")).join("\n") + "\n";
const candRows = [["repo", "kind", "file", "function", "line", "lines", "category", "suggested_reason"]];
const summary = [];
summary.push(`# Size hotspots — ${today}`, "",
  `Limits: file > ${FILE_LIMIT} lines; function > ${FN_LIMITS.join(" / ")} lines. Lines = non-blank, non-comment (ESLint max-lines skipBlankLines+skipComments). Nested functions counted separately.`,
  `Hotspot score = lines × commits in last 90 days (functions use their file's commits). Exception categories are CANDIDATES for the owner to accept or reject.`,
  `Script: development/scripts/size-hotspots.mjs (read-only).`, "");
const countsTable = [["repo", "prod files", `files>${FILE_LIMIT}`, "…minus candidates", "…minus accepted", ...FN_LIMITS.flatMap((l) => [`fns>${l}`, "…minus candidates", "…minus accepted"])]];

for (const repo of REPOS) {
  const files = prodFiles(repo);
  const ch = churn(repo);
  const rows = [];
  for (const f of files) {
    let m;
    try { m = measure(repo.dir, f); } catch (e) { console.error(`skip ${repo.name}:${f}: ${e.message}`); continue; }
    const c = ch(f);
    if (m.lines > FILE_LIMIT) {
      const cand = classify(f, m, m.fileShares);
      rows.push({ kind: "file", file: f, fn: "", line: 1, lines: m.lines, ...c, cand });
    }
    for (const fn of m.fns) {
      const cand = classify(f, { ...m, generated: m.generated }, fn.shares);
      rows.push({ kind: "function", file: f, fn: fn.name, line: fn.line, lines: fn.lines, ...c, cand });
    }
  }
  for (const r of rows) { r.score = r.lines * r.c90; r.exempt = exemptReason(repo.name, r.kind, r.file, r.fn); }
  rows.sort((a, b) => b.score - a.score || b.lines - a.lines);
  const head = ["rank", "kind", "file", "function", "line", "lines", ...FN_LIMITS.map((l) => `fn_over_${l}`), "churn90", "churn365", "days90", "authors365", "score", "candidate", "suggested_reason", "exempt_reason"];
  fs.writeFileSync(path.join(OUT, `hotspots-${repo.name}.tsv`), tsv([head, ...rows.map((r, i) => [i + 1, r.kind, r.file, r.fn, r.line, r.lines,
    ...FN_LIMITS.map((l) => (r.kind === "function" ? (r.lines > l ? "yes" : "no") : "")), r.c90, r.c365, r.days90, r.authors, r.score, r.cand?.[0] ?? "", r.cand?.[1] ?? "", r.exempt])]));
  for (const r of rows) if (r.cand) candRows.push([repo.name, r.kind, r.file, r.fn, r.line, r.lines, r.cand[0], r.cand[1]]);

  const fileRows = rows.filter((r) => r.kind === "file");
  const fnRows = rows.filter((r) => r.kind === "function");
  countsTable.push([repo.name, files.length, fileRows.length, fileRows.filter((r) => !r.cand).length, fileRows.filter((r) => !r.exempt).length,
    ...FN_LIMITS.flatMap((l) => { const o = fnRows.filter((r) => r.lines > l); return [o.length, o.filter((r) => !r.cand).length, o.filter((r) => !r.exempt).length]; })]);

  const byCat = {};
  for (const r of rows) if (r.cand) { const k = `${r.kind}:${r.cand[0]}`; byCat[k] = (byCat[k] ?? 0) + 1; }
  summary.push(`## ${repo.name} — top 30 hotspots`, "", "| # | kind | file | function | lines | churn90 | churn365 | score | candidate |", "|---|---|---|---|---|---|---|---|---|",
    ...rows.slice(0, 30).map((r, i) => `| ${i + 1} | ${r.kind} | \`${r.file}\` | ${r.fn ? `\`${r.fn}\`:${r.line}` : ""} | ${r.lines} | ${r.c90} | ${r.c365} | ${r.score} | ${r.cand?.[0] ?? ""} |`),
    "", `Candidates by category (${repo.name}): ${Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`, "");
}
summary.splice(6, 0, "## Counts", "", `| ${countsTable[0].join(" | ")} |`, `|${countsTable[0].map(() => "---").join("|")}|`,
  ...countsTable.slice(1).map((r) => `| ${r.join(" | ")} |`), "",
  "\"…minus candidates\" = what stays over the limit if every exception candidate is accepted; \"…minus accepted\" = what stays over after the owner-accepted list (size-exceptions.json).", "");
summary.push("## Notes", "",
  "- Churn counts commits by path, no rename following; a file renamed recently shows low churn.",
  "- days90 = distinct commit days in 90 days (stand-in for sessions); authors365 is near-useless here (owner + agent identities).",
  "- Cloud scan (11-11) counted raw lines; these counts drop blanks/comments, so totals are lower.",
  "- Full lists: hotspots-<repo>.tsv, exceptions-candidates.tsv.");
const stale = (EXC.entries ?? []).filter((_, i) => !excUsed.has(i));
summary.push("", "## Accepted exceptions no longer over the limit (delete from size-exceptions.json)", "",
  ...(stale.length ? stale.map((e) => `- ${e.repo}: \`${e.file}\`${e.function ? ` \`${e.function}\`` : ""}`) : ["- none"]));
fs.writeFileSync(path.join(OUT, "exceptions-candidates.tsv"), tsv(candRows));
fs.writeFileSync(path.join(OUT, "summary.md"), summary.join("\n") + "\n");
console.log(countsTable.map((r) => r.join("\t")).join("\n"));
console.log(`wrote ${OUT}`);
