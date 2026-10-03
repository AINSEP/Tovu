/** Shared saved-server probe used by the admin route and assistant tools. Never spawns local commands or invokes remote tools. */
import {
  connectMcpHttpSession,
  createFetchMcpHttpExchange,
  ExternalMcpReauthRequiredError,
  externalMcpSettingsDeepLink,
  readEnabledExternalMcpConfigs,
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  toResolvedFederatedConnections,
  type ExternalMcpOAuthService,
  type ExternalMcpServerRecord,
} from "#src/assistant/index";
import { isHttpLaunchSpec, type FederatedMcpConnectionConfig, type McpHttpLaunchSpec, type McpSessionPort } from "#src/assistant/mcp-federation/ports";
import { describeRemoteToolSurface } from "#src/assistant/mcp-federation/trust";
import type { ExternalMcpToolDeps } from "#src/features/external-mcp/deps";

/** Injectable session factory — the seam a route test scripts instead of opening a real socket.
 *  Same shape `mcp-federation/bootstrap.ts`'s own `connect` parameter uses for the identical reason:
 *  the protocol code under test should be the real thing, not a second hand-rolled fake of it. */
export type ExternalMcpProbeSessionFactory = (spec: McpHttpLaunchSpec, requestTimeoutMs: number) => Promise<McpSessionPort>;

export type ExternalMcpProbeServiceDeps = Pick<ExternalMcpToolDeps, "workspaceId" | "clock" | "externalMcpServerRepo" | "siteAssistantSecretSealer"> & {
  /**
   * Optional: only consulted for a connection whose `authMode` is `"oauth"`.
   * `readEnabledExternalMcpConfigs`'s own `oauth` parameter is equally optional, for the same
   * reason — a deployment that has never wired an OAuth service can still probe a `none`/
   * `static_env` connection, so this route must not demand the service just to run at all.
   */
  readonly externalMcpOAuth?: ExternalMcpOAuthService;
  /** Defaults to the real hosted MCP client. See {@link ExternalMcpProbeSessionFactory}. */
  readonly connect?: ExternalMcpProbeSessionFactory;
};

/** The real session factory: one handshake against the resolved hosted endpoint, bounded by the
 *  connection's own `connectTimeoutMs`. Deliberately NOT the same bound `bootstrap.ts`'s
 *  `defaultConnect` uses for the identical transport: that session is long-lived and its bound
 *  governs every later `tools/call` too, so it uses `callTimeoutMs`. This one issues an `initialize`
 *  handshake via {@link connectMcpHttpSession} followed by this route's own single `listTools`
 *  call, then is closed immediately after — for THIS session, `connectTimeoutMs` bounds the
 *  handshake and is the correct bound rather than a reused wrong one.
 *  @complexity O(1) beyond the remote's round-trip. */
async function defaultProbeConnect(spec: McpHttpLaunchSpec, requestTimeoutMs: number): Promise<McpSessionPort> {
  return connectMcpHttpSession({ exchange: createFetchMcpHttpExchange(), spec, requestTimeoutMs });
}

/** One resolved, probeable target: the trust-tier config `describeRemoteToolSurface` needs, and the
 *  hosted launch spec to connect with. */
interface ProbeTarget {
  readonly federationConfig: FederatedMcpConnectionConfig;
  readonly launch: McpHttpLaunchSpec;
}

/** One outcome of {@link resolveProbeTarget}: either a usable target, or a response this route
 *  should send verbatim without ever attempting a connection. Modelled as a union rather than
 *  throwing, because every branch here is an ordinary, expected outcome (unknown id, wrong
 *  transport, disabled row, stale authorization) — none of them is exceptional. */
type ProbeTargetResolution = { readonly ok: true; readonly target: ProbeTarget } | { readonly ok: false; readonly status: number; readonly body: Record<string, unknown> };

/** `true` only for the fixed prose {@link resolveProbeTarget}'s failure branch and
 *  `external-mcp-oauth.ts`'s `ExternalMcpReauthRequiredError` share today — see this file's header
 *  on the residual race this covers: a row whose STORED status is `"connected"` but whose live token
 *  refresh fails with an invalid grant during this exact probe call. The common case (a row already
 *  parked `needs_reauth`) never reaches this function — {@link refuseBeforeResolving} catches the
 *  stored status directly, before `readEnabledExternalMcpConfigs` is ever called. A future wording
 *  change in either source string would silently widen this to the generic 502 branch instead of
 *  409, never the other direction — the safer failure mode for a coupling this loose. */
function looksLikeReauthFailure(reason: string): boolean {
  return reason.includes("authorization expired or was revoked");
}

/** Refuses a `stdio` row (D-7), a disabled row, and the common `needs_reauth` case, all from the
 *  record alone — before any credential is ever resolved. Split out of {@link resolveProbeTarget}
 *  purely to keep that function's complexity under the shop ceiling.
 *  @returns The response to send, or `null` to continue resolving.
 *  @complexity O(1). */
function refuseBeforeResolving(record: ExternalMcpServerRecord, serverId: string): Extract<ProbeTargetResolution, { ok: false }> | null {
  if (record.transport === "stdio") {
    return {
      ok: false,
      status: 400,
      body: {
        error: "probe is not available for local-command servers yet — type tool names directly instead",
        code: "PROBE_UNSUPPORTED_TRANSPORT",
        details: { field: "transport" },
      },
    };
  }
  if (!record.enabled) {
    return {
      ok: false,
      status: 400,
      body: { error: "this server is disabled — enable it before probing", code: "MCP_SERVER_DISABLED", details: { field: "enabled" } },
    };
  }
  if (resolveExternalMcpAuthMode(record) === "oauth" && resolveExternalMcpOAuthStatus(record) === "needs_reauth") {
    const error = new ExternalMcpReauthRequiredError({ serverId, label: record.label });
    return { ok: false, status: 409, body: { error: error.message, code: error.code, details: { retryable: false, settingsLink: error.settingsLink } } };
  }
  return null;
}

