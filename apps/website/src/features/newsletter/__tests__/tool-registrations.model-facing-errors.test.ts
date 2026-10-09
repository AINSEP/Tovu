/**
 * @file RED regression suite for the Newsletter half of the 2026-09-16 "always say the real reason"
 * sweep. Drives the REAL delegated-tool-call transport end to end, the same seam
 * `features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts`
 * established, so the assertion is on the payload a spawned agent CLI actually receives.
 *
 * RED before the fix, for every case below: `{ ok: false, error: { code: "INTERNAL_ERROR", message:
 * "an internal error occurred" } }`. Newsletter had NO reclassification of any kind, and it is the
 * widest catalog in this sweep — all 14 wired tools sent every one of `errors.ts`'s typed classes,
 * plus the kit's `ForbiddenError`, straight into the SEC-005 redactor.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import { newsletterAgentToolCatalog } from "../agent-tools.js";
import { createHookRegistry } from "../hooks.js";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../repo.memory.js";
import { buildNewsletterRegistrations, type NewsletterToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-newsletter-errors";
const PRINCIPAL_ID = "principal-1";
const NOW = "2026-09-16T00:00:00.000Z";

function makeRouteDeps(options: { allow?: boolean; readOnly?: boolean } = {}): NewsletterToolDeps {
  const allow = options.allow ?? true;
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as NewsletterToolDeps["outbox"],
    bus: { publish: async () => undefined, subscribe: () => undefined } as unknown as NewsletterToolDeps["bus"],
    mailer: { send: async () => undefined } as unknown as NewsletterToolDeps["mailer"],
    originRegistry: { isAllowedEgressTarget: async () => true } as unknown as NewsletterToolDeps["originRegistry"],
    newsletterReady: Promise.resolve(),
    newsletterCampaignRepo: new InMemoryNewsletterCampaignRepo(),
    newsletterListRepo: new InMemoryNewsletterListRepo(),
    newsletterSubscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    newsletterAudienceSnapshotRepo: new InMemoryNewsletterAudienceSnapshotRepo(),
    newsletterSendRepo: new InMemoryNewsletterSendRepo(),
    newsletterConfirmationTokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    newsletterSubscriberDirectory: { getContact: async () => null } as unknown as NewsletterToolDeps["newsletterSubscriberDirectory"],
    newsletterHooks: createHookRegistry(),
    membersConsentCapability: null,
    authorize: async (request) => ((options.readOnly ? ["admin.newsletter.read", "admin.newsletter.subscriber.read"].includes(request.permission) : allow) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
}

async function buildHarness(routeDeps: NewsletterToolDeps) {
  const registry = createToolRegistry({});
  for (const registration of buildNewsletterRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ input: { runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input }, deps: harness });
}

test("newsletter_get_campaign for an unknown campaign is BAD_REQUEST with the real not-found reason, not a redacted 500", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_get_campaign", { campaignId: "nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_CAMPAIGN_NOT_FOUND: campaign nope was not found",
  });
});

test("newsletter_list_send_log for an unknown campaign says so rather than 'an internal error occurred'", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_list_send_log", { campaignId: "ghost" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_CAMPAIGN_NOT_FOUND: campaign ghost was not found",
  });
});

test("newsletter_remove_subscription for an unknown subscription surfaces its own not-found class", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_remove_subscription", { listId: "l-1", subscriptionId: "s-nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_SUBSCRIPTION_NOT_FOUND: subscription s-nope was not found",
  });
});

test("newsletter_create_subscription against an unknown list names the LIST, not a generic failure", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_create_subscription", {
    listId: "l-nope",
    subscriberId: "sub-1",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_LIST_NOT_FOUND: list l-nope was not found",
  });
});

test("newsletter_create_campaign against an unknown list names the list", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_create_campaign", {
    subject: "Hello",
    fromName: "Tovu",
    fromEmail: "hello@example.com",
    replyTo: "hello@example.com",
    listId: "l-nope",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_LIST_NOT_FOUND: list l-nope was not found",
  });
});

test("every Newsletter tool surfaces a denial with the permission named — the sibling-arm check across all 14", async () => {
  const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["newsletter_list_campaigns", {}],
    ["newsletter_get_campaign", { campaignId: "c-1" }],
    ["newsletter_list_lists", {}],
    ["newsletter_list_subscriptions", { listId: "l-1" }],
    ["newsletter_list_send_log", { campaignId: "c-1" }],
    ["newsletter_create_campaign", { subject: "s", fromName: "n", fromEmail: "a@b.co", replyTo: "a@b.co", listId: "l-1" }],
    ["newsletter_update_campaign", { campaignId: "c-1", subject: "s" }],
    ["newsletter_cancel_campaign", { campaignId: "c-1" }],
    ["newsletter_pause_campaign", { campaignId: "c-1" }],
    ["newsletter_create_list", { name: "n", slug: "s" }],
    ["newsletter_archive_list", { listId: "l-1" }],
    ["newsletter_create_subscription", { listId: "l-1", subscriberId: "sub-1" }],
    ["newsletter_remove_subscription", { listId: "l-1", subscriptionId: "s-1" }],
    ["newsletter_resend_confirmation", { subscriptionId: "s-1" }],
  ];

  const inputs = new Map(calls);
  const registrations = buildNewsletterRegistrations(makeRouteDeps());
  assert.deepEqual(registrations.map((registration) => registration.descriptor.id).sort(), [...inputs.keys()].sort());
  for (const registration of registrations) {
    const toolId = registration.descriptor.id;
    const input = inputs.get(toolId)!;
    const permission = newsletterAgentToolCatalog.find((tool) => tool.name === toolId)!.authorization.permission;
    const harness = await buildHarness(makeRouteDeps({ allow: false }));

    const result = await call(harness, toolId, input);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /^NEWSLETTER_FORBIDDEN: principal 'principal-1' is not authorized for 'admin\.newsletter\./, `${toolId}: ${result.error.message}`);
    assert.equal(result.error.message, `NEWSLETTER_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for '${permission}' (insufficient_permission)`);
    if (!permission.endsWith(".read")) {
      const readOnly = await buildHarness(makeRouteDeps({ readOnly: true }));
      const denied = await call(readOnly, toolId, input);
      assert.equal(denied.ok, false, `${toolId}: read permissions must not authorize mutations`);
      if (denied.ok) continue;
      assert.deepEqual(denied.error, { code: "BAD_REQUEST", message: `NEWSLETTER_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for '${permission}' (insufficient_permission)` });
    }
  }
});

function seedList(deps: NewsletterToolDeps, isDefault = false) {
  return deps.newsletterListRepo.save({ id: "l-1", workspaceId: WORKSPACE_ID, name: "Readers", slug: "readers", isDefault, status: "active", createdAt: NOW, updatedAt: NOW });
}

async function expectBadRequest(deps: NewsletterToolDeps, toolId: string, input: unknown, message: string) {
  const result = await call(await buildHarness(deps), toolId, input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, { code: "BAD_REQUEST", message });
}

test("authorized tools expose reachable validation, conflict, protected-default, subscriber and noneditable errors", async () => {
  const validation = makeRouteDeps();
  await expectBadRequest(validation, "newsletter_create_list", { name: "   ", slug: "empty" }, "NEWSLETTER_VALIDATION_FAILED: name must not be empty");

  const conflict = makeRouteDeps();
  await seedList(conflict);
  await expectBadRequest(conflict, "newsletter_create_list", { name: "Duplicate", slug: "readers" }, "NEWSLETTER_CONFLICT: a list with slug 'readers' already exists. Nothing was written. Re-read the record to get its current version and resend with that as expectedVersion.");

  const protectedList = makeRouteDeps();
  await seedList(protectedList, true);
  await expectBadRequest(protectedList, "newsletter_archive_list", { listId: "l-1" }, "NEWSLETTER_DEFAULT_LIST_PROTECTED: the default list cannot be archived");

  const missingSubscriber = makeRouteDeps();
  await seedList(missingSubscriber);
  await expectBadRequest(missingSubscriber, "newsletter_create_subscription", { listId: "l-1", subscriberId: "ghost" }, "NEWSLETTER_SUBSCRIBER_NOT_FOUND: subscriber ghost was not found");

  const noneditable = makeRouteDeps();
  await seedList(noneditable);
  await noneditable.newsletterCampaignRepo.saveCampaignRow({ id: "c-1", workspaceId: WORKSPACE_ID, status: "sent", subject: "Hello", preheader: null, fromName: "Sender", fromEmail: "sender@example.com", replyTo: "replies@example.com", listId: "l-1", scheduledAt: null, sendStartedAt: null, audienceSnapshotId: null, counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 }, version: 1, createdByPrincipal: PRINCIPAL_ID, createdAt: NOW, updatedAt: NOW });
  await expectBadRequest(noneditable, "newsletter_update_campaign", { campaignId: "c-1", subject: "New" }, "NEWSLETTER_CAMPAIGN_NOT_EDITABLE: campaign is 'sent' and cannot be edited");
});

test("authorized list and campaign tools return exact views and persist edits", async () => {
  const deps = makeRouteDeps();
  const harness = await buildHarness(deps);
  const list = await call(harness, "newsletter_create_list", { name: "Readers", slug: "readers" });
  assert.equal(list.ok, true);
  if (!list.ok) return;
  assert.deepEqual(list.value.result.output, { list: { id: "id-1", name: "Readers", slug: "readers", isDefault: false, status: "active" } });
  const created = await call(harness, "newsletter_create_campaign", { subject: "Hello", preheader: "Preview", fromName: "Sender", fromEmail: "sender@example.com", replyTo: "replies@example.com", listId: "id-1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const expected = { id: "id-2", status: "draft", subject: "Hello", preheader: "Preview", fromName: "Sender", fromEmail: "sender@example.com", replyTo: "replies@example.com", listId: "id-1", scheduledAt: null, counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 }, version: 1, createdAt: NOW, updatedAt: NOW };
  assert.deepEqual(created.value.result.output, { campaign: expected });
  const edited = await call(harness, "newsletter_update_campaign", { campaignId: "id-2", subject: "Edited" });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.deepEqual(edited.value.result.output, { campaign: { ...expected, subject: "Edited", version: 2 } });
  assert.equal((await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "id-2" }))?.subject, "Edited");
  const fetched = await call(harness, "newsletter_get_campaign", { campaignId: "id-2" });
  assert.equal(fetched.ok, true);
  if (!fetched.ok) return;
  assert.deepEqual(fetched.value.result.output, edited.value.result.output);
});

test("authorized subscription, archive, cancel and pause tools persist and return their mapped views", async () => {
  const deps = makeRouteDeps();
  await seedList(deps);
  const sentEmails: { to: { email: string }; html?: string }[] = [];
  deps.originRegistry = { canonicalOrigin: async () => ({ scheme: "https", host: "example.com", verifiedAt: NOW, source: "workspace-setting" }), isAllowedRedirectTarget: async () => true, isAllowedEgressTarget: async () => true };
  deps.mailer = { capabilities: () => ({ driver: "console", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }), send: async (message) => { sentEmails.push(message); return { ok: true, providerMessageId: "pm-1", acceptedAt: NOW }; }, sendBatch: async () => [] };
  deps.newsletterSubscriberDirectory = { getContact: async (input) => { assert.deepEqual(input, { workspaceId: WORKSPACE_ID, subscriberId: "subscriber-1" }); return { workspaceId: WORKSPACE_ID, subscriberId: "subscriber-1", email: "reader@example.com", emailDeliverable: true }; }, getContacts: async () => [] };
  const harness = await buildHarness(deps);
  async function output(toolId: string, input: unknown) {
    const result = await call(harness, toolId, input);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) throw new Error("expected success");
    return result.value.result.output;
  }
  const pending = { id: "id-1", listId: "l-1", subscriberId: "subscriber-1", status: "pending", source: "admin", subscribedAt: null, unsubscribedAt: null };
  assert.deepEqual(await output("newsletter_create_subscription", { listId: "l-1", subscriberId: "subscriber-1" }), { subscription: pending });
  assert.deepEqual(await output("newsletter_list_subscriptions", { listId: "l-1" }), { subscriptions: [pending] });
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to.email, "reader@example.com");
  assert.match(sentEmails[0].html ?? "", /href="https:\/\/example.com\/newsletter\/confirm\?token=/);
  assert.deepEqual(await output("newsletter_resend_confirmation", { subscriptionId: "id-1" }), { delivered: false, mailDeliveryAvailable: false, note: "Email sending is not configured. Configure an SMTP credential or a mail adapter in Agent Plugins to send real email." });
  assert.equal(sentEmails.length, 1);
  assert.equal((await deps.newsletterConfirmationTokenRepo.findUnconsumedBySubscription({ workspaceId: WORKSPACE_ID, subscriptionId: "id-1" })).length, 1);
  assert.deepEqual(await output("newsletter_remove_subscription", { listId: "l-1", subscriptionId: "id-1" }), { subscription: { ...pending, status: "unsubscribed", unsubscribedAt: NOW } });
  assert.equal((await deps.newsletterSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: "id-1" }))?.status, "unsubscribed");
  assert.deepEqual(await output("newsletter_archive_list", { listId: "l-1" }), { list: { id: "l-1", name: "Readers", slug: "readers", isDefault: false, status: "archived" } });
  assert.deepEqual(await output("newsletter_list_lists", {}), { lists: [{ id: "l-1", name: "Readers", slug: "readers", isDefault: false, status: "archived" }] });

  const campaign = { id: "c-1", workspaceId: WORKSPACE_ID, status: "draft" as const, subject: "Hello", preheader: null, fromName: "Sender", fromEmail: "sender@example.com", replyTo: "replies@example.com", listId: "l-1", scheduledAt: null, sendStartedAt: null, audienceSnapshotId: null, counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 }, version: 1, createdByPrincipal: PRINCIPAL_ID, createdAt: NOW, updatedAt: NOW };
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign);
  const view = { id: campaign.id, status: campaign.status, subject: campaign.subject, preheader: null, fromName: campaign.fromName, fromEmail: campaign.fromEmail, replyTo: campaign.replyTo, listId: "l-1", scheduledAt: null, counters: campaign.counters, version: 1, createdAt: NOW, updatedAt: NOW };
  assert.deepEqual(await output("newsletter_list_campaigns", { status: "draft" }), { campaigns: [view] });
  assert.deepEqual(await output("newsletter_cancel_campaign", { campaignId: "c-1" }), { campaign: { ...view, status: "canceled" } });
  assert.equal((await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "c-1" }))?.status, "canceled");
  await deps.newsletterCampaignRepo.saveCampaignRow({ ...campaign, id: "c-2", status: "sending" });
  assert.deepEqual(await output("newsletter_pause_campaign", { campaignId: "c-2" }), { campaign: { ...view, id: "c-2", status: "paused" } });
  assert.equal((await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "c-2" }))?.status, "paused");
  await deps.newsletterSendRepo.save({ id: "send-1", workspaceId: WORKSPACE_ID, campaignId: "c-1", audienceSnapshotId: "snap-1", subscriberId: "subscriber-1", recipientEmail: "reader@example.com", status: "delivered", attempts: 1, idempotencyKey: "key-1", providerMessageId: "pm-1", lastError: null, nextAttemptAt: null, createdAt: NOW, updatedAt: NOW });
  assert.deepEqual(await output("newsletter_list_send_log", { campaignId: "c-1" }), { sends: [{ id: "send-1", subscriberId: "subscriber-1", recipientEmail: "reader@example.com", status: "delivered", attempts: 1, providerMessageId: "pm-1", lastError: null, nextAttemptAt: null, updatedAt: NOW }] });
});
