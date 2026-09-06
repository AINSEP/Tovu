import type { DataTableSortDirection, DataTableSortState } from "@jini-ai/admin/core";
import type { RowMenuItem } from "@jini-ai/admin/react";

import type { AdminPost } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import type { StandingDraftAutosaveInput } from "../../hooks/use-standing-draft-autosave.hooks";
import { formatRelativeMinutesAgo } from "../../lib/format-timestamp";
import { PAGES_DICT } from "./pages-i18n";
import type { ThemePageRow } from "./hooks/use-theme-pages.hooks";

/**
 * @file Pure logic for the `pages` feature — everything that computes a value rather than
 * rendering one.
 *
 * Mirrors `features/posts/rules.ts` exactly, since `Pages.tsx` is `Posts.tsx`'s twin (same
 * `RowMenu`-building logic, same "Disable" omission rule) backed by the pages-filtered endpoints.
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
 * `apps/website/src/platform/routing/routing.ts`'s `postPublicPath` exactly (same one-line
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
export function pagePublicPath(slug: string): string {
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

/**
 * The in-SPA path to a page's admin editor — `/pages/<handle>`, the bare route path `navigate()`
 * (`lib/router.ts`) expects, or that `adminHref()` (same module) turns into a real `<a href>`.
 *
 * **Prefers the slug; falls back to the id only when the slug can't be a path segment at all** —
 * today that is exactly the literal root slug `"/"` (`post.ts`'s `ROOT_SLUG`, gated to
 * `kind: "page"`; every other slug is validated against `isValidSlugFormat`'s
 * lowercase-letters/numbers/dashes pattern, so `"/"` is the only slug value a `/` can ever appear
 * in). The page-editor route is registered as `/:slug` — one path segment (`panels.tsx`) — and a
 * value containing `/` can never match that pattern, which is exactly the bug `45101306` hit and
 * fixed by switching to id-always. This restores the slug for every ordinary page while keeping
 * that fix for the one page it targeted: `getAdminPostByIdOrSlug`
 * (`apps/website/src/features/post/post.ts`) resolves either handle server-side (slug checked
 * first, id as the fallback), so both forms are lossless.
 *
 * Deliberately returns the bare route path rather than a full href or two id/slug-flavored
 * variants — a caller building a real `<a href>` wraps this in `adminHref()`; a caller driving the
 * SPA router passes it straight to `navigate()`. Baking a prefix in here would make it wrong for
 * whichever caller didn't want it; the previous per-call-site `` `/pages/${page.slug}` `` /
 * `` `/pages/${page.id}` `` templates are exactly the caller-side duplication this function replaces.
 *
 * @complexity O(1).
 */
export function pageAdminPath(page: PageAdminHandle): string {
  return `/pages/${page.slug === "/" ? page.id : page.slug}`;
}

/** The callbacks a row menu needs. Passed in rather than imported so this module stays free of
 *  state and navigation, and so a test can assert exactly which one a given row wires up — same
 *  shape as `posts/rules.ts`'s `PostRowMenuHandlers`. */
export interface PageRowMenuHandlers {
  onEdit: (page: AdminPost) => void;
  onDisable: (page: AdminPost) => void;
  onDelete: (page: AdminPost) => void;
}

/**
 * The row-action menu for one page.
 *
 * The branch is the reason this is exported: **"Disable" is omitted entirely for a page that is
 * already a draft**, rather than rendered disabled — same deliberate choice as `posts/rules.ts`'s
 * `postRowMenuItems`, and a claim worth a test, which it cannot have while it is a closure inside a
 * `DataTable` cell.
 *
 * "Delete" is marked `destructive` and only OPENS the confirmation; the delete itself is
 * `usePages().removePage`, gated on `ConfirmDialog`.
 *
 * @complexity Time/space: O(1) — at most three entries, no iteration.
 * @overallScore 100
 */
export function pageRowMenuItems(page: AdminPost, handlers: PageRowMenuHandlers, locale: string): RowMenuItem[] {
  const t = (key: string): string => PAGES_DICT[locale]?.[key] ?? key;
  const items: RowMenuItem[] = [{ key: "edit", label: t("Edit"), onSelect: () => handlers.onEdit(page) }];
  if (page.status === "published") {
    items.push({ key: "disable", label: t("Disable"), onSelect: () => handlers.onDisable(page) });
  }
  items.push({ key: "delete", label: t("Delete"), destructive: true, onSelect: () => handlers.onDelete(page) });
  return items;
}

/** The callbacks a Theme Page row's menu needs. Passed in rather than imported, same reasoning as
 *  {@link PageRowMenuHandlers} above — in particular, `onEdit` takes a bare `pageId` rather than
 *  building the Theme Studio href itself, so this module stays free of navigation: the caller
 *  (`ThemePagesTab.tsx`) already holds the narrowed, non-null `themeId` `themeStudioHref` needs, and
 *  is the one place that calls it. */
export interface ThemePageRowMenuHandlers {
  onOpenDetails: (pageId: string) => void;
  onEdit: (pageId: string) => void;
}

