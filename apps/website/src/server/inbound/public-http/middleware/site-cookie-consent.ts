import { matchConsentPluginHttp, collectorDecision as neutralCollectorDecision, readVisitorConsent, receiptAllowsAnalytics, analyticsProof } from '@jini-ai/cookie-consent/site/http';
import { documentPolicy as readDocumentPolicy, briefPendingRead, refreshDocumentState as refreshState, type DocumentState } from '@jini-ai/cookie-consent/site/document-state';
import { siteConsentDocumentAssets as documentAssets, siteConsentExportAssets as exportAssets, staticConsentLoaderScript } from '@jini-ai/cookie-consent/site/document-assets';
import type { DocumentAssets } from '@jini-ai/cms/presentation';
import type { DeclaredScript } from '@jini-ai/core/contracts/site/cookie-consent';
import type { ConsentConfig } from '@jini-ai/core/contracts/site/cookie-consent';
import { describeErrorForLog } from '@jini-ai/core/model-facing-tool-errors';
import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { hasRequestRenderTheme } from "@jini-ai/cms/public-http/middleware/render-theme-override";
import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
/** Public declared-script assets, published context, receipts and plugin admission.
 * Documents receive asset contributions during construction; public responses are never scanned. */
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import { REGION_COOKIE } from '@jini-ai/cookie-consent';
import type { ConsentState, RawContribution, RegionResolver } from '@jini-ai/core/contracts/site/cookie-consent';
import { handleReceipt, resolveRegion, type ConsentRecord } from '@jini-ai/cookie-consent/server';
import { consentRateLimitKey, createConsentFileRecords, createNodeConsentFiles } from '@jini-ai/cookie-consent/node';
import { createNodeAtomicFilesystem, writeJsonFileAtomic } from '@jini-ai/platform/fs';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import type { SiteCookieConsentDeps, ConsentPluginHttp, ConsentPluginContribution } from '@jini-ai/core/contracts/headless/site-cookie-consent';
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme } from '#src/features/theme/active-theme';
import { siteBannerMode } from '@jini-ai/cookie-consent/site/cookie-consent';
import type { RouteDeps } from '#src/server/routes/types';
import { isStaticExportRequest } from "../routes/site/pages/request-policy.js";
import { CONSENT_RECEIPTS_DIR_NAME, CONSENT_SAVE_PROFILE, readSiteConsentPolicy, resolveSiteConsentOrigin } from './site-consent.js';
import { asyncRoute } from "../../../../platform/express/async-route.js";
import { browserDiagnosticsEnabled, siteBrowserDiagnosticsBridge, siteBrowserDiagnosticsModule } from '@jini-ai/diagnostics/browser-diagnostics';
import { TELEMETRY_CONSENT } from '../../../runtime/composition/telemetry-consent.js';


export const CONSENT_ENDPOINT = '/_consent';
const PLUGIN_BASE = `${CONSENT_ENDPOINT}/p`;

/** Read the client bundle once; the hash makes its URL immutable (and lets static exports copy it). */
function loadClient(_required = {}, { resolve = createRequire(import.meta.url).resolve }: { resolve?: (id: string) => string } = {}) {
  try {
    const body = fs.readFileSync(resolve('@jini-ai/cookie-consent/client.min.js'));
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
    return { body, src: `${CONSENT_ENDPOINT}/client-${hash}.min.js` };
  } catch (error) {
    let errorDiagnostic = "[diagnostic unavailable]";
    try { errorDiagnostic = formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS); } catch { /* Keep the original failure path if diagnostics fail. */ }
    console.warn('[consent] The cookie preferences client could not be loaded. Its browser route is disabled.', errorDiagnostic);
    return undefined;
  }
}

/** Express → web Request on the site's PUBLIC origin, so handleReceipt's origin check is meaningful. */
function toWebRequest({ req, body }: { req: Request; body: Buffer }, _optional = {}): globalThis.Request {
  const headers = new Headers();
  for (const name of ['origin', 'content-type', 'content-length', 'cookie', 'sec-gpc', 'dnt']) {
    const value = req.get(name);
    if (value !== undefined) headers.set(name, value);
  }
  return new globalThis.Request(new URL(req.originalUrl, resolveSiteConsentOrigin({ request: req })), { method: req.method, headers, body: new Uint8Array(body) });
}

