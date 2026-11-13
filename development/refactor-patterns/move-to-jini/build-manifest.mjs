#!/usr/bin/env node
// Builds manifest.tsv: one row per surveyed Tovu file with its final extraction action and
// Jini destination, from the 2026-11-11 survey (Claude unit reports + judge label overrides).
// Why a script: Terra jobs need exact file lists, and a reviewer must be able to regenerate them.
//
// Usage (from the Tovu clone root):
//   node development/refactor-patterns/move-to-jini/build-manifest.mjs <survey-dir> [--out manifest.tsv]
//   <survey-dir> = .../ADS-memory/.local-artifacts/extraction-survey/2026-11-11
// Limits (state them to anyone quoting numbers):
//   - Base labels = Claude reports (full run first, then rounds 5..2, canary, pilot); Codex reports
//     fill only files no Claude report labelled (unit column starts with codex). Round judges' prose
//     overrides are NOT applied (only full-run judges' "- **x → LABEL" lines).
//   - Judge overrides are parsed from "- **<names> → LABEL" lines only; prose overrides are missed
//     and show up as judge_note=? when the judge report names the file's basename at all.
//   - Tier-0 files (~42k lines: barrels, data, shims) have no reviewer label; the dossier "why"
//     column (JINI-SHIM, BARREL, ...) is copied into action as T0:<why>.
//   - Paths written short in reports are resolved by unique suffix; ambiguous ones are dropped (counted).
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const survey = process.argv[2];
if (!survey) { console.error("usage: build-manifest.mjs <survey-dir> [--out file]"); process.exit(2); }
const outIdx = process.argv.indexOf("--out");
const out = outIdx > 0 ? process.argv[outIdx + 1] : "development/refactor-patterns/move-to-jini/manifest.tsv";

const files = new Map();
for (const line of readFileSync(join(survey, "dossier-v4/files.tsv"), "utf8").split("\n").slice(1)) {
  const [path, feature, batch, loc, tier, why] = line.split("\t");
  if (path) files.set(path, { path, feature, loc: Number(loc), tier, why: why ?? "" });
}
const allPaths = [...files.keys()];
function resolvePath(raw) {
  const p = raw.replace(/^`|`$/g, "").replace(/^\*+|\*+$/g, "").split(/\s/)[0];
  if (files.has(p)) return p;
  const hits = allPaths.filter((a) => a.endsWith("/" + p));
  return hits.length === 1 ? hits[0] : null;
}

const ACTIONS = ["DELETE-AFTER-PARITY", "DEDUPE-AFTER-HARDENING", "DEDUPE-UNVERIFIED", "MOVE-AFTER", "STAY-WIRING", "STAY-PRODUCT", "MIXED", "DEDUPE", "DELETE", "MOVE"];
function actionOf(label) {
  const u = label.toUpperCase();
  let best = null; let bestAt = Infinity;
  for (const a of ACTIONS) { const i = u.indexOf(a); if (i >= 0 && i < bestAt) { best = a; bestAt = i; } }
  return best ?? "UNLABELLED";
}
const PKG_RE = /@jini-ai\/([a-z0-9-]+)((?:\/[a-zA-Z0-9_.-]+)*)/;

