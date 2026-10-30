import type { Response } from "express";

import type { MediaRecord } from "#src/features/media/index";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { readRecordedContentType } from "./content-type.js";
import { resolveMediaByteSizes } from "./byte-size.js";
import type { MediaRouteDeps, MediaRouteRegistrar } from "./deps.js";
import { authorizeMediaOrRespond, readRouteParam, rejectForeignWorkspace, sendMediaNotFound } from "./route-guards.js";

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
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const mediaId = readRouteParam({ req, name: "mediaId" });
      const authorized = await authorizeMediaOrRespond({ res, authorize: deps.authorize, params: {
        principalId: principal.id,
        permission: "media.delete",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: mediaId,
      } });
      if (!authorized) return;

      const existing = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: mediaId });
      if (!existing) {
        sendMediaNotFound({ res, mediaId });
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
        sendRemoveFailure({ res, mediaId, reason: removed.reason });
        return;
      }

      // Re-read rather than reconstruct: the marker flip happened in SQL, so this is the one shape
      // guaranteed to match what every other media route returns.
      const media = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: mediaId });
      if (!media) {
        sendMediaNotFound({ res, mediaId });
        return;
      }
      res.json({ media: await toTrashedMediaResponse({ deps, media }) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/** Maps a refused marker flip to its response.
 *  @complexity O(1). */
function sendRemoveFailure({ res, mediaId, reason }: { res: Response; mediaId: string; reason: string }): void {
  // `not-found` can only mean the row went away between the read above and the flip.
  if (reason === "not-found") {
    sendMediaNotFound({ res, mediaId });
    return;
  }
  res.status(409).json({ error: `media '${mediaId}' changed while it was being trashed` });
}

/** The admin response for the re-read asset: recorded type, public URL and stored size, read in parallel.
 *  @complexity O(1) — three independent single-asset lookups. */
async function toTrashedMediaResponse({ deps, media }: { deps: MediaRouteDeps; media: MediaRecord }) {
  const [contentType, publicUrl, byteSizes] = await Promise.all([
    readRecordedContentType(deps, media.source.sha256),
    resolveMediaPublicUrls(deps, [media]).then((urls) => urls.get(media.id) ?? null),
    resolveMediaByteSizes({ deps, media: [media] }),
  ]);
  return toAdminMediaResponse({ media, contentType, publicUrl, byteSize: byteSizes.get(media.source.sha256) ?? null });
}
