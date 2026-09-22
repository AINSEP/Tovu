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
 * The line the screen must show, per design §4.2, and NOT behind a disclosure.
 *
 * Updated 2026-09-21: the registry now covers every deletable kind except Collection entries and
 * Theme files (T1/T5/T6/T7 land the rest of this wave's registry entries and admin delete buttons),
 * so the sentence no longer enumerates covered sections — it names the two real exceptions instead.
 * A user who deletes something and does not find it here, and is told nothing, would otherwise
 * conclude it is unrecoverable; naming the exceptions is cheaper than that mistake.
 */
export function coverageLine(locale: string): string {
  return t(locale, "Deleted items from every section appear here, except Collection entries and Theme files.");
}

/** A human label for a row's kind. Unknown kinds print as themselves rather than being hidden —
 *  the server already dropped the rows this operator may not see. @complexity O(1). */
export function entityTypeLabel(locale: string, entityType: string): string {
  const known: Record<string, string> = {
    post: "Post",
    comment: "Comment",
    media: "Media",
    redirect: "Redirect",
    form: "Form",
    form_submission: "Form submission",
    widget: "Widget",
    menu: "Menu",
    term: "Term",
    taxonomy: "Taxonomy",
  };
  const label = known[entityType];
  return label ? t(locale, label) : entityType;
}

/**
 * Who deleted it, in words an operator can read — never the raw principal id.
 *
 * Priority: the plugin/agent id when an agent did it (already a readable slug, e.g. `"forms"`),
 * else the username the server resolved for `actorPrincipalId`. Below that, two DIFFERENT server
 * answers must not collapse into one label: an explicit `actorUsername: null` means the server
 * looked the id up and found no user record (account removed, or a non-user system principal) —
 * `"Deleted user"` is true there. `actorUsername` being absent from the response entirely (an
 * older server build that predates username resolution) means the server never told us anything,
 * so claiming the account was deleted would be false — `"Unknown"` instead. Conflating the two
 * showed every row as "Deleted user", including the owner's own account, against a server that
 * simply hadn't picked up the field yet (2026-09-21).
 *
 * `actorIsSystem` adds a fourth, distinct state (2026-09-21): the 11 legacy widgets adopted into
 * the Trash at boot (`features/widgets/write-service.ts`'s `ADOPTION_ACTOR`) are recorded with a
 * `system` principal, not a real user — no user account can ever hold that id, so the server can
 * tell the two apart and this label must too. Checked BEFORE the username branches, so a system
 * actor never falls through to "Deleted user": that label means only "a real account that no
 * longer exists".
 *
 * @complexity O(1).
 */
export function actorLabel(locale: string, item: AdminTrashItem): string {
  if (item.actorPluginId != null) return item.actorPluginId;
  if (item.actorIsSystem) return t(locale, "System");
  if (item.actorUsername === undefined) return t(locale, "Unknown");
  return item.actorUsername ?? t(locale, "Deleted user");
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
