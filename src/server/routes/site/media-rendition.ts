import { ImageTransformUnavailableError, resolveMediaRendition, sniffContentType } from "#src/media/index";
import { parseRangeHeader } from "#src/server/http/range";
import type { MediaRouteRegistrar } from "../admin/media/deps.js";
import { DISALLOWED_INLINE_CONTENT_TYPES, resolveMediaOriginalBlob, sendMediaOriginalResponse } from "../admin/media/original.js";

/**
 * @file Public, unauthenticated media rendition serving route (ADR-027 §4
 * frozen URL contract): `GET /m/{assetId}/{transformName}.v{version}/{slug}.{ext}`.
 *
 * Single-workspace v1 (same disclosed assumption as
 * `routes/site/analytics-ingest.ts`'s `resolveWorkspaceForHost` stub): the
 * frozen URL shape has no workspace segment at all, so this route always
 * resolves against `deps.workspaceId`.
 *
 * `slug`/`ext` (the final path segment) are read only to satisfy Express's
 * routing shape — per ADR-027 §4 they are cosmetic and never participate in
 * the lookup (`resolveMediaRendition` never sees them).
 *
 * This file also owns a second, separate public route (2026-08-24, video/embed capability):
 * `GET /m/{assetId}/original` — see {@link registerMediaOriginalVideoRoute}'s own doc for why
 * video needs a route that bypasses the transform pipeline above entirely, rather than a new
 * `TransformFormat`. Two path segments after `/m/`, never three, so it can never collide with the
 * `{transformName}.v{version}/{slug}.{ext}` shape above regardless of registration order.
 */

const TRANSFORM_SPEC_PATTERN = /^(.+)\.v(\d+)$/;

/**
 * Parses and validates the `{transformName}.v{version}` path segment against `assetId`,
 * returning either the resolved fields or the one-of-two malformed-URL error messages the route
 * has always distinguished. Isolated from the handler so both validation branches (pattern match,
 * version range) live in one place instead of the caller's own complexity budget.
 *
 * @complexity O(1) — one regex match plus two range/shape checks.
 */
function resolveTransformSpec(
  assetId: string,
  transformSpec: string,
): { transformName: string; version: number } | { errorMessage: string } {
  const match = TRANSFORM_SPEC_PATTERN.exec(transformSpec);
  if (!assetId || !match) {
    return { errorMessage: "malformed media rendition URL" };
  }

  const [, transformName, versionText] = match;
  const version = Number(versionText);
  if (!Number.isInteger(version) || version < 1) {
    return { errorMessage: "malformed transform version" };
  }

  return { transformName, version };
}

