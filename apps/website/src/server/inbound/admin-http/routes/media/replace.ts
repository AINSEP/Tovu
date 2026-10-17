import { replaceMediaFile } from '@jini-ai/cms/media';
import type { Express } from 'express';
import { decodeStrictBase64 } from '#src/contracts/core/index';
import { DEFAULT_ALLOWED_MIME_TYPES, MediaValidationError, TOVU_MAX_UPLOAD_BYTES,
  resolveUploadContentType } from '#src/features/media/index';
import { resolveMediaPublicUrls } from '#src/features/media/tool-registrations';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import { toAdminMediaResponse } from '#src/server/inbound/admin-http/http/media';
import type { MediaRouteDeps } from './deps.js';
import { resolveMediaByteSizes } from './byte-size.js';

function parseReplacement({ body }: { body: unknown }) {
  const values = (body ?? {}) as Record<string, unknown>;
  const { filename, contentType, dataBase64 } = values;
  if (typeof filename !== 'string' || !filename.trim() || typeof contentType !== 'string' || !contentType ||
    typeof dataBase64 !== 'string' || !dataBase64) {
    throw new MediaValidationError({ message: 'filename, contentType, and dataBase64 are required' });
  }
  const bytes = decodeStrictBase64(dataBase64);
  if (!bytes) throw new MediaValidationError({ message: 'dataBase64 is not valid base64' });
  if (!bytes.byteLength) throw new MediaValidationError({ message: 'uploaded file is empty' });
  if (bytes.byteLength > TOVU_MAX_UPLOAD_BYTES) {
    throw new MediaValidationError({ message: `uploaded file exceeds the ${TOVU_MAX_UPLOAD_BYTES / (1024 * 1024)} MB size cap` });
  }
  const verified = resolveUploadContentType({ bytes, declaredContentType: contentType });
  if (!DEFAULT_ALLOWED_MIME_TYPES.has(verified)) {
    throw new MediaValidationError({ message: `content type '${verified}' is not allowed for upload` });
  }
  return { bytes, contentType: verified };
}

/** Same JSON upload protocol and per-entity permission as the host's media metadata route.
 * Source replacement is explicit; PATCH metadata still cannot change a source hash. */
export function registerAdminMediaReplaceRoute({ app, deps }: { app: Express; deps: MediaRouteDeps },
  _optional: Record<string, never> = {}): void {
  app.post('/api/admin/v1/workspaces/:workspaceId/media/:mediaId/replace', async (req, res) => {
    if (String(req.params.workspaceId ?? '') !== deps.workspaceId) {
      res.status(404).json({ error: 'workspace was not found' }); return;
    }
    try {
      const id = String(req.params.mediaId ?? '');
      const principal = getAuthedPrincipal(res);
      const auth = await deps.authorize({ principalId: principal.id, permission: 'media.update',
        workspaceId: deps.workspaceId, entityType: 'media', entityId: id });
      if (!auth.allowed) {
        res.status(403).json({ error: `principal '${principal.id}' is not authorized for 'media.update' (${auth.reason})`,
          code: 'FORBIDDEN', details: { permission: 'media.update', reason: auth.reason } }); return;
      }
      const media = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!media) { res.status(404).json({ error: `media '${id}' was not found` }); return; }
      if (media.status !== 'active') {
        res.status(409).json({ error: 'trashed media cannot be replaced', code: 'ENTITY_IN_TRASH' }); return;
      }
      if (typeof deps.mediaRepo.replaceFileIfVersion !== 'function' ||
        typeof deps.mediaRepo.saveRenditionIfSource !== 'function') {
        res.status(503).json({ error: 'media file replacement is unavailable', code: 'MEDIA_REPLACE_UNAVAILABLE' }); return;
      }
      const upload = parseReplacement({ body: req.body });
      const saved = await replaceMediaFile({ deps, media, ...upload, principalId: principal.id }, { maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });
      if (!saved) {
        res.status(409).json({ error: 'media changed while replacing its file', code: 'MEDIA_REPLACE_CONFLICT' }); return;
      }
      const publicUrl = (await resolveMediaPublicUrls(deps, [saved])).get(saved.id) ?? null;
      const byteSize = upload.contentType === "image/svg+xml"
        ? (await resolveMediaByteSizes({ deps, media: [saved] })).get(saved.source.sha256) ?? null
        : upload.bytes.byteLength;
      res.json({ media: toAdminMediaResponse({ media: saved, contentType: upload.contentType, publicUrl, byteSize }) });
    } catch (error) {
      res.status(error instanceof MediaValidationError ? 400 : 500).json({
        error: error instanceof MediaValidationError ? error.message : 'internal error',
      });
    }
  });
}
