import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps";

/**
 * GET active setting definitions, grouped by namespace (SPEC-007 api.spec.md
 * `SETTINGS_LIST_DEFINITIONS`, spec.md line ~21).
 *
 * Path deviation: see `register-definitions.ts`'s header — this route follows
 * the codebase's established `/api/admin/v1/workspaces/:workspaceId/...` mount
 * convention rather than api.spec.md's literal (workspace-less) path.
 *
 * Enumerates both the platform partition (`workspaceId=null`, core/theme
 * owners) and this workspace's own site-owned partition — the identical
 * two-call merge `get-effective.ts` already uses for the same reason
 * (`SettingsRepoPort.listActiveDefinitions` only takes one exact `workspaceId`
 * per call). `listActiveDefinitions` itself already filters to `active`/`alias`
 * status rows (see both repo adapters), matching this endpoint's "active
 * definitions" purpose. Sorted by `(namespace, key)` for a stable, grouped-by-
 * namespace listing — api.spec.md's `DefinitionsResponse` is a flat array, not
 * a nested-by-namespace structure, so ordering (not nesting) is what
 * "grouped by namespace" means here.
 */
export const registerAdminSettingsListDefinitionsRoute: SettingsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/settings/definitions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "settings.read.definitions",
        workspaceId: deps.workspaceId,
        entityType: "setting-definition",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'settings.read.definitions' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "settings.read.definitions", reason: authResult.reason },
        });
        return;
      }

      const [platformDefs, siteDefs] = await Promise.all([
        deps.settingsRepo.listActiveDefinitions({ workspaceId: null }),
        deps.settingsRepo.listActiveDefinitions({ workspaceId: deps.workspaceId }),
      ]);

      const data = [...platformDefs, ...siteDefs]
        .map((def) => ({
          namespace: def.namespace,
          key: def.key,
          ownerKind: def.ownerKind,
          scopes: def.scopes,
          status: def.status,
          version: def.version,
        }))
        .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key));

      res.json({ data });
    } catch (err) {
      void err;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
