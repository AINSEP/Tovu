// Boot-loop implementation and rationale: Jini/packages/mcp/src/federation/bootstrap.ts.
import { attachFederatedMcpTools as attachJiniTools } from "@jini-ai/mcp/federation";
import type { ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { createDefaultConnect as createJiniConnect, stdioLaunchResolverFromEnv, type McpStdioLaunchResolver, type ResolvedStdioLaunch, type StdioLaunchResolverFromEnvOptions } from "@jini-ai/mcp/federation/stdio";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import type { McpSessionPort, McpStdioChannel } from "@jini-ai/mcp/federation";
import { listFederatedMcpPresets, tovuFederationMessages, TOVU_MCP_CLIENT_INFO } from "./presets.js";
import { buildFederatedMcpRegistrations, toJiniFederationDeps, type FederationDeps } from "./registrations.js";
// The shared admission report is canonical in Jini; the host registration adapter does not redeclare it.
import type { FederatedAdmissionReport } from "@jini-ai/mcp/federation";

/**
 * @file Tovu binds host ports, presets, messages and launch policy to Jini's federation boot loop.
 * Optional outbound failures must not disable the native assistant; inbound daemon auth remains
 * fail-closed. The detailed admission, collision and session-cleanup rationale is at the Jini owner.
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
     * by design" apart from "no roster card because the operator just deleted it".
     * A deleted-but-live roster connection must be reported as drift.
     */
    readonly isPreset: boolean;
  }[];
  /**
   * One entry per connection that failed BEFORE reaching admission — a bad spawn, a timed-out
   * handshake, a malformed tool listing, or a native-id collision. This is the
   * connection-level counterpart to `reports` above: `reports` never carries an entry for one of
   * these. `configFailures` covers separate boot-time configuration resolution and cannot know
   * about failures inside `connect()`. `reason` is the human-readable connection error, the
   * same text `logger.warn` already prints for this exact failure, so this field discloses nothing
   * that was not already reaching this process's own stderr; it is never a raw env value or secret,
   * since nothing in this file's `connect`/`spawn` error paths ever formats one into a message.
   */
  readonly connectFailures: readonly { readonly connectionId: string; readonly reason: string }[];
}

