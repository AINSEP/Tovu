import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { decideMediaOriginalForAsset, lookupMediaOriginalBlob } from "@jini-ai/cms/media";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { MediaRouteRegistrar } from "./deps.js";
import { readRouteParam, rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendMediaOriginalTrashed, writeMediaOriginalReply } from "#src/server/inbound/shared/media-original-writer";

/**
 * @file GET a media asset's ORIGINAL bytes for the admin UI's `<img>`/`<video>`
 * preview (the admin Media screen currently has no byte-serving route at all —
 * `Media.tsx`'s and `media-service.ts`'s file headers both name this gap; the
 * public `routes/site/media-rendition.ts` route only serves named, registered
 * transforms, and `transform_registry` is empty in every real deployment today).
 *
 * Authenticated + workspace-scoped, unlike the public rendition route: gated by
 * `media.read` (SPEC-021 REQ-39/OQ-01, ADR-027 §7) — the same permission
 * `list.ts` requires, since this route serves exactly the assets that route
 * already lists to the same caller, not a separate higher-trust capability.
 * (`media.download_original` also exists in the catalog, but its own doc
 * comment in `Jini packages/user-management/src/core/builtin-permissions.ts` reserves it for a future short-TTL
 * signed-URL MINTING endpoint — a different, not-yet-built capability — not for
 * gating an ordinary authenticated-session preview fetch.)
 *
 * Host shell only: every status/header/body decision (sniffed Content-Type, SVG sanitizing, forced HTML
 * download, nosniff/CSP/CORP, Range, document disposition, trashed/not-found outcomes) lives in
 * `@jini-ai/cms/media`'s original-bytes module, which states the SECURITY argument in full; the Express
 * writer is `inbound/shared/media-original-writer.ts`.
 *
 * Nothing about a media asset's existence is ever revealed to a caller who fails the
 * `requireAdminSession` gate (401, before this handler runs at all) or the
 * `media.read` authorization check immediately below (403, before any
 * `mediaRepo`/`assetBlobRepo` lookup happens) — the trashed-vs-not-found
 * distinction is only ever visible to an already-authorized principal.
 */
export const registerAdminMediaOriginalRoute: MediaRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/media/:mediaId/original", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const mediaId = readRouteParam({ req, name: "mediaId" });
      const authorized = await authorizeDirectOrRespond({ res, authorize: deps.authorize, params: {
        principalId: principal.id,
        permission: "media.read",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: mediaId,
      } });
      if (!authorized) return;

      const lookup = await lookupMediaOriginalBlob({ deps, params: { workspaceId: deps.workspaceId, mediaId } });
      if (lookup.outcome === "not-found") {
        res.status(404).json({ error: `media '${mediaId}' was not found` });
        return;
      }
      if (lookup.outcome === "trashed") {
        sendMediaOriginalTrashed({ res });
        return;
      }
      const reply = await decideMediaOriginalForAsset({ deps, media: lookup.media, blob: lookup.blob, rangeHeader: req.get("range") });
      writeMediaOriginalReply({ res, reply });
    } catch (error) {
      // No typed domain error is thrown on this route's own read path — `media`/`assetBlobRepo`
      // not-found is handled explicitly above via the lookup outcomes, not by catching an error type
      // (unlike the write routes, which call `media-service.ts` functions that throw
      // `MediaNotFoundError`). Anything reaching here is a genuine unexpected failure (e.g. the
      // blob store's `get()` rejecting, or the "data-integrity gap" throw in the lookup).
      sendAdminFailure({ res, error }, { operation: "routes/media/original", code: "INTERNAL_ERROR" });
    }
  });
};
