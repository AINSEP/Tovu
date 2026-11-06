import type { PluginCredentialCard } from "../../contracts/core/plugin-credential-card.js";
import type { AgentPluginMcpPort, AgentPluginOAuthPort, AgentPluginApiConnectionsPort, PluginCredentialsPort } from "./service-ports.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { type AgentToolSideEffect, type DerivedRiskByToolId, type AgentToolDefinition } from "@jini-ai/core";
import { approvalToolHandler, notConfirmedResult } from "../../contracts/core/human-confirm.js";
import { previewAgentPluginEnableAccess } from "./enable-access.js";
import { recordAgentPluginAccessDeclined } from "./apply-connect-defaults.js";
import type { UUID } from "@jini-ai/core/primitives";
import { requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import { ToolInputError, redactSecrets, type ToolExecutionOptions, type ToolExecutionContext } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { resolveExternalMcpOAuthStatus } from "../../contracts/core/external-mcp-auth.js";
import type { ExternalMcpServerRecord } from "../external-mcp/contracts.js";
import { externalMcpRecordHasStaticAccessToken } from "../../contracts/core/external-mcp-auth.js";

import { chooseApiConnectionDestination } from './connect-destination.js';
import { waitAtAgentPluginSignInCard } from "./connect-sign-in-wait.js";
import { deriveAgentPluginConnectionId, provisionAgentPluginMcpServers } from "./federate-mcp.js";
import { readInstalledMcpServers } from "./capability-projection.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./lifecycle.js";
import type { AgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./lifecycle.js";
import { isAgentPluginEnabled } from './activation-effects.js';
import type { McpServerConfig, RemoteMcpServerConfig } from "./mcp-metadata.js";
import type { DeclaredApiConnection } from "../api-connections/contribution.js";
import { OAuthError } from "../../platform/oauth/errors.js";

/**
 * @file agent_plugin_connect connects an Agent Plugin's account through
 * one shared host flow, so plugins do not need vendor-specific connect tools.
 *
 * Token-only plugins reuse a stored credential or the injected credential_save token card. The
 * token card owns probing, sealing and cancellation; this module never handles a plaintext token.
 * Explicit OAuth with token fallback retains the OAuth flow below.
 *
 * ## What one OAuth call does
 *
 * Given a `pluginId`, this provisions the plugin's declared OAuth-authenticated MCP server(s) as
 * external-MCP rows (idempotently — `provisionAgentPluginMcpServers`, `federate-mcp.ts`), starts an
 * authorization for whichever of them are not yet connected, shows a card with a sign-in link, and
 * PARKS the call — polling the row for `oauth.status === "connected"` — until either the human
 * finishes signing in, skips the card, or a bounded wait elapses. Skip releases only this sign-in
 * wait so the assistant can continue the turn. It never returns a token, a URL, or a row id in its
 * own result: only `{ status: "connected" }` or the resumable `{ status: "waiting-for-sign-in" }`
 * (the plan's skill calls this again on "done" rather than looping on its own). A plugin-declared API
 * connection's result also carries its opaque `connectionRef`, because that plugin's tools take it as
 * input and chat has no other way to learn it; the host refuses it for every other plugin.
 *
 * ## Why polling alongside `exchange.receive()`
 *
 * The sign-in itself finishes on the PUBLIC OAuth callback route, not by the human clicking anything
 * inside this card (`external-mcp-oauth.ts`'s `completeAuthorizationCallback`) — the card's one
 * sign-in element is an outbound `openLink`, which (per `@jini-ai/ui`'s `outcome.ts` surface) is
 * not a delivery through `mcp-ui-tool-calls-route.ts` at all. So there is nothing for this call to
 * `receive()` to finish sign-in: that now observes Skip, while the callback is observed by reading the row this call already
 * provisioned, which is exactly what `resolveExternalMcpOAuthStatus` (`features/external-mcp/external-mcp-store.ts`)
 * is for.
 *
 * ## Deliberately narrow: one pending OAuth server per call
 *
 * A plugin declaring more than one OAuth-authenticated server that is not yet connected is refused
 * with a plain `ToolInputError` naming the servers, rather than building a card with several sign-in
 * links. No bundled plugin does this today (Supabase and Higgsfield each declare exactly one), and a
 * multi-link card is a real design question (which one is "the" sign-in?) worth deferring to an
 * actual second case rather than guessing at one now.
 */

export const AGENT_PLUGIN_CONNECT_TOOL_ID = "agent_plugin_connect";

/** Mirrors `features/external-mcp/agent-tools.ts`'s `EXTERNAL_MCP_MANAGE_PERMISSION` verbatim.
 *  Restated rather than imported, per this codebase's "duplicate the tiny constant" convention
 *  (see e.g. `features/external-mcp/tool-registrations.ts`'s own header) — connecting a plugin's
 *  account is, mechanically, exactly the external-MCP write that permission already gates. */
const AGENT_PLUGIN_CONNECT_PERMISSION = "admin.integrations.manage";

const DEFAULT_POLL_INTERVAL_MS = 3000;
/** Matches `@jini-ai/daemon/surface-exchanges`'s `DEFAULT_SURFACE_IDLE_TTL_MS` — the same
 *  "long enough to read a card and go sign in, short enough not to hold a subprocess open forever"
 *  budget. The connection watcher and the card exchange have separate owners; neither may keep
 *  the call parked beyond its own deadline. */
const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

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

/** One installed plugin's declared MCP servers — the slice `agent_plugin_connect` needs. Kept
 *  narrower than `InstalledAgentPlugin` (no version/keywords/skills: this tool cares only about
 *  what it can connect). */
export interface ResolvedAgentPluginForConnect {
  readonly credentialCards?: readonly PluginCredentialCard[];
  readonly servers: Readonly<Record<string, McpServerConfig>>;
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
  return pluginId
    .split(/[-_]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Only a remote server can carry `tovuAuthMode` (`manifest.ts`); a stdio entry never needs a sign-in. */
function isOAuthServer(config: McpServerConfig): config is RemoteMcpServerConfig {
  return config.type !== "stdio" && config.tovuAuthMode === "oauth";
}

/**
 * Starts the sign-in and returns the link the card shows.
 *
 * @throws {ToolInputError} The OAuth service refused the request, or OAuth discovery/registration failed,
 *   with the no-card note the model must relay.
 * @throws {Error} A `device_code` grant: the card has no place for the user code, and nothing in this
 *   call polls `pollDeviceAuthorization`, so the row would never flip to connected. Provisioned rows
 *   always use `authorization_code` (`federate-mcp.ts`), so this is a fail-loud guard.
 */
async function beginSignIn(
  { oauth, serverId, derivedPublicOrigin }: { oauth: AgentPluginOAuthPort; serverId: string; derivedPublicOrigin?: string },
  _options = {},
): Promise<string> {
  let start;
  try {
    start = await oauth.beginConnect({ serverId, redirectUri: resolveConnectRedirectUri(serverId, derivedPublicOrigin), delivery: 'hosted' });
  } catch (err) {
    // Discovery runs before rendering. A failed start must not leave chat promising a missing card.
    if (!oauth.isValidationError({ error: err }) && !(err instanceof OAuthError)) throw err;
    throw new ToolInputError({ message: `${(err as Error).message}. Sign-in could not start; no sign-in card was opened. Use the plugin's secure key card with credential_save if it offers one. Do not ask the person to restart Tovu.` });
  }
  if (start.kind !== "redirect_required") {
    throw new Error(`agent_plugin_connect: '${start.kind}' sign-in is not supported by the connect card yet.`);
  }
  return start.authorizationUrl;
}

function sleepOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
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
  readonly mcp: Pick<AgentPluginMcpPort, "repo" | "saveServer" | "applyAccess"> & Partial<Pick<AgentPluginMcpPort, "notifyRosterChanged">>;
  readonly externalMcpOAuth?: AgentPluginOAuthPort;
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
export const agentPluginConnectAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: AGENT_PLUGIN_CONNECT_TOOL_ID,
    description: AGENT_PLUGIN_CONNECT_DESCRIPTION,
    sideEffects: "mutates-durable-state",
    authorization: { permission: AGENT_PLUGIN_CONNECT_PERMISSION },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pluginId"],
      properties: {
        pluginId: {
          type: "string",
          minLength: 1,
          description: "An installed Agent Plugin's id, e.g. from search_agent_plugin_local.",
        },
      },
    },
  },
];

export const agentPluginConnectDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  [AGENT_PLUGIN_CONNECT_TOOL_ID, "mutates-durable-state"],
]);

