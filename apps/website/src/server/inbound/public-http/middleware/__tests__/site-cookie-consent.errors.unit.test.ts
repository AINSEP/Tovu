import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Express, Request, Response } from 'express';
import { SITE_CONSENT_DEFAULTS } from '@jini-ai/cookie-consent/site/config';
import type { RouteDeps } from '#src/server/routes/types';
import type { SiteCookieConsentDeps } from '@jini-ai/core/contracts/headless/site-cookie-consent';

const fs = await import('node:fs');
let failAssets = false;
const readFileSync: typeof fs.readFileSync = ((file: Parameters<typeof fs.readFileSync>[0], ...rest: unknown[]) => {
  if (failAssets && (String(file).endsWith('/client.min.js') || String(file).endsWith('/extensions.min.js'))) {
    throw new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET');
  }
  return Reflect.apply(fs.readFileSync, fs, [file, ...rest]);
}) as typeof fs.readFileSync;
mock.module('node:fs', { namedExports: { ...fs, readFileSync }, defaultExport: { ...fs, readFileSync } });
const { applySiteCookieConsent } = await import('../site-cookie-consent.js');

test('consent failures retain redacted diagnostics and public incident references', async (t) => {
  const warnings: unknown[][] = []; const errors: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  t.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  const handlers = new Map<string, (req: Request, res: Response) => Promise<void>>();
  const app = {
    use() {},
    get: (route: string, handler: (req: Request, res: Response) => Promise<void>) => { handlers.set(`GET ${route}`, handler); },
    post: (route: string, _body: unknown, handler: (req: Request, res: Response) => Promise<void>) => { handlers.set(`POST ${route}`, handler); },
  } as unknown as Express;
  let failRead = false;
  const failure = () => new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET');
  const consent: SiteCookieConsentDeps = { regionResolvers: async () => { throw failure(); } };
  const deps = {
    cookieConsent: consent, workspaceId: 'ws', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/consent-fixture' },
    clock: { nowMs: Date.now },
    consentStore: { readPublished: async () => {
      if (failRead) throw failure();
      return { id: 'published', config: { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' } };
    } },
    resolveActiveThemeId: async () => { throw failure(); },
  } as unknown as RouteDeps;
  try {
    failAssets = true;
    applySiteCookieConsent({ app, deps, consent });
    failAssets = false;
    assert.ok(consent.refresh, 'the policy refresh is installed');
    await consent.refresh();
    for (const message of ['The cookie preferences client could not be loaded', 'The cookie preferences extensions could not be loaded']) {
      const warning = warnings.find(args => String(args[0]).includes(message));
      assert.ok(warning, message);
      assert.match(String(warning[1]), /boom/);
      assert.match(String(warning[1]), /site-cookie-consent\.errors\.unit\.test\.ts/);
      assert.doesNotMatch(String(warning[1]), /SECRETSECRETSECRETSECRET/);
    }
    for (const [route, operation, visible] of [
      ['POST /_consent', 'consent:save', 'Your choice could not be saved'],
      ['GET /_consent/context', 'consent:public-context', 'Cookie preferences could not be loaded'],
      ['GET /_consent/load.js', 'consent:static-loader', 'Cookie preferences could not be loaded'],
    ] as const) {
      failRead = route.startsWith('POST');
      const handler = handlers.get(route); assert.ok(handler, `${route} is registered`);
      let status = 200; let body: unknown;
      const res = { locals: {}, status(value: number) { status = value; return res; }, set() { return res; }, type() { return res; }, json(value: unknown) { body = value; return res; }, send(value: unknown) { body = value; return res; } };
      const req = { body: Buffer.from('PRIVATE_VISITOR_BODY'), method: route.split(' ')[0], originalUrl: '/_consent', get: () => undefined, ip: '127.0.0.1' };
      await handler(req as unknown as Request, res as unknown as Response);
      assert.equal(status, 503);
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      assert.match(text, new RegExp(visible));
      const entry = errors.find(args => args[0] === `[${operation}]`); assert.ok(entry, `${operation} is reported`);
      const detail = entry[1] as { errorId: string; diagnostic: string };
      assert.match(text, new RegExp(detail.errorId));
      assert.match(detail.diagnostic, /boom/);
      assert.match(detail.diagnostic, /site-cookie-consent\.errors\.unit\.test\.ts/);
      assert.doesNotMatch(JSON.stringify({ body, detail }), /SECRETSECRETSECRETSECRET|PRIVATE_VISITOR_BODY/);
    }
  } finally { failAssets = false; }
});
