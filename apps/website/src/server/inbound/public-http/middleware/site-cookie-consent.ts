/**
 * @file Public delivery for `@jini-ai/cookie-consent` (the replacement for `site-consent.ts`'s
 * per-request engine). Nothing here rewrites the owner's page: the same banner markup is added to
 * every public HTML page (live and static export alike), the browser client decides what runs, and
 * the server only stores receipts, sets the region cookie and gates its own analytics with
 * `readConsent`. Mounted instead of `applySiteConsent` when `deps.cookieConsent` is set (the one
 * switch; P4 deletes the old engine).
 *
 * Routes (all same-origin):
 * - `GET  /_consent/client-<hash>.min.js` the browser client, immutable (the hash is its content).
 * - `POST /_consent`                       durable receipts (`handleReceipt` + file records).
 * - `*    /_consent/p/<id>/…`              assets and collectors of active plugins' adapters.
 */
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import { CONSENT_COOKIE, OPTIONAL, REGION_COOKIE, type BannerMode, type ConsentState, type Optional, type RawContribution, type RegionResolver } from '@jini-ai/cookie-consent';
import { DEFAULT_MAX_AGE_MS, parseStored } from '@jini-ai/cookie-consent/policy';
import { renderBanner, type RenderedBanner } from '@jini-ai/cookie-consent/render';
import { handleReceipt, readConsent, resolveRegion, type ConsentRecord } from '@jini-ai/cookie-consent/server';
import { consentRateLimitKey, createConsentFileRecords, createNodeConsentFiles } from '@jini-ai/cookie-consent/node';
import { createNodeAtomicFilesystem, writeJsonFileAtomic } from '@jini-ai/platform/fs';
import { createRateLimiter, resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import type { SiteCookieConsentDeps, ConsentPluginHttp, ConsentPluginContribution } from '#src/contracts/headless/site-cookie-consent';
import { renderSiteConsentPreview, siteBannerMode, toSiteCookieConsent, type SiteConsentSource } from '#src/features/consent/cookie-consent';
import type { ConsentDryRunGate } from '#src/features/consent/readiness';
import { withSiteConsentSettingsLink } from '#src/features/consent/settings-link';
import type { RouteDeps } from '#src/server/routes/types';
import { insertBeforeUncommentedTag } from '../http/site/render.js';
import { isStaticExportRequest } from '../routes/site/pages.js';
import { CONSENT_RECEIPTS_DIR_NAME, CONSENT_SAVE_PROFILE, readSiteConsentPolicy, resolveSiteConsentOrigin } from './site-consent.js';

export type { SiteCookieConsentDeps, ConsentPluginHttp, ConsentPluginContribution } from '#src/contracts/headless/site-cookie-consent';
type SiteRenderedBanner = RenderedBanner & { mode?: BannerMode };

export const CONSENT_ENDPOINT = '/_consent';
const PLUGIN_BASE = `${CONSENT_ENDPOINT}/p`;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
/** A dot segment or an encoded separator never reaches a plugin handler, whatever the plugin does with paths. */
const UNSAFE_PLUGIN_PATH = /(?:^|\/)\.\.?(?:\/|$)|%2e|%2f|%5c|\\/i;

/** Read the client bundle once; the hash makes its URL immutable (and lets static exports copy it). */
function loadClient(_required = {}, { resolve = createRequire(import.meta.url).resolve }: { resolve?: (id: string) => string } = {}) {
  const body = fs.readFileSync(resolve('@jini-ai/cookie-consent/client.min.js'));
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  return { body, src: `${CONSENT_ENDPOINT}/client-${hash}.min.js` };
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

/** One page's banner. Exports get local evidence and no plugins (no server to store or collect).
 * @complexity O(copy + CSS length). */
export async function renderSiteBanner({ deps, request, clientSrc }: { deps: RouteDeps; request: Request; clientSrc: string }, _optional = {}): Promise<SiteRenderedBanner> {
  const config = await readSiteConsentPolicy({ deps }, { cssBlocks: false });
  const live = !isStaticExportRequest(request);
  const plugins = live ? siteConsentPlugins({ deps }).map(item => item.adapter) : [];
  const { banner, options } = toSiteCookieConsent({ config, policy: config.policyVersion }, { plugins });
  return { ...renderBanner(banner, { ...options, clientSrc, evidence: live ? { mode: 'durable', endpoint: CONSENT_ENDPOINT } : { mode: 'local' } }), mode: banner.mode };
}

/** Insert head/body before the first `</head>` / `</body>` that is real markup (not inside a comment),
 * then Tovu's footer "Cookie settings" link. A page without them gets nothing. @complexity O(HTML bytes). */
export function insertBanner({ html, rendered }: { html: string; rendered: SiteRenderedBanner }, _optional = {}): string {
  if (!rendered.head && !rendered.body) return html;
  const withHead = insertBeforeUncommentedTag(html, /<\/head>/gi, rendered.head);
  const withBody = insertBeforeUncommentedTag(withHead, /<\/body>/gi, rendered.body);
  return rendered.mode === 'off' ? withBody : withSiteConsentSettingsLink({ html: withBody }, { engine: 'cookie-consent' });
}

/** The admin preview/readiness gate for this engine: the rendered page with the scriptless preview
 * banner for the sampled region, its `<html>` attributes standing in for what the client sets.
 * Same signature as the old engine's gate, so the consent service needs no second code path.
 * @complexity O(HTML bytes + CSS length). */
export const cookieConsentPreviewGate = (({ html, config, regionMode }: { html: string; config: SiteConsentSource; regionMode: string }) => {
  const rendered = renderSiteConsentPreview({ config, policy: config.policyVersion }, { region: regionMode === 'opt-out' ? 'opt-out' : 'opt-in' });
  // Attributes last: they include data-consent-open, which would read as the theme's own opener and
  // hide the footer link that live pages get.
  const withBanner = insertBanner({ html, rendered });
  return rendered.htmlAttrs ? withBanner.replace(/<html\b/i, `<html ${rendered.htmlAttrs}`) : withBanner;
}) as unknown as ConsentDryRunGate;

/** Any body chunk Node accepts (string, Buffer, Uint8Array) as bytes. */
const toBuffer = ({ chunk, encoding }: { chunk: string | Uint8Array; encoding: unknown }, _optional = {}): Buffer => {
  if (typeof chunk !== 'string') return Buffer.from(chunk);
  return Buffer.from(chunk, typeof encoding === 'string' ? encoding as BufferEncoding : 'utf8');
};

/** Buffer one HTML response and hand the full body to `transform` at `end`. A response that is not
 * HTML, already flushed, or over the cap goes out untouched (the page then has no banner: nothing
 * optional runs without the client). @complexity O(body bytes). */
export function captureHtml({ res, transform }: { res: Response; transform: (required: { html: string }) => Promise<string> }, { maxBytes = MAX_HTML_BYTES }: { maxBytes?: number } = {}): void {
  const { write, end } = res;
  const chunks: Buffer[] = [];
  let size = 0;
  const isHtml = () => String(res.getHeader('content-type') ?? '').includes('text/html') && !res.getHeader('content-encoding') && !res.headersSent;
  // `res.send` ends with one chunk and never calls `write`, so the cap is checked here too. An empty
  // body (HEAD) has nothing to transform, and its Content-Length/ETag describe the GET body.
  const untouched = (body: Buffer) => {
    if (!isHtml() || body.length === 0 || body.length > maxBytes) return true;
    return res.statusCode >= 400 || res.statusCode === 204 || res.statusCode === 304;
  };
  const passThrough = () => { res.write = write; res.end = end; const held = Buffer.concat(chunks); chunks.length = 0; if (held.length) Reflect.apply(write, res, [held]); };
  res.write = function (this: Response, chunk: unknown, encoding?: unknown, callback?: unknown) {
    const buffer = toBuffer({ chunk: chunk as string | Uint8Array, encoding });
    if (!isHtml() || size + buffer.length > maxBytes) { passThrough(); return Reflect.apply(write, this, [chunk, encoding, callback]); }
    chunks.push(buffer); size += buffer.length;
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') queueMicrotask(() => (done as () => void)());
    return true;
  } as Response['write'];
  res.end = function (this: Response, chunk?: unknown, encoding?: unknown, callback?: unknown) {
    res.write = write; res.end = end;
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) chunks.push(toBuffer({ chunk, encoding }));
    const done = [chunk, encoding, callback].find(item => typeof item === 'function') as (() => void) | undefined;
    const original = Buffer.concat(chunks);
    if (untouched(original)) { Reflect.apply(end, this, [original, done]); return this; }
    transform({ html: original.toString('utf8') }).then(html => {
      res.removeHeader('Content-Length'); res.removeHeader('ETag');
      Reflect.apply(end, this, [Buffer.from(html), done]);
    }, () => Reflect.apply(end, this, [original, done]));
    return this;
  } as Response['end'];
}

/** Set or clear `jini_region` from this site's trusted readers, only when it changes. Pages only, so
 * assets keep their caching. A throw, timeout or no reader = strict (cookie cleared). @complexity O(resolvers). */
async function applyRegionCookie({ req, res, resolvers, deps }: { req: Request; res: Response; resolvers: readonly RegionResolver[]; deps: RouteDeps }, _optional = {}): Promise<void> {
  // Anonymous delivery neither geolocates a visitor nor writes the cross-page region cookie.
  if (siteBannerMode({ config: await readSiteConsentPolicy({ deps }, { cssBlocks: false }) }) === 'off') return;
  const hint = await resolveRegion({ resolvers, request: { header: name => req.get(name) ?? null, ip: req.ip ?? null } });
  setRegionCookie({ req, res, hint });
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
      const config = await readSiteConsentPolicy({ deps }, { cssBlocks: false });
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
    const config = await readSiteConsentPolicy({ deps }, { cssBlocks: false });
    return readConsent({ cookieHeader: req.get('cookie'), policy: config.policyVersion, regionMode: config.regionMode === 'opt-in' ? 'opt-in' : 'auto' }, {
      secGpc: req.get('sec-gpc') ?? null, dnt: req.get('dnt') ?? null, nowMs: deps.clock.nowMs(), anonymous: siteBannerMode({ config }) === 'off',
    });
  } catch {
    return readConsent({ cookieHeader: '', policy: '', regionMode: 'opt-in' });
  }
}

