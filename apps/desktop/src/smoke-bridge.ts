/** Packaged MCP release checks. Command construction and reply validation are independently testable. */
import { spawn } from "node:child_process";
import path from "node:path";
import { buildSitesMcpLauncherScript, buildSitesMcpRegistration } from "./sites-mcp-registration.ts";

export interface BridgeCommand {
  label: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  serverName: string;
  toolName: string;
}

// Match mcp-bridge-launch.smoke.test.ts: no developer credentials or NODE_PATH may reach the child.
const CLI_BASELINE_KEYS = ["PATH", "HOME", "TMPDIR", "SHELL", "LANG", "USER"] as const;

/** Selects only the CLI baseline, then applies the real bridge entry's environment. */
export function buildBridgeEnv(
  { hostEnv, entryEnv = {} }: { hostEnv: NodeJS.ProcessEnv; entryEnv?: Record<string, string> },
): Record<string, string> {
  const baseline: Record<string, string> = {};
  for (const key of CLI_BASELINE_KEYS) {
    if (hostEnv[key] !== undefined) baseline[key] = hostEnv[key];
  }
  return { ...baseline, ...entryEnv };
}

/**
 * Runs INSIDE the shipped binary, whose loader understands app.asar. Import the packaged resolver
 * and entry builder rather than reproducing their environment/credential contract in the smoke.
 */
export function buildJiniEntryScript(
  { resourcesDir, executablePath }: { resourcesDir: string; executablePath: string },
): string {
  return `
(async () => {
  const { createRequire } = require("node:module");
  const { join, dirname } = require("node:path");
  const { pathToFileURL } = require("node:url");
  const resources = ${JSON.stringify(resourcesDir)};
  const tovu = join(resources, "tovu");
  const asar = join(resources, "app.asar");
  const fromTovu = createRequire(join(tovu, "package.json"));
  const { resolveMcpJsonInjection } = await import(pathToFileURL(join(tovu, "dist/src/assistant/mcp-injection.js")).href);
  const { buildMcpJsonServerEntry } = await import(pathToFileURL(fromTovu.resolve("@jini-ai/daemon")).href);
  const injection = resolveMcpJsonInjection("http://127.0.0.1:9", () => "smoke", {
    execPath: ${JSON.stringify(executablePath)}, electronVersion: "smoke", env: {},
  });
  const desktopScript = join(dirname(createRequire(join(asar, "package.json")).resolve("@jini-ai/mcp")), "bin", "serve.js");
  const entries = [injection, { ...injection, args: [desktopScript] }].map(options =>
    buildMcpJsonServerEntry({ runId: "release-smoke", options }, { credential: "smoke" }));
  console.log(JSON.stringify(entries));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
`;
}

/** Rejects incomplete resolver output so a failed packaged bootstrap cannot silently skip a bridge. */
export function parseJiniEntries({ stdout }: { stdout: string }): BridgeCommand[] {
  const entries: unknown = JSON.parse(stdout);
  if (!Array.isArray(entries) || entries.length !== 2) throw new Error("expected two packaged Jini entries");
  return entries.map((entry: unknown, index) => {
    if (!isRecord(entry) || typeof entry.command !== "string" || entry.command.length === 0
      || !Array.isArray(entry.args) || !entry.args.every((arg: unknown) => typeof arg === "string")
      || !isRecord(entry.env) || !Object.values(entry.env).every(value => typeof value === "string")
      || entry.env.JINI_RUN_ID !== "release-smoke" || entry.env.ELECTRON_RUN_AS_NODE !== "1") {
      throw new Error("malformed packaged Jini entry");
    }
    return {
      label: index === 0 ? "site jini-mcp" : "desktop jini-mcp",
      command: entry.command, args: entry.args as string[], env: entry.env as Record<string, string>,
      serverName: "jini-mcp", toolName: "execute_delegated_tool",
    };
  });
}

