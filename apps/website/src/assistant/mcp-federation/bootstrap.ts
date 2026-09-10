import type { ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { connectMcpHttpSession, createFetchMcpHttpExchange } from "./adapter.http.js";
import { connectMcpStdioSession, spawnMcpStdioChannel } from "./adapter.stdio.js";
import type { ResolvedFederatedConnection } from "./config.js";
import { isHttpLaunchSpec, type McpSessionPort, type McpStdioLaunchSpec } from "./ports.js";
import { listFederatedMcpPresets } from "./presets.js";
import { federateSession, type FederationDeps } from "./registrations.js";
// `registrations.ts` imports this type from `trust.ts` for its own use but does not re-export it,
// so it has to come from the module that declares it.
import type { FederatedAdmissionReport } from "./trust.js";

/**
 * @file The composition root for outbound MCP federation: the one function
 * `agent-daemon-server.ts` calls, and the only place in this subtree that performs I/O it was not
 * handed.
 *
 * Split out of `agent-daemon-server.ts` for the reason `tool-catalog-query.ts` and `daemon-auth.ts`
 * were: that file is a top-level side-effecting script which opens a real port and a real DB
 * connection on import, so nothing in it can be imported by a test. Everything here can be.
 *
 * FAIL-OPEN, and deliberately the opposite of `daemon-auth.ts`'s fail-closed gate. The two are
 * answering different questions. `requireAgentDaemonToken` guards ACCESS TO Tovu, where failing
 * open would admit unauthenticated callers, so an unconfigured gate must refuse to serve. This
 * guards an OPTIONAL OUTBOUND CONVENIENCE, where failing closed would mean a third party's server
 * being slow, broken, or absent takes Tovu's own assistant down with it. A vendor Tovu does not
 * control must never be on the critical path of Tovu booting. So every failure here — unreachable
 * server, timed-out handshake, malformed tool list, invalid config — is logged and stepped over,
 * and the daemon continues with its native catalog exactly as it did before this capability
 * existed.
 *
 * The one thing that is NOT stepped over is a native id collision (`trust.ts` R1): that throws out
 * of `federateSession` and is caught here like any other failure, so the connection is dropped
 * whole rather than partially registered. Dropping the connection is the safe direction — the
 * failure mode it prevents is a remote shadowing a Tovu tool, and "no federated tools" is always an
 * acceptable outcome.
 *
 * VENDOR-BLIND. Nothing in this file names a vendor: which servers exist is whatever registered
 * itself with `presets.ts`, populated by first-party plugin modules such as
 * `src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts`. Before 2026-07-30 this file imported
 * Supabase's resolver directly, which meant adding a second vendor was an edit to core federation.
 * See `presets.ts` for the seam's rationale.
 */

/** Where the admission report goes. Injected so tests assert on it instead of scraping stdout, and
 * so a future structured logger is a parameter change rather than an edit. */
export interface FederationLogger {
  info(message: string): void;
  warn(message: string): void;
}

const consoleLogger: FederationLogger = {
  info: (message) => console.log(`[agent-daemon] ${message}`),
  warn: (message) => console.warn(`[agent-daemon] ${message}`),
};

export interface AttachFederatedToolsResult {
  /** Ids actually registered. Empty when federation is off or every attempt failed. */
  readonly registeredToolIds: readonly string[];
  /** Live sessions, for the caller to close at shutdown. */
  readonly sessions: readonly McpSessionPort[];
  /**
   * One entry per connection that reached admission — i.e. every connection whose session
   * connected and listed tools, whether or not any tool was ultimately registered. A connection
   * that failed before `federateSession` ran (a bad spawn, a timed-out handshake, a collision) has
   * no admission decision to report and contributes no entry here — see
   * {@link attachOneFederatedConnection}'s catch branch.
   *
   * This is the same accounting `logFederatedAdmissionReport` already turns into stderr lines and
   * then discards. Kept here so a caller (today, `agent-daemon-server.ts`, over `GET
   * /api/federation/admissions`) can serve it to an operator instead of it only ever reaching
   * whoever happens to be tailing the daemon's terminal at boot. See the write-tools implementation
   * outline, C-009.
   */
  readonly reports: readonly {
    readonly connectionId: string;
    readonly report: FederatedAdmissionReport;
    /**
     * Whether this connection came from `presets.ts`'s registry rather than the operator-editable
     * roster (`extraConnections` below). Threaded through so a consumer — today, the admin admissions
     * banner (`external-mcp-admissions-rules.ts`) — can tell "no roster card because this is a preset,
     * by design" apart from "no roster card because the operator just deleted it". Both looked
     * identical before this field existed (`connectionId` absent from the roster either way), which
     * is exactly why a genuinely-deleted-but-still-live roster connection was silently reported as
     * agreeing instead of as drift (2026-09-07, the follow-on ADM-001 left open).
     */
    readonly isPreset: boolean;
  }[];
}

/**
 * Connects every configured federated MCP server, registers whatever clears the trust tier into
 * `registry`, and returns what happened.
 *
 * Must be awaited BEFORE `buildToolCatalogQuery(registry)` runs: that function snapshots
 * `registry.list()` into an FTS index once, so a tool registered afterwards would be executable but
 * invisible to `search_tools`/`describe_tool`.
 *
 * @param params.registry - The daemon's registry, already populated with the native catalog.
 * @param params.deps - `authorize` + `workspaceId`, the slice federated handlers gate against.
 * @param params.connections - Defaults to whatever the presets registered with `presets.ts` resolve
 * from the environment.
 * @param params.connect - Session factory, injected so tests substitute a double for the real
 * `spawn` + handshake.
 * @returns The registered ids, the open sessions, and one admission report per connection that
 *   reached admission. Never rejects.
 * @complexity O(c · t) in connections and their advertised tools.
 * @overallScore 100
 */
export interface AttachFederatedMcpToolsParams {
  registry: ToolRegistry;
  deps: FederationDeps;
  connections?: readonly ResolvedFederatedConnection[];
  /**
   * Connections from a config source that is not the preset registry — today, the operator-editable
   * roster in `assistant/external-mcp-store.ts`.
   *
   * A second parameter rather than a second preset, because `FederatedMcpPresetResolver` cannot
   * express this source: it is synchronous (a DB read plus an unseal are not) and returns at most
   * one connection (a roster returns N). Appended AFTER the presets so a preset keeps first claim on
   * a contested tool id under R1, which preserves the existing behaviour of every already-configured
   * deployment — an operator adding a row cannot displace a vendor preset that was already working.
   */
  extraConnections?: readonly ResolvedFederatedConnection[];
  connect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  logger?: FederationLogger;
  env?: NodeJS.ProcessEnv;
}

/** One connection paired with where it came from — the signal `attachFederatedMcpTools`'s `reports`
 *  now carries as `isPreset`, computed here rather than downstream because this is the one place
 *  that still has the two lists (presets, roster) separate before they are merged into a single
 *  loop. */
interface OriginTaggedConnection {
  readonly connection: ResolvedFederatedConnection;
  readonly isPreset: boolean;
}

/** Resolves the defaulted inputs `attachFederatedMcpTools` needs — `logger`, `connect`, and the
 *  merged connection list (presets or an injected override, plus any extra roster connections),
 *  each tagged with its origin. Split out purely to keep that function under the shop complexity
 *  ceiling.
 *
 *  `params.connections` (an injected override, used throughout this file's own tests) stands in for
 *  the preset list, not the roster — it replaces `resolveRegisteredPresets`'s result, and
 *  `extraConnections` is documented on {@link AttachFederatedMcpToolsParams} as specifically the
 *  operator-editable roster. So the origin tag is exactly which of the two arrays a connection came
 *  from, unchanged from before this field existed. */
function resolveFederationAttachInputs(params: AttachFederatedMcpToolsParams): {
  logger: FederationLogger;
  connect: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  connections: readonly OriginTaggedConnection[];
} {
  const logger = params.logger ?? consoleLogger;
  const connect = params.connect ?? defaultConnect;
  const presetConnections = params.connections ?? resolveRegisteredPresets(params.env ?? process.env, logger);
  const connections = [
    ...presetConnections.map((connection): OriginTaggedConnection => ({ connection, isPreset: true })),
    ...(params.extraConnections ?? []).map((connection): OriginTaggedConnection => ({ connection, isPreset: false })),
  ];
  return { logger, connect, connections };
}

export async function attachFederatedMcpTools(params: AttachFederatedMcpToolsParams): Promise<AttachFederatedToolsResult> {
  const { logger, connect, connections } = resolveFederationAttachInputs(params);

  if (connections.length === 0) return { registeredToolIds: [], sessions: [], reports: [] };

  const registeredToolIds: string[] = [];
  const sessions: McpSessionPort[] = [];
  const reports: { connectionId: string; report: FederatedAdmissionReport; isPreset: boolean }[] = [];

  for (const { connection, isPreset } of connections) {
    const attached = await attachOneFederatedConnection({ connection, registry: params.registry, deps: params.deps, connect, logger });
    registeredToolIds.push(...attached.registeredToolIds);
    if (attached.session) sessions.push(attached.session);
    if (attached.report) reports.push({ connectionId: connection.config.connectionId, report: attached.report, isPreset });
  }

  return { registeredToolIds, sessions, reports };
}

/** Registers every admitted tool from one connection's {@link federateSession} pass into
 *  `registry`, returning the ids actually registered. Split out of
 *  {@link attachOneFederatedConnection} purely to keep that function's complexity under the shop
 *  ceiling. */
function registerFederatedTools(registry: ToolRegistry, registrations: readonly ToolRegistration[]): string[] {
  const registeredToolIds: string[] = [];
  for (const registration of registrations) {
    registry.register(registration);
    registeredToolIds.push(registration.descriptor.id);
  }
  return registeredToolIds;
}

/** Logs one connection's full admission accounting. Refusals are reported, never silent —
 *  `buildDomainRegistrations`'s own "silence is never the outcome" discipline. An operator
 *  debugging a missing tool needs the reason, and an operator reading logs after an incident needs
 *  to see what a remote TRIED to expose. Split out of {@link attachOneFederatedConnection} purely
 *  to keep that function's complexity under the shop ceiling.
 *
 *  The two `writeAuthorized`/`writeAllowedButNotAllowlisted` lines are WARN, not INFO, on purpose:
 *  an operator-authorized write tool entering the model's catalog — or an operator's write
 *  authorization silently doing nothing because the same name is missing from the allowlist — is a
 *  security-relevant boot event, not routine informational noise. See the write-tools
 *  implementation outline §9. */
function logFederatedAdmissionReport(connectionId: string, report: FederatedAdmissionReport, logger: FederationLogger): void {
  for (const refusal of report.refused) {
    logger.warn(`mcp-federation: '${connectionId}' refused remote tool '${refusal.remoteName}' — ${refusal.reason}`);
  }
  for (const admitted of report.admitted) {
    if (admitted.writeAuthorized) {
      logger.warn(`mcp-federation: '${connectionId}' admitted WRITE tool '${admitted.remoteName}' (operator-authorized)`);
    }
  }
  for (const absent of report.allowlistedButAbsent) {
    logger.warn(`mcp-federation: '${connectionId}' allowlists '${absent}' but the server never advertised it — check the allowlist for a typo, or the server's --features`);
  }
  for (const drift of report.writeAllowedButNotAllowlisted) {
    logger.warn(`mcp-federation: '${connectionId}' write-authorizes '${drift}' but it is not in the allowlist — it will never be admitted until it is added to both`);
  }
}

/** One iteration of {@link attachFederatedMcpTools}'s original inline loop body — connect, list,
 *  admit, register, log — extracted purely to keep that function's complexity under the shop
 *  ceiling. Fail-open per connection: any failure (connect, list, or admission) is logged and
 *  swallowed here rather than propagated, matching this file's own fail-open doc. A session that
 *  connected but failed later still gets closed. */
async function attachOneFederatedConnection(params: {
  connection: ResolvedFederatedConnection;
  registry: ToolRegistry;
  deps: FederationDeps;
  connect: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  logger: FederationLogger;
}): Promise<{
  readonly registeredToolIds: readonly string[];
  readonly session: McpSessionPort | null;
  /** The admission report `federateSession` produced, or `null` when this connection never reached
   *  that step (connect failed, listing failed, or a native-id collision dropped it whole). */
  readonly report: FederatedAdmissionReport | null;
}> {
  const { connection, registry, deps, connect, logger } = params;
  const { connectionId } = connection.config;
  let session: McpSessionPort | undefined;
  try {
    session = await connect(connection);
    // Snapshotted here, immediately before the admission check, so the collision assertion sees
    // every native tool AND every tool an earlier connection in this same loop already claimed.
    const nativeToolIds = new Set(registry.list().map((descriptor) => descriptor.id));

    const { registrations, report } = await federateSession({ session, config: connection.config, deps, nativeToolIds });
    const registeredToolIds = registerFederatedTools(registry, registrations);

    logger.info(
      `mcp-federation: '${connectionId}' registered ${registrations.length} federated tool(s): ${registrations.map((r) => r.descriptor.id).join(", ") || "(none)"}`,
    );
    logFederatedAdmissionReport(connectionId, report, logger);

    return { registeredToolIds, session, report };
  } catch (error) {
    logger.warn(`mcp-federation: '${connectionId}' failed, continuing without its tools — ${messageOf(error)}`);
    // A session that connected but failed during listing/admission still owns a child process.
    await session?.close().catch(() => undefined);
    return { registeredToolIds: [], session: null, report: null };
  }
}

/**
 * Asks every registered preset for a connection, in registration order.
 *
 * Errors are isolated PER PRESET rather than abandoning the whole resolution pass: an enabled-but-
 * invalid Supabase config must not also disable a correctly-configured second vendor that happens to
 * be registered after it. Each failure is loud — the operator meant to have that connection and does
 * not — and still non-fatal, because Tovu's own assistant is unaffected either way.
 *
 * A preset that declines (`null`) is silent: "not configured" is the expected default state, and
 * logging it every boot would train operators to ignore this channel.
 */
function resolveRegisteredPresets(env: NodeJS.ProcessEnv, logger: FederationLogger): ResolvedFederatedConnection[] {
  const connections: ResolvedFederatedConnection[] = [];

  for (const preset of listFederatedMcpPresets()) {
    try {
      const connection = preset.resolve(env);
      if (connection) connections.push(connection);
    } catch (error) {
      logger.warn(
        `mcp-federation: preset '${preset.presetId}' configuration is invalid, continuing without federated tools — ${messageOf(error)}`,
      );
    }
  }

  return connections;
}

/**
 * The production session factory: reach the server and handshake.
 *
 * Which config field bounds the handshake differs by transport, because the two adapters do not
 * offer the same seam: the stdio arm gives up on the whole `connect` (spawn + handshake) if it
 * outlasts `connectTimeoutMs`, via the outer race in {@link connectMcpStdioSessionWithSpawnTimeout}.
 * The hosted arm has no such outer race — see the inline comment on its branch below for why — so
 * its handshake is bounded the same way every later request is, by whatever `requestTimeoutMs` it is
 * constructed with.
 *
 * Dispatches on the launch spec rather than on a configured transport name, so "which adapter" is
 * decided by the shape of the thing that was resolved and cannot disagree with it.
 */
async function defaultConnect(connection: ResolvedFederatedConnection): Promise<McpSessionPort> {
  if (isHttpLaunchSpec(connection.launch)) {
    return connectMcpHttpSession({
      exchange: createFetchMcpHttpExchange(),
      spec: connection.launch,
      // Unlike the stdio arm, the hosted adapter has ONE timeout field, and it governs every
      // request the session ever sends (`adapter.http.ts`'s `McpHttpSession.postWithTimeout`),
      // the handshake included but not exclusively — every later `tools/call` reuses it too. So
      // `callTimeoutMs` is the right bound here, matching the stdio arm below: `connectTimeoutMs`
      // still needs its own outer race for that arm's `spawn`-can-hang gap, but this adapter's
      // request-scoped `AbortSignal` already bounds its own handshake, so no such race is needed
      // here — that much of the old comment stands, only the bound it fed was wrong.
      requestTimeoutMs: connection.config.callTimeoutMs,
    });
  }
  return connectMcpStdioSessionWithSpawnTimeout(connection, connection.launch);
}

/**
 * The stdio session factory, with the outer timeout `spawn` requires.
 *
 * That timeout is not redundant with the adapter's per-request one. That one bounds a request whose
 * channel is alive; this one bounds the case where `spawn` itself hangs — a command that blocks
 * before it ever writes, an `npx` fetching a package on a stalled network — where no request has
 * been sent yet and so nothing inside the adapter has started counting. The hosted transport has no
 * equivalent gap, which is why only this arm needs the race.
 */
async function connectMcpStdioSessionWithSpawnTimeout(
  connection: ResolvedFederatedConnection,
  launch: McpStdioLaunchSpec,
): Promise<McpSessionPort> {
  const channel = spawnMcpStdioChannel(launch);
  const timeoutMs = connection.config.connectTimeoutMs;

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      connectMcpStdioSession({ channel, requestTimeoutMs: connection.config.callTimeoutMs }),
      // Not `unref()`ed, for the same reason as `adapter.stdio.ts`'s per-request timer: an unref'd
      // timer would let the loop drain and abandon this race unsettled instead of rejecting. The
      // `finally` below clears it either way, so it never outlives the connect attempt.
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`connect timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    // Whichever branch lost, the child process must not survive it.
    channel.close();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
