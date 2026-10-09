import { useEffect, useState } from "react";

import { type PresentationSettings, type ThemeTier } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { interpolate, useSerialWrites, useSettlementGeneration, type Translate } from "@jini-ai/ui/panel-kit";
import { themeCopyName, themeNamesById } from "../rules";
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
  t: Translate;
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
  /** Theme id -> `theme.json` display name, from the same `availableThemes` list. Optional for the
   *  same reason `themeTiers` is; an id absent here shows as itself (`themeDisplayName`). */
  themeNames?: Record<string, string>;
  /** Theme id -> the server-advertised preview URL (D-22): a string names a file that exists, `null`
   *  means none, `undefined` (an older server) keeps the card's jpg→png probing fallback. */
  themePreviewImages?: Record<string, string | null | undefined>;
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
  /** The theme id currently being duplicated, or `null`. Optional for the same reason `rescanning` is. */
  duplicatingTheme?: string | null;
  /**
   * Copy a theme into a new one named "<name> copy" — no name prompt, by design: the copy is cheap,
   * appears as its own card at once, and can be renamed in Explore (`theme.json`), so asking first
   * would only add a step. The server picks a free id.
   */
  duplicate?: (themeId: string) => Promise<void>;
  /** "Duplicated as …" after a successful copy, or `null`. Its own field, not `rescanNotice`:
   *  `RescanToast` styles any message containing "Duplicate" as an error. */
  duplicateNotice?: string | null;
  dismissDuplicateNotice?: () => void;
  /** Bound translator — `Themes.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
}

/**
 * @complexity Time/space: O(1) per call — one settings round trip on mount, one per `activate`.
 */
export function useThemes({ port, t }: ThemesDependencies): ThemesController {
  const [settings, setSettings] = useState<PresentationSettings | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [themeTiers, setThemeTiers] = useState<Record<string, ThemeTier>>({});
  const [themeNames, setThemeNames] = useState<Record<string, string>>({});
  const [themePreviewImages, setThemePreviewImages] = useState<Record<string, string | null | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyTheme, setBusyTheme] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanNotice, setRescanNotice] = useState<string | null>(null);
  const [duplicatingTheme, setDuplicatingTheme] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  // Monotonic per-call ids (extracted into `useSettlementGeneration` 2026-09-06, same shape as
  // `use-sites.hooks.ts`'s own `activateSettlement`): `activate` takes a theme id and races an
  // independent request per call, and network completion order does not have to match click order.
  // A stale settlement (checked before every state write below, not just the success path, since an
  // out-of-order FAILURE would otherwise resurrect a stale error over a newer call's real outcome) is
  // dropped instead of overwriting whatever the latest call already produced.
  const activateSettlement = useSettlementGeneration();

  // Serializes `activate` calls onto one lane (2026-09-20, same shape `use-sites.hooks.ts`'s
  // `activate` adopted first): the server persists whichever activation it processes LAST, so two
  // activations in flight at once could leave the server on an earlier choice than the one this
  // screen reports.
  const activateWrites = useSerialWrites();

  /** One `getPresentation()` answer into every piece of screen state it feeds — shared by `rescan`
   *  and `duplicate`, so the two can never refresh different subsets. (The mount effect below keeps
   *  its own inline copy: calling a per-render function from it would trip exhaustive-deps.) */
  function applyPresentation(r: Awaited<ReturnType<ThemesPort["getPresentation"]>>) {
    setSettings(r.settings);
    setThemes(r.availableThemeIds);
    setThemeTiers(Object.fromEntries(r.availableThemes.map((t) => [t.id, t.tier])));
    setThemeNames(themeNamesById(r.availableThemes));
    setThemePreviewImages(Object.fromEntries(r.availableThemes.map((theme) => [theme.id, theme.previewImageUrl])));
  }

  useEffect(() => {
    port
      .getPresentation()
      .then((r) => {
        setSettings(r.settings);
        setThemes(r.availableThemeIds);
        setThemeTiers(Object.fromEntries(r.availableThemes.map((t) => [t.id, t.tier])));
        setThemeNames(themeNamesById(r.availableThemes));
        setThemePreviewImages(Object.fromEntries(r.availableThemes.map((theme) => [theme.id, theme.previewImageUrl])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load themes"));
  }, [port]);

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
      applyPresentation(await port.getPresentation());
      setRescanNotice(describeRescan(r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rescan themes");
    } finally {
      setRescanning(false);
    }
  }

  /**
   * Duplicate `themeId` server-side, then reload the screen's data so the copy's card appears. The
   * server already rescanned; re-fetching (rather than splicing the response into state) keeps
   * `getPresentation` the one source of truth, same as {@link rescan}.
   */
  async function duplicate(themeId: string) {
    setDuplicatingTheme(themeId);
    setError(null);
    setDuplicateNotice(null);
    try {
      const sourceName = themeNames[themeId] ?? themeId;
      const r = await port.duplicateTheme(themeId, themeCopyName({ name: sourceName, t }));
      applyPresentation(await port.getPresentation());
      setDuplicateNotice(interpolate({ template: t("Duplicated as \"{name}\""), vars: { name: r.theme.name } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed to duplicate theme"));
    } finally {
      setDuplicatingTheme(null);
    }
  }

  function activate(themeId: string) {
    // Minted BEFORE `run`, synchronously, so a second same-tick click observes this claim before
    // its own task ever starts — see `useSerialWrites`' own doc for why minting inside the queued
    // task would make every queued call read as "current".
    const generation = activateSettlement.next();
    setBusyTheme(themeId);
    setError(null);
    return activateWrites.run({ task: async () => {
      try {
        const r = await port.setActiveTheme(themeId);
        // Superseded by a newer activate call started after this one — that later call owns
        // `settings`/`busyTheme` now, and applying this stale result would let whichever request
        // happens to settle LAST win regardless of which theme was actually clicked last.
        if (!activateSettlement.isCurrent({ generation })) return;
        setSettings(r.settings);
      } catch (e) {
        if (!activateSettlement.isCurrent({ generation })) return;
        setError(e instanceof Error ? e.message : t("failed to switch theme"));
      } finally {
        if (!activateSettlement.isCurrent({ generation })) return;
        setBusyTheme(null);
      }
    } });
  }

  return {
    settings,
    themes,
    themeTiers,
    themeNames,
    themePreviewImages,
    error,
    busyTheme,
    activate,
    rescanning,
    rescanNotice,
    rescan,
    dismissRescanNotice: () => setRescanNotice(null),
    duplicatingTheme,
    duplicate,
    duplicateNotice,
    dismissDuplicateNotice: () => setDuplicateNotice(null),
    t,
  };
}

/**
 * Binds the real `/api/.../presentation` client and a `themes-i18n.ts`-bound
 * translator — see `themes-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Themes.tsx` composes
 * this and a test composes {@link useThemes} with `createFakeThemesPort`.
 */
export function useWiredThemes(): ThemesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translateThemes({ locale: locale, key: key });
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
