import type { JsonObject } from '@jini-ai/core/primitives';
import { requireWidgetsPermissionOrRespond, mapWidgetErrorToResponse } from '#src/server/inbound/admin-http/http/widgets';
import type { RouteDeps, RouteRegistrar } from '#src/server/routes/types';
import { renderWidgetPreview, type WidgetPreviewInput } from './preview-render.js';

/** A JSON object config, bounded before entering the registry's own type-specific validation.
 * @complexity O(n) for the serialized request size (at most 128 KiB).
 */
export function parseWidgetPreviewBody({ raw }: { raw: unknown }, _optional: Record<string, never> = {}): WidgetPreviewInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== 'widgetType' && key !== 'content')) return null;
  if (typeof body.widgetType !== 'string' || body.widgetType.length > 100) return null;
  if (typeof body.content !== 'object' || body.content === null || Array.isArray(body.content)) return null;
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 131072) return null;
  return { widgetType: body.widgetType, content: body.content as JsonObject };
}

/** Admin middleware authenticates this route, just like saved-widget routes. This local guard
 * also fails closed for direct invocation; permission/workspace checks precede rendering.
 */
export function registerAdminWidgetPreviewRoute(
  app: Parameters<RouteRegistrar>[0], deps: RouteDeps,
  { render = renderWidgetPreview }: { render?: typeof renderWidgetPreview } = {},
): void {
  app.post('/api/admin/v1/workspaces/:workspaceId/widgets/preview', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!res.locals.principal) { res.status(401).json({ error: 'authentication required' }); return; }
    if (String(req.params.workspaceId ?? '') !== deps.workspaceId) {
      res.status(404).json({ error: 'workspace was not found' }); return;
    }
    try {
      if (!await requireWidgetsPermissionOrRespond(deps.authorize, deps.workspaceId, 'widgets.read', res)) return;
      const input = parseWidgetPreviewBody({ raw: req.body });
      if (!input) { res.status(400).json({ error: 'widgetType and content are required', code: 'VALIDATION_ERROR' }); return; }
      res.json(await render({ deps, input }));
    } catch (error) { mapWidgetErrorToResponse(error, res); }
  });
}
