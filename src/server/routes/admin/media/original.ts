import type { Response } from "express";

import { sniffContentType, type MediaRecord } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { parseRangeHeader, type ParsedRange } from "#src/server/http/range";
import type { MediaRouteDeps, MediaRouteRegistrar } from "./deps.js";

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
 * comment in `identity/permissions.ts` reserves it for a future short-TTL
 * signed-URL MINTING endpoint — a different, not-yet-built capability — not for
 * gating an ordinary authenticated-session preview fetch.)
 *
 * SECURITY — this route serves attacker-influenced bytes. `uploadMedia`
 * validates only a client-supplied `contentType` STRING against an advisory
 * allowlist (`DEFAULT_ALLOWED_MIME_TYPES`); it never inspects the actual bytes,
 * and neither `media` nor `asset_blobs` persists a real content type anywhere
 * (see `media-service.ts`'s file header, point 4). So:
 *  - `Content-Type` is NEVER the client's upload-time string — it is always
 *    `sniffContentType(bytes)`, computed fresh from the bytes this exact
 *    response is about to send (`content-type-sniffer.ts`).
 *  - A sniffed `text/html`/`application/xhtml+xml`/`image/svg+xml` (SVG and
 *    HTML are same-origin stored-XSS vectors if ever rendered inline) is
 *    forced to `application/octet-stream` + `Content-Disposition: attachment`
 *    rather than served as-is — see `DISALLOWED_INLINE_CONTENT_TYPES` below.
 *  - `X-Content-Type-Options: nosniff` is always set, so a browser trusts the
 *    Content-Type this route declares instead of re-sniffing the raw bytes
 *    itself (without this header, the SVG/HTML defusal above is moot — a
 *    sniffing browser could still render forced-`octet-stream` bytes as HTML).
 *  - A restrictive `Content-Security-Policy` and `Cross-Origin-Resource-Policy`
 *    ride along as further defense in depth in case the response is ever
 *    reached by a path other than an `<img>`/`<video>` tag (e.g. direct
 *    navigation to the URL in a new tab).
 *  - `storageKey` is never taken from the request — it only ever comes from
 *    this workspace's own `assetBlobRepo` row, looked up by the media's own
 *    `source.sha256` (mirrors `resolveMediaRendition`'s identical lookup in
 *    `rendition-service.ts`), so there is no path from request input to the
 *    blob store's file-path resolution at all (no traversal surface to guard
 *    beyond "never wire a request field into `storageKey`").
 *  - Trashed assets 410, mirroring `resolveMediaRendition`'s disclosed
 *    trashed-stands-in-for-purged mapping (`rendition-service.ts`'s doc
 *    comment) rather than inventing a new gone/not-found split. Nothing about
 *    a media asset's existence is ever revealed to a caller who fails the
 *    `requireAdminSession` gate (401, before this handler runs at all) or the
 *    `media.read` authorization check immediately below (403, before any
 *    `mediaRepo`/`assetBlobRepo` lookup happens) — the trashed-vs-not-found
 *    distinction is only ever visible to an already-authorized principal.
 *
 * RANGE SUPPORT: `Range: bytes=...` is honored via `parseRangeHeader`
 * (`http/range.ts`) so a `<video>` tag can seek instead of buffering the whole
 * file — see that module's doc comment for the exact malformed/multi-range/
 * out-of-bounds handling this defers to.
 */

/** Sniffed types that must never be served as their literal `Content-Type` — SVG and HTML (and
 * XHTML, which this route blocks even though `sniffContentType` currently folds it into
 * `"text/html"` — see that module's doc comment) are same-origin stored-XSS vectors if a browser
 * ever renders them inline. Kept as an explicit route-level check (rather than only trusting the
 * sniffer's own allowlist shape) so this invariant holds even if `content-type-sniffer.ts` is
 * later extended to recognize more textual formats.
 *
 * Exported (2026-08-24) — `routes/site/media-rendition.ts`'s public video-original route reuses
 * this same check rather than re-declaring it, so the two routes' XSS defusal can't drift apart. */
export const DISALLOWED_INLINE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

/**
 * Looks up the media row and its source blob, or writes the appropriate early response and returns
 * `null` — 404 for an unknown media id, 410 for a trashed one. Isolated so these three sequential
 * guards don't add to the handler's own branch count.
 *
 * Exported (2026-08-24) — `routes/site/media-rendition.ts`'s public video-original route reuses
 * this same lookup/guard sequence rather than re-implementing it (same "own it once, reuse
 * everywhere" split this codebase already applies to `renderImageTag`/`renderWidgetMediaImage`).
 *
 * @throws {Error} the same data-integrity-gap error the pre-extraction route threw, if the media row
 * exists but its source blob does not (see the inline comment at the throw site).
 * @complexity O(1) — two point lookups.
 */
