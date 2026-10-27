#!/usr/bin/env node
// Mutation helper for the 2026-10-27 GREEN cloud run.
//   node ADS-memory/reports/cloud-runs/2026-10-27-green/mutate.mjs <lotId> apply   [--extra]   put the lot's mutation paths back to the BASE commit
//   node ADS-memory/reports/cloud-runs/2026-10-27-green/mutate.mjs <lotId> restore [--extra]   put them back to HEAD (the fixed code)
//   node ADS-memory/reports/cloud-runs/2026-10-27-green/mutate.mjs ALL apply|restore           every Tovu lot SOURCE file back to BASE (tests untouched):
//                                                          use it to tell a pre-existing sweep failure from a new one
//   node ADS-memory/reports/cloud-runs/2026-10-27-green/mutate.mjs --list                      list lot ids and mutation kinds
// --extra also mutates the lot's `extra_shared_step` paths (shared files; see LOTS.json).
// A path absent at the target commit is deleted. After every call the script prints
// `git status --porcelain` for the touched paths; after `restore` it must be empty.
// Env: TOVU_ROOT (default /home/user/Tovu), JINI_ROOT (default /root/Jini).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(path.join(here, "LOTS.json"), "utf8"));
const roots = { tovu: process.env.TOVU_ROOT ?? "/home/user/Tovu", jini: process.env.JINI_ROOT ?? "/root/Jini" };
const bases = { tovu: doc.tovu_base, jini: doc.jini_base };

const [lotId, action, flag] = process.argv.slice(2);
if (lotId === "--list") {
  for (const lot of doc.lots) console.log(`${lot.id}\t${lot.mutation.kind}`);
  process.exit(0);
}
const lot = lotId === "ALL"
  ? { id: "ALL", repo: "tovu", mutation: { kind: "all-tovu-sources",
      paths: [...new Set(doc.lots.filter(l => l.repo === "tovu").flatMap(l => l.sources))] } }
  : doc.lots.find(l => l.id === lotId);
if (!lot || !["apply", "restore"].includes(action)) {
  console.error("usage: mutate.mjs <lotId> apply|restore [--extra]   (or --list)");
  process.exit(2);
}
const mutation = lot.mutation;
if (!mutation.paths) {
  console.error(`lot ${lotId}: mutation kind '${mutation.kind}' has no paths (${mutation.why ?? "see LOTS.json"})`);
  process.exit(3);
}
const repo = mutation.repo ?? lot.repo;
const root = roots[repo];
const paths = [...mutation.paths, ...(flag === "--extra" && mutation.extra_shared_step ? mutation.extra_shared_step.paths : [])];
const commit = action === "apply" ? bases[repo] : "HEAD";

const git = args => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
const blobAt = (rev, file) => {
  try {
    return execFileSync("git", ["-C", root, "show", `${rev}:${file}`], { maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

for (const file of paths) {
  const bytes = blobAt(commit, file);
  const abs = path.join(root, file);
  if (bytes === null) {
    rmSync(abs, { force: true });
    console.log(`${action}: deleted ${repo}:${file} (absent at ${commit})`);
  } else {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    console.log(`${action}: ${repo}:${file} <- ${commit}`);
  }
}
const left = git(["status", "--porcelain", "--", ...paths]);
console.log(`git status for touched paths (${action === "restore" ? "must be empty" : "expected dirty"}):\n${left || "(clean)"}`);
if (action === "restore" && left.trim()) process.exit(4);
if (mutation.rebuild) console.log(`NOW REBUILD: ${mutation.rebuild}`);
