import { ensureSettingDefinitions, getEffective, type EnsureSettingDefinitionsDeps, type SettingsRepoPort, type SettingDefinitionSpec } from '@jini-ai/core/settings';

import { SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE } from './config.js';
export { SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE } from './config.js';

/** Existing shared registrar owns transactions/revisions; no new table or migration.
 * @complexity O(1), nine bounded settings definitions. */
export async function ensureSiteConsentDefinitions(required: EnsureSettingDefinitionsDeps, { systemPrincipalId }: { systemPrincipalId: string }): Promise<void> {
  const definitions: SettingDefinitionSpec[] = Object.entries(SITE_CONSENT_DEFAULTS).map(([key, defaultValue]) => ({ key, schema: key === 'regionMode' ? { type: 'enum', values: ['auto', 'opt-in', 'opt-out'] } : { type: typeof defaultValue === 'boolean' ? 'boolean' : 'string' }, defaultValue }));
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

/** Bind workspace settings to the mechanism. Missing definitions use the OFF default.
 * Malformed values throw rather than bypass an enabled policy. @complexity O(1), nine reads. */
export function createSiteConsentConfig({ settingsRepo, workspaceId }: { settingsRepo: SettingsRepoPort; workspaceId: string }, _options = {}) {
  return {
    async get(_input: Record<string, never> = {}, _optional = {}) {
      const enabled = await getEffective({ repo: settingsRepo }, { namespace: SITE_CONSENT_NAMESPACE, key: 'enabled', scopeContext: { workspaceId } });
      // Disabling remains a working rollback even if another consent setting is malformed.
      if (enabled === null || enabled.value === false) return { ...SITE_CONSENT_DEFAULTS };
      if (enabled.value !== true) throw new Error('Invalid cookie consent setting: enabled.');
      const entries = await Promise.all(Object.entries(SITE_CONSENT_DEFAULTS).filter(([key]) => key !== 'enabled').map(async ([key, fallback]) => {
        const resolved = await getEffective({ repo: settingsRepo }, { namespace: SITE_CONSENT_NAMESPACE, key, scopeContext: { workspaceId } });
        const value = resolved === null ? fallback : resolved.value;
        if (typeof value !== typeof fallback) throw new Error(`Invalid cookie consent setting: ${key}.`);
        if (typeof value === 'string' && value.length > 2000) throw new Error(`Cookie consent setting ${key} exceeds 2000 characters.`);
        return [key, value] as const;
      }));
      const values = Object.fromEntries(entries);
      const regionMode = values.regionMode;
      if (regionMode !== 'auto' && regionMode !== 'opt-in' && regionMode !== 'opt-out') throw new Error('Choose automatic, opt-in, or opt-out cookie consent region mode.');
      const policyVersion = values.policyVersion as string;
      if (!policyVersion.trim() || policyVersion.length > 128) throw new Error('Cookie consent policy version must contain 1–128 characters.');
      return { enabled: true, regionMode, policyVersion, privacyPolicyUrl: values.privacyPolicyUrl as string, title: values.title as string, message: values.message as string, acceptLabel: values.acceptLabel as string, rejectLabel: values.rejectLabel as string, preferencesLabel: values.preferencesLabel as string };
    },
  };
}
