import { getEntryMeta, SeoEntryNotFoundError } from "#src/features/seo/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SeoRouteRegistrar } from "./deps.js";

/**
 * GET an entry's effective SEO meta (SPEC-008 api.spec.md `SEO_GET_ENTRY_META`, tasks.md T047).
 * Path deviation: workspace-scoped mount, matching every other admin route in this codebase.
 */
export const registerAdminSeoGetEntryRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.seo.manage",
        workspaceId: deps.workspaceId,
        entityType: "seo-entry",
        entityId: String(req.params.entryId ?? ""),
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.seo.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.seo.manage", reason: authResult.reason },
        });
        return;
      }

      const meta = await getEntryMeta(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps },
        { workspaceId: deps.workspaceId, entryId: String(req.params.entryId ?? "") }
      );
      res.json({ data: meta });
    } catch (err) {
      if (err instanceof SeoEntryNotFoundError) {
        res.status(404).json({ error: err.message, code: "SEO_ENTRY_NOT_FOUND" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
