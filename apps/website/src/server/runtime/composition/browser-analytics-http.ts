/** @file Same-origin provider delivery, admitted by the site's existing consent owner. */
import express, { type Express, type Request, type Response } from 'express';
import { getEffective } from '@jini-ai/core/settings';
import { readRequestBrowserAnalyticsMode } from '@jini-ai/cms/consent/express';
import type { RouteDeps } from '#src/server/routes/types';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { createSiteConsentPorts, resolveSiteConsentOrigin } from '../../inbound/public-http/middleware/site-consent.js';
import { currentCredential } from '../../inbound/admin-http/dev-auth.js';
import { TELEMETRY_CONSENT } from './telemetry-consent.js';

/** Require a same-origin browser POST; never trust a caller's chosen upstream URL. O(1). */
function sameOrigin({ request }: { request: Request }, _options = {}): boolean {
  try { return new URL(request.get('origin') ?? '').origin === resolveSiteConsentOrigin({ request }); }
  catch { return false; }
}

/** Assets are inert until imported by the bridge. Collection needs an explicit visitor choice;
 * admin collection follows the operator setting, independently of the public banner. O(1) reads. */
export function applyBrowserAnalyticsHttp({ app, deps }: { app: Express; deps: RouteDeps }, _options = {}): void {
  const ports = createSiteConsentPorts({ deps }, { trustedRegionHeader: deps.consentTrustedRegionHeader });
  const limiter = createRateLimiter({ profile: { windowSeconds: 60, max: 120, burst: 20 }, clock: deps.clock });
  app.use('/_jini/browser-analytics', express.raw({ type: () => true, limit: '256kb' }), async (request, response, next) => {
    const surface = request.path.split('/')[2];
    if (surface !== 'site' && surface !== 'admin') { next(); return; }
    response.setHeader('Cache-Control', 'private, no-store');
    try {
      const fullPath = '/_jini/browser-analytics' + request.path;
      const contribution = deps.browserAnalytics?.({ surface }).find(item => item.http && fullPath.startsWith(item.http.path + '/'));
      if (!contribution?.http) { response.status(404).end(); return; }
      if (request.method !== 'GET') {
        const allowed = await collectionAllowed({ request, deps, ports, surface });
        if (!allowed) { response.status(403).end(); return; }
        if (!(await limiter.check({ key: resolveClientIp(request) })).allowed) { response.status(429).end(); return; }
      }
      await deliver({ request, response, http: contribution.http, fullPath });
    } catch { response.status(502).end(); }
  });
}

/** No cookie or proof crosses the provider port. Failed receipt/setting reads deny delivery. O(1). */
async function collectionAllowed({ request, deps, ports, surface }: {
  request: Request; deps: RouteDeps; ports: ReturnType<typeof createSiteConsentPorts>; surface: 'site' | 'admin';
}, _options = {}): Promise<boolean> {
  if (!sameOrigin({ request })) return false;
  if (surface === 'site') return await readRequestBrowserAnalyticsMode({ ports, request }) !== 'pending';
  if ((await currentCredential(deps, request))?.kind !== 'session') return false;
  return (await getEffective({ repo: deps.settingsRepo }, { ...TELEMETRY_CONSENT, scopeContext: { workspaceId: deps.workspaceId } }))?.value === true;
}

/** Forward only the bounded bytes and media type; browser cookies remain inside the host. O(body). */
async function deliver({ request, response, http, fullPath }: {
  request: Request; response: Response; http: NonNullable<import('@jini-ai/analytics/product').BrowserAnalyticsContribution['http']>; fullPath: string;
}, _options = {}): Promise<void> {
  const result = await http.handle({ method: request.method, path: fullPath.slice(http.path.length),
    body: Buffer.isBuffer(request.body) ? request.body : new Uint8Array(), contentType: request.get('content-type') ?? 'application/octet-stream' });
  if (result.contentType) response.setHeader('Content-Type', result.contentType);
  if (request.method === 'GET' && result.cacheControl) response.setHeader('Cache-Control', result.cacheControl);
  response.status(result.status).end(result.body);
}
