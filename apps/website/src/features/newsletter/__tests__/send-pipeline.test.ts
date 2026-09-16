/**
 * @file `send-pipeline.ts` — `NewsletterSendPipeline` (ADR-PIPE-011 C-017). This file had zero
 * tests before this pass (30.8% func / 49.6% line coverage, the worst gap found across the
 * newsletter/members/forms baseline audit) — full first-pass coverage of every exported function.
 *
 * Includes a regression test for a real defect found while writing these tests: see "BUG" below.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeSend,
  claimBatch,
  completeIfDrained,
  createHookRegistry,
  dispatchRow,
  freezeAudience,
  handleSendBatchClaimed,
  NEWSLETTER_SEND_ROW_LEASE_MS,
  pauseCampaign,
  recordResult,
  resumeCampaign,
  sendTestCampaign,
  type SendPipelineDeps,
} from "../send-pipeline.js";
import {
  NewsletterCampaignNotEditableError,
  NewsletterCampaignNotFoundError,
  NewsletterLaunchGateBlockedError,
  NewsletterValidationError,
} from "../errors.js";
import { computeOutboxBackoffMs, InMemoryEventBus, InMemoryOutbox, MAX_OUTBOX_ATTEMPTS } from "#src/contracts/core/events/index";
import type { HookRegistry } from "../hooks.js";
import type { LaunchGateDeps } from "../launch-gate.js";
import type { MailerPort } from "#src/platform/mail/index";
import type { SendBatchJob, SubscriberContact, SubscriberDirectoryPort } from "../ports.js";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../repo.memory.js";
import type { CampaignRecord, SendRow, SubscriptionRow } from "../types.js";

const WS = "ws-1";
const clock = { nowIso: () => "2026-08-21T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `id-${++idCounter}` };

/** Yields microtask turns until `predicate` holds, or `maxTurns` is exhausted. Used to observe interleaved async work without a wall-clock sleep. */
async function flushUntil(predicate: () => boolean, maxTurns = 100): Promise<boolean> {
  for (let i = 0; i < maxTurns; i++) {
    if (predicate()) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return predicate();
}

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-1",
    workspaceId: WS,
    status: "scheduled",
    subject: "Hello",
    preheader: null,
    fromName: "Acme",
    fromEmail: "hello@acme.test",
    replyTo: "hello@acme.test",
    listId: "list-1",
    scheduledAt: "2026-08-01T00:00:00.000Z",
    sendStartedAt: null,
    audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1,
    createdByPrincipal: "user-1",
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    ...overrides,
  };
}

function makeSendRow(overrides: Partial<SendRow> = {}): SendRow {
  return {
    id: "send-1",
    workspaceId: WS,
    campaignId: "camp-1",
    audienceSnapshotId: "snap-1",
    subscriberId: "sub-1",
    recipientEmail: "a@test.com",
    status: "pending",
    attempts: 0,
    idempotencyKey: "key-1",
    providerMessageId: null,
    lastError: null,
    nextAttemptAt: null,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    ...overrides,
  };
}

function makeSubscriberDirectory(contacts: SubscriberContact[]): SubscriberDirectoryPort {
  return {
    async getContact(required) {
      return contacts.find((c) => c.workspaceId === required.workspaceId && c.subscriberId === required.subscriberId) ?? null;
    },
    async getContacts(required) {
      return contacts.filter((c) => c.workspaceId === required.workspaceId && required.subscriberIds.includes(c.subscriberId));
    },
  };
}

function makeMailer(sendImpl?: (message: { to: { email: string } }) => { ok: true; providerMessageId: string; acceptedAt: string } | { ok: false; retryable: boolean; errorCode: string; message: string }): MailerPort & { sentTo: string[] } {
  const sentTo: string[] = [];
  return {
    capabilities: () => ({
      driver: "smtp",
      supportsIdempotencyKey: true,
      supportsWebhookFeedback: true,
      maxBatchSize: 100,
      supportsAttachments: false,
    }),
    async send(message, _opts) {
      sentTo.push(message.to.email);
      if (sendImpl) return sendImpl(message);
      return { ok: true, providerMessageId: `pm-${sentTo.length}`, acceptedAt: clock.nowIso() };
    },
    async sendBatch() {
      return [];
    },
    sentTo,
  } as MailerPort & { sentTo: string[] };
}

function makeLaunchGateDeps(overrides: Partial<{ sendingEnabled: boolean; consentBound: boolean; originThrows: boolean; mailerDriver: string }> = {}): LaunchGateDeps {
  const { sendingEnabled = true, consentBound = true, originThrows = false, mailerDriver = "smtp" } = overrides;
  return {
    isSendingEnabled: async () => sendingEnabled,
    consentCapability: consentBound
      ? { request: async () => ({ requested: true }), confirm: async () => ({ status: "granted", consentRevisionId: "r1" }), revoke: async () => ({ status: "revoked" }) }
      : null,
    originRegistry: {
      canonicalOrigin: async () => {
        if (originThrows) throw new Error("no verified origin");
        return { scheme: "https" as const, host: "acme.test", verifiedAt: clock.nowIso(), source: "workspace-setting" as const };
      },
      isAllowedRedirectTarget: async () => true,
      isAllowedEgressTarget: async () => true,
    },
    mailer: {
      capabilities: () => ({ driver: mailerDriver, supportsIdempotencyKey: true, supportsWebhookFeedback: true, maxBatchSize: 100, supportsAttachments: false }),
      send: async () => ({ ok: true, providerMessageId: "m1", acceptedAt: clock.nowIso() }),
      sendBatch: async () => [],
    },
  };
}

