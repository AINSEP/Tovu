import type { RowMenuItem } from "@jini-ai/admin/react";

import type { AdminWebhookDelivery, AdminWebhookSubscription } from "../../lib/api";
import { formatTimestamp } from "../../lib/format-timestamp";

/**
 * @file Pure logic for the `integrations` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the same convention `features/posts/rules.ts` establishes for this app: the bar for
 * landing here is "does it compute something", not "is it rendered". The row-action menu below
 * used to be an array literal built inline inside a `DataTable` cell — logic reachable only by
 * rendering a table and opening a popover, which is how its `status === "paused"` label branch
 * ended up untested.
 */

/** Parses the comma-separated topics field into a trimmed, blank-free list.
 *
 * @complexity Time: O(n) in the length of `raw`; space: O(k) for the k resulting topics.
 * @overallScore 100
 */
export function parseTopics(raw: string): string[] {
  return raw
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

/** The callbacks a webhook subscription's row menu needs. Passed in rather than imported so this
 *  module stays free of state and navigation, and so a test can assert exactly which one a given
 *  row wires up — same shape as `posts/rules.ts`'s `PostRowMenuHandlers`. */
export interface IntegrationRowMenuHandlers {
  onTogglePause: (subscription: AdminWebhookSubscription) => void;
  onDelete: (subscription: AdminWebhookSubscription) => void;
}

/**
 * The row-action menu for one webhook subscription.
 *
 * The branch is the reason this is exported: the "Pause"/"Resume" label depends on
 * `subscription.status`, and that was previously only reachable by rendering the table and
 * opening the menu. "Delete" is marked `destructive` and only OPENS the confirmation; the delete
 * itself is `useIntegrations().onDelete`, gated on `ConfirmDialog`.
 *
 * Withholding the menu entirely for a `disabled` subscription (rendering `—` instead) stays in
 * `Integrations.tsx` — that decision is made before this function is ever called, not inside it.
 *
 * @complexity Time/space: O(1) — exactly two entries, no iteration.
 * @overallScore 100
 */
export function integrationRowMenuItems(
  subscription: AdminWebhookSubscription,
  handlers: IntegrationRowMenuHandlers,
): RowMenuItem[] {
  return [
    {
      key: "pause",
      label: subscription.status === "paused" ? "Resume" : "Pause",
      onSelect: () => handlers.onTogglePause(subscription),
    },
    {
      key: "delete",
      label: "Delete",
      destructive: true,
      onSelect: () => handlers.onDelete(subscription),
    },
  ];
}

/** Best available timestamp for the delivery log's "Timestamp" column: delivered time, else
 *  created time.
 *
 * @complexity Time/space: O(1).
 * @overallScore 100
 */
export function displayTimestamp(delivery: AdminWebhookDelivery): string {
  return formatTimestamp(delivery.deliveredAt ?? delivery.createdAt);
}
