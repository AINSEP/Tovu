import { MediaValidationError, uploadMedia } from "../../../../media";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import { toAdminMediaResponse } from "../../../http/admin/media";
import type { MediaRouteRegistrar } from "./deps";

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

    const filename = String(req.body?.filename ?? "");
    const contentType = String(req.body?.contentType ?? "");
    const dataBase64 = req.body?.dataBase64;
    if (!filename || !contentType || typeof dataBase64 !== "string" || !dataBase64) {
      res.status(400).json({ error: "filename, contentType, and dataBase64 are required" });
      return;
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(dataBase64, "base64"));
    } catch {
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
          alt: req.body?.alt !== undefined ? String(req.body.alt) : undefined,
          caption: req.body?.caption !== undefined ? String(req.body.caption) : undefined,
          credit: req.body?.credit !== undefined ? String(req.body.credit) : undefined,
          createdByPrincipal: principal.id,
        },
      });

      res.status(201).json({ media: toAdminMediaResponse(media) });
    } catch (err) {
      if (err instanceof MediaValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