interface Rig {
  deps: SendPipelineDeps;
  campaignRepo: InMemoryNewsletterCampaignRepo;
  subscriptionRepo: InMemoryNewsletterSubscriptionRepo;
  audienceSnapshotRepo: InMemoryNewsletterAudienceSnapshotRepo;
  sendRepo: InMemoryNewsletterSendRepo;
  outbox: InMemoryOutbox;
  bus: InMemoryEventBus;
}

function makeRig(opts: {
  campaigns?: CampaignRecord[];
  subscriptions?: SubscriptionRow[];
  contacts?: SubscriberContact[];
  mailer?: MailerPort;
  hooks?: HookRegistry;
  launchGateOverrides?: Parameters<typeof makeLaunchGateDeps>[0];
} = {}): Rig {
  const campaignRepo = new InMemoryNewsletterCampaignRepo({ campaigns: opts.campaigns ?? [] });
  const subscriptionRepo = new InMemoryNewsletterSubscriptionRepo(opts.subscriptions ?? []);
  const audienceSnapshotRepo = new InMemoryNewsletterAudienceSnapshotRepo();
  const sendRepo = new InMemoryNewsletterSendRepo();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const deps: SendPipelineDeps = {
    campaignRepo,
    subscriptionRepo,
    audienceSnapshotRepo,
    sendRepo,
    subscriberDirectory: makeSubscriberDirectory(opts.contacts ?? []),
    hooks: opts.hooks ?? createHookRegistry(),
    mailer: opts.mailer ?? makeMailer(),
    launchGateDeps: makeLaunchGateDeps(opts.launchGateOverrides),
    outbox,
    bus,
    clock,
    ids,
  };
  return { deps, campaignRepo, subscriptionRepo, audienceSnapshotRepo, sendRepo, outbox, bus };
}

/* ------------------------------------------------------------------------------------------------
 * authorizeSend
 * ------------------------------------------------------------------------------------------------ */

test("authorizeSend: happy path -- scheduled campaign moves to sending, revision appended at seq 1", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "scheduled" })] });
  const result = await authorizeSend({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(result.campaign.status, "sending");
  assert.equal(result.campaign.sendStartedAt, clock.nowIso());
  assert.equal(result.launchGateSnapshot.met, true);
  const revisions = await rig.campaignRepo.listRevisions({ workspaceId: WS, campaignId: "camp-1" });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].seq, 1);
});

test("authorizeSend: revision seq increments past existing revisions", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "scheduled" })] });
  await rig.campaignRepo.appendRevision({ campaignId: "camp-1", workspaceId: WS, seq: 1, state: makeCampaign(), actorId: "a", recordedAt: clock.nowIso() });
  await rig.campaignRepo.appendRevision({ campaignId: "camp-1", workspaceId: WS, seq: 2, state: makeCampaign(), actorId: "a", recordedAt: clock.nowIso() });
  await authorizeSend({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  const revisions = await rig.campaignRepo.listRevisions({ workspaceId: WS, campaignId: "camp-1" });
  assert.equal(revisions.length, 3);
  assert.equal(revisions[2].seq, 3);
});

test("authorizeSend: campaign not found", async () => {
  const rig = makeRig();
  await assert.rejects(
    authorizeSend({ deps: rig.deps, input: { workspaceId: WS, campaignId: "nope" } }),
    { message: "campaign nope was not found" }
  );
});

test("authorizeSend: launch gate blocked -- rejects with the full unmet set, campaign left untouched", async () => {
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "scheduled" })],
    launchGateOverrides: { sendingEnabled: false, mailerDriver: "console" },
  });
  await assert.rejects(
    authorizeSend({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterLaunchGateBlockedError);
      assert.equal(err.message, "the Launch Readiness Gate is not satisfied");
      assert.deepEqual(err.unmetPreconditions, ["sending_enabled_false", "mailer_adapter_not_production"]);
      return true;
    }
  );
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.status, "scheduled", "a blocked gate must not mutate the campaign");
});

test("authorizeSend: campaign not in 'scheduled' status -- not-editable error, exact reason text", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "draft" })] });
  await assert.rejects(
    authorizeSend({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterCampaignNotEditableError);
      assert.equal(err.message, "'draft' -> 'sending' is not a permitted transition for any actor tier");
      assert.equal(err.currentStatus, "draft");
      assert.equal(err.attemptedAction, "send");
      return true;
    }
  );
});

/* ------------------------------------------------------------------------------------------------
 * freezeAudience
 * ------------------------------------------------------------------------------------------------ */

