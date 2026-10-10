import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSiteConsentSettingsPort, useSiteConsentSettings, type SiteConsentSettingsPort } from '../settings.hooks';
import { SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE } from '../../../../../website/src/features/consent/config.js';

describe('site consent ledger adapter', () => {
  it('reads shared defaults and calls the existing diff-write owner with workspace-scoped candidates', async () => {
    const writes: unknown[] = [];
    const port = createSiteConsentSettingsPort({ loadValues: async namespace => { expect(namespace).toBe(SITE_CONSENT_NAMESPACE); return new Map<string, unknown>([['message', 'Site copy'], ['enabled', true]]); }, saveEntries: async (namespace, scope, candidates) => { writes.push({ namespace, scope, candidates }); return candidates.filter(candidate => candidate.changed).map(candidate => candidate.key); } });
    expect(await port.load({})).toEqual({ ...SITE_CONSENT_DEFAULTS, message: 'Site copy', enabled: true });
    const next = { ...SITE_CONSENT_DEFAULTS, privacyPolicyUrl: '/privacy', enabled: true };
    expect(await port.save({ next, previous: SITE_CONSENT_DEFAULTS })).toEqual(['enabled', 'privacyPolicyUrl']);
    expect(writes).toEqual([{ namespace: SITE_CONSENT_NAMESPACE, scope: 'workspace', candidates: Object.keys(next).map(key => ({ key, valueJson: next[key as keyof typeof next], changed: next[key as keyof typeof next] !== SITE_CONSENT_DEFAULTS[key as keyof typeof next] })) }]);
  });
  it('reports transport errors instead of overwriting saved choices with defaults', async () => {
    const port: SiteConsentSettingsPort = { load: async () => { throw new Error('Consent settings could not be loaded: HTTP 403.'); }, save: async () => { throw new Error('A failed load must not save.'); } };
    const { result } = renderHook(() => useSiteConsentSettings({ port }));
    await waitFor(() => expect(result.current.error).toBe('Consent settings could not be loaded: HTTP 403.'));
    expect(result.current.loading).toBe(true); expect(result.current.value.enabled).toBe(false);
  });
  it('flushes the shared slice on unmount with the edited text and previous persisted choices', async () => {
    const saves: unknown[] = [];
    const loaded = { ...SITE_CONSENT_DEFAULTS, enabled: true, policyVersion: '5' };
    const port: SiteConsentSettingsPort = { load: async () => loaded, save: async input => { saves.push(input); return ['message']; } };
    const { result, unmount } = renderHook(() => useSiteConsentSettings({ port }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.onChange({ patch: { message: 'Updated copy' } }));
    unmount();
    await waitFor(() => expect(saves).toEqual([{ next: { ...loaded, message: 'Updated copy' }, previous: loaded }]));
  });
});


it('rejects invalid policy versions before any ledger write, including programmatic autosaves', () => {
  const writes: unknown[] = [];
  const port = createSiteConsentSettingsPort({ saveEntries: async (...args) => { writes.push(args); return []; } });
  for (const policyVersion of ['', '   ', 'x'.repeat(129)]) expect(() => port.save({ next: { ...SITE_CONSENT_DEFAULTS, policyVersion }, previous: SITE_CONSENT_DEFAULTS })).toThrow('Cookie consent policy version must contain 1–128 characters.');
  expect(writes).toEqual([]);
});
