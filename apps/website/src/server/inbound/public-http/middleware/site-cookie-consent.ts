import { createSiteConsentHttp } from '@jini-ai/cookie-consent/site/http';
import { createSiteConsentDocumentOwner } from '@jini-ai/cookie-consent/site/document-state';
import { siteConsentDocumentAssets as documentAssets, siteConsentExportAssets as exportAssets, documentPlugins } from '@jini-ai/cookie-consent/site/document-assets';
import type { DocumentAssets } from '@jini-ai/cms/presentation';
import type { DeclaredScript } from '@jini-ai/core/contracts/site/cookie-consent';
import { describeErrorForLog } from '@jini-ai/core/model-facing-tool-errors';
import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { hasRequestRenderTheme } from "@jini-ai/cms/public-http/middleware/render-theme-override";
import { failureReporterOf, reportServerFailure } from "#src/server/inbound/shared/admin-failure";
/** Public declared-script assets, published context, receipts and plugin admission.
 * Documents receive asset contributions during construction; public responses are never scanned. */
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import express, { type Express, type Request } from 'express';
import { REGION_COOKIE } from '@jini-ai/cookie-consent';
import type { ConsentRecord } from "@jini-ai/cookie-consent/server";
import { consentRateLimitKey, createConsentFileRecords, createNodeConsentFiles } from '@jini-ai/cookie-consent/node';
import { createNodeAtomicFilesystem, writeJsonFileAtomic } from '@jini-ai/platform/fs';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import type { SiteCookieConsentDeps, ConsentPluginContribution } from '@jini-ai/core/contracts/headless/site-cookie-consent';
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from '#src/features/theme/active-theme';
import type { RouteDeps } from '#src/server/routes/types';
import { isStaticExportRequest } from "../routes/site/pages/request-policy.js";
import { CONSENT_RECEIPTS_DIR_NAME, CONSENT_SAVE_PROFILE, readSiteConsentPolicy, resolveSiteConsentOrigin } from './site-consent.js';
import { asyncRoute } from "../../../../platform/express/async-route.js";
import { browserDiagnosticsEnabled, siteBrowserDiagnosticsBridge, siteBrowserDiagnosticsModule } from '@jini-ai/diagnostics/browser-diagnostics';
import { TELEMETRY_CONSENT } from '../../../runtime/composition/telemetry-consent.js';

export const CONSENT_ENDPOINT = '/_consent';
const PLUGIN_BASE = `${CONSENT_ENDPOINT}/p`;
const EXTENSION_SRC = '/_consent/extensions.min.js';
export const CONSENT_LOADER_SRC = '/_consent/load.js';
const http = createSiteConsentHttp({ endpoint: CONSENT_ENDPOINT, pluginBase: PLUGIN_BASE, regionCookieName: REGION_COOKIE, legacyCookieName: 'jini_consent' });
const documentOwner = createSiteConsentDocumentOwner({
  schedule: (run, delayMs) => ((timer) => () => clearTimeout(timer))(setTimeout(run, delayMs)),
  exportUnavailableWarning: 'Cookie preferences could not be loaded. This published copy has no cookie banner.',
});

/** Adapters of the analytics plugins attached to this site, mounted under one path each.
 * A plugin that throws or is not configured contributes nothing. @complexity O(plugins). */
export const siteConsentPlugins = ({ deps }: { deps: RouteDeps }, _optional = {}): readonly ConsentPluginContribution[] =>
  deps.consentAdapters?.({ base: PLUGIN_BASE }) ?? [];

/** The site's receipt files: the same directory the old engine and readiness's storage check use. */
const siteReceiptStore = ({ deps }: { deps: RouteDeps }, _optional = {}) =>
  createConsentFileRecords({ directory: path.join(deps.siteBinding.dir, CONSENT_RECEIPTS_DIR_NAME), files: createNodeConsentFiles({
    atomicWrite: async ({ filePath, data }, { createParent, mode, refuseSymlink }) => (
      createParent ? await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 }) : undefined,
      writeJsonFileAtomic({ filePath, data, fs: createNodeAtomicFilesystem({}, {}) }, { mode, refuseSymlink })
    ),
  }) });

/** The server gate: what this visitor may run right now (GPC/DNT applied, durable rule: an
 * unconfirmed grant is not allowed). A failed policy read allows nothing. @complexity O(cookie header). */
