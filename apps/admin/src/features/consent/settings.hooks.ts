import { useCallback } from 'react';
import { useSettingsSlice } from '@/hooks/use-settings-slice.hooks';
import { loadNamespaceValues, saveChangedEntries } from '@/lib/ledger-slice';
import { SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE, type SiteConsentSettings } from '../../../../website/src/features/consent/config.js';

/** The adapter calls the existing settings lifecycle; it has no competing save/debounce state. */
export interface SiteConsentSettingsPort {
  load(required: Record<string, never>, optional?: Record<string, never>): Promise<SiteConsentSettings>;
  save(required: { next: SiteConsentSettings; previous: SiteConsentSettings }, optional?: Record<string, never>): Promise<readonly string[]>;
}

/** Preserve the shared load/diff-write owner while mapping the site's public settings keys.
 * @complexity O(1), nine bounded fields; writes stay sequential in the ledger owner. */
export function createSiteConsentSettingsPort({ loadValues = loadNamespaceValues, saveEntries = saveChangedEntries }: { loadValues?: typeof loadNamespaceValues; saveEntries?: typeof saveChangedEntries } = {}, _options = {}): SiteConsentSettingsPort {
  return {
    async load(_input = {}, _optional = {}) {
      const values = await loadValues(SITE_CONSENT_NAMESPACE);
      const result = { ...SITE_CONSENT_DEFAULTS };
      for (const key of Object.keys(result) as (keyof SiteConsentSettings)[]) {
        const value = values.get(key) ?? result[key];
        if (typeof value !== typeof result[key]) throw new Error(`Invalid cookie consent setting: ${key}.`);
        Object.assign(result, { [key]: value });
      }
      if (!['auto', 'opt-in', 'opt-out'].includes(result.regionMode)) throw new Error('Invalid cookie consent region mode.');
      return result;
    },
    save({ next, previous }) {
      if (!next.policyVersion.trim() || next.policyVersion.length > 128) throw new Error('Cookie consent policy version must contain 1–128 characters.');
      const candidates = (Object.keys(next) as (keyof SiteConsentSettings)[]).map(key => ({ key, valueJson: next[key], changed: next[key] !== previous[key] }));
      return saveEntries(SITE_CONSENT_NAMESPACE, 'workspace', candidates);
    },
  };
}

const defaultPort = createSiteConsentSettingsPort({});

/** Host hook binds package-owned debounce, refresh and error handling to the consent panel.
 * @complexity O(1); all field changes remain in the existing ledger slice. */
export function useSiteConsentSettings({ port = defaultPort }: { port?: SiteConsentSettingsPort } = {}, _options = {}) {
  const slice = useSettingsSlice<SiteConsentSettings>({ load: () => port.load({}), save: (next, previous) => port.save({ next, previous }), defaultValue: SITE_CONSENT_DEFAULTS, namespaces: [SITE_CONSENT_NAMESPACE] });
  const value = slice.value ?? SITE_CONSENT_DEFAULTS;
  const onChange = useCallback(({ patch }: { patch: Partial<SiteConsentSettings> }, _optional = {}) => slice.onChange({ ...value, ...patch }), [value, slice.onChange]);
  return { value, onChange, loading: slice.value === null || slice.loadError !== null, error: slice.loadError ?? (slice.saveState.status === 'error' ? slice.saveState.message : null), status: slice.saveState.status === 'saving' ? 'Saving cookie consent settings…' : slice.saveState.status === 'saved' ? 'Cookie consent settings saved.' : 'Changes save automatically.' };
}
