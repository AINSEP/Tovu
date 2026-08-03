/**
 * @file `subscriptions.ts` — subscription add/import chokepoint (ADR-PIPE-011 C-013, REQ-10/31).
 *
 * `importSubscriptions` MUST call the exact same per-row path `saveSubscription` uses — any
 * divergence breaks REQ-31's "no separate unvalidated import path" guarantee (aggregate-risk note,
 * ADR-PIPE-011 Contract Map). Never creates a new Members identity (REQ-10) — resolves via
 * `SubscriberDirectoryPort`, read-only.
 */
import type { UUID } from "@jini-ai/cms/core";
import { issueConfirmationToken, type ConfirmationDeps } from "./confirmation";
import {
  NewsletterListNotFoundError,
  NewsletterSubscriberNotFoundError,
  NewsletterSubscriptionNotFoundError,
  NewsletterValidationError,
} from "./errors";
import type {
  MembersConsentCapability,
  NewsletterListRepoPort,
  NewsletterSubscriptionRepoPort,
  SubscriberDirectoryPort,
} from "./ports";
import type { SubscriptionRow } from "./types";

const IMPORT_BATCH_MAX = 500;

export interface SubscriptionsDeps {
  subscriptionRepo: NewsletterSubscriptionRepoPort;
  /** api.spec.md §6: `CREATE_SUBSCRIPTION`/`IMPORT_SUBSCRIPTIONS` -> `404 NEWSLETTER_LIST_NOT_FOUND` for an unknown `listId`. */
  listRepo: NewsletterListRepoPort;
  subscriberDirectory: SubscriberDirectoryPort;
  confirmationDeps: ConfirmationDeps;
  clock: { nowIso(): string };
  ids: { newId(): string };
}

/** C-013 — resolve `subscriberId` via `SubscriberDirectoryPort`, create a `pending` subscription, trigger confirmation (AC-12/13). */
export async function saveSubscription(required: {
  deps: SubscriptionsDeps;
  input: { workspaceId: UUID; listId: UUID; subscriberId: UUID; source: SubscriptionRow["source"] };
}): Promise<{ subscription: SubscriptionRow }> {
  const { deps, input } = required;

  const list = await deps.listRepo.findById({ workspaceId: input.workspaceId, id: input.listId });
  if (!list) {
    throw new NewsletterListNotFoundError(`list ${input.listId} was not found`);
  }

  const contact = await deps.subscriberDirectory.getContact({ workspaceId: input.workspaceId, subscriberId: input.subscriberId });
  if (!contact) {
    throw new NewsletterSubscriberNotFoundError(`subscriber ${input.subscriberId} was not found`, input.subscriberId);
  }

  const existing = await deps.subscriptionRepo.findBySubscriberAndList({
    workspaceId: input.workspaceId,
    listId: input.listId,
    subscriberId: input.subscriberId,
  });
  const now = deps.clock.nowIso();
  const subscription: SubscriptionRow = existing ?? {
    id: deps.ids.newId(),
    workspaceId: input.workspaceId,
    listId: input.listId,
    subscriberId: input.subscriberId,
    status: "pending",
    source: input.source,
    consentRevisionIdAtSubscribe: null,
    subscribedAt: null,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.subscriptionRepo.save(subscription);

  await issueConfirmationToken({
    deps: deps.confirmationDeps,
    input: { workspaceId: input.workspaceId, subscriptionId: subscription.id, recipientEmail: contact.email },
  });

  return { subscription };
}

export interface UnsubscribeSubscriptionDeps {
  subscriptionRepo: NewsletterSubscriptionRepoPort;
  /** `null` = unbound — see `launch-gate.ts`'s file header on why this must never be stubbed to succeed. */
  consentCapability: MembersConsentCapability | null;
  clock: { nowIso(): string };
}

/**
 * C-013 (admin-triggered removal half) — `REMOVE_SUBSCRIPTION` (api.spec.md §1/§5): flips a
 * subscription to `unsubscribed` directly, by primary key, no signed token involved (unlike
 * `unsubscribe.ts`'s `processUnsubscribe`, which verifies a `KeyringPort`-derived token and is the
 * self-service, no-login public path). Same terminal shape and the same conditional
 * `MembersConsentCapability.revoke()` side effect `processUnsubscribe` performs — an admin removing
 * a subscription must revoke real consent state exactly as a self-service unsubscribe would, once a
 * real binding exists. Idempotent: removing an already-`unsubscribed` subscription is a no-op
 * success, not an error (mirrors `processUnsubscribe`'s EC-03 carve-out).
 */
export async function unsubscribeSubscription(required: {
  deps: UnsubscribeSubscriptionDeps;
  input: { workspaceId: UUID; id: UUID };
}): Promise<{ subscription: SubscriptionRow }> {
  const { deps, input } = required;
  const existing = await deps.subscriptionRepo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new NewsletterSubscriptionNotFoundError(`subscription ${input.id} was not found`);
  }
  if (existing.status === "unsubscribed") {
    return { subscription: existing };
  }

  if (deps.consentCapability) {
    await deps.consentCapability.revoke({ workspaceId: input.workspaceId, subscriberId: existing.subscriberId });
  }

  const now = deps.clock.nowIso();
  const updated: SubscriptionRow = { ...existing, status: "unsubscribed", unsubscribedAt: now, updatedAt: now };
  await deps.subscriptionRepo.save(updated);
  return { subscription: updated };
}