/**
 * Connects every configured federated MCP server, registers whatever clears the trust tier into
 * `registry`, and returns what happened.
 *
 * Must be awaited BEFORE `buildToolCatalogQuery(registry)` runs: that function snapshots
 * `registry.list({})` into an FTS index once, so a tool registered afterwards would be executable but
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
  /**
   * The desktop-only stdio launch rewrite (desktop-npx plan §2): given a stdio launch spec, decides
   * what actually gets spawned and with what extra env, or throws {@link McpLaunchUnavailableError}
   * before any spawn when nothing resolves. Defaults to the host env-bound Jini resolver: identity
   * when both `TOVU_NODE_TOOLCHAIN_DIR` and `TOVU_BUNDLED_NPM_ROOT` are absent; a configured but
   * incomplete bundle refuses the stdio connection. HTTP and native boot continue independently.
   *
   * A separate parameter from `connect` (rather than folded into it) because it applies only to the
   * stdio arm: `defaultConnect`'s hosted (HTTP) branch never touches it. Injectable directly, not
   * only via `env`, so a test can supply a resolver that throws without needing real toolchain
   * directories on disk — see `createDefaultConnect`'s own test in `mcp-federation.bootstrap.test.ts`.
   */
  stdioLaunchResolver?: McpStdioLaunchResolver;
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
 *  each tagged with its origin.
 *
 *  `params.connections` (an injected override, used throughout this file's own tests) stands in for
 *  the preset list, not the roster — it replaces `resolveRegisteredPresets`'s result, and
 *  `extraConnections` is documented on {@link AttachFederatedMcpToolsParams} as specifically the
 *  operator-editable roster. So the origin tag is exactly which of the two arrays a connection came
 *  from. */
/** Stamps a preset-sourced connection's config with `origin: {kind:"preset"}`, so
 *  `external-mcp-revocation.ts`'s per-call gate can tell it apart from a roster connection (which
 *  carries its OWN origin already, stamped by `external-mcp-store.ts`'s
 *  `toResolvedFederatedConnections`) and skip the row re-check a preset has no row to support. Split
 *  out purely to keep {@link resolveFederationAttachInputs} under the shop complexity ceiling. */
function withPresetOrigin(connection: ResolvedFederatedConnection): ResolvedFederatedConnection {
  return { ...connection, config: { ...connection.config, origin: { kind: "preset" } } };
}

function resolveFederationAttachInputs(params: AttachFederatedMcpToolsParams): {
  logger: FederationLogger;
  connect: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  connections: readonly OriginTaggedConnection[];
} {
  const logger = params.logger ?? consoleLogger;
  // Resolve bundled settings only for a stdio connection. A broken bundle must refuse that
  // connection while HTTP connections and the native assistant continue booting.
  const env = params.env ?? process.env;
  const stdioLaunchResolver: McpStdioLaunchResolver = params.stdioLaunchResolver ?? {
    resolve: ({ spec }) => tovuStdioLaunchResolverFromEnv(env).resolve({ spec }),
  };
  const connect = params.connect ?? createDefaultConnect({ resolver: stdioLaunchResolver }, { logger });
  const presetConnections = params.connections ?? resolveRegisteredPresets(params.env ?? process.env, logger);
  const connections = [
    ...presetConnections.map((connection): OriginTaggedConnection => ({ connection: withPresetOrigin(connection), isPreset: true })),
    ...(params.extraConnections ?? []).map((connection): OriginTaggedConnection => ({ connection, isPreset: false })),
  ];
  return { logger, connect, connections };
}

/** Tovu's desktop env names and launch copy bound to Jini's resolver selection: identity when both
 * variables are absent; a configured but incomplete bundle refuses rather than running a PATH binary.
 * No identity-fallback opt-in is passed by production callers.
 * @complexity O(1) beyond the bundled resolver construction it may perform.
 */
export function tovuStdioLaunchResolverFromEnv(env: NodeJS.ProcessEnv, options: StdioLaunchResolverFromEnvOptions = {}): McpStdioLaunchResolver {
  return stdioLaunchResolverFromEnv({ env,
    toolchainDirEnvVar: "TOVU_NODE_TOOLCHAIN_DIR", npmRootEnvVar: "TOVU_BUNDLED_NPM_ROOT",
    messages: tovuFederationMessages,
  }, options);
}

// Warning deduplication is owned by @jini-ai/mcp/federation/stdio.

export async function attachFederatedMcpTools(params: AttachFederatedMcpToolsParams): Promise<AttachFederatedToolsResult> {
  const { logger, connect, connections } = resolveFederationAttachInputs(params);
  const originalSessions = new Map<McpSessionPort, McpSessionPort>();
  const classified = new Map<string, ToolRegistration>();
  const result = await attachJiniTools({
    // Jini owns the boot loop, reports and session cleanup. Bind the same enumerated tools to
    // the host policy before registration, so boot and reload cannot bypass per-call approval.
    registry: { ...params.registry, register(registration) {
      const reviewed = classified.get(registration.descriptor.id);
      if (!reviewed) throw new Error(`${registration.descriptor.id} has no approval classification`);
      params.registry.register(reviewed);
    } }, deps: toJiniFederationDeps({ deps: params.deps }),
    async connect({ connection }) {
      const hostSession = await connect(connection);
      const session: McpSessionPort = {
        callTool: (request, options = {}) => hostSession.callTool(request, options),
        close: required => hostSession.close(required),
        async listTools() {
          const tools = await hostSession.listTools();
          const built = buildFederatedMcpRegistrations({ tools, session: hostSession, config: connection.config,
            deps: params.deps, nativeToolIds: new Set(params.registry.list({}).map(tool => tool.id)),
          });
          for (const registration of built.registrations) classified.set(registration.descriptor.id, registration);
          return tools;
        },
      };
      originalSessions.set(session, hostSession);
      return session;
    },
  }, {
    // Host presets resolve here, not in Jini's independent registry. Presets still get first claim.
    connections: connections.filter(entry => entry.isPreset).map(entry => entry.connection),
    extraConnections: connections.filter(entry => !entry.isPreset).map(entry => entry.connection),
    env: params.env ?? process.env,
    logger: {
      info: ({ message }) => logger.info(message),
      warn: ({ message }) => logger.warn(message),
      error: ({ message }) => logger.warn(message),
    },
  });
  return { ...result, sessions: result.sessions.map(session => originalSessions.get(session) ?? session) };
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

/** Bind Tovu's client identity, presentation and optional host channel to Jini's bounded factory.
 * Static authenticating headers remain the credential source; resolution and spawn deadlines,
 * warning deduplication and hostile-server handling live in the package.
 * @complexity O(1) to construct; returned connections inherit Jini's bounded transport costs.
 */
export function createDefaultConnect({ resolver }: { resolver: McpStdioLaunchResolver }, {
  spawnChannel, logger = consoleLogger,
}: { spawnChannel?: (resolved: ResolvedStdioLaunch) => McpStdioChannel; logger?: FederationLogger } = {}):
  (connection: ResolvedFederatedConnection) => Promise<McpSessionPort> {
  const connect = createJiniConnect({ resolver, clientInfo: TOVU_MCP_CLIENT_INFO,
    messages: tovuFederationMessages, bearerToken: () => undefined,
  }, {
    logger: { warn: ({ message }) => logger.warn(message) },
    ...(spawnChannel ? { spawnChannel: ({ resolved }: { resolved: ResolvedStdioLaunch }) => spawnChannel(resolved) } : {}),
  });
  return connection => connect({ connection });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
