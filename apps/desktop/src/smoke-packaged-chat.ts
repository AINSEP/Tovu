/** Packaged release gate decisions. Effects enter through ports; no dev runtime is loaded here. */
import path from "node:path";

export const PACKAGED_CHAT_PROMPT = 'Call the site_guide tool with operation "overview" and then reply with exactly DONE.';

export class PackagedChatSmokeError extends Error {}

/** Build the shipped CLI invocation from the shell-owned serve environment.
 * @param input Paths and the environment returned by buildServeEnv.
 * @returns A spawn plan with every asset rooted in the packaged payload.
 */
export function buildPackagedChatServerPlan(
  { executablePath, nodeModulesDir, siteDir, port, serveEnv }: {
    executablePath: string; nodeModulesDir: string; siteDir: string; port: number; serveEnv: NodeJS.ProcessEnv;
  },
): { command: string; args: string[]; env: NodeJS.ProcessEnv; payloadRoot: string } {
  const payloadRoot = path.dirname(nodeModulesDir);
  const env: NodeJS.ProcessEnv = { ...serveEnv, ELECTRON_RUN_AS_NODE: "1", TOVU_REPO_ROOT: payloadRoot,
    TOVU_SITE_DIR: siteDir, TOVU_AGENT_CWD: siteDir, TOVU_HOST: "127.0.0.1",
    TOVU_ADMIN_DIST: path.join(payloadRoot, "apps/admin/dist"),
    TOVU_SITE_CHAT_DIST: path.join(payloadRoot, "apps/site-chat/dist") };
  // An inherited dev loader or proxy would let a broken package borrow the checkout's code/UI.
  for (const key of ["NODE_PATH", "NODE_OPTIONS", "TOVU_ADMIN_DEV_PROXY_URL"]) delete env[key];
  // A scratch site must own its daemon; an inherited origin can attach to an unrelated live site.
  for (const key of ["JINI_AGENT_DAEMON_URL", "JINI_AGENT_DAEMON_PORT", "TOVU_AGENT_DAEMON_TOKEN"]) delete env[key];
  return { command: executablePath, args: [path.join(payloadRoot, "dist/src/cli/main.js"),
    "serve", siteDir, "--port", String(port), "--emit-boot-token"], env, payloadRoot };
}

/** Select the lowest-cost Claude family offered by the actual picker; never silently use Opus.
 * @param input The authenticated /api/agents response.
 * @returns The advertised Haiku alias or concrete Haiku model ID.
 */
export function selectPackagedChatModel({ agents }: { agents: readonly {
  id: string; available?: boolean; authStatus?: string; discoveryPending?: boolean;
  models?: readonly { id: string }[];
}[] }): string {
  const claude = agents.find(agent => agent.id === "claude");
  if (!claude || claude.available === false || claude.authStatus === "missing" || claude.discoveryPending) {
    throw new PackagedChatSmokeError("Claude is not ready; sign in to the local CLI before the release smoke.");
  }
  const models = claude.models ?? [];
  const model = models.find(item => item.id === "haiku") ?? models.find(item => /(?:^|-)haiku(?:-|$)/.test(item.id));
  if (!model) throw new PackagedChatSmokeError("The Claude picker offers no Haiku model.");
  return model.id;
}

/** Interpret one inventory poll, leaving retry timing and cancellation with the gate.
 * @param input The authenticated inventory response.
 * @param _options Reserved optional settings.
 * @returns The selected Haiku model, or undefined while inventory discovery is pending.
 * @throws On an unexpected HTTP status, invalid inventory or failed body cancellation.
 */
export async function readPackagedChatModel(
  { response }: { response: Response },
  _options: Record<string, never> = {},
): Promise<string | undefined> {
  if (response.ok) {
    const inventory = await response.json() as Parameters<typeof selectPackagedChatModel>[0];
    const claude = inventory.agents.find(agent => agent.id === "claude");
    if (claude && !claude.discoveryPending) return selectPackagedChatModel(inventory);
  } else {
    await response.body?.cancel();
    if (response.status !== 503) throw new PackagedChatSmokeError("Packaged agent inventory is unavailable.");
  }
  return undefined;
}

/** The local release gate tolerates absent or inaccessible groups before verifying exit.
 * @param input Group leader PID, signal and process-signaling port.
 * @param _options Reserved optional settings.
 * @returns Nothing; exit verification remains with the caller.
 * @throws The original signaling error unless its code is ESRCH or EPERM.
 */
export function signalPackagedChatGroup(
  { pid, signal, kill }: { pid: number; signal: NodeJS.Signals; kill: typeof process.kill },
  _options: Record<string, never> = {},
): void {
  try { kill(-pid, signal); }
  catch (error) { if (!["ESRCH", "EPERM"].includes(String((error as NodeJS.ErrnoException).code))) throw error; }
}

export interface PackagedChatEvidence {
  run_id: string;
  run_status: string;
  content: string;
  attempt_base_json: string;
  events_json: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function eventsFrom(json: string): Record<string, unknown>[] {
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new PackagedChatSmokeError("chat.db contains invalid event JSON."); }
  if (!Array.isArray(value) || !value.every(record)) throw new PackagedChatSmokeError("chat.db contains invalid events.");
  return value;
}

/** The packaged daemon writes daemon.log as JSONL (`{"seq":…,"message":"[agent-daemon] …"}`), so
 *  an end-anchored match on the raw line never sees the message end; 0.1.18's first gate run failed
 *  on exactly that while the preflight had passed. Plain lines are still accepted as they are. */
