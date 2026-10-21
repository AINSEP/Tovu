/** Quick wins A: an admin adapter over the same guarded fetch and upload pipeline as the tool. */
import type { Express } from "express";
import { buildImportFilename, MediaImportValidationError } from "@jini-ai/cms/media/import";
import { MediaValidationError, TOVU_MAX_UPLOAD_BYTES, uploadMedia } from "#src/features/media/index";
import { fetchImage } from "#src/features/media-import/fetch-image";
import { resolveMediaPublicUrls } from "#src/features/media/tool-registrations";
import { EgressRefusedError } from "#src/platform/http/index";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toAdminMediaResponse } from "#src/server/inbound/admin-http/http/media";
import type { MediaRouteDeps } from "./deps.js";
import { parseOptionalStringField } from "./parse.js";

export type MediaImportUrlRouteDeps = MediaRouteDeps & Pick<RouteDeps, "mediaImportHttpClient">;

function parseImportInput(required: { body: unknown }, _optional: Record<string, never> = {}) {
  const { body } = required;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new MediaImportValidationError({ message: "url is required" });
  }
  const input = body as Record<string, unknown>;
  if (typeof input.url !== "string" || !input.url.trim()) {
    throw new MediaImportValidationError({ message: "url is required" });
  }
  return {
    url: input.url.trim(),
    filename: parseOptionalStringField(input.filename, "filename"),
    alt: parseOptionalStringField(input.alt, "alt"),
    caption: parseOptionalStringField(input.caption, "caption"),
    credit: parseOptionalStringField(input.credit, "credit"),
  };
}

/** Permission checks precede all outbound I/O; rejected bytes never reach uploadMedia.
 * @complexity O(n) in bounded downloaded bytes, plus fixed-count repository calls. */
export function registerAdminMediaImportUrlRoute(
  required: { app: Express; deps: MediaImportUrlRouteDeps },
  optional: { logEgressRefusal?: (line: string) => void } = {},
): void {
  const { app, deps } = required;
  app.post("/api/admin/v1/workspaces/:workspaceId/media/import-url", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const auth = await deps.authorize({ principalId: principal.id, permission: "media.upload", workspaceId: deps.workspaceId, entityType: "media" });
      if (!auth.allowed) {
        res.status(403).json({ error: "not authorized for media.upload", code: "FORBIDDEN", details: { permission: "media.upload", reason: auth.reason } });
        return;
      }
      const input = parseImportInput({ body: req.body });
      // This is the dedicated MEDIA_IMPORT_EGRESS_POLICY client from composition, never the
      // credentialed-request client (which has a smaller cap and a different redirect policy).
      const fetched = await fetchImage({ deps: { httpClient: deps.mediaImportHttpClient }, url: input.url });
      const { media } = await uploadMedia({
        deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
        input: {
          workspaceId: deps.workspaceId, bytes: fetched.bytes, contentType: fetched.contentType,
          filename: buildImportFilename({ url: fetched.url, contentType: fetched.contentType }, { override: input.filename }),
          alt: input.alt, caption: input.caption, credit: input.credit, createdByPrincipal: principal.id,
        },
      }, { maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });
      // As with the assistant import and human upload, a failure here must not report success:
      // the next rendition needs the persisted sniffed type to serve this blob correctly.
      await deps.mediaContentTypeStore.set({ workspaceId: deps.workspaceId, sha256: media.source.sha256, contentType: fetched.contentType });
      const publicUrl = (await resolveMediaPublicUrls(deps, [media])).get(media.id) ?? null;
      res.status(201).json({ media: toAdminMediaResponse({ media, contentType: fetched.contentType, publicUrl, byteSize: fetched.bytes.byteLength }) });
    } catch (error) {
      if (error instanceof EgressRefusedError) {
        // Full DNS diagnosis is operator-log-only, matching the assistant tool's refusal contract.
        (optional.logEgressRefusal ?? console.warn)(`[media-import] admin URL import refused: ${error.message}`);
        res.status(400).json({ error: error.callerSafeMessage });
      } else if (error instanceof MediaImportValidationError || error instanceof MediaValidationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "internal error" });
      }
    }
  });
}
