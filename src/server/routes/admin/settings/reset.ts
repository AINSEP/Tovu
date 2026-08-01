import { ForbiddenError } from "../../../../features/settings/errors";
import type { SettingScope } from "../../../../features/settings/types";
import { resetNamespace } from "../../../../features/settings/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps";
import { resolveTargetWorkspaceId, toWriteServiceDeps } from "./shared";

const VALID_SCOPES: readonly SettingScope[] = ["global", "workspace", "user"];

/**
 * POST reset every setting in a namespace to defaults at a scope
 * (SPEC-007 api.spec.md `SETTINGS_RESET`, tasks.md T042).
 *
 * `resetNamespace` (ADR-028 §7 R3-01) is the "explicit, human-invoked
 * orchestrator": it authorizes the coarse `settings.reset.<scope>` permission
 * once, then loops `clear()` in a reset-authorized internal context (skipping
 * each inner authorize() re-check). This route pre-checks the same
 * `settings.reset.<scope>` permission for a fast, structured 403, mirroring
 * `set.ts`/`clear.ts`.
 *
 * `keysInNamespace` isn't tracked anywhere as a first-class list — this route
 * derives it the same way `write-service.ts`'s own `resolveScopedDefinitionOrThrow`
 * resolves a single key's definition partition: `scope=global` reads the
 * platform partition (`workspaceId=null`); `scope=workspace`/`scope=user` read
 * this workspace's site-owned partition.
 */
export const registerAdminSettingsResetRoute: SettingsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/settings/reset", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const body = (req.body ?? {}) as Record<string, unknown>;
      const namespace = String(body.namespace ?? "");
      const scope = body.scope as SettingScope;
      if (!namespace || !VALID_SCOPES.includes(scope)) {
        res.status(400).json({
          error: "namespace and scope (global|workspace|user) are required",
          code: "VALIDATION_ERROR",
        });
        return;
      }
      // See `resolveTargetWorkspaceId` in `shared.ts`. This was the worst of the three: it took the
      // target workspace from the body while authorizing against `deps.workspaceId` below, so one
      // request could wipe an entire namespace in another tenant.
      const targetWorkspace = resolveTargetWorkspaceId(deps, { bodyWorkspaceId: body.workspaceId, scope });
      if (!targetWorkspace.ok) {
        res.status(400).json({ error: targetWorkspace.error, code: "VALIDATION_ERROR" });
        return;
      }
      const workspaceId = targetWorkspace.workspaceId;

      const permission = `settings.reset.${scope}`;
      // See `set.ts`'s identical comment: always the ambient `deps.workspaceId`,
      // never a fallback to the caller's own principal id.
      const authWorkspaceId = deps.workspaceId;
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission,
        workspaceId: authWorkspaceId,
        entityType: "setting-namespace",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${permission}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission, reason: authResult.reason },
        });
        return;
      }

      const definitionWorkspaceId = scope === "global" ? null : (workspaceId ?? deps.workspaceId);
      const definitions = await deps.settingsRepo.listActiveDefinitions({ workspaceId: definitionWorkspaceId });
      const keysInNamespace = definitions.filter((d) => d.namespace === namespace).map((d) => d.key);

      const result = await resetNamespace(
        {
          deps: toWriteServiceDeps(deps),
          input: { namespace, scope, workspaceId, callerPrincipalId: principal.id, authWorkspaceId },
        },
        keysInNamespace
      );

      res.json({ namespace, clearedCount: result.clearedCount, revisionSeqs: result.revisionSeqs });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message, code: "FORBIDDEN" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
