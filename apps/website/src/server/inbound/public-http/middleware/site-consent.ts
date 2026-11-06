/** Public consent policy and host bindings. No HTML processing or response rewriting. */
import type { Request } from 'express';
import type { ConsentConfig } from '@jini-ai/cookie-consent';
import type { RateLimitProfile } from '#src/contracts/core/rate-limit/rate-limit';
import { parseConsentConfig, consentConfigProblems } from '#src/features/consent/validation';
import { withSiteConsentDefaultCss } from '#src/features/consent/config';
import { createSiteConsentConfig } from '#src/features/consent/settings';
import { findPublishedPostBySlug } from '#src/features/post/post';
import type { RouteDeps } from '#src/server/routes/types';
import { resolvePublicOrigin, resolveProtocol } from '../routes/oauth/public-origin.js';
/** Receipt evidence is non-portable and stays outside the public site assets. */
export const CONSENT_RECEIPTS_DIR_NAME = 'consent-receipts';
/** Twenty choices per ten minutes per address, with a small burst for retries. */
export const CONSENT_SAVE_PROFILE: RateLimitProfile = { windowSeconds: 600, max: 20, burst: 5 };

/** Keep a public configured origin pinned; a loopback one yields to the request's own loopback origin.
 * A loopback configured origin means a local site, which may be served over HTTP or on another
 * port than a copied TOVU_PUBLIC_URL names (owner 11-02: banner saves 403'd on http://localhost:3002).
 * The browser's Origin header is still compared with this request's own loopback origin, so other
 * local ports and DNS-rebinding hosts (non-loopback Host) stay refused.
 * Only Host identifies this request; X-Forwarded-Host must never widen consent's origin check.
 * Invalid request hosts retain the configured origin. Configuration errors still propagate.
 * @complexity O(1), bounded request headers; no I/O. */
export function resolveSiteConsentOrigin({ request }: { request: Request }, _options = {}): string {
  const configured = new URL(resolvePublicOrigin(request));
  const loopback = /^(?:localhost|127(?:\.\d+){3}|\[::1\])$/;
  if (!loopback.test(configured.hostname)) return configured.origin;
  try {
    const own = new URL(`${resolveProtocol(request)}://${request.get('host')}`);
    return loopback.test(own.hostname) ? own.origin : configured.origin;
  } catch { return configured.origin; }
}

/** A local single-segment link (/privacy) must name a published page; https links are trusted.
 * @complexity O(1), one indexed slug lookup. */
export function createPrivacyPageCheck({ deps }: { deps: Pick<RouteDeps, "postRepo" | "workspaceId"> }, _optional = {}) {
  return async ({ url }: { url: string }, _options = {}): Promise<boolean> => {
    if (url.startsWith("https://")) return true;
    const slug = /^\/([a-z0-9-]+)\/?$/.exec(url)?.[1];
    if (!slug) return false;
    return (await findPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } })) !== null;
  };
}

/** The site's live consent policy: the published revision, else the legacy settings. Publication is the only source for public context and server analytics.
 * The cookie-consent engine drops a bad CSS rule alone.
 * @throws when the published revision fails validation (callers fail closed).
 * @complexity O(1): one store read, plus one settings read before the first publication. */
export async function readSiteConsentPolicy({ deps }: { deps: RouteDeps }, _optional = {}): Promise<ConsentConfig> {
  await deps.siteConsentReady;
  const revision = await deps.consentStore?.readPublished({});
  // An empty owner Custom CSS gets Tovu's default banner style (owner, 2026-10-22).
  if (!revision) {
    const legacy = await createSiteConsentConfig({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId }).get({});
    return withSiteConsentDefaultCss({ config: { ...legacy, regionMode: legacy.regionMode === 'opt-out' ? 'auto' : legacy.regionMode } });
  }
  const published = parseConsentConfig({ value: revision.config });
  // An old global opt-out must never hide Reject for EU/UK/unknown visitors.
  const config = withSiteConsentDefaultCss({ config: { ...published, regionMode: published.regionMode === 'opt-out' ? 'auto' : published.regionMode } });
  if (consentConfigProblems({ config, trustedRegion: false }, { cssBlocks: false }).length) throw new Error('Published consent policy is invalid.');
  // Receipts name an immutable configuration; changing a published revision requires a new choice.
  return { ...config, reopen: "link", policyVersion: `${config.policyVersion}:${revision.id}` };
}
