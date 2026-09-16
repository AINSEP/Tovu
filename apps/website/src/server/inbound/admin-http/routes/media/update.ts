import { MediaConflictError, MediaNotFoundError, MediaValidationError, updateMediaMetadata } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import { readRecordedContentType } from "./content-type.js";
import type { MediaRouteRegistrar } from "./deps.js";
import { parseOptionalSlugField, parseOptionalStringField, parseOptionalTitleField } from "./parse.js";

/**
 * `undefined` (omitted) survives as `undefined`, `null` (explicit clear) survives as `null` rather
 * than coercing through `convert`, and anything else is passed through `convert` — matching
 * `updateMediaMetadata`'s width/height/cssClass undefined/null/value contract (see that input
 * type's doc). Deliberately distinct from `parse.js`'s string-field parsers: `width`/`height`/
 * `cssClass` accept `null` all the way through to the service layer, which has its own clear
 * semantics for them, whereas `alt`/`caption`/`credit`/`title` are mapped or rejected in `parse.js`
 * before they ever reach `updateMediaMetadata` (see that module's doc for why).
 *
 * @complexity O(1).
 */
function parseOptionalNullableField<T>(raw: unknown, convert: (value: unknown) => T): T | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return convert(raw);
}

/**
 * Reads the eight metadata fields `updateMediaMetadata` accepts off an untyped request body,
 * applying the field-level parse rules above. A missing body coerces to `{}` so every field
 * reads as omitted rather than throwing on a property access — the pre-extraction route made the
 * same allowance via `req.body?.field`.
 *
 * `slug` (2026-09-07) joins the fixed key list `updateMediaMetadata` reads — this function silently
 * dropping an unrecognized key is exactly the trap that would have made `slug` a no-op PATCH before
 * this line was added (see `ADS-memory/reports/2026-09-07-media-admin-ui.md`'s "the trap" for the
 * confirmed mechanism: a 200 response with every OTHER field's change applied and no error at all).
 *
 * @complexity O(1) — reads nine fixed properties.
 */
function parseMediaMetadataPatch(rawBody: unknown) {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    title: parseOptionalTitleField(body.title),
    slug: parseOptionalSlugField(body.slug),
    alt: parseOptionalStringField(body.alt, "alt"),
    caption: parseOptionalStringField(body.caption, "caption"),
    credit: parseOptionalStringField(body.credit, "credit"),
    width: parseOptionalNullableField(body.width, Number),
    height: parseOptionalNullableField(body.height, Number),
    cssClass: parseOptionalNullableField(body.cssClass, String),
    // Format/allowlist validation happens entirely in `updateMediaMetadata`
    // (`@jini-ai/cms/media`'s `resolveHtmlAttributesForUpdate`) — this parser's only job is the same
    // undefined-vs-provided/wrong-JSON-type boundary every other field parser in this file owns.
    htmlAttributes: parseOptionalNullableField(body.htmlAttributes, String),
  };
}

/** One mapped error response: the exact status/body this route has always returned for it. */
interface MediaUpdateErrorResponse {
  readonly status: number;
  readonly body: { readonly error: string };
}

/**
 * Maps a thrown `updateMediaMetadata` error to the status/body this route has always returned for
 * it, one function per error type — same table-shaped pattern
 * `custom-credentials/tool-registrations.ts`'s `mapCreateCredentialError` uses for the same reason
 * (source-complexity-drift ceiling: an inline instanceof chain inside the route handler's own
 * try/catch pushed it over 9). Anything not one of the three known error types falls through to a
 * generic 500, matching this route's prior behavior exactly.
 *
 * @complexity O(1) — three `instanceof` checks.
 */
function mapMediaUpdateError(err: unknown): MediaUpdateErrorResponse {
  if (err instanceof MediaNotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof MediaValidationError) return { status: 400, body: { error: err.message } };
  // A slug collision — either `resolveSlugForUpdate`'s own app-level courtesy check, or (on a
  // genuine race) `SqliteMediaRepo.save()`'s translated UNIQUE-constraint catch; both throw the
  // same `MediaConflictError` so this route needs only one branch regardless of which layer
  // caught it. 409, not 400: the request is well-formed, it just collides with existing state.
  if (err instanceof MediaConflictError) return { status: 409, body: { error: err.message } };
  return { status: 500, body: { error: "internal error" } };
}

/**
 * PATCH media metadata (title/slug/alt/caption/credit/width/height/cssClass — `source.sha256` is
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
      res.json({ media: toAdminMediaResponse(media, await readRecordedContentType(deps, media.source.sha256)) });
    } catch (err) {
      const { status, body } = mapMediaUpdateError(err);
      res.status(status).json(body);
    }
  });
};
