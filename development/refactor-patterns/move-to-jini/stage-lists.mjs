#!/usr/bin/env node
// Writes stage-NN.files.tsv from manifest.tsv, one list per Terra stage, so every stage prompt
// names its exact files. Re-run after build-manifest.mjs; the filters below ARE the stage scope
// (PLAN.md quotes them). Rows whose file no longer exists are kept with exists_now=n so the
// executor reports them instead of guessing where the code went.
//
// Usage: node development/refactor-patterns/move-to-jini/stage-lists.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dir = "development/refactor-patterns/move-to-jini";
const [head, ...body] = readFileSync(`${dir}/manifest.tsv`, "utf8").trim().split("\n");
const cols = head.split("\t");
const rows = body.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cols[i], v])));
const isTest = (p) => /__tests__|\.test\.|\.spec\./.test(p);

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

const out = ["path", "loc", "action", "pkg", "subpath", "exists_now", "feature", "label", "home"];
const summary = [];
for (const [n, pred] of Object.entries(stages)) {
  const picked = rows.filter((r) => !isTest(r.path) && pred(r));
  writeFileSync(`${dir}/stage-${n}.files.tsv`, [out.join("\t"), ...picked.map((r) => out.map((c) => r[c] ?? "").join("\t"))].join("\n") + "\n");
  summary.push(`stage-${n}: ${picked.length} files, ${picked.reduce((a, r) => a + Number(r.loc), 0)} lines, missing-now ${picked.filter((r) => r.exists_now === "n").length}`);
}
console.log(summary.join("\n"));
