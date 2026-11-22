import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { analyzeEntry, SeoEntryNotFoundError } from "@jini-ai/cms/seo";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { withCoverReadDeps } from "@jini-ai/cms/seo/cover-image";
import type { SeoRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/** GET SEO score+issues for an entry (SPEC-008 api.spec.md `SEO_GET_ENTRY_ANALYZE`, tasks.md T047). */
export const registerAdminSeoGetEntryAnalyzeRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId/analyze", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const entryId = String(req.params.entryId ?? "");
      const params = { principalId: principal.id, permission: "admin.seo.manage", workspaceId: deps.workspaceId, entityType: "seo-entry", entityId: entryId };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const read = await withCoverReadDeps({ deps: deps.seoDeps, workspaceId: deps.workspaceId, entryId });
      const analysis = await analyzeEntry({
        deps: read.deps,
        input: { workspaceId: deps.workspaceId, entryId },
      }, {});
      res.json({ data: analysis });
    } catch (err) {
      if (err instanceof SeoEntryNotFoundError) {
        res.status(404).json({ error: err.message, code: "SEO_ENTRY_NOT_FOUND" });
        return;
      }
      sendAdminFailure({ res, error: err }, { operation: "routes/seo/get-entry-analyze", code: "INTERNAL_ERROR" });
    }
  });
};
