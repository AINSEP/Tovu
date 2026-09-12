#!/usr/bin/env node
/**
 * @file The `tree-quiet` gate (registered in `quality-gates.json`) — the PRIMARY half of the
 * packaging safety gate. Gathers the three signals `../src/tree-quiet.js`'s pure predicate decides
 * on and turns the result into an exit code. See that file's header for why each signal is shaped
 * the way it is, and for why this lives in `quality-gates.json` at all (it runs before
 * `electron-builder`, which is the only place in the `package` script chain that can refuse a pack
 * before it starts).
 *
 * The backstop half — byte-for-byte verification of the finished `app.asar` — is
 * `scripts/verify-package.mjs`, appended after `electron-builder` in `package.json`'s `package`
 * script. It cannot live here: there is no artifact yet for this gate to inspect.
 *
 * Usage: node scripts/check-tree-quiet.mjs
 * Exit codes: 0 = apps/desktop was quiet. 1 = it was not (message names which signal fired).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { treeQuietProblems } from "../src/tree-quiet.ts";
import type { TreeQuietSignals } from "../src/tree-quiet.ts";

/** A cheap fingerprint of one path, as {@link snapshot} produces it. */
interface Snapshot {
  exists: boolean;
  fileCount: number;
  newestMtimeMs: number;
}

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");

/** Exactly the surface `scripts/verify-package.mjs` checks byte-for-byte after the pack — keeping
 *  the two halves scoped to the same files means a pass here is describing the thing the backstop
 *  will actually verify, not a different guess at what matters. */
const VERIFIED_RELATIVE_PATHS = ["apps/desktop/src", "apps/desktop/bin", "apps/desktop/main.ts"];

/** How far apart the two live snapshots are taken. Short enough not to make `npm run gates`
 *  noticeably slower; long enough to catch a write that lands mid-check. This is a SAMPLE, not a
 *  guarantee — see `tree-quiet.js`'s header on what this precondition can and cannot prove. */
const SNAPSHOT_WINDOW_SECONDS = 0.8;

/** True when a `vite build --watch` is live. `pgrep` exits 1 for "no match", which is a normal "not
 *  running" outcome, not a script failure — only a non-1 exit is a real error worth surfacing.
 *  @complexity O(1) plus pgrep's own cost. */
function isViteWatchRunning(): boolean {
  try {
    execFileSync("pgrep", ["-f", "vite build --watch"], { stdio: "pipe" });
    return true;
  } catch (error) {
    // `as`: execFileSync throws a plain Error decorated with the spawned process's own `status`.
    if ((error as { status?: number }).status === 1) return false;
    throw new Error(`check-tree-quiet: pgrep failed unexpectedly: ${(error as Error).message}`);
  }
}

/** Paths git considers dirty under the packaged surface — scoped explicitly with pathspecs, never a
 *  bare `git status`, so this reads exactly the files the backstop half will later check. On a fresh
 *  CI checkout this is empty by construction: there is nothing to diff against yet.
 *  @complexity O(1) plus git's own cost. */
function gitDirtyPaths(): string[] {
  const output = execFileSync(
    "git",
    ["-C", REPO_ROOT, "status", "--porcelain", "--", ...VERIFIED_RELATIVE_PATHS],
    { encoding: "utf8" }
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3));
}

/** A cheap fingerprint of a path: file count plus the newest mtime seen underneath it. Two
 *  snapshots taken moments apart are identical iff nothing was created, deleted, or written to in
 *  between — deliberately not a content hash, since this needs to run twice in under a second, not
 *  walk-and-hash a multi-hundred-file tree twice.
 *  @complexity O(n) in files under `absPath`. */
function snapshot(absPath: string): Snapshot {
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return { exists: false, fileCount: 0, newestMtimeMs: 0 };
  }
  if (!stat.isDirectory()) {
    return { exists: true, fileCount: 1, newestMtimeMs: stat.mtimeMs };
  }
  let fileCount = 0;
  let newestMtimeMs = 0;
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    const child = path.join(absPath, entry.name);
    if (entry.isDirectory()) {
      const childSnap = snapshot(child);
      fileCount += childSnap.fileCount;
      newestMtimeMs = Math.max(newestMtimeMs, childSnap.newestMtimeMs);
    } else if (entry.isFile()) {
      fileCount += 1;
      newestMtimeMs = Math.max(newestMtimeMs, statSync(child).mtimeMs);
    }
  }
  return { exists: true, fileCount, newestMtimeMs };
}

function snapshotsDiffer(a: Snapshot, b: Snapshot): boolean {
  return a.exists !== b.exists || a.fileCount !== b.fileCount || a.newestMtimeMs !== b.newestMtimeMs;
}

/** Which of `VERIFIED_RELATIVE_PATHS` changed between two snapshots taken `SNAPSHOT_WINDOW_SECONDS`
 *  apart — the live "something is writing right now" signal git cannot provide for gitignored build
 *  output (`dist/renderer`). Blocks synchronously via the `sleep` binary rather than `setTimeout`, so
 *  this stays a single straight-line script with no async plumbing for what is a one-shot check.
 *  @complexity O(n) in files under the verified surface, twice. */
function movingPaths(): string[] {
  const before = VERIFIED_RELATIVE_PATHS.map((rel) => snapshot(path.join(REPO_ROOT, rel)));
  execFileSync("sleep", [String(SNAPSHOT_WINDOW_SECONDS)]);
  const after = VERIFIED_RELATIVE_PATHS.map((rel) => snapshot(path.join(REPO_ROOT, rel)));
  return VERIFIED_RELATIVE_PATHS.filter((_, i) => snapshotsDiffer(before[i]!, after[i]!));
  // !: `before`/`after` are both mapped from VERIFIED_RELATIVE_PATHS with .map, so they share its
  // length and `i` (from the same filter over VERIFIED_RELATIVE_PATHS) is always in bounds of both.
}

function main(): void {
  const signals: TreeQuietSignals = {
    viteWatchRunning: isViteWatchRunning(),
    gitDirtyPaths: gitDirtyPaths(),
    movingPaths: movingPaths(),
  };

  const problems = treeQuietProblems(signals);
  if (problems.length > 0) {
    process.stderr.write("check-tree-quiet: apps/desktop is not quiet enough to package safely:\n");
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
    return;
  }
  process.stdout.write("check-tree-quiet: OK — apps/desktop is quiet\n");
}

main();
