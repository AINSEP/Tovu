#!/usr/bin/env node
/** Local, model-backed release gate. Run after packaging/notarization and before creating a draft.
 * Uses only the shipped server/native SQLite module; requires a logged-in Claude CLI on this Mac.
 * Never mirrors child output, response bodies, cookies, tokens, or transcript evidence.
 *
 * Every adapter (lock, scratch home, process-group teardown, HTTP session, packaged-SQLite evidence
 * read) lives in `../src/smoke-packaged-chat-gate.ts` and every decision in
 * `../src/smoke-packaged-chat.ts`, both tested with fakes; this file only binds the real modules.
 *
 * Usage: npm run smoke:packaged-chat -- --platform-dir release/mac-arm64
 * Exit codes: 0 = PASS with teardown verified; 1 = the gate or its teardown failed (no draft may be created).
 */
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { collectProcessTreePids, listProcessSnapshots, stopProcesses } from "@jini-ai/platform/process";
import { resolveSmokeTargets } from "../src/smoke-native.ts";
import { withIsolatedSmokeTargets } from "../src/packaged-gate-isolation.ts";
import { allocatePort, buildServeEnv, startTovuServer } from "../src/tovu-server.ts";
import { initSiteDir } from "../src/site-dir-store.ts";
import { smokePackagedChatCli, withInterruptSignal } from "../src/smoke-packaged-chat-gate.ts";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");

process.exitCode = await withInterruptSignal({ events: process }, signal => smokePackagedChatCli({
  desktopRoot, scratchRoot: path.join(repoRoot, "ADS-memory/.local-artifacts"),
  argv: process.argv.slice(2), platform: process.platform, pid: process.pid, env: process.env, signal,
  fs: { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile }, userInfo,
  spawn, spawnSync, kill: process.kill, fetch, delay, setTimeout, clearTimeout, randomUUID,
  processes: { collectProcessTreePids, listProcessSnapshots, stopProcesses },
  allocatePort, buildServeEnv, startTovuServer, initSiteDir, resolveSmokeTargets, withIsolatedSmokeTargets,
  stdout: process.stdout, stderr: process.stderr,
}));