test("freezeAudience: materializes 1 snapshot + N send rows, unresolvable subscribers silently excluded (EC-07)", async () => {
  const rig = makeRig({
    campaigns: [makeCampaign()],
    subscriptions: [
      { id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
      { id: "s2", workspaceId: WS, listId: "list-1", subscriberId: "sub-2", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
    ],
    // sub-2 has no matching contact -> excluded, not an error.
    contacts: [{ subscriberId: "sub-1", workspaceId: WS, email: "one@test.com", emailDeliverable: true }],
  });

  const result = await freezeAudience({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", listId: "list-1" } });
  assert.equal(result.snapshot.recipientCount, 1);
  assert.equal(result.sendIds.length, 1);
  const sendRows = await rig.sendRepo.listByCampaign({ workspaceId: WS, campaignId: "camp-1", limit: 10 });
  assert.equal(sendRows.length, 1);
  assert.equal(sendRows[0].recipientEmail, "one@test.com");
  assert.equal(sendRows[0].status, "pending");
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.audienceSnapshotId, result.snapshot.id);
});

test("freezeAudience: zero subscribed subscribers -- empty snapshot, no send-row batch write, no outbox events", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  const result = await freezeAudience({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", listId: "list-1" } });
  assert.equal(result.snapshot.recipientCount, 0);
  assert.deepEqual(result.sendIds, []);
  const outboxRows = await rig.outbox.claimPending(100, clock.nowIso());
  assert.equal(outboxRows.length, 0);
});

test("freezeAudience: idempotent retry -- a campaign that already has audienceSnapshotId is a no-op, never a second snapshot (INV-06)", async () => {
  const rig = makeRig({
    campaigns: [makeCampaign()],
    subscriptions: [{ id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() }],
    contacts: [{ subscriberId: "sub-1", workspaceId: WS, email: "one@test.com", emailDeliverable: true }],
  });
  const first = await freezeAudience({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", listId: "list-1" } });

  // A second call must return the SAME snapshot without throwing INV-06's "already exists" guard --
  // proves the presence-check short-circuit actually fires, not just that no error surfaces by luck.
  const second = await freezeAudience({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", listId: "list-1" } });
  assert.equal(second.snapshot.id, first.snapshot.id);
  assert.deepEqual(second.sendIds, first.sendIds);
});

test("freezeAudience: chunks outbox events at CHUNK=20 -- 25 recipients produce 2 events (20 + 5)", async () => {
  const subs: SubscriptionRow[] = [];
  const contacts: SubscriberContact[] = [];
  for (let i = 0; i < 25; i++) {
    subs.push({ id: `s${i}`, workspaceId: WS, listId: "list-1", subscriberId: `sub-${i}`, status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() });
    contacts.push({ subscriberId: `sub-${i}`, workspaceId: WS, email: `u${i}@test.com`, emailDeliverable: true });
  }
  const rig = makeRig({ campaigns: [makeCampaign()], subscriptions: subs, contacts });
  const result = await freezeAudience({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", listId: "list-1" } });
  assert.equal(result.sendIds.length, 25);

  const claimed = await rig.outbox.claimPending(100, clock.nowIso());
  assert.equal(claimed.length, 2);
  const job1 = claimed[0].event.payload as SendBatchJob;
  const job2 = claimed[1].event.payload as SendBatchJob;
  assert.equal(job1.sendIds.length, 20);
  assert.equal(job2.sendIds.length, 5);
});

test("freezeAudience: campaign not found", async () => {
  const rig = makeRig();
  await assert.rejects(
    freezeAudience({ deps: rig.deps, input: { workspaceId: WS, campaignId: "nope", listId: "list-1" } }),
    { message: "campaign nope was not found" }
  );
});

/* ------------------------------------------------------------------------------------------------
 * claimBatch
 * ------------------------------------------------------------------------------------------------ */

function makeOutboxEvent(id: string): SendBatchJob extends never ? never : { id: string; name: string; occurredAt: string; workspaceId: string; payload: Record<string, never> } {
  return { id, name: "test.event", occurredAt: clock.nowIso(), workspaceId: WS, payload: {} } as never;
}

test("claimBatch: delegates to processOutbox with the default batchSize=20", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  for (let i = 0; i < 25; i++) await outbox.enqueue(makeOutboxEvent(`evt-${i}`) as never);
  const claimedCount = await claimBatch({ deps: { outbox, bus, clock } });
  assert.equal(claimedCount, 20);
});

test("claimBatch: honors an explicit batchSize override", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  for (let i = 0; i < 25; i++) await outbox.enqueue(makeOutboxEvent(`evt-${i}`) as never);
  const claimedCount = await claimBatch({ deps: { outbox, bus, clock } }, { batchSize: 5 });
  assert.equal(claimedCount, 5);
});

/* ------------------------------------------------------------------------------------------------
 * dispatchRow
 * ------------------------------------------------------------------------------------------------ */

const dispatchMessage = { subject: "Hi", text: "body", fromName: "Acme", fromEmail: "hello@acme.test", replyTo: "hello@acme.test" };

test("dispatchRow: happy path -- sends via the mailer, outcome 'sent'", async () => {
  const mailer = makeMailer();
  const rig = makeRig({ mailer });
  const row = makeSendRow({ status: "pending" });
  const result = await dispatchRow({ deps: rig.deps, row, campaignId: "camp-1", listId: "list-1", status: "subscribed", message: dispatchMessage });
  assert.equal(result.outcome, "sent");
  assert.equal(result.providerMessageId, "pm-1");
  assert.equal(result.error, null);
  assert.deepEqual(mailer.sentTo, ["a@test.com"]);
});

test("dispatchRow: mailer failure -- outcome 'failed', error passed through", async () => {
  const mailer = makeMailer(() => ({ ok: false, retryable: true, errorCode: "PROVIDER_DOWN", message: "provider unavailable" }));
  const rig = makeRig({ mailer });
  const row = makeSendRow({ status: "pending" });
  const result = await dispatchRow({ deps: rig.deps, row, campaignId: "camp-1", listId: "list-1", status: "subscribed", message: dispatchMessage });
  assert.equal(result.outcome, "failed");
  assert.equal(result.providerMessageId, null);
  assert.equal(result.error, "provider unavailable");
});

test("dispatchRow: recipient.filter hook suppresses -- outcome 'suppressed', mailer never invoked", async () => {
  const hooks = createHookRegistry();
  hooks.registerRecipientFilterHook(() => false);
  const mailer = makeMailer();
  const rig = makeRig({ mailer, hooks });
  const row = makeSendRow({ status: "pending" });
  const result = await dispatchRow({ deps: rig.deps, row, campaignId: "camp-1", listId: "list-1", status: "unsubscribed", message: dispatchMessage });
  assert.equal(result.outcome, "suppressed");
  assert.equal(result.providerMessageId, null);
  assert.equal(result.error, "recipient.filter suppressed this recipient");
  assert.deepEqual(mailer.sentTo, []);
});

test("dispatchRow: idempotency -- a row already 'delivered' is re-reported as 'sent' WITHOUT re-invoking the mailer (INV-10/EC-04)", async () => {
  const mailer = makeMailer();
  const rig = makeRig({ mailer });
  const row = makeSendRow({ status: "delivered", providerMessageId: "old-pm", lastError: null });
  const result = await dispatchRow({ deps: rig.deps, row, campaignId: "camp-1", listId: "list-1", status: "subscribed", message: dispatchMessage });
  assert.equal(result.outcome, "sent");
  assert.equal(result.providerMessageId, "old-pm", "must pass through the ALREADY-STORED providerMessageId, not invent a new one");
  assert.deepEqual(mailer.sentTo, [], "a terminal row must never re-hit the mailer");
});

test("dispatchRow: idempotency -- a row already 'bounced' is re-reported as 'failed', passing through the stored lastError", async () => {
  const mailer = makeMailer();
  const rig = makeRig({ mailer });
  const row = makeSendRow({ status: "bounced", lastError: "hard bounce" });
  const result = await dispatchRow({ deps: rig.deps, row, campaignId: "camp-1", listId: "list-1", status: "bounced", message: dispatchMessage });
  assert.equal(result.outcome, "failed");
  assert.equal(result.error, "hard bounce");
  assert.deepEqual(mailer.sentTo, []);
});

/* ------------------------------------------------------------------------------------------------
 * recordResult
 * ------------------------------------------------------------------------------------------------ */

test("recordResult: outcome 'sent' -- row -> delivered, attempts++, campaign.counters.delivered++", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  await rig.sendRepo.save(makeSendRow({ status: "pending", attempts: 0 }));
  const { sendRow } = await recordResult({ deps: rig.deps, input: { workspaceId: WS, sendId: "send-1", campaignId: "camp-1", outcome: "sent", providerMessageId: "pm-1", error: null } });
  assert.equal(sendRow.status, "delivered");
  assert.equal(sendRow.attempts, 1);
  assert.equal(sendRow.providerMessageId, "pm-1");
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.counters.delivered, 1);
  assert.equal(campaign?.counters.failed, 0);
});

test("recordResult: outcome 'failed' -- row -> failed, campaign.counters.failed++, lastError recorded", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));
  const { sendRow } = await recordResult({ deps: rig.deps, input: { workspaceId: WS, sendId: "send-1", campaignId: "camp-1", outcome: "failed", providerMessageId: null, error: "boom" } });
  assert.equal(sendRow.status, "failed");
  assert.equal(sendRow.lastError, "boom");
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.counters.failed, 1);
  assert.equal(campaign?.counters.delivered, 0);
});

test("recordResult: providerMessageId falls back to the ROW's existing value when the input omits it (?? branch)", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  await rig.sendRepo.save(makeSendRow({ status: "pending", providerMessageId: "kept-pm" }));
  const { sendRow } = await recordResult({ deps: rig.deps, input: { workspaceId: WS, sendId: "send-1", campaignId: "camp-1", outcome: "failed", providerMessageId: null, error: "retry-1 failed" } });
  assert.equal(sendRow.providerMessageId, "kept-pm");
});

test("recordResult: send row not found -- throws exact message", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  await assert.rejects(
    recordResult({ deps: rig.deps, input: { workspaceId: WS, sendId: "nope", campaignId: "camp-1", outcome: "sent", providerMessageId: "pm", error: null } }),
    { message: "send row nope was not found" }
  );
});

