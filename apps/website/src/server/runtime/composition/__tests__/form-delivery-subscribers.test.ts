import assert from "node:assert/strict";
import { test } from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FormDeliveryPlan, type FormDeliveryPlanPort } from "@jini-ai/cms/forms";
import { InMemorySettingsRepo, type AuthorizeFn } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "#src/contracts/core/events/index";
import { createSettingsPrincipalLookup, ensureFormDeliverySettings, writeFormDeliveryBindings } from "#src/features/settings/index";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "#src/features/webhooks/index";
import { composeFormDelivery } from "../form-delivery.js";
import { createIntegrationsModule } from "../modules/integrations.js";

/**
 * @file The delivery planner beside the other `form.submission.received` subscribers. The bus runs
 * an event's handlers one after another and retries the whole event when one throws, so a planner
 * that throws would re-send the notification email and, subscribed before the webhook fan-out,
 * stop the webhook from ever being queued.
 */

const W = "ws-1";
const T0 = "2026-10-20T12:00:00.000Z";

async function settingsSelectingEveryForm() {
  const clock = { nowMs: () => Date.parse(T0), nowIso: () => T0 };
  let next = 0;
  const ids = { newId: () => `setting-${(next += 1)}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  await ensureFormDeliverySettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  await writeFormDeliveryBindings({ deps: { repo: settingsRepo, clock, ids, authorize, principals }, workspaceId: W, callerPrincipalId: "owner",
    value: [{ bindingId: "b1", adapterId: "rows", connectionRef: "conn-1", enabled: true, config: { table: "leads" } }] });
  return settingsRepo;
}

async function webhookSubscribedToSubmissions() {
  const repo = new InMemoryWebhookSubscriptionRepo();
  await repo.save({ id: "hook-1", workspaceId: W, ownerPrincipalId: "owner", label: "Endpoint", targetUrl: "https://example.com/hooks",
    topics: ["form.submission.received"], secretVersion: 1, previousSecretVersion: null, status: "active", createdByPrincipalId: "owner",
    createdByPluginId: null, createdAt: T0, updatedAt: T0, disabledAt: null });
  return repo;
}

test("a submission gone before planning records an empty plan, and the email and webhook subscribers each run once", async () => {
  const bus = new InMemoryEventBus();
  const outbox = new InMemoryOutbox();
  const clock = createFakeClock({ startIso: T0 });
  let next = 0;
  const idGen = { newId: () => `id-${(next += 1)}` };
  // Stands in for the forms module's notify subscriber, which subscribes first (`createApp` order).
  let emails = 0;
  await bus.subscribe({ eventName: "form.submission.received", handler: async () => { emails += 1; } });
  const recorded: FormDeliveryPlan[] = [];
  const plans: FormDeliveryPlanPort = { once: async ({ build }) => { const plan = await build(); recorded.push(plan); return plan; } };
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create({ id: "form-1", workspaceId: W, name: "Contact", slug: "contact", status: "active", version: 1, createdAt: T0, updatedAt: T0,
    notify: { enabled: true, recipients: ["owner@example.com"] }, fields: [{ id: "email", label: "Email", type: "email", required: true }] });
  const warnings: string[] = [];
  const formDelivery = composeFormDelivery({ bus, plans, settingsRepo: await settingsSelectingEveryForm(), formDefinitionRepo,
    formSubmissionRepo: new InMemoryFormSubmissionRepo(), deliver: async () => undefined, idGen, clock }, { warn: (message) => warnings.push(message) });
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();
  createIntegrationsModule({ bus, formDelivery, webhookSubscriptionRepo: await webhookSubscribedToSubmissions(), webhookDeliveryRepo, idGen, clock }).start?.();
  const received: DomainEvent = { id: "evt-1", name: "form.submission.received", workspaceId: W, occurredAt: T0, aggregateId: "sub-gone",
    payload: { submissionId: "sub-gone", formDefinitionId: "form-1" } };
  await outbox.enqueue(received);

  await processOutbox({ outbox, bus, clock }, { random: () => 0 });
  clock.advanceMs(60 * 60_000);
  await processOutbox({ outbox, bus, clock }, { random: () => 0 });

  assert.equal(emails, 1, "the event was not retried, so the email went once");
  assert.equal((await webhookDeliveryRepo.claimPending({ batchSize: 10, nowIso: clock.nowIso() })).length, 1, "the webhook was queued once");
  assert.deepEqual(recorded, [{ workspaceId: W, submissionId: "sub-gone", formId: "form-1", jobs: [] }]);
  assert.deepEqual(warnings, ["[form-delivery] submission sub-gone or its form no longer exists; recorded an empty delivery plan"]);
});

test("a planner that fails for another reason fails the event for a retry, after the webhook was queued", async () => {
  const bus = new InMemoryEventBus();
  const outbox = new InMemoryOutbox();
  const clock = createFakeClock({ startIso: T0 });
  let next = 0;
  const idGen = { newId: () => `id-${(next += 1)}` };
  const plans: FormDeliveryPlanPort = { once: async ({ build }) => build() };
  const warnings: string[] = [];
  const formDelivery = composeFormDelivery({ bus, plans, settingsRepo: await settingsSelectingEveryForm(),
    formDefinitionRepo: { findById: async () => { throw new Error("store offline"); } }, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    deliver: async () => undefined, idGen, clock }, { warn: (message) => warnings.push(message) });
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();
  createIntegrationsModule({ bus, formDelivery, webhookSubscriptionRepo: await webhookSubscribedToSubmissions(), webhookDeliveryRepo, idGen, clock }).start?.();
  await outbox.enqueue({ id: "evt-1", name: "form.submission.received", workspaceId: W, occurredAt: T0, aggregateId: "sub-1",
    payload: { submissionId: "sub-1", formDefinitionId: "form-1" } });

  await processOutbox({ outbox, bus, clock }, { random: () => 0 });

  assert.equal((await webhookDeliveryRepo.claimPending({ batchSize: 10, nowIso: clock.nowIso() })).length, 1, "the webhook subscriber ran before the planner");
  const [row] = await outbox.claimPending({ batchSize: 10, nowIso: new Date(Date.parse(T0) + 24 * 60 * 60_000).toISOString() });
  assert.deepEqual([row?.id, row?.attempts], ["evt-1", 2], "the event failed its first attempt and is due again");
  assert.deepEqual(warnings, [], "only a gone source becomes an empty plan");
});
