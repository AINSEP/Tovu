import type { Response } from "express";

import { provisionAgentPluginMcpServers, resolveAgentPluginMcpServers } from "#src/features/agent-plugins/federate-mcp";
import { AgentPluginNotInstalledError, setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";
import { loadAgentPluginSearchCandidates } from "#src/features/agent-plugins/tool-registrations";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "./deps.js";

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
 *
 * ---------------------------------------------------------------------------
 * 2026-09-09: the write composition moved out, and is now shared
 * ---------------------------------------------------------------------------
 * The "verify the id is installed here, then write the activation record" pair that used to sit
 * inline in the handler below is now `features/agent-plugins/set-enabled.ts`'s `setAgentPluginEnabled`,
 * because it acquired a SECOND caller: `plugins_set_enabled`'s Agent Plugin branch
 * (`features/plugin-runtime/tool-registrations.ts`), the assistant's own enable/disable tool. Two
 * copies of that precondition would be two places that each decide what "installed" means, and the
 * failure mode of them drifting is an activation recorded for a plugin the admin screen says is not
 * there. What stayed here is genuinely this route's own: the read model it answers with, and the
 * HTTP status mapping.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-10: enabling this plugin also PROVISIONS its auto-admitted MCP servers
 * ---------------------------------------------------------------------------
 * On a successful ENABLE only, this handler calls `features/agent-plugins/federate-mcp.ts`'s
 * `provisionAgentPluginMcpServers` to create (if absent) a disabled row in the SAME external-MCP
 * store Settings → External MCP already owns, for every remote MCP server this plugin declares that
 * `classifyAgentPluginMcpServerTrust` auto-admits — see that module's own header for the full
 * argument, its three collision rules (never clobber an existing row, seed disabled, provisioning is
 * not authorization), and why a `stdio` server never reaches this path at all.
 *
 * Disabling the plugin does NOT call this at all — there is nothing to provision on a disable, and
 * `federate-mcp.ts`'s own header states explicitly that a provisioned row survives a disable (or an
 * uninstall) rather than being deactivated or deleted by this route.
 *
 * Deliberately best-effort: a provisioning failure is logged, never thrown back to the client. The
 * plugin's own activation state (the thing this route is actually named for) must not fail because
 * one MCP row could not be written — the same fail-open posture `agent-daemon-server.ts`'s own
 * `resolveStoredExternalMcpConnections` takes for the identical store at boot. `plugins_set_enabled`
 * (`features/plugin-runtime/tool-registrations.ts`, the assistant's own in-chat equivalent of this
 * toggle) now calls the same two primitives (`resolveAgentPluginMcpServers` +
 * `provisionAgentPluginMcpServers`) on enable, so both inbound adapters of the same logical enable
 * have identical side effects. The provisioning step and its logging are mirrored, not shared,
 * because a `features/**` module may not import this server route; that tool's deps bag carries the
 * same `externalMcpServerRepo`/`siteAssistantSecretSealer`/`siteAssistantSecretKeyring` slice this
 * route threads through `AgentPluginsRouteDeps`.
 *
 * A provisioned row is created DISABLED and needs an assistant restart on top of that once an
 * operator enables and authorizes it (`external-mcp/put.ts`'s own doc states the same restart rule
 * for an operator-typed row) — federation config is read once at boot.
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

/**
 * Best-effort: provisions `pluginId`'s auto-admitted remote MCP servers into the external-MCP store
 * (create-if-absent, never touching an existing row — see `federate-mcp.ts`'s header), logging
 * rather than throwing on failure. Caller-gated to the enable path only; see this file's own header.
 */
async function provisionAgentPluginMcpServersBestEffort(
  deps: AgentPluginsRouteDeps,
  input: { readonly pluginId: string; readonly principalId: string },
): Promise<void> {
  try {
    const servers = await resolveAgentPluginMcpServers({ workspaceId: deps.workspaceId, pluginId: input.pluginId });
    const result = await provisionAgentPluginMcpServers(
      { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
      { workspaceId: deps.workspaceId, pluginId: input.pluginId, servers, principalId: input.principalId },
    );
    for (const failure of result.failed) {
      console.warn(`[agent-plugins] '${input.pluginId}': MCP provisioning for server '${failure.serverKey}' failed — ${failure.reason}`);
    }
  } catch (error) {
    console.warn(
      `[agent-plugins] '${input.pluginId}': MCP provisioning could not run — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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

      const written = await setAgentPluginEnabled({ workspaceId: deps.workspaceId, pluginId, enabled, actor: principal.id });

      // Provisioning only ever runs on enable — disabling has nothing to provision, and a
      // previously-provisioned row survives a disable untouched (`federate-mcp.ts`'s own header).
      if (written.enabled) {
        await provisionAgentPluginMcpServersBestEffort(deps, { pluginId, principalId: principal.id });
      }

      sendUpdatedRow(res, candidate, written.enabled);
    } catch (error) {
      // `setAgentPluginEnabled` re-asserts the installed precondition independently of the
      // `candidates` lookup above, so a package removed between the two reads lands here rather than
      // as an opaque 500 — the same 404 the pre-check produces, for the same reason.
      if (error instanceof AgentPluginNotInstalledError) {
        res.status(404).json({ error: error.message, code: "AGENT_PLUGIN_NOT_FOUND" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
