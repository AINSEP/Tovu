/** Which part of a theme a file is (`GET .../themes/:id/files`). */
export type ThemeFileGroup = "page" | "partial" | "style" | "script" | "config" | "asset" | "other";

export interface PresentationSettings {
  workspaceId: string;
  activeThemeId: string;
  updatedAt: string;
}

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

/**
 * ADR-020 capability tier, mirrored client-side from `#src/contracts/headless`'s `HeadlessThemeTier` —
 * same decoupling precedent as every other client-side type in this file that mirrors a wire
 * contract rather than importing server internals.
 */
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

/** Themes admin screen (2026-08-10) — one available theme's id plus its capability tier. */
export interface AdminThemeSummary {
  previewImageUrl?: string | null;
  id: string;
  /** `theme.json`'s display name (the server falls back to the id) — what the owner sees; the id
   *  stays the key. Optional so a response or test double without it still type-checks. */
  name?: string;
  tier: ThemeTier;
  /** Manifest schema version (`2`, or `undefined` for v1) — mirrored client-side from
   *  `#src/contracts/headless`'s `HeadlessThemeSummary.apiVersion` (2026-08-19 architecture audit finding 1),
   *  same decoupling precedent as `ThemeTier`'s own doc comment. Feeds `PostTemplateModal`'s "View
   *  Template" fetch, which needs to know whether this theme's page templates live under `pages/`
   *  or `render/pages/`. */
  apiVersion?: 2;
  /** Ships with the package (mirrors `HeadlessThemeSummary.builtIn`): the Themes card menu won't
   *  offer to delete it. Absent from older servers. */
  builtIn?: boolean;
}
