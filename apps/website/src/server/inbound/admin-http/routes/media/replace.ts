import { replaceMediaFile } from '@jini-ai/cms/media';
import type { Express, Response } from 'express';
import { decodeStrictBase64 } from '#src/contracts/core/index';
import { DEFAULT_ALLOWED_MIME_TYPES, MediaValidationError, TOVU_MAX_UPLOAD_BYTES,
  resolveUploadContentType, type MediaRecord } from '#src/features/media/index';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import type { MediaRouteDeps } from './deps.js';
import { authorizeMediaOrRespond, readRouteParam, rejectForeignWorkspace, sendMediaNotFound,
  sendValidationOrInternalError } from './route-guards.js';
import { toStoredMediaResponse } from './stored-media-response.js';

/** The declared content type and base64 payload, refused unless the filename, type and payload are
 *  all non-empty strings. @complexity O(1). */
function readReplacementFields({ body }: { body: unknown }): { filename: string; contentType: string; dataBase64: string } {
  const values = (body ?? {}) as Record<string, unknown>;
  const { filename, contentType, dataBase64 } = values;
  const validFilename = typeof filename === 'string' && Boolean(filename.trim());
  const validContentType = typeof contentType === 'string' && Boolean(contentType);
  if (!validFilename || !validContentType || typeof dataBase64 !== 'string' || !dataBase64) {
    throw new MediaValidationError({ message: 'filename, contentType, and dataBase64 are required' });
  }
  return { filename, contentType, dataBase64 };
}

/** Decodes and verifies the replacement bytes: strict base64, within the host upload cap, and an
 *  allowed type as sniffed from the bytes (not the declared label). A non-empty strict-base64
 *  payload always decodes to at least one byte, and `replaceMediaFile` refuses empty bytes too.
 *  @complexity O(n) in the payload length. */
function parseReplacement({ body }: { body: unknown }) {
  const { filename, contentType, dataBase64 } = readReplacementFields({ body });
  const bytes = decodeStrictBase64(dataBase64);
  if (!bytes) throw new MediaValidationError({ message: 'dataBase64 is not valid base64' });
  if (bytes.byteLength > TOVU_MAX_UPLOAD_BYTES) {
    throw new MediaValidationError({ message: `uploaded file exceeds the ${TOVU_MAX_UPLOAD_BYTES / (1024 * 1024)} MB size cap` });
  }
  const verified = resolveUploadContentType({ bytes, declaredContentType: contentType });
  if (!DEFAULT_ALLOWED_MIME_TYPES.has(verified)) {
    throw new MediaValidationError({ message: `content type '${verified}' is not allowed for upload` });
  }
  return { bytes, contentType: verified, provenance: { kind: 'upload' as const, path: filename } };
}

/** Loads the asset to replace, or writes the refusal and returns `null`: 404 when it does not exist,
 *  409 when it is trashed, 503 when the repository cannot switch a file transactionally. Runs before
 *  the body is decoded. @complexity O(1) — one indexed lookup. */
async function findReplaceableMedia({ deps, res, id }: { deps: MediaRouteDeps; res: Response; id: string }): Promise<MediaRecord | null> {
  const media = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id });
  if (!media) { sendMediaNotFound({ res, mediaId: id }); return null; }
  if (media.status !== 'active') {
    res.status(409).json({ error: 'trashed media cannot be replaced', code: 'ENTITY_IN_TRASH' }); return null;
  }
  if (typeof deps.mediaRepo.replaceFileIfVersion !== 'function' ||
    typeof deps.mediaRepo.saveRenditionIfSource !== 'function') {
    res.status(503).json({ error: 'media file replacement is unavailable', code: 'MEDIA_REPLACE_UNAVAILABLE' }); return null;
  }
  return media;
}

/** Same JSON upload protocol and per-entity permission as the host's media metadata route.
 * Source replacement is explicit; PATCH metadata still cannot change a source hash. */
export function registerAdminMediaReplaceRoute({ app, deps }: { app: Express; deps: MediaRouteDeps },
  _optional: Record<string, never> = {}): void {
  app.post('/api/admin/v1/workspaces/:workspaceId/media/:mediaId/replace', async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;
    try {
      const id = readRouteParam({ req, name: 'mediaId' });
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeMediaOrRespond({ res, authorize: deps.authorize, params: { principalId: principal.id,
        permission: 'media.update', workspaceId: deps.workspaceId, entityType: 'media', entityId: id } });
      if (!authorized) return;
      const media = await findReplaceableMedia({ deps, res, id });
      if (!media) return;
      const upload = parseReplacement({ body: req.body });
      const saved = await replaceMediaFile({ deps, media, ...upload, principalId: principal.id }, { maxUploadBytes: TOVU_MAX_UPLOAD_BYTES });
      if (!saved) {
        res.status(409).json({ error: 'media changed while replacing its file', code: 'MEDIA_REPLACE_CONFLICT' }); return;
      }
      res.json(await toStoredMediaResponse({ deps, media: saved, contentType: upload.contentType, byteLength: upload.bytes.byteLength }));
    } catch (error) {
      sendValidationOrInternalError({ res, error });
    }
  });
}
