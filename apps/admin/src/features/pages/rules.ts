import type { RowMenuItem } from "@jini-ai/admin/react";

import type { CanvasStyling } from "@jini-ai/ui/html-editor";

import { THEME_DEFAULT_SENTINEL, type PageEditorView } from "@jini-ai/admin/pages/page-editor-rules";

import { VERSION_CONFLICT_CODE, type SaveConflict } from "../../lib/version-conflict";
import type { ThemePageRow } from "./hooks/use-theme-pages.hooks";
import { STATIC_TIER_PAGE_SHELL_TEMPLATES, type ThemeCanvasStylingState } from "./hooks/use-theme-canvas-styling.hooks";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file Pure logic for the `pages` feature — everything that computes a value rather than
 * rendering one.
 *
 * Mirrors `features/posts/rules.ts` exactly, since `Pages.tsx` is `Posts.tsx`'s twin (same
 * `RowMenu`-building logic, same Publish/Unpublish status-flip rule) backed by the pages-filtered
 * endpoints.
 * The list screen's own row-menu builders (`pageRowMenuItems`, `buildPageRowMenuHandleMap`) moved
 * with the list to `@jini-ai/admin/pages/pages-list-rules`; everything here is also read by the page
 * editor or the Theme Pages tab.
 * The editor-only rules (save plan, autosave draft, picker sentinel, save/conflict messages, preview
 * sandbox, dirty-guard baseline) moved to `@jini-ai/admin/pages/page-editor-rules`; what stays here is
 * the link rules, the theme-backed rules and the version-conflict aliases over `lib/version-conflict`.
 * The bar for landing here is "does it compute something", not "is it rendered" — `pageRowMenuItems`
 * was a closure inside a `DataTable` cell, reachable only by rendering a table and opening a
 * popover, which is how its `page.status` conditional ended up permanently untested.
 */

/**
 * This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s `TAXONOMY_RESOURCE`
 * for why this is a plain colocated constant rather than a shared registry. `pages_write_html`
 * (`apps/website/src/features/pages/agent-tools.ts`) is agent-callable, so `use-pages.hooks.ts` needs
 * the same "an assistant write shows up without a reload" fix `use-taxonomy.hooks.ts` shipped first,
 * for the same reason its twin needed it — see `posts/rules.ts`'s `POSTS_RESOURCE`, the reported
 * bug's own screen (an operator asked the assistant to translate-and-publish a POST).
 */
export const PAGES_RESOURCE = "pages";

/**
 * A page's public path on the live site, derived from its `slug` — mirrors
 * `@jini-ai/cms/routing`'s `postPublicPath` exactly (same one-line
 * `"/" -> "/"`, everything else -> `/${slug}` rule), re-implemented here rather than imported
 * because `apps/admin` is a separately deployed SPA package with no dependency on
 * `apps/website`'s server source.
 *
 * Exists because a Page can now claim the literal root slug `"/"` (`apps/website/src/features/
 * post/post.ts`'s `ROOT_SLUG`, gated to `kind: "page"`), which a naive `/${slug}` template
 * doubles into `"//"` — a broken link both as an href and as the visible text in `Pages.tsx`'s
 * Slug column. `Posts.tsx` has no equivalent call because a Post can never hold `ROOT_SLUG`.
 *
 * @complexity O(1).
 */
export function pagePublicPath({ slug }: { slug: string }, _options = {}): string {
  return slug === "/" ? "/" : `/${slug}`;
}

/** The subset of a page {@link pageAdminPath} reads — kept narrow, same reasoning as
 *  {@link SavablePage} below, so a collision record (`ThemePageSlugCollision`/
 *  `ThemeExploreSlugCollision`, both `{ id, slug, title, kind }`) satisfies it structurally with no
 *  cast, alongside a real `AdminPost`. */
export interface PageAdminHandle {
  id: string;
  slug: string;
}

/** Readable admin alias for the root page; a real `home` slug uses its id to avoid a collision. */
export const HOME_PAGE_HANDLE = "home";

