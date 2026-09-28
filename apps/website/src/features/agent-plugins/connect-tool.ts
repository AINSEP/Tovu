import {
  requireToolPermission,
  type AgentToolSideEffect,
  type AuthorizeFn,
  type ClockPort,
  type DerivedRiskByToolId,
  type UUID,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import type { AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import {
  ExternalMcpValidationError,
  resolveExternalMcpOAuthStatus,
  type ExternalMcpOAuthService,
  type ExternalMcpServerRepoPort,
} from "#src/assistant/index";

import { buildAgentPluginConnectCard } from "./connect-card-ui.js";
import { deriveAgentPluginConnectionId, provisionAgentPluginMcpServers } from "./federate-mcp.js";
import { readInstalledMcpServers } from "./capability-projection.js";
import { preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./bundled-digests.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";
import type { McpServerConfig, RemoteMcpServerConfig } from "./manifest.js";

/**
 * @file `agent_plugin_connect` — G1 of the 2026-09-27 Supabase-agent-plugin v2 plan
 * (`ADS-memory/reports/2026-09-27-supabase-agent-plugin-plan-v2.md`, section 3): a GENERIC "connect
 * this plugin's account" tool any OAuth-authenticated Agent Plugin can use, so no plugin needs its
 * own bespoke connect tool the way `features/supabase-connect/` did (removed in a later slice, R2).
 *
 * ## What one call does
 *
 * Given a `pluginId`, this provisions the plugin's declared OAuth-authenticated MCP server(s) as
 * external-MCP rows (idempotently — `provisionAgentPluginMcpServers`, `federate-mcp.ts`), starts an
 * authorization for whichever of them are not yet connected, shows a card with a sign-in link, and
 * PARKS the call — polling the row for `oauth.status === "connected"` — until either the human
 * finishes signing in or a bounded wait elapses. It never returns a token, a URL, or a row id in its
 * own result: only `{ status: "connected" }` or the resumable `{ status: "waiting-for-sign-in" }`
 * (the plan's skill calls this again on "done" rather than looping on its own).
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
/** Matches `contracts/core/tool-surface-exchanges.ts`'s `DEFAULT_SURFACE_IDLE_TTL_MS` — the same
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
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}

/** The real, on-disk resolution — the SAME walk `federate-mcp.ts`'s `resolveAgentPluginMcpServers`
 *  performs, restated here rather than imported so this tool does not need to import a second
 *  plugin's worth of exports just to reach the one function; both read `mcp.json` off the winning
 *  (bundled-preferred) installed digest for a pluginId. Returns `null` for a pluginId not installed
 *  in this workspace. */
async function defaultResolveInstalledAgentPlugin(workspaceId: string, pluginId: string): Promise<ResolvedAgentPluginForConnect | null> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(workspaceId);
  const installed = preferBundledAgentPluginDigests(
    await listInstalledPlugins(workspaceLayout.packages),
    await readBundledAgentPluginDigests(workspaceLayout.root),
  );
  const plugin = installed.find((candidate) => candidate.pluginId === pluginId);
  if (!plugin) return null;
  return { servers: await readInstalledMcpServers(plugin.packageRoot) };
}

/** "supabase" -> "Supabase", "higgsfield-media" -> "Higgsfield Media". There is no separate
 *  display-name field in `plugin.json` (agent-plugins.org has none) — `uninstall-confirmation-ui.ts`'s
 *  own dialog makes the identical choice, naming the plugin by its id. */
function titleCaseFromPluginId(pluginId: string): string {
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
 * @throws {ToolInputError} The OAuth service refused the request as invalid input.
 * @throws {Error} A `device_code` grant: the card has no place for the user code, and nothing in this
 *   call polls `pollDeviceAuthorization`, so the row would never flip to connected. Provisioned rows
 *   always use `authorization_code` (`federate-mcp.ts`), so this is a fail-loud guard.
 */
async function beginSignIn(oauth: ExternalMcpOAuthService, serverId: string, derivedPublicOrigin: string | undefined): Promise<string> {
  let start;
  try {
    start = await oauth.beginConnect({ serverId, redirectUri: resolveConnectRedirectUri(serverId, derivedPublicOrigin) });
  } catch (err) {
    throw err instanceof ExternalMcpValidationError ? new ToolInputError(err.message) : err;
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
}

const AGENT_PLUGIN_CONNECT_DESCRIPTION = [
  "Connects an installed Agent Plugin's account by walking the human through its sign-in, then waits until it is done.",
  "Call this once you know which plugin needs connecting (e.g. from search_agent_plugin_local, whose result names an " +
    "OAuth-authenticated MCP server that is not yet connected) — it needs no prior setup, this provisions the connection " +
    "itself the first time it is called for a given plugin.",
  "Shows the human a card with a sign-in link and parks until they finish. Returns { status: 'connected' } once the " +
    "sign-in completes, or { status: 'waiting-for-sign-in' } if nobody finished within a few minutes — call this again " +
    "with the same pluginId once the human says they're back; never loop on your own.",
  "Never returns a token, a URL, or any row id — only a status. Refused with a plain error if the plugin declares no " +
    "OAuth-authenticated MCP server, or if it declares more than one still-unconnected one (connect those one at a time).",
].join(" ");

/** This tool's one-entry catalog, exported so `assistant/__tests__/tool-registrations.contracts.test.ts`'s
 *  `CATALOGS_BY_DOMAIN` can import it the same way it imports every sibling domain's catalog. */
export const agentPluginConnectAgentToolCatalog: WirableToolDefinition[] = [
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

/** Resolves which of a plugin's declared OAuth servers still need connecting, after provisioning
 *  every one of them as an external-MCP row (idempotent — a row already `connected` is left alone).
 *  @throws {ToolInputError} A declared OAuth server has no row after provisioning (provisioning
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
    if (!connectionId || !row) {
      throw new ToolInputError(`agent_plugin_connect: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.`);
    }
    if (resolveExternalMcpOAuthStatus(row) === "connected") continue;
    pending.push({ serverKey, connectionId });
  }
  return pending;
}

/**
 * Runs `agent_plugin_connect` end to end: permission, resolve, provision, begin, card, poll.
 *
 * @throws {import("@jini-ai/core").ToolInputError} An unknown `pluginId`, or one declaring zero or
 *   more than one still-unconnected OAuth server (see this file's own header).
 * @throws {Error} No `externalMcpOAuth` was wired, or this execution context has no `emitSurface` —
 *   both composition-root/transport gaps, not caller input.
 * @complexity O(s) provisioning the plugin's declared servers, plus the poll loop (bounded by
 *   `waitTimeoutMs`).
 */
export async function runAgentPluginConnect(
  routeDeps: AgentPluginConnectToolDeps,
  surfaces: AssistantSurfaceDeps,
  ctx: ToolExecutionContext,
  pluginId: string,
): Promise<{ readonly status: "connected" | "waiting-for-sign-in" }> {
  await requireToolPermission(routeDeps, {
    principalId: ctx.principal.id,
    permission: AGENT_PLUGIN_CONNECT_PERMISSION,
    entityType: "agent-plugin",
    entityId: pluginId,
  });

  const resolvePlugin = routeDeps.resolveInstalledPlugin ?? ((id: string) => defaultResolveInstalledAgentPlugin(routeDeps.workspaceId, id));
  const plugin = await resolvePlugin(pluginId);
  if (!plugin) {
    throw new ToolInputError(`agent_plugin_connect: '${pluginId}' is not an installed Agent Plugin in this workspace.`);
  }

  const oauthServerKeys = Object.entries(plugin.servers)
    .filter(([, config]) => isOAuthServer(config))
    .map(([serverKey]) => serverKey);
  if (oauthServerKeys.length === 0) {
    throw new ToolInputError(`agent_plugin_connect: '${pluginId}' declares no OAuth-authenticated MCP server to connect.`);
  }
  if (!routeDeps.externalMcpOAuth) {
    throw new Error("agent_plugin_connect: no OAuth service is wired for this composition root — nothing can be connected here.");
  }
  const externalMcpOAuth = routeDeps.externalMcpOAuth;

  await provisionAgentPluginMcpServers(
    { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring, clock: routeDeps.clock },
    { workspaceId: routeDeps.workspaceId, pluginId, servers: plugin.servers, principalId: ctx.principal.id },
  );

  const pending = await resolvePendingOAuthServers(routeDeps, pluginId, oauthServerKeys);
  // Every declared OAuth server is already connected: a legitimate "nothing to do" success.
  if (pending.length === 0) return { status: "connected" };
  if (pending.length > 1) {
    throw new ToolInputError(
      `agent_plugin_connect: '${pluginId}' declares ${pending.length} unconnected OAuth servers (${pending.map((p) => p.serverKey).join(", ")}) — connect them one at a time.`,
    );
  }
  const [server] = pending;

  const emitSurface = ctx.emitSurface;
  if (!emitSurface) {
    throw new Error("agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.");
  }

  const signInUrl = await beginSignIn(externalMcpOAuth, server.connectionId, routeDeps.derivedPublicOrigin);
  const pluginDisplayName = titleCaseFromPluginId(pluginId);

  const exchange = surfaces.surfaceExchanges.open({ toolId: AGENT_PLUGIN_CONNECT_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });

  try {
    await exchange.send({
      channel: "mcp-ui",
      payload: { resource: buildAgentPluginConnectCard({ pluginId, pluginDisplayName, state: "waiting", signInUrl }) },
    });

    const pollIntervalMs = routeDeps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const waitTimeoutMs = routeDeps.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + waitTimeoutMs;
    let connected = false;
    while (Date.now() < deadline && !ctx.signal.aborted) {
      const row = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: server.connectionId });
      if (row && resolveExternalMcpOAuthStatus(row) === "connected") {
        connected = true;
        break;
      }
      await sleepOrAbort(Math.min(pollIntervalMs, Math.max(deadline - Date.now(), 0)), ctx.signal);
    }

    if (connected) {
      try {
        await exchange.send({
          channel: "mcp-ui",
          payload: { resource: buildAgentPluginConnectCard({ pluginId, pluginDisplayName, state: "connected" }) },
        });
      } catch {
        // A human-visible card update failing must never turn a real connection into a tool failure.
      }
    }
    return { status: connected ? "connected" : "waiting-for-sign-in" };
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
    exchange.close();
  }
}
