import { MediaNotFoundError, MediaValidationError, updateMediaMetadata } from "#src/media/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { toAdminMediaResponse } from "#src/server/http/admin/media";
import type { MediaRouteRegistrar } from "./deps.js";

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

      // width/height/cssClass: `null` (explicit clear) must survive as `null`, not coerce to the
      // string `"null"` — only a genuinely-provided width/height gets `Number(...)`'d, matching
      // `updateMediaMetadata`'s own undefined/null/value contract (see that input type's doc).
      const width =
        req.body?.width === undefined ? undefined : req.body.width === null ? null : Number(req.body.width);
      const height =
        req.body?.height === undefined ? undefined : req.body.height === null ? null : Number(req.body.height);
      const cssClass =
        req.body?.cssClass === undefined ? undefined : req.body.cssClass === null ? null : String(req.body.cssClass);

      const { media } = await updateMediaMetadata({
        deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
        input: {
          workspaceId: deps.workspaceId,
          id: String(req.params.mediaId ?? ""),
          title: req.body?.title !== undefined ? String(req.body.title) : undefined,
          alt: req.body?.alt !== undefined ? String(req.body.alt) : undefined,
          caption: req.body?.caption !== undefined ? String(req.body.caption) : undefined,
          credit: req.body?.credit !== undefined ? String(req.body.credit) : undefined,
          width,
          height,
          cssClass,
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
