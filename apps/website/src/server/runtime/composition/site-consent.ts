/** @file Composition-only bindings for site consent administration and public delivery. */
import path from 'node:path';
import { getEffective, set } from '@jini-ai/core/settings';
import { ensureSitePrivacyDefaults } from '#src/features/consent/ensure-privacy-defaults';
import { SITE_CONSENT_NAMESPACE } from '#src/features/consent/config';
import { resolveSiteTitle } from '#src/features/settings/site-title';
import { readConsentReceiptStorage } from '@jini-ai/cookie-consent/node';
import { createSiteConsentService } from '#src/features/consent/service';
import { readSiteConsentAuthoringSettings, resolveSiteConsentActivation } from '#src/features/consent/settings';
import { fetchPublishedPage, resolveSameOriginPath } from '#src/features/site-inspection/published-page';
import type { RouteDeps } from '#src/server/routes/types';
import { CONSENT_RECEIPTS_DIR_NAME, createPrivacyPageCheck } from '../../inbound/public-http/middleware/site-consent.js';
import { findPublishedPostBySlug } from '#src/features/post/post';
import { isBarePageChoice } from '#src/features/theme/static-render';
import { isFullHtmlDocument } from '../../inbound/public-http/http/site/bare-page.js';
import type { ConsentProblem } from '#src/features/consent/validation';
import { NO_THEME_ID, resolveActiveTheme } from '#src/features/theme/active-theme';

/** Reuse the existing local-render owner (bounded reads, timeout, finally-close, no external URL).
 * @example bindSiteConsentService({ deps })
 * @complexity O(1) setup; operations inherit the shared renderer/repository bounds. */
export function bindSiteConsentService({ deps }: { deps: RouteDeps }, _options = {}) {
  return createSiteConsentService({ ports: siteConsentPorts({ deps }) });
}

/** The consent service's ports bound to one site's deps; split from {@link bindSiteConsentService}
 * so each port's fallback and failure arm is unit-testable without building the service.
 * @complexity O(1) setup. */
export function siteConsentPorts({ deps }: { deps: RouteDeps }, _options = {}): Parameters<typeof createSiteConsentService>[0]["ports"] {
  return {
    workspaceId: deps.workspaceId, authorize: deps.authorize, store: deps.consentStore,
    ready: deps.siteConsentReady, clock: deps.clock, ids: deps.idGen,
    trustedRegion: Boolean(deps.consentTrustedRegionHeader),
    published: async () => { await deps.cookieConsent?.refresh?.(); },
    declarationEvidence: async ({ path }) => {
      const theme = resolveActiveTheme(deps, await deps.resolveActiveThemeId());
      const plugins = await deps.cookieConsent?.scriptDeclarations?.() ?? { scripts: [], problems: [] };
      const page = await publishedPageSlot({ deps, path });
      const active = theme && theme !== NO_THEME_ID ? theme : null;
      return { scripts: [...(active?.manifest.scripts ?? []), ...plugins.scripts], problems: [...plugins.problems, ...page.problems],
        runtimeSlot: page.slot ?? active?.manifest.tier !== 'static' };
    },
    readLegacy: async () => readSiteConsentAuthoringSettings({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId }),
    defaultOnly: async () => (await resolveSiteConsentActivation({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId })).source === 'default',
    privacyPageExists: createPrivacyPageCheck({ deps }),
    receiptStorage: async () => {
      try { return await readConsentReceiptStorage({ directory: path.join(deps.siteBinding.dir, CONSENT_RECEIPTS_DIR_NAME) }); }
      catch (error) { console.error('[consent] receipt storage check failed'); throw error; }
    },
    renderPage: async ({ path }) => {
      const localPath = resolveSameOriginPath(path, 'http://127.0.0.1');
      const page = await fetchPublishedPage({ createSiteApp: () => deps.createSiteApp({ consentAudit: true }), observability: deps.observability }, { path: localPath }, { maxBytes: 1_000_000, timeoutMs: 15_000 });
      return { html: page.body ?? '', ok: page.ok, truncated: page.truncated };
    },
  };
}