export const readSiteVisitorConsent = ({ deps, req }: { deps: RouteDeps; req: Request }, _optional = {}) =>
  http.readVisitorConsent({ readSnapshot: () => documentOwner.documentPolicy({ consent: deps.cookieConsent }),
    snapshotUnavailable: ({ config }) => documentOwner.unavailableDocumentPolicy({ consent: deps.cookieConsent, config }),
    readPolicy: () => readSiteConsentPolicy({ deps }), facts: () => ({
      get cookieHeader() { return req.get('cookie'); }, get secGpc() { return req.get('sec-gpc') ?? null; },
      get dnt() { return req.get('dnt') ?? null; }, get nowMs() { return deps.clock.nowMs(); },
    }),
  });

/** Detached delivery recheck, the old engine's rule: the receipt is still active (a later choice retires
 * it), names the current policy, grants analytics without GPC and is within the choice lifetime. A forged
 * or withdrawn receipt id never delivers. @complexity O(1): one policy read and one receipt read. */
export const siteReceiptAllowsAnalytics = ({ deps, proof }: { deps: RouteDeps; proof: { receiptId: string; policyVersion: string } }, _optional = {}): Promise<boolean> =>
  http.receiptAllowsAnalytics({ proof, readSnapshot: () => documentOwner.documentPolicy({ consent: deps.cookieConsent }),
    snapshotUnavailable: ({ config }) => documentOwner.unavailableDocumentPolicy({ consent: deps.cookieConsent, config }),
    readPolicyVersion: async () => (await readSiteConsentPolicy({ deps })).policyVersion,
    readReceipt: async ({ id }) => (await siteReceiptStore({ deps }).read?.({ id }) ?? null) as Partial<ConsentRecord> | null,
    nowMs: () => deps.clock.nowMs(),
  });

/** The old engine's analytics proof shape (receipt id + policy), from the new cookie. Undefined unless
 * analytics is allowed and a server receipt exists. @complexity O(cookie header). */
export const readSiteAnalyticsProof = ({ deps, req }: { deps: RouteDeps; req: Request }, _optional = {}): Promise<{ receiptId: string; policyVersion: string } | undefined> =>
  http.readAnalyticsProof({ readState: () => readSiteVisitorConsent({ deps, req }), cookieHeader: () => req.get('cookie') });

/** Document construction consumes data, never a completed response body. */
export const siteConsentDocumentAssets = ({ deps, request, scripts, static: staticDocument }: { deps: Pick<RouteDeps, 'cookieConsent' | 'consentAdapters'> & Partial<Pick<RouteDeps, 'settingsRepo' | 'workspaceId' | 'observability'>>; request: Request; scripts: readonly DeclaredScript[]; static?: true }, _optional = {}): Promise<DocumentAssets> =>
  documentAssets({ readPolicy: () => documentOwner.documentPolicy({ consent: deps.cookieConsent }), readDeclarations: () => documentOwner.documentDeclarations({ consent: deps.cookieConsent }),
    hasConsent: Boolean(deps.cookieConsent), preview: () => hasRequestRenderTheme({ response: request.res }),
    exporting: () => isStaticExportRequest(request), plugins: ({ live }) => documentPlugins({ live,
      adapters: () => deps.consentAdapters?.({ base: PLUGIN_BASE }).map(item => item.adapter) ?? [],
      browserPlugins: () => deps.cookieConsent?.browserPlugins?.() ?? Promise.resolve([]),
      diagnosticsEnabled: () => browserDiagnosticsEnabled({ observability: deps.observability, consentSetting: TELEMETRY_CONSENT }, deps),
      diagnostics: () => ({ id: siteBrowserDiagnosticsBridge.id, kind: siteBrowserDiagnosticsBridge.kind, src: siteBrowserDiagnosticsBridge.src }),
    }),
    scripts, static: staticDocument, clientSrc: documentOwner.client({ consent: deps.cookieConsent })?.src,
    extensionSrc: EXTENSION_SRC, loaderSrc: CONSENT_LOADER_SRC, endpoint: CONSENT_ENDPOINT,
  });

/** JSON declaration URLs are invisible to an HTML crawler. No live collectors enter an export. */
export const siteConsentExportAssets = ({ deps }: { deps: Pick<RouteDeps, 'cookieConsent'> }, _optional = {}): Promise<readonly string[]> =>
  exportAssets({ readPolicy: () => documentOwner.documentPolicy({ consent: deps.cookieConsent }),
    readDeclarations: () => documentOwner.documentDeclarations({ consent: deps.cookieConsent }), hasConsent: () => Boolean(deps.cookieConsent),
    client: () => documentOwner.client({ consent: deps.cookieConsent }), extensionSrc: EXTENSION_SRC,
  });

