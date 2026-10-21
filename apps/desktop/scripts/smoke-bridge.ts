#!/usr/bin/env node
/** Release gate: initialize + tools/list for all three shipped MCP bridges, without a daemon/model. */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveSmokeTargets } from "../src/smoke-native.ts";
import { withIsolatedSmokeTargets } from "../src/packaged-gate-isolation.ts";
import { buildBridgeEnv, buildJiniEntryScript, buildSitesBridgeCommand, parseJiniEntries, resolveBridgeSmokeTargets, smokeBridge } from "../src/smoke-bridge.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const targets = resolveBridgeSmokeTargets({ argv: process.argv.slice(2), desktopRoot: DESKTOP_ROOT, readDirectory: readdirSync });
  if (!existsSync(targets.executablePath) || !existsSync(targets.nodeModulesDir)) {
    throw new Error("smoke-bridge: packaged executable or node_modules is missing");
  }
  await withIsolatedSmokeTargets({ targets, run: runGate });
}

async function runGate(targets: ReturnType<typeof resolveSmokeTargets>, directory: string): Promise<void> {
  const resourcesDir = path.dirname(path.dirname(targets.nodeModulesDir));
  const resolved = spawnSync(targets.executablePath, ["-e", buildJiniEntryScript({ resourcesDir, executablePath: targets.executablePath })], {
    env: buildBridgeEnv({ hostEnv: process.env, entryEnv: { ELECTRON_RUN_AS_NODE: "1" } }),
    cwd: directory,
    encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL",
  });
  if (resolved.error || resolved.status !== 0) {
    throw new Error(`smoke-bridge: packaged resolver failed: ${resolved.error?.message ?? resolved.status} (signal ${resolved.signal ?? "none"})\n${resolved.stderr ?? ""}`);
  }
  const entries = parseJiniEntries({ stdout: resolved.stdout });
  const userDataDir = mkdtempSync(path.join(directory, "tovu-release-smoke-"));
  try {
    const sites = buildSitesBridgeCommand({ executablePath: targets.executablePath, resourcesDir, userDataDir, platform: process.platform });
    if (sites.launcherScript !== undefined) writeFileSync(sites.launcherPath, sites.launcherScript, { mode: 0o700 });
    for (const entry of [...entries, sites.entry]) {
      await smokeBridge({ entry, hostEnv: process.env }, { cwd: directory });
      process.stdout.write(`smoke-bridge: OK — ${entry.label} initialize + tools/list\n`);
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n");
  process.exitCode = 1;
});
