/**
 * @file The Sites list's remembered choices (sort, pins, hidden sites), stored per person in the
 * server's `core.interface` settings namespace, the same per-user ledger as Settings → User
 * Interface, so they follow the person rather than the browser.
 *
 * Cost: one read of that namespace (about a dozen small keys) each time the Sites page opens, and one
 * single-row write of under 1 KB per click on Sort by, a pin or Hide. No polling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SITE_LIST_PREFS, parseSiteListPrefs, type SiteListPrefs } from "@jini-ai/ui/site-card";
import { describeApiError } from "@/lib/api";
import { loadNamespaceValues, saveChangedEntries } from "@/lib/ledger-slice";
import { INTERFACE_NAMESPACE } from "@/lib/settings-tabs";

/** Registered by the server in `apps/website/src/features/settings/admin-interface.ts`. */
export const SITE_LIST_KEY = "sitesList";

export interface SiteListPrefsPort {
  load(): Promise<unknown>;
  save(next: SiteListPrefs): Promise<void>;
}

export interface SiteListPrefsController {
  prefs: SiteListPrefs;
  /** False until the stored choices arrive, so the cards do not reorder under the person. */
  ready: boolean;
  onPrefsChange(next: SiteListPrefs): void;
  /** The server's reason the choices could not be read, or `null`. */
  loadError: string | null;
  /** The server's reason the last change could not be saved, or `null`. */
  saveError: string | null;
}

export const defaultSiteListPrefsPort: SiteListPrefsPort = {
  load: async () => (await loadNamespaceValues(INTERFACE_NAMESPACE)).get(SITE_LIST_KEY),
  save: async (next) => { await saveChangedEntries(INTERFACE_NAMESPACE, "user", [{ key: SITE_LIST_KEY, valueJson: next, changed: true }]); },
};

/**
 * Applies a change at once and saves it behind the previous save, so two quick clicks cannot land out
 * of order. After a failed read nothing is saved: the defaults on screen would overwrite the person's
 * real pins.
 * @returns The current choices and their save state. @complexity O(1) per change.
 */
export function useSiteListPrefs({ port }: { port: SiteListPrefsPort }, _options = {}): SiteListPrefsController {
  const [prefs, setPrefs] = useState<SiteListPrefs>(DEFAULT_SITE_LIST_PREFS);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSave = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let current = true;
    port.load().then(
      (stored) => { if (current) { setPrefs(parseSiteListPrefs({ stored })); setReady(true); } },
      (error: unknown) => { if (current) { setLoadError(describeApiError(error, String(error))); setReady(true); } },
    );
    return () => { current = false; };
  }, [port]);

  const onPrefsChange = useCallback((next: SiteListPrefs) => {
    setPrefs(next);
    if (loadError !== null) return;
    lastSave.current = lastSave.current.then(() => port.save(next)).then(
      () => setSaveError(null),
      (error: unknown) => setSaveError(describeApiError(error, String(error))),
    );
  }, [port, loadError]);

  return { prefs, ready, onPrefsChange, loadError, saveError };
}

/** The real ledger, for the Sites screen. */
export function useWiredSiteListPrefs(): SiteListPrefsController {
  return useSiteListPrefs({ port: defaultSiteListPrefsPort });
}