/** Public context shares the site's publication retry window and keeps visitor state out of HTML caches. */
const mountContext = ({ app, consent }: { app: Express; consent: SiteCookieConsentDeps }, _optional = {}): void =>
  void app.get(`${CONSENT_ENDPOINT}/context`, (req, res) => http.context({
    readPolicy: () => documentOwner.documentPolicy({ consent }), resolvers: () => consent.regionResolvers(),
    request: { header: name => req.get(name) ?? null, ip: req.ip ?? null },
    setRegionCookie: hint => http.setRegionCookie({ hint, get cookieHeader() { return req.get('cookie'); }, get secure() { return req.secure; }, get origin() { return resolveSiteConsentOrigin({ request: req }); },
      cookie: (name, value, options) => void res.cookie(name, value, options), clearCookie: (name, options) => void res.clearCookie(name, options) }),
    clearLegacyCookie: () => http.clearLegacyCookie({ cookieHeader: req.get('cookie'), clearCookie: (name, options) => void res.clearCookie(name, options) }),
    setCache: value => void res.set('Cache-Control', value), json: body => void res.json(body), unavailable: () => new Error('Cookie preferences are not available.'),
    failure: {
      report: error => reportServerFailure({ error, operation: 'consent:public-context' }, { reporter: failureReporterOf({ res }) }),
      diagnosticFailure: () => console.error('[consent] public context unavailable', '[diagnostic unavailable]'),
      write: errorId => void res.status(503).json({ error: 'Cookie preferences could not be loaded. Wait a minute, then reload to try again.', ...(errorId ? { errorId } : {}) }),
    },
  }));

/** Authored static documents load the same construction assets as managed shells. No page bytes
 * are inspected or changed; the browser installs only this server-owned contribution. */
const mountStaticThemeLoader = ({ app, deps }: { app: Express; deps: RouteDeps }): void =>
  void app.get(CONSENT_LOADER_SRC, (req, res) => http.staticThemeLoader({
    get readThemeId() { return deps.resolveActiveThemeId?.bind(deps); }, resolveTheme: required => resolveActiveTheme({ deps, ...required }), noThemeId: NO_THEME_ID,
    assets: scripts => siteConsentDocumentAssets({ deps, request: req, scripts }), exporting: () => isStaticExportRequest(req),
    write: body => void res.type('text/javascript').set('Cache-Control', 'public, max-age=60').set('Vary', 'X-Tovu-Static-Export').send(body),
    failure: {
      report: error => reportServerFailure({ error, operation: 'consent:static-loader' }, { reporter: failureReporterOf({ res }) }),
      diagnosticFailure: () => console.error('[consent] static loader unavailable', '[diagnostic unavailable]'),
      write: errorId => void res.status(503).type('text/javascript').set('Cache-Control', 'no-store').send(`/* Cookie preferences could not be loaded. Wait a minute, then reload to try again.${errorId ? ` Reference: ${errorId}` : ''} */`),
    },
  }));

/** Mount the receipt endpoint (with Tovu's rate limit and the site's file store). */
const mountReceipts = ({ app, deps, store, limiter, bodyLimit }: { app: Express; deps: RouteDeps } & Parameters<Parameters<typeof http.applySiteCookieConsent>[0]['mountReceipts']>[0], _optional = {}): void =>
  void app.post(CONSENT_ENDPOINT, express.raw({ type: () => true, limit: bodyLimit }), (req, res) => http.receipts({
    readPolicy: () => readSiteConsentPolicy({ deps }),
    request: () => http.toWebRequest({ body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), header: name => req.get(name), get originalUrl() { return req.originalUrl; }, get origin() { return resolveSiteConsentOrigin({ request: req }); }, get method() { return req.method; } }),
    store, now: () => deps.clock.nowMs(), ids: () => randomBytes(24).toString('base64url'),
    allow: async () => (await limiter.check({ key: consentRateLimitKey({ address: resolveClientIp(req) }) })).allowed,
    write: response => void res.status(response.status).set(response.headers).send(response.body),
    failure: {
      report: error => reportServerFailure({ error, operation: 'consent:save' }, { reporter: failureReporterOf({ res }) }),
      diagnosticFailure: () => console.error('[consent] save failed', '[diagnostic unavailable]'),
      write: errorId => void res.status(503).set('Cache-Control', 'no-store').json({ error: 'Your choice could not be saved. Try again.', ...(errorId ? { errorId } : {}) }),
    },
  }));

/** Plugin assets and collectors. A collector POST is accepted only from this site and only while the
 * visitor's stored choice allows that adapter's category. @complexity O(plugins) per request. */
