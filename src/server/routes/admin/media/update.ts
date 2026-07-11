import { MediaNotFoundError, MediaValidationError, updateMediaMetadata } from "../../../../media";
import { toAdminMediaResponse } from "../../../http/admin/media";
import type { RouteRegistrar } from "../../types";

/**
 * PATCH media metadata (title/alt/caption/credit only — `source.sha256` is
 * write-once and this route's input shape has no field for it, matching
 * `updateMediaMetadata`'s contract).
 */
export const registerAdminMediaUpdateRoute: RouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/media/:mediaId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
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
