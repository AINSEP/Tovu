import { MediaNotFoundError, MediaStillReferencedError, purgeMedia } from "#src/features/media/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Express } from "express";
import type { MediaRouteDeps } from "./deps.js";
import type { MediaWhereUsedDeps } from "./where-used.js";

/**
 * DELETE hard-purges a media asset — second rung of the ADR-027 §5 deletion
 * ladder. Requires Trash first and 409s with the referencing list while current content
 * still uses the asset. Lookup failures refuse deletion. Gated by `media.delete.force` (SPEC-021 REQ-39/OQ-01, ADR-027 §7) — a separate,
 * narrower permission than the ordinary trash's `media.delete`, since this is an irreversible purge
 * (mirrors `admin.menus.delete` vs `admin.menus.delete.force`'s split).
 */
export const registerAdminMediaDeleteRoute = (app: Express, deps: MediaRouteDeps & MediaWhereUsedDeps): void => {
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
          entryRefsRepo: deps.entryRefsRepo,
          postRepo: deps.postRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          blobStore: deps.blobStore,
        },
        input: { workspaceId: deps.workspaceId, id: String(req.params.mediaId ?? "") },
      });
      // The bytes are gone for good, so the Trash index row has to go with them — otherwise the
      // Trash screen keeps offering a Restore for an asset that no longer exists.
      if (purged) {
        await deps.forgetRemovedMedia({ workspaceId: deps.workspaceId, id: String(req.params.mediaId ?? "") });
      }
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
