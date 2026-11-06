/**
 * @file This window's sort, pins and hidden sites for the Websites grid. Jini's `useSiteListView`
 * leaves storing them to the host. The desktop is one person's machine, so `localStorage` is enough,
 * the same store as the theme and the per-site zoom.
 *
 * Cost: one read when the grid first mounts, one write under 1 KB per click, no polling.
 *
 * Pins and hidden sites are keyed by `SiteRecord.id`, the site's folder. A rename only rewrites the
 * name inside the folder, so it keeps them. A folder that moved gets a new id, so Locate or a healed
 * move drops that site's pin or hide.
 */
import { useCallback, useState } from 'react';
import { DEFAULT_SITE_LIST_PREFS, parseSiteListPrefs, type SiteListPrefs } from '@jini-ai/ui/site-card';

export const SITE_LIST_STORAGE_KEY = 'tovu-runner.site-list';

export interface SiteListStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Resolved at each call: reading the `window.localStorage` getter can itself throw when storage is
 *  denied, so it must stay inside the `try` of the functions below (see `shellZoomStorage`). */
const windowStorage: SiteListStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

/**
 * Reads the stored choices. Storage that is denied or holds damaged JSON gives the defaults, so it
 * can never blank the grid.
 * @returns Valid preferences. @complexity O(n) stored ids.
 */
export function readSiteListPrefs({ storage }: { storage: SiteListStorage }, _options = {}): SiteListPrefs {
  try {
    const stored = storage.getItem(SITE_LIST_STORAGE_KEY);
    return stored === null ? DEFAULT_SITE_LIST_PREFS : parseSiteListPrefs({ stored: JSON.parse(stored) });
  } catch {
    return DEFAULT_SITE_LIST_PREFS;
  }
}

/** Saves the choices. A denied store keeps them for this session only: they are still on screen, and
 *  nothing the person can do here would fix storage. @complexity O(n) stored ids. */
export function writeSiteListPrefs({ storage, prefs }: { storage: SiteListStorage; prefs: SiteListPrefs }, _options = {}): void {
  try {
    storage.setItem(SITE_LIST_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // See this function's doc: session-only is the honest fallback.
  }
}

export interface SiteListPrefsState {
  prefs: SiteListPrefs;
  onPrefsChange: (next: SiteListPrefs) => void;
}

/** @returns The stored choices and the way to change them. @complexity O(1) per change. */
export function useSiteListPrefs(storage: SiteListStorage = windowStorage): SiteListPrefsState {
  const [prefs, setPrefs] = useState(() => readSiteListPrefs({ storage }));
  const onPrefsChange = useCallback((next: SiteListPrefs) => {
    setPrefs(next);
    writeSiteListPrefs({ storage, prefs: next });
  }, [storage]);
  return { prefs, onPrefsChange };
}
