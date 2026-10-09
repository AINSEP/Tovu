import { adminHref } from "../../../lib/router";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";
import type { ThemePageSlugCollision } from "../hooks/theme-pages-port.hooks";

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

/** The bare route path — no `/admin` base — for a theme page row's Theme Studio destination. The
 *  one place `?theme=`/`?page=` are assembled; {@link themeStudioHref} (for an `<a href>`) and
 *  `ThemePagesTab.tsx`'s row-menu `onEdit` (for `navigate()`) both derive from this SAME function
 *  rather than each building its own string, because those two call sites need OPPOSITE shapes —
 *  an anchor's `href` must already carry the base, while `navigate()` (`@jini-ai/admin/browser`)
 *  applies `adminHref` itself and doubles the base if handed one that already has it — and a bug
 *  shipped (2026-09-19) from `onEdit` passing `themeStudioHref`'s own prefixed output straight into
 *  `navigate()`, landing on `/admin/admin/themes/explore?...`, which the router has no match for and
 *  silently falls back to the Dashboard. Keeping one unprefixed source of truth is what stops the
 *  two consumers from drifting apart like that again.
 *
 *  `?theme=` and `?page=` rather than a path, matching `Themes.tsx`'s Explore button. Both are
 *  `encodeURIComponent`d: a theme or page id is a filename on disk, and an unescaped `&` or `=` in
 *  one would otherwise forge a third query parameter.
 *
 *  @complexity Time/space: O(1). */
export function themeStudioRoutePath(themeId: string, pageId: string): string {
  return `/themes/explore?theme=${encodeURIComponent(themeId)}&page=${encodeURIComponent(pageId)}`;
}

/** Where a theme page row LINKS (an `<a href>`): the theme studio, opened on that page — never the
 *  live site. A theme page is the THEME's file, and the only thing an operator can actually DO with
 *  one from this screen is edit it in Explore, regardless of whether it is currently published; see
 *  `Pages.tsx`'s own header comment (2026-08-27 owner decision) for the fuller history.
 *
 *  Wraps {@link themeStudioRoutePath} in `adminHref()` for the anchor's own href. A caller driving
 *  the SPA router instead (`navigate()`) must pass {@link themeStudioRoutePath} directly, NOT this —
 *  see that function's own doc for why.
 *
 *  @complexity Time/space: O(1). */
export function themeStudioHref(themeId: string, pageId: string): string {
  return adminHref(themeStudioRoutePath(themeId, pageId));
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
  if (pageId === "index") return homeFallbackPublishReason(null, t);
  if (pageId === "404") return { on: true, reason: t("Always published — error page") };
  return { on: false, reason: t("Not a standalone page — used as a content template") };
}

/**
 * The locked switch for the theme's `index` page — the site's home FALLBACK, never a page that owns
 * `/` (owner, 2026-10-08: "The theme has an index page with a forward slash, which is not correct.").
 * `GET /` serves a published Page at the root slug ahead of `index` (`pages.ts`'s
 * `resolveHomePageContent`); the detail route reports that Page as `index`'s `collidingContent`.
 * With one, `index` is OFF and names it; without one, `index` is ON as the fallback, worded so it
 * never reads as a page the theme owns at `/`. Shared with Theme Studio's Explore
 * (`use-theme-explore.hooks.ts`) so both screens state the fact identically.
 *
 * @complexity O(1).
 */
export function homeFallbackPublishReason(
  homePage: ThemePageSlugCollision | null,
  t: Translate
): { on: boolean; reason: string } {
  if (homePage) return { on: false, reason: t("Not shown — {title} is your home page").replace("{title}", homePage.title) };
  return { on: true, reason: t("Home page fallback — shown at / until one of your pages is set as the home page") };
}

/**
 * The slug-collision notice copy for a theme page — shared by the Theme Pages details modal and
 * Theme Studio's Explore warning. A Page at the root slug `/` ALWAYS wins over the theme's `index`
 * (see {@link homeFallbackPublishReason}), so that case is stated plainly; every other collision
 * keeps the non-committal wording, because who wins there depends on publish state and the
 * record's own override (`pages.ts`'s `resolveMarketingPageOrOverride`).
 *
 * @complexity O(1).
 */
export function themePageCollisionMessage(collision: ThemePageSlugCollision, t: Translate): string {
  const message =
    collision.slug === "/"
      ? t(
          "{title} is this site's home page, so visitors see it at / instead of this theme page. This theme page is only shown when no page is set as the home page."
        )
      : t(
          "A content record shares this page's URL: {title}. Whichever one wins depends on this page's publish state and that record's own override choice, not on this toggle alone."
        );
  return message.replace("{title}", collision.title);
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
  if (row.pageId === "index") return { kind: "locked", ...homeFallbackPublishReason(row.collidingContent, t) };
  return { kind: "locked", ...lockedPublishReason(row.pageId, t) };
}

/** The shapes the public-site URL column can render for one row — replaces the single path-
 *  or-"No direct URL" string the column used before it was a real `<a>` (`ThemePagesTab.tsx`'s own
 *  file header, PART 1 of the 2026-08-31 review pass, covers why the column split from the
 *  Theme-Studio one below it). `"live"` is the only shape a caller should ever render as a working
 *  link — `"not-live"`/`"none"`/`"replaced"` all mean "there is text here, not a link", so an address that
 *  currently 404s (theme pages ship unpublished by default) or genuinely doesn't exist (`404`, a
 *  template shell) is never presented as though clicking it works. */
export type ThemePagePublicLinkState =
  | { kind: "live"; path: string }
  | { kind: "not-live"; path: string }
  | { kind: "none" }
  /** `index` while a content Page is the home page — `/` serves that Page, so this row has no
   *  address; `reason` names the Page (see {@link homeFallbackPublishReason}). */
  | { kind: "replaced"; reason: string };

/**
 * The public-site URL column's state for one row — three cases, not the two `themePagePublishState`
 * itself distinguishes:
 *
 * - `index` is checked FIRST, ahead of the locked/toggle split below: unlike `404` it can be
 *   reachable — at `/`, not `/index` (`pages.ts`'s static-page branch excludes that slug) — but only
 *   as the home FALLBACK. While a content Page is the home page (`row.collidingContent`), `/` serves
 *   that Page instead and this row is `"replaced"`, never a link claiming `/` (2026-10-08).
 * - Every OTHER locked row (`404`, a declared template shell) has no address of its own at all —
 *   `"none"`, never a link that happens to 404.
 * - A real candidate page's address always exists (`/pageId`); whether it currently resolves is
 *   exactly `row.published` — theme pages ship unpublished by default (2026-08-30), so most rows are
 *   `"not-live"` today, not `"live"`.
 *
 * @complexity O(1).
 */
export function themePagePublicLinkState(row: ThemePageRow, t: Translate): ThemePagePublicLinkState {
  if (row.pageId === "index") {
    return row.collidingContent
      ? { kind: "replaced", reason: homeFallbackPublishReason(row.collidingContent, t).reason }
      : { kind: "live", path: "/" };
  }
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