/** One declared OAuth server this call still needs to connect. */
interface PendingOAuthServer {
  readonly serverKey: string;
  readonly connectionId: string;
}

/** Whether a plugin's row already holds a credential: a finished sign-in, or a saved access token
 *  (`static_env` with the token sealed in `sealedOAuth` — what `agent_plugin_set_access_token`, the
 *  old env var's boot import, and create-site onboarding all write; `sealedEnv` is a stdio row's env
 *  block and never holds it). Such a row needs no sign-in, and a token import must never overwrite it. */
export function hasStoredAgentPluginCredential(row: Pick<ExternalMcpServerRecord, "authMode" | "sealedOAuth" | "oauthStatus">): boolean {
  return resolveExternalMcpOAuthStatus(row) === "connected" || externalMcpRecordHasStaticAccessToken(row);
}

/** Resolves which of a plugin's declared OAuth servers still need connecting, after provisioning
 *  every one of them as an external-MCP row (idempotent — a row already `connected` is left alone).
 *  @throws {ToolInputError} A declared OAuth server has no row owned by this plugin after provisioning (provisioning
 *    skipped or failed it — e.g. a legacy `sse` transport): there is nothing to sign in to. */
async function resolvePendingOAuthServers(
  routeDeps: AgentPluginConnectToolDeps,
  pluginId: string,
  oauthServerKeys: readonly string[],
): Promise<readonly PendingOAuthServer[]> {
  const pending: PendingOAuthServer[] = [];
  for (const serverKey of oauthServerKeys) {
    const connectionId = deriveAgentPluginConnectionId(serverKey);
    const row = connectionId
      ? await routeDeps.mcp.repo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: connectionId })
      : null;
    if (!connectionId || !row || row.provisionedByPluginId !== pluginId) {
      throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.` });
    }
    // A saved access token counts too: starting a sign-in here would switch the row back to OAuth.
    if (hasStoredAgentPluginCredential(row)) continue;
    pending.push({ serverKey, connectionId });
  }
  return pending;
}

/** The injected adapter calls the existing token-card lifecycle without a runtime import cycle. */
export type AgentPluginConnectOptions = ToolExecutionOptions & {
  readonly saveToken?: (
    input: { readonly ctx: ToolExecutionContext; readonly pluginId: string },
    optional?: ToolExecutionOptions,
  ) => Promise<
    | { readonly saved: true; readonly next: string }
    | { readonly saved: false; readonly reason: string; readonly message?: string }
  >;
};

export interface AgentPluginConnectResult {
  readonly status: "connected" | "waiting-for-sign-in" | "not-connected";
  readonly cancelled?: boolean;
  readonly note?: string;
  readonly connectionRef?: string;
  readonly reason?: string;
  readonly message?: string;
  readonly next?: string;
}

/** A stored credential is reusable only on the same plugin-owned endpoint. No I/O or mutation.
 * @complexity O(1) time and space. */
function hasReusablePluginCredential(
  { row, pluginId, url }: { row: ExternalMcpServerRecord | null; pluginId: string; url: string },
  _optional = {},
): boolean {
  if (!row) return false;
  const reusableOwner = row.provisionedByPluginId === null || row.provisionedByPluginId === pluginId;
  return reusableOwner && row.url === url && hasStoredAgentPluginCredential(row);
}

/** Connect a token-only declaration through the existing card, or retain the API-connection path.
 * @returns Connected only for an existing credential or a successful save; preserves card failures.
 * @throws {ToolInputError} Ambiguous token servers, invalid server id, or a missing save adapter.
 * @complexity O(s) time/space in declared servers, one row read, then the card's bounded exchange. */
async function connectWithoutOAuth(
  { routeDeps, surfaces, ctx, pluginId, servers }: {
    routeDeps: AgentPluginConnectToolDeps; surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext;
    pluginId: string; servers: Readonly<Record<string, McpServerConfig>>;
  },
  { saveToken, ...optional }: AgentPluginConnectOptions = {},
): Promise<AgentPluginConnectResult> {
  const tokens = Object.entries(servers).filter((entry): entry is [string, RemoteMcpServerConfig] =>
    entry[1].type !== "stdio" && entry[1].tovuTokenAuth !== undefined);
  if (tokens.length === 0) return connectDeclaredApiConnectionOrRefuse(routeDeps, surfaces, ctx, pluginId, optional);
  if (tokens.length > 1) throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares more than one access-token sign-in.` });
  const [serverKey, config] = tokens[0]!;
  const serverId = deriveAgentPluginConnectionId(serverKey);
  if (!serverId) throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.` });
  ctx.signal.throwIfAborted();
  const row = await routeDeps.mcp.repo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId });
  ctx.signal.throwIfAborted();
  if (hasReusablePluginCredential({ row, pluginId, url: config.url })) {
    const approved = await approveSignedInAccess({ routeDeps, surfaces, ctx, pluginId, servers: { [serverKey]: config } }, optional);
    if (!approved.approved) return approved.result;
    await provisionAgentPluginMcpServers(routeDeps.mcp, { workspaceId: routeDeps.workspaceId, pluginId, servers: { [serverKey]: config }, principalId: ctx.principal.id });
    return { status: 'connected' };
  }
  if (!saveToken) throw new ToolInputError({ message: `agent_plugin_connect: use the plugin's secure key card with credential_save; no token-card adapter is wired here.` });
  const result = await saveToken({ ctx, pluginId }, optional);
  if (result.saved) return { status: "connected", next: result.next };
  return { status: "not-connected", reason: result.reason, ...(result.message ? { message: result.message } : {}) };
}

