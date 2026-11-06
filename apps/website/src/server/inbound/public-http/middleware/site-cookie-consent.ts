import type { DocumentAssets } from '@jini-ai/cms/presentation';
import type { DeclaredScript } from '@jini-ai/cookie-consent';
import { renderScriptAssets } from '@jini-ai/cookie-consent/render';
import type { ConsentConfig } from '@jini-ai/cookie-consent';
/** Public declared-script assets, published context, receipts and plugin admission.
 * Documents receive asset contributions during construction; public responses are never scanned. */
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import { CONSENT_COOKIE, OPTIONAL, REGION_COOKIE, type ConsentState, type Optional, type RawContribution, type RegionResolver } from '@jini-ai/cookie-consent';
import { DEFAULT_MAX_AGE_MS, parseStored } from '@jini-ai/cookie-consent/policy';
import { renderBanner } from '@jini-ai/cookie-consent/render';
import { handleReceipt, readConsent, resolveRegion, type ConsentRecord } from '@jini-ai/cookie-consent/server';
import { consentRateLimitKey, createConsentFileRecords, createNodeConsentFiles } from '@jini-ai/cookie-consent/node';
import { createNodeAtomicFilesystem, writeJsonFileAtomic } from '@jini-ai/platform/fs';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import type { SiteCookieConsentDeps, ConsentPluginHttp, ConsentPluginContribution } from '#src/contracts/headless/index';
import { NO_THEME_ID, resolveActiveTheme } from '#src/features/theme/active-theme';
import { siteBannerMode, toSiteCookieConsent } from '#src/features/consent/cookie-consent';
import type { RouteDeps } from '#src/server/routes/types';
import { isStaticExportRequest } from '../routes/site/pages.js';
import { CONSENT_RECEIPTS_DIR_NAME, CONSENT_SAVE_PROFILE, readSiteConsentPolicy, resolveSiteConsentOrigin } from './site-consent.js';

export type { SiteCookieConsentDeps, ConsentPluginHttp, ConsentPluginContribution } from '#src/contracts/headless/index';

export const CONSENT_ENDPOINT = '/_consent';
const PLUGIN_BASE = `${CONSENT_ENDPOINT}/p`;
/** A dot segment or an encoded separator never reaches a plugin handler, whatever the plugin does with paths. */
const UNSAFE_PLUGIN_PATH = /(?:^|\/)\.\.?(?:\/|$)|%2e|%2f|%5c|\\/i;

/** Read the client bundle once; the hash makes its URL immutable (and lets static exports copy it). */
function loadClient(_required = {}, { resolve = createRequire(import.meta.url).resolve }: { resolve?: (id: string) => string } = {}) {
  try {
    const body = fs.readFileSync(resolve('@jini-ai/cookie-consent/client.min.js'));
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
    return { body, src: `${CONSENT_ENDPOINT}/client-${hash}.min.js` };
  } catch {
    console.warn('[consent] The cookie preferences client could not be loaded. Its browser route is disabled.');
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
    } catch { console.error('[consent] save failed'); res.status(503).set('Cache-Control', 'no-store').json({ error: 'Your choice could not be saved. Try again.' }); }
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
  if (UNSAFE_PLUGIN_PATH.test(full)) return undefined;
  return siteConsentPlugins({ deps }).find((item): item is ConsentPluginContribution & { http: ConsentPluginHttp } => Boolean(item.http && full.startsWith(item.http.path + '/')));
}

/** Same-origin/category/rate decision plus the server-owned analytics level. Anonymous delivery needs
 * an adapter declaring support. A category that is not optional (even 'necessary') is read as marketing,
 * the strictest. @complexity O(cookie header) plus one policy read. */
