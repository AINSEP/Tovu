#!/usr/bin/env node
// Writes stage-NN.files.tsv from manifest.tsv, one list per Terra stage, so every stage prompt
// names its exact files. Re-run after build-manifest.mjs and after EVERY stage lands; the filters
// below ARE the stage scope (PLAN.md quotes them). Rows whose file no longer exists are kept with
// exists_now=n so the executor reports them instead of guessing where the code went.
//
// Why successors and a ledger: a stage that moves a file (stage 03 TYPE-DOWN, stage 04 C5) makes
// every later survey path stale, and a row a stage could not finish must come back once what it
// waits on has landed. successors.tsv maps old path/symbol -> new; ledger.tsv records every row's
// outcome. Both are written by the coordinator from stage reports (SUCCESSOR / waits_on lines).
//
// Usage (from the Tovu clone root):
//   node development/refactor-patterns/move-to-jini/stage-lists.mjs                       write all stage lists
//   node development/refactor-patterns/move-to-jini/stage-lists.mjs --retry               write stage-13r.files.tsv (WAITING rows whose dependency landed)
//   node development/refactor-patterns/move-to-jini/stage-lists.mjs --check-disposition   exit 1 if any stage row has no final disposition (stage 16 gate)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dir = "development/refactor-patterns/move-to-jini";
const readTsv = (file) => {
  if (!existsSync(file)) return [];
  const [head, ...body] = readFileSync(file, "utf8").trim().split("\n");
  const cols = head.split("\t");
  return body.filter((l) => l.trim() && !l.startsWith("#")).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v])));
};
const rows = readTsv(`${dir}/manifest.tsv`);
const isTest = (p) => /__tests__|\.test\.|\.spec\./.test(p);

