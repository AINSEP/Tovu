import { MediaNotFoundError, MediaValidationError, updateMediaMetadata } from "#src/media/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import { toAdminMediaResponse } from "#src/server/http/admin/media";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * `undefined` means "field omitted, leave it alone"; only a genuinely-provided value gets
 * `String(...)`'d. Unlike `parseOptionalNullableField` below, there is no `null`-clear case here —
 * `updateMediaMetadata` gives title/alt/caption/credit no clear semantics, so a literal `null` is
 * stringified to `"null"` same as any other value, matching the route's pre-extraction behavior.
 *
 * @complexity O(1).
 */
function parseOptionalStringField(raw: unknown): string | undefined {
  return raw === undefined ? undefined : String(raw);
}

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
 * applying the two field-level parse rules above. A missing body coerces to `{}` so every field
 * reads as omitted rather than throwing on a property access — the pre-extraction route made the
 * same allowance via `req.body?.field`.
 *
 * @complexity O(1) — reads seven fixed properties.
 */
function parseMediaMetadataPatch(rawBody: unknown) {
  const body = (rawBody ?? {}) as Record<string, unknown>;
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
          ...parseMediaMetadataPatch(req.body),
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
