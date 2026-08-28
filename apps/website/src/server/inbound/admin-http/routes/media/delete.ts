import { MediaNotFoundError, MediaStillReferencedError, purgeMedia } from "#src/features/media/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * DELETE hard-purges a media asset — second rung of the ADR-027 §5 deletion
 * ladder. 409s with the referencing list if the asset has not been trashed
 * first (see `purgeMedia`'s doc comment for the disclosed simplification: this
 * is a stand-in for the real `entry_refs` where-used guard, which doesn't
 * exist yet). Gated by `media.delete.force` (SPEC-021 REQ-39/OQ-01, ADR-027 §7) — a separate,
 * narrower permission than the ordinary trash's `media.delete`, since this is an irreversible purge
 * (mirrors `admin.menus.delete` vs `admin.menus.delete.force`'s split).
 */
export const registerAdminMediaDeleteRoute: MediaRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/media/:mediaId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "media.delete.force",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: String(req.params.mediaId ?? ""),
      });
      if (!authorized) return;

      const { purged } = await purgeMedia({
        deps: {
          mediaRepo: deps.mediaRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          blobStore: deps.blobStore,
        },
        input: { workspaceId: deps.workspaceId, id: String(req.params.mediaId ?? "") },
      });
      res.json({ purged });
    } catch (err) {
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
  });
};
