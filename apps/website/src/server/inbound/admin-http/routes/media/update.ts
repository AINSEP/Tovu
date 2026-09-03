import { MediaNotFoundError, MediaValidationError, updateMediaMetadata } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { readRecordedContentType } from "./content-type.js";
import type { MediaRouteRegistrar } from "./deps.js";
import { parseOptionalStringField } from "./parse.js";

/**
 * `undefined` (omitted) survives as `undefined`, `null` (explicit clear) survives as `null` rather
 * than coercing through `convert`, and anything else is passed through `convert` — matching
 * `updateMediaMetadata`'s width/height/cssClass undefined/null/value contract (see that input
 * type's doc).
 *
 * @complexity O(1).
 */
function parseOptionalNullableField<T>(raw: unknown, convert: (value: unknown) => T): T | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return convert(raw);
}

/**
 * Reads the seven metadata fields `updateMediaMetadata` accepts off an untyped request body,
 * applying the two field-level parse rules above.
 *
 * `rawBody` is always an object here — `express.json()` sits ahead of every admin route
 * (composition/app.ts) and unconditionally sets `req.body = req.body || {}` before any handler
 * runs (body-parser's own `types/json.js`), so this function's one real caller (`req.body` below)
 * can never hand it `undefined`. The prior `rawBody ?? {}` default was accordingly dead through
 * any real HTTP request; removed rather than covered with an artificial direct-invoke test.
 *
 * @complexity O(1) — reads seven fixed properties.
 */
function parseMediaMetadataPatch(rawBody: unknown) {
  const body = rawBody as Record<string, unknown>;
  return {
    title: parseOptionalStringField(body.title),
    alt: parseOptionalStringField(body.alt),
    caption: parseOptionalStringField(body.caption),
    credit: parseOptionalStringField(body.credit),
    width: parseOptionalNullableField(body.width, Number),
    height: parseOptionalNullableField(body.height, Number),
    cssClass: parseOptionalNullableField(body.cssClass, String),
  };
}

/**
 * PATCH media metadata (title/alt/caption/credit only — `source.sha256` is
 * write-once and this route's input shape has no field for it, matching
 * `updateMediaMetadata`'s contract). Gated by `media.update` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 */
export const registerAdminMediaUpdateRoute: MediaRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId/media/:mediaId", async (req, res) => {
    // No `?? ""` fallback on either `req.params` read in this handler: Express only invokes a
    // route's handler once every `:param` segment in its path matched a non-empty path segment, so
    // `workspaceId`/`mediaId` are always populated strings here — the same guarantee
    // `admin-post-page-delete-routes.test.ts` documents for `pages/delete.ts`'s `pageId`.
    if (req.params.workspaceId !== deps.workspaceId) {
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
        entityId: req.params.mediaId,
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
          id: req.params.mediaId,
          ...parseMediaMetadataPatch(req.body),
        },
      });
      res.json({ media: toAdminMediaResponse(media, await readRecordedContentType(deps, media.source.sha256)) });
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