/** Uses the production launcher on POSIX, and production registration argv on Windows. Pure. */
export function buildSitesBridgeCommand(
  { executablePath, resourcesDir, userDataDir, platform }: {
    executablePath: string; resourcesDir: string; userDataDir: string; platform: NodeJS.Platform;
  },
): { entry: BridgeCommand; launcherPath: string; launcherScript: string | undefined } {
  const bridgePath = path.join(resourcesDir, "app.asar", "bin", "mcp-bridge.ts");
  const launcherPath = path.join(userDataDir, "tovu-desktop-mcp-launcher.sh");
  const windows = platform === "win32";
  const registration = buildSitesMcpRegistration({
    launcherPath: windows ? executablePath : launcherPath, platform, bridgePath, userDataDir,
  });
  // Registration stores a string; consume its quoted tokens just as the stdio adapter does.
  const args = windows
    ? Array.from(registration.args.matchAll(/"([^"]*)"|(\S+)/g), match => match[1] ?? match[2]!)
    : [registration.command];
  return {
    entry: {
      label: "tovu-desktop", command: windows ? registration.command : "/bin/sh", args,
      env: windows ? { ELECTRON_RUN_AS_NODE: "1" } : {}, serverName: "tovu-desktop", toolName: "list_sites",
    },
    launcherPath,
    launcherScript: windows ? undefined : buildSitesMcpLauncherScript({ electronPath: executablePath, bridgePath, userDataDir }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validates one JSON-RPC line; unrelated replies/notifications cannot satisfy the pending request. */
export function parseBridgeReply(
  { line, id }: { line: string; id: number },
): Record<string, unknown> | undefined {
  const reply: unknown = JSON.parse(line);
  if (!isRecord(reply) || reply.jsonrpc !== "2.0") throw new Error("invalid MCP JSON-RPC reply");
  if (reply.id !== id) return undefined;
  if (reply.error !== undefined || !isRecord(reply.result)) throw new Error(`MCP request ${id} failed`);
  return reply.result;
}

/** Checks bridge identity and its static tool roster; never invokes a delegated tool or a model. */
export function assertBridgeReplies(
  { initialize, tools, serverName, toolName }: {
    initialize: Record<string, unknown>; tools: Record<string, unknown>; serverName: string; toolName: string;
  },
): void {
  if (!isRecord(initialize.serverInfo) || initialize.serverInfo.name !== serverName) {
    throw new Error(`initialize did not identify ${serverName}`);
  }
  if (!Array.isArray(tools.tools) || !tools.tools.some(tool => isRecord(tool) && tool.name === toolName)) {
    throw new Error(`tools/list did not include ${toolName}`);
  }
}

/**
 * Temporary local handshake until @jini-ai/daemon publishes probeMcpBridge. A 30 s watchdog covers
 * the entire exchange; stdout is bounded and stderr is retained only for failure diagnostics.
 * Always SIGKILL and await close, including failed initialization and spawn errors.
 */
export async function smokeBridge(
  { entry, hostEnv }: { entry: BridgeCommand; hostEnv: NodeJS.ProcessEnv },
  { spawnBridge = spawn, watchdogMs = 30_000, cwd }: { spawnBridge?: typeof spawn; watchdogMs?: number; cwd?: string } = {},
): Promise<void> {
  const child = spawnBridge(entry.command, entry.args, {
    env: buildBridgeEnv({ hostEnv, entryEnv: entry.env }), stdio: ["pipe", "pipe", "pipe"], ...(cwd ? { cwd } : {}),
  });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  let stderr = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-65_536); });
  try {
    await new Promise<void>((resolve, reject) => {
      let buffer = "";
      let id = 1;
      let initialize: Record<string, unknown> | undefined;
      const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
      timer = setTimeout(() => reject(new Error(`MCP watchdog exceeded ${watchdogMs} ms`)), watchdogMs);
      child.once("error", reject);
      child.stdin.on("error", reject);
      child.once("close", () => reject(new Error("bridge closed before completing MCP handshake")));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        if (buffer.length > 1_000_000) return reject(new Error("MCP stdout exceeded smoke buffer limit"));
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const reply = parseBridgeReply({ line, id });
            if (!reply) continue;
            if (id === 1) {
              initialize = reply;
              id = 2;
              send({ jsonrpc: "2.0", method: "notifications/initialized" });
              send({ jsonrpc: "2.0", id, method: "tools/list", params: {} });
            } else {
              assertBridgeReplies({ initialize: initialize!, tools: reply, serverName: entry.serverName, toolName: entry.toolName });
              resolve();
              return;
            }
          } catch (error) { reject(error); return; }
        }
      });
      send({ jsonrpc: "2.0", id, method: "initialize", params: {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "release-smoke", version: "0" },
      } });
    });
  } catch (error) {
    // No host secrets are inherited; captured diagnostics belong to the disposable smoke run.
    throw new Error(`${entry.label}: ${error instanceof Error ? error.message : String(error)}${stderr ? `\n${stderr}` : ""}`);
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    await closed;
  }
}