async function collectorDecision(
  { req, deps, adapter, limiter }: { req: Request; deps: RouteDeps; adapter: RawContribution; limiter: ReturnType<typeof createRateLimiter> },
  _optional = {},
): Promise<{ status: 403 | 429 | null; analyticsLevel: ConsentState['analyticsLevel'] }> {
  const denied = { status: 403, analyticsLevel: 'none' } as const;
  if (req.get('origin') !== resolveSiteConsentOrigin({ request: req })) return denied;
  const category: Optional = (OPTIONAL as readonly unknown[]).includes(adapter.category) ? adapter.category as Optional : 'marketing';
  const state = await readSiteVisitorConsent({ deps, req });
  const allowed = category === 'analytics' && state.analyticsLevel === 'anonymous' ? adapter.supportsAnonymous === true : state.allowed[category];
  if (!allowed) return denied;
  // The receipts' key (an IPv6 /64), so rotating addresses inside one network shares one budget.
  return { status: (await limiter.check({ key: consentRateLimitKey({ address: resolveClientIp(req) }) })).allowed ? null : 429, analyticsLevel: state.analyticsLevel };
}

/** The server gate: what this visitor may run right now (GPC/DNT applied, durable rule: an
 * unconfirmed grant is not allowed). A failed policy read allows nothing. @complexity O(cookie header). */
export async function readSiteVisitorConsent({ deps, req }: { deps: RouteDeps; req: Request }, _optional = {}) {
  try {
    const snapshot = await documentPolicy({ consent: deps.cookieConsent });
    if (unavailableDocumentPolicy({ consent: deps.cookieConsent, config: snapshot })) return readConsent({ cookieHeader: '', policy: '', regionMode: 'opt-in' });
    if (snapshot && siteBannerMode({ config: snapshot }) === 'off') return readConsent({ cookieHeader: '', policy: snapshot.policyVersion, regionMode: 'opt-in' }, {
      ...requestPrivacy({ deps, req }), anonymous: true,
    });
    const config = snapshot ?? await readSiteConsentPolicy({ deps });
    return readConsent({ cookieHeader: req.get('cookie'), policy: config.policyVersion, regionMode: config.regionMode === 'opt-in' ? 'opt-in' : 'auto' }, {
      ...requestPrivacy({ deps, req }), anonymous: siteBannerMode({ config }) === 'off',
    });
  } catch {
    return readConsent({ cookieHeader: '', policy: '', regionMode: 'opt-in' });
  }
}

/** The published policy id visitors are asked under now. @complexity O(1) reads. */
async function readSiteConsentPolicyVersion({ deps }: { deps: RouteDeps }, _optional = {}): Promise<string> {
  return (await readSiteConsentPolicy({ deps })).policyVersion;
}

/** Detached delivery recheck, the old engine's rule: the receipt is still active (a later choice retires
 * it), names the current policy, grants analytics without GPC and is within the choice lifetime. A forged
 * or withdrawn receipt id never delivers. @complexity O(1): one policy read and one receipt read. */
export async function siteReceiptAllowsAnalytics({ deps, proof }: { deps: RouteDeps; proof: { receiptId: string; policyVersion: string } }, _optional = {}): Promise<boolean> {
  const snapshot = await documentPolicy({ consent: deps.cookieConsent });
  if (unavailableDocumentPolicy({ consent: deps.cookieConsent, config: snapshot })) return false;
  if (snapshot && siteBannerMode({ config: snapshot }) === 'off') return false;
  const policy = snapshot?.policyVersion ?? await readSiteConsentPolicyVersion({ deps });
  if (proof.policyVersion !== policy) return false;
  const record = (await siteReceiptStore({ deps }).read?.({ id: proof.receiptId }) ?? null) as Partial<ConsentRecord> | null;
  return activeAnalyticsRecord({ record, policy, nowMs: deps.clock.nowMs() });
}

function activeAnalyticsRecord({ record, policy, nowMs }: { record: Partial<ConsentRecord> | null; policy: string; nowMs: number }, _optional = {}): boolean {
  if (!record || record.policyVersion !== policy || record.gpc !== false) return false;
  return record.choices?.analytics === true && nowMs - Date.parse(String(record.timestamp)) <= DEFAULT_MAX_AGE_MS;
}

/** The old engine's analytics proof shape (receipt id + policy), from the new cookie. Undefined unless
 * analytics is allowed and a server receipt exists. @complexity O(cookie header). */
