import { ensureSettingDefinitions, getEffective, type EnsureSettingDefinitionsDeps, type SettingsRepoPort, type SettingDefinitionSpec } from '@jini-ai/core/settings';

import { SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE, SITE_CONSENT_PLACEMENTS, SITE_CONSENT_REGION_MODES, type SiteConsentSettings } from './config.js';
export { SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE } from './config.js';

const ENUM_VALUES: Partial<Record<keyof SiteConsentSettings, readonly string[]>> = { regionMode: SITE_CONSENT_REGION_MODES, placement: SITE_CONSENT_PLACEMENTS };

/** What a site serves when consent is not on: the default copy with the banner off. */
export const SITE_CONSENT_OFF: SiteConsentSettings = { ...SITE_CONSENT_DEFAULTS, enabled: false };

/** The ledger's `enabled` default stays OFF: its default layer only means "no owner choice yet",
 * which {@link resolveSiteConsentActivation} turns into on (new site) or off (site created before
 * consent shipped). Keeping it unchanged also means no boot-time rewrite of existing sites' ledgers. */
const LEDGER_DEFAULTS: SiteConsentSettings = SITE_CONSENT_OFF;

/** The shared registrar owns legacy scalar definitions and their ledger revisions.
 * Complete published policies use the site snapshot adapter, avoiding partial field publication.
 * @complexity O(1), thirteen bounded settings definitions. */
export async function ensureSiteConsentDefinitions(required: EnsureSettingDefinitionsDeps, { systemPrincipalId }: { systemPrincipalId: string }): Promise<void> {
  const definitions: SettingDefinitionSpec[] = Object.entries(LEDGER_DEFAULTS).map(([key, defaultValue]) => {
    const values = ENUM_VALUES[key as keyof SiteConsentSettings];
    return { key, schema: values ? { type: 'enum', values: [...values] } : { type: typeof defaultValue === 'boolean' ? 'boolean' : 'string' }, defaultValue };
  });
  await ensureSettingDefinitions(required, { namespace: SITE_CONSENT_NAMESPACE, definitions, systemPrincipalId });
}

/** Consent owns readiness, without extending WebMCP's failure chain.
 * The shared boot chain serializes ledger writes on the site's single connection.
 * Consumers await this promise; the HTTP owner reports failure and serves denied HTML.
 * @complexity O(1), calls the existing settings registrar once after other settings finish. */
export function createSiteConsentReadiness(required: EnsureSettingDefinitionsDeps, { after, systemPrincipalId }: { after: Promise<void>; systemPrincipalId: string }): Promise<void> {
  const ready = after.then(() => ensureSiteConsentDefinitions(required, { systemPrincipalId }));
  // Attach a rejection observer now; a request may arrive long after registration fails.
  void ready.catch(() => undefined);
  return ready;
}

/** Owner rollout rules: sites created before consent shipped are never switched on silently
 * (2026-10-19); a new live site shows the banner by default, with no privacy page or other step
 * needed first (2026-10-22). */
export interface SiteConsentAutoEnablePort {
  /** True only for a site created after consent shipped and served live (not static export). */
  isNewLiveSite(required: Record<string, never>, optional?: Record<string, never>): Promise<boolean>;
}

export type SiteConsentWaitingFor = 'new-live-site';
/** `owner`: an explicit on/off choice; `automatic`: the new-site rule; `default`: no choice yet. */
export type SiteConsentActivation = { enabled: boolean; source: 'owner' | 'automatic' | 'default'; waitingFor: SiteConsentWaitingFor | null };

type Deps = { settingsRepo: SettingsRepoPort; workspaceId: string };

/** @complexity O(1), one ledger read. */
async function readSetting({ settingsRepo, workspaceId }: Deps, key: keyof SiteConsentSettings) {
  return getEffective({ repo: settingsRepo }, { namespace: SITE_CONSENT_NAMESPACE, key, scopeContext: { workspaceId } });
}

/** A site without an explicit owner choice: new sites get the default (on); older sites stay off.
 * The privacy link is not a precondition: the banner shows without it, and publishing an edited
 * policy still requires one (validation.ts). @complexity O(1), one metadata read per site process. */
