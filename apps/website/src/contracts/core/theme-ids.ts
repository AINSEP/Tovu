/** @file Theme ids shared by every reader: the "theme off" value and retired-id aliases. */
/*
 * Retired theme ids, so a rename never strands a site that still stores or links the old one.
 *
 * The stock theme was renamed `basic` -> `tovu-theme` on 2026-09-26. Nothing else moves with that
 * rename on its own:
 * - `seedSiteThemes()` copies stock themes into a site ONCE, so every site seeded earlier (the live
 *   hosted data volume, every desktop site) still has a `themes/static/basic` folder whose manifest says
 *   `basic`, while a site seeded later has `tovu-theme` only.
 * - `presentation_settings.active_theme_id` and the settings ledger keep whatever id was stored.
 * - Published content bakes `/theme-assets/basic/...` URLs into stored HTML.
 *
 * So the alias works in BOTH directions and prefers the current name: asking for either id finds
 * `tovu-theme` when a site has it, otherwise `basic`. Preferring the current name matters once a
 * site holds both folders — e.g. live after the renamed theme is published to it — so the stored
 * `basic` follows the newly published copy instead of pinning the stale one.
 *
 * Pure data + one function, no imports, so any layer may use it without a dependency cost.
 */

/** Retired id -> current id. */
export const RENAMED_THEME_IDS: Readonly<Record<string, string>> = { basic: "tovu-theme" };

/**
 * The ids to try, in order, when looking up `id`: the current name first, then the retired one.
 * An id with no rename history is returned alone.
 *
 * @complexity O(r) over {@link RENAMED_THEME_IDS}.
 */
export function themeIdCandidates({ id }: { id: string }, _optional = {}): string[] {
  for (const [retired, current] of Object.entries(RENAMED_THEME_IDS)) {
    if (id === retired || id === current) return [current, retired];
  }
  return [id];
}

/**
 * Stored in `active_theme_id` to mean "the operator deliberately turned the theme OFF" — state 3 of
 * the optional-theme feature, where they intend to handle styling themselves.
 *
 * NOT the empty string, deliberately, even though `""` would have needed no thought. `""` is
 * ALREADY taken: `features/presentation/active-theme-id.ts`'s `resolveActiveThemeId` returns it for
 * "this workspace has no `presentation_settings` row yet" (a freshly created workspace, or a
 * `content.db` mid-seed), and its own doc defines that as "fall back". Spelling the deliberate
 * choice `""` too would have made an unwritten workspace render THEMELESS instead of on the default
 * theme — state 3 arriving where state 2 belongs, which is the exact confusion this feature exists
 * to remove. Fixing it from the other side is not available either: teaching `resolveActiveThemeId`
 * to return {@link DEFAULT_THEME_ID} would create the `features/presentation -> features/theme` edge
 * both files' headers exist to prevent.
 *
 * A distinct literal costs nothing the empty string would have saved: the column is `TEXT NOT NULL`
 * on both dialects so there is no DDL either way, and the settings ledger's mirror schema is
 * `{ type: "string" }` with no enum, so it round-trips unchanged.
 *
 * Shadowing: {@link resolveActiveTheme} tests this value BEFORE consulting discovery, so an
 * operator who happens to have a theme folder with this id finds it unreachable rather than finding
 * "no theme" silently meaning "that theme". Deliberate, and the safer direction of the two.
 */
export const NO_THEME_ID = "none";