/** Deny before reading an off plugin's connection instructions or starting a sign-in.
 * @throws ToolInputError naming the existing approval flow when activation is off/unverifiable.
 * @complexity One activation-owner read, no connection reads or writes.
 */
async function assertPluginCanConnect({ routeDeps, pluginId }: { routeDeps: AgentPluginConnectToolDeps; pluginId: string }, _options = {}): Promise<void> {
  const active = routeDeps.isPluginEnabled ? await routeDeps.isPluginEnabled(pluginId)
    : await isAgentPluginEnabled({ workspaceRoot: routeDeps.agentPluginLayout.forWorkspace(routeDeps.workspaceId).root, pluginId });
  if (!active) throw new ToolInputError({ message: `The '${pluginId}' plugin is off or its activation could not be checked. Ask to turn it on with plugins_set_enabled({family:"agent-plugin",pluginId:${JSON.stringify(pluginId)},enabled:true}), then retry agent_plugin_connect.` });
}

/**
 * Runs `agent_plugin_connect`: permission, resolve, then the declared token, OAuth or API flow.
 * @example runAgentPluginConnect({ routeDeps, surfaces, ctx, pluginId }, { saveToken });
 *
 * @returns Safe connection status; token-card failure reasons remain observable.
 * @throws {import("@jini-ai/core").ToolInputError} An unknown `pluginId`, unsupported connection,
 *   ambiguous token servers or more than one still-unconnected OAuth server (see the header).
 * @throws {Error} No `externalMcpOAuth` was wired, or this execution context has no `emitSurface` —
 *   both composition-root/transport gaps, not caller input.
 * @complexity O(s) provisioning the plugin's declared servers, plus the poll loop (bounded by
 *   `waitTimeoutMs`); O(s) space for pending declarations.
 */
