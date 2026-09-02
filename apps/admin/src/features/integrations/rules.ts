import type { RowMenuItem } from "@jini-ai/admin/react";

import { describeApiError, type AdminWebhookDelivery, type AdminWebhookSubscription } from "../../lib/api";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { QueryKey } from "../../lib/fetch-query";
import { t } from "./integrations-i18n";

/**
 * @file Pure logic for the `integrations` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the same convention `features/posts/rules.ts` establishes for this app: the bar for
 * landing here is "does it compute something", not "is it rendered". The row-action menu below
 * used to be an array literal built inline inside a `DataTable` cell — logic reachable only by
 * rendering a table and opening a popover, which is how its `status === "paused"` label branch
 * ended up untested.
 *
 * `KEYS` (fetch-query migration, 2026-08-12): two entirely separate top-level namespaces, not a
 * shared grandparent — `use-integration-deliveries.hooks.ts`'s delivery log is a distinct,
 * read-only sub-resource with no method overlap with subscription CRUD (same split
 * `integrations-port.hooks.ts` already makes with its own two ports), and no subscription write
 * (create/pause/delete) needs to invalidate a delivery log. Same "separate namespaces, no shared
 * prefix" shape `forms/rules.ts`'s `KEYS` uses for `forms` vs `form-submissions`.
 */
export const KEYS = {
  list: ["integrations", "list"] as QueryKey,
  deliveries: (subscriptionId: string): QueryKey => ["integration-deliveries", subscriptionId],
};

/** This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s
 *  `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than a shared registry.
 *  Agent-writable via `webhooks_create_subscription`/`webhooks_pause_subscription`/
 *  `webhooks_delete_subscription` (`apps/website/src/features/webhooks/agent-tools.ts` — the
 *  website domain is named "webhooks", this admin feature is named "integrations"; both name the
 *  same `WebhookSubscriptionRecord` resource). No sibling constant for the deliveries log
 *  (`use-integration-deliveries.hooks.ts`): no Webhooks agent tool writes a delivery row — deliveries
 *  are recorded only by the outbound delivery worker itself, which nothing in this catalog drives. */
export const WEBHOOKS_RESOURCE = "webhooks";

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
  locale: string,
): RowMenuItem[] {
  return [
    {
      key: "pause",
      label: subscription.status === "paused" ? t(locale, "Resume") : t(locale, "Pause"),
      onSelect: () => handlers.onTogglePause(subscription),
    },
    {
      key: "delete",
      label: t(locale, "Delete"),
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

/**
 * `useIntegrations`'s page-level error banner — deliberately excludes the CREATE write's own
 * failure, which shows inside the create form itself (`formError`, derived directly from
 * `createMutation.error` in the hook) rather than this page-level channel, matching the
 * pre-migration `onCreate`/`onTogglePause`/`onDelete` catch blocks' own separate `setFormError`
 * vs `setError` split.
 *
 * Precedence: an active toggle/delete failure outranks a background list-refresh failure, same
 * shape as `redirects/rules.ts`'s `visibleRedirectsError`. The list error only surfaces before
 * `subscriptions` has ever loaded.
 *
 * @complexity Time/space: O(1) — three fixed checks, no iteration.
 */
export function visibleIntegrationsError(params: {
  toggleError: Error | null;
  deleteError: Error | null;
  listError: Error | null;
  hasSubscriptions: boolean;
}): string | null {
  if (params.toggleError) return describeApiError(params.toggleError, "failed to update subscription");
  if (params.deleteError) return describeApiError(params.deleteError, "failed to delete subscription");
  if (params.hasSubscriptions) return null;
  return params.listError ? describeApiError(params.listError, "failed to load integrations") : null;
}
