import type { Request, Response } from "express";

import { MediaValidationError, sniffContentType, uploadMedia } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import type { MediaRouteRegistrar } from "./deps.js";
import { parseOptionalStringField } from "./parse.js";

/** The three required upload fields plus the three optional metadata fields, parsed off an untyped
 *  body in one place, or `null` if a required field is missing or the wrong shape. `dataBase64` must
 *  be a non-empty string — an absent or non-string value is rejected here rather than reaching
 *  `Buffer.from`. `alt`/`caption`/`credit` go through `parse.js`'s `parseOptionalStringField`, which
 *  throws `MediaValidationError` for a non-string, non-null, non-undefined value — the caller MUST
 *  invoke this inside a `try`/`catch` (or otherwise catch synchronously), not treat it as
 *  throw-free the way the `null` return above is. On upload there is no existing value to preserve,
 *  so an explicit `null` here is equivalent to omitting the field (both end up `""` — see
 *  `uploadMedia`'s `input.alt?.trim() ?? ""`), unlike `update.ts`'s PATCH route where `null` clears
 *  a possibly-non-empty existing value.
 *  @complexity O(1). */
function parseUploadRequestFields(rawBody: unknown): {
  filename: string;
  contentType: string;
  dataBase64: string;
  alt: string | undefined;
  caption: string | undefined;
  credit: string | undefined;
} | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const filename = String(body.filename ?? "");
  const contentType = String(body.contentType ?? "");
  const dataBase64 = body.dataBase64;
  if (!filename || !contentType || typeof dataBase64 !== "string" || !dataBase64) {
    return null;
  }
  return {
    filename,
    contentType,
    dataBase64,
    alt: parseOptionalStringField(body.alt, "alt"),
    caption: parseOptionalStringField(body.caption, "caption"),
    credit: parseOptionalStringField(body.credit, "credit"),
  };
}

/**
 * Runs {@link parseUploadRequestFields} and turns both of its failure modes — a thrown
 * `MediaValidationError` (malformed `alt`/`caption`/`credit`) and a `null` return (a required field
 * missing or the wrong shape) — into an already-written 400 response, returning `null` either way
 * so the route handler can bail with one `if (!fields) return;` instead of nesting its own
 * try/catch. Pulled out of the handler to stay under this repo's complexity ceiling, and because
 * this synchronous parse call must be caught here rather than left to the handler's own try/catch
 * further down: Express 4 does not catch a synchronous throw from an async handler outside a
 * try/catch (see the `getAuthedPrincipal` comment below) — an uncaught throw here would hang the
 * request instead of 400ing it.
 *
 * @complexity O(1).
 */
function parseUploadRequestFieldsOrRespond(
  req: Request,
  res: Response
): ReturnType<typeof parseUploadRequestFields> {
  let fields: ReturnType<typeof parseUploadRequestFields>;
  try {
    fields = parseUploadRequestFields(req.body);
  } catch (err) {
    res.status(err instanceof MediaValidationError ? 400 : 500).json({
      error: err instanceof MediaValidationError ? err.message : "internal error",
    });
    return null;
  }
  if (!fields) {
    res.status(400).json({ error: "filename, contentType, and dataBase64 are required" });
  }
  return fields;
}

/** Decodes base64 upload bytes, or `null` if `dataBase64` is not valid base64.
 *  @complexity O(n) in the encoded payload length. */
function decodeUploadBytes(dataBase64: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(dataBase64, "base64"));
  } catch {
    return null;
  }
}

/**
 * POST a new media upload. Gated by `media.upload` (SPEC-021 REQ-39/OQ-01, ADR-027 §7).
 *
 * Request body is JSON with base64-encoded bytes (`dataBase64`) rather than a
 * multipart/form-data stream — this repo has no multipart-parsing dependency
 * yet (no `multer` in `package.json`), and adding one is out of scope for this
 * walking skeleton. This is a real, disclosed simplification: a production
 * upload path should stream bytes (multipart or raw octet-stream), not
 * base64-inflate them through JSON. `express.json()`'s body-size limit was
 * bumped in `server/app.ts` to accommodate this (see that file's comment).
 */
export const registerAdminMediaUploadRoute: MediaRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/media", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const fields = parseUploadRequestFieldsOrRespond(req, res);
    if (!fields) return;
    const { filename, contentType, dataBase64, alt, caption, credit } = fields;

    const bytes = decodeUploadBytes(dataBase64);
    if (!bytes) {
      res.status(400).json({ error: "dataBase64 is not valid base64" });
      return;
    }

    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "media.upload",
        workspaceId: deps.workspaceId,
        entityType: "media",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'media.upload' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "media.upload", reason: authResult.reason },
        });
        return;
      }

      const { media } = await uploadMedia({
        deps: {
          clock: deps.clock,
          idGen: deps.idGen,
          mediaRepo: deps.mediaRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          blobStore: deps.blobStore,
        },
        input: {
          workspaceId: deps.workspaceId,
          bytes,
          filename,
          contentType,
          alt,
          caption,
          credit,
          createdByPrincipal: principal.id,
        },
      });

      // Record what the bytes ACTUALLY are, not the `contentType` the client declared. Both
      // `uploadMedia`'s allowlist check above and `original.ts`'s serving path already treat that
      // declared string as untrusted (see this repo's `original.ts` file header: "`Content-Type`
      // is NEVER the client's upload-time string"), so the admin's type filter must agree with the
      // sniffed answer or an operator's "Images" tab would disagree with what their browser is
      // served. Written AFTER `uploadMedia` because the blob row it updates is created there.
      const sniffedContentType = sniffContentType(bytes);
      await deps.mediaContentTypeStore.set({
        workspaceId: deps.workspaceId,
        sha256: media.source.sha256,
        contentType: sniffedContentType,
      });

      res.status(201).json({ media: toAdminMediaResponse(media, sniffedContentType) });
    } catch (err) {
      if (err instanceof MediaValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
