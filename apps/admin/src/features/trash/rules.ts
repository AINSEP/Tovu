import type { QueryKey } from "@/lib/fetch-query";
import type { AdminTrashItem, AdminTrashPurgeOutcome, AdminTrashRestoreOutcome } from "@/lib/api";
import { t } from "./trash-i18n";

/**
 * @file Pure decisions for the Trash screen — cache keys, the coverage sentence, selection
 * arithmetic and the per-outcome copy. No React, no `lib/api` call, no state.
 */

/** One resource: the page. Paged rows are accumulated locally, same as the comments queue. */
export const KEYS = {
  listRoot: ["trash", "list"] as QueryKey,
  list: (): QueryKey => ["trash", "list", "page-1"],
};

/**
 * The Trash's name on `lib/content-refresh-bus.ts`.
 *
 * Agent-writable: `content_post_delete`, `comments_trash_comment`, `media_trash_asset` and
 * `redirects_tombstone` all write an index row, and `trash_restore_item` removes one. Without this
 * subscription an operator who asks the assistant to delete a post watches the Trash keep saying it
 * is empty.
 */
export const TRASH_RESOURCE = "trash";

/**
 * The kinds phase 1 actually collects, in the order the coverage line names them.
 *
 * Kept here rather than derived from whatever rows happen to be on screen: the sentence has to be
 * true on an EMPTY Trash, which is exactly when a user who just deleted a widget is looking for it.
 */
export const COVERED_SECTIONS = ["Posts", "Comments", "Media", "Redirects"] as const;

/**
 * The line the screen must show, per design §4.2, and NOT behind a disclosure.
 *
 * With four of seven deletable kinds collected here, a user who deletes a widget, does not find it
 * in the Trash and is told nothing will conclude it is unrecoverable. Saying which sections are
 * covered is cheaper than that mistake.
 */
export function coverageLine(locale: string): string {
  return t(
    locale,
    "Covers Posts, Comments, Media and Redirects. Widgets, Collection entries and Theme files are deleted in their own sections and aren't collected here yet."
  );
}

/** A human label for a row's kind. Unknown kinds print as themselves rather than being hidden —
 *  the server already dropped the rows this operator may not see. @complexity O(1). */
export function entityTypeLabel(locale: string, entityType: string): string {
  const known: Record<string, string> = {
    post: "Post",
    comment: "Comment",
    media: "Media",
    redirect: "Redirect",
  };
  const label = known[entityType];
  return label ? t(locale, label) : entityType;
}

/** Who deleted it — the plugin when an agent did, otherwise the principal. @complexity O(1). */
export function actorLabel(item: AdminTrashItem): string {
  return item.actorPluginId ?? item.actorPrincipalId;
}

/**
 * Toggles one row in the selection.
 *
 * Returns a new Set rather than mutating, so React sees a changed identity.
 *
 * @complexity O(n) in the selection's size.
 */
export function toggleSelection(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Select-all / select-none over the rows currently on screen.
 *
 * Deliberately scoped to the visible rows: "select all" cannot reach rows the operator has not
 * loaded, because permanently deleting something you never saw listed is not a thing this screen
 * should make one click away.
 *
 * @complexity O(n) in the row count.
 */
export function selectionAfterSelectAll(items: readonly AdminTrashItem[], allSelected: boolean): Set<string> {
  return allSelected ? new Set<string>() : new Set(items.map((item) => item.id));
}

/** @complexity O(n). */
export function allVisibleSelected(items: readonly AdminTrashItem[], selected: ReadonlySet<string>): boolean {
  return items.length > 0 && items.every((item) => selected.has(item.id));
}

/**
 * What to tell the operator after a per-item batch.
 *
 * Both endpoints answer 200 with per-item outcomes even when every item failed — the request WAS
 * understood, and the reasons are the answer — so a screen that only looked at the status code
 * would report a silent success. This turns the report into one sentence.
 *
 * @complexity O(n) in the result count.
 */
export function describeRestoreReport(
  locale: string,
  report: { restored: number; results: { outcome: AdminTrashRestoreOutcome }[] }
): string {
  return describeBatch(locale, report.restored, report.results.length, "restored");
}

/** @complexity O(n) in the result count. */
export function describePurgeReport(
  locale: string,
  report: { purged: number; results: { outcome: AdminTrashPurgeOutcome }[] }
): string {
  return describeBatch(locale, report.purged, report.results.length, "deleted");
}

/**
 * The shared sentence: how many of how many, and a named reason when none succeeded.
 *
 * @complexity O(1).
 */
function describeBatch(locale: string, succeeded: number, total: number, verb: "restored" | "deleted"): string {
  if (succeeded === total) {
    return verb === "restored" ? t(locale, "Restored.") : t(locale, "Deleted permanently.");
  }
  if (succeeded === 0) {
    return verb === "restored" ? t(locale, "Nothing was restored.") : t(locale, "Nothing was deleted.");
  }
  return verb === "restored"
    ? `${t(locale, "Restored.")} ${succeeded}/${total}`
    : `${t(locale, "Deleted permanently.")} ${succeeded}/${total}`;
}

/**
 * Why one item did not move, in the operator's words.
 *
 * `forbidden` gets a distinct sentence on purpose: "it failed" and "you are not allowed to do that"
 * ask for different next steps.
 *
 * @complexity O(1).
 */
export function describeOutcome(locale: string, outcome: AdminTrashRestoreOutcome | AdminTrashPurgeOutcome): string {
  switch (outcome) {
    case "restored":
      return t(locale, "Restored.");
    case "purged":
      return t(locale, "Deleted permanently.");
    case "forbidden":
      return t(locale, "You do not have permission for this item.");
    case "not-found":
      return t(locale, "It is no longer in the Trash.");
    case "already-gone":
      return t(locale, "It was already gone.");
    case "version-changed":
      return t(locale, "It changed since it was deleted. Reload and try again.");
    case "adapter-unavailable":
      return t(locale, "Its section is not installed, so it cannot be handled here.");
    default:
      return outcome;
  }
}
