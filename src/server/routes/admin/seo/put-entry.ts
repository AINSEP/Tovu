import {
  getEntryMeta,
  setEntrySeoOverrides,
  SeoEntryNotFoundError,
  SeoFieldValidationError,
  SeoInvalidCanonicalUrlError,
} from "#src/seo/index";
import { invalidateSitemapCache } from "#src/seo/index";
import { authorizeOrRespond } from "#src/server/http/responses/authorize-guard";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { SeoRouteRegistrar } from "./deps.js";

/** Maps `setEntrySeoOverrides`/`getEntryMeta`'s known thrown error types to this route's documented
 *  4xx response shapes; any other error (including a real bug) falls through to a generic 500. */
function seoPutEntryErrorResponse(err: unknown): { status: number; body: { error: string; code: string } } {
  if (err instanceof SeoFieldValidationError) {
    return { status: 400, body: { error: err.message, code: "SEO_FIELD_VALIDATION_ERROR" } };
  }
  if (err instanceof SeoInvalidCanonicalUrlError) {
    return { status: 400, body: { error: err.message, code: "SEO_INVALID_CANONICAL_URL" } };
  }
  if (err instanceof SeoEntryNotFoundError) {
    return { status: 404, body: { error: err.message, code: "SEO_ENTRY_NOT_FOUND" } };
  }
  return { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } };
}

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
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.seo.manage",
        workspaceId: deps.workspaceId,
        entityType: "seo-entry",
        entityId: entryId,
      });
      if (!authorized) return;

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
      const { status, body } = seoPutEntryErrorResponse(err);
      res.status(status).json(body);
    }
  });
};
