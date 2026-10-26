import { MAX_DOCUMENT_BYTES, documentContentType, type MediaKind } from "@jini-ai/cms/media";
import { createDocumentArchiveReader } from "#src/features/media/document-archive";
import type { Request, Response } from "express";

import { MediaConflictError, MediaValidationError, resolveUploadContentType, TOVU_MAX_UPLOAD_BYTES, uploadMedia } from "#src/features/media/index";
import { decodeStrictBase64 } from "#src/contracts/core/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { MediaRouteRegistrar } from "./deps.js";
import { parseOptionalStringField } from "./parse.js";
import { authorizeMediaOrRespond, rejectForeignWorkspace, sendValidationOrInternalError } from "./route-guards.js";
import { toStoredMediaResponse } from "./stored-media-response.js";

/** An upload request's fields after {@link parseUploadRequestFields}. */
interface UploadRequestFields {
  kind: MediaKind;
  filename: string;
  contentType: string;
  dataBase64: string;
  alt: string | undefined;
  caption: string | undefined;
  credit: string | undefined;
}

/** An omitted `kind` is an ordinary media upload; anything other than `media`/`document` is refused.
 *  @complexity O(1). */
function parseUploadKind(raw: unknown): MediaKind {
  const kind = raw ?? "media";
  if (kind !== "media" && kind !== "document") throw new MediaValidationError({ message: "invalid media kind" });
  return kind;
}

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
function parseUploadRequestFields(rawBody: unknown): UploadRequestFields | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const kind = parseUploadKind(body.kind);
  const filename = typeof body.filename === "string" ? body.filename : "";
  const contentType = String(body.contentType ?? "");
  const dataBase64 = body.dataBase64;
  if (!filename || (kind === "media" && !contentType) || typeof dataBase64 !== "string" || !dataBase64) {
    return null;
  }
  return {
    kind,
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
  } catch (error) {
    sendValidationOrInternalError({ res, error });
    return null;
  }
  if (!fields) {
    res.status(400).json({ error: "filename, contentType, and dataBase64 are required" });
  }
  return fields;
}

/**
 * Decodes the upload's bytes and verifies their content type, throwing `MediaValidationError` for
 * an over-long document payload or invalid base64.
 *
 * @complexity O(n) in the encoded payload length.
 */
function decodeUploadPayload(
  { kind, filename, contentType, dataBase64 }: Pick<UploadRequestFields, "kind" | "filename" | "contentType" | "dataBase64">,
): { bytes: Uint8Array; contentType: string } {
  // Refuse document base64 inflation before allocation, then let the shared ingress owner
  // check actual bytes. Authorization precedes decoding, archive work, and storage I/O.
  if (kind === "document" && dataBase64.length > 4 * Math.ceil(MAX_DOCUMENT_BYTES / 3)) {
    throw new MediaValidationError({ message: "document exceeds the 10 MiB limit" });
  }
  // `decodeStrictBase64`, not `Buffer.from(x, "base64")`: the latter never throws (it skips
  // characters outside the alphabet instead of refusing them), so a bare try/catch around it can
  // never fire — see that function's own header.
  const bytes = decodeStrictBase64(dataBase64);
  if (!bytes) throw new MediaValidationError({ message: "dataBase64 is not valid base64" });
  // Trust sniffed bytes rather than the client label. HTML/unknown bytes are rejected;
  // uploadMedia sanitizes accepted SVG before hashing/storage.
  const verified = kind === "document" ? documentContentType({ filename }) : resolveUploadContentType({ bytes, declaredContentType: contentType });
  return { bytes, contentType: verified };
}

/** A coarse size label for the upload product event: the exact byte count is never sent. */
function bytesBucket(bytes: number): string {
  if (bytes < 100_000) return "<100KB";
  if (bytes < 1_000_000) return "<1MB";
  return bytes < 10_000_000 ? "<10MB" : "10MB+";
}

/** Slug allocation is a courtesy lookup before save. Concurrent uploads can choose the same free
 *  slug; the durable repo enforces uniqueness with `MediaConflictError` (409). Otherwise a validation
 *  failure is 400 and anything else a private 500.
 *  @complexity O(1). */
function sendUploadFailure({ res, error }: { res: Response; error: unknown }): void {
  if (error instanceof MediaConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  sendValidationOrInternalError({ res, error });
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
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const fields = parseUploadRequestFieldsOrRespond(req, res);
    if (!fields) return;
    const { kind, filename, alt, caption, credit } = fields;

    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeMediaOrRespond({ res, authorize: deps.authorize, params: {
        principalId: principal.id,
        permission: "media.upload",
        workspaceId: deps.workspaceId,
        entityType: "media",
      } });
      if (!authorized) return;

      const { bytes, contentType: verifiedContentType } = decodeUploadPayload(fields);

      const { media } = await uploadMedia({
        deps: {
          clock: deps.clock,
          idGen: deps.idGen,
          mediaRepo: deps.mediaRepo,
          blobRepo: deps.assetBlobRepo,
          renditionRepo: deps.assetRenditionRepo,
          blobStore: deps.blobStore,
          documentArchiveReader: createDocumentArchiveReader({}),
        },
        input: {
          workspaceId: deps.workspaceId,
          kind,
          bytes,
          filename,
          contentType: verifiedContentType,
          alt,
          caption,
          credit,
          createdByPrincipal: principal.id,
        },
      }, { maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });

      // Only media uses the per-blob sniff cache; document type is its validated filename policy.
      // Record the sniffed type so the admin's type filter agrees with what `original.ts` serves
      // (it never trusts the upload-time string either). Written AFTER `uploadMedia` because the
      // blob row it updates is created there.
      if (kind === "media") await deps.mediaContentTypeStore.set({
        workspaceId: deps.workspaceId,
        sha256: media.source.sha256,
        contentType: verifiedContentType,
      });

      deps.productAnalytics?.capture({ name: "media_uploaded", userId: principal.id, properties: {
        kind: kind === "media" ? verifiedContentType.split("/")[0]! : "document", bytesBucket: bytesBucket(bytes.byteLength) } });
      res.status(201).json(await toStoredMediaResponse({ deps, media, contentType: verifiedContentType, byteLength: bytes.byteLength }));
    } catch (error) {
      sendUploadFailure({ res, error });
    }
  });
};
