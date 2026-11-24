#!/usr/bin/env node
/**
 * @file The `tree-quiet` gate (registered in `quality-gates.json`) — the PRIMARY half of the
 * packaging safety gate: decides whether `apps/desktop` is quiet enough to pack, before
 * `electron-builder` ever runs. Gathers three signals and hands them to `@jini-ai/devops`'s pure
 * `treeQuietProblems`, with this desktop's wording injected as formatters, then turns the result
 * into an exit code. It lives in `quality-gates.json` because that runs before `electron-builder`,
 * the only place in the `package` script chain that can refuse a pack before it starts.
 *
 * ## Why refusing to pack beats detecting corruption after the fact
 *
 * `ADS-memory/reports/2026-09-12-packaging-asar-corruption.md` found that packing while
 * `apps/desktop/src` is being edited (or a `vite build --watch` is rewriting `dist/renderer`) shifts
 * app.asar's internal file offsets: length-correct, content-wrong, and invisible to electron-builder,
 * code signing, and `asar list`/`asar extract` alike. `electron-builder` still exits 0 and produces a
 * signed, mountable `.dmg`. Refusing to start the pack in the first place is strictly better than
 * building it and finding out later — it is free, and it is the one variable that separated that
 * corrupt build from two clean ones run the same day.
 *
 * This check can only see what changed DURING however long it chose to look, though — it is a
 * sample, not a proof of quiescence for the whole pack that follows. The backstop half —
 * byte-for-byte verification of the finished `app.asar` (`src/asar-verify.ts`) — is
 * `scripts/verify-package.ts`, appended after `electron-builder` in `package.json`'s `package`
 * script. It cannot live here: there is no artifact yet for this gate to inspect. A pass here does
 * not make that check optional.
 *
 * ## Why "moving" is a live snapshot diff, never an absolute mtime age
 *
 * `npm run gates` also runs in CI on every push, straight after a fresh `actions/checkout`
 * (`.github/workflows/desktop.yml:79`). A checkout sets EVERY file's mtime to "now", so "anything
 * under src modified in the last N seconds" would read true on literally every CI run, for reasons
 * that have nothing to do with a moving tree. Comparing two live snapshots taken a short interval
 * apart has no dependency on when the checkout happened: a quiescent tree (checked out and then left
 * alone) produces two IDENTICAL snapshots regardless of how "new" its mtimes are in absolute terms.
 *
 * Usage: node scripts/check-tree-quiet.ts
 * Exit codes: 0 = apps/desktop was quiet. 1 = it was not (message names which signal fired).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { redactLocalText } from "@jini-ai/diagnostics/local-text";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { treeQuietProblems } from "@jini-ai/devops/packaging/electron";
import type { TreeQuietFormatters } from "@jini-ai/devops/packaging/electron";

/** The slice of `execFileSync` this check calls: pgrep, git and sleep. */
type ExecPort = (file: string, args: readonly string[], options?: { encoding?: "utf8"; stdio?: "pipe" }) => string | Buffer;

/** What this gate observed. See {@link desktopTreeQuietProblems} for each field. */
interface TreeQuietSignals {
  viteWatchRunning: boolean;
  gitDirtyPaths?: readonly string[];
  movingPaths?: readonly string[];
}

/** A cheap fingerprint of one path, as {@link snapshot} produces it. */
interface Snapshot {
  exists: boolean;
  fileCount: number;
  newestMtimeMs: number;
}

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");

/** Exactly the surface `scripts/verify-package.ts` checks byte-for-byte after the pack — keeping
 *  the two halves scoped to the same files means a pass here is describing the thing the backstop
 *  will actually verify, not a different guess at what matters. The Electron entry
 *  (`src/main/index.ts`) lives inside `src`, so it needs no path of its own here. */
const VERIFIED_RELATIVE_PATHS = ["apps/desktop/src", "apps/desktop/bin"];

/** How far apart the two live snapshots are taken. Short enough not to make `npm run gates`
 *  noticeably slower; long enough to catch a write that lands mid-check. This is a SAMPLE, not a
 *  guarantee — see this file's header on what this precondition can and cannot prove. */
const SNAPSHOT_WINDOW_SECONDS = 0.8;

