/**
 * The reserved `activeThemeId` meaning "the operator turned the theme OFF deliberately" — the site
 * renders unstyled and handles its own CSS. Never a theme id, and deliberately never present in
 * `availableThemeIds` (that list is a catalogue of themes an operator can PICK; this is a value the
 * API accepts, which is a different set — see `routes/presentation/get.ts`'s own note on the
 * asymmetry).
 *
 * Mirrored client-side rather than imported, same decoupling precedent as {@link ThemeTier} and
 * `rules.ts`'s `THEME_TIERS` — a browser bundle cannot import server internals. Canonical
 * definition: `apps/website/src/features/theme/active-theme.ts`'s `NO_THEME_ID`. BOTH sides pin the
 * exact literal in their own test suite (`features/theme/__tests__/active-theme.test.ts` and
 * `features/themes/__tests__/rules.unit.test.ts`), so changing one without the other turns a suite
 * red instead of silently splitting the sentinel in two.
 */
export const NO_THEME_ID = "none";