const rows = new Map(); let ambiguous = 0;
// Sources in priority order: the first source that labels a file wins. The full run reviewed
// what the pilot/rounds had not, so both are needed; Codex reports only fill gaps.
const SOURCES = [
  ["full/claude", "full"], ["round5/claude", "r5"], ["round4/claude", "r4"], ["round3/claude", "r3"],
  ["round2/claude", "r2"], ["canary/reports", "canary"], ["pilot/claude", "pilot"],
  ["full/codex/out", "codex"], ["round4/codex/out", "codex-r4"], ["round3/codex/out", "codex-r3"],
  ["round2/codex/out", "codex-r2"], ["pilot/codex/out", "codex-pilot"],
];
function pathCell(cell) {
  const link = cell.match(/\]\((?:\/Users\/[^)]*?\/Tovu\/)?([^)#:]+)/);
  return link ? link[1] : cell;
}
for (const [dir, tag] of SOURCES) {
  const abs = join(survey, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs).filter((n) => n.endsWith(".md")).sort()) {
    for (const line of readFileSync(join(abs, f), "utf8").split("\n")) {
      if (!line.startsWith("| ")) continue;
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (cells.length < 5 || !/\.(ts|tsx|mjs|js|css)\b/.test(cells[0])) continue;
      const path = resolvePath(pathCell(cells[0]));
      if (!path) { ambiguous++; continue; }
      if (rows.has(path)) continue;
      const label = cells[2]; const home = cells[3];
      if (!/[A-Z]{4,}/.test(label)) continue; // not a label column
      const m = (label + " " + home).match(PKG_RE);
      rows.set(path, { unit: `${tag}:${f.replace(/\.md$/, "")}`, action: actionOf(label), pkg: m ? m[1] : "", sub: m ? m[2] : "", label, home, judge: "" });
    }
  }
}

// Judge overrides
const groups = JSON.parse(readFileSync(join(survey, "full/judge/groups.json"), "utf8"));
const judgeFiles = readdirSync(join(survey, "full/judge")).filter((n) => /^report-\d+\.md$/.test(n));
for (const jf of judgeFiles) {
  const n = Number(jf.match(/\d+/)[0]);
  const units = new Set((groups[n - 1] ?? []).flatMap((pair) => pair.split("-")));
  const text = readFileSync(join(survey, "full/judge", jf), "utf8");
  const labelsSec = text.split(/\n## 2\. Labels/)[1]?.split(/\n## 3\./)[0] ?? "";
  for (const line of labelsSec.split("\n")) {
    const m = line.match(/^- \*\*(.+?)\s*→\s*([A-Z][A-Z-]+(?:\([^)]*\))?)/);
    if (!m) continue;
    const names = m[1].replace(/\*\*/g, "").split(/,| and /).map((s) => s.trim().replace(/`/g, "")).filter(Boolean);
    for (const [path, row] of rows) {
      if (!row.unit.startsWith("full:") && !row.unit.startsWith("codex:")) continue;
      const u = row.unit.split(":")[1].split("-")[0];
      if (!units.has(u)) continue;
      const b = basename(path); const stem = b.replace(/\.(ts|tsx|mjs|js)$/, "");
      if (names.some((nm) => nm === b || nm === stem || b.startsWith(nm + "."))) {
        row.judge = `${jf}:${m[2]}`; row.action = actionOf(m[2]);
      }
    }
  }
}

const header = ["path", "feature", "loc", "tier", "action", "pkg", "subpath", "exists_now", "unit", "judge", "label", "home"];
const lines = [header.join("\t")];
const totals = new Map();
for (const [path, f] of files) {
  const r = rows.get(path);
  const action = r ? r.action : (f.tier === "0" ? `T0:${f.why}` : "UNREVIEWED");
  const exists = existsSync(path) ? "y" : "n";
  const clean = (s) => (s ?? "").replace(/\t/g, " ").slice(0, 600);
  lines.push([path, f.feature, f.loc, f.tier, action, r?.pkg ?? "", r?.sub ?? "", exists, r?.unit ?? "", r?.judge ?? "", clean(r?.label), clean(r?.home)].join("\t"));
  const k = `${action}\t${r?.pkg || "-"}`;
  totals.set(k, (totals.get(k) ?? 0) + f.loc);
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${out}: ${files.size} files, ${rows.size} labelled, ${ambiguous} unresolved report rows`);
const byAction = new Map();
for (const [k, v] of totals) { const a = k.split("\t")[0]; byAction.set(a, (byAction.get(a) ?? 0) + v); }
console.log([...byAction].sort((a, b) => b[1] - a[1]).map(([a, v]) => `${a}=${v}`).join(" "));
