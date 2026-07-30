import { DuplicateCommandError, executeCommand, ForbiddenError } from "../../../../core/commands";
import {
  PluginIncompatibleError,
  PluginInvalidError,
  PluginNotFoundError,
  setPluginEnabled,
  type PluginActivationRecord,
} from "../../../../features/plugin-runtime/activation";
import { toAdminPluginResponse } from "../../../http/admin/plugins";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { PluginsRouteRegistrar } from "./deps";

/**
 * @file `PLUGIN_SET_ENABLED` — `PATCH /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId`
 * (SPEC-005 REQ-07/REQ-10, api.spec.md §1/§4/§5/§6; C-016).
 *
 * Mirrors `admin/posts/update.ts`'s `executeCommand`-wrapped shape (ADR API/Event Contract
 * Summary): `captureInverse` snapshots the prior `PluginActivationRecord` (or `null` — a plugin
 * enabled for the first time has no prior row), `execute` calls `setPluginEnabled()`. Route-level
 * guards run BEFORE the gateway (errors.spec.md §4): unknown id ⇒ 404 `PLUGIN_NOT_FOUND`; invalid/
 * incompatible ⇒ 422 `PLUGIN_INVALID`/`PLUGIN_INCOMPATIBLE` — these are exactly the typed errors
 * `setPluginEnabled()` throws, so this handler's catch block maps them, same as every other
 * gateway-wrapped route in this codebase maps its feature function's typed errors.
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-016). Route registration is real (so the certified
 * HTTP-level test suite can issue real requests against it); the handler body intentionally
 * throws until the Programmer stage implements it against
 * `__tests__/integration/plugins-http.integration.test.ts`. Do not implement ahead of that suite
 * being reviewed.
 */
export const registerPluginSetEnabledRoute: PluginsRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pluginId = String(req.params.pluginId ?? "");
    const enabled = Boolean(req.body?.enabled);

    // Full pre-transition activation row, captured in captureInverse and reused verbatim by
    // rollback — mirrors `admin/posts/update.ts`'s `priorPost` shape exactly (ADR API/Event
    // Contract Summary: this route is thin, `executeCommand`-wrapped, same as that one).
    let priorActivation: PluginActivationRecord | null = null;

    try {
      const principal = getAuthedPrincipal(res);
      const discovery = await deps.discoverPlugins();

      const { result, changeSetId } = await executeCommand({
        deps: {
          clock: deps.clock,
          idGen: deps.idGen,
          changeSets: deps.changeSets,
          outbox: deps.outbox,
          authorize: deps.authorize,
        },
        command: {
          workspaceId: deps.workspaceId,
          actor: { id: principal.id, kind: "user" },
          summary: `Set plugin '${pluginId}' enabled=${enabled}`,
          permission: "admin.plugins.enable",
        },
        mutation: {
          entityType: "plugin-activation",
          entityId: pluginId,
          operation: "update",
          captureInverse: async () => {
            priorActivation = await deps.pluginActivationRepo.getActivation({
              workspaceId: deps.workspaceId,
              pluginId,
            });
            // BR-05/REQ-07: the inverse is the PRIOR enabled value only — a plugin activation has
            // no other revertible field a restore would need (mirrors `presentation.ts`'s
            // single-field activation shape).
            return { enabled: priorActivation?.enabled ?? false };
          },
          execute: () =>
            setPluginEnabled({
              deps: { clock: deps.clock, repo: deps.pluginActivationRepo, discovery },
              input: { workspaceId: deps.workspaceId, pluginId, enabled },
            }),
          rollback: async () => {
            if (priorActivation) await deps.pluginActivationRepo.save(priorActivation);
          },
        },
      });

      const record = discovery.find((r) => r.id === pluginId);
      res.json({
        plugin: record ? toAdminPluginResponse(record, result.activation) : undefined,
        changeSetId,
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({
          error: err.message,
          code: "FORBIDDEN",
          details: { permission: err.permission, reason: err.reason },
        });
        return;
      }

      if (err instanceof DuplicateCommandError) {
        res.status(409).json({ error: err.message, code: "DUPLICATE_COMMAND", changeSetId: err.changeSetId });
        return;
      }

      if (err instanceof PluginNotFoundError) {
        res.status(404).json({ error: err.message, code: "PLUGIN_NOT_FOUND" });
        return;
      }

      if (err instanceof PluginIncompatibleError) {
        res.status(422).json({ error: err.message, code: "PLUGIN_INCOMPATIBLE" });
        return;
      }

      if (err instanceof PluginInvalidError) {
        res.status(422).json({ error: err.message, code: "PLUGIN_INVALID" });
        return;
      }

      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
