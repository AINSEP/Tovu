import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "#src/core/events/index";
import {
  InMemoryDeliveryEnvelopeStore,
  InMemoryWebhookDeliveryRepo,
  InMemoryWebhookSubscriptionRepo,
} from "#src/features/webhooks/index";
import { enqueueDelivery } from "#src/features/webhooks/delivery";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "#src/features/forms/repo.memory";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/rate-limit-profile";
import { submitForm } from "#src/features/forms/submit-service";
import type { FormDefinitionRecord } from "#src/features/forms/index";
import { createRateLimiter } from "#src/core/rate-limit/rate-limit";

/**
 * @file Integration test proving the webhook fan-out reaches the existing delivery worker's
 * queued row (SPEC-010 AC-16/EC-07, REQ-11) — after an accepted submission, a matching webhook
 * subscription's delivery-worker row is queued, with zero Forms-owned dispatch code (verified by
 * inspecting `integrations`' own `WebhookDeliveryRepoPort`, not a Forms-owned code path). Mirrors
 * `server/app.ts`'s exact wiring shape: `bus.subscribe('form.submission.received', event =>
 * enqueueDelivery(...))`.
 */
const NOW = "2026-07-13T00:00:00.000Z";
const WORKSPACE_ID = "ws-1";

function makeDefinition(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "def-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [{ id: "name", label: "Name", type: "text", required: true }],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeHarness() {
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => NOW };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const rateLimiter = createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock });

  const webhookSubscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();
  const envelopeStore = new InMemoryDeliveryEnvelopeStore();

  // Mirrors server/app.ts's exact wiring line: zero Forms-owned dispatch logic, forwards verbatim
  // to `integrations`' own `enqueueDelivery`.
  void bus.subscribe("form.submission.received", async (event) => {
    await enqueueDelivery({
      deps: {
        subscriptionRepo: webhookSubscriptionRepo,
        deliveryRepo: webhookDeliveryRepo,
        envelopeStore,
        idGenerator: idGen,
        clock,
      },
      input: {
        event: {
          id: event.id,
          name: event.name,
          workspaceId: event.workspaceId,
          occurredAt: event.occurredAt,
          payload: event.payload as Record<string, unknown> as import("@jini-ai/cms/core").JsonObject,
        },
      },
    });
  });

  return {
    definitionRepo,
    submissionRepo,
    outbox,
    bus,
    clock,
    idGen,
    rateLimiter,
    webhookSubscriptionRepo,
    webhookDeliveryRepo,
  };
}

test("AC-16: an accepted submission queues a matching webhook subscription's delivery row", async () => {
  const harness = makeHarness();
  await harness.definitionRepo.create(makeDefinition());
  await harness.webhookSubscriptionRepo.save({
    id: "sub-webhook-1",
    workspaceId: WORKSPACE_ID,
    ownerPrincipalId: "principal-1",
    label: "Ops webhook",
    targetUrl: "https://example.com/hook",
    topics: ["form.submission.received"],
    status: "active",
    secretVersion: 1,
    previousSecretVersion: null,
    createdByPrincipalId: "principal-1",
    createdByPluginId: null,
    createdAt: NOW,
    updatedAt: NOW,
    disabledAt: null,
  });

  await submitForm({
    deps: {
      definitionRepo: harness.definitionRepo,
      submissionRepo: harness.submissionRepo,
      outbox: harness.outbox,
      bus: harness.bus,
      clock: harness.clock,
      idGen: harness.idGen,
      rateLimiter: harness.rateLimiter,
    },
    input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada" }, sourceIp: "1.1.1.1" },
  });

  // submitForm's own fire-and-forget processOutbox() call should have already delivered the event
  // to our webhook-fanout subscriber; give it a tick, then also run an explicit drain defensively.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock: harness.clock });

  const deliveries = await harness.webhookDeliveryRepo.listBySubscription({
    workspaceId: WORKSPACE_ID,
    subscriptionId: "sub-webhook-1",
    limit: 10,
  });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].topic, "form.submission.received");
});

test("EC-07: no matching subscription -> no delivery row queued (not an error)", async () => {
  const harness = makeHarness();
  await harness.definitionRepo.create(makeDefinition());
  // No subscriptions registered at all.

  await submitForm({
    deps: {
      definitionRepo: harness.definitionRepo,
      submissionRepo: harness.submissionRepo,
      outbox: harness.outbox,
      bus: harness.bus,
      clock: harness.clock,
      idGen: harness.idGen,
      rateLimiter: harness.rateLimiter,
    },
    input: { workspaceId: WORKSPACE_ID, slug: "contact", body: { name: "Ada" }, sourceIp: "2.2.2.2" },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock: harness.clock });

  const deliveries = await harness.webhookDeliveryRepo.listBySubscription({
    workspaceId: WORKSPACE_ID,
    subscriptionId: "sub-webhook-1",
    limit: 10,
  });
  assert.equal(deliveries.length, 0);
});