function daemonLogMessages(daemonLog: string): string[] {
  return daemonLog.split(/\r?\n/).map(line => {
    try { const entry: unknown = JSON.parse(line); return record(entry) && typeof entry.message === "string" ? entry.message : line; }
    catch { return line; }
  });
}

function rawFrames(events: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return events.flatMap(event => {
    if (event.kind !== "raw") return [];
    const lines = Array.isArray(event.line) ? event.line : [event.line];
    return lines.flatMap(line => {
      if (typeof line !== "string") return [];
      return line.split(/\r?\n/).flatMap(part => {
        try { const frame: unknown = JSON.parse(part); return record(frame) ? [frame] : []; }
        catch { return []; } // Non-JSON CLI diagnostics are also legitimate raw lines.
      });
    });
  });
}

/** Require the overview call's own successful result, preserving the first matching result.
 * @param input Durable events and the previously selected delegated overview call.
 * @param _options Reserved optional settings.
 * @returns Nothing when the matching result explicitly reports success.
 * @throws PackagedChatSmokeError when the call or successful result is absent.
 */
export function assertPackagedSiteGuideResult(
  { events, delegated }: { events: readonly Record<string, unknown>[]; delegated: Record<string, unknown> | undefined },
  _options: Record<string, never> = {},
): void {
  if (!delegated) throw new PackagedChatSmokeError("The run did not call site_guide overview through the jini gateway.");
  const result = events.find(event => event.kind === "tool_result" && event.toolUseId === delegated.id);
  if (!result || result.isError !== false) throw new PackagedChatSmokeError("The delegated site_guide call did not return a successful result.");
}

/** Assert durable evidence for precisely the run we started, without returning transcript data.
 * @param input Joined chat.db row, expected run ID, and daemon log text.
 * @throws PackagedChatSmokeError with credential-free diagnostics on a failed gate.
 */
export function assertPackagedChatEvidence(
  { row, runId, daemonLog }: { row: PackagedChatEvidence | null; runId: string; daemonLog: string },
): void {
  if (!row || row.run_id !== runId) throw new PackagedChatSmokeError("chat.db has no evidence for the smoke run.");
  if (row.run_status !== "succeeded") throw new PackagedChatSmokeError("The packaged chat run did not succeed.");
  // attempt_base_json is the recovery baseline, not this attempt's live projection. A first run
  // starts with []; its new events and final status live on the joined ai_chat_messages row.
  const events = [...eventsFrom(row.attempt_base_json), ...eventsFrom(row.events_json)];
  const frames = rawFrames(events);
  const connected = frames.some(frame => frame.type === "system" && frame.subtype === "init"
    && Array.isArray(frame.mcp_servers) && frame.mcp_servers.some(server =>
      record(server) && server.name === "jini" && server.status === "connected"));
  if (!connected) throw new PackagedChatSmokeError("The init frame did not report jini connected.");
  const tools = events.filter(event => event.kind === "tool_use");
  const delegated = tools.find(event => {
    if (!["mcp__jini__execute_readonly_delegated_tool", "mcp__jini__execute_delegated_tool"].includes(String(event.name))) return false;
    if (!record(event.input) || event.input.toolId !== "site_guide") return false;
    return record(event.input.input) && event.input.input.operation === "overview";
  });
  assertPackagedSiteGuideResult({ events, delegated });
  if (row.content.trim() !== "DONE") throw new PackagedChatSmokeError("The packaged chat reply was not exactly DONE.");
  if (!daemonLogMessages(daemonLog).some(message => /^.*\[agent-daemon\] jini bridge preflight ok \(\d+ms\)\s*$/.test(message))) {
    throw new PackagedChatSmokeError("daemon.log has no successful jini bridge preflight.");
  }
}

export interface PackagedChatSmokePorts {
  acquireLock(): Promise<() => Promise<void>>;
  createSite(): Promise<string>;
  /** The launch adapter owns partial-start cleanup before rejecting. */
  start(siteDir: string): Promise<{ stop(): Promise<void> }>;
  chat(): Promise<string>;
  evidence(siteDir: string, runId: string): Promise<{ row: PackagedChatEvidence | null; daemonLog: string }>;
  removeSite(siteDir: string): Promise<void>;
}

/** Coordinate one local gate; teardown attempts every owned resource, including on partial startup.
 * @param input Effect ports, allowing failure/teardown tests without real servers or module mocks.
 * @returns Resolves only after evidence and all teardown have succeeded.
 */
export async function runPackagedChatSmoke({ ports }: { ports: PackagedChatSmokePorts }): Promise<void> {
  const release = await ports.acquireLock();
  let siteDir: string | undefined;
  let server: { stop(): Promise<void> } | undefined;
  const failures: unknown[] = [];
  try {
    siteDir = await ports.createSite();
    server = await ports.start(siteDir);
    const runId = await ports.chat();
    assertPackagedChatEvidence({ ...await ports.evidence(siteDir, runId), runId });
  } catch (error) { failures.push(error); }
  // Cleanup failures must not skip the remaining resources, or turn a failed release gate green.
  if (server) { try { await server.stop(); } catch (error) { failures.push(error); } }
  if (siteDir) { try { await ports.removeSite(siteDir); } catch (error) { failures.push(error); } }
  try { await release(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, "Packaged chat smoke or teardown failed.");
}