export interface ImportRowResult {
  index: number;
  subscription?: SubscriptionRow;
  error?: { code: string; message: string };
}

/**
 * C-013 — import a batch (1-500) of subscriber ids, routing EVERY row through the identical
 * `saveSubscription` path (AC-40/EC-08): a batch with one invalid id still creates the valid rows.
 */
export async function importSubscriptions(required: {
  deps: SubscriptionsDeps;
  input: { workspaceId: UUID; listId: UUID; subscribers: readonly { subscriberId: UUID; source: SubscriptionRow["source"] }[] };
}): Promise<{ created: SubscriptionRow[]; failed: { index: number; code: string; message: string }[] }> {
  const { deps, input } = required;
  if (input.subscribers.length < 1 || input.subscribers.length > IMPORT_BATCH_MAX) {
    throw new NewsletterValidationError(
      `import batch must be between 1 and ${IMPORT_BATCH_MAX} rows`,
      "subscribers",
      "length"
    );
  }
  // Checked ONCE for the whole batch (the same `listId` applies to every row) rather than letting
  // every row independently fail — an unknown list is a malformed-request condition, not a
  // per-row outcome (api.spec.md §6 IMPORT_SUBSCRIPTIONS' 400 is scoped to "malformed batch shape
  // only"; a missing list is closer to that than to a per-row 207 failure entry).
  const list = await deps.listRepo.findById({ workspaceId: input.workspaceId, id: input.listId });
  if (!list) {
    throw new NewsletterListNotFoundError(`list ${input.listId} was not found`);
  }

  const created: SubscriptionRow[] = [];
  const failed: { index: number; code: string; message: string }[] = [];

  for (let index = 0; index < input.subscribers.length; index += 1) {
    const row = input.subscribers[index]!;
    try {
      const { subscription } = await saveSubscription({
        deps,
        input: { workspaceId: input.workspaceId, listId: input.listId, subscriberId: row.subscriberId, source: row.source },
      });
      created.push(subscription);
    } catch (err) {
      if (err instanceof NewsletterSubscriberNotFoundError) {
        failed.push({ index, code: "NEWSLETTER_SUBSCRIBER_NOT_FOUND", message: err.message });
      } else {
        failed.push({ index, code: "INTERNAL_ERROR", message: (err as Error).message });
      }
    }
  }

  return { created, failed };
}