/**
 * The in-SPA path to a page's admin editor — `/pages/<handle>`, the bare route path `navigate()`
 * (`lib/router.ts`) expects, or that `adminHref()` (same module) turns into a real `<a href>`.
 *
 * Prefers the slug, with `home` as the readable alias for the literal root slug `"/"`
 * (`post.ts`'s `ROOT_SLUG`, gated to `kind: "page"`). The page-editor route is registered as
 * `/:slug` — one path segment (`panels.tsx`) — so `/` cannot match it, the bug `45101306` fixed
 * by switching to id-always. The editor maps `home` back to `/` before fetching. The alias wins:
 * a real page whose legal slug is `home` uses its id, preserving access without reserving a
 * public slug. `getAdminPostByIdOrSlug` (`apps/website/src/features/post/post.ts`) resolves an
 * ordinary slug or id server-side (slug checked first, id as the fallback).
 *
 * Deliberately returns the bare route path rather than a full href or two id/slug-flavored
 * variants — a caller building a real `<a href>` wraps this in `adminHref()`; a caller driving the
 * SPA router passes it straight to `navigate()`. Baking a prefix in here would make it wrong for
 * whichever caller didn't want it; the previous per-call-site `` `/pages/${page.slug}` `` /
 * `` `/pages/${page.id}` `` templates are exactly the caller-side duplication this function replaces.
 *
 * @complexity O(1).
 */
export function pageAdminPath(page: PageAdminHandle, _optional: Record<string, never> = {}): string {
  if (page.slug === "/") return `/pages/${HOME_PAGE_HANDLE}`;
  return `/pages/${page.slug === HOME_PAGE_HANDLE ? page.id : page.slug}`;
}

/** The callbacks a Theme Page row's menu needs. Passed in rather than imported, same reasoning as
 *  `PageRowMenuHandlers` (`@jini-ai/admin/pages/pages-list-rules`) — in particular, `onEdit` takes a `pageId` rather than
 *  building the Theme Studio href itself, so this module stays free of navigation: the caller
 *  (`ThemePagesTab.tsx`) already holds the narrowed, non-null `themeId` `themeStudioHref` needs, and
 *  is the one place that calls it. */
export interface ThemePageRowMenuHandlers {
  onOpenDetails: (pageId: string) => void;
  onEdit: (required: { pageId: string }) => void;
}

/**
 * The row-action menu for one Theme Page row — pulled out of `ThemePagesTab.tsx`'s `DataTable`
 * cell for the same reason `pageRowMenuItems` (`@jini-ai/admin/pages/pages-list-rules`) was: a claim worth a test, which it cannot have
 * while it is a closure inside a table cell reachable only by rendering and opening a popover.
 *
 * A theme page has no `PostRecord` behind it (see `Pages.tsx`'s own header on this tab's history),
 * so there is nothing here to disable or delete — just `Details` (the row's full facts, opened in
 * `ThemePageDetailsModal.tsx`) and `Edit` (the same Theme Studio destination the table's own Theme
 * Studio column links to, listed directly under `Details` per the 2026-08-31 owner request that
 * moved it here from the modal's own footer — see `ThemePageDetailsModal.tsx`'s own header, PART 3,
 * for that history). Kept as its own function (rather than a bare inline array at the call site) so
 * a future third action lands here, not as a second ad hoc array shape.
 *
 * Takes an already-bound {@link Translate} rather than a raw `locale`, unlike `pageRowMenuItems`
 * — `ThemePagesTab.tsx`'s own helpers (`themePagePublishState`, `lockedPublishReason`, …) all take
 * `t: Translate` already, and this row menu is built inside that same component, so matching ITS
 * established convention avoids threading a second, redundant `locale` value through the same tree.
 *
 * @complexity O(1) — exactly two entries, no iteration.
 */
export function themePageRowMenuItems({ row, handlers, t }: { row: ThemePageRow; handlers: ThemePageRowMenuHandlers; t: Translate }, _options = {}): RowMenuItem[] {
  return [
    { key: "details", label: t("Details"), onSelect: () => handlers.onOpenDetails(row.pageId) },
    { key: "edit", label: t("Edit"), onSelect: () => handlers.onEdit({ pageId: row.pageId }) },
  ];
}