export async function runAgentPluginConnect(
  { routeDeps, surfaces, ctx, pluginId }: {
    routeDeps: AgentPluginConnectToolDeps; surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext; pluginId: string;
  },
  optional: AgentPluginConnectOptions = {},
): Promise<AgentPluginConnectResult> {
  ctx = { ...ctx, principal: { ...ctx.principal }, run: { ...ctx.run }, input: structuredClone(ctx.input) };
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: AGENT_PLUGIN_CONNECT_PERMISSION }, { entityType: "agent-plugin", entityId: pluginId });

  await assertPluginCanConnect({ routeDeps, pluginId });

  const resolvePlugin = routeDeps.resolveInstalledPlugin ?? ((id: string) => defaultResolveInstalledAgentPlugin({ workspaceId: routeDeps.workspaceId, pluginId: id, agentPluginLayout: routeDeps.agentPluginLayout }));
  const plugin = await resolvePlugin(pluginId);
  if (!plugin) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' is not an installed Agent Plugin in this workspace.` });
  }

  const oauthServerKeys = Object.entries(plugin.servers)
    .filter(([, config]) => isOAuthServer(config))
    .map(([serverKey]) => serverKey);
  if (oauthServerKeys.length === 0) return connectWithoutOAuth({ routeDeps, surfaces, ctx, pluginId, servers: plugin.servers }, optional);
  if (!routeDeps.externalMcpOAuth) {
    throw new Error("agent_plugin_connect: no OAuth service is wired for this composition root — nothing can be connected here.");
  }
  const externalMcpOAuth = routeDeps.externalMcpOAuth;

  // A retained session may need new access, but declining that card must not provision other
  // sources or adopt an operator's independently configured credential-bearing connection.
  const signedIn = await retainedOAuthServers({ routeDeps, servers: plugin.servers, oauthServerKeys });
  const access = await approveSignedInAccess({ routeDeps, surfaces, ctx, pluginId, servers: signedIn }, optional);
  if (!access.approved) return access.result;

  const provisioned = await provisionAgentPluginMcpServers(
    routeDeps.mcp,
    { workspaceId: routeDeps.workspaceId, pluginId, servers: plugin.servers, principalId: ctx.principal.id },
  );

  // A colliding row can survive a refused provisioning attempt; never start sign-in on it.
  const refusal = [...provisioned.failed, ...provisioned.skipped]
    .find(result => oauthServerKeys.includes(result.serverKey));
  if (refusal) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}''s '${refusal.serverKey}' connection could not be set up in this Tovu version.` });
  }
  const pending = await resolvePendingOAuthServers(routeDeps, pluginId, oauthServerKeys);
  const [server] = pending;
  // Every declared OAuth server is already connected: no sign-in to start.
  if (!server) return { status: "connected" };
  if (pending.length > 1) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares ${pending.length} unconnected OAuth servers (${pending.map((p) => p.serverKey).join(", ")}) — connect them one at a time.` });
  }

  const credentialCard = await findPluginOAuthCard(routeDeps, pluginId);
  return connectAndReviewMcp({ routeDeps, surfaces, ctx, pluginId, server, externalMcpOAuth, credentialCard, servers: plugin.servers }, optional);
}

