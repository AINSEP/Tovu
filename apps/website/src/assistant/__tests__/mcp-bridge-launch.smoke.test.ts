/**
 * Launches the jini MCP bridge the way a desktop run really does and requires it to answer MCP
 * `initialize` within 5 s. This is the check that would have caught the 2026-10-01 incident, where
 * the packaged app's bridge never answered and every run had zero Tovu tools.
 *
 * The real chain: `resolveMcpJsonInjection` (this host) → Jini's `buildMcpJsonServerEntry` (the
 * `.mcp.json` entry) → Claude Code spawns `command args` with ITS env plus the entry's `env`. Claude
 * Code's env is Jini's deny-by-default baseline, so an `ELECTRON_RUN_AS_NODE` this process has never
 * reaches the bridge unless the entry carries it. The bridge env below is built the same way.
 *
 * The packaged-app stand-in is a simulation, said plainly: a packaged Electron app ignores a script
 * argument and boots its own GUI unless `ELECTRON_RUN_AS_NODE` is set. The dev `electron` binary in
 * `apps/desktop/node_modules` cannot show that, because with no bundled app it runs the script
 * argument as its main process, which happens to answer MCP. So the stand-in reproduces the packaged
 * dispatch (flag set: run as Node; flag unset: Chromium-style startup noise, never reads stdin), and
 * a second test runs the real Electron binary with the entry's env to confirm the flag-set half.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildMcpJsonServerEntry } from "@jini-ai/daemon";

import { resolveMcpJsonInjection } from "../mcp-injection.js";

const INIT_DEADLINE_MS = 5_000;
// Jini's BASELINE_AGENT_ENV_KEYS subset that exists on this machine: what Claude Code itself runs with.
const CLI_BASELINE_KEYS = ["PATH", "HOME", "TMPDIR", "SHELL", "LANG", "USER"] as const;

function cliBaselineEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CLI_BASELINE_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** Spawns the bridge as Claude Code would and resolves with its first stdout line, or null after the deadline. */
async function initializeReply(command: string, args: readonly string[], entryEnv: Record<string, string>): Promise<string | null> {
  const child = spawn(command, [...args], { env: { ...cliBaselineEnv(), ...entryEnv }, stdio: ["pipe", "pipe", "pipe"] });
  try {
    return await new Promise<string | null>((resolve) => {
      let out = "";
      const timer = setTimeout(() => resolve(null), INIT_DEADLINE_MS);
      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
        const newline = out.indexOf("\n");
        if (newline !== -1) {
          clearTimeout(timer);
          resolve(out.slice(0, newline));
        }
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bridge-smoke", version: "0" } },
        })}\n`,
      );
    });
  } finally {
    child.kill("SIGKILL");
  }
}

function assertJiniInitializeReply(line: string | null): void {
  assert.notEqual(line, null, `the bridge did not answer initialize within ${INIT_DEADLINE_MS} ms`);
  const reply = JSON.parse(line as string) as { id?: unknown; result?: { serverInfo?: { name?: unknown } } };
  assert.equal(reply.id, 1);
  assert.equal(reply.result?.serverInfo?.name, "jini-mcp");
}

/** Writes the packaged-app stand-in described in the module doc into `dir`. */
function writePackagedAppStandIn(dir: string): string {
  const path = join(dir, "Tovu");
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      'if [ -n "$ELECTRON_RUN_AS_NODE" ]; then',
      `  exec ${JSON.stringify(process.execPath)} "$@"`,
      "fi",
      'echo "[0:0/000000.000000:ERROR:net/cert/internal/trust_store_mac.cc:807] Error parsing certificate" >&2',
      "exec sleep 30",
      "",
    ].join("\n"),
  );
  chmodSync(path, 0o755);
  return path;
}

test("a packaged desktop app's bridge answers initialize within 5 s", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-bridge-smoke-"));
  try {
    const injection = resolveMcpJsonInjection("http://127.0.0.1:9", () => "smoke-token", {
      execPath: writePackagedAppStandIn(dir),
      electronVersion: "43.6.0",
      env: { ELECTRON_RUN_AS_NODE: "1" },
    });
    const entry = buildMcpJsonServerEntry({ runId: "bridge-smoke", options: injection }, { credential: "smoke-token" });

    assertJiniInitializeReply(await initializeReply(entry.command, entry.args, entry.env));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the real Electron binary, given the entry's env, runs the bridge as Node and answers within 5 s", async (t) => {
  let electronBinary: string;
  try {
    electronBinary = createRequire(new URL("../../../../desktop/package.json", import.meta.url))("electron") as string;
  } catch {
    t.skip("no electron package installed under apps/desktop");
    return;
  }
  const injection = resolveMcpJsonInjection("http://127.0.0.1:9", () => "smoke-token", { execPath: electronBinary, electronVersion: "43.6.0", env: {} });
  const entry = buildMcpJsonServerEntry({ runId: "bridge-smoke", options: injection }, { credential: "smoke-token" });

  assertJiniInitializeReply(await initializeReply(entry.command, entry.args, entry.env));
});
