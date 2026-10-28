#!/usr/bin/env node
/**
 * @file The TypeScript-only backslide gate (registered in `quality-gates.json`): fails the run if
 * any `.js`, `.mjs`, or `.cjs` file exists anywhere under `apps/desktop`, tracked or untracked,
 * outside the one named exception. The decision rule lives in `../src/js-backslide-guard.ts` and is
 * tested there; this file only gathers candidate paths and turns the result into an exit code.
 *
 * See `../src/js-backslide-guard.ts`'s header for why `apps/desktop` was converted to TypeScript
 * (`ADS-memory/reports/2026-09-12-desktop-typescript-migration-plan.md`) and why its one exception
 * (`src/speech/preload-speech.cjs`, transitional — see {@link ALLOWLIST}) is named exactly rather
 * than matched by directory or pattern.
 *
 * ## Why `git ls-files -co --exclude-standard`, not a filesystem walk
 *
 * A raw directory walk would have to reimplement `.gitignore` (`dist/`, `node_modules/`, packaged
 * release output) or hardcode those exclusions a second time, and the two lists would drift. `git
 * ls-files -co --exclude-standard` already applies the repo's own ignore rules and reports both
 * tracked files and untracked-but-not-ignored ones — the same "would this land in a commit" shape
 * `check-tree-quiet.ts`'s `gitDirtyPaths` uses for the same reason.
 *
 * Usage: node scripts/check-js-backslide.ts
 * Exit codes: 0 = no JavaScript-family file exists outside the allowlist.
 *             1 = at least one does (each is named, with a fix hint).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import { fileURLToPath } from "node:url";

import { jsBackslideOffenders } from "../src/js-backslide-guard.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");

/** Transitional, not a permanent exception. `src/speech/preload-speech.cjs` is superseded by
 *  `src/speech/preload-speech.cts`, which `tsconfig.preload.json` compiles to the gitignored
 *  `dist/speech/preload-speech.cjs` that `main.ts` now loads. A desktop app started before that
 *  change still loads the old path for every new window, so the old file stays until that app
 *  restarts — then delete it and empty this list. See `../src/js-backslide-guard.ts`'s header for
 *  why entries are exact paths rather than a directory or pattern. */
const ALLOWLIST = [
  "apps/desktop/src/speech/preload-speech.cjs",
];

/** Every path under `apps/desktop` git would include in a commit right now — tracked plus
 *  untracked-but-not-ignored, so build output and `node_modules` never appear.
 *  @complexity O(1) plus git's own cost. */
function candidatePaths(): string[] {
  const output = execFileSync("git", ["-C", REPO_ROOT, "ls-files", "-co", "--exclude-standard", "--", "apps/desktop"], {
    encoding: "utf8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** A one-line fix hint for a single offending path — rename it, or add it to `ALLOWLIST` above with
 *  a reason, the same paperwork every other named exception in this repo carries.
 *  @complexity O(1). */
function fixHint(offender: string): string {
  const converted = offender.replace(/\.(mjs|cjs|js)$/, ".ts");
  return `  - ${offender} — rename to ${converted}, or add it to ALLOWLIST in this script with a reason.`;
}

/** Where the check writes; production wires `process.stdout`/`process.stderr`. */
interface CheckOutput {
  out: (text: string) => void;
  err: (text: string) => void;
}

/**
 * The whole check, over its two effects: listing candidate paths, and writing the verdict.
 * @param ports.listPaths every path git would commit under `apps/desktop`; production uses
 *   {@link candidatePaths}.
 * @returns the exit code: 0 clean, 1 for any offender or a failure to list.
 * @complexity O(n) in the candidate count.
 */
function runJsBackslideCheck({ listPaths, out, err }: CheckOutput & { listPaths: () => string[] }): number {
  try {
    const offenders = jsBackslideOffenders(listPaths(), ALLOWLIST);
    if (offenders.length > 0) {
      err("check-js-backslide: apps/desktop must stay TypeScript-only — found JavaScript-family file(s):\n");
      for (const offender of offenders) err(`${fixHint(offender)}\n`);
      return 1;
    }
    out("check-js-backslide: OK — apps/desktop is TypeScript-only\n");
    return 0;
  } catch (error) {
    err(sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n");
    return 1;
  }
}

/** Run only when this file IS the process, never when a test imports it. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runJsBackslideCheck({
    listPaths: candidatePaths,
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  });
}

export { ALLOWLIST, candidatePaths, runJsBackslideCheck };