/** Complete sign-in before reviewing defaults still missing from a prior access choice.
 * @complexity The existing bounded sign-in wait, then two source previews and conditional writes. */
async function connectAndReviewMcp(
  input: Parameters<typeof waitAtMcpSignInCard>[0] & { servers: Readonly<Record<string, McpServerConfig>> },
  optional: ToolExecutionOptions = {},
): Promise<AgentPluginConnectResult> {
  const result = await waitAtMcpSignInCard(input, optional);
  if (result.status !== 'connected') return result;
  const { routeDeps, surfaces, ctx, pluginId, server, servers } = input;
  const reviewed = await approveSignedInAccess({ routeDeps, surfaces, ctx, pluginId,
    servers: { [server.serverKey]: servers[server.serverKey]! } }, optional);
  if (reviewed.approved) return result;
  const reviewEnd = reviewed.result.reason === 'expired' ? 'expired' : 'ended with the run';
  const lifecycle = reviewed.result.reason
    ? ` The access review ${reviewEnd}. Do not retry or reopen it automatically. Wait for a new explicit request.` : '';
  return { ...reviewed.result, note: `Your sign-in was saved. No additional tool access was granted.${lifecycle}` };
}

/** Inspect retained sign-ins before any provisioning; the access preview checks source ownership. */
async function retainedOAuthServers({ routeDeps, servers, oauthServerKeys }: {
  routeDeps: AgentPluginConnectToolDeps; servers: Readonly<Record<string, McpServerConfig>>; oauthServerKeys: readonly string[];
}, _optional = {}): Promise<Readonly<Record<string, McpServerConfig>>> {
  const retained: Record<string, McpServerConfig> = {};
  for (const key of oauthServerKeys) {
    const connectionId = deriveAgentPluginConnectionId(key);
    const row = connectionId ? await routeDeps.mcp.repo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: connectionId }) : null;
    if (row && hasStoredAgentPluginCredential(row)) retained[key] = servers[key]!;
  }
  return retained;
}

/** A retained credential proves sign-in, never consent to new tool or write grants.
 * The common card fixes the exact sources; the existing grant writer applies those snapshots.
 * @complexity Two previews over the signed-in sources plus one conditional write per changed row. */
