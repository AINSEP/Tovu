/**
 * @file `subscriptions.ts` — subscription add/import chokepoint (ADR-PIPE-011 C-013, REQ-10/31).
 *
 * `importSubscriptions` MUST call the exact same per-row path `saveSubscription` uses — any
 * divergence breaks REQ-31's "no separate unvalidated import path" guarantee (aggregate-risk note,
 * ADR-PIPE-011 Contract Map). Never creates a new Members identity (REQ-10) — resolves via
 * `SubscriberDirectoryPort`, read-only.
 */
import type { UUID } from "../core/ports";
import { issueConfirmationToken, type ConfirmationDeps } from "./confirmation";
import { NewsletterSubscriberNotFoundError, NewsletterValidationError } from "./errors";
import type { NewsletterSubscriptionRepoPort, SubscriberDirectoryPort } from "./ports";
import type { SubscriptionRow } from "./types";

const IMPORT_BATCH_MAX = 500;

export interface SubscriptionsDeps {
  subscriptionRepo: NewsletterSubscriptionRepoPort;
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
