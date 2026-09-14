import { NO_THEME_ID, type PresentationSettings, type ThemeTier } from "../../lib/api";

/**
 * @file Pure logic for the `appearance` feature — everything that computes a value rather than
 * rendering one. See `features/posts/rules.ts`'s file header for the standing convention this
 * follows.
 */

/**
 * Whether `themeId` is the site's currently active theme — the status derivation that drives both
 * a theme card's `.active` class and whether it renders the "Active" tag or the Activate button.
 *
 * @complexity Time/space: O(1).
 */
export function isActiveTheme(settings: PresentationSettings, themeId: string): boolean {
  return settings.activeThemeId === themeId;
}

/**
 * Whether the site is DELIBERATELY themeless — the operator turned the theme off to handle styling
 * themselves. A choice, not a fault: {@link isStrandedActiveTheme} must never fire for it, and the
 * screen shows an informational banner rather than a warning.
 *
 * @complexity Time/space: O(1).
 */
export function isThemeDisabled(settings: PresentationSettings): boolean {
  return settings.activeThemeId === NO_THEME_ID;
}

/**
 * Whether the site's chosen theme is STRANDED — `settings.activeThemeId` names a theme id the
 * server no longer resolves at all, so it is absent from `themes` (the discovered/installed set
 * `useThemes` fetched alongside `settings`). This can happen with zero admin-UI action: a theme
 * folder removed from disk, a bad manual DB edit, or (ADR-020's tiered themes) a tier's worker
 * becoming unavailable between one load and the next.
 *
 * **Consequence, corrected 2026-09-12.** This doc used to claim `resolveActiveTheme` returns `null`
 * for every public route and the site serves a 500 until a different theme is activated. **That was
 * false**, and had been since the function was written: `active-theme.ts` substitutes a DIFFERENT
 * theme and renders it silently. The 500 is real only in the zero-themes-installed sub-case, where
 * there is nothing left to substitute. What an operator actually gets is subtler and still worth a
 * banner — the public site renders, but under a theme nobody chose (as of 2026-09-12, the named
 * default `basic`), which is exactly the kind of drift that goes unnoticed precisely because the
 * site looks fine. Nothing else on this screen says so: every card shows Activate and none shows
 * Active. {@link Themes} renders the warning off this.
 *
 * Excludes {@link isThemeDisabled}: the no-theme sentinel is never in `themes` either, so without
 * that guard every deliberately-themeless site would be reported as broken. The pre-existing
 * `!== ""` guard covers a different case — an unwritten `presentation_settings` row — and both are
 * needed.
 *
 * @complexity Time/space: O(n) in `themes.length` (a `.includes` scan) — negligible next to the
 * catalogue sizes this screen already renders in full.
 */
export function isStrandedActiveTheme(settings: PresentationSettings, themes: readonly string[]): boolean {
  if (isThemeDisabled(settings)) return false;
  return settings.activeThemeId !== "" && !themes.includes(settings.activeThemeId);
}

/** Theme Explore's name on `lib/content-refresh-bus.ts` — a plain colocated constant, matching
 *  `SITES_RESOURCE`/`TAXONOMY_RESOURCE`. Theme files are filesystem state an assistant run can write
 *  (`theme_write_file`, `theme_edit_file`, `theme_reset_file`) with Explore open, which is the
 *  staleness the bus exists for. */
export const THEME_FILES_RESOURCE = "theme-files";

/**
 * ADR-020's fixed tier order. Mirrors `theme.ts`'s own `THEME_TIERS` (server-side, not imported
 * here — see `ThemeTier`'s own doc comment in `lib/api.ts` for why the client mirrors rather than
 * imports). No longer the Themes screen's tab order directly — see {@link ThemeTabGroup}.
 */
export const THEME_TIERS: readonly ThemeTier[] = ["declarative", "templated", "handlebars", "static", "code"];

/**
 * `themeId`'s tier, or `"declarative"` when `themeTiers` has no entry for it — the same
 * absent-tier fallback `theme.ts`'s `loadTheme` applies for a `theme.json` with no `tier` field.
 * Centralizes the fallback so a card's tab bucket and its tab-bar-default computation
 * ({@link defaultThemeTabGroup}) can never disagree about where an unlisted theme belongs.
 *
 * @complexity Time/space: O(1).
 */
