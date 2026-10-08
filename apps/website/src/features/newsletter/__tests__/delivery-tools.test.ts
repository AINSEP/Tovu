import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionOptions, type ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { MCP_UI_REDEEMABLE_TOOL_IDS } from "#src/assistant/mcp-ui-tool-calls";
import { createHookRegistry } from "../hooks.js";
import { InMemoryNewsletterAudienceSnapshotRepo, InMemoryNewsletterCampaignRepo, InMemoryNewsletterConfirmationTokenRepo, InMemoryNewsletterListRepo, InMemoryNewsletterSendRepo, InMemoryNewsletterSubscriptionRepo } from "../repo.memory.js";
import { buildNewsletterDeliveryRegistrations, newsletterDeliveryDerivedRisk, type NewsletterDeliveryToolDeps } from "../delivery/tool-registrations.js";
import { buildNewsletterRegistrations } from "../tool-registrations.js";
import { handleSendBatchClaimed, SEND_BATCH_CLAIMED_EVENT, type SendBatchJob } from "../send-pipeline.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const NOW = "2026-10-01T00:00:00.000Z";
const MAIL_OFF = "NEWSLETTER_MAIL_OFF: Email sending is not configured. Configure an SMTP credential or a mail adapter in Agent Plugins before sending newsletters. Nothing was sent or scheduled.";

async function fixture(driver = "smtp", status = "draft") {
  let id = 0;
  const messages: unknown[] = [];
  const deps: NewsletterDeliveryToolDeps = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => NOW }, idGen: { newId: () => `id-${++id}` },
    outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(),
    mailer: { capabilities: () => ({ driver, maxBatchSize: 1, supportsAttachments: false, supportsIdempotencyKey: true, supportsWebhookFeedback: false }), sendBatch: async () => [], send: async (message) => { messages.push(message); return { ok: true, providerMessageId: "provider-1", acceptedAt: NOW }; } },
    originRegistry: { canonicalOrigin: async () => ({ scheme: "https", host: "example.com", port: 443 }), isAllowedEgressTarget: async () => true } as NewsletterDeliveryToolDeps["originRegistry"],
    newsletterReady: Promise.resolve(), newsletterCampaignRepo: new InMemoryNewsletterCampaignRepo(),
    newsletterListRepo: new InMemoryNewsletterListRepo(), newsletterSubscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    newsletterAudienceSnapshotRepo: new InMemoryNewsletterAudienceSnapshotRepo(), newsletterSendRepo: new InMemoryNewsletterSendRepo(),
    newsletterConfirmationTokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    newsletterSubscriberDirectory: { getContact: async () => null, getContacts: async () => [] },
    newsletterHooks: createHookRegistry(), membersConsentCapability: null,
    ownerPrincipalId: Promise.resolve("owner"), userRepo: { findByPrincipalId: async (input) => { assert.deepEqual(input, { workspaceId: "ws", principalId: "owner" }); return { workspaceId: "ws", principalId: "owner", username: "owner", passwordHash: "hash", email: "owner@example.com" }; } },
  };
  await deps.newsletterListRepo.save({ id: "list", workspaceId: "ws", name: "Readers", slug: "readers", isDefault: false, status: "active", createdAt: NOW, updatedAt: NOW });
  await deps.newsletterCampaignRepo.saveCampaignRow({ id: "campaign", workspaceId: "ws", status: status as "draft", subject: "October news", preheader: "Preview", fromName: "Editor", fromEmail: "sender@example.com", replyTo: "reply@example.com", listId: "list", scheduledAt: null, sendStartedAt: null, audienceSnapshotId: null, counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 }, version: 1, createdByPrincipal: "owner", createdAt: NOW, updatedAt: NOW });
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tools = new Map(buildNewsletterDeliveryRegistrations(deps, { surfaceExchanges: store }).map((tool) => [tool.descriptor.id, tool]));
  const call = (toolId: string, input: unknown = { campaignId: "campaign" }, extra: Partial<ToolExecutionContext> & ToolExecutionOptions = {}) => {
    const tool = tools.get(toolId);
    assert.ok(tool, `expected ${toolId} to be registered`);
    const { emitSurface, ...context } = extra;
    return tool.handler({ executionId: "exec", principal: { id: "operator" }, run: { id: "run" }, input, signal: new AbortController().signal, ...context }, { emitSurface });
  };
  const raise = async (toolId: string, input: unknown = { campaignId: "campaign" }) => {
    let emitted!: (value: unknown) => void;
    const emission = new Promise<unknown>((resolve) => { emitted = resolve; });
    const pending = call(toolId, input, { emitSurface: async (value) => { emitted(value); } });
    const surface = await emission as { payload: { resource: { resource: { text: string } } } };
    const html = surface.payload.resource.resource.text;
    const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1];
    return { pending, html, answer: (params: Record<string, unknown>, principalId = "operator", callbackTool = toolId) => store.deliver({ exchangeId, principalId, params }, { toolId: callbackTool }) };
  };
  return { deps, tools, store, messages, call, raise };
}

