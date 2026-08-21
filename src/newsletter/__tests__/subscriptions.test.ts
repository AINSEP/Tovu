/**
 * @file T025 — failing-first tests for `subscriptions.ts` (REQ-10/31, AC-12/13/40, EC-07/08).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { importSubscriptions, saveSubscription, unsubscribeSubscription, type SubscriptionsDeps, type UnsubscribeSubscriptionDeps } from "../subscriptions.js";
import {
  NewsletterListNotFoundError,
  NewsletterSubscriberNotFoundError,
  NewsletterSubscriptionNotFoundError,
  NewsletterValidationError,
} from "../errors.js";
import { InMemoryNewsletterConfirmationTokenRepo, InMemoryNewsletterListRepo, InMemoryNewsletterSubscriptionRepo } from "../repo.memory.js";
import type { MembersConsentCapability, SubscriberContact, SubscriberDirectoryPort } from "../ports.js";
import type { ConfirmationDeps } from "../confirmation.js";

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
      capabilities: () => ({ driver: "console", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
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
  const listRepo = new InMemoryNewsletterListRepo([
    { id: "list-1", workspaceId: WS, name: "Fixture list", slug: "fixture-list", isDefault: false, status: "active", createdAt: NOW, updatedAt: NOW },
  ]);
  return { subscriptionRepo, listRepo, subscriberDirectory, confirmationDeps, clock, ids };
}

test("saveSubscription: resolves subscriberId via SubscriberDirectoryPort, creates a 'pending' subscription (AC-12)", async () => {
  const deps = makeDeps();
  const { subscription } = await saveSubscription({ deps, input: { workspaceId: WS, listId: "list-1", subscriberId: "subscriber-1", source: "admin" } });
  assert.equal(subscription.status, "pending");
  assert.equal(subscription.subscriberId, "subscriber-1");
});

test("saveSubscription: a repeat call for the same subscriber+list reuses the EXISTING row (same id), never creates a duplicate", async () => {
  const deps = makeDeps();
  const first = await saveSubscription({ deps, input: { workspaceId: WS, listId: "list-1", subscriberId: "subscriber-1", source: "admin" } });
  const second = await saveSubscription({ deps, input: { workspaceId: WS, listId: "list-1", subscriberId: "subscriber-1", source: "signup_form" } });
  assert.equal(second.subscription.id, first.subscription.id);

  const all = await deps.subscriptionRepo.list({ workspaceId: WS, listId: "list-1", limit: 10 });
  assert.equal(all.length, 1, "no duplicate row for a repeat saveSubscription call");
});

test("saveSubscription: unknown subscriberId rejected with NEWSLETTER_SUBSCRIBER_NOT_FOUND (AC-13)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    saveSubscription({ deps, input: { workspaceId: WS, listId: "list-1", subscriberId: "unknown", source: "admin" } }),
    NewsletterSubscriberNotFoundError
  );
});

test("saveSubscription: unknown listId rejected with NEWSLETTER_LIST_NOT_FOUND (api.spec.md CREATE_SUBSCRIPTION 404)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    saveSubscription({ deps, input: { workspaceId: WS, listId: "does-not-exist", subscriberId: "subscriber-1", source: "admin" } }),
    NewsletterListNotFoundError
  );
});

test("importSubscriptions: an unknown listId rejects the WHOLE batch up front (404), not a per-row 207 failure", async () => {
  const deps = makeDeps();
  await assert.rejects(
    importSubscriptions({
      deps,
      input: { workspaceId: WS, listId: "does-not-exist", subscribers: [{ subscriberId: "subscriber-1", source: "import" }] },
    }),
    NewsletterListNotFoundError
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

function makeUnsubscribeDeps(consentCapability: MembersConsentCapability | null = null): { deps: UnsubscribeSubscriptionDeps; subscriptionRepo: InMemoryNewsletterSubscriptionRepo } {
  const subscriptionRepo = new InMemoryNewsletterSubscriptionRepo();
  return { deps: { subscriptionRepo, consentCapability, clock }, subscriptionRepo };
}

test("unsubscribeSubscription (REMOVE_SUBSCRIPTION): flips a subscribed row to 'unsubscribed', stamping unsubscribedAt", async () => {
  const { deps, subscriptionRepo } = makeUnsubscribeDeps();
  await subscriptionRepo.save({
    id: "sub-1",
    workspaceId: WS,
    listId: "list-1",
    subscriberId: "subscriber-1",
    status: "subscribed",
    source: "admin",
    consentRevisionIdAtSubscribe: "rev-1",
    subscribedAt: NOW,
    unsubscribedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const { subscription } = await unsubscribeSubscription({ deps, input: { workspaceId: WS, id: "sub-1" } });
  assert.equal(subscription.status, "unsubscribed");
  assert.equal(subscription.unsubscribedAt, NOW);
});

test("unsubscribeSubscription: an unknown subscription id is rejected with NEWSLETTER_SUBSCRIPTION_NOT_FOUND", async () => {
  const { deps } = makeUnsubscribeDeps();
  await assert.rejects(unsubscribeSubscription({ deps, input: { workspaceId: WS, id: "does-not-exist" } }), NewsletterSubscriptionNotFoundError);
});

test("unsubscribeSubscription: idempotent on a repeat call against an already-unsubscribed row (no error, no double-stamp)", async () => {
  const { deps, subscriptionRepo } = makeUnsubscribeDeps();
  await subscriptionRepo.save({
    id: "sub-1",
    workspaceId: WS,
    listId: "list-1",
    subscriberId: "subscriber-1",
    status: "unsubscribed",
    source: "admin",
    consentRevisionIdAtSubscribe: "rev-1",
    subscribedAt: NOW,
    unsubscribedAt: "2026-07-14T00:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW,
  });

  const { subscription } = await unsubscribeSubscription({ deps, input: { workspaceId: WS, id: "sub-1" } });
  assert.equal(subscription.status, "unsubscribed");
  assert.equal(subscription.unsubscribedAt, "2026-07-14T00:00:00.000Z", "an already-unsubscribed row's timestamp is left untouched, not re-stamped");
});

test("unsubscribeSubscription: calls MembersConsentCapability.revoke() when a real binding is present", async () => {
  let revokedFor: string | null = null;
  const consentCapability: MembersConsentCapability = {
    request: async () => ({ requested: true as const }),
    confirm: async () => ({ status: "granted" as const, consentRevisionId: "rev-2" }),
    revoke: async ({ subscriberId }) => {
      revokedFor = subscriberId;
      return { status: "revoked" as const };
    },
  };
  const { deps, subscriptionRepo } = makeUnsubscribeDeps(consentCapability);
  await subscriptionRepo.save({
    id: "sub-1",
    workspaceId: WS,
    listId: "list-1",
    subscriberId: "subscriber-1",
    status: "subscribed",
    source: "admin",
    consentRevisionIdAtSubscribe: "rev-1",
    subscribedAt: NOW,
    unsubscribedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });

  await unsubscribeSubscription({ deps, input: { workspaceId: WS, id: "sub-1" } });
  assert.equal(revokedFor, "subscriber-1");
});
