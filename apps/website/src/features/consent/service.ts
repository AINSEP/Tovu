/** @file Shared site consent use cases for HTTP and assistant adapters. */
import type { ConsentConfig } from '@jini-ai/cms/consent';
import type { ConsentReceiptStorageHealth } from '@jini-ai/cms/consent/node';
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { ToolInputError } from '@jini-ai/core';
import type { AuthorizeFn } from '#src/contracts/core/commands/index';
import type { SiteConsentState, SiteConsentStore } from './revisions.js';
import { SiteConsentConflict } from './revisions.js';
import { consentConfigProblems, parseConsentConfig, type ConsentProblem } from './validation.js';
import { CONSENT_CATEGORIES, CONSENT_MAX_AGE_MS, CONSENT_MAX_CSS_LENGTH, CONSENT_CSS_SELECTORS } from '@jini-ai/cms/consent';
import { SITE_CONSENT_DEFAULT_CSS, SITE_CONSENT_DEFAULTS, SITE_CONSENT_PLACEMENTS, SITE_CONSENT_TEXT_LIMITS, withSiteConsentDefaultCss } from './config.js';
import { consentPagePath } from './request.js';
import { consentDryRun, type ConsentDryRunGate } from './readiness.js';

export interface ConsentServicePorts {
  workspaceId: string;
  authorize: AuthorizeFn;
  store?: SiteConsentStore;
  ready: Promise<void>;
  clock: { nowIso(): string };
  ids: { newId(): string };
  trustedRegion: boolean;
  readLegacy(required: Record<string, never>, optional?: Record<string, never>): Promise<ConsentConfig>;
  privacyPageExists(required: { url: string }, optional?: Record<string, never>): Promise<boolean>;
  renderPage(required: { path: string }, optional?: Record<string, never>): Promise<{ html: string; ok: boolean; truncated: boolean }>;
  /** Inspect the live receipt backend without saving a visitor choice; errors block readiness. */
  receiptStorage(required: Record<string, never>, optional?: Record<string, never>): Promise<ConsentReceiptStorageHealth>;
  /** The engine consent gate used by dry runs; omitted means the real `gateConsentHtml`. */
  consentGate?: ConsentDryRunGate;
}

/** Unsaved input takes precedence over the draft, then the effective published/legacy policy.
 * An emptied Custom CSS previews the default style, exactly as the public site delivers it. */
function sampleConsentConfig({ state, proposed }: { state: SiteConsentState & { effective: ConsentConfig }; proposed: unknown }, _options = {}): ConsentConfig {
  return withSiteConsentDefaultCss({ config: parseConsentConfig({ value: proposed === undefined ? state.draft?.config ?? state.effective : proposed }) });
}

/** Readiness and preview require the same complete bounded page evidence. */
function isCompleteConsentPage({ page }: { page: { ok: boolean; truncated: boolean } }, _options = {}): boolean {
  return page.ok && !page.truncated;
}

/** Creates one workspace's adapters over the engine and durable policy store.
 * Authorization remains in each operation so direct/tool callers cannot bypass the HTTP guard.
 * @example createSiteConsentService({ ports })
 * @complexity Fixed repository operations; readiness scans receipt filenames and renders one bounded page, never executes JS. */
