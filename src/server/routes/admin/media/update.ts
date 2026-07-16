import { MediaNotFoundError, MediaValidationError, updateMediaMetadata } from "../../../../media";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { toAdminMediaResponse } from "../../../http/admin/media";
import type { MediaRouteRegistrar } from "./deps";

/**
 * PATCH media metadata (title/alt/caption/credit only — `source.sha256` is
 * write-once and this route's input shape has no field for it, matching
 * `updateMediaMetadata`'s contract). Gated by `media.update` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 */
export const registerAdminMediaUpdateRoute: MediaRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/media/:mediaId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "media.update",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: String(req.params.mediaId ?? ""),
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'media.update' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "media.update", reason: authResult.reason },
        });
        return;
      }

      const { media } = await updateMediaMetadata({
        deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
        input: {
          workspaceId: deps.workspaceId,
          id: String(req.params.mediaId ?? ""),
          title: req.body?.title !== undefined ? String(req.body.title) : undefined,
          alt: req.body?.alt !== undefined ? String(req.body.alt) : undefined,
          caption: req.body?.caption !== undefined ? String(req.body.caption) : undefined,
          credit: req.body?.credit !== undefined ? String(req.body.credit) : undefined,
        },
      });
      res.json({ media: toAdminMediaResponse(media) });
    } catch (err) {
      if (err instanceof MediaNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof MediaValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