test("delivery tools are registered as durable writes with independently derived risk", async () => {
  const h = await fixture();
  assert.deepEqual([...h.tools.keys()].sort(), ["newsletter_resume_campaign", "newsletter_schedule_campaign", "newsletter_send_campaign", "newsletter_send_test"]);
  for (const [id, tool] of h.tools) {
    assert.equal(tool.descriptor.readOnly, false);
    assert.equal(newsletterDeliveryDerivedRisk.get(id), "mutates-durable-state");
  }
});

test("the browser callback policy admits newsletter confirmation cards", () => {
  for (const id of ["newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) assert.equal(MCP_UI_REDEEMABLE_TOOL_IDS.has(id), true, `${id} must accept its browser exchange callback`);
  assert.equal(MCP_UI_REDEEMABLE_TOOL_IDS.has("newsletter_send_test"), false);
});

test("test send goes to the stored owner only without a confirmation card", async () => {
  const h = await fixture();
  assert.deepEqual(await h.call("newsletter_send_test"), { delivered: true, mailDeliveryAvailable: true });
  assert.deepEqual(h.messages, [{ workspaceId: "ws", to: { email: "owner@example.com" }, from: { email: "sender@example.com", name: "Editor" }, replyTo: { email: "reply@example.com" }, subject: "[TEST] October news", text: "Preview" }]);
  assert.deepEqual(await h.deps.newsletterSendRepo.listByCampaign({ workspaceId: "ws", campaignId: "campaign" }), []);
});

test("test send refuses caller-supplied addresses and a missing owner email", async () => {
  const h = await fixture();
  await assert.rejects(h.call("newsletter_send_test", { campaignId: "campaign", testAddresses: ["reader@example.com"] }), { message: "NEWSLETTER_OWNER_ONLY: Test sends only use the site owner's stored email. Remove recipient fields and retry." });
  h.deps.userRepo.findByPrincipalId = async () => null;
  await assert.rejects(h.call("newsletter_send_test"), { message: "NEWSLETTER_OWNER_EMAIL_MISSING: Set the site owner's email in their user profile before sending a test." });
  assert.deepEqual(h.messages, []);
});

test("mail-off refuses every delivery action before a card or durable mutation", async () => {
  for (const driver of ["console", "memory"]) {
    const h = await fixture(driver);
    for (const toolId of ["newsletter_send_test", "newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) assert.deepEqual(await h.call(toolId, toolId === "newsletter_schedule_campaign" ? { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" } : { campaignId: "campaign" }), { delivered: false, mailDeliveryAvailable: false, note: MAIL_OFF });
    assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
    assert.deepEqual(h.messages, []);
  }
});

test("delivery tools check permission before reading campaign or sending", async () => {
  const h = await fixture();
  h.deps.authorize = async () => ({ allowed: false, reason: "insufficient_permission" });
  h.deps.newsletterCampaignRepo.findById = async () => { assert.fail("must not read after denied permission"); };
  for (const id of ["newsletter_send_test", "newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) {
    const permission = id === "newsletter_send_test" ? "admin.newsletter.campaign.send_test" : id === "newsletter_schedule_campaign" ? "admin.newsletter.campaign.schedule" : "admin.newsletter.campaign.send";
    await assert.rejects(h.call(id), { message: `NEWSLETTER_FORBIDDEN: principal 'operator' is not authorized for '${permission}' (insufficient_permission)` });
  }
  assert.deepEqual(h.messages, []);
});

test("mass actions cannot self-confirm through tool input or run without a browser channel", async () => {
  const h = await fixture();
  for (const id of ["newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) {
    await assert.rejects(h.call(id, { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z", decision: "confirm" }), { message: `NEWSLETTER_NO_CONFIRMATION_CHANNEL: ${id}: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.` });
  }
});

test("schedule card is bound to its human and tool; cancellation makes no changes", async () => {
  const h = await fixture();
  const raised = await h.raise("newsletter_schedule_campaign", { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" });
  assert.match(raised.html, /October news/);
  assert.match(raised.html, /2026-10-02T12:00:00.000Z/);
  raised.answer({ decision: "confirm" }, "other");
  raised.answer({ decision: "confirm" }, "operator", "newsletter_send_campaign");
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
  raised.answer({ decision: "cancel" });
  assert.deepEqual(await raised.pending, { confirmed: false, reason: "declined", delivered: false, mailDeliveryAvailable: true });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
});

test("confirmed schedule wraps the existing service and discloses lack of an automatic scheduler", async () => {
  const h = await fixture();
  const raised = await h.raise("newsletter_schedule_campaign", { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" });
  raised.answer({ decision: "confirm" });
  assert.deepEqual(await raised.pending, { confirmed: true, scheduled: true, campaignId: "campaign", status: "scheduled", scheduledAt: "2026-10-02T12:00:00.000Z", delivered: false, mailDeliveryAvailable: true, note: "The issue's scheduled date was saved. Automatic delivery at that time is not wired; launch it with newsletter_send_campaign when due." });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "scheduled");
});

test("a campaign changed while the card is open is refused even when version stayed the same", async () => {
  const h = await fixture();
  const raised = await h.raise("newsletter_schedule_campaign", { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" });
  const row = (await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))!;
  await h.deps.newsletterCampaignRepo.saveCampaignRow({ ...row, subject: "Changed subject" });
  raised.answer({ decision: "confirm" });
  await assert.rejects(raised.pending, { message: "NEWSLETTER_STALE_CONFIRMATION: The campaign changed while the card was open. Review it and request a new confirmation." });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
});

test("real send still respects the existing launch gate after human approval", async () => {
  const h = await fixture();
  const raised = await h.raise("newsletter_send_campaign");
  raised.answer({ decision: "confirm" });
  await assert.rejects(raised.pending, { message: "NEWSLETTER_LAUNCH_GATE_BLOCKED: sending_enabled_false, consent_capability_unbound. Enable newsletter sending and bind Members consent before launching a mass send." });
  assert.deepEqual(h.messages, []);
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
});

test("confirmed send freezes an audience and uses the existing outbox pipeline once", async () => {
  const h = await fixture("smtp", "scheduled");
  h.deps.newsletterSendingEnabled = async () => true;
  h.deps.membersConsentCapability = { request: async () => ({ requested: true }), confirm: async () => ({ status: "granted", consentRevisionId: "consent" }), revoke: async () => ({ status: "revoked" }) };
  await h.deps.newsletterSubscriptionRepo.save({ id: "subscription", workspaceId: "ws", listId: "list", subscriberId: "subscriber", status: "subscribed", source: "admin", subscribedAt: NOW, unsubscribedAt: null, consentRevisionIdAtSubscribe: "consent", createdAt: NOW, updatedAt: NOW });
  h.deps.newsletterSubscriberDirectory.getContacts = async () => [{ workspaceId: "ws", subscriberId: "subscriber", email: "reader@example.com", emailDeliverable: true }];
  const { toNewsletterSendPipelineDeps } = await import("../tool-registrations.js");
  await h.deps.bus.subscribe({ eventName: SEND_BATCH_CLAIMED_EVENT, handler: async (event) => handleSendBatchClaimed({ deps: toNewsletterSendPipelineDeps(h.deps), job: event.payload as SendBatchJob }) });
  const raised = await h.raise("newsletter_send_campaign");
  assert.deepEqual(h.messages, []);
  raised.answer({ decision: "confirm" });
  assert.deepEqual(await raised.pending, { confirmed: true, started: true, campaignId: "campaign", status: "sending", delivered: false, mailDeliveryAvailable: true });
  assert.equal(h.messages.length, 1);
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "sent");
  await assert.rejects(h.call("newsletter_send_campaign"), { message: "NEWSLETTER_NO_CONFIRMATION_CHANNEL: newsletter_send_campaign: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed." });
  assert.equal(h.messages.length, 1);
});

test("resuming a paused issue requires a card and the existing launch gate", async () => {
  const h = await fixture("smtp", "paused");
  const declined = await h.raise("newsletter_resume_campaign");
  declined.answer({ __typedAnswer: "yes please" });
  assert.deepEqual(await declined.pending, { confirmed: false, reason: "declined", delivered: false, mailDeliveryAvailable: true });
  const approved = await h.raise("newsletter_resume_campaign");
  approved.answer({ decision: "confirm" });
  await assert.rejects(approved.pending, { message: "NEWSLETTER_LAUNCH_GATE_BLOCKED: sending_enabled_false, consent_capability_unbound. Enable newsletter sending and bind Members consent before launching a mass send." });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "paused");
});

test("a confirmed issue with an empty audience finishes without dispatching mail", async () => {
  const h = await fixture("smtp", "scheduled");
  h.deps.newsletterSendingEnabled = async () => true;
  h.deps.membersConsentCapability = { request: async () => ({ requested: true }), confirm: async () => ({ status: "granted", consentRevisionId: "consent" }), revoke: async () => ({ status: "revoked" }) };
  const raised = await h.raise("newsletter_send_campaign");
  raised.answer({ decision: "confirm" });
  assert.deepEqual(await raised.pending, { confirmed: true, started: true, campaignId: "campaign", status: "sending", delivered: false, mailDeliveryAvailable: true });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "sent");
  assert.deepEqual(h.messages, []);
});

test("confirmed resume dispatches only pending rows from the frozen audience", async () => {
  const h = await fixture("smtp", "paused");
  h.deps.newsletterSendingEnabled = async () => true;
  h.deps.membersConsentCapability = { request: async () => ({ requested: true }), confirm: async () => ({ status: "granted", consentRevisionId: "consent" }), revoke: async () => ({ status: "revoked" }) };
  const campaign = (await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))!;
  await h.deps.newsletterCampaignRepo.saveCampaignRow({ ...campaign, audienceSnapshotId: "snapshot" });
  await h.deps.newsletterAudienceSnapshotRepo.save({ id: "snapshot", workspaceId: "ws", campaignId: "campaign", listId: "list", recipientCount: 2, createdAt: NOW });
  await h.deps.newsletterSubscriptionRepo.save({ id: "subscription", workspaceId: "ws", listId: "list", subscriberId: "subscriber", status: "subscribed", source: "admin", subscribedAt: NOW, unsubscribedAt: null, consentRevisionIdAtSubscribe: "consent", createdAt: NOW, updatedAt: NOW });
  const pending = { id: "send", workspaceId: "ws", campaignId: "campaign", audienceSnapshotId: "snapshot", subscriberId: "subscriber", recipientEmail: "reader@example.com", status: "pending" as const, attempts: 0, idempotencyKey: "pending-key", providerMessageId: null, lastError: null, nextAttemptAt: null, createdAt: NOW, updatedAt: NOW };
  await h.deps.newsletterSendRepo.save(pending);
  await h.deps.newsletterSendRepo.save({ ...pending, id: "already-delivered", status: "delivered", idempotencyKey: "done-key", providerMessageId: "original-provider" });
  const { toNewsletterSendPipelineDeps } = await import("../tool-registrations.js");
  await h.deps.bus.subscribe({ eventName: SEND_BATCH_CLAIMED_EVENT, handler: async (event) => handleSendBatchClaimed({ deps: toNewsletterSendPipelineDeps(h.deps), job: event.payload as SendBatchJob }) });
  const raised = await h.raise("newsletter_resume_campaign");
  assert.deepEqual(h.messages, []);
  raised.answer({ decision: "confirm" });
  assert.deepEqual(await raised.pending, { confirmed: true, started: true, campaignId: "campaign", status: "sending", delivered: false, mailDeliveryAvailable: true });
  assert.equal(h.messages.length, 1);
  assert.equal((await h.deps.newsletterSendRepo.findById({ workspaceId: "ws", id: "send" }))?.status, "delivered");
  assert.equal((await h.deps.newsletterSendRepo.findById({ workspaceId: "ws", id: "already-delivered" }))?.providerMessageId, "original-provider");
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "sent");
});

test("resume reports a committed start honestly when requeueing later fails", async () => {
  const h = await fixture("smtp", "paused");
  h.deps.newsletterSendingEnabled = async () => true;
  h.deps.membersConsentCapability = { request: async () => ({ requested: true }), confirm: async () => ({ status: "granted", consentRevisionId: "consent" }), revoke: async () => ({ status: "revoked" }) };
  const campaign = (await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))!;
  await h.deps.newsletterCampaignRepo.saveCampaignRow({ ...campaign, audienceSnapshotId: "snapshot" });
  await h.deps.newsletterSendRepo.save({ id: "send", workspaceId: "ws", campaignId: "campaign", audienceSnapshotId: "snapshot", subscriberId: "subscriber", recipientEmail: "reader@example.com", status: "pending", attempts: 0, idempotencyKey: "pending-key", providerMessageId: null, lastError: null, nextAttemptAt: null, createdAt: NOW, updatedAt: NOW });
  h.deps.outbox.enqueue = async () => { throw new Error("private@example.com secret endpoint failed"); };
  const raised = await h.raise("newsletter_resume_campaign");
  raised.answer({ decision: "confirm" });
  assert.deepEqual(await raised.pending, { confirmed: true, started: true, campaignId: "campaign", status: "sending", delivered: false, mailDeliveryAvailable: true, note: "The issue started, but audience processing needs attention. Inspect the send log before retrying; delivery is not confirmed." });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "sending");
  assert.deepEqual(h.messages, []);
});

test("owner test reports provider rejection without exposing its message", async () => {
  const h = await fixture();
  h.deps.mailer.send = async () => ({ ok: false, retryable: false, errorCode: "BAD_ADDRESS", message: "private@example.com was rejected at a private endpoint" });
  assert.deepEqual(await h.call("newsletter_send_test"), { delivered: false, mailDeliveryAvailable: true, note: "The mail provider did not accept the test email. Check the email provider configuration and retry." });
});

test("missing campaigns and invalid schedule dates refuse with actionable errors", async () => {
  const h = await fixture();
  for (const id of ["newsletter_send_test", "newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) await assert.rejects(h.call(id, { campaignId: "missing" }), { message: "NEWSLETTER_CAMPAIGN_NOT_FOUND: campaign missing was not found" });
  await assert.rejects(h.call("newsletter_schedule_campaign", { campaignId: "campaign", scheduledAt: "tomorrow" }), { message: "NEWSLETTER_VALIDATION_FAILED: scheduledAt must be a valid ISO date-time string with an explicit timezone" });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
});

test("mail configuration changes during confirmation refuse the approved send", async () => {
  const h = await fixture();
  const raised = await h.raise("newsletter_schedule_campaign", { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" });
  h.deps.mailer.capabilities = () => ({ driver: "console", supportsIdempotencyKey: false, maxBatchSize: 1, supportsAttachments: false, supportsWebhookFeedback: false });
  raised.answer({ decision: "confirm" });
  assert.deepEqual(await raised.pending, { delivered: false, mailDeliveryAvailable: false, note: MAIL_OFF });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
});

test("abort closes a waiting confirmation without scheduling", async () => {
  const h = await fixture();
  const abort = new AbortController();
  let emitted!: () => void;
  const shown = new Promise<void>((resolve) => { emitted = resolve; });
  const pending = h.call("newsletter_schedule_campaign", { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" }, { signal: abort.signal, emitSurface: async () => { emitted(); } });
  await shown;
  abort.abort();
  assert.deepEqual(await pending, { confirmed: false, reason: "abandoned", delivered: false, mailDeliveryAvailable: true });
  assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
});

test("approval does not survive permission revocation while the card is open", async () => {
  for (const toolId of ["newsletter_send_campaign", "newsletter_schedule_campaign", "newsletter_resume_campaign"]) {
    const h = await fixture();
    const input = { campaignId: "campaign", scheduledAt: "2026-10-02T12:00:00.000Z" };
    const raised = await h.raise(toolId, input);
    h.deps.authorize = async () => ({ allowed: false, reason: "insufficient_permission" });
    raised.answer({ decision: "confirm" });
    const permission = toolId === "newsletter_schedule_campaign" ? "admin.newsletter.campaign.schedule" : "admin.newsletter.campaign.send";
    await assert.rejects(raised.pending, { message: `NEWSLETTER_FORBIDDEN: principal 'operator' is not authorized for '${permission}' (insufficient_permission)` });
    assert.equal((await h.deps.newsletterCampaignRepo.findById({ workspaceId: "ws", id: "campaign" }))?.status, "draft");
    assert.deepEqual(h.messages, []);
    assert.equal(h.store.size(), 0);
  }
});

test("an aborted resend refuses before looking up a subscriber", async () => {
  const h = await fixture();
  const tool = buildNewsletterRegistrations(h.deps).find(entry => entry.descriptor.id === "newsletter_resend_confirmation")!;
  const abort = new AbortController(); abort.abort();
  h.deps.newsletterSubscriptionRepo.findById = async () => { assert.fail("aborted resend must not look up subscriptions"); };
  assert.deepEqual(await tool.handler({ executionId: "exec", principal: { id: "operator" }, run: { id: "run" }, input: { subscriptionId: "subscription" }, signal: abort.signal }), { confirmed: false, reason: "abandoned", delivered: false, mailDeliveryAvailable: true });
  assert.deepEqual(h.messages, []);
});

test("resend mail-off is constant for existing and missing subscriptions without minting tokens", async () => {
  const h = await fixture("console");
  await h.deps.newsletterSubscriptionRepo.save({ id: "subscription", workspaceId: "ws", listId: "list", subscriberId: "subscriber", status: "pending", source: "admin", subscribedAt: null, unsubscribedAt: null, consentRevisionIdAtSubscribe: null, createdAt: NOW, updatedAt: NOW });
  const tool = buildNewsletterRegistrations(h.deps).find((tool) => tool.descriptor.id === "newsletter_resend_confirmation")!;
  for (const subscriptionId of ["subscription", "missing"]) {
    assert.deepEqual(await tool.handler({ executionId: "exec", principal: { id: "operator" }, run: { id: "run" }, input: { subscriptionId }, signal: new AbortController().signal }), { delivered: false, mailDeliveryAvailable: false, note: "Email sending is not configured. Configure an SMTP credential or a mail adapter in Agent Plugins to send real email." });
    assert.deepEqual(await h.deps.newsletterConfirmationTokenRepo.findUnconsumedBySubscription({ workspaceId: "ws", subscriptionId }), []);
  }
});

test("resend runs directly and hides missing contacts and subscription status", async () => {
  for (const scenario of [
    { exists: true, contact: true, status: "pending", sends: 1 },
    { exists: false, contact: true, status: "pending", sends: 0 },
    { exists: true, contact: false, status: "pending", sends: 0 },
    { exists: true, contact: true, status: "subscribed", sends: 0 },
    { exists: true, contact: true, status: "unsubscribed", sends: 0 },
  ] as const) {
    const h = await fixture();
    if (scenario.exists) await h.deps.newsletterSubscriptionRepo.save({ id: "subscription", workspaceId: "ws", listId: "list", subscriberId: "subscriber", status: scenario.status, source: "admin", subscribedAt: null, unsubscribedAt: null, consentRevisionIdAtSubscribe: null, createdAt: NOW, updatedAt: NOW });
    h.deps.newsletterSubscriberDirectory.getContact = async () => scenario.contact ? ({ workspaceId: "ws", subscriberId: "subscriber", email: "reader@example.com", emailDeliverable: true }) : null;
    const tool = buildNewsletterRegistrations(h.deps, { surfaceExchanges: h.store }).find((tool) => tool.descriptor.id === "newsletter_resend_confirmation")!;
    h.tools.set(tool.descriptor.id, tool);
    assert.deepEqual(await h.call("newsletter_resend_confirmation", { subscriptionId: "subscription" }, { emitSurface: async () => assert.fail("ordinary resend asked") }), { delivered: true, mailDeliveryAvailable: true });
    assert.equal(h.store.size(), 0);
    assert.equal(h.messages.length, scenario.sends);
  }
});

test("resend acknowledgement does not expose contact or provider failures", async () => {
  for (const failureAt of ["contact", "origin"]) {
    const h = await fixture();
    await h.deps.newsletterSubscriptionRepo.save({ id: "subscription", workspaceId: "ws", listId: "list", subscriberId: "subscriber", status: "pending", source: "admin", subscribedAt: null, unsubscribedAt: null, consentRevisionIdAtSubscribe: null, createdAt: NOW, updatedAt: NOW });
    h.deps.newsletterSubscriberDirectory.getContact = async () => {
      if (failureAt === "contact") throw new ToolInputError({ message: "reader@example.com lookup failed" });
      return { workspaceId: "ws", subscriberId: "subscriber", email: "reader@example.com", emailDeliverable: true };
    };
    h.deps.originRegistry.canonicalOrigin = async () => { throw new Error("private endpoint failed"); };
    const tool = buildNewsletterRegistrations(h.deps, { surfaceExchanges: h.store }).find((entry) => entry.descriptor.id === "newsletter_resend_confirmation")!;
    h.tools.set(tool.descriptor.id, tool);
    assert.deepEqual(await h.call("newsletter_resend_confirmation", { subscriptionId: "subscription" }), { delivered: true, mailDeliveryAvailable: true });
    assert.deepEqual(h.messages, []);
  }
});
