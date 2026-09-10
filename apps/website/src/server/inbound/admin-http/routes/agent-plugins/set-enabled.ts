import type { Response } from "express";

import { setAgentPluginActivation } from "#src/features/agent-plugins/activation";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteRegistrar } from "./deps.js";

/**
 * @file `AGENT_PLUGIN_SET_ENABLED` — `PATCH /api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId`
 * (2026-09-09). The Agent Plugins screen's enable/disable toggle, and the FIRST production write
 * path for `setAgentPluginActivation()` — before this route, that writer's only caller was
 * `recordBundledAgentPluginIfAbsent`'s boot-time seed, so an operator had no way to turn a bundled
 * plugin on from the admin at all.
 *
 * This is a real gate, not a cosmetic flag. `resolveAgentPluginRefs`
 * (`features/agent-plugins/resolve-agent-plugin-refs.ts`) re-reads `activations.json` on EVERY run
 * and refuses a run that pins a disabled plugin, and `tool-registrations.ts` filters the dynamic
 * per-plugin tools through the same record. Both reads are fresh per call, so a toggle here takes
 * effect on the next assistant run with no daemon restart.
 *
 * ---------------------------------------------------------------------------
 * Why this does NOT go through `executeCommand`, unlike `routes/plugins/set-enabled.ts`
 * ---------------------------------------------------------------------------
 * The `.tovu-plugin` family's identical operation is `executeCommand`-wrapped because its
 * activation is a database row with a `PluginActivationRecord` repo, a `plugin-activation` entity
 * type, and therefore a meaningful change-set/outbox/rollback story. An Agent Plugin activation is
 * one small JSON file written atomically (write-temp-then-`rename`, see
 * `activation.ts`'s `writeActivationsAtomically`) with no repo, no entity type, and no inverse to
 * capture beyond the prior boolean that the file itself already holds. Threading `clock`/`idGen`/
 * `changeSets`/`outbox` into `AgentPluginsRouteDeps` and minting an entity type for it would be
 * ceremony around a single-field file write.
 *
 * The consequence is stated rather than hidden: this mutation does NOT appear in the change-set
 * history and is NOT undoable through the admin's revert surface. `activations.json` records
 * `updatedAt`/`updatedBy` per plugin (the actor is this request's authenticated principal), which is
 * the audit trail this write actually has. Authorization is NOT weakened — `admin.plugins.enable`
 * is checked here explicitly via `authorizeOrRespond`, the same permission the other family's
 * gateway checks, and the same helper `list.ts` uses one door over for `admin.plugins.read`.
 *
 * ---------------------------------------------------------------------------
 * Divergence from `routes/plugins/set-enabled.ts`: `enabled` is validated, not coerced
 * ---------------------------------------------------------------------------
 * That route reads `Boolean(req.body?.enabled)`, so a request that omits the field, or sends
 * `"false"`, silently means "disable". For a toggle whose off-state refuses assistant runs, a
 * malformed body must be an error rather than a guess, so a non-boolean `enabled` is 400
 * `VALIDATION_ERROR` here.
 *
 * SECURITY: `:pluginId` never reaches the filesystem unchecked. The id must match an ACTUALLY
 * INSTALLED plugin in this workspace (`loadAgentPluginSearchCandidates`, the same read model
 * `list.ts` serves) before any write is attempted, and `setAgentPluginActivation` independently
 * re-asserts the Agent Plugins name grammar. No absolute host path reaches the response — the
 * response body is re-shaped from that same loader's fields, exactly as `list.ts` does.
 */

/** The `list.ts` row shape, for one plugin, so the client can replace a row in place rather than
 *  re-fetching the whole list after a toggle. `enabled` comes from the record just written, not
 *  from the pre-write read. */
function sendUpdatedRow(
  res: Response,
  candidate: Awaited<ReturnType<typeof loadAgentPluginSearchCandidates>>[number],
  enabled: boolean,
): void {
  res.json({
    agentPlugin: {
      pluginId: candidate.pluginId,
      version: candidate.version ?? null,
      description: candidate.description ?? null,
      keywords: candidate.keywords,
      enabled,
      skills: candidate.skills,
      mcpServerIds: candidate.mcpServerIds,
    },
  });
}

export const registerAgentPluginSetEnabledRoute: AgentPluginsRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pluginId = String(req.params.pluginId ?? "");
    const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "'enabled' must be a boolean", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "admin.plugins.enable",
          workspaceId: deps.workspaceId,
          entityType: "agent-plugin",
          entityId: pluginId,
        }))
      )
        return;

      const candidates = await loadAgentPluginSearchCandidates({ workspaceId: deps.workspaceId });
      const candidate = candidates.find((entry) => entry.pluginId === pluginId);
      if (candidate === undefined) {
        res.status(404).json({ error: `agent plugin '${pluginId}' is not installed in this workspace`, code: "AGENT_PLUGIN_NOT_FOUND" });
        return;
      }

      const workspaceRoot = resolveAgentPluginLayout().forWorkspace(deps.workspaceId).root;
      const written = await setAgentPluginActivation({ workspaceRoot, pluginId, enabled, actor: principal.id });

      sendUpdatedRow(res, candidate, written.plugins[pluginId]?.enabled ?? enabled);
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