/** Turns one `readEnabledExternalMcpConfigs` MISS (the server resolved to neither a usable config
 *  nor — because it is enabled and past the early checks — anything but a failure entry) into a
 *  response. Split out of {@link resolveProbeTarget} purely to keep that function's complexity under
 *  the shop ceiling.
 *  @complexity O(1) given the caller already located `failure`. */
function respondToResolutionFailure(serverId: string, reason: string): Extract<ProbeTargetResolution, { ok: false }> {
  if (looksLikeReauthFailure(reason)) {
    return {
      ok: false,
      status: 409,
      body: { error: reason, code: "EXTERNAL_MCP_REAUTH_REQUIRED", details: { retryable: false, settingsLink: externalMcpSettingsDeepLink(serverId) } },
    };
  }
  return { ok: false, status: 502, body: { error: reason, code: "MCP_SERVER_UNREACHABLE" } };
}

/** Resolves one `serverId` into a probeable target, or the exact response to send instead. Never
 *  spawns a child process — see this file's D-7 header. Built on `readEnabledExternalMcpConfigs`/
 *  `toResolvedFederatedConnections`, the same pair the daemon's own boot path resolves credentials
 *  through, so a probe's target is derived exactly the way a real connect would be, rather than by a
 *  second, parallel reading of the row.
 *  @complexity O(n) in the workspace's configured server count — bounded by the store's own
 *  per-workspace server cap. */
async function resolveProbeTarget(deps: ExternalMcpProbeServiceDeps, serverId: string): Promise<ProbeTargetResolution> {
  const record = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId });
  if (!record) {
    return { ok: false, status: 400, body: { error: `no external MCP server is configured as '${serverId}'`, code: "INVALID_MCP_SERVER", details: { field: "id" } } };
  }

  const earlyRefusal = refuseBeforeResolving(record, serverId);
  if (earlyRefusal) return earlyRefusal;

  const { configs, failures } = await readEnabledExternalMcpConfigs(
    { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, oauth: deps.externalMcpOAuth?.tokenResolver },
    deps.workspaceId,
  );

  const config = configs.find((candidate) => candidate.serverId === serverId);
  if (!config) {
    const failure = failures.find((candidate) => candidate.serverId === serverId);
    return respondToResolutionFailure(serverId, failure?.reason ?? "this server's connection could not be resolved");
  }

  const [resolved] = toResolvedFederatedConnections([config]);
  // Defensive, not reachable given the transport check above (`config.transport` mirrors
  // `record.transport` — both come from the same row): the whole point of D-7 is that this route
  // must never launch a child process, and a launch-spec SHAPE check right before connecting is the
  // cheapest possible second guarantee of that, independent of whatever produced `resolved`.
  if (!resolved || !isHttpLaunchSpec(resolved.launch)) {
    return { ok: false, status: 400, body: { error: "probe is not available for local-command servers yet", code: "PROBE_UNSUPPORTED_TRANSPORT" } };
  }

  return { ok: true, target: { federationConfig: resolved.config, launch: resolved.launch } };
}

/** Connects once, lists, describes, and closes — the `finally` is the whole safety story for the
 *  outbound session, matching W-002's own framing in the implementation outline. Split out of the
 *  route handler purely to keep it under the shop ceiling.
 *  @complexity O(t) in the remote's advertised tool count, plus one round trip. */
async function runProbe(connect: ExternalMcpProbeSessionFactory, target: ProbeTarget): Promise<{ ok: true; tools: ReturnType<typeof describeRemoteToolSurface> } | { ok: false }> {
  let session: McpSessionPort | undefined;
  try {
    session = await connect(target.launch, target.federationConfig.connectTimeoutMs);
    const tools = await session.listTools();
    return { ok: true, tools: describeRemoteToolSurface({ tools, config: target.federationConfig }) };
  } catch {
    // Report the failed connection without logging upstream errors that may contain credentials.
    // eslint-disable-next-line no-console
    console.error(`external-mcp probe '${target.federationConfig.connectionId}' failed`);
    return { ok: false };
  } finally {
    await session?.close().catch(() => undefined);
  }
}

/** Resolves credentials, probes once, then closes. Expected refusals retain the admin response contract.
 * OAuth resolution can refresh and persist a grant, so this operation is not declared read-only.
 * @complexity O(n + t) time and O(n + t) space for saved servers and advertised tools, plus bounded I/O.
 */
export async function probeExternalMcpServer(deps: ExternalMcpProbeServiceDeps, serverId: string) {
  const resolution = await resolveProbeTarget(deps, serverId);
  if (!resolution.ok) return resolution;
  const outcome = await runProbe(deps.connect ?? defaultProbeConnect, resolution.target);
  if (!outcome.ok) return { ok: false as const, status: 502, body: { error: "could not reach this server — the probe did not complete", code: "MCP_SERVER_UNREACHABLE" } };
  return { ok: true as const, body: { tools: outcome.tools, probedAt: new Date(deps.clock.nowMs()).toISOString() } };
}
