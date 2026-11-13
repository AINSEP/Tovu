#!/usr/bin/env node
// Builds the size-NN.terra-prompt.md files and the generated tail of PLAN.md from
// batches.tsv (file -> batch), parts/<repo>/<path>.md (one design fragment per file) and CONVENTIONS.md.
// Why generated: one fragment per file is the single source; prompts and PLAN must never drift from it.
// Lanes: owner-exception-candidates.txt (held until the owner rules), hard-files.txt (detailed plans in hard/) and fragments that say "Fable" go to the Fable/Opus lane;
// a fragment marked "DONE as the worked example" is skipped. Re-run after editing any fragment.
// Usage: node development/refactor-patterns/size-splits/assemble.mjs   (writes only inside size-splits/)
import fs from "node:fs";
import path from "node:path";

const DIR = import.meta.dirname;
const tsv = (f) => { const [h, ...rows] = fs.readFileSync(path.join(DIR, f), "utf8").trim().split("\n").map((l) => l.split("\t")); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""]))); };
const batches = tsv("batches.tsv");
const index = tsv("index.tsv");
const listOf = (f) => new Set(fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter(Boolean));
const hard = listOf("hard-files.txt");
// Held for the owner: fragments whose only answer is an exception (no responsibility split, or vendored/serialized code).
const ownerHeld = listOf("owner-exception-candidates.txt");
const fragPath = (repo, file) => path.join(DIR, "parts", repo, `${file.replaceAll("/", "__")}.md`);
const frag = (repo, file) => (fs.existsSync(fragPath(repo, file)) ? fs.readFileSync(fragPath(repo, file), "utf8").trim() : "");
const lane = (repo, file) => {
  if (hard.has(file)) return "hard";
  const f = frag(repo, file);
  if (!f) return "missing";
  if (/DONE as the worked example/.test(f)) return "done";
  if (/Fable/.test(f)) return "fable";
  if (ownerHeld.has(file)) return "owner-exception";
  return "terra";
};
const conventions = fs.readFileSync(path.join(DIR, "CONVENTIONS.md"), "utf8").replace(/^# .*\n/, "");
const byBatch = new Map();
for (const r of batches) { if (!byBatch.has(r.batch)) byBatch.set(r.batch, []); byBatch.get(r.batch).push(r); }
const summary = [];
for (const [batch, rows] of byBatch) {
  const repo = rows[0].repo, phase = rows[0].phase;
  const terra = rows.filter((r) => lane(r.repo, r.file) === "terra");
  const other = rows.filter((r) => lane(r.repo, r.file) !== "terra").map((r) => `${r.file} (${lane(r.repo, r.file)})`);
  summary.push({ batch, repo, phase, terra: terra.map((r) => r.file), other });
  const out = path.join(DIR, `${batch}.terra-prompt.md`);
  if (!terra.length) { if (fs.existsSync(out)) fs.rmSync(out); continue; }
  const repoLine = repo === "tovu"
    ? "Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root."
    : "Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.";
  const phaseLine = phase === "after-move"
    ? "AFTER-MOVE: run this job only after the Tovu→Jini move work for these files has landed. If a file is gone, or `outline.mjs` no longer shows the declarations a fragment names, STOP that file and report it — the plan is stale for it."
    : "READY: these files are not reshaped by the Tovu→Jini move.";
  const body = [
    `# Terra job ${batch}: split ${terra.length} ${repo === "tovu" ? "Tovu" : "Jini"} file(s) by responsibility (size limits)`,
    "",
    `Generated 2026-11-13 by \`development/refactor-patterns/size-splits/assemble.mjs\` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.`,
    "",
    repoLine, "", phaseLine, "",
    "## Rules", conventions.trim(), "",
    "## For each file, in the order listed",
    "1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.",
    "2. Complete the test list: `rg -l \"<file stem>\" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.",
    "3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.",
    "4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.",
    "5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).",
    "",
    "## Files",
    ...terra.map((r) => frag(r.repo, r.file) + "\n"),
    "## Done check",
    `\`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check ${terra.map((r) => r.file).join(" ")} <every new file>\` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.`,
    "",
  ].join("\n");
  fs.writeFileSync(out, body);
}
// generated PLAN.md sections (everything after the marker line; the hand-written head is kept)
const scoreOf = new Map(index.map((r) => [`${r.repo}:${r.file}`, Number(r.max_score)]));
const batchOf = new Map(batches.map((r) => [`${r.repo}:${r.file}`, r.batch]));
const lanes = {};
for (const r of index) (lanes[lane(r.repo, r.file)] ??= []).push(r);
const sec = [];
sec.push("## Batches (generated)", "", "| batch | repo | phase | Terra files | not in this prompt (lane) |", "|---|---|---|---|---|");
for (const s of summary) sec.push(`| ${s.terra.length ? `[${s.batch}](${s.batch}.terra-prompt.md)` : s.batch} | ${s.repo} | ${s.phase} | ${s.terra.length} | ${s.other.map((o) => `\`${o}\``).join(", ")} |`);
sec.push("", "## Fable/Opus lane (generated: fragments that recommend a strong executor)", "", "| file | batch | why (from the fragment) |", "|---|---|---|");
for (const r of (lanes.fable ?? []).sort((a, b) => b.max_score - a.max_score)) sec.push(`| \`${r.repo}:${r.file}\` | ${batchOf.get(`${r.repo}:${r.file}`)} | ${(frag(r.repo, r.file).match(/[^\n]*Fable[^\n]*/)?.[0] ?? "").replace(/\|/g, "/").replace(/^[-* ]+/, "").slice(0, 160)} |`);
sec.push("", "## Per-file index, highest score first (generated; the plan for each file is its fragment in parts/)", "", "| # | file | over (file / functions) | phase | lane | batch | plan | after (from the plan) |", "|---|---|---|---|---|---|---|---|");
let n = 0;
for (const r of [...index].sort((a, b) => b.max_score - a.max_score)) {
  const l = lane(r.repo, r.file);
  const link = l === "hard" ? "[hard/](hard/)" : `[fragment](parts/${r.repo}/${r.file.replaceAll("/", "__")}.md)`;
  const after = l === "hard" ? "see hard plan" : (frag(r.repo, r.file).match(/\*\*After:\*\*([^\n]*)/)?.[1] ?? "").replace(/\|/g, "/").trim().slice(0, 90);
  sec.push(`| ${++n} | \`${r.repo}:${r.file}\` | ${r.file_lines || "-"} / ${r.fns_over_100.replace(/\|/g, "/") || "-"} | ${r.phase} | ${l} | ${batchOf.get(`${r.repo}:${r.file}`) ?? "-"} | ${link} | ${after} |`);
}
const MARK = "<!-- GENERATED BELOW by assemble.mjs; edit fragments, not this part -->";
const planPath = path.join(DIR, "PLAN.md");
const head = fs.existsSync(planPath) ? fs.readFileSync(planPath, "utf8").split(MARK)[0] : "# Size splits plan\n\n";
fs.writeFileSync(planPath, `${head}${MARK}\n\n${sec.join("\n")}\n`);
const count = Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.length]));
console.log(JSON.stringify({ lanes: count, prompts: summary.filter((s) => s.terra.length).length }));
