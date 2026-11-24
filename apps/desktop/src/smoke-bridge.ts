/** Packaged MCP release checks. Command construction and reply validation are independently testable. */
import { spawn } from "node:child_process";
import path from "node:path";
import { redactLocalText } from "@jini-ai/diagnostics/local-text";
import { isNonArrayRecord } from "@jini-ai/core/records";
import { sanitizeUntrustedText } from "@jini-ai/core/text";
import { resolveSmokeTargets } from "./smoke-native.ts";

/** --app copies the exact mounted DMG app; --platform-dir reuses the native smoke layout.
 * Directory reads remain at the script boundary.
 * @param input CLI arguments, desktop root and directory-reading port.
 * @param _options Reserved optional settings.
 * @returns The packaged executable and staged native modules.
 * @throws If arguments or the native layout are missing, or the directory read fails.
 */
export function resolveBridgeSmokeTargets(
  { argv, desktopRoot, readDirectory }: { argv: string[]; desktopRoot: string; readDirectory: (directory: string) => string[] },
  _options: Record<string, never> = {},
): ReturnType<typeof resolveSmokeTargets> {
  const appAt = argv.indexOf("--app");
  const platformAt = argv.indexOf("--platform-dir");
  const appArg = appAt === -1 ? undefined : argv[appAt + 1];
  const platformArg = platformAt === -1 ? undefined : argv[platformAt + 1];
  if (appArg) {
    const app = path.resolve(desktopRoot, appArg);
    return {
      executablePath: path.join(app, "Contents", "MacOS", "Tovu"),
      nodeModulesDir: path.join(app, "Contents", "Resources", "tovu", "node_modules"),
    };
  } else if (platformArg) {
    const platformDir = path.resolve(desktopRoot, platformArg);
    return resolveSmokeTargets({ platformDir, entryNames: readDirectory(platformDir) });
  } else {
    throw new Error("smoke-bridge: --platform-dir <dir> or --app <Tovu.app> is required");
  }
}

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
  const injection = resolveMcpJsonInjection({ daemonUrl: "http://127.0.0.1:9", mintRunCredential: () => "smoke" }, { runtime: {
    execPath: ${JSON.stringify(executablePath)}, electronVersion: "smoke", env: {},
  } });
  const desktopScript = join(dirname(createRequire(join(asar, "package.json")).resolve("@jini-ai/mcp")), "bin", "serve.js");
  const entries = [injection, { ...injection, args: [desktopScript] }].map(options =>
    buildMcpJsonServerEntry({ runId: "release-smoke", options }, { credential: "smoke" }));
  const { mkdtempSync, rmSync } = require("node:fs");
  const temporary = mkdtempSync(join(require("node:os").tmpdir(), "desktop-http-smoke-"));
  const { startDesktopMcpHttp } = await import(pathToFileURL(join(asar, "src/desktop-mcp-http.ts")).href);
  const host = await startDesktopMcpHttp({ context: { projectsPath: join(temporary, "projects.json"), revealPath: async () => {} } });
  try {
    const send = async (method, params = {}) => {
      const response = await fetch(host.url, { method: "POST", headers: { Authorization: "Bearer " + host.token,
        "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Desktop tools smoke call returned HTTP " + response.status + ".");
      const reply = await response.json();
      if (reply.error || reply.result?.isError) throw new Error("desktop HTTP protocol failed");
      return reply.result;
    };
    const refused = await fetch(host.url, { method: "POST", body: "malformed", signal: AbortSignal.timeout(5000) });
    await refused.body?.cancel();
    if (refused.status !== 403) throw new Error("desktop HTTP accepted an anonymous request");
    const initialized = await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
    if (initialized.serverInfo?.name !== "tovu-desktop") throw new Error("desktop HTTP identity mismatch");
    const listed = await send("tools/list");
    if (listed.tools?.map(tool => tool.name).join(",") !== "list_sites,add_site_pointer,reveal_site_folder") throw new Error("desktop HTTP roster mismatch");
    const called = await send("tools/call", { name: "list_sites", arguments: {} });
    if (called.structuredContent?.count !== 0) throw new Error("desktop HTTP result mismatch");
  } finally { await host.close({}); rmSync(temporary, { recursive: true, force: true }); }
  console.log(JSON.stringify({ entries, desktopHttp: true }));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
`;
}

/** Rejects incomplete resolver output so a failed packaged bootstrap cannot silently skip a bridge. */
export function parseJiniEntries({ stdout }: { stdout: string }, _options = {}): BridgeCommand[] {
  let entries: unknown;
  try { entries = JSON.parse(stdout); }
  catch { throw new Error(`invalid packaged Jini entries: ${sanitizeUntrustedText({ text: redactLocalText({ text: stdout }) })}`); }
  const resolverOutput = { value: entries };
  if (!isNonArrayRecord(resolverOutput) || resolverOutput.value.desktopHttp !== true) throw new Error("packaged desktop HTTP smoke did not complete");
  entries = resolverOutput.value.entries;
  if (!Array.isArray(entries) || entries.length !== 2) throw new Error("expected two packaged Jini entries");
  return entries.map((entry: unknown, index) => {
    const candidate = { value: entry };
    if (!isNonArrayRecord(candidate)) throw new Error("malformed packaged Jini entry");
    const fields = candidate.value;
    if (typeof fields.command !== "string" || fields.command.length === 0) throw new Error("malformed packaged Jini entry");
    if (!Array.isArray(fields.args) || !fields.args.every((arg: unknown) => typeof arg === "string")) {
      throw new Error("malformed packaged Jini entry");
    }
    const env = parseJiniEntryEnv({ env: fields.env });
    return {
      label: index === 0 ? "site jini-mcp" : "desktop jini-mcp",
      command: fields.command, args: fields.args as string[], env,
      serverName: "jini-mcp", toolName: "execute_delegated_tool",
    };
  });
}

/** Require the packaged resolver's fixed smoke identity and Electron Node mode.
 * @param input The environment reported by the packaged resolver.
 * @param _options Reserved optional settings.
 * @returns The validated environment, retaining its identity and extra string values.
 * @throws If the environment is malformed or has the wrong smoke identity.
 */
export function parseJiniEntryEnv(
  { env }: { env: unknown },
  _options: Record<string, never> = {},
): Record<string, string> {
  const candidate = { value: env };
  if (!isNonArrayRecord(candidate) || !Object.values(candidate.value).every(value => typeof value === "string")
    || candidate.value.JINI_RUN_ID !== "release-smoke" || candidate.value.ELECTRON_RUN_AS_NODE !== "1") {
    throw new Error("malformed packaged Jini entry");
  }
  return env as Record<string, string>;
}

/** Validates one JSON-RPC line; unrelated replies/notifications cannot satisfy the pending request. */
export function parseBridgeReply(
  { line, id }: { line: string; id: number },
): Record<string, unknown> | undefined {
  const parsed: unknown = JSON.parse(line);
  const candidate = { value: parsed };
  if (!isNonArrayRecord(candidate) || candidate.value.jsonrpc !== "2.0") throw new Error("invalid MCP JSON-RPC reply");
  const reply = candidate.value;
  if (reply.id !== id) return undefined;
  const result = { value: reply.result };
  if (reply.error !== undefined || !isNonArrayRecord(result)) throw new Error(`MCP request ${id} failed`);
  return result.value;
}

/** Checks bridge identity and its static tool roster; never invokes a delegated tool or a model. */
export function assertBridgeReplies(
  { initialize, tools, serverName, toolName }: {
    initialize: Record<string, unknown>; tools: Record<string, unknown>; serverName: string; toolName: string;
  },
): void {
  const serverInfo = { value: initialize.serverInfo };
  if (!isNonArrayRecord(serverInfo) || serverInfo.value.name !== serverName) {
    throw new Error(`initialize did not identify ${serverName}`);
  }
  const namesTool = (tool: unknown): boolean => {
    const candidate = { value: tool };
    return isNonArrayRecord(candidate) && candidate.value.name === toolName;
  };
  if (!Array.isArray(tools.tools) || !tools.tools.some(namesTool)) {
    throw new Error(`tools/list did not include ${toolName}`);
  }
}

/** How one stdout line moved the handshake: `true` once the bridge's tool roster has been checked. */
type HandshakeSteps = { start: () => void; acceptLine: (required: { line: string }) => boolean };

/**
 * The two requests of the MCP handshake (initialize, then tools/list) as a line-fed state machine,
 * so the stream plumbing in {@link smokeBridge} holds no protocol logic.
 *
 * @param required.send Writes one JSON-RPC message to the bridge.
 * @returns `start` sends initialize; `acceptLine` takes one stdout line and answers whether the
 *   handshake is complete. It throws for a malformed or failed reply, or a wrong server or roster.
 * @complexity O(line length) per line.
 */
function createHandshakeSteps({ entry, send }: { entry: BridgeCommand; send: (message: object) => void }, _options = {}): HandshakeSteps {
  let id = 1;
  let initialize: Record<string, unknown> | undefined;
  return {
    start: () => send({ jsonrpc: "2.0", id, method: "initialize", params: {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "release-smoke", version: "0" },
    } }),
    acceptLine: ({ line }) => {
      const reply = parseBridgeReply({ line, id });
      if (!reply) return false;
      if (id === 1) {
        initialize = reply;
        id = 2;
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id, method: "tools/list", params: {} });
        return false;
      }
      if (!initialize) throw new Error('MCP bridge tools reply arrived without an initialize reply');
      assertBridgeReplies({ initialize, tools: reply, serverName: entry.serverName, toolName: entry.toolName });
      return true;
    },
  };
}

/** Keeps the bridge's stderr for a failure message, up to 64 KiB; past that it says so instead.
 * @returns a reader for what was kept.
 * @complexity O(bytes kept). */
function retainStderr({ stream }: { stream: NodeJS.ReadableStream }, _options = {}): () => string {
  let stderr = "";
  let overflow = false;
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    if (overflow) return;
    overflow = stderr.length + chunk.length > 65_536;
    stderr = overflow ? "[oversized stderr omitted]" : stderr + chunk;
  });
  return () => stderr;
}

/** The error a failed smoke throws: which entry, what went wrong, and the bridge's own stderr,
 * with local paths and secrets redacted.
 * @complexity O(message length). */
function bridgeSmokeFailure({ entry, error, stderr }: { entry: BridgeCommand; error: unknown; stderr: string }, _options = {}): Error {
  const errorText = error instanceof Error ? error.message : String(error);
  const diagnostics = stderr ? `\n${stderr}` : "";
  const detail = `${entry.label}: ${errorText}${diagnostics}`;
  // The expected tool name is trusted entry metadata; without the exemption a missing-tool failure reads "[redacted]".
  return new Error(sanitizeUntrustedText({ text: redactLocalText({ text: detail }) },
    { maxLength: 2_000, diagnosticToolIds: [entry.toolName] }));
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
  const readStderr = retainStderr({ stream: child.stderr });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const handshake = new Promise<void>((resolve, reject) => {
    let buffer = "";
    const steps = createHandshakeSteps({ entry, send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`) });
    timer = setTimeout(() => reject(new Error(`MCP watchdog exceeded ${watchdogMs} ms`)), watchdogMs);
    child.once("error", reject);
    child.stdin.on("error", reject);
    child.once("close", (code, signal) => reject(new Error(`bridge closed before completing MCP handshake (code ${code ?? "none"}, signal ${signal ?? "none"})`)));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 1_000_000) {
        reject(new Error("MCP stdout exceeded smoke buffer limit"));
        return;
      }
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // the piece after the last newline is an unfinished line
      try {
        if (lines.some((line) => steps.acceptLine({ line }))) resolve();
      } catch (error) { reject(error); }
    });
    steps.start();
  });
  try {
    await handshake;
  } catch (error) {
    throw bridgeSmokeFailure({ entry, error, stderr: readStderr() });
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    await closed;
  }
}