async function approveSignedInAccess({ routeDeps, surfaces, ctx, pluginId, servers }: {
  routeDeps: AgentPluginConnectToolDeps; surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext;
  pluginId: string; servers: Readonly<Record<string, McpServerConfig>>;
}, optional: ToolExecutionOptions = {}): Promise<{ approved: true } | { approved: false; result: AgentPluginConnectResult }> {
  const preview = () => previewAgentPluginEnableAccess({ workspaceId: routeDeps.workspaceId, pluginId, servers, repo: routeDeps.mcp.repo });
  const handler = approvalToolHandler({ surfaces,
    prepare: preview,
    describe: ({ ctx: bound, prepared }) => ({ toolId: AGENT_PLUGIN_CONNECT_TOOL_ID, errorCode: 'AGENT_PLUGIN', title: `Allow access for ${pluginId}?`,
      ...(prepared.resources.length ? { access: { resources: prepared.resources.map(resource => ({ ...resource, scope: { personId: bound.principal.id, siteId: routeDeps.workspaceId } })) } } : {}),
      details: [], description: 'Your existing sign-in is reused. Only the listed access is turned on.', confirmLabel: 'Allow access' }),
    run: async ({ ctx: bound, prepared }) => {
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: bound.principal.id, permission: AGENT_PLUGIN_CONNECT_PERMISSION }, { entityType: 'agent-plugin', entityId: pluginId });
      await assertPluginCanConnect({ routeDeps, pluginId });
      const current = await currentSignedInAccess({ routeDeps, pluginId, servers });
      if (current.preview.key !== prepared.key) throw new ToolInputError({ message: 'The plugin access changed while this card was open. Request the access change again. Nothing was granted.' });
      const granted: string[] = [];
      try {
        for (const source of prepared.snapshots) {
          if (!source.grant || !source.expected) continue;
          if (bound.signal.aborted) throw new ToolInputError({ message: 'The run ended. Other connections were not changed.' });
          await routeDeps.mcp.applyAccess({
            workspaceId: routeDeps.workspaceId, serverId: source.connectionId, expected: source.expected,
            access: { enabled: source.grant.enabled, allowedToolNames: source.grant.allow, writeAllowedToolNames: source.grant.write }, principalId: bound.principal.id });
          granted.push(source.connectionId);
        }
        await routeDeps.mcp.notifyRosterChanged?.({}, {});
      } catch (error) {
        if (granted.length === 0) throw error;
        const detail = redactSecrets({ input: String(error) }).replace('Nothing was changed by this approval.', 'That connection was left unchanged.');
        throw new ToolInputError({ message: `Access was saved for ${granted.join(', ')}. The remaining access update did not finish. ${detail} Ask to connect the plugin again to finish.` });
      }
      return { approved: true };
    },
  }, { ask: ({ prepared }) => prepared.resources.length > 0, declined: async ({ reason, prepared }) => {
    if (reason === 'declined' && prepared) await recordAgentPluginAccessDeclined({ applyAccess: routeDeps.mcp.applyAccess, workspaceId: routeDeps.workspaceId, accessKey: prepared.key });
    return { approved: false, result: { status: 'not-connected', ...notConfirmedResult({ confirmed: false, reason }) } };
  } });
  return await handler(ctx, optional) as { approved: true } | { approved: false; result: AgentPluginConnectResult };
}

/** Re-resolve the installed declarations: a closed-over manifest is not a fresh approval check. */
async function currentSignedInAccess({ routeDeps, pluginId, servers }: {
  routeDeps: AgentPluginConnectToolDeps; pluginId: string; servers: Readonly<Record<string, McpServerConfig>>;
}, _optional = {}) {
  const installed = await (routeDeps.resolveInstalledPlugin?.(pluginId) ?? defaultResolveInstalledAgentPlugin({ workspaceId: routeDeps.workspaceId, pluginId, agentPluginLayout: routeDeps.agentPluginLayout }));
  const current: Record<string, McpServerConfig> = {};
  for (const key of Object.keys(servers)) {
    const config = installed?.servers[key];
    if (!config) throw new ToolInputError({ message: `The '${pluginId}' connection declaration changed after approval. Request the access change again. Nothing was granted.` });
    current[key] = config;
  }
  return { servers: current, preview: await previewAgentPluginEnableAccess({ workspaceId: routeDeps.workspaceId, pluginId, servers: current, repo: routeDeps.mcp.repo }) };
}

