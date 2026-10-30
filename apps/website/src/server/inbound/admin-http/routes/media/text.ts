import type { Express, Response } from 'express';
import { DocumentTextExtractionError, MediaNotFoundError, MediaValidationError, readDocumentText } from '@jini-ai/cms/media';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import type { MediaRouteDeps } from './deps.js';

/** Private source reads share Library tools' 64 KiB UTF-8 paging policy. Authorize before bytes. */
export function registerAdminMediaTextRoute(required: { app: Express; deps: MediaRouteDeps },
  _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  app.get('/api/admin/v1/workspaces/:workspaceId/media/:mediaId/text', async (req, res) => {
    res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff');
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: 'workspace was not found' }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      const id = String(req.params.mediaId);
      const access = await deps.authorize({ principalId: principal.id, permission: 'media.read', workspaceId: deps.workspaceId, entityType: 'media', entityId: id });
      if (!access.allowed) { res.status(403).json({ error: 'media.read is required', code: 'FORBIDDEN' }); return; }
      res.json(await readDocumentText({ deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, blobStore: deps.blobStore, documentTextExtractors: deps.documentTextExtractors },
        input: { workspaceId: deps.workspaceId, id, offset: parseTextOffset(req.query.offset) } }));
    } catch (error) {
      sendTextReadFailure({ res, error });
    }
  });
}

/** An omitted offset pages from byte 0; anything but a run of decimal digits is refused before any read.
 *  @complexity O(n) in the offset's length. */
function parseTextOffset(rawOffset: unknown): number {
  if (rawOffset === undefined) return 0;
  if (typeof rawOffset !== 'string' || !/^\d+$/u.test(rawOffset)) throw new MediaValidationError({ message: 'offset must be a non-negative byte offset' });
  return Number(rawOffset);
}

/** 404 for a missing document, 400 for a refused read, otherwise a private 500.
 *  @complexity O(1). */
function sendTextReadFailure({ res, error }: { res: Response; error: unknown }): void {
  if (error instanceof DocumentTextExtractionError) {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  let status: number;
  if (error instanceof MediaNotFoundError) status = 404;
  else if (error instanceof MediaValidationError) status = 400;
  else status = 500;
  res.status(status).json({ error: status === 500 ? 'internal error' : (error as Error).message });
}