export function themeTier(themeId: string, themeTiers: Record<string, ThemeTier>): ThemeTier {
  return themeTiers[themeId] ?? "declarative";
}

/**
 * The Themes screen's tab grouping (2026-08-10 owner feedback) — a *display* concept, distinct
 * from {@link ThemeTier} itself. `ThemeTier` has five raw values because `handlebars` and
 * `templated` are genuinely separate engines with separate allowlists/workers server-side (see
 * `theme.ts`'s own doc comment on `ThemeTier`) — that distinction is real and stays untouched
 * on-disk and in the wire contract. But from an operator's chair, both are just "logic lives in the
 * template, not raw HTML" — the same conceptual bucket. Only four tabs, not five, reflect that.
 * `handlebars` and `templated` fold into `"templated"` here; `declarative`/`static`/`code` map
 * 1:1. This mapping is UI-only — it does not change any theme's `tier` in `theme.json`, nor
 * {@link ThemeTier} itself.
 */
export type ThemeTabGroup = "declarative" | "templated" | "static" | "code";

/** {@link ThemeTier} -> {@link ThemeTabGroup}, the whole merge in one place so no caller re-derives it. */
const TIER_TAB_GROUP: Record<ThemeTier, ThemeTabGroup> = {
  declarative: "declarative",
  templated: "templated",
  handlebars: "templated",
  static: "static",
  code: "code",
};

/**
 * The Themes screen's tab order (2026-08-11 owner feedback: `static` reads before `templated`,
 * since Tovu ships a working static theme today and no templated one yet). Distinct from
 * {@link THEME_TIERS}'s ADR-020 order, which stays fixed — this is a display-only sequencing
 * concern, not a change to tier semantics.
 */
export const THEME_TAB_GROUPS: readonly ThemeTabGroup[] = ["declarative", "static", "templated", "code"];

/**
 * `themeId`'s tab group — {@link themeTier}'s tier, folded through {@link TIER_TAB_GROUP}.
 *
 * @complexity Time/space: O(1).
 */
export function themeTabGroup(themeId: string, themeTiers: Record<string, ThemeTier>): ThemeTabGroup {
  return TIER_TAB_GROUP[themeTier(themeId, themeTiers)];
}

/**
 * Buckets every theme id into its tab group, in {@link THEME_TAB_GROUPS} order — the Themes screen
 * renders one tab per key, including groups with an empty array (the "empty tier tab"
 * requirement), rather than only tabs for groups that happen to have a theme.
 *
 * @complexity Time/space: O(n) in `themes.length`.
 */
export function groupThemesByTabGroup(
  themes: readonly string[],
  themeTiers: Record<string, ThemeTier>,
): Record<ThemeTabGroup, string[]> {
  const groups = Object.fromEntries(THEME_TAB_GROUPS.map((group) => [group, [] as string[]])) as Record<
    ThemeTabGroup,
    string[]
  >;
  for (const id of themes) groups[themeTabGroup(id, themeTiers)].push(id);
  return groups;
}

/**
 * The tab the Themes screen should open on: the active theme's own tab group, so an operator lands
 * on the tab that already shows what's live rather than always defaulting to the first group.
 *
 * With no theme active there is no "tab that shows what's live", so this opens on the first tab
 * instead. Without that case, {@link themeTabGroup} would run the sentinel through
 * {@link themeTier}'s absent-tier fallback and land on `"declarative"` — a real tab, chosen for no
 * reason, which reads to an operator as "your theme is a declarative one".
 *
 * @complexity Time/space: O(1).
 */
export function defaultThemeTabGroup(
  settings: PresentationSettings,
  themeTiers: Record<string, ThemeTier>,
): ThemeTabGroup {
  if (isThemeDisabled(settings)) return THEME_TAB_GROUPS[0]!;
  return themeTabGroup(settings.activeThemeId, themeTiers);
}