const mountPluginHttp = ({ app, deps, limiter, bodyLimit }: { app: Express; deps: RouteDeps } & Parameters<Parameters<typeof http.applySiteCookieConsent>[0]['mountPluginHttp']>[0], _optional = {}): void =>
  void app.use(PLUGIN_BASE, express.raw({ type: () => true, limit: bodyLimit }), (req, res, next) => http.pluginHttp({
    facts: { get method() { return req.method; }, get path() { return req.path; }, get body() { return Buffer.isBuffer(req.body) ? req.body : new Uint8Array(); }, get contentType() { return req.get('content-type'); }, get origin() { return req.get('origin'); } },
    plugins: () => siteConsentPlugins({ deps }), siteOrigin: () => resolveSiteConsentOrigin({ request: req }), readState: () => readSiteVisitorConsent({ deps, req }),
    // The receipts' key (an IPv6 /64), so rotating addresses inside one network shares one budget.
    rateAllowed: async () => (await limiter.check({ key: consentRateLimitKey({ address: resolveClientIp(req) }) })).allowed,
    writer: { setHeader: (name, value) => void res.setHeader(name, value), status: code => void res.status(code), end: body => void res.end(body) }, next,
  }));

/** Routes and a construction-time snapshot only; no page-response capture or cookie work. */
export const applySiteCookieConsent = ({ app, deps, consent }: { app: Express; deps: RouteDeps; consent: SiteCookieConsentDeps }, { client: suppliedClient }: { client?: { body: Buffer; src: string } } = {}): void =>
  http.applySiteCookieConsent({
    install: () => documentOwner.siteDocumentState({ consent,
      client: () => suppliedClient ?? http.loadClient({ load: () => fs.readFileSync(createRequire(import.meta.url).resolve('@jini-ai/cookie-consent/client.min.js')),
        hash: body => createHash('sha256').update(body).digest('hex'), diagnosticUnavailable: '[diagnostic unavailable]',
        formatError: error => formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS),
        warn: diagnostic => console.warn('[consent] The cookie preferences client could not be loaded. Its browser route is disabled.', diagnostic),
      }),
      readPolicy: () => readSiteConsentPolicy({ deps }), readDeclarations: () => consent.scriptDeclarations?.() ?? Promise.resolve({ scripts: [] }),
      policyFailure: error => console.warn('[consent] Cookie preferences could not refresh. The last loaded preferences remain in use; a later request will try again:', describeErrorForLog({ err: error })),
      declarationFailure: () => console.warn('[consent] Plugin scripts could not refresh. The last loaded scripts remain in use; a later request will try again.'),
      exportAssets: () => siteConsentExportAssets({ deps }), now: () => deps.clock.nowMs(),
    }),
    mountReadiness: () => void app.use(asyncRoute({ handler: (req, res, next) => http.beforeRender({
      readPolicy: () => documentOwner.documentPolicy({ consent }),
      attachAssets: () => void (res.locals.siteConsentAssets = (required: { scripts: readonly DeclaredScript[]; static?: true }) => siteConsentDocumentAssets({ deps, request: req, ...required })), next,
    }) })),
    mountClient: client => void app.get(client.src, (_req, res) => res.type('text/javascript').set('Cache-Control', 'public, max-age=31536000, immutable').send(client.body)),
    loadExtension: () => fs.readFileSync(path.join(path.dirname(createRequire(import.meta.url).resolve('@jini-ai/cookie-consent/client.min.js')), 'extensions.min.js')),
    mountExtension: extension => void app.get(EXTENSION_SRC, (_req, res) => res.type('text/javascript').set('Cache-Control', 'public, max-age=60').send(extension)),
    extensionFailure: { diagnosticUnavailable: '[diagnostic unavailable]', formatError: error => formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS),
      warn: diagnostic => console.warn('[consent] The cookie preferences extensions could not be loaded. Their browser route is disabled.', diagnostic) },
    mountStaticThemeLoader: () => mountStaticThemeLoader({ app, deps }),
    mountDiagnostics: () => void app.get('/_jini/browser-analytics/site/diagnostics.js', (_req, res) => http.diagnostics({
      enabled: () => browserDiagnosticsEnabled({ observability: deps.observability, consentSetting: TELEMETRY_CONSENT }, deps),
      setCache: cache => void res.set('Cache-Control', cache), missing: () => void res.status(404).end(), send: () => void res.type('text/javascript').send(siteBrowserDiagnosticsModule),
    })),
    mountContext: () => mountContext({ app, consent }), openReceiptStore: () => siteReceiptStore({ deps }),
    createReceiptLimiter: () => createRateLimiter({ profile: CONSENT_SAVE_PROFILE, clock: deps.clock }),
    createCollectorLimiter: () => createRateLimiter({ profile: { windowSeconds: 60, max: 120, burst: 20 }, clock: deps.clock }),
    receiptBodyLimit: '4kb', pluginBodyLimit: '256kb',
    mountReceipts: required => mountReceipts({ app, deps, ...required }), mountPluginHttp: required => mountPluginHttp({ app, deps, ...required }),
  });
