#!/usr/bin/env node
/**
 * @file CLI for the native-module smoke check (release plan, S3): runs the SHIPPED, signed binary
 * on THIS CPU, as `ELECTRON_RUN_AS_NODE=1`, and proves `better-sqlite3`, `sharp`, and `argon2` all
 * load and round-trip out of the staged `tovu/node_modules` — the same manual check
 * `build/entitlements.mac.plist`'s 2026-09-11 header comment records once by hand, now run on every
 * release build. `verify-package.ts` (S2) already proves the shipped BYTES are correct; this proves
 * the shipped NATIVE ADDONS actually load and run, which byte comparison alone cannot show.
 *
 * All path-resolution and result-parsing logic lives in `../src/smoke-native.ts`, so it is
 * unit-tested under the normal `npm test` glob without ever spawning a real process (see that
 * file's tests). This file only locates the build output, does the actual spawn, and turns the
 * result into an exit code.
 *
 * Usage: node scripts/smoke-native.ts --platform-dir <dir-containing-mac-or-win-unpacked-output>
 * Exit codes: 0 = better-sqlite3, sharp, and argon2 all round-tripped inside the packaged binary.
 *             1 = any check failed, the executable/node_modules could not be located or spawned,
 *                 or the child's output could not be parsed.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { buildSmokeScript, parseSmokeOutput, resolveSmokeTargets } from "../src/smoke-native.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function main(): void {
  const argv = process.argv.slice(2);
  const flagAt = argv.indexOf("--platform-dir");
  const platformDirArg = flagAt !== -1 ? argv[flagAt + 1] : undefined;
  if (!platformDirArg) {
    process.stderr.write("smoke-native: --platform-dir <dir> is required\n");
    process.exit(1);
    return;
  }
  const platformDir = path.resolve(DESKTOP_ROOT, platformDirArg);

  let entryNames: string[];
  try {
    entryNames = readdirSync(platformDir);
  } catch (error) {
    process.stderr.write(`smoke-native: cannot read ${platformDir}: ${(error as Error).message}\n`);
    process.exit(1);
    return;
  }

  let targets;
  try {
    targets = resolveSmokeTargets(platformDir, entryNames);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
    return;
  }

  if (!existsSync(targets.executablePath)) {
    process.stderr.write(`smoke-native: resolved executable does not exist: ${targets.executablePath}\n`);
    process.exit(1);
    return;
  }
  if (!existsSync(targets.nodeModulesDir)) {
    process.stderr.write(`smoke-native: resolved node_modules dir does not exist: ${targets.nodeModulesDir}\n`);
    process.exit(1);
    return;
  }

  process.stdout.write(`smoke-native: running against ${targets.executablePath}\n`);
  const script = buildSmokeScript(targets.nodeModulesDir);
  const spawned = spawnSync(targets.executablePath, ["-e", script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
  });

  if (spawned.error) {
    process.stderr.write(`smoke-native: failed to spawn ${targets.executablePath}: ${spawned.error.message}\n`);
    process.exit(1);
    return;
  }
  if (spawned.stdout) process.stdout.write(spawned.stdout);
  if (spawned.stderr) process.stderr.write(spawned.stderr);

  let result;
  try {
    result = parseSmokeOutput(spawned.stdout ?? "");
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
    return;
  }

  if (!result.ok) {
    process.stderr.write("smoke-native: one or more native modules failed inside the packaged binary\n");
    process.exit(1);
    return;
  }
  process.stdout.write("smoke-native: OK — better-sqlite3, sharp, and argon2 all round-tripped\n");
}

main();
