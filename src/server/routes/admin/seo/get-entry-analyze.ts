import { analyzeEntry, SeoEntryNotFoundError } from "#src/seo/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { SeoRouteRegistrar } from "./deps";

/** GET SEO score+issues for an entry (SPEC-008 api.spec.md `SEO_GET_ENTRY_ANALYZE`, tasks.md T047). */
export const registerAdminSeoGetEntryAnalyzeRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId/analyze", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const entryId = String(req.params.entryId ?? "");
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.seo.manage",
        workspaceId: deps.workspaceId,
        entityType: "seo-entry",
        entityId: entryId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.seo.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.seo.manage", reason: authResult.reason },
        });
        return;
      }

      const analysis = await analyzeEntry(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps },
        { workspaceId: deps.workspaceId, entryId }
      );
      res.json({ data: analysis });
    } catch (err) {
      if (err instanceof SeoEntryNotFoundError) {
        res.status(404).json({ error: err.message, code: "SEO_ENTRY_NOT_FOUND" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