test("recordResult: campaign not found -- send row still updates, no throw, no counters to touch", async () => {
  const rig = makeRig(); // no campaign seeded
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));
  const { sendRow } = await recordResult({ deps: rig.deps, input: { workspaceId: WS, sendId: "send-1", campaignId: "camp-missing", outcome: "sent", providerMessageId: "pm-1", error: null } });
  assert.equal(sendRow.status, "delivered");
});

test("recordResult: a row another run already recorded is returned unchanged and not counted again (2026-09-16)", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  await rig.sendRepo.save(makeSendRow({ status: "delivered", attempts: 1, providerMessageId: "pm-first" }));
  const { sendRow } = await recordResult({ deps: rig.deps, input: { workspaceId: WS, sendId: "send-1", campaignId: "camp-1", outcome: "sent", providerMessageId: "pm-second", error: null } });
  assert.equal(sendRow.attempts, 1);
  assert.equal(sendRow.providerMessageId, "pm-first");
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.counters.delivered, 0);
});

/* ------------------------------------------------------------------------------------------------
 * completeIfDrained
 * ------------------------------------------------------------------------------------------------ */

test("completeIfDrained: campaign not in 'sending' status -- null, no write", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "draft" })] });
  const result = await completeIfDrained({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(result.campaign, null);
});

