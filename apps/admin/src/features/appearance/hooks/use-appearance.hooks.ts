import { useEffect, useState } from "react";

import { api, type PresentationSettings } from "../../../lib/api";

/**
 * @file Everything the Appearance/Themes screen does, so `Appearance.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/appearance` needs it.
 */

export interface AppearanceController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  settings: PresentationSettings | null;
  themes: string[];
  error: string | null;
  /** The theme id currently being activated, or `null` when no activation is in flight. */
  busyTheme: string | null;
  activate: (themeId: string) => Promise<void>;
}

/**
 * @complexity Time/space: O(1) per call — one settings round trip on mount, one per `activate`.
 */
export function useAppearance(): AppearanceController {
  const [settings, setSettings] = useState<PresentationSettings | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyTheme, setBusyTheme] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPresentation()
      .then((r) => {
        setSettings(r.settings);
        setThemes(r.availableThemeIds);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load themes"));
  }, []);

  async function activate(themeId: string) {
    setBusyTheme(themeId);
    setError(null);
    try {
      const r = await api.setActiveTheme(themeId);
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to switch theme");
    } finally {
      setBusyTheme(null);
    }
  }

  return { settings, themes, error, busyTheme, activate };
}
