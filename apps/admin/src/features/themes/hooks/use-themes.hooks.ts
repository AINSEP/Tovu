import { useEffect, useState } from "react";

import { type PresentationSettings, type ThemeTier } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translateThemes } from "../themes-i18n";
import { defaultThemesPort } from "./themes-dependencies.hooks";
import type { ThemesPort } from "./themes-port.hooks";

/**
 * @file Everything the Themes screen does, so `Themes.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/themes` needs it.
 *
 * `deps.port` is injected (see `themes-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import, same shape `use-pages.hooks.ts`
 * established): injected so `Themes.tsx` sources its UI copy from this hook instead of building
 * its own `(key) => translateThemes(locale, key)` closure. This hook's OWN error strings stay
 * hardcoded English (unchanged) — `useAdminLocale()`/`themes-i18n.ts`'s `t` (aliased
 * `translateThemes`, its own established name in this feature) are read only inside
 * {@link useWiredThemes}.
 */

export interface ThemesDependencies {
  port: ThemesPort;
  t: (key: string) => string;
}

export interface ThemesController {
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
  /**
   * True while a rescan round trip is in flight.
   *
   * This and the two fields below are optional for the same reason `themeTiers` is: a test double
   * written against the earlier controller shape supplies neither, and should keep type-checking
   * rather than being rewritten to satisfy a field its test does not exercise.
   */
  rescanning?: boolean;
  /**
   * Outcome of the last rescan, or `null` if none has run this session.
   *
   * Held as a message rather than a boolean because "nothing changed" and "didn't run" look identical
   * to someone who just pressed the button, and that ambiguity is the entire reason the control
   * exists — a rescan that finds nothing has to say so out loud.
   */
  rescanNotice?: string | null;
  rescan?: () => Promise<void>;
  /** Clears `rescanNotice`. The toast auto-dismisses on a timer and calls this when it does. */
  dismissRescanNotice?: () => void;
  /** What the marketplace offers. Empty until the Marketplace tab is first opened. */
  marketplace?: MarketplaceItem[];
  marketplaceLoading?: boolean;
  /** Loads the marketplace listing. Called lazily so the Themes screen costs nothing extra. */
  loadMarketplace?: () => Promise<void>;
  /** Marketplace id currently downloading, or `null`. */
  downloading?: string | null;
  download?: (themeId: string) => Promise<void>;
  /** Bound translator — `Themes.tsx`'s only source of UI copy; see this file's own header. */
  t: (key: string) => string;
}

export interface MarketplaceItem {
  id: string;
  name: string;
  tier: string;
  description?: string;
  /** True when this id is already used locally, so downloading assigns a `-N` suffix instead. */
  idTaken: boolean;
}

/**
 * @complexity Time/space: O(1) per call — one settings round trip on mount, one per `activate`.
 */
export function useThemes({ port, t }: ThemesDependencies): ThemesController {
  const [settings, setSettings] = useState<PresentationSettings | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [themeTiers, setThemeTiers] = useState<Record<string, ThemeTier>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyTheme, setBusyTheme] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanNotice, setRescanNotice] = useState<string | null>(null);
  const [marketplace, setMarketplace] = useState<MarketplaceItem[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    port
      .getPresentation()
      .then((r) => {
        setSettings(r.settings);
        setThemes(r.availableThemeIds);
        setThemeTiers(Object.fromEntries(r.availableThemes.map((t) => [t.id, t.tier])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load themes"));
  }, []);

  /**
   * Ask the server to re-read the themes directory, then reload this screen's data from it.
   *
   * Two round trips on purpose: the rescan route reports what changed (which is what the notice is
   * built from) but the screen also needs tiers and settings, which only `getPresentation` returns.
   * Re-fetching rather than patching state from the rescan response keeps one source of truth for
   * what this screen shows.
   */
  async function rescan() {
    setRescanning(true);
    setError(null);
    setRescanNotice(null);
    try {
      const r = await port.rescanThemes();
      const fresh = await port.getPresentation();
      setSettings(fresh.settings);
      setThemes(fresh.availableThemeIds);
      setThemeTiers(Object.fromEntries(fresh.availableThemes.map((t) => [t.id, t.tier])));
      setRescanNotice(describeRescan(r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rescan themes");
    } finally {
      setRescanning(false);
    }
  }

  async function activate(themeId: string) {
    setBusyTheme(themeId);
    setError(null);
    try {
      const r = await port.setActiveTheme(themeId);
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to switch theme");
    } finally {
      setBusyTheme(null);
    }
  }

  async function loadMarketplace() {
    setMarketplaceLoading(true);
    try {
      const r = await port.listMarketplaceThemes();
      setMarketplace(r.themes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load the marketplace");
    } finally {
      setMarketplaceLoading(false);
    }
  }

  /**
   * Download, then reload both the installed list and the marketplace listing.
   *
   * The marketplace has to be re-fetched too, not just the theme grid: every item's `idTaken` flag
   * is a statement about local state, and downloading is exactly what changes it. Skipping that
   * refresh would leave a freshly-taken id still advertising itself as free.
   */
  async function download(themeId: string) {
    setDownloading(themeId);
    setError(null);
    setRescanNotice(null);
    try {
      const r = await port.downloadMarketplaceTheme(themeId);
      const fresh = await port.getPresentation();
      setSettings(fresh.settings);
      setThemes(fresh.availableThemeIds);
      setThemeTiers(Object.fromEntries(fresh.availableThemes.map((t) => [t.id, t.tier])));
      await loadMarketplace();
      setRescanNotice(
        r.suffixed
          ? `Installed as “${r.id}” — “${themeId}” was already taken, so it was renamed.`
          : `Installed “${r.id}”.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to download theme");
    } finally {
      setDownloading(null);
    }
  }

  return {
    settings,
    themes,
    themeTiers,
    error,
    busyTheme,
    activate,
    rescanning,
    rescanNotice,
    rescan,
    dismissRescanNotice: () => setRescanNotice(null),
    marketplace,
    marketplaceLoading,
    loadMarketplace,
    downloading,
    download,
    t,
  };
}

/**
 * Binds the real `/api/.../presentation` + `/marketplace` client and a `themes-i18n.ts`-bound
 * translator — see `themes-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Themes.tsx` composes
 * this and a test composes {@link useThemes} with `createFakeThemesPort`.
 */
export function useWiredThemes(): ThemesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translateThemes(locale, key);
  return useThemes({ port: defaultThemesPort, t });
}

/**
 * Turn a rescan result into one sentence.
 *
 * Duplicates lead when present: two themes claiming one id means the site renders whichever sorts
 * first with no error anywhere, so it outranks the added/removed counts an operator was actually
 * looking at. "No changes" is stated explicitly rather than left blank — silence after pressing a
 * button reads as a broken button.
 */
function describeRescan(result: {
  added: string[];
  removed: string[];
  total: number;
  duplicateIds: string[];
}): string {
  const parts: string[] = [];
  if (result.added.length > 0) parts.push(`added ${result.added.join(", ")}`);
  if (result.removed.length > 0) parts.push(`removed ${result.removed.join(", ")}`);
  const summary = parts.length > 0 ? parts.join(" · ") : `no changes — ${result.total} themes`;
  return result.duplicateIds.length > 0
    ? `${summary}. Duplicate theme ids: ${result.duplicateIds.join(", ")} — only one of each will ever load.`
    : summary;
}
