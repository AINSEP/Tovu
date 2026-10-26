/** @file Browser analytics composition: the plugin contributes code; existing consent owns release. */
import type { Express } from 'express';
import { captureConsentHtml } from '@jini-ai/cms/consent/express';
import { getEffective } from '@jini-ai/core/settings';
import { injectBrowserAnalytics } from '@jini-ai/analytics/product';
import { TELEMETRY_CONSENT } from './telemetry-consent.js';
import type { RouteDeps } from '#src/server/routes/types';

/** All admin delivery variants (SEA, file, Vite proxy) share the existing bounded HTML capture.
 * Metrics denial is off, matching server telemetry; public cookieless decisions belong to Jini
 * consent. Read per response so a later admin page observes a changed owner setting. O(HTML bytes).
 */
export function applyAdminBrowserAnalytics({ app, deps }: { app: Express; deps: RouteDeps }, _optional = {}): void {
  // Public metadata only: never send the contribution's source, key or endpoint here.
  app.get('/_jini/browser-analytics', (req, res) => {
    const surface = req.query.surface === 'admin' ? 'admin' : 'site';
    res.setHeader('Cache-Control', 'no-store');
    res.json((deps.browserAnalytics?.({ surface }) ?? []).flatMap(item => item.configuration ? [item.configuration.revision] : []));
  });
  app.use(['/admin', '/admin/*'], (_req, res, next) => {
    if (!deps.browserAnalytics) { next(); return; }
    captureConsentHtml({ response: res, transform: async ({ body }) => {
      if (res.statusCode >= 400 || res.getHeader('Content-Encoding')) return body;
      let allowed = false;
      try { allowed = (await getEffective({ repo: deps.settingsRepo }, { ...TELEMETRY_CONSENT, scopeContext: { workspaceId: deps.workspaceId } }))?.value === true; }
      catch { /* A failed consent read never enables browser telemetry. */ }
      const html = injectBrowserAnalytics({ html: body.toString('utf8'), surface: 'admin', delivery: 'live',
        contributions: deps.browserAnalytics?.({ surface: 'admin' }) ?? [], consent: { hasChoice: allowed, analytics: allowed } });
      res.setHeader('Cache-Control', 'private, no-store');
      res.removeHeader('Content-Length'); res.removeHeader('ETag');
      return Buffer.from(html);
    } }, { reportError: () => {}, overflow: async () => null });
    next();
  });
}
