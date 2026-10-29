import type { Express } from 'express';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import type { ToolGapsToolDeps } from '#src/assistant/host-ports';

/** Owner-only Observability filter over the existing tool audit store. No mutation endpoint. */
export function registerAdminToolGapsRoute(app: Express, deps: ToolGapsToolDeps): void {
  app.get('/api/admin/v1/workspaces/:workspaceId/system/tool-gaps', async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ error: 'workspace was not found' }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (principal.id !== await deps.ownerPrincipalId) { res.status(403).json({ error: 'Only the owner can read tool gaps.', code: 'FORBIDDEN' }); return; }
      if (!deps.toolGaps) { res.status(503).json({ error: 'Tool gap audit storage is unavailable.' }); return; }
      res.json({ entries: await deps.toolGaps.list({ workspaceId: deps.workspaceId, principalId: principal.id }, {}) });
    } catch {
      console.error('[tool-gaps] audit read failed');
      res.status(500).json({ error: 'Could not read tool gaps.', code: 'INTERNAL_ERROR' });
    }
  });
}
