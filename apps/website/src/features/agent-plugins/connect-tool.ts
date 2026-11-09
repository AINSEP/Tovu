/** Tovu compatibility shim (A10b seam). The portable tool body lives in `@jini-ai/agent-plugins/connect`;
 * these entries keep their signatures and bind Tovu's tool id, permissions, approval owner, refusal
 * copy (tool names, "this Tovu version", "restart Tovu"), public callback URL, installed/activation
 * reads, trust rule, declined actor and card waiters. Bytes unchanged from the pre-seam body. */
import type { PluginCredentialCard } from "@jini-ai/core/contracts/credentials";
import type { AgentPluginMcpPort, AgentPluginOAuthPort, AgentPluginApiConnectionsPort, PluginCredentialsPort, AgentPluginMcpRecord, AgentPluginMcpContext, AgentPluginSignInPort } from "./service-ports.js";
import type { AgentToolDefinition, DerivedRiskByToolId } from "@jini-ai/core";
import { approvalToolHandler, notConfirmedResult } from "../../contracts/core/human-confirm.js";
import { tovuEnableAccessMessages } from "./enable-access.js";
import { CONNECT_DECLINED_ACTOR } from "./apply-connect-defaults.js";
import type { UUID } from "@jini-ai/core/primitives";
import type { LegacyToolAuthorizeFn as AuthorizeFn, ToolExecutionContext } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { agentPluginMcpPortsOf, withAgentPluginMcpPorts, withOverrides } from "./mcp-host-bindings.js";
import { chooseApiConnectionDestination } from './connect-destination.js';
import { waitAtAgentPluginSignInCard } from "./connect-sign-in-wait.js";
import { readInstalledMcpServers, classifyAgentPluginMcpServerTrust } from "./capability-projection.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./lifecycle.js";
import type { AgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./lifecycle.js";
import { isAgentPluginEnabled } from './activation-effects.js';
import type { McpServerConfig } from "./mcp-metadata.js";
import type { DeclaredApiConnection } from "../api-connections/contribution.js";
import {
  runAgentPluginConnect as runWithPorts, titleCaseFromPluginId as titleCaseWithPorts, hasStoredAgentPluginCredential as hasStoredWithPorts,
  agentPluginConnectAgentToolCatalogFor, agentPluginConnectDerivedRiskFor,
  type AgentPluginConnectDeps, type AgentPluginConnectHost, type AgentPluginConnectMessages, type AgentPluginConnectOptions, type AgentPluginConnectResult,
  type ResolvedAgentPluginForConnect,
} from "@jini-ai/agent-plugins/connect";
export type { AgentPluginConnectOptions, AgentPluginConnectResult, ResolvedAgentPluginForConnect, AgentPluginConnectDeps, AgentPluginConnectHost, AgentPluginConnectMessages } from "@jini-ai/agent-plugins/connect";

export const AGENT_PLUGIN_CONNECT_TOOL_ID = "agent_plugin_connect";

/** Mirrors `features/external-mcp/agent-tools.ts`'s `EXTERNAL_MCP_MANAGE_PERMISSION` verbatim.
 *  Restated rather than imported, per this codebase's "duplicate the tiny constant" convention
 *  (see e.g. `features/external-mcp/tool-registrations.ts`'s own header) — connecting a plugin's
 *  account is, mechanically, exactly the external-MCP write that permission already gates. */
const AGENT_PLUGIN_CONNECT_PERMISSION = "admin.integrations.manage";

/** Mirrors `features/external-mcp/tool-registrations.ts`'s identical private constant — restated,
 *  not imported, for the same "no live HTTP request" reason that file's own header gives: both must
 *  keep naming the SAME public callback path, but neither owns the other. */
const EXTERNAL_MCP_OAUTH_CALLBACK_PATH = "/api/mcp-servers/oauth/callback";

/**
 * Builds `beginConnect`'s redirect URI, same precedence as that file's `resolveExternalMcpOAuthRedirectUri`
 * (an operator-set `TOVU_PUBLIC_URL` wins, `derivedPublicOrigin` fills the gap, `undefined` when
 * neither exists so `beginConnect` itself decides whether the grant actually needs one). Simplified,
 * not a byte-for-byte restatement: a malformed `TOVU_PUBLIC_URL` is treated as absent here rather than
 * thrown as a `ToolInputError` — a bad operator env var is a composition-root problem this tool did
 * not introduce and has no confirmation surface built for; the real form tool still reports it loudly.
 */
function resolveConnectRedirectUri(serverId: string, derivedPublicOrigin: string | undefined): string | undefined {
  const configured = process.env.TOVU_PUBLIC_URL?.trim();
  let origin: string | undefined;
  if (configured) {
    try {
      const url = new URL(configured);
      // `URL.origin` is the string "null" for a non-http(s) scheme — never a usable redirect origin.
      origin = url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
    } catch {
      origin = undefined;
    }
  }
  origin ??= derivedPublicOrigin || undefined;
  if (!origin) return undefined;
  return `${origin}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${encodeURIComponent(serverId)}`;
}

/** The real, on-disk resolution — the SAME walk `federate-mcp.ts`'s `resolveAgentPluginMcpServers`
 *  performs, restated here rather than imported so this tool does not need to import a second
 *  plugin's worth of exports just to reach the one function; both read `mcp.json` off the winning
 *  (bundled-preferred) installed digest for a pluginId. Returns `null` for a pluginId not installed
 *  in this workspace. */
export async function defaultResolveInstalledAgentPlugin(input: { workspaceId: string; pluginId: string; agentPluginLayout: AgentPluginLayout }, _options = {}): Promise<ResolvedAgentPluginForConnect | null> {
  const workspaceLayout = input.agentPluginLayout.forWorkspace(input.workspaceId);
  const installed = preferBundledAgentPluginDigests(
    await listInstalledPlugins(workspaceLayout.root),
    await readBundledAgentPluginDigests(workspaceLayout.root),
  );
  const plugin = installed.find((candidate) => candidate.pluginId === input.pluginId);
  if (!plugin) return null;
  return { servers: await readInstalledMcpServers(plugin.packageRoot) };
}

/** "supabase" -> "Supabase", "higgsfield-media" -> "Higgsfield Media". There is no separate
 *  display-name field in `plugin.json` (agent-plugins.org has none) — `uninstall-confirmation-ui.ts`'s
 *  own dialog makes the identical choice, naming the plugin by its id. */
export function titleCaseFromPluginId(pluginId: string): string {
  return titleCaseWithPorts({ pluginId });
}

/** Consumer-owned services; composition binds persistence, secret custody and sign-in providers.
 * OAuth remains optional so token-only declarations work without an OAuth service. */
export interface AgentPluginConnectToolDeps {
  readonly ownerPrincipalId?: Promise<string>;
  /** Fresh activation owner; injected so OFF-plugin refusal needs no filesystem in unit tests. */
  readonly isPluginEnabled?: (pluginId: string) => Promise<boolean>;
  readonly credentials: Pick<PluginCredentialsPort, "loadSafe">;
  readonly agentPluginLayout: AgentPluginLayout;
  readonly workspaceId: UUID;
  readonly authorize: AuthorizeFn;
  readonly mcp: AgentPluginMcpContext & Pick<AgentPluginMcpPort, "repo" | "saveServer" | "applyAccess"> & Partial<Pick<AgentPluginMcpPort, "notifyRosterChanged">>;
  readonly externalMcpOAuth?: AgentPluginOAuthPort | AgentPluginSignInPort;
  readonly derivedPublicOrigin?: string;
  /** Injectable for tests; a real composition root omits both and gets the production cadence. */
  readonly pollIntervalMs?: number;
  readonly waitTimeoutMs?: number;
  /** Injectable for tests, so a fixture plugin needs no real install on disk. A real composition
   *  root omits this and gets {@link defaultResolveInstalledAgentPlugin}. */
  readonly resolveInstalledPlugin?: (pluginId: string) => Promise<ResolvedAgentPluginForConnect | null>;
  /** Plugin-declared OAuth API connections (`tovu-connections.json`). Absent: only MCP servers connect. */
  readonly apiConnections?: AgentPluginApiConnectionsPort;
}

const AGENT_PLUGIN_CONNECT_DESCRIPTION = [
  "Connects an installed Agent Plugin's account by walking the human through its sign-in, then waits until it is done.",
  "Call this once you know which plugin needs connecting (e.g. from search_agent_plugin_local, whose result names a " +
    "MCP server that is not yet connected) — it needs no prior setup, this provisions the connection " +
    "itself the first time it is called for a given plugin.",
  "Token-only plugins reuse a saved credential or show their secure key card. They return connected only after a save succeeds; cancelled, expired or failed cards return not-connected with reason. OAuth plugins attempt sign-in first; only a successful start shows the human a card with a sign-in link and parks until they finish. Do not promise a card before it is emitted. If sign-in fails, explain that no card opened and use the plugin's declared credential_save key card when available. Never ask the person to restart Tovu. Returns { status: 'connected' } once the " +
    "sign-in completes, or { status: 'waiting-for-sign-in' } if nobody finished within a few minutes — call this again " +
    "with the same pluginId once the human says they're back; never loop on your own.",
  "For a plugin that declares its own API connection, the result also carries connectionRef: pass it unchanged as " +
    "connectionRef to that plugin's tools (it is an opaque reference, not a secret, and works only for that plugin).",
  "Never returns a token, a URL, or any row id — only safe status, outcome guidance and that connectionRef. Refused with a plain error if the plugin has no " +
    "supported connection, more than one token server, or more than one still-unconnected OAuth server (connect those one at a time).",
].join(" ");

/** This tool's one-entry catalog, exported so `assistant/__tests__/tool-registrations.contracts.test.ts`'s
 *  `CATALOGS_BY_DOMAIN` can import it the same way it imports every sibling domain's catalog. */
export const agentPluginConnectAgentToolCatalog: AgentToolDefinition[] = agentPluginConnectAgentToolCatalogFor({
  toolId: AGENT_PLUGIN_CONNECT_TOOL_ID, permission: AGENT_PLUGIN_CONNECT_PERMISSION, description: AGENT_PLUGIN_CONNECT_DESCRIPTION,
  pluginIdDescription: "An installed Agent Plugin's id, e.g. from search_agent_plugin_local.",
});

export const agentPluginConnectDerivedRisk: DerivedRiskByToolId = agentPluginConnectDerivedRiskFor({ toolId: AGENT_PLUGIN_CONNECT_TOOL_ID });

/** Whether a plugin's row already holds a credential: a finished sign-in, or a saved access token
 *  (`static_env` with the token sealed in `sealedOAuth` — what `agent_plugin_set_access_token`, the
 *  old env var's boot import, and create-site onboarding all write; `sealedEnv` is a stdio row's env
 *  block and never holds it). Such a row needs no sign-in, and a token import must never overwrite it. */
export function hasStoredAgentPluginCredential(row: Pick<AgentPluginMcpRecord, "authMode" | "sealedOAuth" | "oauthStatus">, options: AgentPluginMcpContext = {}): boolean {
  return hasStoredWithPorts({ row, projections: agentPluginMcpPortsOf(options).projections });
}

/** Tovu's refusal copy (tool names, "this Tovu version", "restart Tovu"). Bytes unchanged. */
export const tovuAgentPluginConnectMessages: AgentPluginConnectMessages = {
  signInRefused: ({ detail }) => `${detail}. Sign-in could not start; no sign-in card was opened. Use the plugin's secure key card with credential_save if it offers one. Do not ask the person to restart Tovu.`,
  unsupportedSignIn: ({ kind }) => `agent_plugin_connect: '${kind}' sign-in is not supported by the connect card yet.`,
  connectionNotSetUp: ({ pluginId, serverKey }) => `agent_plugin_connect: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.`,
  multipleTokenServers: ({ pluginId }) => `agent_plugin_connect: '${pluginId}' declares more than one access-token sign-in.`,
  noTokenCardAdapter: () => `agent_plugin_connect: use the plugin's secure key card with credential_save; no token-card adapter is wired here.`,
  pluginOff: ({ pluginId }) => `The '${pluginId}' plugin is off or its activation could not be checked. Ask to turn it on with plugins_set_enabled({family:"agent-plugin",pluginId:${JSON.stringify(pluginId)},enabled:true}), then retry agent_plugin_connect.`,
  notInstalled: ({ pluginId }) => `agent_plugin_connect: '${pluginId}' is not an installed Agent Plugin in this workspace.`,
  noOAuthService: () => "agent_plugin_connect: no OAuth service is wired for this composition root — nothing can be connected here.",
  multipleOAuthServers: ({ pluginId, serverKeys }) => `agent_plugin_connect: '${pluginId}' declares ${serverKeys.length} unconnected OAuth servers (${serverKeys.join(", ")}) — connect them one at a time.`,
  noConnection: ({ pluginId }) => `agent_plugin_connect: '${pluginId}' declares no OAuth-authenticated MCP server to connect.`,
  multipleApiConnections: ({ pluginId, count }) => `agent_plugin_connect: '${pluginId}' declares ${count} API connections — this Tovu version connects one per plugin.`,
  missingEmitter: () => "agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.",
};

/** Tovu's bindings: tool id, permissions, approval owner, callback URL, trust rule, declined actor, card waiters. */
export const tovuAgentPluginConnectHost: AgentPluginConnectHost<AssistantSurfaceDeps> = {
  toolId: AGENT_PLUGIN_CONNECT_TOOL_ID,
  permissions: { connect: AGENT_PLUGIN_CONNECT_PERMISSION, apiConnectionWrite: 'system.write' },
  entityType: 'agent-plugin',
  approvalErrorCode: 'AGENT_PLUGIN',
  approvals: {
    accessApprovalHandler: (required, optional) => approvalToolHandler(required, optional),
    notConfirmedResult: ({ reason }) => notConfirmedResult({ confirmed: false, reason }),
  },
  messages: tovuAgentPluginConnectMessages,
  publicUrl: { redirectUri: ({ serverId, derivedPublicOrigin }) => resolveConnectRedirectUri(serverId, derivedPublicOrigin) },
  federation: { classifyTrust: classifyAgentPluginMcpServerTrust, messages: tovuEnableAccessMessages },
  actors: { connectDeclined: CONNECT_DECLINED_ACTOR },
  waitAtSignInCard: (required, optional) => waitAtAgentPluginSignInCard(required, optional),
  chooseDestination: (required, optional) => chooseApiConnectionDestination(required, optional),
};

/** Old deps -> portable deps: projections bound once (same pair/identity rule as the A8 shims), the
 * activation/installed defaults read lazily exactly as the pre-seam body did. Getters stay lazy:
 * `routeDeps.mcp` is first read on first use, i.e. after the permission check, as before the seam. */
function tovuConnectDeps(routeDeps: AgentPluginConnectToolDeps): AgentPluginConnectDeps<AssistantSurfaceDeps, DeclaredApiConnection> {
  type ConnectMcp = ReturnType<typeof withAgentPluginMcpPorts<AgentPluginConnectToolDeps["mcp"]>>;
  let mcp: ConnectMcp | undefined;
  const deps = withOverrides(routeDeps, {
    isPluginEnabled: (pluginId: string) => routeDeps.isPluginEnabled ? routeDeps.isPluginEnabled(pluginId)
      : isAgentPluginEnabled({ workspaceRoot: routeDeps.agentPluginLayout.forWorkspace(routeDeps.workspaceId).root, pluginId }),
    resolveInstalledPlugin: (pluginId: string) => routeDeps.resolveInstalledPlugin ? routeDeps.resolveInstalledPlugin(pluginId)
      : defaultResolveInstalledAgentPlugin({ workspaceId: routeDeps.workspaceId, pluginId, agentPluginLayout: routeDeps.agentPluginLayout }),
    host: tovuAgentPluginConnectHost,
  });
  return Object.defineProperty(deps, "mcp", { get: () => (mcp ??= withAgentPluginMcpPorts(routeDeps.mcp)), enumerable: true, configurable: true }) as Omit<typeof deps, "mcp"> & { readonly mcp: ConnectMcp };
}

/** Same signature as the pre-seam entry; see the portable body for the flow. */
export function runAgentPluginConnect(
  { routeDeps, surfaces, ctx, pluginId }: {
    routeDeps: AgentPluginConnectToolDeps; surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext; pluginId: string;
  },
  optional: AgentPluginConnectOptions = {},
): Promise<AgentPluginConnectResult> {
  return runWithPorts({ routeDeps: tovuConnectDeps(routeDeps), surfaces, ctx, pluginId }, optional);
}
