import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { getEntryMeta, SeoEntryNotFoundError } from "@jini-ai/cms/seo";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { withContentImageSource, withCoverReadDeps } from "@jini-ai/cms/seo/cover-image";
import type { SeoRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * GET an entry's effective SEO meta (SPEC-008 api.spec.md `SEO_GET_ENTRY_META`, tasks.md T047).
 * Path deviation: workspace-scoped mount, matching every other admin route in this codebase.
 */
export const registerAdminSeoGetEntryRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      await deps.seoReady;
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "admin.seo.manage", workspaceId: deps.workspaceId, entityType: "seo-entry", entityId: String(req.params.entryId ?? "") };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const entryId = String(req.params.entryId ?? "");
      const read = await withCoverReadDeps({ deps: deps.seoDeps, workspaceId: deps.workspaceId, entryId });
      const meta = await getEntryMeta({
        deps: read.deps,
        input: { workspaceId: deps.workspaceId, entryId },
      }, {});
      res.json({ data: withContentImageSource({ meta, rawPost: read.rawPost }) });
    } catch (err) {
      if (err instanceof SeoEntryNotFoundError) {
        res.status(404).json({ error: err.message, code: "SEO_ENTRY_NOT_FOUND" });
        return;
      }
      sendAdminFailure({ res, error: err }, { operation: "routes/seo/get-entry", code: "INTERNAL_ERROR" });
    }
  });
};
