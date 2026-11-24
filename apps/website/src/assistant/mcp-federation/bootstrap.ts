import { createFederatedMcpPresetRegistry, createFederationConsoleLogger, resolveFederatedMcpPresets, type AttachFederatedToolsResult, type FederatedMcpPresetRegistry, type FederationHostLogger } from "@jini-ai/mcp/federation";
// Boot-loop implementation and rationale: Jini/packages/mcp/src/federation/bootstrap.ts.
import { attachFederatedMcpTools as attachJiniTools } from "@jini-ai/mcp/federation";
import type { ToolRegistry } from "@jini-ai/core";

import { createDefaultConnect as createJiniConnect, stdioLaunchResolverFromEnv, type McpStdioLaunchResolver, type ResolvedStdioLaunch, type StdioLaunchResolverFromEnvOptions } from "@jini-ai/mcp/federation/stdio";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import type { McpSessionPort, McpStdioChannel } from "@jini-ai/mcp/federation";
import type { McpBearerTokenSupplier } from "@jini-ai/mcp/federation";
import { desktopMcpRuntime } from "../desktop-mcp-runtime.js";
import { tovuFederationMessages, TOVU_MCP_CLIENT_INFO } from "./presets.js";
import { buildFederatedMcpRegistrations, toJiniFederationDeps, type FederationDeps } from "./registrations.js";

/**
 * @file Tovu binds host ports, presets, messages and launch policy to Jini's federation boot loop.
 * Optional outbound failures must not disable the native assistant; inbound daemon auth remains
 * fail-closed. The detailed admission, collision and session-cleanup rationale is at the Jini owner.
 */

/** Tovu's console sink: Jini's prefixed federation console logger (original error as a second
 * console argument) under the daemon's historical `[agent-daemon]` prefix. */
const consoleLogger: FederationHostLogger = createFederationConsoleLogger({ prefix: "[agent-daemon]" });

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
  readonly presetRegistry?: FederatedMcpPresetRegistry;
  registry: ToolRegistry;
  deps: FederationDeps;
  connections?: readonly ResolvedFederatedConnection[];
  /**
   * Connections from a config source that is not the preset registry — today, the operator-editable
   * roster in `apps/website/src/features/external-mcp/external-mcp-store.ts`.
   *
   * A second parameter rather than a second preset, because `FederatedMcpPresetResolver` cannot
   * express this source: it is synchronous (a DB read plus an unseal are not) and returns at most
   * one connection (a roster returns N). Appended AFTER the presets so a preset keeps first claim on
   * a contested tool id under R1, which preserves the existing behaviour of every already-configured
   * deployment — an operator adding a row cannot displace a vendor preset that was already working.
   */
  extraConnections?: readonly ResolvedFederatedConnection[];
  connect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  logger?: FederationHostLogger;
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

/** Resolves the host-defaulted inputs: `logger`, the stdio-bound `connect`, and the preset list
 *  (an injected override, used throughout this file's own tests, stands in for the presets, not the
 *  roster). Jini stamps preset origin and keeps presets ahead of `extraConnections`. */
function resolveFederationAttachInputs(params: AttachFederatedMcpToolsParams): {
  logger: FederationHostLogger;
  connect: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  connections: readonly ResolvedFederatedConnection[];
} {
  const logger = params.logger ?? consoleLogger;
  // Resolve bundled settings only for a stdio connection. A broken bundle must refuse that
  // connection while HTTP connections and the native assistant continue booting.
  const env = params.env ?? process.env;
  const stdioLaunchResolver: McpStdioLaunchResolver = params.stdioLaunchResolver ?? {
    resolve: ({ spec }) => tovuStdioLaunchResolverFromEnv(env).resolve({ spec }),
  };
  const connect = params.connect ?? createDefaultConnect({ resolver: stdioLaunchResolver }, { logger });
  const connections = params.connections ?? resolveRegisteredPresets({ env, logger, registry: params.presetRegistry ?? createFederatedMcpPresetRegistry({}) });
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
  const result = await attachJiniTools({
    // Jini owns the boot loop, reports and session cleanup. Bind the same enumerated tools to
    // the host policy before registration, so boot and reload cannot bypass per-call approval.
    // Passing the real registry also keeps Jini's core revocation scopes attached to its executor.
    registry: params.registry, deps: toJiniFederationDeps({ deps: params.deps }),
    connect: ({ connection }) => connect(connection),
  }, {
    buildRegistrations: ({ tools, session, config, nativeToolIds }) => buildFederatedMcpRegistrations({ tools, session, config, nativeToolIds, deps: params.deps }),
    // Resolve the injected host instance once; presets retain first claim over roster entries.
    connections, extraConnections: params.extraConnections ?? [],
    env: params.env ?? process.env,
    logger: {
      info: ({ message }, { error } = {}) => logger.info({ message }, { error }),
      warn: ({ message }, { error } = {}) => logger.warn({ message }, { error }),
      error: ({ message }, { error } = {}) => logger.warn({ message }, { error }),
    },
  });
  return result;
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
 * @complexity O(p) for p registered presets; resolution remains owned by Jini.
 */
export function resolveRegisteredPresets({ env, logger, registry }: {
  env: NodeJS.ProcessEnv; logger: FederationHostLogger; registry: FederatedMcpPresetRegistry;
}, _optional: Record<string, never> = {}): ResolvedFederatedConnection[] {
  return resolveFederatedMcpPresets({ env, registry, logger: { warn: ({ message }) => logger.warn({ message }) } });
}

/** Bind Tovu's client identity, presentation and optional host channel to Jini's bounded factory.
 * Stored connections keep their authenticating headers; the spawning desktop supplies a bearer
 * only for its exact runtime endpoint. Resolution and spawn deadlines,
 * warning deduplication and hostile-server handling live in the package.
 * @complexity O(1) to construct; returned connections inherit Jini's bounded transport costs.
 */
export function createDefaultConnect({ resolver }: { resolver: McpStdioLaunchResolver }, {
  spawnChannel, logger = consoleLogger, bearerToken = desktopMcpRuntime.bearerToken,
}: { spawnChannel?: (resolved: ResolvedStdioLaunch) => McpStdioChannel; logger?: FederationHostLogger; bearerToken?: McpBearerTokenSupplier } = {}):
  (connection: ResolvedFederatedConnection) => Promise<McpSessionPort> {
  const connect = createJiniConnect({ resolver, clientInfo: TOVU_MCP_CLIENT_INFO,
    messages: tovuFederationMessages, bearerToken,
  }, {
    logger: { warn: ({ message }) => logger.warn({ message }) },
    ...(spawnChannel ? { spawnChannel: ({ resolved }: { resolved: ResolvedStdioLaunch }) => spawnChannel(resolved) } : {}),
  });
  return connection => connect({ connection });
}
