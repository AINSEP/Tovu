import { adminHref } from "../../../lib/router";
import type { Translate } from "../../../lib/dictionary-translator";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

/**
 * @file Pure publish-state logic for a Theme Pages row — pulled out of `ThemePagesTab.tsx` (2026-08-31
 * RowMenu/modal pass) so `ThemePageDetailsModal.tsx` can read the SAME derivation the table's own
 * Publish cell uses, without either file importing the other (that would be a cycle: the tab renders
 * the modal, so the modal cannot also import table-only JSX back out of `ThemePagesTab.tsx`). Same
 * "narrow, feature-owned pure module" bar `rules.ts`'s own header sets: nothing here renders anything
 * or touches state, it only computes values from a {@link ThemePageRow}.
 */

/** The site path a theme page id is SHOWN as in the URL column. `"index"` is special: `pages.ts`'s
 *  static-page branch explicitly excludes `slug === "index"` (confirmed live: `/index` 404s, `/`
 *  200s) because the home route is served by `render.ts`'s own `route === "home"` branch instead —
 *  the id `theme.pages` uses internally is not the id the site actually routes it at. Every other
 *  candidate page id IS also its own route, so this is the one exception, not a pattern to
 *  generalize.
 *
 *  Label only, not a destination: see {@link themeStudioHref} for the Theme Studio column's own
 *  link, and {@link themePagePublicLinkState} for the public-site column's full link/no-link state.
 *
 *  @complexity Time/space: O(1). */
export function themePagePath(pageId: string): string {
  return pageId === "index" ? "/" : `/${pageId}`;
}

/** Where a theme page row links: the theme studio, opened on that page — never the live site. A
 *  theme page is the THEME's file, and the only thing an operator can actually DO with one from
 *  this screen is edit it in Explore, regardless of whether it is currently published; see
 *  `Pages.tsx`'s own header comment (2026-08-27 owner decision) for the fuller history.
 *
 *  `?theme=` and `?page=` rather than a path, matching `Themes.tsx`'s Explore button. Both are
 *  `encodeURIComponent`d: a theme or page id is a filename on disk, and an unescaped `&` or `=` in
 *  one would otherwise forge a third query parameter.
 *
 *  @complexity Time/space: O(1). */
export function themeStudioHref(themeId: string, pageId: string): string {
  return adminHref(`/themes/explore?theme=${encodeURIComponent(themeId)}&page=${encodeURIComponent(pageId)}`);
}

/** One of the two states a row's publish switch can render — mirrors `ThemeExplore.tsx`'s own
 *  `ThemeExplorePublishState`, the type this tab's toggle is built to agree with. */
export type ThemePagePublishState =
  | { kind: "toggle"; published: boolean }
  | { kind: "locked"; on: boolean; reason: string };

/**
 * The reason — and the fixed switch position that goes with it — for a page that EXISTS but can
 * never be independently toggled: `index`/`404`, or a declared Post/Page template shell. Keyed off
 * `pageId` alone, exactly like `ThemeExplore.tsx`'s own `lockedPublishReason` (that file's own doc
 * explains why the label alone is enough: `index`/`404` are the only two ids `theme.ts`'s
 * `NON_ROUTABLE_THEME_PAGE_IDS` names, so any OTHER id reaching this function — by construction, one
 * `getThemeDetail` already reported as having no publish state — is the remaining template-shell
 * case). Wording matches that function's own strings verbatim: the owner asked for "the same
 * toggle" Theme Studio uses, and a reader flipping between the two screens should see one fact
 * stated the same way twice, not two independently-drifting paraphrases of it.
 *
 * @complexity O(1).
 */
export function lockedPublishReason(pageId: string, t: Translate): { on: boolean; reason: string } {
  if (pageId === "index") return { on: true, reason: t("Always published — theme home page") };
  if (pageId === "404") return { on: true, reason: t("Always published — error page") };
  return { on: false, reason: t("Not a standalone page — used as a content template") };
}

/**
 * A row's publish-control state — `"toggle"` for a real candidate page (`row.published` is a real
 * boolean), `"locked"` for `index`/`404`/a declared template shell (`row.published` is `null`, see
 * {@link ThemePageRow.published}'s own doc for why that always means one of exactly those three
 * shapes on a `getThemeDetail` `"page"`-group entry).
 *
 * @complexity O(1).
 */
export function themePagePublishState(row: ThemePageRow, t: Translate): ThemePagePublishState {
  if (row.published !== null) return { kind: "toggle", published: row.published };
  return { kind: "locked", ...lockedPublishReason(row.pageId, t) };
}

/** The three shapes the public-site URL column can render for one row — replaces the single path-
 *  or-"No direct URL" string the column used before it was a real `<a>` (`ThemePagesTab.tsx`'s own
 *  file header, PART 1 of the 2026-08-31 review pass, covers why the column split from the
 *  Theme-Studio one below it). `"live"` is the only shape a caller should ever render as a working
 *  link — `"not-live"`/`"none"` both mean "there is text here, not a link", so an address that
 *  currently 404s (theme pages ship unpublished by default) or genuinely doesn't exist (`404`, a
 *  template shell) is never presented as though clicking it works. */
export type ThemePagePublicLinkState =
  | { kind: "live"; path: string }
  | { kind: "not-live"; path: string }
  | { kind: "none" };

/**
 * The public-site URL column's state for one row — three cases, not the two `themePagePublishState`
 * itself distinguishes:
 *
 * - `index` is checked FIRST, ahead of the locked/toggle split below: `lockedPublishReason` reports
 *   it `on: true` for the same reason `404` is (`theme.ts`'s `NON_ROUTABLE_THEME_PAGE_IDS` names
 *   both), but unlike `404` it genuinely IS reachable — at `/`, not `/index` (`pages.ts`'s
 *   static-page branch excludes that slug; the home route is served by `render.ts`'s own
 *   `route === "home"` branch instead). Falling through to the generic locked branch below would
 *   have reported it `"none"`, which would be wrong — `index` is the one locked row with a real
 *   address.
 * - Every OTHER locked row (`404`, a declared template shell) has no address of its own at all —
 *   `"none"`, never a link that happens to 404.
 * - A real candidate page's address always exists (`/pageId`); whether it currently resolves is
 *   exactly `row.published` — theme pages ship unpublished by default (2026-08-30), so most rows are
 *   `"not-live"` today, not `"live"`.
 *
 * @complexity O(1).
 */
export function themePagePublicLinkState(row: ThemePageRow, t: Translate): ThemePagePublicLinkState {
  if (row.pageId === "index") return { kind: "live", path: "/" };
  const state = themePagePublishState(row, t);
  if (state.kind === "locked") return { kind: "none" };
  return { kind: state.published ? "live" : "not-live", path: themePagePath(row.pageId) };
}

/**
 * The per-row info icon's tooltip — shown ONLY on a locked row (2026-08-31 owner feedback: "there
 * should be an info icon where the text is for... that's dynamically given to the info icon for the
 * tooltip"). Reuses `lockedPublishReason`'s own strings verbatim — the exact same, already-translated
 * string, just fed to `InfoTip` (the table row) or the details modal (its Publish section) instead
 * of an inline `<span>`. No new copy, no new i18n key.
 *
 * @complexity O(1).
 */
export function themePagePublishTooltip(state: Extract<ThemePagePublishState, { kind: "locked" }>): string {
  return state.reason;
}
