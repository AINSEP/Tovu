#!/usr/bin/env node
/**
 * @file CLI for the native-module smoke check (release plan, S3): runs the SHIPPED, signed binary
 * on THIS CPU, as `ELECTRON_RUN_AS_NODE=1`, and proves `better-sqlite3`, `sharp`, and `argon2` all
 * load and round-trip out of the staged `tovu/node_modules` — the same manual check
 * `build/entitlements.mac.plist`'s 2026-09-11 header comment records once by hand, now run on every
 * release build. `verify-package.ts` (S2) already proves the shipped BYTES are correct; this proves
 * the shipped NATIVE ADDONS actually load and run, which byte comparison alone cannot show.
 * It then proves every static import of the shell and server entries resolves inside the shipped
 * tree (`buildEntryLoadScript`), which the byte check cannot show either.
 *
 * All path-resolution and result-parsing logic lives in `../src/smoke-native.ts`, so it is
 * unit-tested under the normal `npm test` glob without ever spawning a real process (see that
 * file's tests). This file only locates the build output, does the actual spawn, and turns the
 * result into an exit code.
 *
 * Usage: node scripts/smoke-native.ts --platform-dir <dir-containing-mac-or-win-unpacked-output>
 * Exit codes: 0 = better-sqlite3, sharp, and argon2 all round-tripped inside the packaged binary,
 *                 and every static entry import resolved.
 *             1 = any check failed, the executable/node_modules could not be located or spawned,
 *                 or the child's output could not be parsed.
 */
import { existsSync, readdirSync } from "node:fs";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { buildEntryLoadScript, buildSmokeScript, parseEntryLoadOutput, parseSmokeOutput, resolveSmokeTargets } from "../src/smoke-native.ts";
import { withIsolatedSmokeTargets } from "../src/packaged-gate-isolation.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type SmokeTargets = ReturnType<typeof resolveSmokeTargets>;

/** Throw so the isolated app is cleaned up before main reports exit 1. */
function fail(message: string): never {
  throw new Error(message);
}

/** Resolves `--platform-dir` against the desktop root, or exits when it is missing. */
function platformDirFromArgv(argv: readonly string[]): string {
  const flagAt = argv.indexOf("--platform-dir");
  const platformDirArg = flagAt !== -1 ? argv[flagAt + 1] : undefined;
  if (!platformDirArg) fail("smoke-native: --platform-dir <dir> is required");
  return path.resolve(DESKTOP_ROOT, platformDirArg);
}

/** Locates the packaged executable and its staged `node_modules` under `platformDir`, exiting with
 *  a specific reason when either cannot be found. */
function locateTargets(platformDir: string): SmokeTargets {
  let entryNames: string[];
  try {
    entryNames = readdirSync(platformDir);
  } catch (error) {
    fail(`smoke-native: cannot read ${platformDir}: ${(error as Error).message}`);
  }

  let targets: SmokeTargets;
  try {
    targets = resolveSmokeTargets(platformDir, entryNames);
  } catch (error) {
    fail((error as Error).message);
  }

  if (!existsSync(targets.executablePath)) {
    fail(`smoke-native: resolved executable does not exist: ${targets.executablePath}`);
  }
  if (!existsSync(targets.nodeModulesDir)) {
    fail(`smoke-native: resolved node_modules dir does not exist: ${targets.nodeModulesDir}`);
  }
  return targets;
}

/** Spawns the packaged binary as Node, prints safe excerpts and returns raw stdout for parsing.
 * Rejects spawn failures, signals and nonzero exits; the final script sink redacts failure details. */
function spawnSmoke(targets: SmokeTargets): string {
  process.stdout.write(sanitizeUntrustedText({ text: redactLocalText({ text: `smoke-native: running against ${targets.executablePath}` }) }, { maxLength: 2_000 }) + "\n");
  const script = buildSmokeScript(targets.nodeModulesDir);
  const spawned = spawnSync(targets.executablePath, ["-e", script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: "" },
    cwd: path.dirname(targets.executablePath),
    encoding: "utf8",
  });

  if (spawned.error) {
    fail(`smoke-native: failed to spawn ${targets.executablePath}: ${spawned.error.message}`);
  }
  if (spawned.stdout) process.stdout.write(sanitizeUntrustedText({ text: redactLocalText({ text: spawned.stdout }) }, { maxLength: 2_000 }) + "\n");
  if (spawned.stderr) process.stderr.write(sanitizeUntrustedText({ text: redactLocalText({ text: spawned.stderr }) }, { maxLength: 2_000 }) + "\n");
  if (spawned.status !== 0) fail(`smoke-native: child failed (code ${spawned.status ?? "none"}, signal ${spawned.signal ?? "none"})\n${spawned.stdout ?? ""}`);
  return spawned.stdout ?? "";
}

function runGate(targets: SmokeTargets): void {
  const stdout = spawnSmoke(targets);

  let result: ReturnType<typeof parseSmokeOutput>;
  try {
    result = parseSmokeOutput(stdout);
  } catch (error) {
    fail((error as Error).message);
  }

  if (!result.ok) {
    fail("smoke-native: one or more native modules failed inside the packaged binary");
  }
  process.stdout.write("smoke-native: OK — better-sqlite3, sharp, and argon2 all round-tripped\n");
  checkEntryImports(targets);
}

/** Runs {@link buildEntryLoadScript} in the packaged binary: every static import of the shell and
 *  server entries must resolve inside the shipped tree (0.1.15 crashed at launch on one that did not). */
function checkEntryImports(targets: SmokeTargets): void {
  const resourcesDir = path.dirname(path.dirname(targets.nodeModulesDir));
  const spawned = spawnSync(targets.executablePath, ["-e", buildEntryLoadScript(resourcesDir)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_PATH: "" },
    cwd: path.dirname(targets.executablePath),
    encoding: "utf8",
  });
  if (spawned.error) fail(`smoke-native: failed to spawn ${targets.executablePath}: ${spawned.error.message}`);
  if (spawned.stderr) process.stderr.write(sanitizeUntrustedText({ text: redactLocalText({ text: spawned.stderr }) }, { maxLength: 2_000 }) + "\n");
  if (spawned.status !== 0) fail(`smoke-native: entry-load child failed (code ${spawned.status ?? "none"}, signal ${spawned.signal ?? "none"})\n${spawned.stdout ?? ""}`);
  let result: ReturnType<typeof parseEntryLoadOutput>;
  try {
    result = parseEntryLoadOutput(spawned.stdout ?? "");
  } catch (error) {
    fail((error as Error).message);
  }
  if (!result.ok) fail(`smoke-native: packaged entries import modules the app does not ship:\n  ${result.unresolved.join("\n  ")}`);
  process.stdout.write("smoke-native: OK — every static import of the shell and server entries resolves\n");
}

async function main(): Promise<void> {
  await withIsolatedSmokeTargets({
    targets: locateTargets(platformDirFromArgv(process.argv.slice(2))), run: runGate,
  });
}

main().catch(error => {
  process.stderr.write(sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n");
  process.exitCode = 1;
});
