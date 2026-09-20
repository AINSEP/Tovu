import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { readRecordedContentType } from "./content-type.js";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * POST soft-delete (trash) a media asset — first rung of the ADR-027 §5 deletion ladder. Gated by
 * `media.delete` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 *
 * The marker flip goes through `deps.removeMedia` rather than `@jini-ai/cms`'s `trashMedia`, so the
 * flip and the Trash index row are one transaction. The `display` snapshot is taken from the record
 * this route already loaded — columns only, no payload parse, so an asset whose metadata is corrupt
 * is still deletable and still listable in the Trash.
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

      const mediaId = String(req.params.mediaId ?? "");
      const existing = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: mediaId });
      if (!existing) {
        res.status(404).json({ error: `media '${mediaId}' was not found` });
        return;
      }

      const removed = await deps.removeMedia({
        workspaceId: deps.workspaceId,
        id: mediaId,
        display: { title: existing.title, subtitle: existing.slug },
        at: deps.clock.nowIso(),
        expectedVersion: existing.version,
        actor: { principalId: principal.id },
      });
      if (!removed.ok) {
        // `not-found` can only mean the row went away between the read above and the flip.
        if (removed.reason === "not-found") {
          res.status(404).json({ error: `media '${mediaId}' was not found` });
          return;
        }
        res.status(409).json({ error: `media '${mediaId}' changed while it was being trashed` });
        return;
      }

      // Re-read rather than reconstruct: the marker flip happened in SQL, so this is the one shape
      // guaranteed to match what every other media route returns.
      const media = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: mediaId });
      if (!media) {
        res.status(404).json({ error: `media '${mediaId}' was not found` });
        return;
      }
      res.json({ media: toAdminMediaResponse(media, await readRecordedContentType(deps, media.source.sha256)) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
