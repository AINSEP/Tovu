import type { Express } from "express";

import type { AuthorizeFn } from "#src/contracts/core/commands/index";
import type { UUID } from "@jini-ai/cms/core";

/**
 * @file Narrow `RouteDeps` slice for the `agent-plugins` admin HTTP surface (2026-09-09) — mirrors
 * `routes/admin/plugins/deps.ts`'s `PluginsRouteDeps` narrowing pattern.
 *
 * Deliberately smaller than `PluginsRouteDeps`: this domain's read model,
 * `loadAgentPluginSearchCandidates()` (`features/agent-plugins/tool-registrations.ts`, shared with
 * `search_agent_plugin_local`), resolves its own on-disk layout internally from a bare `workspaceId`
 * via `resolveAgentPluginLayout().forWorkspace(...)` — there is no discovery closure, activation
 * repo, or hook-registry callback for this route to thread through the way the site/runtime plugin
 * family needs. Only `workspaceId` (to scope the read and to check the URL param) and `authorize`
 * (to gate the read behind `admin.plugins.read`, the same permission `plugins/list.ts` already uses
 * for this exact "list what plugins exist" shape — see `list.ts`'s own header for why reusing it
 * rather than minting a second permission is correct here too) are needed.
 */
export interface AgentPluginsRouteDeps {
  workspaceId: UUID;
  authorize: AuthorizeFn;
}

export type AgentPluginsRouteRegistrar = (app: Express, deps: AgentPluginsRouteDeps) => void;