/** The published policy id visitors are asked under now. @complexity O(1) reads. */
async function readSiteConsentPolicyVersion({ deps }: { deps: RouteDeps }, _optional = {}): Promise<string> {
  return (await readSiteConsentPolicy({ deps }, { cssBlocks: false })).policyVersion;
}

/** Detached delivery recheck, the old engine's rule: the receipt is still active (a later choice retires
 * it), names the current policy, grants analytics without GPC and is within the choice lifetime. A forged
 * or withdrawn receipt id never delivers. @complexity O(1): one policy read and one receipt read. */
export async function siteReceiptAllowsAnalytics({ deps, proof }: { deps: RouteDeps; proof: { receiptId: string; policyVersion: string } }, _optional = {}): Promise<boolean> {
  const policy = await readSiteConsentPolicyVersion({ deps });
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
  const raw = req.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`))?.[1];
  let receiptId: string | undefined;
  try { receiptId = parseStored({ raw: raw === undefined ? null : decodeURIComponent(raw) })?.r; } catch { receiptId = undefined; }
  return state.analyticsLevel === 'full' && receiptId ? { receiptId, policyVersion: state.policy } : undefined;
}

/** Register the cookie-consent routes and the page slot on the public app. @complexity O(1) setup;
 * per page one policy read, one region resolution and one O(HTML) insertion. */
export function applySiteCookieConsent({ app, deps, consent }: { app: Express; deps: RouteDeps; consent: SiteCookieConsentDeps }, { client = loadClient() }: { client?: { body: Buffer; src: string } } = {}): void {
  app.get(client.src, (_req, res) => { res.type('text/javascript').set('Cache-Control', 'public, max-age=31536000, immutable').send(client.body); });
  mountReceipts({ app, deps });
  mountPluginHttp({ app, deps });
  app.use(async (req, res, next) => {
    const page = (req.method === 'GET' || req.method === 'HEAD') && !/\.(?!html?$)[a-z0-9]+$/i.test(req.path) && !/^\/(?:admin|api|_consent|theme-preview|theme-explore)(?:\/|$)/.test(req.path);
    if (!page || res.locals.tovuRenderThemeIdOverride) { next(); return; }
    // The banner follows the published policy, which a page's own ETag doesn't cover: no 304 for pages.
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    if (!isStaticExportRequest(req)) {
      clearLegacyCookie({ req, res });
      try { await applyRegionCookie({ req, res, deps, resolvers: await consent.regionResolvers() }); }
      catch { console.error('[consent] region check failed'); }
    }
    captureHtml({ res, transform: async ({ html }) => {
      try { return insertBanner({ html, rendered: await renderSiteBanner({ deps, request: req, clientSrc: client.src }) }); }
      catch { console.error('[consent] banner render failed'); return html; }
    } });
    next();
  });
}
