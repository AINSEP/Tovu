#!/usr/bin/env node
// Builds the 50-line batch plan: index.tsv (every over-limit file, its lane and phase), batches.tsv (file -> job)
// and exception-candidates.md, from the size-hotspots TSVs (development/scripts/size-hotspots.mjs output).
// Why a script: ~1,070 over-limit functions in ~600 files cannot be planned by hand; lanes, phases and job sizes
// must be re-derivable when the hotspot numbers move. Read-only on the repos; writes only inside size-splits/.
// Lanes: owner-exception (held for the owner) > hard (Opus/Fable: hard-files.txt, a fragment that recommends a
// strong executor, or a judgment signal found by parsing: shared mutable lets, many effects, module init order)
// > terra. Phase: a Tovu file the move-to-Jini backlog relocates waits ("after-move"); everything else is "now".
// Usage: node plan50.mjs --tovu <clone> --jini <clone> --hotspots <dir with hotspots-{tovu,jini}.tsv>
//        --move <move-to-jini design dir> [--job-lines 3500] [--job-files 30]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DIR = import.meta.dirname;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const ROOTS = { tovu: path.resolve(opt("--tovu")), jini: path.resolve(opt("--jini")) };
const HOT = path.resolve(opt("--hotspots"));
const MOVE = path.resolve(opt("--move"));
const JOB_LINES = Number(opt("--job-lines", 3500));
const JOB_FILES = Number(opt("--job-files", 30));
const ts = createRequire(path.join(ROOTS.tovu, "package.json"))("typescript");

const readTsv = (f) => {
  const [h, ...rows] = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => l.split("\t"));
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
const listOf = (f) => new Set(fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean));
const fragPath = (repo, file) => path.join(DIR, "parts", repo, `${file.replaceAll("/", "__")}.md`);
const frag = (repo, file) => (fs.existsSync(fragPath(repo, file)) ? fs.readFileSync(fragPath(repo, file), "utf8") : "");

// Exception categories the owner may accept; "wiring" only for agent-tool catalogs and tool registration lists
// (the precedent the owner accepted on 11-11). Other heuristic "wiring" flags are ordinary splits.
const HOLD_CATEGORIES = new Set(["embedded-text", "data-table"]);
const isRegistrationList = (file) => /(agent-tools|tool-registrations)\.ts$/.test(file);
function candidateHeld(row) {
  if (!row.candidate) return false;
  return HOLD_CATEGORIES.has(row.candidate) || (row.candidate === "wiring" && isRegistrationList(row.file));
}

function moveBacklog() {
  const set = new Set();
  for (const r of readTsv(path.join(MOVE, "opus-backlog.files.tsv"))) set.add(r.path);
  for (const r of readTsv(path.join(MOVE, "terra-lane.tsv"))) set.add(r.tovu_path);
  return set;
}

// ---- parsing: counted lines, nesting and judgment signals -------------------------------------------------
function codeLines(sf) {
  const text = sf.text, has = new Set();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    const a = sf.getLineAndCharacterOfPosition(scanner.getTokenStart()).line;
    const b = sf.getLineAndCharacterOfPosition(scanner.getTokenEnd()).line;
    for (let l = a; l <= b; l++) has.add(l);
  }
  return has;
}
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n)
  || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
const isAssign = (n) => ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
  && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
const isUpdate = (n) => (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
  && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken);

function bodyLets(fn) {
  const names = new Set();
  for (const st of fn.body?.statements ?? []) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Let)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
  }
  return names;
}

// Mutable lets of `fn` that a nested function writes: the state a split would have to share.
function sharedLets(fn) {
  const lets = bodyLets(fn), shared = new Set();
  const visit = (n, nested) => {
    const target = isAssign(n) ? n.left : isUpdate(n) ? n.operand : undefined;
    if (nested && target && ts.isIdentifier(target) && lets.has(target.text)) shared.add(target.text);
    ts.forEachChild(n, (c) => visit(c, nested || isFn(c)));
  };
  if (fn.body) ts.forEachChild(fn.body, (c) => visit(c, isFn(c)));
  return shared.size;
}

function effectCount(fn) {
  let n = 0;
  for (const st of fn.body?.statements ?? []) {
    const e = ts.isExpressionStatement(st) ? st.expression : undefined;
    if (e && ts.isCallExpression(e) && /^use(Layout|Insertion)?Effect$/.test(e.expression.getText())) n++;
  }
  return n;
}

function topLevelSideEffects(sf) {
  return sf.statements.filter((s) => ts.isExpressionStatement(s) && !ts.isStringLiteral(s.expression)).length;
}