export const registerMediaRenditionRoute: MediaRouteRegistrar = (app, deps) => {
  app.get("/m/:assetId/:transformSpec/:filename", async (req, res) => {
    const assetId = String(req.params.assetId ?? "");
    const transformSpec = String(req.params.transformSpec ?? "");
    const parsed = resolveTransformSpec(assetId, transformSpec);

    if ("errorMessage" in parsed) {
      res.status(400).json({ error: parsed.errorMessage });
      return;
    }

    const { transformName, version } = parsed;

    try {
      const result = await resolveMediaRendition({
        deps: {
          mediaRepo: deps.mediaRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          transformRepo: deps.transformDefinitionRepo,
          blobStore: deps.blobStore,
          imageTransformer: deps.imageTransformer,
          clock: deps.clock,
          idGen: deps.idGen,
        },
        input: { workspaceId: deps.workspaceId, assetId, transformName, version },
      });

      if (result.outcome === "gone") {
        // ADR-027 §4: a purged/gone asset is `410 no-store`. See
        // `rendition-service.ts`'s doc comment for the disclosed
        // trashed-stands-in-for-purged mapping this build uses.
        res.status(410).set("Cache-Control", "no-store").end();
        return;
      }

      if (result.outcome === "not-found") {
        // Not-yet-generated-and-not-generatable-anonymously (or a wholly
        // unknown assetId/transform) -> short-TTL 404, never the long-lived
        // immutable cache header.
        res.status(404).set("Cache-Control", "public, max-age=60").json({ error: "rendition not found" });
        return;
      }

      res
        .status(200)
        .set("Cache-Control", "public, max-age=31536000, immutable")
        .set("Content-Type", result.contentType)
        .send(Buffer.from(result.bytes));
    } catch (err) {
      if (err instanceof ImageTransformUnavailableError) {
        // The transform is valid and generation was allowed, but the real pixel-operation
        // adapter can't run in this environment (disclosed `sharp`-not-installed blocker — see
        // `image-transformer.sharp.ts`). Service-unavailable, not a routine 404/410/500.
        res.status(503).set("Cache-Control", "no-store").json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * Public, unauthenticated `GET /m/{assetId}/original` — the video/embed capability's real
 * render-path fix (2026-08-24; see the video-embed handoff report for the full investigation).
 *
 * WHY THIS EXISTS RATHER THAN A NEW TRANSFORM: {@link registerMediaRenditionRoute} above always
 * resolves a request through `resolveMediaRendition` (`rendition-service.ts`), which — for any
 * not-yet-generated rendition — calls `imageTransformer.transform()` with the transform
 * definition's `params.format`. `TransformFormat` (`transform-types.ts`) is a closed
 * `"jpeg" | "png" | "webp" | "gif"` union with no video member, and the one core transform this
 * host registers (`media/bootstrap.ts`'s `"public"`, `format: "webp"`) is a `sharp` re-encode —
 * pointing a `<video>` tag's `src` at that same URL would hand raw video bytes to `sharp`, which
 * cannot process them. Extending `TransformFormat`/`imageTransformer` to understand video would
 * mean teaching the ADR-027 §4 "frozen" contract a passthrough format it was never designed for,
 * for a media kind (video) that has no resize/re-encode step to apply in the first place — video
 * is served byte-identical to how it was uploaded, same as every image's own `"original"`
 * passthrough rendition row already is, just without a transform-definition lookup gating it.
 *
 * So this route bypasses the transform system entirely: {@link resolveMediaOriginalBlob} +
 * {@link sendMediaOriginalResponse} are the SAME functions `routes/admin/media/original.ts`'s
 * authenticated admin-preview route already uses (content-type sniffed fresh from bytes, SVG/HTML
 * forced to `application/octet-stream` + `attachment`, `nosniff`/CSP/CORP headers, `Range` support
 * for video seeking) — reused, not reimplemented, so the two routes' security posture can't drift
 * apart. The one behavioral difference from the admin route: no `requireAdminSession`/`media.read`
 * gate, since this URL is meant to sit in a `<video src>` on a public page.
 *
 * VIDEO-ONLY, DELIBERATELY: an asset whose sniffed content type does not start with `"video/"`
 * 404s here rather than serving. This route is not a general "fetch any asset's raw bytes
 * publicly" escape hatch — an image asset must still only ever reach the public web through
 * {@link registerMediaRenditionRoute}'s sanitizing re-encode above. Narrowing to video keeps that
 * existing design intent (every publicly-served image passes through `sharp`) intact; widening
 * this route to other types later is a deliberate future decision, not a side effect of this one.
 *
 * @complexity O(1) plus the byte copy for a partial range (inherited from
 * {@link sendMediaOriginalResponse}).
 */
export const registerMediaOriginalVideoRoute: MediaRouteRegistrar = (app, deps) => {
  app.get("/m/:assetId/original", async (req, res) => {
    const assetId = String(req.params.assetId ?? "");

    try {
      const resolved = await resolveMediaOriginalBlob(deps, res, { workspaceId: deps.workspaceId, mediaId: assetId });
      if (!resolved) {
        return;
      }
      const { blob } = resolved;

      const bytes = await deps.blobStore.get({ storageKey: blob.storageKey });
      const sniffed = sniffContentType(bytes);
      if (!sniffed.startsWith("video/")) {
        // Not a video asset (or an unrecognized/corrupt one) — this route only ever serves video;
        // everything else's public URL is `registerMediaRenditionRoute`'s transform-backed one.
        res.status(404).set("Cache-Control", "public, max-age=60").json({ error: "video rendition not found" });
        return;
      }

      const totalLength = bytes.byteLength;
      const range = parseRangeHeader({ header: req.get("range"), totalLength });
      sendMediaOriginalResponse(res, bytes, range, {
        safe: sniffed,
        forceDownload: DISALLOWED_INLINE_CONTENT_TYPES.has(sniffed),
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
