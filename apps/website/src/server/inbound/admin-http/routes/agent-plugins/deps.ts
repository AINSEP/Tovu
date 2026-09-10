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
 * repo, or hook-registry callback for these routes to thread through the way the site/runtime
 * plugin family needs. Only `workspaceId` (to scope the read/write and to check the URL param) and
 * `authorize` are needed.
 *
 * `authorize` gates both routes on this family's existing permissions — `admin.plugins.read` for
 * `list.ts` and `admin.plugins.enable` for `set-enabled.ts`, the same pair the `.tovu-plugin`
 * family already uses for the identical two operations. See `list.ts`'s own header for why reusing
 * them rather than minting `admin.agent-plugins.*` is correct.
 *
 * Still no `clock`/`idGen`/`changeSets`/`outbox` even though `set-enabled.ts` mutates: that
 * mutation is a single atomic JSON-file write with no repo and no entity type, so it is authorized
 * directly instead of being wrapped in `executeCommand`. That route's header states the trade and
 * its consequence for change-set history.
 */
export interface AgentPluginsRouteDeps {
  workspaceId: UUID;
  authorize: AuthorizeFn;
}

export type AgentPluginsRouteRegistrar = (app: Express, deps: AgentPluginsRouteDeps) => void;
