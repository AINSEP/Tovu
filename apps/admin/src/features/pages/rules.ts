import type { RowMenuItem } from "@jini-ai/admin/react";

import type { AdminPost } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
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

/** The save-success message — the one piece of copy in `save` that depends on `canSaveHtml`, split
 *  out alongside {@link buildPageSavePlan} for the same reason. `t`/`locale` are threaded through
 *  rather than imported, matching every other pure function in this module. */
export function pageSaveSuccessMessage(t: (locale: string, key: string) => string, locale: string, canSaveHtml: boolean): string {
  return canSaveHtml
    ? t(locale, "Saved")
    : t(locale, "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.");
}

// ---------------------------------------------------------------------------
// Multi-column sort (2026-09-02) — mirrors `features/posts/rules.ts`'s own multi-column sort block
// exactly, same "twin screens" convention as the rest of this file (this file's own header). "My
// Pages" had no sort code at all before this pass, so every export below is new; the shape (types,
// function names swapped Post->Page, the same "updated" newest/oldest wording) is copied from Posts
// rather than invented independently, so an operator sees identical sort behavior on both screens.
// ---------------------------------------------------------------------------

/** Which end of `updatedAt` the Pages list's "Updated" column header sorts toward — same two-value
 *  shape as `posts/rules.ts`'s `PostUpdatedSortDirection`, kept as its own type per this file's
 *  existing "mirror, don't share" convention (see `PageRowMenuHandlers` above). */
export type PageUpdatedSortDirection = "newest" | "oldest";

/**
 * The Pages list's own "Updated" comparator — same `Date.parse` approach as `posts/rules.ts`'s
 * `sortPostsByUpdated` (a text column carries no schema guarantee against a future non-`Z`
 * UTC-offset value, which string-sorts wrong against `Z`-form values).
 *
 * @complexity Time: O(n log n) in `pages.length` (a single `Array#sort`); space: O(n) for the copy —
 * the input is never mutated.
 */
export function sortPagesByUpdated(pages: readonly AdminPost[], direction: PageUpdatedSortDirection): AdminPost[] {
  const sign = direction === "newest" ? -1 : 1;
  return [...pages].sort((a, b) => sign * (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)));
}

/**
 * The Updated column header button's accessible name when it IS the active sort — states the
 * current direction and what activating the button does next, mirroring `posts/rules.ts`'s
 * `updatedSortButtonLabel` verbatim.
 */
export function updatedSortButtonLabel(direction: PageUpdatedSortDirection): string {
  return direction === "newest"
    ? "Sorted by updated date, newest first. Activate to sort oldest first."
    : "Sorted by updated date, oldest first. Activate to sort newest first.";
}

/** The four Pages list columns with click-to-sort behavior. */
export type PageSortColumn = "title" | "slug" | "status" | "updated";

/** Ascending/descending — the direction for the three lexicographic columns (Title, Slug, Status).
 *  See `posts/rules.ts`'s `PostSortDirection` for why this stays distinct from
 *  {@link PageUpdatedSortDirection}. */
export type PageSortDirection = "asc" | "desc";

/** The Pages list's full sort state — exactly one column drives the sort at a time. `updated` still
 *  sorts via {@link sortPagesByUpdated}'s own "newest"/"oldest" vocabulary internally (see
 *  {@link sortPages}); `"desc"` maps to "newest first" so the default below reads as newest-first,
 *  matching `posts/rules.ts`'s own default. */
export interface PageSortState {
  column: PageSortColumn;
  direction: PageSortDirection;
}

/** The Pages list's default sort on first load — Updated, newest first, matching `posts/rules.ts`'s
 *  own `DEFAULT_POST_SORT` so switching between the two screens shows a consistent starting order. */
export const DEFAULT_PAGE_SORT: PageSortState = { column: "updated", direction: "desc" };

/**
 * The three lexicographic column comparators. `status` is exactly `"draft" | "published"`
 * (`post.ts`), so plain alphabetical order already equals domain order — no custom rank table
 * needed.
 *
 * @complexity Time: O(n log n) in `pages.length`; space: O(n) for the copy — never mutates the input.
 */
export function sortPagesByTitle(pages: readonly AdminPost[], direction: PageSortDirection): AdminPost[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...pages].sort((a, b) => sign * a.title.localeCompare(b.title));
}

