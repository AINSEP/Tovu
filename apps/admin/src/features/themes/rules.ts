import type { PresentationSettings, ThemeTier } from "../../lib/api";

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
 * Whether the site's chosen theme is STRANDED — `settings.activeThemeId` names a theme id the
 * server no longer resolves at all, so it is absent from `themes` (the discovered/installed set
 * `useThemes` fetched alongside `settings`). This can happen with zero admin-UI action: a theme
 * folder removed from disk, a bad manual DB edit, or (ADR-020's tiered themes) a tier's worker
 * becoming unavailable between one load and the next.
 *
 * Real, non-cosmetic consequence when this is true: `server/routes/site/pages.ts`'s
 * `resolveActiveTheme` returns `null` for every public route, and the whole public site serves a 500
 * "No themes installed" page until a different theme is activated — not merely a display glitch this
 * screen alone should shrug off. Before this check, nothing told the admin why every card in the grid
 * shows an Activate button and none shows Active — {@link Themes} renders a warning off this.
 *
 * @complexity Time/space: O(n) in `themes.length` (a `.includes` scan) — negligible next to the
 * catalogue sizes this screen already renders in full.
 */
export function isStrandedActiveTheme(settings: PresentationSettings, themes: readonly string[]): boolean {
  return settings.activeThemeId !== "" && !themes.includes(settings.activeThemeId);
}

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

/** The Themes screen's tab order. */
export const THEME_TAB_GROUPS: readonly ThemeTabGroup[] = ["declarative", "templated", "static", "code"];

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
 * @complexity Time/space: O(1).
 */
export function defaultThemeTabGroup(
  settings: PresentationSettings,
  themeTiers: Record<string, ThemeTier>,
): ThemeTabGroup {
  return themeTabGroup(settings.activeThemeId, themeTiers);
}
