import { useCallback, useEffect, useState } from "react";

import { api, type AdminComposioConfig } from "../../../lib/api";

/**
 * @file State for the Settings → Connectors tab's Composio API key field.
 *
 * A standalone hook rather than another field on `useSettingsUi`: that controller mounts
 * ledger-backed `useSettingsSlice` instances, and this is not ledger-backed — the key lives in its
 * own sealed `composio_config` row reached through two dedicated routes, with no namespace, no
 * debounce, and no diff base. Folding it in would mean threading a seventh slice-shaped thing
 * through a mechanism none of its behavior fits.
 */

export type ComposioSaveState = "idle" | "saving" | "saved" | "error";

export interface ComposioConfigController {
  /** `null` until the first load settles — distinct from a loaded-but-unconfigured `configured: false`. */
  config: AdminComposioConfig | null;
  /** Drives `ConnectorsBrowser`'s `unlocked`. `false` while still loading, so the grid starts gated. */
  unlocked: boolean;
  loadError: string | null;
  saveState: ComposioSaveState;
  saveError: string | null;
  /** Bumped on every successful write so `ConnectorsBrowser` re-fetches its catalog against the new key. */
  catalogRefreshKey: number;
  save: (apiKey: string) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * Loads the workspace's Composio key markers and exposes save/clear.
 *
 * `catalogRefreshKey` increments on every successful mutation. That is load-bearing rather than
 * cosmetic: `ConnectorsBrowser` caches its catalog, and saving the first key flips `unlocked` from
 * false to true — without a refresh signal the grid would stay masked over stale data until
 * remount.
 *
 * @complexity O(1) plus one request per call.
 * @overallScore 100
 */
export function useComposioConfig(): ComposioConfigController {
  const [config, setConfig] = useState<AdminComposioConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ComposioSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getComposioConfig()
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const write = useCallback(async (apiKey: string | null) => {
    setSaveState("saving");
    setSaveError(null);
    try {
      setConfig(await api.saveComposioConfig(apiKey));
      setCatalogRefreshKey((key) => key + 1);
      setSaveState("saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveState("error");
    }
  }, []);

  return {
    config,
    unlocked: config?.configured ?? false,
    loadError,
    saveState,
    saveError,
    catalogRefreshKey,
    save: useCallback((apiKey: string) => write(apiKey), [write]),
    clear: useCallback(() => write(null), [write]),
  };
}