/** The desktop's own wording for each signal `treeQuietProblems` reports. */
const DESKTOP_TREE_QUIET_FORMATTERS: TreeQuietFormatters = {
  /** Why a live `vite build --watch` blocks packaging — the named, known culprit from the incident. */
  watcherRunning: () =>
    "a `vite build --watch` process is running against apps/desktop. It rewrites dist/renderer " +
    "continuously, and packing while it runs is the exact precondition that shifted app.asar's file " +
    "offsets on 2026-09-12 (ADS-memory/reports/2026-09-12-packaging-asar-corruption.md). Stop it " +
    "before packaging.",
  /** Why uncommitted edits under the packaged surface block packaging — the concrete shape "another
   *  agent or human is editing this" takes in a git-tracked repo, and unlike an mtime age, empty on a
   *  fresh CI checkout by construction (there is nothing to diff against). */
  gitDirty: ({ paths }) =>
    `apps/desktop has uncommitted changes under the packaged surface: ${paths.join(", ")}. ` +
    "A tree with edits in flight is exactly the state that produced a corrupt, signed app.asar on " +
    "2026-09-12 — commit or stash the changes, or wait for whoever is editing, before packaging.",
  /** Why files changing DURING the check blocks packaging — the live signal git cannot provide for
   *  build output that is gitignored (dist/renderer is never tracked, so git-dirty is blind to it). */
  moving: ({ paths }) =>
    `apps/desktop is still being written to: ${paths.join(", ")} changed during this check. ` +
    "Wait for whatever is producing that output to finish before packaging.",
};

/**
 * Every reason `apps/desktop` is not quiet enough to package, in this desktop's wording. An empty
 * array means quiet — not proof that nothing will move during the pack a moment later, only that
 * nothing was moving when asked.
 *
 * @param signals
 *   - `viteWatchRunning`: a `vite build --watch` process is currently alive.
 *   - `gitDirtyPaths`: paths under the packaged surface (`src/`, which holds the entry `src/main/index.ts`, and `bin/`) `git status`
 *     reports as modified or untracked, relative to the packaged surface roots.
 *   - `movingPaths`: paths whose live directory snapshot changed between two observations taken a
 *     short interval apart.
 * @returns human-readable problems, ready to print — empty when the tree is quiet.
 * @complexity O(1) plus the length of the path lists it echoes back.
 */
function desktopTreeQuietProblems(signals: TreeQuietSignals, _options = {}): string[] {
  return treeQuietProblems(
    { surface: "apps/desktop", watcherRunning: signals.viteWatchRunning, gitDirtyPaths: signals.gitDirtyPaths ?? [], movingPaths: signals.movingPaths ?? [] },
    { formatters: DESKTOP_TREE_QUIET_FORMATTERS },
  );
}

/** True when a `vite build --watch` is live. `pgrep` exits 1 for "no match", which is a normal "not
 *  running" outcome, not a script failure — only a non-1 exit is a real error worth surfacing.
 *  @complexity O(1) plus pgrep's own cost. */
function isViteWatchRunning(exec: ExecPort): boolean {
  try {
    exec("pgrep", ["-f", "vite build --watch"], { stdio: "pipe" });
    return true;
  } catch (error) {
    // `as`: execFileSync throws a plain Error decorated with the spawned process's own `status`.
    if ((error as { status?: number }).status === 1) return false;
    throw new Error(`check-tree-quiet: pgrep failed unexpectedly: ${sanitizeUntrustedText({ text: redactLocalText({ text: (error as Error).message }) }, { maxLength: 2_000 })}`);
  }
}

/** Paths git considers dirty under the packaged surface — scoped explicitly with pathspecs, never a
 *  bare `git status`, so this reads exactly the files the backstop half will later check. On a fresh
 *  CI checkout this is empty by construction: there is nothing to diff against yet.
 *  @complexity O(1) plus git's own cost. */
function gitDirtyPaths({ exec, repoRoot }: { exec: ExecPort; repoRoot: string }, _options = {}): string[] {
  const output = String(exec(
    "git",
    ["-C", repoRoot, "status", "--porcelain", "--", ...VERIFIED_RELATIVE_PATHS],
    { encoding: "utf8" }
  ));
  // Never trim before slicing: the porcelain XY status is two fixed columns and a leading space is
  // one of them (" M path" = unstaged modify). Trimming it shifts the path left, and slice(3) then
  // eats the path's first character ("pps/desktop/..." for "apps/desktop/...").
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3));
}

