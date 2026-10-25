import type { PluginCredentialCard } from "../custom-credentials/plugin-credential-card.js";
import { loadPluginCredentialCardsSafely, type LoadPluginCredentialCards } from "../custom-credentials/plugin-credential-card.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { type AgentToolSideEffect, type DerivedRiskByToolId, type AgentToolDefinition } from "@jini-ai/core";
import { type Clock as ClockPort, type UUID } from "@jini-ai/core/primitives";
import { requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionOptions, type ToolExecutionContext } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import {
  ExternalMcpValidationError,
  resolveExternalMcpOAuthStatus,
  type ExternalMcpOAuthService,
  type ExternalMcpServerRecord,
  type ExternalMcpServerRepoPort,
} from "#src/assistant/index";
import { externalMcpRecordHasStaticAccessToken } from "../external-mcp/auth-mode.js";

import { buildAgentPluginConnectCard } from "./connect-card-ui.js";
import { deriveAgentPluginConnectionId, provisionAgentPluginMcpServers } from "./federate-mcp.js";
import { readInstalledMcpServers } from "./capability-projection.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./lifecycle.js";
import type { AgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./lifecycle.js";
import type { McpServerConfig, RemoteMcpServerConfig } from "./mcp-metadata.js";
import { runApiConnectionConnect, type ApiConnectionConnectDeps, type ApiConnectionConnectStatus } from "../api-connections/connect.js";
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
 * finishes signing in or a bounded wait elapses. It never returns a token, a URL, or a row id in its
 * own result: only `{ status: "connected" }` or the resumable `{ status: "waiting-for-sign-in" }`
 * (the plan's skill calls this again on "done" rather than looping on its own). A plugin-declared API
 * connection's result also carries its opaque `connectionRef`, because that plugin's tools take it as
 * input and chat has no other way to learn it; the host refuses it for every other plugin.
 *
 * ## Why polling, not `exchange.receive()`
 *
 * The sign-in itself finishes on the PUBLIC OAuth callback route, not by the human clicking anything
 * inside this card (`external-mcp-oauth.ts`'s `completeAuthorizationCallback`) — the card's one
 * interactive element is an outbound `openLink`, which (per `@jini-ai/ui`'s `outcome.ts` surface) is
 * not a delivery through `mcp-ui-tool-calls-route.ts` at all. So there is nothing for this call to
 * `receive()`: the only way to observe the callback landing is to read the row this call already
 * provisioned, which is exactly what `resolveExternalMcpOAuthStatus` (`assistant/external-mcp-store.ts`)
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
 *  budget, restated here because this call never touches that constant (it does not call
 *  `exchange.receive()`, so the exchange store's own idle timer never fires for it). */
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
async function beginSignIn(oauth: ExternalMcpOAuthService, serverId: string, derivedPublicOrigin: string | undefined): Promise<string> {
  let start;
  try {
    start = await oauth.beginConnect({ serverId, redirectUri: resolveConnectRedirectUri(serverId, derivedPublicOrigin) });
  } catch (err) {
    // Discovery runs before rendering. A failed start must not leave chat promising a missing card.
    if (!(err instanceof ExternalMcpValidationError) && !(err instanceof OAuthError)) throw err;
    throw new ToolInputError({ message: `${err.message}. Sign-in could not start; no sign-in card was opened. Use the plugin's secure key card with credential_save if it offers one. Do not ask the person to restart Tovu.` });
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

/** The exact slice of a composition root's deps this tool reads — structural, matching
 *  `features/external-mcp/deps.ts`'s `ExternalMcpToolDeps` field-for-field on purpose: every real
 *  composition root already provides all of these to wire that domain, so this tool needs no new
 *  wiring anywhere a `RouteDeps`-shaped bag is already assembled. `externalMcpOAuth` is optional for
 *  the identical reason that file gives — checked at the top of the handler, fail-closed. */
export interface AgentPluginConnectToolDeps {
  readonly loadPluginCredentialCards?: LoadPluginCredentialCards;
  readonly agentPluginLayout: AgentPluginLayout;
  readonly workspaceId: UUID;
  readonly authorize: AuthorizeFn;
  readonly clock: ClockPort;
  readonly externalMcpServerRepo: ExternalMcpServerRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly siteAssistantSecretKeyring: KeyringPort;
  readonly externalMcpOAuth?: ExternalMcpOAuthService;
  readonly derivedPublicOrigin?: string;
  /** Injectable for tests; a real composition root omits both and gets the production cadence. */
  readonly pollIntervalMs?: number;
  readonly waitTimeoutMs?: number;
  /** Injectable for tests, so a fixture plugin needs no real install on disk. A real composition
   *  root omits this and gets {@link defaultResolveInstalledAgentPlugin}. */
  readonly resolveInstalledPlugin?: (pluginId: string) => Promise<ResolvedAgentPluginForConnect | null>;
  /** Plugin-declared OAuth API connections (`tovu-connections.json`). Absent: only MCP servers connect. */
  readonly apiConnections?: ApiConnectionConnectDeps;
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
      ? await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: connectionId })
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
  return row !== null && row.provisionedByPluginId === pluginId && row.url === url && hasStoredAgentPluginCredential(row);
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
  const row = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId });
  ctx.signal.throwIfAborted();
  if (hasReusablePluginCredential({ row, pluginId, url: config.url })) return { status: "connected" };
  if (!saveToken) throw new ToolInputError({ message: `agent_plugin_connect: use the plugin's secure key card with credential_save; no token-card adapter is wired here.` });
  const result = await saveToken({ ctx, pluginId }, optional);
  if (result.saved) return { status: "connected", next: result.next };
  return { status: "not-connected", reason: result.reason, ...(result.message ? { message: result.message } : {}) };
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
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: AGENT_PLUGIN_CONNECT_PERMISSION }, { entityType: "agent-plugin", entityId: pluginId });

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

  const provisioned = await provisionAgentPluginMcpServers(
    { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring, clock: routeDeps.clock },
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
  // Every declared OAuth server is already connected: a legitimate "nothing to do" success.
  if (!server) return { status: "connected" };
  if (pending.length > 1) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares ${pending.length} unconnected OAuth servers (${pending.map((p) => p.serverKey).join(", ")}) — connect them one at a time.` });
  }

  const credentialCard = await findPluginOAuthCard(routeDeps, pluginId);
  return waitAtMcpSignInCard({ routeDeps, surfaces, ctx, pluginId, server, externalMcpOAuth, credentialCard }, optional);
}

/** Show one MCP sign-in and always release its surface exchange after the bounded wait. */
async function waitAtMcpSignInCard(
  input: {
    readonly routeDeps: AgentPluginConnectToolDeps;
    readonly surfaces: AssistantSurfaceDeps;
    readonly ctx: ToolExecutionContext;
    readonly pluginId: string;
    readonly server: PendingOAuthServer;
    readonly externalMcpOAuth: ExternalMcpOAuthService;
    readonly credentialCard?: PluginCredentialCard;
  },
  optional: ToolExecutionOptions = {},
): Promise<{ readonly status: "connected" | "waiting-for-sign-in" }> {
  const { routeDeps, surfaces, ctx, pluginId, server, externalMcpOAuth, credentialCard } = input;
  const emitSurface = optional.emitSurface;
  if (!emitSurface) {
    throw new Error("agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.");
  }

  const signInUrl = await beginSignIn(externalMcpOAuth, server.connectionId, routeDeps.derivedPublicOrigin);
  const pluginDisplayName = titleCaseFromPluginId(pluginId);

  const exchange = surfaces.surfaceExchanges.open({ binding: { toolId: AGENT_PLUGIN_CONNECT_TOOL_ID, principalId: ctx.principal.id }, emit: emitSurface });
  const closeOnAbort = () => exchange.close({});
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });

  try {
    await exchange.send({ emission: {
      channel: "mcp-ui",
      payload: { resource: buildAgentPluginConnectCard({ pluginId, pluginDisplayName, state: "waiting", signInUrl, credentialCard }) },
    } });

    const connected = await waitForMcpConnection({ routeDeps, ctx, server });

    if (connected) {
      try {
        await exchange.send({ emission: {
          channel: "mcp-ui",
          payload: { resource: buildAgentPluginConnectCard({ pluginId, pluginDisplayName, state: "connected" }) },
        } });
      } catch {
        // A human-visible card update failing must never turn a real connection into a tool failure.
      }
    }
    return { status: connected ? "connected" : "waiting-for-sign-in" };
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
    exchange.close({});
  }
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
    const row = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: server.connectionId });
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
  const cards = await loadPluginCredentialCardsSafely({ loadCards: routeDeps.loadPluginCredentialCards, workspaceId: routeDeps.workspaceId });
  return cards.find(card => card.pluginId === pluginId && card.saveKind === "oauth");
}

async function connectDeclaredApiConnectionOrRefuse(
  routeDeps: AgentPluginConnectToolDeps,
  surfaces: AssistantSurfaceDeps,
  ctx: ToolExecutionContext,
  pluginId: string,
  optional: ToolExecutionOptions,
): Promise<ApiConnectionConnectStatus> {
  const apiConnections = routeDeps.apiConnections;
  const declared: readonly DeclaredApiConnection[] = apiConnections ? await apiConnections.host.listConnections({ pluginId }) : [];
  const [connection] = declared;
  if (!apiConnections || !connection) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares no OAuth-authenticated MCP server to connect.` });
  }
  if (declared.length > 1) {
    throw new ToolInputError({ message: `agent_plugin_connect: '${pluginId}' declares ${declared.length} API connections — this Tovu version connects one per plugin.` });
  }
  const pluginDisplayName = titleCaseFromPluginId(pluginId);
  const credentialCard = await findPluginOAuthCard(routeDeps, pluginId);
  let exchange: ReturnType<AssistantSurfaceDeps["surfaceExchanges"]["open"]> | undefined;
  const closeOnAbort = () => exchange?.close({});
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    const result = await runApiConnectionConnect({
      deps: apiConnections, connection, actorId: ctx.principal.id, signal: ctx.signal,
      pollIntervalMs: routeDeps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, waitTimeoutMs: routeDeps.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
      showSignIn: async ({ signInUrl }) => {
        const emitSurface = optional.emitSurface;
        if (!emitSurface) throw new Error("agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.");
        exchange = surfaces.surfaceExchanges.open({ binding: { toolId: AGENT_PLUGIN_CONNECT_TOOL_ID, principalId: ctx.principal.id }, emit: emitSurface });
        await exchange.send({ emission: { channel: "mcp-ui", payload: { resource: buildAgentPluginConnectCard({ pluginId, pluginDisplayName, state: "waiting", signInUrl, credentialCard }) } } });
      },
    });
    if (result.status === "connected" && exchange) {
      // A human-visible card update failing must never turn a real connection into a tool failure.
      await exchange.send({ emission: { channel: "mcp-ui", payload: { resource: buildAgentPluginConnectCard({ pluginId, pluginDisplayName, state: "connected" }) } } }).catch(() => undefined);
    }
    return result;
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
    exchange?.close({});
  }
}