function parseFile(repo, file) {
  const abs = path.join(ROOTS[repo], file);
  if (!fs.existsSync(abs)) return undefined;
  const text = fs.readFileSync(abs, "utf8");
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const has = codeLines(sf), fns = [];
  const lineOf = (p) => sf.getLineAndCharacterOfPosition(p).line;
  const visit = (n) => {
    if (isFn(n) && n.body) {
      const a = lineOf(n.getStart(sf)), b = lineOf(n.getEnd());
      let c = 0; for (let l = a; l <= b; l++) if (has.has(l)) c++;
      fns.push({ node: n, start: a + 1, end: b + 1, lines: c });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { fns, sideEffects: topLevelSideEffects(sf) };
}

// The hotspot row names a function by label + start line; match the parsed function starting nearest that line.
function matchFn(parsed, row) {
  const want = Number(row.line);
  let best;
  for (const f of parsed.fns) {
    if (f.lines <= 50) continue;
    const d = Math.abs(f.start - want);
    if (!best || d < best.d) best = { f, d };
  }
  return best && best.d <= 60 ? best.f : undefined;
}

// ---- per-file aggregation --------------------------------------------------------------------------------
function collect(repo) {
  const files = new Map();
  for (const r of readTsv(path.join(HOT, `hotspots-${repo}.tsv`))) {
    if (r.exempt_reason) continue;
    const over = r.kind === "file" ? Number(r.lines) > 500 : Number(r.lines) > 50;
    if (!over) continue;
    const e = files.get(r.file) ?? { repo, file: r.file, fileLines: 0, fns: [], score: 0, churn90: Number(r.churn90) };
    if (r.kind === "file") e.fileLines = Number(r.lines);
    else e.fns.push({ name: r.function, line: Number(r.line), lines: Number(r.lines), held: candidateHeld({ ...r, file: r.file }), category: r.candidate, reason: r.suggested_reason });
    e.score = Math.max(e.score, Number(r.score));
    files.set(r.file, e);
  }
  return [...files.values()];
}

function signals(e) {
  const parsed = parseFile(e.repo, e.file);
  if (!parsed) return { missing: true, work: e.fileLines || e.fns.reduce((s, f) => s + f.lines, 0), hard: [] };
  const matched = e.fns.map((f) => ({ f, p: matchFn(parsed, f) }));
  const outer = matched.filter(({ p }) => !p || !matched.some(({ p: q }) => q && q !== p && q.start <= p.start && q.end >= p.end));
  const fnWork = outer.reduce((s, { f }) => s + f.lines, 0);
  const hard = [];
  for (const { f, p } of matched) {
    if (!p || f.held) continue;
    const lets = sharedLets(p.node), effects = effectCount(p.node);
    if (lets >= 5 || (lets >= 3 && f.lines >= 70)) hard.push(`\`${f.name}\` shares ${lets} mutable lets with nested functions`);
    if (effects >= 6) hard.push(`\`${f.name}\` has ${effects} effects whose order must survive`);
  }
  if (e.fileLines > 500 && parsed.sideEffects >= 3) hard.push(`module init order (${parsed.sideEffects} top-level side effects)`);
  return { missing: false, work: Math.max(e.fileLines, fnWork), hard };
}

const STRONG = /\b(fable|opus)\b/i;
const HARD_PLAN = "detailed plan in hard/";
function laneOf(e, ctx) {
  if (ctx.held.has(e.file) || (e.fns.length && !e.fileLines && e.fns.every((f) => f.held))) return ["owner-exception", "every over-limit item is an exception candidate"];
  if (ctx.hardFiles.has(e.file)) return ["hard", HARD_PLAN];
  const f = frag(e.repo, e.file);
  const strong = f.split("\n").find((l) => STRONG.test(l) && !/not (fable|opus)/i.test(l));
  if (strong) return ["hard", `fragment: ${strong.replace(/^[-* ]+/, "").replace(/\*\*Batch:\*\*\s*size-\d+\s*·?\s*/g, "").replace(/\|/g, "/").slice(0, 140)}`];
  if (e.sig.hard.length) return ["hard", e.sig.hard.join("; ")];
  return ["terra", ""];
}

// ---- batching: one job owns a file; folders stay together; ~JOB_LINES counted lines per job ---------------
function pack(rows, prefix) {
  const jobs = [];
  let cur;
  for (const r of [...rows].sort((a, b) => a.file.localeCompare(b.file))) {
    // A file with a detailed hard/ plan is one job on its own (those plans have their own step order).
    const alone = r.why === HARD_PLAN;
    if (alone || !cur || cur.alone || cur.work + r.work > JOB_LINES || cur.rows.length >= JOB_FILES) { cur = { rows: [], work: 0, alone }; jobs.push(cur); }
    cur.rows.push(r); cur.work += r.work;
  }
  for (const j of jobs) j.score = Math.max(...j.rows.map((r) => r.score));
  return jobs.sort((a, b) => b.score - a.score).map((j, i) => ({ ...j, id: `${prefix}-${String(i + 1).padStart(2, "0")}` }));
}

function main() {
  const held = listOf("owner-exception-candidates.txt"), hardFiles = listOf("hard-files.txt"), backlog = moveBacklog();
  const all = [...collect("tovu"), ...collect("jini")];
  for (const e of all) {
    e.sig = signals(e);
    e.work = e.sig.work;
    [e.lane, e.why] = laneOf(e, { held, hardFiles });
    // Every hard/ plan settles its own phase as "now" (they split around the move; see each plan's header).
    e.phase = e.repo === "tovu" && backlog.has(e.file) && e.why !== HARD_PLAN ? "after-move" : "now";
    e.fragment = frag(e.repo, e.file) ? "yes" : "no";
  }
  const jobs = [];
  for (const repo of ["tovu", "jini"]) for (const phase of ["now", "after-move"]) {
    const terra = all.filter((e) => e.repo === repo && e.phase === phase && e.lane === "terra");
    jobs.push(...pack(terra, `size-${repo[0]}${phase === "now" ? "" : "m"}`));
  }
  for (const phase of ["now", "after-move"]) {
    const hard = all.filter((e) => e.lane === "hard" && e.phase === phase);
    jobs.push(...pack(hard, phase === "now" ? "hard" : "hard-m"));
  }
  writeOutputs(all, jobs);
}

function writeOutputs(all, jobs) {
  const batchOf = new Map();
  for (const j of jobs) for (const r of j.rows) batchOf.set(`${r.repo}:${r.file}`, j.id);
  const fnCell = (e) => e.fns.map((f) => `${f.name}=${f.lines}${f.held ? "(hold)" : ""}`).join("; ").replace(/\t/g, " ");
  const head = ["repo", "file", "file_lines", "fns_over_50", "work", "max_score", "phase", "lane", "why", "fragment", "batch"];
  const line = (e) => [e.repo, e.file, e.fileLines || "", fnCell(e), e.work, e.score, e.phase, e.lane, e.why, e.fragment, batchOf.get(`${e.repo}:${e.file}`) ?? ""].join("\t");
  const sorted = [...all].sort((a, b) => b.score - a.score);
  fs.writeFileSync(path.join(DIR, "index.tsv"), [head.join("\t"), ...sorted.map(line)].join("\n") + "\n");
  const bh = ["batch", "lane", "phase", "repo", "file", "work", "fns_over_50", "file_lines", "max_score", "fragment"];
  const brow = (j, e) => [j.id, e.lane, e.phase, e.repo, e.file, e.work, fnCell(e), e.fileLines || "", e.score, e.fragment].join("\t");
  fs.writeFileSync(path.join(DIR, "batches.tsv"), [bh.join("\t"), ...jobs.flatMap((j) => j.rows.map((e) => brow(j, e)))].join("\n") + "\n");
  writeCandidates(all);
  const count = (k) => Object.entries(Object.groupBy(all, (e) => `${e.repo}/${e[k]}`)).map(([g, v]) => `${g}=${v.length}`).join(" ");
  const kinds = Object.groupBy(jobs, (j) => j.id.replace(/-\d+$/, ""));
  console.log(JSON.stringify({ files: all.length, lanes: count("lane"), phases: count("phase"), jobs: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.length])), missing: all.filter((e) => e.sig.missing).map((e) => e.file) }));
}