export function createSiteConsentService({ ports }: { ports: ConsentServicePorts }, _options = {}) {
  /** Deny before touching readiness, configuration or rendered content. */
  const authorize = async ({ principalId, write = false }: { principalId: string; write?: boolean }, _optional = {}) => {
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: ports.authorize }), principalId, workspaceId: ports.workspaceId, permission: write ? 'settings.workspace.write' : 'settings.read' }, { entityType: 'site-consent' });
    await ports.ready;
    if (!ports.store) throw new Error('The durable site consent policy store is unavailable.');
    return ports.store;
  };
  /** Resolve draft and published separately; malformed published data never falls back to OFF. */
  const read = async ({ principalId }: { principalId: string }, _optional = {}) => {
    const store = await authorize({ principalId });
    const state = await store.read({});
    const legacy = state.published ? null : await ports.readLegacy({});
    // An empty Custom CSS is what the public site fills with the default style, so the editor shows
    // that default in the field for the owner to edit (owner, 2026-10-22).
    const draft = state.draft && { ...state.draft, config: withSiteConsentDefaultCss({ config: state.draft.config }) };
    return { ...state, draft, effective: withSiteConsentDefaultCss({ config: parseConsentConfig({ value: state.published?.config ?? legacy }) }), categoriesEditable: false,
      editor: { defaults: { ...SITE_CONSENT_DEFAULTS, customCss: SITE_CONSENT_DEFAULT_CSS }, placements: [...SITE_CONSENT_PLACEMENTS], textLimits: { ...SITE_CONSENT_TEXT_LIMITS },
        maxCssLength: CONSENT_MAX_CSS_LENGTH, cssSelectors: [...CONSENT_CSS_SELECTORS],
        regionModes: ['opt-in', 'auto'],
        categories: CONSENT_CATEGORIES.map(id => ({ id, required: id === 'necessary', editable: false })),
        rules: { gpc: 'always-enforced', preferenceMaxAgeMs: CONSENT_MAX_AGE_MS, staticReceipts: false } } };
  };
  /** Engine validation plus this site's privacy-page linkage; no HTTP fetch to external policies. */
  const problems = async ({ config }: { config: ConsentConfig }, _optional = {}): Promise<ConsentProblem[]> => {
    const found = consentConfigProblems({ config, trustedRegion: ports.trustedRegion });
    if (config.enabled && config.privacyPolicyUrl && !found.some(problem => problem.field === 'privacyPolicyUrl') && !await ports.privacyPageExists({ url: config.privacyPolicyUrl })) found.push({ code: 'PRIVACY_PAGE_MISSING', field: 'privacyPolicyUrl', message: 'Publish the linked privacy page before enabling consent.' });
    return found;
  };
  /** Readiness needs writable proof storage as well as a safe local page sample.
   * Storage errors expose no private paths; render failure/truncation also blocks readiness. */
  const readiness = async ({ principalId, path = '/', config: proposed }: { principalId: string; path?: string; config?: unknown }, _optional = {}) => {
    const state = await read({ principalId });
    const config = sampleConsentConfig({ state, proposed });
    path = consentPagePath({ path });
    const blockingProblems = await problems({ config: { ...config, enabled: true } });
    let receipts: ConsentReceiptStorageHealth;
    try { receipts = await ports.receiptStorage({}); }
    catch { receipts = { writable: false, count: null }; }
    if (!receipts.writable || receipts.count === null) blockingProblems.push({ code: 'RECEIPT_STORAGE_UNAVAILABLE', message: 'Consent receipt storage is unavailable or not writable. Visitor choices cannot be saved reliably.' });
    // `config` came through parseConsentConfig, which refuses a config without a string placement,
    // so no default placement is needed here.
    const metadata = { receipts, enabled: state.effective.enabled, placement: config.placement, regionMode: config.regionMode, delivery: 'live', staticSupported: false, sampledPaths: [path], sampleOnly: true, blockingProblems };
    try {
      const page = await ports.renderPage({ path });
      if (!isCompleteConsentPage({ page })) blockingProblems.push({ code: 'PAGE_UNAVAILABLE', message: 'The rendered page is unavailable or exceeds the 1 MB audit limit.' });
      const dryRun = consentDryRun({ html: page.html, config }, { gate: ports.consentGate });
      blockingProblems.push(...dryRun.problems);
      return { ...metadata, ready: blockingProblems.length === 0, categories: dryRun.categories, detected: dryRun.items, truncated: dryRun.truncated || page.truncated,
        limitations: ['One server-rendered page sample; dynamic requests, server cookies and legal compliance require separate review.'] };
    } catch {
      blockingProblems.push({ code: 'RENDER_FAILED', message: 'The page could not be rendered safely. Readiness cannot be established.' });
      return { ...metadata, ready: false, categories: CONSENT_CATEGORIES.map(id => ({ id, required: id === 'necessary', editable: false })), detected: [], truncated: false, limitations: ['Rendered evidence unavailable.'] };
    }
  };
  /** Render the real gated page into an inert iframe document for the separate admin UI.
   * Returned HTML must only be used in a sandbox without scripts, forms or same-origin access. */
  const preview = async ({ principalId, path = '/', config: proposed }: { principalId: string; path?: string; config?: unknown }, _optional = {}) => {
    const state = await read({ principalId });
    const config = sampleConsentConfig({ state, proposed });
    path = consentPagePath({ path });
    const page = await ports.renderPage({ path });
    if (!isCompleteConsentPage({ page })) throw new ToolInputError({ message: 'Preview requires one complete rendered page of at most 1 MB.' });
    const result = consentDryRun({ html: page.html, config }, { gate: ports.consentGate });
    if (result.gatedHtml === null) throw new ToolInputError({ message: 'The consent engine could not safely render the preview.' });
    return { html: result.gatedHtml, blockingProblems: [...await problems({ config }), ...result.problems], sandbox: '', revisionId: state.draft?.id ?? state.published?.id ?? null };
  };
  /** Append an immutable draft; invalid CSS is saved for editing but cannot be published. */
  const saveDraft = async ({ principalId, config: value, expectedDraftId }: { principalId: string; config: unknown; expectedDraftId: string | null }, _optional = {}) => {
    const store = await authorize({ principalId, write: true });
    const config = parseConsentConfig({ value });
    const blockingProblems = await problems({ config });
    const revision = { id: ports.ids.newId(), config, actorId: principalId, createdAt: ports.clock.nowIso() };
    await store.saveDraft({ revision, expectedDraftId });
    return { revision, blockingProblems };
  };
  /** The stored draft, never caller replacement fields, is what becomes public atomically. */
  const publish = async ({ principalId, draftId, expectedPublishedId }: { principalId: string; draftId: string; expectedPublishedId: string | null }, _optional = {}) => {
    const store = await authorize({ principalId, write: true });
    const state = await store.read({});
    if (state.draft?.id !== draftId) throw new SiteConsentConflict();
    const config = parseConsentConfig({ value: state.draft.config });
    const blockingProblems = await problems({ config });
    if (blockingProblems.length) throw new ToolInputError({ message: blockingProblems.map(problem => problem.message).join(' ') });
    await store.publish({ draftId, expectedPublishedId });
    return { published: true, revisionId: draftId };
  };
  /** Static publication has no receipt backend. A choice offers existing settings APIs, never a bypass.
   * Unknown configuration is blocking; OFF must be explicitly readable before exporting. */
  const deploymentCheck = async ({ principalId, permission }: { principalId: string; permission: 'system.publish' | 'deployments.publish' }, _optional = {}) => {
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: ports.authorize }), principalId, workspaceId: ports.workspaceId, permission }, { entityType: 'site-publish' });
    try {
      await ports.ready;
      if (!ports.store) throw new Error('Consent store unavailable');
      const state = await ports.store.read({});
      const config = parseConsentConfig({ value: state.published?.config ?? await ports.readLegacy({}) });
      if (!config.enabled) return null;
      const blockingProblems = await problems({ config });
      blockingProblems.push({ code: 'STATIC_RECEIPTS_UNAVAILABLE', message: 'Static delivery cannot save consent receipts. Keep the banner on a live server, or explicitly publish with the banner disabled.' });
      return deploymentRefusal({ problems: blockingProblems });
    } catch {
      return deploymentRefusal({ problems: [{ code: 'CONSENT_UNAVAILABLE', message: 'The published consent policy could not be verified. Deployment was not started.' }] });
    }
  };
  return { read, readiness, preview, saveDraft, publish, deploymentCheck };
}
export type SiteConsentService = ReturnType<typeof createSiteConsentService>;

/** The existing HTTP 409 / choice envelope; clients perform a reviewed settings publication, then retry.
 * Keeping the choice declarative prevents an untrusted flag from disabling consent in a crawler. */
export function deploymentRefusal({ problems }: { problems: ConsentProblem[] }, _options = {}) {
  return { code: 'CONSENT_REVIEW_REQUIRED', error: 'Review cookie consent before publishing this site.', blockingProblems: problems,
    choices: [
      { id: 'fix-now', label: 'Fix now', href: '/consent?tab=overview', action: 'Review readiness and use live hosting while consent is enabled.' },
      { id: 'publish-without-banner', label: 'Publish without banner', href: '/consent?tab=rules&intent=publish-without-banner', action: 'Explicitly save enabled:false through PUT consent/settings, POST consent/publish with current revision ids, then retry deployment.', warning: 'This disables the banner and optional-content enforcement on the live site too. Optional scripts may run without a visitor choice.' },
    ] };
}