/**
 * What the Pages template `<select>` should show for a Page's `templateChoice` (bare-page ruling
 * 2026-09-23, S6). Before this ruling, `value={templateChoice ?? ""}` was enough because `null` and
 * `""` rendered identically (both fell back to the theme's page shell) — showing `null` as
 * `""`/"No template chosen" was a harmless simplification. Now they diverge: `""` is a bare page (no
 * theme chrome at all) and `null` still renders the theme's own page shell ("Theme default"), so
 * displaying a `null` Page as `""` would claim a render it does not do.
 *
 * `null` maps to whichever of {@link STATIC_TIER_PAGE_SHELL_TEMPLATES} (`pages-default.html`, then
 * the legacy `page-shell.html`) `availableTemplates` actually lists — the REAL filename the live
 * render already resolves through (`resolveStaticTierPageShellFallback`,
 * `apps/website/src/features/theme/static-render.ts`), so picking it back explicitly in the UI is a
 * no-op. When the active theme ships neither name (a declarative/handlebars theme, or a static theme
 * with no page shell at all), there is no real filename to show, so this returns
 * {@link THEME_DEFAULT_SENTINEL} instead — the one case the picker renders one extra, synthetic
 * "Theme default" option for. {@link pickerValueToChoice} maps it back to `null`.
 *
 * `""` and a real filename pass straight through unchanged — the picker's value already IS the
 * stored `templateChoice` for those two cases; only `null` needs translating into something a
 * `<select>` can render as a real option.
 *
 * @complexity O(n) in `availableTemplates.length` — one bounded scan of the two shell candidates.
 */
export function pagePickerValue({ templateChoice, availableTemplates }: { templateChoice: string | null; availableTemplates: string[] }, _options = {}): string {
  if (templateChoice !== null) return templateChoice;
  const shipped = STATIC_TIER_PAGE_SHELL_TEMPLATES.find((name) => availableTemplates.includes(name));
  return shipped ?? THEME_DEFAULT_SENTINEL;
}

/**
 * The server's machine-readable `code` for "the version you were editing has been superseded"
 * (`server/inbound/admin-http/routes/posts/update.ts`'s `sendPostUpdateError`). Named here rather
 * than string-matched at the call site because that route returns TWO different 409s from the same
 * `PostConflictError` hierarchy: a slug-uniqueness collision (fix the slug and resend) and this one
 * (do NOT resend — resending is what erases the other operator's work). Only this one carries a
 * `code`, which is exactly what makes them tellable apart.
 *
 * A feature-local name for `lib/version-conflict.ts`'s shared `VERSION_CONFLICT_CODE`, which
 * `features/posts/rules.ts`'s `POST_VERSION_CONFLICT_CODE` aliases too. The shared one lives in
 * `lib/`, so the no-cross-feature-import boundary (`lib/` hosts the shared pieces) still holds.
 * Pages and Posts share one server route (`PUT /posts/:id`, kind-blind), so the two names describe
 * the same wire value on purpose.
 */
export const PAGE_VERSION_CONFLICT_CODE = VERSION_CONFLICT_CODE;

/** A rejected save whose basis version had already been superseded — {@link readVersionConflict}'s
 *  output, and the editor's own conflict state. Mirrors `posts/rules.ts`'s `PostSaveConflict`. */
export type PageSaveConflict = SaveConflict;

/**
 * Which surface the editor's main pane shows, as a discriminated value rather than a chain of
 * nested ternaries inside `PageEditor.tsx`'s JSX (2026-09-06 complexity-ceiling pass — that chain
 * was 6 of `PageEditor`'s 10 cognitive-complexity points against a ceiling of 9, and tripped
 * `sonarjs/no-nested-conditional` twice on top of it).
 *
 * The `interactive` case CARRIES the resolved {@link CanvasStyling} rather than leaving the caller
 * to re-narrow `ThemeCanvasStylingState` itself. That is the whole reason this returns a union
 * instead of a bare `"preview" | "html" | ...` string: the narrowing happens once, here, where
 * TypeScript can see it, so the component never needs a cast to reach `styling` — and a stringly
 * result would have forced exactly that (or a duplicated `status === "pending"` check in the view,
 * which is the tangle this replaces).
 *
 * `interactive-pending` is a real state, not a loading placeholder that could be skipped:
 * `InteractiveHtmlEditor` reads its canvas styling ONCE at mount and never reacts to a later value,
 * so mounting it before the theme's token files settle produces a permanently unstyled canvas. See
 * `PageEditorController.canvasStyling`'s own doc.
 *
 * @complexity Time/space: O(1) — three ordered checks, no iteration.
 */
export type PageEditorSurface =
  | { kind: "preview" }
  | { kind: "html" }
  | { kind: "interactive-pending" }
  | { kind: "interactive"; styling: CanvasStyling };

export function pageEditorSurface({ view, canvasStyling }: { view: PageEditorView; canvasStyling: ThemeCanvasStylingState }, _optional: Record<string, never> = {}): PageEditorSurface {
  if (view === "preview") return { kind: "preview" };
  if (view === "html") return { kind: "html" };
  if (canvasStyling.status === "pending") return { kind: "interactive-pending" };
  return { kind: "interactive", styling: canvasStyling.styling };
}
