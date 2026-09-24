import { useCallback, useEffect, useState } from "react";

import { NO_THEME_ID } from "@/lib/api";
import type { Translate } from "@/lib/dictionary-translator";
import { pageAdminPath } from "../rules";
import { themePagePublishState, themePagePublishTooltip } from "../lib/theme-page-publish-state";
import { defaultThemePagesPort } from "./theme-pages-dependencies.hooks";
import type { ThemePagesFileEntry, ThemePagesPort, ThemePageSlugCollision } from "./theme-pages-port.hooks";

export type { ThemePageSlugCollision };

/**
 * @file The "Theme Pages" tab's data — the active theme's own bundled `pages/*.html`, one row per
 * page-shaped file, now carrying enough per-row detail to drive a publish toggle and a "see more"
 * disclosure (2026-08-30) instead of the bare id list this used to be.
 *
 * **Why this now makes two requests, not one.** The active theme id and its page list used to ride
 * on the same `getPresentation()` response (`activeThemeStaticPageIds`, computed server-side as a
 * bare `Object.keys(activeTheme.pages)` — every page id, including `index`/`404`/a declared
 * template shell, with no publish state at all). That's no longer enough: this tab needs to tell a
 * real candidate page apart from those three non-candidate shapes, and show whether each candidate
 * is actually live. Theme Studio's Explore screen already resolves both facts, off `getThemeDetail`
 * (`files[].published`, straight from the server's `isStandaloneThemePage` — see `theme-pages-
 * port.hooks.ts`'s own header) — but that route needs the theme id as an argument, which is exactly
 * what `getPresentation()` still supplies. The two calls are therefore chained, not independent:
 * `getPresentation()` resolves `activeThemeId`, then `getThemeDetail(activeThemeId)` resolves the
 * page rows.
 *
 * `port` is injected — see `theme-pages-port.hooks.ts` — rather than importing `lib/api` directly,
 * so a test can describe the load against `createFakeThemePagesPort` instead of stubbing global
 * `fetch`. `useWiredThemePages` below is the zero-argument pair `Pages.tsx` actually mounts.
 */

/** One row the "Theme Pages" tab renders — everything `Pages.tsx`'s `ThemePagesTab` needs to decide
 *  publish/locked state and the "see more" detail, with none of `getThemeDetail`'s group/readable/
 *  editable noise this tab never reads. */
export interface ThemePageRow {
  /** Basename minus `.html` — the same id `theme.ts`'s `isStandaloneThemePage`/
   *  `ThemeManifest.publishedPages` key candidate pages by. */
  pageId: string;
  /** Full theme-relative path (e.g. `render/pages/about.html`) — the one extra fact this tab's
   *  "see more" disclosure reveals for a real candidate page; see `ThemePagesTab.tsx`. */
  filePath: string;
  /** Straight from the server's `isStandaloneThemePage` — `null` for `index`/`404`/a declared
   *  template shell, the same three-way `null` contract `ThemeExploreFile.published`
   *  (`use-theme-explore.hooks.ts`) already established for the identical route. */
  published: boolean | null;
  /** False for a page the theme author added after the site's own copy was made — no original to
   *  reset it from. Surfaced in the row's details modal. */
  resettable: boolean;
  /** The live content record occupying this page's own slug, or `null` when none does — straight
   *  from `getThemeDetail`'s own `collidingContent`. See `ThemePagesFileEntry.collidingContent`
   *  (`theme-pages-port.hooks.ts`) for the full contract and `ThemePageDetailsModal.tsx` for where
   *  this tab shows it. */
  collidingContent: ThemePageSlugCollision | null;
}

export interface ThemePagesController {
  /** `null` until the initial load settles — the caller renders a loading state. `[]` once loaded
   *  means the active theme is genuinely not `static`-tier or ships no pages — not an error. */
  pages: ThemePageRow[] | null;
  /** `pages`' own length, or `0` while still loading (`pages === null`) — `Pages.tsx`'s TabBar
   *  count for this tab. Derived here (2026-09-04, complexity-ceiling pass) rather than as a
   *  `themePages?.length ?? 0` expression in `Pages.tsx` itself, the same "derive it beside the
   *  state it reads" move `configured`/`busy` already use in `use-composio-key-field.hooks.ts`. */
  pageCount: number;
  /**
   * The id of the theme `pages` came from — `null` until the same load settles.
   *
   * Needed because each row links into the theme studio (`/admin/themes/explore?theme=&page=`) and
   * every publish call needs it, and a page id alone does not say WHICH theme's copy to act on.
   */
  activeThemeId: string | null;
  error: string | null;
  /**
   * The `pageId` of the row whose publish round trip is currently in flight, or `null`. Per-row
   * rather than one screen-wide flag: unlike Theme Studio's Explore (one file selected at a time),
   * every row here is visible and independently actionable at once, so disabling every switch while
   * any one of them saves would freeze rows that have nothing to do with the in-flight request.
   */
  savingPageId: string | null;
  /** Publish or unpublish one row. A no-op — no request, no state change — when `activeThemeId`
   *  hasn't resolved yet, matching `use-theme-explore.hooks.ts`'s own "acts on nothing rather than
   *  send a request that can't possibly be correct" shape for its equivalent guard. */
  setPagePublished: (pageId: string, published: boolean) => Promise<void>;
}