test("completeIfDrained: pending rows remain -- null, campaign left at 'sending'", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "sending" })] });
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));
  const result = await completeIfDrained({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(result.campaign, null);
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.status, "sending");
});

test("completeIfDrained: zero pending -- flips to 'sent'", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "sending" })] });
  await rig.sendRepo.save(makeSendRow({ status: "delivered" }));
  const result = await completeIfDrained({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(result.campaign?.status, "sent");
});

test("completeIfDrained: campaign not found -- null", async () => {
  const rig = makeRig();
  const result = await completeIfDrained({ deps: rig.deps, input: { workspaceId: WS, campaignId: "nope" } });
  assert.equal(result.campaign, null);
});

test("completeIfDrained: naturally idempotent -- calling again after 'sent' is a safe no-op (still returns null, not a re-transition)", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "sending" })] });
  await rig.sendRepo.save(makeSendRow({ status: "delivered" }));
  await completeIfDrained({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  const second = await completeIfDrained({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(second.campaign, null, "campaign is no longer 'sending', so the guard returns null rather than re-transitioning");
});

/* ------------------------------------------------------------------------------------------------
 * pauseCampaign / resumeCampaign
 * ------------------------------------------------------------------------------------------------ */

test("pauseCampaign: sending -> paused", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "sending" })] });
  const { campaign } = await pauseCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(campaign.status, "paused");
});

test("resumeCampaign: paused -> sending", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "paused" })] });
  const { campaign } = await resumeCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } });
  assert.equal(campaign.status, "sending");
});

test("pauseCampaign: campaign not found", async () => {
  const rig = makeRig();
  await assert.rejects(
    pauseCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "nope" } }),
    { message: "campaign nope was not found" }
  );
});

test("pauseCampaign: a draft campaign cannot be paused -- not-editable, exact reason text for the 'no rule matches' fallback", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "draft" })] });
  await assert.rejects(
    pauseCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterCampaignNotEditableError);
      assert.equal(err.message, "'draft' -> 'paused' is not a permitted transition for any actor tier");
      assert.equal(err.currentStatus, "draft");
      assert.equal(err.attemptedAction, "paused");
      return true;
    }
  );
});

/* ------------------------------------------------------------------------------------------------
 * sendTestCampaign
 * ------------------------------------------------------------------------------------------------ */

test("sendTestCampaign: 0 addresses rejected, exact validation error", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  await assert.rejects(
    sendTestCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", testAddresses: [] } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterValidationError);
      assert.equal(err.message, "test-send address count must be between 1 and 10");
      assert.equal(err.field, "testAddresses");
      assert.equal(err.reason, "length");
      return true;
    }
  );
});

test("sendTestCampaign: 11 addresses rejected (upper bound)", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()] });
  const addresses = Array.from({ length: 11 }, (_, i) => `t${i}@test.com`);
  await assert.rejects(sendTestCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", testAddresses: addresses } }), NewsletterValidationError);
});

