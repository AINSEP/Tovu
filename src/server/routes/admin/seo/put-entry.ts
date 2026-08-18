import {
  getEntryMeta,
  setEntrySeoOverrides,
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
} from "#src/seo/index";
import { invalidateSitemapCache } from "#src/seo/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { SeoRouteRegistrar } from "./deps";

/**
 * PUT (partial) SEO overrides for an entry (SPEC-008 api.spec.md `SEO_PUT_ENTRY_META`, tasks.md T047).
 * `setEntrySeoOverrides` is its own chokepoint (does its own `authorize()` call) — this route still
 * does the route-layer authorize-then-403 dance first, matching every sibling admin route's shape,
 * so a caller lacking the permission never reaches the chokepoint at all (fail-closed, INV-07-style).
 */
export const registerAdminSeoPutEntryRoute: SeoRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId", async (req, res) => {
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

      await setEntrySeoOverrides({
        deps: {
          postRepo: deps.postRepo,
          authorize: deps.authorize,
          invalidateSitemapCache,
        },
        input: {
          workspaceId: deps.workspaceId,
          entryId,
          patch: req.body ?? {},
          callerPrincipalId: principal.id,
        },
      });

      const meta = await getEntryMeta(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps },
        { workspaceId: deps.workspaceId, entryId }
      );
      res.json({ data: meta });
    } catch (err) {
      if (err instanceof SeoFieldValidationError) {
        res.status(400).json({ error: err.message, code: "SEO_FIELD_VALIDATION_ERROR" });
        return;
      }
      if (err instanceof SeoInvalidCanonicalUrlError) {
        res.status(400).json({ error: err.message, code: "SEO_INVALID_CANONICAL_URL" });
        return;
      }
      if (err instanceof SeoEntryNotFoundError) {
        res.status(404).json({ error: err.message, code: "SEO_ENTRY_NOT_FOUND" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