/** Admin inspection only: one published-row lookup; stored full documents keep their authored bytes.
 * Unavailable repository/format evidence is explicit; a generated route may have no backing entry. */
async function publishedPageSlot({ deps, path }: { deps: RouteDeps; path: string }): Promise<{ slot: boolean | null; problems: ConsentProblem[] }> {
  const unavailable = () => ({ slot: false, problems: [{ code: 'PUBLISHED_ENTRY_UNAVAILABLE', message: 'The published entry for this page could not be verified. Runtime loading eligibility is unavailable.' }] });
  if (!deps.postRepo) return unavailable();
  const local = resolveSameOriginPath(path, 'http://127.0.0.1');
  const pathname = new URL(local, 'http://127.0.0.1').pathname;
  const slug = pathname === '/' ? '/' : decodeURIComponent(pathname.slice(1).replace(/\/$/, ''));
  let post;
  try { post = await findPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } }); }
  catch { return unavailable(); }
  if (!post) return { slot: null, problems: [] };
  if (!isBarePageChoice(post)) return { slot: null, problems: [] };
  if (post.bodyFormat === 'doc') return { slot: true, problems: [] };
  if (post.bodyFormat !== 'html' || typeof post.bodyHtml !== 'string') return { slot: false, problems: [{ code: 'PUBLISHED_PAGE_FORMAT_UNAVAILABLE', message: 'The published bare page format could not be verified. Runtime loading eligibility is unavailable.' }] };
  return { slot: !isFullHtmlDocument(post.bodyHtml), problems: [] };
}

/** Bind the CMS-only default-content step to the existing settings/content/identity owners.
 * @param required The current site's dependencies, resolved after the composition literal completes.
 * @returns Bootstrap completion; readiness reports failures and allows next-open retry.
 * @complexity O(n) through ensureSitePrivacyDefaults; no per-row I/O. */
export async function ensureSiteConsentPrivacy({ deps: pendingDeps }: { deps: Promise<RouteDeps> }, _options = {}): Promise<void> {
  // Composition may suspend while loading plugin contributions inside its dependency literal.
  const deps = await pendingDeps;
  return ensureSitePrivacyDefaults({
    workspaceId: deps.workspaceId, ids: deps.idGen,
    post: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox, authorAccounts: deps.userRepo },
    pagesHtmlStore: deps.pagesHtmlStore,
    readUrl: async () => {
      const value = await getEffective({ repo: deps.settingsRepo }, { namespace: SITE_CONSENT_NAMESPACE,
        key: 'privacyPolicyUrl', scopeContext: { workspaceId: deps.workspaceId } });
      if (value === null) return '';
      if (typeof value.value !== 'string') throw new Error('Invalid cookie consent setting: privacyPolicyUrl.');
      return value.value;
    },
    setUrl: async ({ url, principalId }) => {
      // The migration ledger ID has no identity grant; this write retains the seeded owner's authorization.
      await set({ deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen,
        principals: deps.principalRepo, authorize: deps.authorize }, input: { namespace: SITE_CONSENT_NAMESPACE,
        key: 'privacyPolicyUrl', value: url, scope: 'workspace', workspaceId: deps.workspaceId, callerPrincipalId: principalId } });
    },
    readIdentity: async () => {
      const principalId = await deps.ownerPrincipalId;
      const owner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId });
      const siteTitle = await resolveSiteTitle({ settingsRepo: deps.settingsRepo, preservationStore: deps.siteTitlePreservationStore,
        workspaceRepo: deps.workspaceRepo, siteDisplayName: deps.siteDisplayName }, { workspaceId: deps.workspaceId });
      return { principalId, siteTitle, email: owner?.email };
    },
  });
}
