import type { Express } from "express";

import type { AuthorizeFn } from "#src/contracts/core/commands/index";
import type { RouteDeps } from "#src/server/routes/types";
import type { UUID } from "@jini-ai/core/primitives";

/**
 * @file Narrow `RouteDeps` slice for the `agent-plugins` admin HTTP surface (2026-09-09) — mirrors
 * `routes/admin/plugins/deps.ts`'s `PluginsRouteDeps` narrowing pattern.
 *
 * Deliberately smaller than `PluginsRouteDeps`: this domain's read model,
 * `loadAgentPluginSearchCandidates()` (`features/agent-plugins/tool-registrations.ts`, shared with
 * `search_agent_plugin_local`), uses the layout captured at boot with `agentPluginLayout.forWorkspace(...)` — there is no discovery closure, activation
 * repo, or hook-registry callback for these routes to thread through the way the site/runtime
 * plugin family needs. `workspaceId` scopes the read/write and checks the URL param;
 * `agentPluginLayout` binds it to the booted site and `authorize` gates access.
 *
 * `authorize` gates both routes on this family's existing permissions — `admin.plugins.read` for
 * `list.ts` and `admin.plugins.enable` for `set-enabled.ts`, the same pair the `.tovu-plugin`
 * family already uses for the identical two operations. See `list.ts`'s own header for why reusing
 * them rather than minting `admin.agent-plugins.*` is correct.
 *
 * Still no `idGen`/`changeSets`/`outbox` even though `set-enabled.ts` mutates: that mutation is a
 * single atomic JSON-file write with no repo and no entity type, so it is authorized directly
 * instead of being wrapped in `executeCommand`. That route's header states the trade and its
 * consequence for change-set history.
 *
 * `clock`/`externalMcpServerRepo`/`siteAssistantSecretSealer`/`siteAssistantSecretKeyring` were
 * added 2026-09-10, the same four-field slice `routes/external-mcp/deps.ts`'s `ExternalMcpRouteDeps`
 * already carries: `set-enabled.ts` now also calls `features/agent-plugins/federate-mcp.ts`'s
 * `applyAgentPluginMcpFederation`, which needs an `ExternalMcpStoreDeps` to write into the SAME
 * external-MCP store those routes read from. `createAgentPluginsModule` already receives the full
 * `RouteDeps` and passes it straight through, so this widening needs no composition-root change.
 */
export interface AgentPluginsRouteDeps {
  readonly snapshotAgentPluginSettings?: import("@jini-ai/agent-plugins/lifecycle").UpdateAgentPluginRequired["snapshotSettings"];
  readonly pluginHost?: import("#src/contracts/headless/plugin-host").PluginHostPort;
  workspaceId: UUID;
  agentPluginLayout: RouteDeps["agentPluginLayout"];
  authorize: AuthorizeFn;
  clock: RouteDeps["clock"];
  externalMcpServerRepo: RouteDeps["externalMcpServerRepo"];
  siteAssistantSecretSealer: RouteDeps["siteAssistantSecretSealer"];
  siteAssistantSecretKeyring: RouteDeps["siteAssistantSecretKeyring"];
  /** The roster-reload port an update announces through (`RouteDeps.notifyExternalMcpRosterChanged`). */
  readonly notifyExternalMcpRosterChanged?: RouteDeps["notifyExternalMcpRosterChanged"];
  /** The shared lifecycle owner, optionally bound to host effects for this surface. */
  setAgentPluginEnabled?: typeof import("#src/features/agent-plugins/set-enabled").setAgentPluginEnabled;
  /** Admin surfaces (`admin-surfaces.ts`, 2026-10-20): admission and contained reads go through
   *  the lifecycle owner; `adminSurfaceSource` replaces that pair in tests, `adminSurfaceHost`
   *  supplies action handlers and bootstrap data (none by default). */
  agentPluginLifecycle: Pick<RouteDeps["agentPluginLifecycle"], "loadPluginContributions" | "readTrustedPluginFile">;
  readonly adminSurfaceSource?: import("#src/features/agent-plugins/admin-surfaces/surfaces").AdminSurfaceSource;
  readonly adminSurfaceHost?: import("#src/features/agent-plugins/admin-surfaces/surfaces").AdminSurfaceHost;
  /** `agent_plugin_enabled` (consent-gated port; the plugin id only). */
  readonly productAnalytics?: RouteDeps["productAnalytics"];
}

export type AgentPluginsRouteRegistrar = (app: Express, deps: AgentPluginsRouteDeps) => void;
