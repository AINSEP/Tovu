import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, Response } from 'express';
import { SITE_CONSENT_DEFAULTS } from '@jini-ai/cookie-consent/site/config';
import type { RouteDeps } from '#src/server/routes/types';
import type { SiteCookieConsentDeps } from '@jini-ai/core/contracts/headless/site-cookie-consent';
import { UNAVAILABLE_ERROR_ID } from '@jini-ai/core/errors/reporter';
import { applySiteCookieConsent } from '../site-cookie-consent.js';

/**
 * @file When the site's failure reporter itself is down, a consent failure cannot record an incident.
 * Each public consent route must still answer 503 with its visitor copy, carrying the fixed
 * "unavailable" reference (never a freshly minted ID nothing recorded), and must not fall back to a
 * raw console line in its place.
 */

type Handler = (req: Request, res: Response) => Promise<void>;

function mountConsent() {
  const handlers = new Map<string, Handler>();
  const app = {
    use() {},
    get: (route: string, handler: Handler) => { handlers.set(`GET ${route}`, handler); },
    post: (route: string, _body: unknown, handler: Handler) => { handlers.set(`POST ${route}`, handler); },
  } as unknown as Express;
  const failure = () => new Error('PRIVATE_BACKEND_DETAIL');
  const consent: SiteCookieConsentDeps = { regionResolvers: async () => { throw failure(); } };
  const deps = {
    cookieConsent: consent, workspaceId: 'ws', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/consent-fixture' },
    clock: { nowMs: Date.now },
    consentStore: { readPublished: async () => { throw failure(); } },
    resolveActiveThemeId: async () => { throw failure(); },
  } as unknown as RouteDeps;
  applySiteCookieConsent({ app, deps, consent });
  return handlers;
}

for (const [route, visible] of [
  ['POST /_consent', 'Your choice could not be saved. Try again.'],
  ['GET /_consent/context', 'Cookie preferences could not be loaded. Wait a minute, then reload to try again.'],
  ['GET /_consent/load.js', 'Cookie preferences could not be loaded. Wait a minute, then reload to try again.'],
] as const) test(`${route}: with the failure reporter down, the visitor still gets the 503 copy and the fixed unavailable reference`, async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  t.mock.method(console, 'warn', () => {});
  const handler = mountConsent().get(route);
  assert.ok(handler, `${route} is registered`);
  let status = 200; let body: unknown;
  const reporterDown = { record: () => { throw new Error('reporter offline'); } };
  const res = { locals: { failureReporter: reporterDown }, status(value: number) { status = value; return res; }, set() { return res; }, type() { return res; }, json(value: unknown) { body = value; return res; }, send(value: unknown) { body = value; return res; } };
  const req = { body: Buffer.from('{}'), method: route.split(' ')[0], originalUrl: '/_consent', get: () => undefined, ip: '127.0.0.1' };

  await handler(req as unknown as Request, res as unknown as Response);

  assert.equal(status, 503);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  assert.ok(text.includes(visible), text);
  assert.equal([...text.matchAll(/ERR-[0-9A-F-]+/g)].map(match => match[0]).join(), UNAVAILABLE_ERROR_ID);
  assert.doesNotMatch(text, /PRIVATE_BACKEND_DETAIL|reporter offline/);
  assert.deepEqual(errors, [], 'a reporter breach leaves no raw console line in place of the incident');
});