/** Adapters of the analytics plugins attached to this site, mounted under one path each.
 * A plugin that throws or is not configured contributes nothing. @complexity O(plugins). */
export function siteConsentPlugins({ deps }: { deps: RouteDeps }, _optional = {}): readonly ConsentPluginContribution[] {
  return deps.consentAdapters?.({ base: PLUGIN_BASE }) ?? [];
}

/** Region persistence is only reached for an enabled consent banner, never anonymous analytics. */
function setRegionCookie({ req, res, hint }: { req: Request; res: Response; hint: 'us' | 'strict' }, _optional = {}): void {
  const current = req.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${REGION_COOKIE}=([^;]*)`))?.[1];
  const secure = req.secure || resolveSiteConsentOrigin({ request: req }).startsWith('https:');
  if (hint === 'us' && current !== 'us') res.cookie(REGION_COOKIE, 'us', { path: '/', sameSite: 'lax', secure, maxAge: 86_400_000 });
  if (hint === 'strict' && current !== undefined) res.clearCookie(REGION_COOKIE, { path: '/' });
}

/** Only this engine retires the old host-only HttpOnly cookie; its receipt id proves no new categories. */
function clearLegacyCookie({ req, res }: { req: Request; res: Response }, _optional = {}): void {
  if (/(?:^|;\s*)jini_consent=/.test(req.get('cookie') ?? '')) res.clearCookie('jini_consent', { path: '/', httpOnly: true, sameSite: 'lax' });
}

/** The site's receipt files: the same directory the old engine and readiness's storage check use. */
function siteReceiptStore({ deps }: { deps: RouteDeps }, _optional = {}) {
  return createConsentFileRecords({ directory: path.join(deps.siteBinding.dir, CONSENT_RECEIPTS_DIR_NAME), files: createNodeConsentFiles({
    atomicWrite: async ({ filePath, data }, { createParent, mode, refuseSymlink }) => {
      if (createParent) await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      writeJsonFileAtomic({ filePath, data, fs: createNodeAtomicFilesystem({}, {}) }, { mode, refuseSymlink });
    } }) });
}

/** Mount the receipt endpoint (with Tovu's rate limit and the site's file store). */
function mountReceipts({ app, deps }: { app: Express; deps: RouteDeps }, _optional = {}): void {
  const limiter = createRateLimiter({ profile: CONSENT_SAVE_PROFILE, clock: deps.clock });
  const store = siteReceiptStore({ deps });
  app.post(CONSENT_ENDPOINT, express.raw({ type: () => true, limit: '4kb' }), async (req, res) => {
    try {
      const config = await readSiteConsentPolicy({ deps });
      const response = await handleReceipt({ request: toWebRequest({ req, body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0) }), ports: {
        store, policy: () => config.policyVersion, now: () => deps.clock.nowMs(),
        // Receipt ids must be unguessable; the site's time-ordered id generator is not.
        ids: () => randomBytes(24).toString('base64url'),
      } }, { regionMode: config.regionMode === 'opt-in' ? 'opt-in' : 'auto',
        allow: async () => (await limiter.check({ key: consentRateLimitKey({ address: resolveClientIp(req) }) })).allowed });
      res.status(response.status).set(Object.fromEntries(response.headers)).send(await response.text());
    } catch (error) {
      let errorId: string | undefined;
      try { ({ errorId } = reportServerFailure({ error, operation: 'consent:save' }, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter })); } catch { /* Keep the original failure path if diagnostics fail. */
        console.error('[consent] save failed', '[diagnostic unavailable]');
      }
      res.status(503).set('Cache-Control', 'no-store').json({ error: 'Your choice could not be saved. Try again.', ...(errorId ? { errorId } : {}) });
    }
  });
}

/** Plugin assets and collectors. A collector POST is accepted only from this site and only while the
 * visitor's stored choice allows that adapter's category. @complexity O(plugins) per request. */
function mountPluginHttp({ app, deps }: { app: Express; deps: RouteDeps }, _optional = {}): void {
  const limiter = createRateLimiter({ profile: { windowSeconds: 60, max: 120, burst: 20 }, clock: deps.clock });
  app.use(PLUGIN_BASE, express.raw({ type: () => true, limit: '256kb' }), async (req, res, next) => {
    const full = PLUGIN_BASE + req.path;
    const plugin = pluginFor({ deps, full });
    if (!plugin) { next(); return; }
    try {
      const decision = req.method === 'GET' ? undefined : await collectorDecision({ req, deps, adapter: plugin.adapter, limiter });
      if (decision?.status) { res.status(decision.status).end(); return; }
      const result = await plugin.http.handle({ ...pluginRequest({ req, full, plugin }), ...(decision && { analyticsLevel: decision.analyticsLevel }) });
      if (result.contentType) res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', req.method === 'GET' && result.cacheControl ? result.cacheControl : 'private, no-store');
      res.status(result.status).end(result.body);
    } catch { res.status(502).end(); }
  });
}

/** Normalize the host request without forwarding visitor headers or trusting its identity. */
function pluginRequest({ req, full, plugin }: { req: Request; full: string; plugin: { http: ConsentPluginHttp } }, _optional = {}): Parameters<ConsentPluginHttp['handle']>[0] {
  return { method: req.method, path: full.slice(plugin.http.path.length),
    body: Buffer.isBuffer(req.body) ? req.body : new Uint8Array(), contentType: req.get('content-type') ?? 'application/octet-stream' };
}

/** The active plugin mounted over this path; none for a path with a dot segment or encoded separator. */
function pluginFor({ deps, full }: { deps: RouteDeps; full: string }, _optional = {}): (ConsentPluginContribution & { http: ConsentPluginHttp }) | undefined {
  return matchConsentPluginHttp({ plugins: () => siteConsentPlugins({ deps }), full });
}

/** Same-origin/category/rate decision plus the server-owned analytics level. Anonymous delivery needs
 * an adapter declaring support. A category that is not optional (even 'necessary') is read as marketing,
 * the strictest. @complexity O(cookie header) plus one policy read. */
async function collectorDecision(
  { req, deps, adapter, limiter }: { req: Request; deps: RouteDeps; adapter: RawContribution; limiter: ReturnType<typeof createRateLimiter> },
  _optional = {},
): Promise<{ status: 403 | 429 | null; analyticsLevel: ConsentState['analyticsLevel'] }> {
  return neutralCollectorDecision({ origin: req.get('origin'), siteOrigin: () => resolveSiteConsentOrigin({ request: req }), adapter,
    readState: () => readSiteVisitorConsent({ deps, req }),
    // The receipts' key (an IPv6 /64), so rotating addresses inside one network shares one budget.
    rateAllowed: async () => (await limiter.check({ key: consentRateLimitKey({ address: resolveClientIp(req) }) })).allowed,
  });
}

/** The server gate: what this visitor may run right now (GPC/DNT applied, durable rule: an
 * unconfirmed grant is not allowed). A failed policy read allows nothing. @complexity O(cookie header). */
export async function readSiteVisitorConsent({ deps, req }: { deps: RouteDeps; req: Request }, _optional = {}) {
  return readVisitorConsent({ readSnapshot: () => documentPolicy({ consent: deps.cookieConsent }),
    snapshotUnavailable: ({ config }) => unavailableDocumentPolicy({ consent: deps.cookieConsent, config }),
    readPolicy: () => readSiteConsentPolicy({ deps }), facts: () => requestPrivacy({ deps, req }),
  });
}

/** The published policy id visitors are asked under now. @complexity O(1) reads. */
async function readSiteConsentPolicyVersion({ deps }: { deps: RouteDeps }, _optional = {}): Promise<string> {
  return (await readSiteConsentPolicy({ deps })).policyVersion;
}

/** Detached delivery recheck, the old engine's rule: the receipt is still active (a later choice retires
 * it), names the current policy, grants analytics without GPC and is within the choice lifetime. A forged
 * or withdrawn receipt id never delivers. @complexity O(1): one policy read and one receipt read. */
export async function siteReceiptAllowsAnalytics({ deps, proof }: { deps: RouteDeps; proof: { receiptId: string; policyVersion: string } }, _optional = {}): Promise<boolean> {
  return receiptAllowsAnalytics({ proof, readSnapshot: () => documentPolicy({ consent: deps.cookieConsent }),
    snapshotUnavailable: ({ config }) => unavailableDocumentPolicy({ consent: deps.cookieConsent, config }),
    readPolicyVersion: () => readSiteConsentPolicyVersion({ deps }),
    readReceipt: async ({ id }) => (await siteReceiptStore({ deps }).read?.({ id }) ?? null) as Partial<ConsentRecord> | null,
    nowMs: () => deps.clock.nowMs(),
  });
}

/** The old engine's analytics proof shape (receipt id + policy), from the new cookie. Undefined unless
 * analytics is allowed and a server receipt exists. @complexity O(cookie header). */
export async function readSiteAnalyticsProof({ deps, req }: { deps: RouteDeps; req: Request }, _optional = {}): Promise<{ receiptId: string; policyVersion: string } | undefined> {
  return analyticsProof({ state: await readSiteVisitorConsent({ deps, req }), get cookieHeader() { return req.get('cookie'); } });
}

/** One published construction snapshot per site (per consent deps), shared by every app built over
 * them: an export, an inspection or a theme override never resets what live visitors are served.
 * Refreshed by publication. No per-page reads. */
const documentStates = new WeakMap<SiteCookieConsentDeps, DocumentState>();
const EXTENSION_SRC = '/_consent/extensions.min.js';
export const CONSENT_LOADER_SRC = '/_consent/load.js';

/** A mounted site's failed snapshot must not fall back to another immediate store read. */
function unavailableDocumentPolicy({ consent, config }: { consent?: SiteCookieConsentDeps; config: ConsentConfig | null }): boolean {
  return Boolean(consent && documentStates.has(consent) && !config);
}

/** The declaration owner is independent of policy availability, so ordinary scripts can still run. */
async function documentDeclarations({ consent }: { consent?: SiteCookieConsentDeps }): Promise<readonly DeclaredScript[]> {
  if (!consent) return [];
  return await documentStates.get(consent)?.scripts ?? [];
}

/** One read per minute per mounted site, including a retry after an unavailable publication. */
async function documentPolicy({ consent }: { consent?: SiteCookieConsentDeps }): Promise<ConsentConfig | null> {
  return readDocumentPolicy({ state: consent ? documentStates.get(consent) : undefined });
}

/** Document construction consumes data, never a completed response body. */
export async function siteConsentDocumentAssets({ deps, request, scripts, static: staticDocument }: { deps: Pick<RouteDeps, 'cookieConsent' | 'consentAdapters'> & Partial<Pick<RouteDeps, 'settingsRepo' | 'workspaceId' | 'observability'>>; request: Request; scripts: readonly DeclaredScript[]; static?: true }, _optional = {}): Promise<DocumentAssets> {
  const consent = deps.cookieConsent;
  return documentAssets({ readPolicy: () => documentPolicy({ consent }), readDeclarations: () => documentDeclarations({ consent }),
    hasConsent: Boolean(consent), preview: () => hasRequestRenderTheme({ response: request.res }),
    exporting: () => isStaticExportRequest(request), plugins: ({ live }) => documentPlugins({ deps, live }),
    scripts, static: staticDocument, clientSrc: consent ? documentStates.get(consent)?.client?.src : undefined,
    extensionSrc: EXTENSION_SRC, loaderSrc: CONSENT_LOADER_SRC, endpoint: CONSENT_ENDPOINT,
  });
}

/** JSON declaration URLs are invisible to an HTML crawler. No live collectors enter an export. */
export async function siteConsentExportAssets({ deps }: { deps: Pick<RouteDeps, 'cookieConsent'> }, _optional = {}): Promise<readonly string[]> {
  return exportAssets({ readPolicy: () => documentPolicy({ consent: deps.cookieConsent }),
    readDeclarations: () => documentDeclarations({ consent: deps.cookieConsent }), hasConsent: () => Boolean(deps.cookieConsent),
    client: () => deps.cookieConsent ? documentStates.get(deps.cookieConsent)?.client : undefined, extensionSrc: EXTENSION_SRC,
  });
}

/** Public context shares the site's publication retry window and keeps visitor state out of HTML caches. */
function mountContext({ app, consent }: { app: Express; consent: SiteCookieConsentDeps }, _optional = {}): void {
  app.get(`${CONSENT_ENDPOINT}/context`, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const config = await documentPolicy({ consent });
      if (!config) throw new Error('Cookie preferences are not available.');
      const enabled = siteBannerMode({ config }) !== 'off';
      if (enabled) {
        const hint = await resolveRegion({ resolvers: await consent.regionResolvers(), request: { header: name => req.get(name) ?? null, ip: req.ip ?? null } });
        setRegionCookie({ req, res, hint });
        clearLegacyCookie({ req, res });
      }
      res.json({ enabled, policy: config.policyVersion, regionMode: config.regionMode === 'opt-in' ? 'opt-in' : 'auto' });
    } catch (error) {
      let errorId: string | undefined;
      try { ({ errorId } = reportServerFailure({ error, operation: 'consent:public-context' }, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter })); } catch { /* Keep the original failure path if diagnostics fail. */
        console.error('[consent] public context unavailable', '[diagnostic unavailable]');
      }
      res.status(503).json({ error: 'Cookie preferences could not be loaded. Wait a minute, then reload to try again.', ...(errorId ? { errorId } : {}) });
    }
  });
}

/** Authored static documents load the same construction assets as managed shells. No page bytes
 * are inspected or changed; the browser installs only this server-owned contribution. */
function mountStaticThemeLoader({ app, deps }: { app: Express; deps: RouteDeps }): void {
  app.get(CONSENT_LOADER_SRC, async (req, res) => {
    try {
    const theme = deps.resolveActiveThemeId ? resolveActiveTheme({ deps, activeThemeId: await deps.resolveActiveThemeId() }) : null;
    const scripts = theme && theme !== NO_THEME_ID ? theme.manifest.scripts ?? [] : [];
    const assets = await siteConsentDocumentAssets({ deps, request: req, scripts });
    res.type('text/javascript').set('Cache-Control', 'public, max-age=60').set('Vary', 'X-Tovu-Static-Export').send(staticConsentLoaderScript({ ...assets, exporting: isStaticExportRequest(req) }));
    } catch (error) {
      let errorId: string | undefined;
      try { ({ errorId } = reportServerFailure({ error, operation: 'consent:static-loader' }, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter })); } catch { /* Keep the original failure path if diagnostics fail. */
        console.error('[consent] static loader unavailable', '[diagnostic unavailable]');
      }
      res.status(503).type('text/javascript').set('Cache-Control', 'no-store').send(`/* Cookie preferences could not be loaded. Wait a minute, then reload to try again.${errorId ? ` Reference: ${errorId}` : ''} */`);
    }
  });
}

/** Read the policy and plugin declarations together. Each keeps its last good value on failure.
 * @complexity O(1): one policy read and one declaration load at a time. */
function refreshDocumentState({ state, deps, consent }: { state: DocumentState; deps: RouteDeps; consent: SiteCookieConsentDeps }): Promise<void> {
  return refreshState({ state, readPolicy: () => readSiteConsentPolicy({ deps }),
    readDeclarations: () => consent.scriptDeclarations?.() ?? Promise.resolve({ scripts: [] }),
    policyFailure: error => {
      console.warn('[consent] Cookie preferences could not refresh. The last loaded preferences remain in use; a later request will try again:',
        describeErrorForLog({ err: error }));
    },
    declarationFailure: () => {
      console.warn('[consent] Plugin scripts could not refresh. The last loaded scripts remain in use; a later request will try again.');
    },
  });
}

/** The site's snapshot, created by its first app build; later builds add routes and read nothing. */
function siteDocumentState({ deps, consent, client }: { deps: RouteDeps; consent: SiteCookieConsentDeps; client: () => DocumentState['client'] }): DocumentState {
  const existing = documentStates.get(consent);
  if (existing) return existing;
  const state: DocumentState = { client: client(), scripts: Promise.resolve([]), nextReadAt: Infinity, now: () => deps.clock.nowMs(),
    schedule: (run, delayMs) => { const timer = setTimeout(run, delayMs); return () => clearTimeout(timer); } };
  documentStates.set(consent, state);
  const refresh = () => refreshDocumentState({ state, deps, consent });
  consent.refresh = refresh;
  state.refresh = refresh;
  consent.embedConsentOff = () => Boolean(state.policy && siteBannerMode({ config: state.policy }) === 'off');
  consent.exportAssets = () => siteConsentExportAssets({ deps });
  // Answered for one export run, before it renders. A good policy is never cleared, so no later page
  // can lose its banner when this finds one; a run starts from a fresh read, as it always has.
  consent.exportWarning = async () => {
    // The refresh logs its own failure; the export uses the last good policy or its warning.
    void refresh().catch(() => undefined);
    await briefPendingRead({ state });
    return state.policy ? undefined : 'Cookie preferences could not be loaded. This published copy has no cookie banner.';
  };
  // The refresh logs its own failure; startup continues without an unavailable policy.
  void refresh().catch(() => undefined);
  return state;
}

/** Routes and a construction-time snapshot only; no page-response capture or cookie work. */
export function applySiteCookieConsent({ app, deps, consent }: { app: Express; deps: RouteDeps; consent: SiteCookieConsentDeps }, { client: suppliedClient }: { client?: { body: Buffer; src: string } } = {}): void {
  const { client } = siteDocumentState({ deps, consent, client: () => suppliedClient ?? loadClient() });
  app.use(asyncRoute({ handler: async (req, res, next) => {
    // Resolve the cached publication before widget rendering; consent-off pages have no activation runtime.
    await documentPolicy({ consent });
    res.locals.siteConsentAssets = (required: { scripts: readonly DeclaredScript[]; static?: true }) => siteConsentDocumentAssets({ deps, request: req, ...required });
    next();
  } }));
  if (client) app.get(client.src, (_req, res) => { res.type('text/javascript').set('Cache-Control', 'public, max-age=31536000, immutable').send(client.body); });
  const resolve = createRequire(import.meta.url).resolve;
  try {
    const extension = fs.readFileSync(path.join(path.dirname(resolve('@jini-ai/cookie-consent/client.min.js')), 'extensions.min.js'));
    app.get(EXTENSION_SRC, (_req, res) => { res.type('text/javascript').set('Cache-Control', 'public, max-age=60').send(extension); });
  } catch (error) {
    let errorDiagnostic = "[diagnostic unavailable]";
    try { errorDiagnostic = formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS); } catch { /* Keep the original failure path if diagnostics fail. */ }
    console.warn('[consent] The cookie preferences extensions could not be loaded. Their browser route is disabled.', errorDiagnostic);
  }
  mountStaticThemeLoader({ app, deps });
  app.get('/_jini/browser-analytics/site/diagnostics.js', async (_req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!(await browserDiagnosticsEnabled({ observability: deps.observability, consentSetting: TELEMETRY_CONSENT }, deps))) { res.status(404).end(); return; }
    res.type('text/javascript').send(siteBrowserDiagnosticsModule);
  });
  mountContext({ app, consent });
  mountReceipts({ app, deps });
  mountPluginHttp({ app, deps });
}

async function documentPlugins({ deps, live }: { deps: Pick<RouteDeps, 'cookieConsent' | 'consentAdapters'> & Partial<Pick<RouteDeps, 'settingsRepo' | 'workspaceId' | 'observability'>>; live: boolean }): Promise<readonly RawContribution[]> {
  if (!live) return [];
  return [...deps.consentAdapters?.({ base: PLUGIN_BASE }).map(item => item.adapter) ?? [], ...await deps.cookieConsent?.browserPlugins?.() ?? [], ...(await browserDiagnosticsEnabled({ observability: deps.observability, consentSetting: TELEMETRY_CONSENT }, deps) ? [siteBrowserDiagnosticsBridge] : [])];
}

function requestPrivacy({ deps, req }: { deps: RouteDeps; req: Request }) {
  return { get cookieHeader() { return req.get('cookie'); }, get secGpc() { return req.get('sec-gpc') ?? null; },
    get dnt() { return req.get('dnt') ?? null; }, get nowMs() { return deps.clock.nowMs(); } };
}