/**
 * `f.path.slice(f.path.lastIndexOf("/") + 1)` minus `.html` — the same basename-minus-extension
 * page id derivation `use-theme-explore.hooks.ts`'s `fileLabel` and `theme-explore-
 * dependencies.hooks.ts`'s fake `setPagePublished` both already use for this exact route. Kept as
 * its own one-line function here (rather than imported from a sibling feature) because this hook
 * has no other reason to reach into `features/themes` for one line of string arithmetic — the two
 * features independently agreeing on the same derivation is the port-narrowing convention this
 * file's own header describes, not an accidental duplication.
 *
 * @complexity O(1).
 */
function pageIdFromPath(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.html$/, "");
}

/**
 * Where a colliding content record's own admin editor lives — also called directly by
 * `ThemeExploreSlugCollisionWarning` (`ThemeExplore.tsx`), which used to duplicate this derivation
 * inline before importing it (2026-09-05): a Post's editor route is keyed by slug (`/posts/:slug`,
 * readable-slugs S6a); a Page's goes through {@link pageAdminPath} (`rules.ts`), which prefers the
 * slug and falls back to the id only for the root-slug page. `ThemeExplore.tsx`'s own
 * `ThemeExploreSlugCollision` and this file's
 * `ThemePageSlugCollision` are independently declared, identically-shaped `{ id, slug, title, kind }`
 * port types (see `pages/rules.ts`'s own doc on this structural-typing convention), so that call needs
 * no cast.
 *
 * @complexity O(1).
 */
export function themePageCollisionAdminPath(collision: ThemePageSlugCollision): string {
  return collision.kind === "post" ? `/posts/${collision.slug}` : pageAdminPath(collision);
}

/**
 * The Publish section's own line — the locked reason (already-translated, same string the row's
 * `InfoTip` shows) for a locked row, or the live/not-live state word for a real candidate one.
 *
 * @complexity O(1).
 */
export function themePagePublishSummary(row: ThemePageRow, t: Translate): string {
  const state = themePagePublishState(row, t);
  if (state.kind === "locked") return themePagePublishTooltip(state);
  return state.published ? t("Live") : t("Not live");
}

/**
 * Keep only `"page"`-group entries and map each to a {@link ThemePageRow}.
 *
 * @complexity O(n) in `entries.length` — one filter, one map, no nesting.
 */
function mapThemePageRows(entries: readonly ThemePagesFileEntry[]): ThemePageRow[] {
  return entries
    .filter((f) => f.group === "page")
    .map((f) => ({
      pageId: pageIdFromPath(f.path),
      filePath: f.path,
      published: f.published ?? null,
      resettable: f.resettable,
      collidingContent: f.collidingContent ?? null,
    }));
}

/**
 * @complexity Time/space: O(1) plus the O(n) row mapping above — two chained round trips on mount,
 * one on each publish toggle.
 */
export function useThemePages(port: ThemePagesPort): ThemePagesController {
  const [pages, setPages] = useState<ThemePageRow[] | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingPageId, setSavingPageId] = useState<string | null>(null);

  useEffect(() => {
    port
      .getPresentation()
      .then((r) => {
        const themeId = r.settings.activeThemeId;
        setActiveThemeId(themeId);
        // `NO_THEME_ID` ("none") is the operator-chosen no-theme sentinel, not a real theme id —
        // `getThemeDetail(NO_THEME_ID)` 404s server-side, which used to surface as this hook's
        // `error` and put an error banner on a screen the operator disabled on purpose. There is no
        // theme detail to fetch in that state, so this short-circuits straight to the same `[]` an
        // installed-but-pageless theme resolves to (`ThemePagesTab`'s existing empty state), rather
        // than making a call that can only ever fail.
        if (themeId === NO_THEME_ID) return null;
        return port.getThemeDetail(themeId);
      })
      .then((detail) => setPages(detail ? mapThemePageRows(detail.files) : []))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load theme pages"));
  }, [port]);

  const setPagePublished = useCallback(
    async (pageId: string, published: boolean) => {
      if (activeThemeId === null) return;
      setSavingPageId(pageId);
      setError(null);
      try {
        const r = await port.setPagePublished(activeThemeId, pageId, published);
        setPages((prev) => (prev ? prev.map((p) => (p.pageId === r.page ? { ...p, published: r.published } : p)) : prev));
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to update publish state");
      } finally {
        setSavingPageId(null);
      }
    },
    [activeThemeId, port]
  );

  const pageCount = pages === null ? 0 : pages.length;

  return { pages, pageCount, activeThemeId, error, savingPageId, setPagePublished };
}

/**
 * Binds the real `/api/.../presentation` and `/api/.../themes/:id` clients — see
 * `theme-pages-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Pages.tsx` composes
 * this and a test composes {@link useThemePages} with `createFakeThemePagesPort`.
 */
export function useWiredThemePages(): ThemePagesController {
  return useThemePages(defaultThemePagesPort);
}