export async function resolveMediaOriginalBlob(
  deps: Pick<MediaRouteDeps, "mediaRepo" | "assetBlobRepo">,
  res: Response,
  params: { workspaceId: string; mediaId: string }
): Promise<{ media: MediaRecord; blob: NonNullable<Awaited<ReturnType<MediaRouteDeps["assetBlobRepo"]["findByHash"]>>> } | null> {
  const media = await deps.mediaRepo.findById({ workspaceId: params.workspaceId, id: params.mediaId });
  if (!media) {
    res.status(404).json({ error: `media '${params.mediaId}' was not found` });
    return null;
  }
  if (media.status === "trashed") {
    res.status(410).set("Cache-Control", "no-store").end();
    return null;
  }

  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: params.workspaceId, sha256: media.source.sha256 });
  if (!blob) {
    // Data-integrity gap, not a routine 404 — `uploadMedia`'s invariant (bytes written before
    // the media row) means this should be unreachable. Mirrors `resolveMediaRendition`'s
    // identical branch in `rendition-service.ts`: thrown, not silently treated as not-found.
    throw new Error(`media '${media.id}': source blob for sha256 '${media.source.sha256}' was not found`);
  }
  return { media, blob };
}

/**
 * Writes the security headers documented in this file's header, then the (possibly range-sliced)
 * body. Isolated so the range-decision branching doesn't add to the handler's own branching — the
 * security reasoning for each header stays in the module doc above, not duplicated here.
 *
 * Exported (2026-08-24) — see {@link resolveMediaOriginalBlob}'s doc for why the public
 * video-original route reuses this instead of a second implementation.
 *
 * @complexity O(1) aside from the byte copy for a partial range.
 */
export function sendMediaOriginalResponse(
  res: Response,
  bytes: Uint8Array,
  range: ParsedRange,
  contentType: { safe: string; forceDownload: boolean }
): void {
  const totalLength = bytes.byteLength;
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'none'; sandbox");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Type", contentType.safe);
  res.set("Accept-Ranges", "bytes");
  if (contentType.forceDownload) {
    res.set("Content-Disposition", "attachment");
  }

  if (range.kind === "unsatisfiable") {
    res.status(416).set("Content-Range", `bytes */${totalLength}`).end();
    return;
  }
  if (range.kind === "range") {
    res
      .status(206)
      .set("Content-Range", `bytes ${range.start}-${range.end}/${totalLength}`)
      .send(Buffer.from(bytes.subarray(range.start, range.end + 1)));
    return;
  }
  res.status(200).send(Buffer.from(bytes));
}

export const registerAdminMediaOriginalRoute: MediaRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/media/:mediaId/original", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const mediaId = String(req.params.mediaId ?? "");
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "media.read",
        workspaceId: deps.workspaceId,
        entityType: "media",
        entityId: mediaId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'media.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "media.read", reason: authResult.reason },
        });
        return;
      }

      const resolved = await resolveMediaOriginalBlob(deps, res, { workspaceId: deps.workspaceId, mediaId });
      if (!resolved) {
        return;
      }
      const { blob } = resolved;

      const bytes = await deps.blobStore.get({ storageKey: blob.storageKey });
      const totalLength = bytes.byteLength;

      const sniffed = sniffContentType(bytes);
      const forceDownload = DISALLOWED_INLINE_CONTENT_TYPES.has(sniffed);
      // Every response here reflects this principal's authorization at request time and may name
      // whether a specific asset is trashed — never shared-cached (mirrors the public rendition
      // route's `no-store` on its own non-ok outcomes; this route applies it to every outcome
      // since none of its bytes are safe to cache across principals/permission changes). See
      // `sendMediaOriginalResponse` for the rest of the security headers.
      const range = parseRangeHeader({ header: req.get("range"), totalLength });
      sendMediaOriginalResponse(res, bytes, range, {
        safe: forceDownload ? "application/octet-stream" : sniffed,
        forceDownload,
      });
    } catch {
      // No typed domain error is thrown on this route's own read path — `media`/`assetBlobRepo`
      // not-found is handled explicitly above via the `null` checks, not by catching an error type
      // (unlike the write routes, which call `media-service.ts` functions that throw
      // `MediaNotFoundError`). Anything reaching here is a genuine unexpected failure (e.g. the
      // blob store's `get()` rejecting, or the "data-integrity gap" throw above).
      res.status(500).json({ error: "internal error" });
    }
  });
};