async function automaticActivation(autoEnable: SiteConsentAutoEnablePort): Promise<SiteConsentActivation> {
  if (!await autoEnable.isNewLiveSite({})) return { enabled: false, source: 'default', waitingFor: 'new-live-site' };
  return { enabled: SITE_CONSENT_DEFAULTS.enabled, source: 'automatic', waitingFor: null };
}

/** Resolve whether consent applies, honoring an explicit owner choice over the new-site rule.
 * @throws Error when the stored flag is not a boolean (never guesses on or off).
 * @complexity O(1), at most two ledger reads and one page lookup. */
export async function resolveSiteConsentActivation(deps: Deps, { autoEnable }: { autoEnable?: SiteConsentAutoEnablePort } = {}): Promise<SiteConsentActivation> {
  const enabled = await readSetting(deps, 'enabled');
  if (enabled !== null && enabled.sourceLayer !== 'default') {
    if (typeof enabled.value !== 'boolean') throw new Error('Invalid cookie consent setting: enabled.');
    return { enabled: enabled.value, source: 'owner', waitingFor: null };
  }
  if (!autoEnable) return { enabled: enabled?.value === true, source: 'default', waitingFor: null };
  return automaticActivation(autoEnable);
}

/** Read every non-flag value with type and length checks. @complexity O(1), twelve ledger reads. */
async function readValues(deps: Deps): Promise<Omit<SiteConsentSettings, 'enabled'>> {
  const entries = await Promise.all(Object.entries(SITE_CONSENT_DEFAULTS).filter(([key]) => key !== 'enabled').map(async ([key, fallback]) => {
    const resolved = await readSetting(deps, key as keyof SiteConsentSettings);
    const value = resolved === null ? fallback : resolved.value;
    if (typeof value !== typeof fallback) throw new Error(`Invalid cookie consent setting: ${key}.`);
    if (typeof value === 'string' && value.length > 2000) throw new Error(`Cookie consent setting ${key} exceeds 2000 characters.`);
    return [key, value] as const;
  }));
  return Object.fromEntries(entries) as Omit<SiteConsentSettings, 'enabled'>;
}

/** Bind workspace settings to the mechanism. Missing definitions read as OFF.
 * Malformed values throw rather than bypass an enabled policy. @complexity O(1), thirteen reads. */
export function createSiteConsentConfig({ settingsRepo, workspaceId }: Deps, { autoEnable }: { autoEnable?: SiteConsentAutoEnablePort } = {}) {
  return {
    async get(_input: Record<string, never> = {}, _optional = {}): Promise<SiteConsentSettings> {
      // Disabling remains a working rollback even if another consent setting is malformed.
      const activation = await resolveSiteConsentActivation({ settingsRepo, workspaceId }, { autoEnable });
      if (!activation.enabled) return { ...SITE_CONSENT_OFF };
      const values = await readValues({ settingsRepo, workspaceId });
      if (!SITE_CONSENT_REGION_MODES.includes(values.regionMode)) throw new Error('Choose automatic, opt-in, or opt-out cookie consent region mode.');
      if (!SITE_CONSENT_PLACEMENTS.includes(values.placement)) throw new Error(`Choose a cookie banner placement: ${SITE_CONSENT_PLACEMENTS.join(', ')}.`);
      if (!values.policyVersion.trim() || values.policyVersion.length > 128) throw new Error('Cookie consent policy version must contain 1–128 characters.');
      return { ...values, enabled: true };
    },
  };
}

/** Authoring reads retain saved copy even while consent is disabled; public rollback still uses get().
 * @example readSiteConsentAuthoringSettings({ settingsRepo, workspaceId })
 * @complexity O(1), one bounded set of existing ledger reads; performs no writes. */
export async function readSiteConsentAuthoringSettings(deps: Deps, { autoEnable }: { autoEnable?: SiteConsentAutoEnablePort } = {}): Promise<SiteConsentSettings> {
  const activation = await resolveSiteConsentActivation(deps, { autoEnable });
  return { ...await readValues(deps), enabled: activation.enabled };
}
