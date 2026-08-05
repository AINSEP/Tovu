import type { RowMenuItem } from "@jini-ai/admin/react";

import type { AdminPost } from "../../lib/api";

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
export function pageRowMenuItems(page: AdminPost, handlers: PageRowMenuHandlers): RowMenuItem[] {
  const items: RowMenuItem[] = [{ key: "edit", label: "Edit", onSelect: () => handlers.onEdit(page) }];
  if (page.status === "published") {
    items.push({ key: "disable", label: "Disable", onSelect: () => handlers.onDisable(page) });
  }
  items.push({ key: "delete", label: "Delete", destructive: true, onSelect: () => handlers.onDelete(page) });
  return items;
}
