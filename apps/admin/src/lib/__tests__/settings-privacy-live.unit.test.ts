import { afterEach, expect, it, vi } from 'vitest';
import type { PrivacyConsentState } from '@jini-ai/ui';

const { saveChangedEntries } = vi.hoisted(() => ({ saveChangedEntries: vi.fn() }));
vi.mock('../ledger-slice', async importOriginal => ({ ...await importOriginal<typeof import('../ledger-slice')>(), saveChangedEntries }));
import { DEFAULT_PRIVACY, savePrivacy } from '../settings-tabs';

afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); window.localStorage.clear(); });
const granted: PrivacyConsentState = { ...DEFAULT_PRIVACY, telemetry: { metrics: true, content: false } };
const denied: PrivacyConsentState = { ...granted, telemetry: { metrics: false, content: false } };

it('a failed durable withdrawal still stops collection immediately and keeps a reload denial', async () => {
  const events: boolean[] = [];
  const listener = (event: Event) => events.push((event as CustomEvent<boolean>).detail);
  window.addEventListener('jini:metrics-consent-changed', listener);
  saveChangedEntries.mockImplementationOnce(async () => {
    expect(events).toEqual([false]);
    expect(window.localStorage.getItem('jini:metrics-withdrawal')).toBe('1');
    throw new Error('save unavailable');
  });
  try {
    await expect(savePrivacy(denied, granted)).rejects.toThrow('save unavailable');
    expect(events).toEqual([false]);
    expect(window.localStorage.getItem('jini:metrics-withdrawal')).toBe('1');
    expect(saveChangedEntries).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('jini:metrics-consent-changed', listener); }
});

it('a grant is signalled only after metrics persist, even when a later preference write fails', async () => {
  const events: boolean[] = [];
  const listener = (event: Event) => events.push((event as CustomEvent<boolean>).detail);
  window.addEventListener('jini:metrics-consent-changed', listener);
  window.localStorage.setItem('jini:metrics-withdrawal', '1');
  saveChangedEntries.mockImplementationOnce(async () => { expect(events).toEqual([]); return ['telemetry.metrics']; })
    .mockImplementationOnce(async () => { expect(events).toEqual([true]); throw new Error('later write failed'); });
  try {
    await expect(savePrivacy(granted, denied)).rejects.toThrow('later write failed');
    expect(events).toEqual([true]); expect(window.localStorage.getItem('jini:metrics-withdrawal')).toBeNull();
    expect(saveChangedEntries).toHaveBeenCalledTimes(2);
  } finally { window.removeEventListener('jini:metrics-consent-changed', listener); }
});
