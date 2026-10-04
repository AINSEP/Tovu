import { createHash } from 'node:crypto';
import { nowIso } from '@jini-ai/core/primitives';
import type { Express } from 'express';
import { decodeStrictBase64 } from '#src/contracts/core/index';
import { DEFAULT_ALLOWED_MIME_TYPES, MediaValidationError, TOVU_MAX_UPLOAD_BYTES,
  resolveUploadContentType, withSha256Lock, type MediaRecord } from '#src/features/media/index';
import { resolveMediaPublicUrls } from '#src/features/media/tool-registrations';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import { toAdminMediaResponse } from '#src/server/inbound/admin-http/http/media';
import type { MediaRouteDeps } from './deps.js';

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

/** Stage verified bytes before the atomic source switch, under the existing GC/dedup lock.
 * No temporary media identity is created. If the CAS fails, an unreferenced staged blob may
 * remain for the normal orphan sweep; deleting it here could destroy another upload's bytes. */
async function replaceFile({ deps, media, bytes, contentType, principalId }: {
  deps: MediaRouteDeps; media: MediaRecord; bytes: Uint8Array; contentType: string; principalId: string;
}) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const updatedAt = nowIso({ clock: deps.clock });
  return withSha256Lock({ key: sha256, criticalSection: async () => {
    let blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256 });
    if (!blob) {
      const { storageKey } = await deps.blobStore.put({ workspaceId: deps.workspaceId, sha256, bytes });
      blob = { id: deps.idGen.newId(), workspaceId: deps.workspaceId, sha256, storageKey,
        status: 'active', createdAt: updatedAt, createdByPrincipal: principalId };
      await deps.assetBlobRepo.save(blob);
    } else if (blob.status === 'tombstoned') {
      blob = { ...blob, status: 'active', tombstonedAt: undefined };
      await deps.assetBlobRepo.save(blob);
    }
    await deps.mediaContentTypeStore.set({ workspaceId: deps.workspaceId, sha256, contentType });
    const { applied } = await deps.mediaRepo.replaceFileIfVersion!({ workspaceId: deps.workspaceId,
      id: media.id, ifVersion: media.version, sha256, storageKey: blob.storageKey,
      originalRenditionId: deps.idGen.newId(), updatedAt });
    return applied ? { ...media, source: { sha256 }, updatedAt, version: media.version + 1 } : null;
  } });
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
      const saved = await replaceFile({ deps, media, ...upload, principalId: principal.id });
      if (!saved) {
        res.status(409).json({ error: 'media changed while replacing its file', code: 'MEDIA_REPLACE_CONFLICT' }); return;
      }
      const publicUrl = (await resolveMediaPublicUrls(deps, [saved])).get(saved.id) ?? null;
      res.json({ media: toAdminMediaResponse(saved, upload.contentType, publicUrl) });
    } catch (error) {
      res.status(error instanceof MediaValidationError ? 400 : 500).json({
        error: error instanceof MediaValidationError ? error.message : 'internal error',
      });
    }
  });
}