/** @complexity Same as {@link sortPagesByTitle}, compared on `slug` instead of `title`. */
export function sortPagesBySlug(pages: readonly AdminPost[], direction: PageSortDirection): AdminPost[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...pages].sort((a, b) => sign * a.slug.localeCompare(b.slug));
}

/** @complexity Same as {@link sortPagesByTitle}, compared on `status` instead of `title`. */
export function sortPagesByStatus(pages: readonly AdminPost[], direction: PageSortDirection): AdminPost[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...pages].sort((a, b) => sign * a.status.localeCompare(b.status));
}

/**
 * Applies whichever column {@link PageSortState} currently names — the single dispatch point
 * `Pages.tsx` calls instead of switching on `sort.column` itself. `"updated"` translates the generic
 * `direction` into `sortPagesByUpdated`'s own "newest"/"oldest" vocabulary (`"desc"` = newest first).
 *
 * The `default` falls back to returning a shallow copy unsorted rather than throwing — same
 * defensive posture `posts/rules.ts`'s `sortPosts` takes, unreachable from any caller that stays
 * within `PageSortColumn`'s own type.
 *
 * @complexity Delegates to the named column's own comparator — see each for its own complexity.
 */
export function sortPages(pages: readonly AdminPost[], sort: PageSortState): AdminPost[] {
  switch (sort.column) {
    case "title":
      return sortPagesByTitle(pages, sort.direction);
    case "slug":
      return sortPagesBySlug(pages, sort.direction);
    case "status":
      return sortPagesByStatus(pages, sort.direction);
    case "updated":
      return sortPagesByUpdated(pages, sort.direction === "desc" ? "newest" : "oldest");
    default:
      return [...pages];
  }
}

/**
 * The header-click transition: activating the CURRENTLY active column's header toggles its
 * direction; activating any other column's header makes THAT column active at its default
 * direction, cancelling whatever was active before — only one column is ever active. Default
 * direction on switching to a new column is always its "first" end: ascending for the three
 * lexicographic columns, `"desc"` (newest-first) for Updated.
 *
 * @complexity Time/space: O(1).
 */
export function nextPageSortState(current: PageSortState, clickedColumn: PageSortColumn): PageSortState {
  if (current.column === clickedColumn) {
    return { column: clickedColumn, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { column: clickedColumn, direction: clickedColumn === "updated" ? "desc" : "asc" };
}

/** The caret glyph for a sortable column header — `aria-hidden`; the real accessible state lives on
 *  the button's own `aria-label` (see the label functions below, and `Pages.tsx`'s column defs).
 *  `"⇅"` — a neutral, ALWAYS-visible both-direction glyph — when `column` isn't the active sort, so
 *  an unsorted column still visibly reads as clickable rather than only revealing that fact after
 *  the first click; `"▲"`/`"▼"` once it is. */
export function pageSortCaretGlyph(column: PageSortColumn, sort: PageSortState): string {
  if (sort.column !== column) return " ⇅";
  return sort.direction === "asc" ? " ▲" : " ▼";
}

/**
 * Same accessible-name contract as `updatedSortButtonLabel` above (states the CURRENT sort state on
 * this column, and what activating the button does next), generalized to the three lexicographic
 * columns. Unlike `updatedSortButtonLabel`, this also covers "not currently the active column".
 *
 * `columnName` is a fixed English label supplied by the caller (`Pages.tsx`), not the translated
 * header text — matching `updatedSortButtonLabel`'s own precedent of hardcoded English regardless of
 * admin locale.
 *
 * @complexity Time/space: O(1).
 */
export function lexicalPageSortButtonLabel(columnName: string, column: PageSortColumn, sort: PageSortState): string {
  if (sort.column !== column) {
    return `Not sorted by ${columnName}. Activate to sort ascending.`;
  }
  return sort.direction === "asc"
    ? `Sorted by ${columnName}, ascending. Activate to sort descending.`
    : `Sorted by ${columnName}, descending. Activate to sort ascending.`;
}

/**
 * The Updated column header's accessible name for every sort state, including "not currently the
 * active column". Delegates to `updatedSortButtonLabel` for the "is active" half so that function's
 * own wording stays authoritative in one place.
 *
 * @complexity Time/space: O(1).
 */
export function updatedSortHeaderLabel(sort: PageSortState): string {
  if (sort.column !== "updated") {
    return "Not sorted by updated date. Activate to sort newest first.";
  }
  return updatedSortButtonLabel(sort.direction === "desc" ? "newest" : "oldest");
}
