import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { listMedia } from "#src/features/media/index";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaListResponse } from "#src/server/inbound/admin-http/http/media";
import { resolveContentTypes } from "./content-type.js";
import { resolveMediaByteSizes } from "./byte-size.js";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * GET all media in the workspace (all statuses — active + trashed; mirrors `listAdminPosts`).
 * Gated by `media.read` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 */
export const registerAdminMediaListRoute: MediaRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/media", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const kind = req.query.kind ?? "media";
    if (kind !== "media" && kind !== "document") { res.status(400).json({ error: "invalid media kind" }); return; }
    if (kind === "document") res.set("Cache-Control", "private, no-store");
    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: "media.read", workspaceId: deps.workspaceId, entityType: "media" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const { media } = await listMedia({
        deps: { mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId, kind },
      });
      const visible = kind === "document" ? media.filter(row => row.status === "active") : media;
      const [contentTypes, publicUrls, byteSizes] = await Promise.all([
        resolveContentTypes(deps, visible),
        resolveMediaPublicUrls(deps, visible),
        resolveMediaByteSizes({ deps, media: visible }),
      ]);
      res.json(toAdminMediaListResponse({ media: visible, contentTypesBySha256: contentTypes, publicUrlsById: publicUrls, byteSizesBySha256: byteSizes }));
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/media/list", code: "INTERNAL_ERROR", message: "The media library could not be loaded." });
    }
  });
};
