import type { Express } from 'express';
import { findMediaWhereUsed } from '#src/features/media/where-used';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import type { RouteDeps } from '#src/server/routes/types';

export type MediaWhereUsedDeps = Pick<RouteDeps, 'workspaceId' | 'authorize' | 'mediaRepo' | 'entryRefsRepo' | 'postRepo'>;
/** Read-only usage disclosure, sharing the media.read gate and existing workspace isolation. */
export function registerAdminMediaWhereUsedRoute({ app, deps }: { app: Express; deps: MediaWhereUsedDeps }, _optional: Record<string, never> = {}): void {
  app.get('/api/admin/v1/workspaces/:workspaceId/media/:mediaId/where-used', async (req, res) => {
    if (String(req.params.workspaceId ?? '') !== deps.workspaceId) { res.status(404).json({ error: 'workspace was not found' }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      const auth = await deps.authorize({ principalId: principal.id, permission: 'media.read', workspaceId: deps.workspaceId, entityType: 'media' });
      if (!auth.allowed) { res.status(403).json({ error: 'media.read is required', code: 'FORBIDDEN' }); return; }
      const id = String(req.params.mediaId ?? '');
      const media = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!media) { res.status(404).json({ error: 'media was not found' }); return; }
      const whereUsed = await findMediaWhereUsed({ deps, input: { workspaceId: deps.workspaceId, mediaId: media.id, slug: media.slug } });
      res.json({ mediaId: media.id, whereUsed });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
}
