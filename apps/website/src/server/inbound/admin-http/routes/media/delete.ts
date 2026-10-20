import { MediaNotFoundError, MediaStillReferencedError, purgeMedia } from "#src/features/media/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Express, Response } from "express";
import type { MediaRouteDeps } from "./deps.js";
import type { MediaWhereUsedDeps } from "./where-used.js";
import { readRouteParam, rejectForeignWorkspace } from "./route-guards.js";

/**
 * DELETE hard-purges a media asset — second rung of the ADR-027 §5 deletion
 * ladder. Requires Trash first and 409s with the referencing list while current content
 * still uses the asset. Lookup failures refuse deletion. Gated by `media.delete.force` (SPEC-021 REQ-39/OQ-01, ADR-027 §7) — a separate,
 * narrower permission than the ordinary trash's `media.delete`, since this is an irreversible purge
 * (mirrors `admin.menus.delete` vs `admin.menus.delete.force`'s split).
 */
export const registerAdminMediaDeleteRoute = (app: Express, deps: MediaRouteDeps & MediaWhereUsedDeps): void => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/media/:mediaId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const mediaId = readRouteParam({ req, name: "mediaId" });
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "media.delete.force",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: mediaId,
      });
      if (!authorized) return;

      // `purgeMedia` resolves `{ purged: true }` or throws, so there is no not-purged outcome to skip.
      const { purged } = await purgeMedia({
        deps: {
          mediaRepo: deps.mediaRepo,
          entryRefsRepo: deps.entryRefsRepo,
          postRepo: deps.postRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          blobStore: deps.blobStore,
        },
        input: { workspaceId: deps.workspaceId, id: mediaId },
      });
      // The bytes are gone for good, so the Trash index row has to go with them — otherwise the
      // Trash screen keeps offering a Restore for an asset that no longer exists.
      await deps.forgetRemovedMedia({ workspaceId: deps.workspaceId, id: mediaId });
      res.json({ purged });
    } catch (err) {
      sendPurgeFailure({ res, err });
    }
  });
};

/** 409 with the referencing list while content still uses the asset, 404 for an unknown asset,
 *  otherwise a private 500.
 *  @complexity O(1). */
function sendPurgeFailure({ res, err }: { res: Response; err: unknown }): void {
  if (err instanceof MediaStillReferencedError) {
    res.status(409).json({ error: err.message, referencing: err.referencing });
    return;
  }
  if (err instanceof MediaNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "internal error" });
}
