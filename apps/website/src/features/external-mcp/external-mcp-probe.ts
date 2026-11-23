/** Saved-server probe used by the admin route and assistant tools. Jini's hosted probe resolves, connects once and
 * classifies; this file binds Tovu's store read and HTTP session and keeps Tovu's response contract: statuses,
 * legacy codes, copy and settings links. Never spawns local commands or invokes remote tools (D-7). */
import { credentialText } from "@tovu/contracts/credential-copy";
import { connectMcpHttpSession } from "../../assistant/index.js";
import { createFetchMcpHttpExchange } from "@jini-ai/mcp/federation";
import type { McpHttpLaunchSpec, McpSessionPort } from "@jini-ai/mcp/federation";
import { probeExternalMcpServer as probeHostedMcpServer, type ExternalMcpProbeFailure, type ExternalMcpProbeSessionFactory } from "@jini-ai/mcp/federation/hosted";
import { ExternalMcpReauthRequiredError, externalMcpSettingsDeepLink } from "./external-mcp-oauth.js";
import { readEnabledExternalMcpConfigs } from "./external-mcp-store.js";
import type { ExternalMcpOAuthService } from "@jini-ai/integrations/api-connections/hosted-mcp";
import type { ExternalMcpToolDeps } from "./deps.js";

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
async function defaultProbeConnect({ spec, requestTimeoutMs }: { spec: McpHttpLaunchSpec; requestTimeoutMs: number }, _optional = {}): Promise<McpSessionPort> {
  return connectMcpHttpSession({ exchange: createFetchMcpHttpExchange({ fetch }), spec, requestTimeoutMs });
}

type ProbeFailureResponse = { readonly ok: false; readonly status: number; readonly body: Record<string, unknown> };

const CONNECT_FAILURES = { auth: { status: 401, code: "MCP_AUTH_REJECTED" }, timeout: { status: 504, code: "MCP_TIMEOUT" }, unreachable: { status: 502, code: "MCP_SERVER_UNREACHABLE" } } as const;

/** The two local-command refusals: the record-level one points the operator at typing tool names. */
function localCommandResponse({ stage }: { stage: "record" | "launch" }, _optional = {}): ProbeFailureResponse {
  return stage === "record"
    ? { ok: false, status: 400, body: { error: "probe is not available for local-command servers yet — type tool names directly instead", code: "PROBE_UNSUPPORTED_TRANSPORT", details: { field: "transport" } } }
    : { ok: false, status: 400, body: { error: "probe is not available for local-command servers yet", code: "PROBE_UNSUPPORTED_TRANSPORT" } };
}

/** 409 for both reauthorization paths: a row parked `needs_reauth` (the error class's own copy and link), or a live
 *  refresh that failed with an invalid grant during this call (the store's reason, typed by Jini, plus the deep link). */
function reauthResponse(
  { failure, serverId }: { failure: Extract<ExternalMcpProbeFailure, { kind: "reauth_required" }>; serverId: string }, _optional = {},
): ProbeFailureResponse {
  if (failure.stage === "stored") {
    const error = new ExternalMcpReauthRequiredError({ serverId, label: failure.label });
    return { ok: false, status: 409, body: { error: error.message, code: error.code, details: { retryable: false, settingsLink: error.settingsLink } } };
  }
  return { ok: false, status: 409, body: { error: failure.reason, code: "EXTERNAL_MCP_REAUTH_REQUIRED", details: { retryable: false, settingsLink: externalMcpSettingsDeepLink({ serverId }) } } };
}

/** Tovu's admin response contract for each typed probe failure. Upstream bodies/errors may contain credentials;
 *  only the closed category crosses into a connect-failure answer. */
function probeFailureResponse({ failure, serverId }: { failure: ExternalMcpProbeFailure; serverId: string }, _optional = {}): ProbeFailureResponse {
  switch (failure.kind) {
    case "unknown_server":
      return { ok: false, status: 400, body: { error: `no external MCP server is configured as '${serverId}'`, code: "INVALID_MCP_SERVER", details: { field: "id" } } };
    case "local_command":
      return localCommandResponse({ stage: failure.stage });
    case "disabled":
      return { ok: false, status: 400, body: { error: "this server is disabled — enable it before probing", code: "MCP_SERVER_DISABLED", details: { field: "enabled" } } };
    case "reauth_required":
      return reauthResponse({ failure, serverId });
    case "unresolved":
      return { ok: false, status: 502, body: { error: failure.reason ?? "this server's connection could not be resolved", code: "MCP_SERVER_UNREACHABLE" } };
    default:
      return { ok: false, status: CONNECT_FAILURES[failure.kind].status, body: { error: credentialText({ id: failure.kind }), code: CONNECT_FAILURES[failure.kind].code } };
  }
}

/** Resolves credentials, probes once, then closes. Expected refusals retain the admin response contract.
 * OAuth resolution can refresh and persist a grant, so this operation is not declared read-only.
 * @complexity O(n + t) time and O(n + t) space for saved servers and advertised tools, plus bounded I/O.
 */
export async function probeExternalMcpServer({ deps, serverId }: { deps: ExternalMcpProbeServiceDeps; serverId: string }, _optional = {}) {
  const outcome = await probeHostedMcpServer({
    ports: {
      repo: deps.externalMcpServerRepo,
      readEnabledConfigs: ({ workspaceId }) => readEnabledExternalMcpConfigs(
        { deps: { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, oauth: deps.externalMcpOAuth?.tokenResolver }, workspaceId }),
      connect: deps.connect ?? defaultProbeConnect,
    },
    workspaceId: deps.workspaceId,
    serverId,
  });
  if (!outcome.ok) return probeFailureResponse({ failure: outcome.failure, serverId });
  return { ok: true as const, body: { tools: outcome.tools, probedAt: new Date(deps.clock.nowMs()).toISOString() } };
}