/**
 * The row-action menu for one Theme Page row — pulled out of `ThemePagesTab.tsx`'s `DataTable`
 * cell for the same reason {@link pageRowMenuItems} was: a claim worth a test, which it cannot have
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
 * Takes an already-bound {@link Translate} rather than a raw `locale`, unlike {@link pageRowMenuItems}
 * — `ThemePagesTab.tsx`'s own helpers (`themePagePublishState`, `lockedPublishReason`, …) all take
 * `t: Translate` already, and this row menu is built inside that same component, so matching ITS
 * established convention avoids threading a second, redundant `locale` value through the same tree.
 *
 * @complexity O(1) — exactly two entries, no iteration.
 */
export function themePageRowMenuItems(row: ThemePageRow, handlers: ThemePageRowMenuHandlers, t: Translate): RowMenuItem[] {
  return [
    { key: "details", label: t("Details"), onSelect: () => handlers.onOpenDetails(row.pageId) },
    { key: "edit", label: t("Edit"), onSelect: () => handlers.onEdit(row.pageId) },
  ];
}

/** What `usePageEditor`'s `save` sends to the two write routes, and whether the HTML route applies
 *  at all — see `use-page-editor.hooks.ts`'s own `save` for the full "why two routes" reasoning
 *  (`updatePageHtml` is the bespoke-HTML writer and its first call on a still-`doc`-format Page
 *  converts it, so it must only fire for a Page already in `html` format; `updatePost` needs a
 *  round-tripped `bodyJson` for any Page NOT in `html` format, since that field is meaningless once
 *  an html row exists). */
export interface PageSavePlan {
  canSaveHtml: boolean;
  statusToWrite: "draft" | "published";
  updatePostPayload: {
    title: string;
    slug: string;
    status: "draft" | "published";
    templateChoice: string | null;
    bodyJson?: Record<string, unknown>;
  };
}

/** The subset of a loaded `AdminPost` {@link buildPageSavePlan} actually reads — kept narrow
 *  rather than importing the full `AdminPost` type, so a test can pass a bare literal. Field types
 *  mirror `AdminPost`'s own exactly (`bodyFormat` optional, `bodyJson` a plain record) so a real
 *  `AdminPost` is always assignable here without a cast. */
interface SavablePage {
  bodyFormat?: "doc" | "html";
  bodyJson: Record<string, unknown>;
}

/**
 * `save`'s own decision, pulled out to a top-level pure function per the 2026-08-12
 * complexity-ceiling pass: what to send `updatePost`, and whether `updatePageHtml` fires at all.
 * `save` itself keeps only the two `await`s, the `setState` calls, and the try/catch/finally — the
 * genuinely effectful part that has to stay.
 *
 * @complexity Time/space: O(1).
 */
export function buildPageSavePlan(
  page: SavablePage,
  form: { title: string; slug: string; status: "draft" | "published"; templateChoice: string | null },
  nextStatus?: "draft" | "published"
): PageSavePlan {
  const canSaveHtml = page.bodyFormat === "html";
  const statusToWrite = nextStatus ?? form.status;
  return {
    canSaveHtml,
    statusToWrite,
    updatePostPayload: {
      title: form.title,
      slug: form.slug,
      status: statusToWrite,
      templateChoice: form.templateChoice,
      ...(canSaveHtml ? {} : { bodyJson: page.bodyJson }),
    },
  };
}

/** The subset {@link buildPageAutosaveDraft} reads — {@link SavablePage} plus `version`, which the
 *  draft's `baseVersion` is captured from (see `PostRepoPort.writeAutosave`'s own server-side doc
 *  for why that field matters: it's what lets a stale autosave be rejected rather than silently
 *  clobbering a newer real save). */
interface AutosavablePage extends SavablePage {
  version: number;
}

/**
 * What to send `putAutosave` for the CURRENT working copy — mirrors {@link buildPageSavePlan}'s own
 * doc-vs-html split. A doc-format Page has no editable body in this editor (see `usePageEditor`'s
 * load effect, and {@link buildPageSavePlan}'s identical reasoning), so its `bodyJson` round-trips
 * unchanged — the same inert-but-required placeholder a real Save already sends for that case.
 *
 * @complexity Time/space: O(1).
 */
export function buildPageAutosaveDraft(
  page: AutosavablePage,
  form: { title: string; slug: string; html: string }
): StandingDraftAutosaveInput {
  if (page.bodyFormat === "html") {
    return { bodyFormat: "html", bodyHtml: form.html, title: form.title, slug: form.slug, baseVersion: page.version };
  }
  return { bodyFormat: "doc", bodyJson: page.bodyJson, title: form.title, slug: form.slug, baseVersion: page.version };
}

/** Whether a recovered standing draft was captured before a real Save/Publish since superseded it —
 *  see `PostRepoPort.writeAutosave`'s own server-side doc for why `baseVersion` is the signal.
 *  Drives the recovery banner's "from N minutes ago" vs "from before a newer save" wording. */
