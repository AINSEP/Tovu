import { ImageTransformUnavailableError, resolveMediaRendition } from "#src/media/index";
import type { MediaRouteRegistrar } from "../admin/media/deps.js";

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
