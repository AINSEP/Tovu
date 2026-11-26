import type { AgentPluginMcpPort, AgentPluginOAuthPort, AgentPluginApiConnectionsPort, PluginCredentialsPort, AgentPluginMcpContext, AgentPluginSignInPort } from "@jini-ai/agent-plugins/site/service-ports";
import type { AgentToolDefinition, DerivedRiskByToolId } from "@jini-ai/core";
import { approvalToolHandler } from "../../contracts/core/human-confirm.js";
import { notConfirmedResult } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { tovuEnableAccessMessages } from "./enable-access.js";
import { CONNECT_DECLINED_ACTOR } from "./apply-connect-defaults.js";
import type { UUID } from "@jini-ai/core/primitives";
import type { LegacyToolAuthorizeFn as AuthorizeFn } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { withAgentPluginMcpPorts } from "./mcp-host-bindings.js";
import { chooseApiConnectionDestination } from "./connect-destination.js";
import { waitAtAgentPluginSignInCard } from "./connect-sign-in-wait.js";
import { readInstalledMcpServers, mcpServerTrustClassifier, preferBundledAgentPluginDigests, readBundledAgentPluginDigests, listInstalledPlugins, readTrustedPluginFile } from "./lifecycle.js";
import type { AgentPluginLayout } from "@jini-ai/core/contracts/headless/plugin-host";
import { isAgentPluginEnabled } from "./activation-effects.js";
import type { DeclaredApiConnection } from "@jini-ai/integrations/api-connections";
import { agentPluginConnectAgentToolCatalogFor, agentPluginConnectDerivedRiskFor, parsePluginCredentialCards,
  type AgentPluginConnectHost, type AgentPluginConnectMessages, type ResolvedAgentPluginForConnect } from "@jini-ai/agent-plugins/connect";
import { createAgentPluginConnectDeps, resolveAgentPluginConnectRedirectUri } from "@jini-ai/agent-plugins/connect/host-deps";
import { resolveInstalledAgentPlugin } from "@jini-ai/agent-plugins/connect/installed-plugin";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "./identity-read-policy.js";

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
  /** Plugin-declared OAuth API connections (`jini-connections.json`). Absent: only MCP servers connect. */
  readonly apiConnections?: AgentPluginApiConnectionsPort<DeclaredApiConnection>;
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

/** Tovu's refusal copy (tool names, "this Tovu version", "restart Tovu"). Bytes unchanged. */
export const tovuAgentPluginConnectMessages: AgentPluginConnectMessages = {
  signInRefused: ({ detail }) => `${detail}. Sign-in could not start; no sign-in card was opened. Use the plugin's secure key card with credential_save if it offers one. Do not ask the person to restart Tovu.`,
  unsupportedSignIn: ({ kind }) => `agent_plugin_connect: '${kind}' sign-in is not supported by the connect card yet.`,
  connectionNotSetUp: ({ pluginId, serverKey }) => `agent_plugin_connect: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.`,
  multipleTokenServers: ({ pluginId }) => `agent_plugin_connect: '${pluginId}' declares more than one access-token sign-in.`,
  noTokenCardAdapter: () => `agent_plugin_connect: use the plugin's secure key card with credential_save; no token-card adapter is wired here.`,
  // A plugin with no sign-in is pointed at its key card: a connect retry would only refuse again.
  pluginOff: ({ pluginId }, { credentialCards = [] } = {}) => `The '${pluginId}' plugin is off or its activation could not be checked. Ask to turn it on with plugins_set_enabled({family:"agent-plugin",pluginId:${JSON.stringify(pluginId)},enabled:true}), then ` +
    (credentialCards[0] ? `save its key with credential_save({kind:"plugin-provider",target:${JSON.stringify(credentialCards[0].providerId)}}). It has no sign-in, so do not retry agent_plugin_connect.` : "retry agent_plugin_connect."),
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
/**
 * Builds `beginConnect`'s redirect URI, same precedence as that file's `resolveExternalMcpOAuthRedirectUri`
 * (an operator-set `TOVU_PUBLIC_URL` wins, `derivedPublicOrigin` fills the gap, `undefined` when
 * neither exists so `beginConnect` itself decides whether the grant actually needs one). Simplified,
 * not a byte-for-byte restatement: a malformed `TOVU_PUBLIC_URL` is treated as absent here rather than
 * thrown as a `ToolInputError` — a bad operator env var is a composition-root problem this tool did
 * not introduce and has no confirmation surface built for; the real form tool still reports it loudly.
 */
  publicUrl: { redirectUri: ({ serverId, derivedPublicOrigin }) => resolveAgentPluginConnectRedirectUri({ configuredOrigin: process.env.TOVU_PUBLIC_URL, derivedOrigin: derivedPublicOrigin, serverId, callbackPath: EXTERNAL_MCP_OAUTH_CALLBACK_PATH }) },
  federation: { classifyTrust: mcpServerTrustClassifier, messages: tovuEnableAccessMessages },
  actors: { connectDeclined: CONNECT_DECLINED_ACTOR },
  waitAtSignInCard: (required, optional) => waitAtAgentPluginSignInCard(required, optional),
  chooseDestination: (required, optional) => chooseApiConnectionDestination(required, optional),
};

export const installedPluginDeps = {
  parseCredentialCards: (input: Parameters<typeof parsePluginCredentialCards>[0]) => parsePluginCredentialCards(input, TOVU_AGENT_PLUGIN_IDENTITY_READ),
  lifecycle: {
    listInstalledPlugins, readBundledAgentPluginDigests, readTrustedPluginFile, readInstalledMcpServers,
    preferBundledAgentPluginDigests: ({ installed, bundled }) => preferBundledAgentPluginDigests(installed, bundled),
  },
} satisfies Pick<Parameters<typeof resolveInstalledAgentPlugin>[0], "parseCredentialCards" | "lifecycle">;

export const tovuConnectDeps = createAgentPluginConnectDeps({
  host: tovuAgentPluginConnectHost,
  isPluginEnabled: isAgentPluginEnabled,
  resolveInstalledPlugin: input => resolveInstalledAgentPlugin({ ...input, ...installedPluginDeps }),
  projectMcp: withAgentPluginMcpPorts,
});