export function isAutosaveDraftStale(draftBaseVersion: number, currentVersion: number): boolean {
  return draftBaseVersion !== currentVersion;
}

/** The recovery banner's own message — pulled out of `PageEditor.tsx` so the component stays markup
 *  only (`use-page-editor.hooks.ts`'s file header's own rule). `nowMs` is threaded through rather
 *  than read internally, same reasoning `formatRelativeMinutesAgo` itself documents. */
export function pageAutosaveBannerMessage(savedAt: string, nowMs: number, stale: boolean): string {
  const when = formatRelativeMinutesAgo(savedAt, nowMs);
  return stale ? `Unsaved changes from before a newer save (captured ${when})` : `Unsaved changes from ${when}`;
}

/** The save-success message — the one piece of copy in `save` that depends on `canSaveHtml`, split
 *  out alongside {@link buildPageSavePlan} for the same reason. `t`/`locale` are threaded through
 *  rather than imported, matching every other pure function in this module. */
export function pageSaveSuccessMessage(t: (locale: string, key: string) => string, locale: string, canSaveHtml: boolean): string {
  return canSaveHtml
    ? t(locale, "Saved")
    : t(locale, "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.");
}

// ---------------------------------------------------------------------------
// Column sort (2026-09-02) — mirrors `features/posts/rules.ts`'s own column-sort block exactly, same
// "twin screens" convention as the rest of this file (this file's own header). "My Pages" had no
// sort code at all before this pass; migrated onto `DataTable`'s own shared sort mechanism the same
// day this landed, so it never shipped its own hand-rolled dispatcher/caret/next-state logic — see
// `posts/rules.ts`'s identical section for the full rationale. Only the domain-specific pieces live
// here: each column's ascending comparator, the Updated column's non-default starting direction, and
// every column's accessible-name phrasing.
// ---------------------------------------------------------------------------

/** The Pages list's default sort on first load — Updated, newest first, matching `posts/rules.ts`'s
 *  own `DEFAULT_POST_SORT` so switching between the two screens shows a consistent starting order. */
export const DEFAULT_PAGE_SORT: DataTableSortState = { column: "updated", direction: "desc" };

/** `status` is exactly `"draft" | "published"` (`post.ts`), so plain alphabetical order already
 *  equals domain order — no custom rank table needed. Ascending-only, matching
 *  `DataTableColumnSort.compare`'s own contract: `DataTable` negates this for `"desc"`. */
export function comparePagesByTitle(a: AdminPost, b: AdminPost): number {
  return a.title.localeCompare(b.title);
}

/** @see comparePagesByTitle — same contract, compared on `slug` instead of `title`. */
export function comparePagesBySlug(a: AdminPost, b: AdminPost): number {
  return a.slug.localeCompare(b.slug);
}

/** @see comparePagesByTitle — same contract, compared on `status` instead of `title`. */
export function comparePagesByStatus(a: AdminPost, b: AdminPost): number {
  return a.status.localeCompare(b.status);
}

/**
 * Ascending order = oldest-first; `DataTable` negates it for `"desc"` (newest-first), which is also
 * this column's own starting direction (its `defaultDirection` in `Pages.tsx`'s column definition) —
 * same reasoning as `posts/rules.ts`'s `comparePostsByUpdated`. `Date.parse`, not a string compare —
 * `updatedAt` is ISO-8601 **text** with no schema guarantee against a future non-`Z` UTC-offset
 * value, which string-sorts wrong against `Z`-form values.
 */
export function comparePagesByUpdated(a: AdminPost, b: AdminPost): number {
  return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
}

/**
 * The accessible name for a lexicographic column's (Title/Slug/Status) sort control, in every state
 * `DataTable` can ask for — mirrors `posts/rules.ts`'s `postColumnSortLabel` verbatim. `direction` is
 * `null` when a different column is currently active — `DataTable` resolves that itself.
 *
 * `columnName` is a fixed English label supplied by the caller (`Pages.tsx`), not the translated
 * header text — matching this feature's pre-existing precedent of hardcoded English regardless of
 * admin locale.
 *
 * @complexity Time/space: O(1).
 */
export function pageColumnSortLabel(columnName: string, direction: DataTableSortDirection | null): string {
  if (direction === null) return `Not sorted by ${columnName}. Activate to sort ascending.`;
  return direction === "asc"
    ? `Sorted by ${columnName}, ascending. Activate to sort descending.`
    : `Sorted by ${columnName}, descending. Activate to sort ascending.`;
}

/** Same contract as {@link pageColumnSortLabel}, phrased in the Updated column's own "newest"/
 *  "oldest" vocabulary rather than generic "ascending"/"descending" — mirrors `posts/rules.ts`'s
 *  `updatedColumnSortLabel` verbatim. */
export function updatedPageColumnSortLabel(direction: DataTableSortDirection | null): string {
  if (direction === null) return "Not sorted by updated date. Activate to sort newest first.";
  return direction === "desc"
    ? "Sorted by updated date, newest first. Activate to sort oldest first."
    : "Sorted by updated date, oldest first. Activate to sort newest first.";
}
