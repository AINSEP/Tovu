import { useEffect, useState } from "react";

import { api, type PresentationSettings, type ThemeTier } from "../../../lib/api";

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
  /**
   * Themes screen tab grouping (2026-08-10) — theme id -> ADR-020 capability tier, sourced from
   * `getPresentation()`'s `availableThemes`. Optional (defaults to `{}` at the call site) so a
   * pre-existing test double that only supplies `themes` still type-checks; a theme id absent from
   * this map is treated the same way `theme.ts`'s own `loadTheme` treats an absent `tier` in
   * `theme.json` — falls back to `"declarative"`.
   */
  themeTiers?: Record<string, ThemeTier>;
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
  const [themeTiers, setThemeTiers] = useState<Record<string, ThemeTier>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyTheme, setBusyTheme] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPresentation()
      .then((r) => {
        setSettings(r.settings);
        setThemes(r.availableThemeIds);
        setThemeTiers(Object.fromEntries(r.availableThemes.map((t) => [t.id, t.tier])));
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

  return { settings, themes, themeTiers, error, busyTheme, activate };
}
