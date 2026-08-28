import { MediaNotFoundError, trashMedia } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/http/admin/media";
import { readRecordedContentType } from "./content-type.js";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * POST soft-delete (trash) a media asset — first rung of the ADR-027 §5 deletion ladder. Gated by
 * `media.delete` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 */
export const registerAdminMediaTrashRoute: MediaRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/media/:mediaId/trash", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "media.delete",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: String(req.params.mediaId ?? ""),
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'media.delete' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "media.delete", reason: authResult.reason },
        });
        return;
      }

      const { media } = await trashMedia({
        deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId, id: String(req.params.mediaId ?? "") },
      });
      res.json({ media: toAdminMediaResponse(media, await readRecordedContentType(deps, media.source.sha256)) });
    } catch (err) {
      if (err instanceof MediaNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
