/**
 * Settings › Loaded sites: the saved limit on live site guests, read once from main and then
 * followed (the native Settings menu changes it too), saved through the shell's write channel.
 * `use-live-views.hooks.ts` follows the same change event, so a save applies to the tabs at once.
 */
import { useEffect, useState } from 'react';
import { LIVE_SITE_VIEWS, clampLiveSiteViews } from '../contracts/site-view-preference.js';
import { runnerInventoryBridge } from './runner-api.js';
import type { BridgeLookup } from './bridge-lookup.js';

type LoadedSitesBridge = BridgeLookup<'getMaximumLiveSiteViews' | 'setMaximumLiveSiteViews' | 'onMaximumLiveSiteViewsChanged'>;

export interface LoadedSitesSetting {
  /** False with an older preload that has no save channel: the menu leaves the row out. */
  available: boolean;
  value: number;
  /** Set after a failed save, cleared by the next one. */
  error: string | null;
  save: (next: number) => void;
}

export const LOADED_SITES_SAVE_ERROR = 'Loaded sites could not be saved.';

/** Main's answer as a 1–5 whole number; anything else keeps what is shown. O(1). */
function shownValue({ value, current }: { value: unknown; current: number }, _options = {}): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? clampLiveSiteViews({ value }) : current;
}

/** A typed field's number: its last digit, clamped (the range is single digits, so typing after the
 * digit already there means the new one). `null` while the field holds no digit. O(text). */
export function loadedSitesFromText({ text }: { text: string }, _options = {}): number | null {
  const digit = text.replace(/\D/g, '').slice(-1);
  return digit === '' ? null : clampLiveSiteViews({ value: Number(digit) });
}

/**
 * The shown value moves at once on a save; a failed save puts the last value back and says so.
 * @complexity O(1) per save, one IPC request.
 */
export function useLoadedSites(
  _input: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: { getBridge?: LoadedSitesBridge } = {},
): LoadedSitesSetting {
  const [value, setValue] = useState<number>(LIVE_SITE_VIEWS.fallback);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const bridge = getBridge();
    let active = true;
    void bridge?.getMaximumLiveSiteViews?.().then(
      (saved) => { if (active) setValue((current) => shownValue({ value: saved, current })); },
      () => undefined,
    );
    const off = bridge?.onMaximumLiveSiteViewsChanged?.((saved) => setValue((current) => shownValue({ value: saved, current })));
    return () => { active = false; off?.(); };
  }, [getBridge]);
  const write = getBridge()?.setMaximumLiveSiteViews;
  const save = (next: number) => {
    if (!write || next === value) return;
    const previous = value;
    setValue(next);
    setError(null);
    void write(next).then(
      (saved) => setValue((current) => shownValue({ value: saved, current })),
      (failure: unknown) => {
        console.error(`[tovu-desktop] save loaded sites: ${failure instanceof Error ? failure.message : String(failure)}`);
        setValue(previous);
        setError(LOADED_SITES_SAVE_ERROR);
      },
    );
  };
  return { available: write !== undefined, value, error, save };
}
