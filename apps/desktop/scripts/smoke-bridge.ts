#!/usr/bin/env node
/** Release gate: initialize + tools/list for all three shipped MCP bridges, without a daemon/model. */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { redactLocalText } from "../../website/src/platform/server-logs/redact-local-text.ts";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import { resolveSmokeTargets } from "../src/smoke-native.ts";
import { withIsolatedSmokeTargets } from "../src/packaged-gate-isolation.ts";
import { buildBridgeEnv, buildJiniEntryScript, buildSitesBridgeCommand, parseJiniEntries, resolveBridgeSmokeTargets, smokeBridge } from "../src/smoke-bridge.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every effect the gate has beyond its own temp directory — production wires the real ones. */
interface SmokeBridgeGatePorts {
  exists: (target: string) => boolean;
  readDirectory: (directory: string) => string[];
  /** Copies the packaged app into an isolated temp dir and runs the gate there. */
  isolate: typeof withIsolatedSmokeTargets;
  /** Runs the packaged executable once to resolve the shipped Jini bridge entries. */
  spawnResolver: (command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding) => SpawnSyncReturns<string>;
  smoke: typeof smokeBridge;
  out: (text: string) => void;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}

/**
 * The release gate: every shipped MCP bridge answers initialize + tools/list from an isolated copy
 * of the packaged app.
 * @throws {Error} when the package is missing, the resolver fails, or any bridge fails its smoke.
 * @complexity O(n) in shipped bridges.
 */
async function runSmokeBridgeGate({ argv }: { argv: string[] }, ports: SmokeBridgeGatePorts): Promise<void> {
  const targets = resolveBridgeSmokeTargets({ argv, desktopRoot: DESKTOP_ROOT, readDirectory: ports.readDirectory });
  if (!ports.exists(targets.executablePath) || !ports.exists(targets.nodeModulesDir)) {
    throw new Error("smoke-bridge: packaged executable or node_modules is missing");
  }
  await ports.isolate({ targets, run: (isolated, directory) => runGate(isolated, directory, ports) });
}

async function runGate(targets: ReturnType<typeof resolveSmokeTargets>, directory: string, ports: SmokeBridgeGatePorts): Promise<void> {
  const resourcesDir = path.dirname(path.dirname(targets.nodeModulesDir));
  const resolved = ports.spawnResolver(targets.executablePath, ["-e", buildJiniEntryScript({ resourcesDir, executablePath: targets.executablePath })], {
    env: buildBridgeEnv({ hostEnv: ports.env, entryEnv: { ELECTRON_RUN_AS_NODE: "1" } }),
    cwd: directory,
    encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL",
  });
  if (resolved.error || resolved.status !== 0) {
    throw new Error(`smoke-bridge: packaged resolver failed: ${resolved.error?.message ?? resolved.status} (signal ${resolved.signal ?? "none"})\n${resolved.stderr ?? ""}`);
  }
  const entries = parseJiniEntries({ stdout: resolved.stdout });
  const userDataDir = mkdtempSync(path.join(directory, "tovu-release-smoke-"));
  try {
    const sites = buildSitesBridgeCommand({ executablePath: targets.executablePath, resourcesDir, userDataDir, platform: ports.platform });
    if (sites.launcherScript !== undefined) writeFileSync(sites.launcherPath, sites.launcherScript, { mode: 0o700 });
    for (const entry of [...entries, sites.entry]) {
      await ports.smoke({ entry, hostEnv: ports.env }, { cwd: directory });
      ports.out(`smoke-bridge: OK — ${entry.label} initialize + tools/list\n`);
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

/** The one stderr line a failed gate prints: redacted and bounded, an Error's message or the value
 *  itself. @complexity O(n) in the message length. */
function formatGateFailure(error: unknown): string {
  return sanitizeUntrustedText({ text: redactLocalText({ text: error instanceof Error ? error.message : String(error) }) }, { maxLength: 2_000 }) + "\n";
}

/** Run only when this file IS the process, never when a test imports it. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSmokeBridgeGate({ argv: process.argv.slice(2) }, {
    exists: existsSync, readDirectory: readdirSync, isolate: withIsolatedSmokeTargets, spawnResolver: spawnSync,
    smoke: smokeBridge, out: process.stdout.write.bind(process.stdout), env: process.env, platform: process.platform,
  }).catch((error: unknown) => {
    process.stderr.write(formatGateFailure(error));
    process.exitCode = 1;
  });
}

export { formatGateFailure, runSmokeBridgeGate };
export type { SmokeBridgeGatePorts };
