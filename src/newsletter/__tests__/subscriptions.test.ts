/**
 * @file T025 — failing-first tests for `subscriptions.ts` (REQ-10/31, AC-12/13/40, EC-07/08).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { importSubscriptions, saveSubscription, type SubscriptionsDeps } from "../subscriptions";
import { NewsletterSubscriberNotFoundError, NewsletterValidationError } from "../errors";
import { InMemoryNewsletterConfirmationTokenRepo, InMemoryNewsletterSubscriptionRepo } from "../repo.memory";
import type { SubscriberContact, SubscriberDirectoryPort } from "../ports";
import type { ConfirmationDeps } from "../confirmation";

const WS = "ws-1";
const NOW = "2026-07-13T00:00:00.000Z";
const clock = { nowIso: () => NOW };
let counter = 0;
const ids = { newId: () => `sub-${++counter}` };

const KNOWN_CONTACTS: Record<string, SubscriberContact> = {
  "subscriber-1": { subscriberId: "subscriber-1", workspaceId: WS, email: "a@a.test", emailDeliverable: true },
  "subscriber-2": { subscriberId: "subscriber-2", workspaceId: WS, email: "b@b.test", emailDeliverable: true },
};

const subscriberDirectory: SubscriberDirectoryPort = {
  getContact: async ({ subscriberId }) => KNOWN_CONTACTS[subscriberId] ?? null,
  getContacts: async ({ subscriberIds }) => subscriberIds.map((id) => KNOWN_CONTACTS[id]).filter((c): c is SubscriberContact => !!c),
};

function makeDeps(): SubscriptionsDeps {
  counter = 0;
  const confirmationDeps: ConfirmationDeps = {
    tokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    subscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    mailer: {
      capabilities: () => ({ driver: "console", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1 }),
      send: async () => ({ ok: true as const, providerMessageId: "m1", acceptedAt: NOW }),
      sendBatch: async () => [],
    },
    consentCapability: null,
    originRegistry: {
      canonicalOrigin: async () => ({ scheme: "https" as const, host: "acme.test", verifiedAt: "2026-07-13T00:00:00.000Z", source: "workspace-setting" as const }),
      isAllowedRedirectTarget: async () => true,
      isAllowedEgressTarget: async () => true,
    },
    clock,
    ids,
  };
  const subscriptionRepo = new InMemoryNewsletterSubscriptionRepo();
  confirmationDeps.subscriptionRepo = subscriptionRepo;
  return { subscriptionRepo, subscriberDirectory, confirmationDeps, clock, ids };
}

test("saveSubscription: resolves subscriberId via SubscriberDirectoryPort, creates a 'pending' subscription (AC-12)", async () => {
  const deps = makeDeps();
  const { subscription } = await saveSubscription({ deps, input: { workspaceId: WS, listId: "list-1", subscriberId: "subscriber-1", source: "admin" } });
  assert.equal(subscription.status, "pending");
  assert.equal(subscription.subscriberId, "subscriber-1");
});

test("saveSubscription: unknown subscriberId rejected with NEWSLETTER_SUBSCRIBER_NOT_FOUND (AC-13)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    saveSubscription({ deps, input: { workspaceId: WS, listId: "list-1", subscriberId: "unknown", source: "admin" } }),
    NewsletterSubscriberNotFoundError
  );
});

test("subscriberDirectory.getContacts: a null/omitted result for an unknown id among several is expected, not an error (EC-07)", async () => {
  const result = await subscriberDirectory.getContacts({ workspaceId: WS, subscriberIds: ["subscriber-1", "does-not-exist"] });
  assert.equal(result.length, 1, "unresolvable ids are silently omitted, not thrown");
});

test("importSubscriptions: routes every row through the IDENTICAL per-row path saveSubscription uses — a batch with one invalid id still creates the valid rows (AC-40/EC-08)", async () => {
  const deps = makeDeps();
  const result = await importSubscriptions({
    deps,
    input: {
      workspaceId: WS,
      listId: "list-1",
      subscribers: [
        { subscriberId: "subscriber-1", source: "import" },
        { subscriberId: "unknown-id", source: "import" },
        { subscriberId: "subscriber-2", source: "import" },
      ],
    },
  });
  assert.equal(result.created.length, 2);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]!.index, 1);
  assert.equal(result.failed[0]!.code, "NEWSLETTER_SUBSCRIBER_NOT_FOUND");
});

test("importSubscriptions: batch of 500 accepted, 501 rejected before any row is written (behavior.spec §4/§7)", async () => {
  const deps = makeDeps();
  const batch500 = Array.from({ length: 500 }, (_, i) => ({ subscriberId: `subscriber-${i}`, source: "import" as const }));
  // All will fail (unknown ids) but the BATCH ITSELF must be accepted for processing at exactly 500.
  const result500 = await importSubscriptions({ deps, input: { workspaceId: WS, listId: "list-1", subscribers: batch500 } });
  assert.equal(result500.created.length + result500.failed.length, 500);

  const batch501 = Array.from({ length: 501 }, (_, i) => ({ subscriberId: `subscriber-${i}`, source: "import" as const }));
  await assert.rejects(
    importSubscriptions({ deps, input: { workspaceId: WS, listId: "list-1", subscribers: batch501 } }),
    NewsletterValidationError
  );
});

test("importSubscriptions: an empty batch is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(importSubscriptions({ deps, input: { workspaceId: WS, listId: "list-1", subscribers: [] } }), NewsletterValidationError);
});