/** Show one MCP sign-in and always release its surface exchange after the bounded wait. */
async function waitAtMcpSignInCard(
  input: {
    readonly routeDeps: AgentPluginConnectToolDeps;
    readonly surfaces: AssistantSurfaceDeps;
    readonly ctx: ToolExecutionContext;
    readonly pluginId: string;
    readonly server: PendingOAuthServer;
    readonly externalMcpOAuth: AgentPluginOAuthPort;
    readonly credentialCard?: PluginCredentialCard;
  },
  optional: ToolExecutionOptions = {},
): Promise<AgentPluginConnectResult> {
  const { routeDeps, surfaces, ctx, pluginId, server, externalMcpOAuth, credentialCard } = input;
  if (!optional.emitSurface) {
    throw new Error("agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.");
  }
  const signInUrl = await beginSignIn({ oauth: externalMcpOAuth, serverId: server.connectionId, derivedPublicOrigin: routeDeps.derivedPublicOrigin });
  return waitAtAgentPluginSignInCard({ surfaces, ctx, pluginId, pluginDisplayName: titleCaseFromPluginId(pluginId), credentialCard,
    connect: async ({ signal, showSignIn }) => {
      await showSignIn({ signInUrl });
      const connected = await waitForMcpConnection({ routeDeps, ctx: { ...ctx, signal }, server });
      return { status: connected ? "connected" : "waiting-for-sign-in" };
    },
  }, optional);
}

/** Observe the MCP row until callback completion, timeout or cancellation. */
async function waitForMcpConnection(
  input: {
    readonly routeDeps: AgentPluginConnectToolDeps;
    readonly ctx: ToolExecutionContext;
    readonly server: PendingOAuthServer;
  },
  _options = {},
): Promise<boolean> {
  const { routeDeps, ctx, server } = input;
  const pollIntervalMs = routeDeps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const waitTimeoutMs = routeDeps.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + waitTimeoutMs;
  while (Date.now() < deadline && !ctx.signal.aborted) {
    const row = await routeDeps.mcp.repo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: server.connectionId });
    if (row && resolveExternalMcpOAuthStatus(row) === "connected") {
      return true;
    }
    await sleepOrAbort(Math.min(pollIntervalMs, Math.max(deadline - Date.now(), 0)), ctx.signal);
  }
  return false;
}

/**
 * The API-connection branch (or the original "nothing to connect" refusal): same card and parked wait as the MCP
 * branch, plus the opaque `connectionRef` the plugin's tools take, over Jini's api-connections lifecycle instead of an external-MCP row. One declared
 * connection per call, for the same reason the MCP branch takes one pending server.
 * @throws {ToolInputError} More than one declared connection, or a sign-in refusal (safe message).
 * @throws {Error} No interactive channel to show the sign-in card on.
 * @complexity One sign-in round trip bounded by `waitTimeoutMs`.
 */
/** The plugin's own `oauth` card copy for its sign-in card, shared by the MCP and API-connection branches. O(cards). */
async function findPluginOAuthCard(routeDeps: AgentPluginConnectToolDeps, pluginId: string): Promise<PluginCredentialCard | undefined> {
  const cards = await routeDeps.credentials.loadSafe({ workspaceId: routeDeps.workspaceId });
  return cards.find(card => card.pluginId === pluginId && card.saveKind === "oauth");
}

async function connectDeclaredApiConnectionOrRefuse(
  routeDeps: AgentPluginConnectToolDeps,
  surfaces: AssistantSurfaceDeps,
  ctx: ToolExecutionContext,
  pluginId: string,
  optional: ToolExecutionOptions,
): Promise<AgentPluginConnectResult> {
  const apiConnections = routeDeps.apiConnections;
  const declared: readonly DeclaredApiConnection[] = apiConnections ? await apiConnections.listConnections({ pluginId }) : [];
  const [connection] = declared;
  if (!apiConnections || !connection) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares no OAuth-authenticated MCP server to connect.` });
  }
  if (declared.length > 1) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares ${declared.length} API connections — this Tovu version connects one per plugin.` });
  }
  const destination = await chooseApiConnectionDestination({ surfaces, ctx, pluginDisplayName: titleCaseFromPluginId(pluginId),
    available: apiConnections.sharingAvailable === true && ctx.principal.id === await routeDeps.ownerPrincipalId }, optional);
  if (destination === null) return { status: 'not-connected', reason: 'cancelled', next: 'Sign-in was cancelled. Continue without this connection.' };
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: 'system.write' });
  const credentialCard = await findPluginOAuthCard(routeDeps, pluginId);
  return waitAtAgentPluginSignInCard({ surfaces, ctx, pluginId, pluginDisplayName: titleCaseFromPluginId(pluginId), credentialCard,
    connect: ({ signal, showSignIn }) => apiConnections.connect({
      destination, connection, actorId: ctx.principal.id, signal, showSignIn,
      pollIntervalMs: routeDeps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      waitTimeoutMs: routeDeps.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
    }),
  }, optional);
}