// successors.tsv: old_path, old_symbol (empty = whole file), new_path, new_symbol, stage, status (planned|landed), note.
// Only landed rows are applied. A whole-file successor rewrites the row's path (chains are followed);
// the original path stays in the `was` column so importers of a left-behind shim are found too.
const successors = readTsv(`${dir}/successors.tsv`).filter((s) => s.status === "landed");
function successorPath(path, seen = new Set()) {
  const next = successors.find((s) => s.old_path === path && !s.old_symbol);
  if (!next || seen.has(path)) return path;
  seen.add(path);
  return successorPath(next.new_path, seen);
}
const symbolNotes = (path) => successors.filter((s) => s.old_path === path && s.old_symbol)
  .map((s) => `${s.old_symbol} now ${s.new_path}${s.new_symbol && s.new_symbol !== s.old_symbol ? `#${s.new_symbol}` : ""}`);

// ledger.tsv: path (the ORIGINAL survey path), stage, status, waits_on, note. Last line per path wins.
// status: DONE | WAITING | OWNER (waits_on owner:Dn) | STAYS | DEFERRED (note names the todos.md entry) | RECLASSIFIED (note names the new label).
const ledger = new Map(readTsv(`${dir}/ledger.tsv`).map((l) => [l.path, l]));
const SETTLED = new Set(["DONE", "STAYS", "DEFERRED", "RECLASSIFIED"]);
const FINAL = new Set([...SETTLED, "OWNER"]);

const MOVE_GROUPS = {
  "06": ["http-kit", "diagnostics", "analytics", "sidecar", "db", "search"],
  "07": ["integrations", "mcp", "daemon", "agentic", "agent-runtime", "agent-plugins", "plugins"],
  "08": ["user-management", "devops", "platform", "desktop-host", "core"],
  "09": ["ui", "ui-kit", "admin", "chat"],
};
const CMS_SPLIT = {
  "10": /website\/features\/(navigation|taxonomy|comments|redirects|trash|content-duplication|seo)$/,
  "11": /./, // every other cms MOVE row (media, post, entries, forms, widgets, content-types, plugin-runtime, contracts)
};
const expressFile = (p) => existsSync(p) && /from\s+['"]express['"]/.test(readFileSync(p, "utf8"));

// Designer routing (review d1 findings 1 and 10). Stages 01 and 02 are mechanical; a row whose survey
// text asks for judgment goes to an Opus/Fable stage instead of being forced through the Terra recipe.
// - DELETE rows that ask to inline/fold the file into a caller, relocate it to tests, or offer
//   alternatives ("or") are adapter-inline work, not dead code: stage 02b.
const JUDGMENT_DELETE = /\binline|\bfold|\bmove\b[^.;|]*\bto tests?\b|\bor\b/i;
// - Stage 02 keeps only rows that name an already-published Jini equivalent with a stated mapping.
//   Consolidate-first rows and visual swaps -> 02b; rows that need a Jini addition or a new helper
//   -> 14 (survivor built or hardened test-first); an Express route -> 12.
const R02B_CONSOLIDATE = "02b: consolidate the Tovu copies first (Tovu<->Tovu)";
const R02B_VISUAL = "02b: visual swap onto an existing Jini component (look in Claude in Chrome)";
const R14_ADD = "14: needs a Jini addition before the dedupe (harden test-first, additive)";
const R14_NEW = "14: NEW-SURVIVOR: no Jini equivalent yet; build it test-first, additive";
const ROUTE = {
  "apps/admin/src/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks.ts": ["02b", R02B_CONSOLIDATE],
  "apps/admin/src/components/AssistantDock/MessageOverflowModal.hooks.tsx": ["02b", R02B_VISUAL],
  "apps/admin/src/components/AssistantDock/MessageOverflowModal.tsx": ["02b", R02B_VISUAL],
  "apps/admin/src/features/menus/MenuEditor.hooks.tsx": ["02b", R02B_VISUAL],
  "apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts": ["02b", R02B_VISUAL],
  "apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts": ["14", R14_NEW],
  "apps/admin/src/features/plugins/hooks/use-plugin-remove-confirm.hooks.ts": ["02b", R02B_VISUAL],
  "apps/admin/src/features/plugins/plugins-visuals.tsx": ["02b", R02B_CONSOLIDATE],
  "apps/admin/src/features/posts/hooks/use-posts.hooks.ts": ["02b", R02B_CONSOLIDATE],
  "apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx": ["02b", R02B_VISUAL],
  "apps/admin/src/features/settings/ExternalMcpToolsModal.hooks.ts": ["02b", R02B_CONSOLIDATE],
  "apps/admin/src/features/settings/hooks/use-settings-locale-sync.hooks.ts": ["02b", R02B_CONSOLIDATE],
  "apps/admin/src/features/themes/ThemeExplore.hooks.tsx": ["02b", R02B_VISUAL],
  "apps/admin/src/hooks/use-admin-locale.hooks.ts": ["02b", R02B_CONSOLIDATE],
  "apps/desktop/src/desktop-update-preference.ts": ["14", R14_NEW],
  "apps/desktop/src/keyed-serializer.ts": ["14", R14_NEW],
  "apps/desktop/src/shell-staleness.ts": ["14", "14: Jini export not published yet; needs the linked clone (stage 06 preflight)"],
  "apps/site-chat/src/session-store.ts": ["14", R14_ADD],
  "apps/website/src/assistant/byok-provider-turn.ts": ["14", R14_ADD],
  "apps/website/src/assistant/component-catalog-tool.ts": ["14", "14: carries a bug fix (survey bug 1): failing test first"],
  "apps/website/src/assistant/site-credential-store.ts": ["02b", R02B_CONSOLIDATE],
  "apps/website/src/contracts/headless/plugin-export-catalog.ts": ["14", R14_ADD],
  "apps/website/src/features/agent-plugins/layout.ts": ["14", R14_ADD],
  "apps/website/src/features/entries/trash-aware-memory-repo.ts": ["14", R14_ADD],
  "apps/website/src/features/trash/scheduler.node.ts": ["14", R14_ADD],
  "apps/website/src/platform/site-dir/nested-sites-root.ts": ["02b", R02B_CONSOLIDATE],
  "apps/website/src/server/inbound/admin-http/routes/assistant/execution-request-fields.ts": ["14", R14_ADD],
  "apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts": ["12", "12: Express route + new shared factory (kind A/D)"],
  "apps/website/src/server/inbound/admin-http/routes/seo/get-settings.ts": ["02b", R02B_CONSOLIDATE],
};

const stages = {
  "01": (r) => r.action === "DELETE" || r.action.startsWith("T0:JINI-SHIM"),
  "02": (r) => r.action === "DEDUPE" && r.pkg !== "",
  "02b": (r) => r.action === "DEDUPE" && r.pkg === "",
  ...Object.fromEntries(Object.entries(MOVE_GROUPS).map(([n, pkgs]) => [n, (r) => r.action === "MOVE" && pkgs.includes(r.pkg) && !expressFile(r.path)])),
  "10": (r) => r.action === "MOVE" && r.pkg === "cms" && CMS_SPLIT["10"].test(r.feature) && !expressFile(r.path),
  "11": (r) => r.action === "MOVE" && r.pkg === "cms" && !CMS_SPLIT["10"].test(r.feature) && !expressFile(r.path),
  // Express-bound MOVE rows and MOVE rows with no named package: Opus decides (Server port rewrite / home).
  "12": (r) => r.action === "MOVE" && (r.pkg === "" || expressFile(r.path) || !Object.values(MOVE_GROUPS).flat().concat("cms").includes(r.pkg)),
  "13": (r) => r.action.startsWith("MOVE-AFTER"),
  "14": (r) => ["DEDUPE-AFTER-HARDENING", "DEDUPE-UNVERIFIED", "DELETE-AFTER-PARITY"].includes(r.action),
  "15": (r) => r.action === "MIXED",
};

/** The stage a row belongs to, and why when the designer re-routed it. */
function stageOf(r) {
  if (ROUTE[r.path]) return ROUTE[r.path];
  if (r.action === "DELETE" && JUDGMENT_DELETE.test(r.home)) return ["02b", "02b: ADAPTER-INLINE (survey asks to inline/fold/relocate, not a dead file)"];
  const hit = Object.entries(stages).find(([, pred]) => pred(r));
  return hit ? [hit[0], ""] : [null, ""];
}

/** One output row: successor-applied path, original path in `was`, live exists_now. */
function project(r, route) {
  const path = successorPath(r.path);
  const notes = [route, ...symbolNotes(r.path)].filter(Boolean).join("; ");
  return { ...r, path, was: path === r.path ? "" : r.path, exists_now: existsSync(path) ? "y" : "n", route: notes };
}

const out = ["path", "loc", "action", "pkg", "subpath", "exists_now", "feature", "label", "home", "was", "route"];
const toTsv = (list, cols = out) => [cols.join("\t"), ...list.map((r) => cols.map((c) => String(r[c] ?? "").replace(/[\t\n]/g, " ")).join("\t"))].join("\n") + "\n";
const all = rows.filter((r) => !isTest(r.path)).map((r) => ({ r, st: stageOf(r) })).filter(({ st }) => st[0]);

const args = process.argv.slice(2);
if (args.includes("--retry")) {
  // WAITING rows whose dependency landed: path:<p> -> p is gone or has a landed successor;
  // stage:<id> -> id is a line of stages-landed.txt. owner:/design: never auto-retry.
  const landed = existsSync(`${dir}/stages-landed.txt`) ? readFileSync(`${dir}/stages-landed.txt`, "utf8").split("\n").map((s) => s.trim()) : [];
  const met = (w) => (w.startsWith("path:") ? !existsSync(w.slice(5)) || successorPath(w.slice(5)) !== w.slice(5)
    : w.startsWith("stage:") ? landed.includes(w.slice(6)) : false);
  const waits = (r) => (ledger.get(r.path)?.waits_on || "").split(",").map((w) => w.trim()).filter(Boolean);
  const retry = all.filter(({ r }) => ledger.get(r.path)?.status === "WAITING" && waits(r).length > 0 && waits(r).every(met))
    .map(({ r, st }) => ({ ...project(r, st[1]), waits_on: ledger.get(r.path).waits_on, origin_stage: ledger.get(r.path).stage || st[0] }));
  writeFileSync(`${dir}/stage-13r.files.tsv`, toTsv(retry, [...out, "waits_on", "origin_stage"]));
  console.log(`stage-13r: ${retry.length} WAITING rows whose dependency landed`);
} else if (args.includes("--check-disposition")) {
  const open = all.filter(({ r }) => !FINAL.has(ledger.get(r.path)?.status ?? ""));
  for (const { r, st } of open) console.log(`${st[0]}\t${r.path}\t${ledger.get(r.path)?.status ?? "NO-LEDGER-ROW"}\t${ledger.get(r.path)?.waits_on ?? ""}`);
  console.log(`unsettled rows: ${open.length} (each needs a ledger status DONE, STAYS, DEFERRED, RECLASSIFIED or OWNER)`);
  process.exit(open.length ? 1 : 0);
} else {
  const summary = [];
  for (const n of Object.keys(stages)) {
    const picked = all.filter(({ r, st }) => st[0] === n && !SETTLED.has(ledger.get(r.path)?.status ?? "")).map(({ r, st }) => project(r, st[1]));
    writeFileSync(`${dir}/stage-${n}.files.tsv`, toTsv(picked));
    summary.push(`stage-${n}: ${picked.length} files, ${picked.reduce((a, r) => a + Number(r.loc), 0)} lines, missing-now ${picked.filter((r) => r.exists_now === "n").length}, routed-here ${picked.filter((r) => /^\d/.test(r.route)).length}`);
  }
  console.log(summary.join("\n"));
}
