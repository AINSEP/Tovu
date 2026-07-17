import { getEffective } from "../../../../features/settings/settings";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps";

/**
 * GET the effective value of every setting registered in a namespace
 * (SPEC-007 api.spec.md `SETTINGS_GET_EFFECTIVE`, tasks.md T039).
 *
 * Path deviation: see `register-definitions.ts`'s header — this route
 * follows the codebase's established `/api/admin/v1/workspaces/:workspaceId/...`
 * mount convention rather than api.spec.md's literal (workspace-less) path.
 *
 * `getEffective`/`resolveDefinition` (`features/settings/settings.ts`) are
 * pure reads with no `authorize()` call of their own (unlike `write-service.ts`),
 * so this route does the explicit authorize-then-call dance itself, mirroring
 * `presentation/get.ts`.
 *
 * Enumerates every active key in the requested namespace across both the
 * platform partition (`workspaceId=null`, core/theme owners) and this
 * workspace's own site-owned partition — matches `resolveDefinitionRaw`'s own
 * fallback order (`settings.ts`), since `SettingsRepoPort.listActiveDefinitions`
 * only takes one exact `workspaceId` per call.
 */
export const registerAdminSettingsGetEffectiveRoute: SettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/settings/effective", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "settings.read",
        workspaceId: deps.workspaceId,
        entityType: "setting-value",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'settings.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "settings.read", reason: authResult.reason },
        });
        return;
      }

      const namespace = String(req.query.namespace ?? "");
      if (!namespace) {
        res.status(400).json({ error: "'namespace' query param is required", code: "VALIDATION_ERROR" });
        return;
      }
      const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : deps.workspaceId;
      const principalId = req.query.principalId ? String(req.query.principalId) : undefined;

      const [platformDefs, siteDefs] = await Promise.all([
        deps.settingsRepo.listActiveDefinitions({ workspaceId: null }),
        deps.settingsRepo.listActiveDefinitions({ workspaceId }),
      ]);
      const keys = new Set(
        [...platformDefs, ...siteDefs].filter((d) => d.namespace === namespace).map((d) => d.key)
      );

      const data: Array<{ key: string; value: unknown; sourceLayer: string; defVersion: number }> = [];
      for (const key of keys) {
        const resolved = await getEffective(
          { repo: deps.settingsRepo },
          { namespace, key, scopeContext: { workspaceId, principalId } }
        );
        if (resolved) {
          data.push({
            key,
            value: resolved.value,
            sourceLayer: resolved.sourceLayer,
            defVersion: resolved.defVersion,
          });
        }
      }

      res.json({ data });
    } catch (err) {
      void err;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