function writeCandidates(all) {
  const rows = [];
  for (const e of all) for (const f of e.fns) if (f.held) rows.push(`- \`${e.repo}:${e.file}\` \`${f.name}\` ${f.lines} — ${f.category}: ${f.reason}`);
  const heldFiles = all.filter((e) => e.lane === "owner-exception" && !e.fns.some((f) => f.held));
  for (const e of heldFiles) rows.push(`- \`${e.repo}:${e.file}\` ${e.fileLines ? `file ${e.fileLines}; ` : ""}${e.fns.map((f) => `\`${f.name}\` ${f.lines}`).join(", ")} — held since the 100-line design (see reasons below)`);
  const flagged = [];
  for (const e of all) for (const f of e.fns) if (f.category && !f.held && !/composition\/(deps|app)\.ts$/.test(e.file)) flagged.push(`- \`${e.repo}:${e.file}\` \`${f.name}\` ${f.lines} — heuristic "${f.category}"; recommend SPLIT (real logic, not a list)`);
  const tmpl = fs.readFileSync(path.join(DIR, "exception-candidates.head.md"), "utf8");
  fs.writeFileSync(path.join(DIR, "exception-candidates.md"), tmpl
    .replace("<!-- HELD -->", rows.join("\n"))
    .replace("<!-- FLAGGED -->", flagged.join("\n"))
    .replace("<!-- COUNT -->", String(rows.length)));
}

main();
