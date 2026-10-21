/** Theme-authored {"type":"comments"} placement through the shared HTML marker parser. */
import { markersOfType, substituteMarkers, withElementKeptIfAttributed } from '@jini-ai/cms/widgets/markers';
import type { CommentsProviderRegistry } from '@jini-ai/capability-providers/comments';

/** Resolves once per entry/request. No cache is retained across moderation, selection or disable.
 * Marker-free pages do not read comments. Static consumers capture this HTML at export time.
 * @complexity O(h + p), h HTML bytes and p <= 200 rendered comments. */
export async function renderCommentsMarkers(required: {
  html: string; siteId: string; providers?: CommentsProviderRegistry;
  entry: { id: string; slug: string; title: string; canonicalUrl: string; status: string };
}, optional: { cursor?: string } = {}): Promise<string> {
  if (markersOfType({ html: required.html, type: 'comments' }).length === 0) return required.html;
  let html = '';
  if (required.providers && required.entry.status === 'published') {
    const active = await required.providers.active({ siteId: required.siteId });
    if (active.adapter) html = (await active.adapter.renderer.renderThread({ siteId: required.siteId, entry: required.entry, locale: 'en' }, optional)).html;
  }
  return substituteMarkers({ html: required.html, resolve: marker => marker.type === 'comments'
    ? withElementKeptIfAttributed({ marker, inner: `<div data-comments-surface>${html}</div>` }) : undefined });
}