/** A cheap fingerprint of a path: file count plus the newest mtime seen underneath it. Two
 *  snapshots taken moments apart are identical iff nothing was created, deleted, or written to in
 *  between — deliberately not a content hash, since this needs to run twice in under a second, not
 *  walk-and-hash a multi-hundred-file tree twice.
 *  @complexity O(n) in files under `absPath`. */
function snapshot({ absPath }: { absPath: string }, _options = {}): Snapshot {
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
      const childSnap = snapshot({ absPath: child });
      fileCount += childSnap.fileCount;
      newestMtimeMs = Math.max(newestMtimeMs, childSnap.newestMtimeMs);
    } else if (entry.isFile()) {
      fileCount += 1;
      newestMtimeMs = Math.max(newestMtimeMs, statSync(child).mtimeMs);
    }
  }
  return { exists: true, fileCount, newestMtimeMs };
}

function snapshotsDiffer({ a, b }: { a: Snapshot; b: Snapshot }, _options = {}): boolean {
  return a.exists !== b.exists || a.fileCount !== b.fileCount || a.newestMtimeMs !== b.newestMtimeMs;
}

/** Which of `VERIFIED_RELATIVE_PATHS` changed between two snapshots taken `SNAPSHOT_WINDOW_SECONDS`
 *  apart — the live "something is writing right now" signal git cannot provide for gitignored build
 *  output (`dist/renderer`). Blocks synchronously via the `sleep` binary rather than `setTimeout`, so
 *  this stays a single straight-line script with no async plumbing for what is a one-shot check.
 *  @complexity O(n) in files under the verified surface, twice. */
function movingPaths({ exec, repoRoot }: { exec: ExecPort; repoRoot: string }, _options = {}): string[] {
  const before = VERIFIED_RELATIVE_PATHS.map((rel) => snapshot({ absPath: path.join(repoRoot, rel) }));
  exec("sleep", [String(SNAPSHOT_WINDOW_SECONDS)]);
  const after = VERIFIED_RELATIVE_PATHS.map((rel) => snapshot({ absPath: path.join(repoRoot, rel) }));
  return VERIFIED_RELATIVE_PATHS.filter((_, i) => snapshotsDiffer({ a: before[i]!, b: after[i]! }));
  // !: `before`/`after` are both mapped from VERIFIED_RELATIVE_PATHS with .map, so they share its
  // length and `i` (from the same filter over VERIFIED_RELATIVE_PATHS) is always in bounds of both.
}

/**
 * The whole check over its effects. `exec` stands in for `execFileSync` (pgrep, git, sleep) and
 * `repoRoot` for the checkout, so a test can drive every signal without a real watcher or repo.
 * @returns the exit code: 0 quiet, 1 when any signal says the tree is moving or a probe failed.
 * @complexity O(n) in files under the verified surface.
 */
function runTreeQuietCheck(
  { exec, out, err }: { exec: ExecPort; out: (text: string) => void; err: (text: string) => void },
  { repoRoot = REPO_ROOT }: { repoRoot?: string } = {},
): number {
  try {
    const signals: TreeQuietSignals = {
      viteWatchRunning: isViteWatchRunning(exec),
      gitDirtyPaths: gitDirtyPaths({ exec, repoRoot }),
      movingPaths: movingPaths({ exec, repoRoot }),
    };

    const problems = desktopTreeQuietProblems(signals);
    if (problems.length > 0) {
      err("check-tree-quiet: apps/desktop is not quiet enough to package safely:\n");
      for (const problem of problems) err(`  - ${problem}\n`);
      return 1;
    }
    out("check-tree-quiet: OK — apps/desktop is quiet\n");
    return 0;
  } catch (error) {
    err(sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n");
    return 1;
  }
}

/** Run only when this file IS the process, never when a test imports it. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runTreeQuietCheck({
    exec: execFileSync,
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  });
}

export { VERIFIED_RELATIVE_PATHS, desktopTreeQuietProblems, runTreeQuietCheck, snapshot };
export type { ExecPort };