export async function readSiteAnalyticsProof({ deps, req }: { deps: RouteDeps; req: Request }, _optional = {}): Promise<{ receiptId: string; policyVersion: string } | undefined> {
  const state = await readSiteVisitorConsent({ deps, req });
  if (state.analyticsLevel !== 'full') return undefined;
  const raw = req.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`))?.[1];
  let receiptId: string | undefined;
  try { receiptId = parseStored({ raw: raw === undefined ? null : decodeURIComponent(raw) })?.r; } catch { receiptId = undefined; }
  return receiptId ? { receiptId, policyVersion: state.policy } : undefined;
}

/** One published construction snapshot per site (per consent deps), shared by every app built over
 * them: an export, an inspection or a theme override never resets what live visitors are served.
 * Refreshed by publication. No per-page reads. */
type DocumentState = {
  policy?: ConsentConfig;
  pending?: Promise<void>;
  scripts: Promise<readonly DeclaredScript[]>;
  client?: { body: Buffer; src: string };
  nextReadAt: number;
  now: () => number;
  refresh?: () => Promise<void>;
};
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
  const state = consent && documentStates.get(consent);
  if (!state) return null;
  if (state.now() >= state.nextReadAt) void state.refresh?.().catch(() => undefined);
  if (state.policy) return state.policy;
  await briefPendingRead({ state });
  return state.policy ?? null;
}

/** Wait at most 250 ms for a read in flight; with none, resolve at once. A late success still lands. */
async function briefPendingRead({ state }: { state: DocumentState }): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([state.pending?.catch(() => undefined), new Promise(resolve => { timer = setTimeout(resolve, 250); })]); }
  finally { clearTimeout(timer); }
}

/** Document construction consumes data, never a completed response body. */
export async function siteConsentDocumentAssets({ deps, request, scripts, static: staticDocument }: { deps: Pick<RouteDeps, 'cookieConsent' | 'consentAdapters'>; request: Request; scripts: readonly DeclaredScript[]; static?: true }, _optional = {}): Promise<DocumentAssets> {
  const consent = deps.cookieConsent;
  const config = await documentPolicy({ consent });
  if (staticDocument) return staticDocumentAssets({ config, request });
  const allScripts = [...scripts, ...await documentDeclarations({ consent })];
  if (request.res?.locals.tovuRenderThemeIdOverride) return { head: renderScriptAssets({ scripts: allScripts.filter(script => script.consent === undefined) }), body: '' };
  if (!config || !consent) return { head: renderScriptAssets({ scripts: allScripts.filter(script => script.consent === undefined) }), body: '' };
  if (siteBannerMode({ config }) === 'off') return { head: renderScriptAssets({ scripts: allScripts }), body: '' };
  return renderDocumentConsent({ deps, request, consent, config, scripts: allScripts });
}

/** Static documents share managed shells' cached publication and preview policy. */
async function staticDocumentAssets({ config, request }: {
  config: ConsentConfig | null; request: Request;
}): Promise<DocumentAssets> {
  if (!config || siteBannerMode({ config }) === 'off' || request.res?.locals.tovuRenderThemeIdOverride) return { head: '', body: '' };
  return { head: `<script src="${CONSENT_LOADER_SRC}" defer data-jini-consent-loader></script>`, body: '' };
}

/** Render the shared banner and client assets once a usable snapshot has been selected. */
async function renderDocumentConsent({ deps, request, consent, config, scripts }: {
  deps: Pick<RouteDeps, 'cookieConsent' | 'consentAdapters'>; request: Request; consent: SiteCookieConsentDeps;
  config: ConsentConfig; scripts: readonly DeclaredScript[];
}): Promise<DocumentAssets> {
  const live = !isStaticExportRequest(request);
  const plugins = await documentPlugins({ deps, live });
  const { banner, options } = toSiteCookieConsent({ config, policy: config.policyVersion }, { plugins });
  const rendered = renderBanner({ ...banner, client: { ...banner.client, scripts, ...(live ? { context: `${CONSENT_ENDPOINT}/context` } : {}) } }, {
    ...options, clientSrc: documentStates.get(consent)?.client?.src, extensionSrc: EXTENSION_SRC,
    evidence: live ? { mode: 'durable', endpoint: CONSENT_ENDPOINT } : { mode: 'local' },
  });
  return { head: rendered.head, body: rendered.body + '<a class="jini-consent-settings" href="#privacy-choices" data-consent-open>Cookie settings</a>' };
}

/** JSON declaration URLs are invisible to an HTML crawler. No live collectors enter an export. */
export async function siteConsentExportAssets({ deps }: { deps: Pick<RouteDeps, 'cookieConsent'> }, _optional = {}): Promise<readonly string[]> {
  const config = await documentPolicy({ consent: deps.cookieConsent });
  const declared = await documentDeclarations({ consent: deps.cookieConsent });
  const local = declared.filter(script => script.src.startsWith('/') && (config || script.consent === undefined)).map(script => script.src);
  if (!config || siteBannerMode({ config }) === 'off') return local;
  return [...(documentStates.get(deps.cookieConsent!)?.client ? [documentStates.get(deps.cookieConsent!)!.client!.src] : []), EXTENSION_SRC, ...local];
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
    } catch { console.error('[consent] public context unavailable'); res.status(503).json({ error: 'Cookie preferences could not be loaded. Wait a minute, then reload to try again.' }); }
  });
}

/** Authored static documents load the same construction assets as managed shells. No page bytes
 * are inspected or changed; the browser installs only this server-owned contribution. */
function mountStaticThemeLoader({ app, deps }: { app: Express; deps: RouteDeps }): void {
  app.get(CONSENT_LOADER_SRC, async (req, res) => {
    try {
    const theme = deps.resolveActiveThemeId ? resolveActiveTheme(deps, await deps.resolveActiveThemeId()) : null;
    const scripts = theme && theme !== NO_THEME_ID ? theme.manifest.scripts ?? [] : [];
    const assets = await siteConsentDocumentAssets({ deps, request: req, scripts });
    const markup = JSON.stringify(assets.head + assets.body);
    res.type('text/javascript').set('Cache-Control', 'public, max-age=60').set('Vary', 'X-Tovu-Static-Export').send(`(()=>{
      if(document.getElementById('jini-consent-config'))return;
      const template=document.createElement('template');template.innerHTML=${markup};
      ${isStaticExportRequest(req) ? String.raw`// Only this server-owned contribution is rebased, never the authored document.
      const base=document.currentScript?new URL('..',document.currentScript.src).pathname.replace(/\/$/,''):'';
      const prefix=value=>typeof value==='string'&&/^\/(?!\/)/.test(value)?base+value:value;
      for(const node of template.content.querySelectorAll('[src],[href]')){
        for(const attr of ['src','href'])if(node.hasAttribute(attr))node.setAttribute(attr,prefix(node.getAttribute(attr)));}
      const config=template.content.querySelector('#jini-consent-config');
      if(config)config.textContent=JSON.stringify(JSON.parse(config.textContent),(key,value)=>key==='src'?prefix(value):value);` : ''}
      const scripts=[];
      for(const node of [...template.content.childNodes]){
        if(node.nodeName==='SCRIPT'&&node.getAttribute('src'))scripts.push(node);
        else document.body.append(node);
      }
      for(const node of scripts){const script=document.createElement('script');
        for(const attr of node.attributes)script.setAttribute(attr.name,attr.value);
        script.async=false;document.body.append(script);}
    })();`);
    } catch {
      console.error('[consent] static loader unavailable');
      res.status(503).type('text/javascript').set('Cache-Control', 'no-store').send('/* Cookie preferences could not be loaded. Wait a minute, then reload to try again. */');
    }
  });
}

/** Read the policy and plugin declarations together. Each keeps its last good value on failure.
 * @complexity O(1): one policy read and one declaration load at a time. */
function refreshDocumentState({ state, deps, consent }: { state: DocumentState; deps: RouteDeps; consent: SiteCookieConsentDeps }): Promise<void> {
  if (state.pending) return state.pending;
  state.nextReadAt = state.now() + 60_000;
  const policy = readSiteConsentPolicy({ deps }).then(config => { state.policy = config; }, error => {
    console.warn('[consent] Cookie preferences could not refresh. The last loaded preferences remain in use; a later request will try again.');
    throw error;
  });
  const lastGoodScripts = state.scripts;
  state.scripts = (consent.scriptDeclarations?.() ?? Promise.resolve({ scripts: [] })).then(loaded => loaded.scripts, () => {
    console.warn('[consent] Plugin scripts could not refresh. The last loaded scripts remain in use; a later request will try again.');
    return lastGoodScripts;
  });
  state.pending = Promise.allSettled([policy, state.scripts]).then(([read]) => {
    if (read.status === 'rejected') throw read.reason;
  }).finally(() => { state.pending = undefined; });
  return state.pending;
}

/** The site's snapshot, created by its first app build; later builds add routes and read nothing. */
function siteDocumentState({ deps, consent, client }: { deps: RouteDeps; consent: SiteCookieConsentDeps; client: () => DocumentState['client'] }): DocumentState {
  const existing = documentStates.get(consent);
  if (existing) return existing;
  const state: DocumentState = { client: client(), scripts: Promise.resolve([]), nextReadAt: Infinity, now: () => deps.clock.nowMs() };
  documentStates.set(consent, state);
  const refresh = () => refreshDocumentState({ state, deps, consent });
  consent.refresh = refresh;
  state.refresh = refresh;
  consent.embedConsentOff = () => Boolean(state.policy && siteBannerMode({ config: state.policy }) === 'off');
  consent.exportAssets = () => siteConsentExportAssets({ deps });
  // Answered for one export run, before it renders. A good policy is never cleared, so no later page
  // can lose its banner when this finds one; a run starts from a fresh read, as it always has.
  consent.exportWarning = async () => {
    void refresh().catch(() => undefined);
    await briefPendingRead({ state });
    return state.policy ? undefined : 'Cookie preferences could not be loaded. This published copy has no cookie banner.';
  };
  void refresh().catch(() => undefined);
  return state;
}

/** Routes and a construction-time snapshot only; no page-response capture or cookie work. */
export function applySiteCookieConsent({ app, deps, consent }: { app: Express; deps: RouteDeps; consent: SiteCookieConsentDeps }, { client: suppliedClient }: { client?: { body: Buffer; src: string } } = {}): void {
  const { client } = siteDocumentState({ deps, consent, client: () => suppliedClient ?? loadClient() });
  app.use(async (req, res, next) => {
    // Resolve the cached publication before widget rendering; consent-off pages have no activation runtime.
    await documentPolicy({ consent });
    res.locals.siteConsentAssets = (required: { scripts: readonly DeclaredScript[]; static?: true }) => siteConsentDocumentAssets({ deps, request: req, ...required });
    next();
  });
  if (client) app.get(client.src, (_req, res) => { res.type('text/javascript').set('Cache-Control', 'public, max-age=31536000, immutable').send(client.body); });
  const resolve = createRequire(import.meta.url).resolve;
  try {
    const extension = fs.readFileSync(path.join(path.dirname(resolve('@jini-ai/cookie-consent/client.min.js')), 'extensions.min.js'));
    app.get(EXTENSION_SRC, (_req, res) => { res.type('text/javascript').set('Cache-Control', 'public, max-age=60').send(extension); });
  } catch { console.warn('[consent] The cookie preferences extensions could not be loaded. Their browser route is disabled.'); }
  mountStaticThemeLoader({ app, deps });
  mountContext({ app, consent });
  mountReceipts({ app, deps });
  mountPluginHttp({ app, deps });
}

async function documentPlugins({ deps, live }: { deps: Pick<RouteDeps, 'cookieConsent' | 'consentAdapters'>; live: boolean }): Promise<readonly RawContribution[]> {
  if (!live) return [];
  return [...deps.consentAdapters?.({ base: PLUGIN_BASE }).map(item => item.adapter) ?? [], ...await deps.cookieConsent?.browserPlugins?.() ?? []];
}

function requestPrivacy({ deps, req }: { deps: RouteDeps; req: Request }) {
  return { secGpc: req.get('sec-gpc') ?? null, dnt: req.get('dnt') ?? null, nowMs: deps.clock.nowMs() };
}