test("sendTestCampaign: 1 and 10 addresses are both accepted (boundary)", async () => {
  const rig1 = makeRig({ campaigns: [makeCampaign()] });
  await assert.doesNotReject(sendTestCampaign({ deps: rig1.deps, input: { workspaceId: WS, campaignId: "camp-1", testAddresses: ["one@test.com"] } }));

  const rig10 = makeRig({ campaigns: [makeCampaign()] });
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}@test.com`);
  await assert.doesNotReject(sendTestCampaign({ deps: rig10.deps, input: { workspaceId: WS, campaignId: "camp-1", testAddresses: ten } }));
});

test("sendTestCampaign: campaign not found", async () => {
  const rig = makeRig();
  await assert.rejects(
    sendTestCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "nope", testAddresses: ["a@test.com"] } }),
    { message: "campaign nope was not found" }
  );
});

test("sendTestCampaign: launch gate blocked -- distinct message from the real-send path (AC-31)", async () => {
  const rig = makeRig({ campaigns: [makeCampaign()], launchGateOverrides: { originThrows: true } });
  await assert.rejects(
    sendTestCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", testAddresses: ["a@test.com"] } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterLaunchGateBlockedError);
      assert.equal(err.message, "the Launch Readiness Gate is not satisfied for a test send");
      assert.deepEqual(err.unmetPreconditions, ["origin_not_verified"]);
      return true;
    }
  );
});

test("sendTestCampaign: per-address mixed success/failure results, AND no snapshot/send-ledger rows created (AC-26)", async () => {
  const mailer = makeMailer((message) => (message.to.email === "bad@test.com" ? { ok: false, retryable: false, errorCode: "INVALID", message: "invalid address" } : { ok: true, providerMessageId: "pm", acceptedAt: clock.nowIso() }));
  const rig = makeRig({ campaigns: [makeCampaign()], mailer });
  const { results } = await sendTestCampaign({ deps: rig.deps, input: { workspaceId: WS, campaignId: "camp-1", testAddresses: ["good@test.com", "bad@test.com"] } });
  assert.deepEqual(
    results.map((r) => r.outcome),
    ["sent", "failed"]
  );
  assert.equal(results[1].error, "invalid address");
  const sendRows = await rig.sendRepo.listByCampaign({ workspaceId: WS, campaignId: "camp-1", limit: 10 });
  assert.equal(sendRows.length, 0, "a test send must never write ledger rows");
});

/* ------------------------------------------------------------------------------------------------
 * handleSendBatchClaimed
 * ------------------------------------------------------------------------------------------------ */

function makeJob(overrides: Partial<SendBatchJob> = {}): SendBatchJob {
  return { workspaceId: WS, campaignId: "camp-1", audienceSnapshotId: "snap-1", sendIds: ["send-1"], ...overrides };
}

test("handleSendBatchClaimed: campaign not found -- no-op", async () => {
  const rig = makeRig();
  await assert.doesNotReject(handleSendBatchClaimed({ deps: rig.deps, job: makeJob() }));
});

test("handleSendBatchClaimed: a send row that no longer exists is skipped, not fatal", async () => {
  const rig = makeRig({ campaigns: [makeCampaign({ status: "sending" })] });
  await assert.doesNotReject(handleSendBatchClaimed({ deps: rig.deps, job: makeJob({ sendIds: ["missing-row"] }) }));
});

test("handleSendBatchClaimed: happy path -- dispatches, records the result, and auto-drains the campaign to 'sent'", async () => {
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [{ id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() }],
  });
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));
  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob() });

  const row = await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" });
  assert.equal(row?.status, "delivered");
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.status, "sent", "the last row draining to 0-pending must auto-complete the campaign");
});

test("handleSendBatchClaimed: no matching subscription row -- status passed to hooks defaults to 'unsubscribed'", async () => {
  let observedStatus: string | null = null;
  const hooks = createHookRegistry();
  hooks.registerRecipientFilterHook((ctx) => {
    observedStatus = ctx.status;
    return true;
  });
  const rig = makeRig({ campaigns: [makeCampaign({ status: "sending" })], hooks }); // no subscription rows seeded
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));
  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob() });
  assert.equal(observedStatus, "unsubscribed");
});

test("handleSendBatchClaimed: one row's mailer failure never aborts sibling rows in the same batch", async () => {
  const mailer = makeMailer((message) => (message.to.email === "fail@test.com" ? { ok: false, retryable: true, errorCode: "DOWN", message: "down" } : { ok: true, providerMessageId: "pm", acceptedAt: clock.nowIso() }));
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [
      { id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
      { id: "s2", workspaceId: WS, listId: "list-1", subscriberId: "sub-2", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
    ],
    mailer,
  });
  await rig.sendRepo.save(makeSendRow({ id: "send-1", subscriberId: "sub-1", recipientEmail: "fail@test.com", status: "pending" }));
  await rig.sendRepo.save(makeSendRow({ id: "send-2", subscriberId: "sub-2", recipientEmail: "ok@test.com", status: "pending" }));

  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob({ sendIds: ["send-1", "send-2"] }) });

  const row1 = await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" });
  const row2 = await rig.sendRepo.findById({ workspaceId: WS, id: "send-2" });
  assert.equal(row1?.status, "failed");
  assert.equal(row2?.status, "delivered", "the second row must still be dispatched despite the first row's failure");
});

/*
 * BUG (found by writing this test, not by reading the code): `handleSendBatchClaimed` only calls
 * `recordResult` `if (dispatchResult.outcome !== "suppressed")`. But `recordResult` is the ONLY
 * place that ever moves a send row's status out of "pending" -- `dispatchRow` itself never writes.
 * So a suppressed row is left at "pending" forever: `countPendingByCampaign` never reaches 0 for
 * that campaign, and `completeIfDrained` can never fire. The moment ANY recipient.filter hook is
 * registered (REQ-23's whole reason to exist) and it suppresses even one recipient, that campaign
 * can never transition to "sent" again. Confirmed with a real production hook, not a synthetic one
 * that dodges the bug (see the module doc's own lesson about that class of false-safe test).
 *
 * Fixed in send-pipeline.ts by dropping the special case: recordResult already maps any non-"sent"
 * outcome (including "suppressed") to a terminal "failed" status via its own `input.outcome ===
 * "sent" ? "delivered" : "failed"` line -- so calling it unconditionally is sufficient, no new
 * status value is needed.
 */
test("handleSendBatchClaimed: BUG REGRESSION -- a suppressed row must still reach a terminal status so the campaign can drain", async () => {
  const hooks = createHookRegistry();
  hooks.registerRecipientFilterHook((ctx) => ctx.subscriberId !== "sub-suppressed");
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [
      { id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-ok", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
      { id: "s2", workspaceId: WS, listId: "list-1", subscriberId: "sub-suppressed", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
    ],
    hooks,
  });
  await rig.sendRepo.save(makeSendRow({ id: "send-ok", subscriberId: "sub-ok", recipientEmail: "ok@test.com", status: "pending" }));
  await rig.sendRepo.save(makeSendRow({ id: "send-suppressed", subscriberId: "sub-suppressed", recipientEmail: "suppressed@test.com", status: "pending" }));

  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob({ sendIds: ["send-ok", "send-suppressed"] }) });

  const suppressedRow = await rig.sendRepo.findById({ workspaceId: WS, id: "send-suppressed" });
  assert.notEqual(suppressedRow?.status, "pending", "a suppressed row must reach a terminal status, never stay pending forever");

  const pendingCount = await rig.sendRepo.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" });
  assert.equal(pendingCount, 0);

  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.status, "sent", "the campaign must be able to drain even when one of its recipients was suppressed");
});

/* ------------------------------------------------------------------------------------------------
 * handleSendBatchClaimed — per-row dispatch lease (2026-09-16): overlapping runs of the same batch
 * must never send or count one row twice.
 * ------------------------------------------------------------------------------------------------ */

test("handleSendBatchClaimed: two overlapping runs of the same batch send each row exactly once and count it once", async (t) => {
  let releaseGate = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  const sentTo: string[] = [];
  const mailer: MailerPort = {
    capabilities: () => ({ driver: "smtp", supportsIdempotencyKey: true, supportsWebhookFeedback: true, maxBatchSize: 100, supportsAttachments: false }),
    async send(message) {
      sentTo.push(message.to.email);
      await gate;
      return { ok: true, providerMessageId: `pm-${sentTo.length}`, acceptedAt: clock.nowIso() };
    },
    async sendBatch() {
      return [];
    },
  };
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [
      { id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
      { id: "s2", workspaceId: WS, listId: "list-1", subscriberId: "sub-2", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
      { id: "s3", workspaceId: WS, listId: "list-1", subscriberId: "sub-3", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
    ],
    mailer,
  });
  await rig.sendRepo.save(makeSendRow({ id: "send-1", subscriberId: "sub-1", recipientEmail: "a@test.com", status: "pending" }));
  await rig.sendRepo.save(makeSendRow({ id: "send-2", subscriberId: "sub-2", recipientEmail: "b@test.com", status: "pending" }));
  await rig.sendRepo.save(makeSendRow({ id: "send-3", subscriberId: "sub-3", recipientEmail: "c@test.com", status: "pending" }));
  const job = makeJob({ sendIds: ["send-1", "send-2", "send-3"] });
  // `recordResult` is the only writer of a send row once it is leased, and it saves the row before it
  // bumps the campaign counters, so one terminal save per row is exactly one counter increment per row.
  const recorded: string[] = [];
  const saveRow = rig.sendRepo.save.bind(rig.sendRepo);
  t.mock.method(rig.sendRepo, "save", async (row: SendRow) => {
    recorded.push(`${row.id}:${row.status}`);
    return saveRow(row);
  });

  const runA = handleSendBatchClaimed({ deps: rig.deps, job });
  assert.ok(await flushUntil(() => sentTo.length === 1), "run A never reached its first send");

  const runB = handleSendBatchClaimed({ deps: rig.deps, job });
  // At HEAD, run B re-sends "a@test.com" (send-1) because nothing leases the row. Fixed, run B skips
  // the already-claimed send-1 and reaches its own unclaimed row, send-2, instead. Both land at 2.
  assert.ok(await flushUntil(() => sentTo.length === 2), "run B never reached its send");

  releaseGate();
  const results = await Promise.allSettled([runA, runB]);

  assert.deepEqual([...sentTo].sort(), ["a@test.com", "b@test.com", "c@test.com"]);
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  // Exact, not a bound on `counters.delivered`: that persisted value can read LOW here because
  // `recordResult`'s campaign read-modify-write is not atomic and this scenario records send-1 (run A)
  // and send-2 (run B) concurrently. That lost update predates the lease (c4bd5103e) and is tracked
  // separately. A bound cannot prove "no double count" (one double count plus one lost update still
  // reads 3); one terminal save per row can.
  assert.deepEqual([...recorded].sort(), ["send-1:delivered", "send-2:delivered", "send-3:delivered"]);
  assert.equal(campaign?.status, "sent");
  for (const id of ["send-1", "send-2", "send-3"]) {
    const row = await rig.sendRepo.findById({ workspaceId: WS, id });
    assert.equal(row?.status, "delivered");
    assert.equal(row?.attempts, 1);
  }
  for (const result of results) {
    if (result.status === "rejected") {
      assert.match((result.reason as Error).message, /^\d+ send row\(s\) of campaign camp-1 are leased by another run; the batch will be retried$/);
    }
  }
});

test("handleSendBatchClaimed: redelivering a batch that already finished sends nothing and does not count again", async () => {
  const mailer = makeMailer();
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [{ id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() }],
    mailer,
  });
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));

  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob() });
  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob() });

  assert.equal(mailer.sentTo.length, 1);
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.counters.delivered, 1);
  const row = await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" });
  assert.equal(row?.attempts, 1);
});

test("handleSendBatchClaimed: a row leased by another live run is skipped and the batch is failed for retry", async () => {
  const mailer = makeMailer();
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [
      { id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
      { id: "s2", workspaceId: WS, listId: "list-1", subscriberId: "sub-2", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
    ],
    mailer,
  });
  await rig.sendRepo.save(makeSendRow({ id: "send-1", subscriberId: "sub-1", recipientEmail: "leased@test.com", status: "pending", nextAttemptAt: "2026-08-21T00:04:00.000Z" }));
  await rig.sendRepo.save(makeSendRow({ id: "send-2", subscriberId: "sub-2", recipientEmail: "free@test.com", status: "pending" }));

  await assert.rejects(
    handleSendBatchClaimed({ deps: rig.deps, job: makeJob({ sendIds: ["send-1", "send-2"] }) }),
    { message: "1 send row(s) of campaign camp-1 are leased by another run; the batch will be retried" }
  );

  assert.deepEqual(mailer.sentTo, ["free@test.com"]);
  const row1 = await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" });
  assert.equal(row1?.status, "pending");
  assert.equal(row1?.nextAttemptAt, "2026-08-21T00:04:00.000Z");
  const row2 = await rig.sendRepo.findById({ workspaceId: WS, id: "send-2" });
  assert.equal(row2?.status, "delivered");
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.status, "sending");
});

test("handleSendBatchClaimed: a row whose lease expired is claimed, sent, and released", async () => {
  const mailer = makeMailer();
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [{ id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() }],
    mailer,
  });
  await rig.sendRepo.save(makeSendRow({ status: "pending", nextAttemptAt: "2026-08-20T23:00:00.000Z" }));

  await handleSendBatchClaimed({ deps: rig.deps, job: makeJob() });

  assert.equal(mailer.sentTo.length, 1);
  const row = await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" });
  assert.equal(row?.status, "delivered");
  assert.equal(row?.nextAttemptAt, null);
  const campaign = await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" });
  assert.equal(campaign?.status, "sent");
});

// 2026-09-16 review: a run that leases a row and then throws keeps that lease. The outbox seals the
// batch event on its MAX_OUTBOX_ATTEMPTS-th failure, and the retry before that last attempt can come
// as soon as computeOutboxBackoffMs(MAX_OUTBOX_ATTEMPTS - 1, random 0) = 240s later. If the lease is
// still live then, the last attempt fails "leased by another run", the event is sealed "failed", and
// the row stays "pending" forever with the campaign stuck in "sending". A 5-minute lease did exactly that.
test("handleSendBatchClaimed: a row leased by a run that threw is claimable again by the batch event's earliest last retry", async (t) => {
  const mailer = makeMailer();
  const rig = makeRig({
    campaigns: [makeCampaign({ status: "sending" })],
    subscriptions: [{ id: "s1", workspaceId: WS, listId: "list-1", subscriberId: "sub-1", status: "subscribed", source: "signup_form", consentRevisionIdAtSubscribe: "r1", subscribedAt: clock.nowIso(), unsubscribedAt: null, createdAt: clock.nowIso(), updatedAt: clock.nowIso() }],
    mailer,
  });
  await rig.sendRepo.save(makeSendRow({ status: "pending" }));
  const lookUp = rig.subscriptionRepo.findBySubscriberAndList.bind(rig.subscriptionRepo);
  let lookups = 0;
  t.mock.method(rig.subscriptionRepo, "findBySubscriberAndList", async (args: Parameters<typeof lookUp>[0]) => {
    lookups += 1;
    if (lookups === 1) throw new Error("database is locked");
    return lookUp(args);
  });
  let nowIso = clock.nowIso();
  const deps: SendPipelineDeps = { ...rig.deps, clock: { nowIso: () => nowIso } };

  await assert.rejects(handleSendBatchClaimed({ deps, job: makeJob() }), { message: "database is locked" });
  assert.equal((await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" }))?.status, "pending");

  nowIso = new Date(Date.parse(clock.nowIso()) + computeOutboxBackoffMs(MAX_OUTBOX_ATTEMPTS - 1, { random: () => 0 })).toISOString();
  await handleSendBatchClaimed({ deps, job: makeJob() });

  assert.deepEqual(mailer.sentTo, ["a@test.com"]);
  assert.equal((await rig.sendRepo.findById({ workspaceId: WS, id: "send-1" }))?.status, "delivered");
  assert.equal((await rig.campaignRepo.findById({ workspaceId: WS, id: "camp-1" }))?.status, "sent");
});

test("NEWSLETTER_SEND_ROW_LEASE_MS outlasts one dispatch but expires before the batch event's last attempt, whichever attempt took it", () => {
  assert.equal(NEWSLETTER_SEND_ROW_LEASE_MS, 2 * 60_000);
  // The shortest gap before the last attempt is the single step after attempt MAX_OUTBOX_ATTEMPTS - 1,
  // not the sum of every step: a lease can be taken on any attempt, including the second-to-last.
  const lastRetryStep = computeOutboxBackoffMs(MAX_OUTBOX_ATTEMPTS - 1, { random: () => 0 });
  assert.equal(lastRetryStep, 240_000);
  assert.ok(NEWSLETTER_SEND_ROW_LEASE_MS < lastRetryStep, "the lease must expire before the batch event's last attempt");
});
