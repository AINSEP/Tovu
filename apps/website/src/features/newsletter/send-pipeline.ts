/**
 * @file `send-pipeline.ts` — `NewsletterSendPipeline` (ADR-PIPE-011 C-017, orchestrator.spec.md §4,
 * REQ-16/17/18/19/20/24/28/29, INV-02/06/08/10).
 *
 * `authorizeSend` calls `launch-gate.ts`'s `evaluateLaunchGate` (T018, CERTIFIED FIRST in Phase 2)
 * EXACTLY ONCE, inside its own transaction — no other call site may duplicate or bypass it (INV-05).
 * `dispatchRow` never constructs, stores, or imports a concrete `MailerPort` adapter (INV-08) — it
 * only ever receives one as a call-time dependency. `claimBatch` delegates to the EXISTING generic
 * `processOutbox` primitive unmodified (W-003) — Newsletter does not fork the claim loop; the actual
 * per-row fan-out happens in `handleSendBatchClaimed`, the bus-subscriber handler `server/app.ts`
 * wires onto `newsletter.send.batch.claimed` (T040), mirroring the existing
 * `bus.subscribe("workspace.created", ...)` demonstration.
 */
import type { DomainEvent, EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import { processOutbox } from "../../contracts/core/events/index.js";
import type { MailerPort } from "../../platform/mail/index.js";
import { transitionCampaignStatus } from "./campaign.js";
import {
  NewsletterCampaignNotEditableError,
  NewsletterCampaignNotFoundError,
  NewsletterLaunchGateBlockedError,
  NewsletterValidationError,
} from "./errors.js";
import { createHookRegistry, type HookRegistry } from "./hooks.js";
import { evaluateLaunchGate, type LaunchGateDeps } from "./launch-gate.js";
import type {
  NewsletterAudienceSnapshotRepoPort,
  NewsletterCampaignRepoPort,
  NewsletterSendRepoPort,
  NewsletterSubscriptionRepoPort,
  SendBatchJob,
  SubscriberDirectoryPort,
} from "./ports.js";
import type { AudienceSnapshotRow, CampaignRecord, SendRow } from "./types.js";

const TEST_SEND_MIN = 1;
const TEST_SEND_MAX = 10;
export const SEND_BATCH_CLAIMED_EVENT = "newsletter.send.batch.claimed";

/**
 * How long one run holds a send row while it dispatches it (2026-09-16). Must outlast one row's hooks + `mailer.send`
 * + `recordResult` (the Resend adapter caps a call at 10s). A run that throws after leasing a row keeps the lease, so
 * the lease must also expire before the batch event's LAST attempt, whichever attempt took it. The tightest case is a
 * lease taken on attempt `MAX_OUTBOX_ATTEMPTS - 1`: the last attempt can follow after only
 * computeOutboxBackoffMs(MAX_OUTBOX_ATTEMPTS - 1, random 0) = 240s. A lease still live then fails that attempt, the
 * outbox seals the event "failed", and the row stays "pending" forever. Hence 2 minutes, not the first draft's 5
 * (review fix, 2026-09-16). `send-pipeline.test.ts` pins both bounds.
 */
export const NEWSLETTER_SEND_ROW_LEASE_MS = 2 * 60 * 1000;

export interface SendPipelineDeps {
  campaignRepo: NewsletterCampaignRepoPort;
  subscriptionRepo: NewsletterSubscriptionRepoPort;
  audienceSnapshotRepo: NewsletterAudienceSnapshotRepoPort;
  sendRepo: NewsletterSendRepoPort;
  subscriberDirectory: SubscriberDirectoryPort;
  hooks: HookRegistry;
  mailer: MailerPort;
  launchGateDeps: LaunchGateDeps;
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: { nowIso(): string };
  ids: { newId(): string };
}

/** REQ-19/25 — only the pipeline (`authorizeSend`) may start a real send; compose/schedule-tier actors cannot (AC-25). */
export async function authorizeSend(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; campaignId: string };
}): Promise<{ campaign: CampaignRecord; launchGateSnapshot: Awaited<ReturnType<typeof evaluateLaunchGate>> }> {
  const { deps, input } = required;
  return deps.campaignRepo.transaction(async () => {
    const campaign = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.campaignId });
    if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${input.campaignId} was not found`);

    // evaluateLaunchGate (T018) called EXACTLY ONCE, inside this transaction (INV-05).
    const launchGateSnapshot = await evaluateLaunchGate({ deps: deps.launchGateDeps, workspaceId: input.workspaceId, isTestSend: false });
    if (!launchGateSnapshot.met) {
      throw new NewsletterLaunchGateBlockedError("the Launch Readiness Gate is not satisfied", launchGateSnapshot.unmetPreconditions);
    }

    const decision = transitionCampaignStatus({ from: campaign.status, to: "sending", actorTier: "pipeline" });
    if (!decision.allowed) {
      throw new NewsletterCampaignNotEditableError(decision.reason, campaign.status, "send");
    }

    const now = deps.clock.nowIso();
    const updated: CampaignRecord = { ...campaign, status: "sending", sendStartedAt: now, updatedAt: now };
    await deps.campaignRepo.saveCampaignRow(updated);
    const revisions = await deps.campaignRepo.listRevisions({ workspaceId: input.workspaceId, campaignId: input.campaignId });
    const seq = revisions.length > 0 ? Math.max(...revisions.map((r) => r.seq)) + 1 : 1;
    await deps.campaignRepo.appendRevision({ campaignId: updated.id, workspaceId: updated.workspaceId, seq, state: updated, actorId: "system:send-pipeline", recordedAt: now });

    return { campaign: updated, launchGateSnapshot };
  });
}

/**
 * REQ-16 — materialize `subscribed` subscriptions into 1 snapshot + N send rows. Idempotent by
 * presence-check (INV-06/orchestrator.spec §6): a retry for a campaign that already has
 * `audienceSnapshotId` set is a no-op returning the existing snapshot, never a second snapshot.
 * Unresolvable subscribers are silently excluded (AC-22, EC-07) — never an error.
 */
export async function freezeAudience(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; campaignId: string; listId: string };
}): Promise<{ snapshot: AudienceSnapshotRow; sendIds: readonly string[] }> {
  const { deps, input } = required;
  const campaign = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.campaignId });
  if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${input.campaignId} was not found`);

  if (campaign.audienceSnapshotId) {
    const existing = await deps.audienceSnapshotRepo.findById({ workspaceId: input.workspaceId, id: campaign.audienceSnapshotId });
    if (existing) {
      const rows = await deps.sendRepo.listByCampaign({ workspaceId: input.workspaceId, campaignId: input.campaignId, limit: 100000 });
      return { snapshot: existing, sendIds: rows.map((r) => r.id) };
    }
  }

  const subscribed = await deps.subscriptionRepo.listSubscribed({ workspaceId: input.workspaceId, listId: input.listId });
  const contacts = await deps.subscriberDirectory.getContacts({
    workspaceId: input.workspaceId,
    subscriberIds: subscribed.map((s) => s.subscriberId),
  });
  const contactBySubscriberId = new Map(contacts.map((c) => [c.subscriberId, c] as const));

  const now = deps.clock.nowIso();
  const snapshotId = deps.ids.newId();
  const snapshot: AudienceSnapshotRow = {
    id: snapshotId,
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    listId: input.listId,
    recipientCount: 0,
    createdAt: now,
  };

  const sendRows: SendRow[] = [];
  for (const subscription of subscribed) {
    const contact = contactBySubscriberId.get(subscription.subscriberId);
    if (!contact) continue; // EC-07: unresolvable subscriber silently excluded, not an error.
    sendRows.push({
      id: deps.ids.newId(),
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      audienceSnapshotId: snapshotId,
      subscriberId: subscription.subscriberId,
      recipientEmail: contact.email,
      status: "pending",
      attempts: 0,
      idempotencyKey: `newsletter:${input.campaignId}:${subscription.subscriberId}:${snapshotId}`,
      providerMessageId: null,
      lastError: null,
      nextAttemptAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  const finalSnapshot: AudienceSnapshotRow = { ...snapshot, recipientCount: sendRows.length };
  await deps.audienceSnapshotRepo.save(finalSnapshot);
  if (sendRows.length > 0) await deps.sendRepo.saveBatch(sendRows);

  const updatedCampaign: CampaignRecord = { ...campaign, audienceSnapshotId: snapshotId, updatedAt: now };
  await deps.campaignRepo.saveCampaignRow(updatedCampaign);

  // W-003: enqueue the outbox event(s) that drive the fan-out — chunked, bounded batch size.
  const CHUNK = 20;
  const sendIds = sendRows.map((r) => r.id);
  for (let i = 0; i < sendIds.length; i += CHUNK) {
    const chunk = sendIds.slice(i, i + CHUNK);
    const job: SendBatchJob = { workspaceId: input.workspaceId, campaignId: input.campaignId, audienceSnapshotId: snapshotId, sendIds: chunk };
    const event: DomainEvent<SendBatchJob> = {
      id: deps.ids.newId(),
      name: SEND_BATCH_CLAIMED_EVENT,
      occurredAt: now,
      workspaceId: input.workspaceId,
      payload: job,
    };
    await deps.outbox.enqueue(event as unknown as DomainEvent);
  }

  return { snapshot: finalSnapshot, sendIds };
}

/** `claimBatch` — delegates to the EXISTING generic `processOutbox` primitive, unmodified (W-003). */
export function claimBatch(
  required: { deps: Pick<SendPipelineDeps, "outbox" | "bus" | "clock"> },
  optional: { batchSize?: number } = {}
): Promise<number> {
  const { deps } = required;
  const { batchSize = 20 } = optional;
  return processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock }, { batchSize });
}

/**
 * REQ-17/22/23 — recipient.filter -> beforeSend -> `MailerPort.send()`, in that fixed order
 * (`hooks.ts`'s `runHookChain`). Never constructs/imports a concrete `MailerPort` (INV-08) — always
 * receives `deps.mailer` as a call-time dependency.
 */
export async function dispatchRow(required: {
  deps: SendPipelineDeps;
  row: SendRow;
  campaignId: string;
  listId: string;
  status: "subscribed" | "unsubscribed" | "pending" | "bounced" | "complained";
  message: { subject: string; text?: string; html?: string; fromName: string; fromEmail: string; replyTo: string };
}): Promise<{ outcome: "sent" | "suppressed" | "failed"; providerMessageId: string | null; error: string | null }> {
  const { deps, row } = required;

  // REQ-10: crash-recovery / redelivery idempotency (INV-10, EC-04) — a row already terminal is
  // never re-dispatched (the outbox's own redelivery must not double-send). Defense in depth
  // (2026-09-16): `handleSendBatchClaimed` leases the row (`claimForDispatch`) before calling this,
  // which is what actually stops overlapping runs.
  if (row.status !== "pending") {
    return { outcome: row.status === "delivered" || row.status === "sent" ? "sent" : "failed", providerMessageId: row.providerMessageId, error: row.lastError };
  }

  const hookResult = await deps.hooks.runHookChain({
    recipientFilterContext: {
      workspaceId: row.workspaceId,
      campaignId: required.campaignId,
      listId: required.listId,
      subscriberId: row.subscriberId,
      recipientEmail: row.recipientEmail,
      status: required.status,
    },
    beforeSendContext: { workspaceId: row.workspaceId, campaignId: required.campaignId, sendId: row.id, subscriberId: row.subscriberId },
    message: {
      workspaceId: row.workspaceId,
      to: { email: row.recipientEmail },
      from: { email: required.message.fromEmail, name: required.message.fromName },
      replyTo: { email: required.message.replyTo },
      subject: required.message.subject,
      text: required.message.text,
      html: required.message.html,
    },
  });

  if (!hookResult.keep) {
    return { outcome: "suppressed", providerMessageId: null, error: hookResult.reason };
  }

  const result = await deps.mailer.send(hookResult.message, {
    idempotencyKey: row.idempotencyKey,
    workspaceId: row.workspaceId,
    sourceContext: { module: "newsletter", ref: row.id },
  });

  if (result.ok) {
    return { outcome: "sent", providerMessageId: result.providerMessageId, error: null };
  }
  return { outcome: "failed", providerMessageId: null, error: result.message };
}

/** REQ-24/INV-02 — atomic send-row + counters write (rides the unbuilt ADR-026 envelope; here as one sequential write, flagged not silently assumed atomic beyond a single row). */
export async function recordResult(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; sendId: string; campaignId: string; outcome: "sent" | "suppressed" | "failed"; providerMessageId: string | null; error: string | null };
}): Promise<{ sendRow: SendRow }> {
  const { deps, input } = required;
  const row = await deps.sendRepo.findById({ workspaceId: input.workspaceId, id: input.sendId });
  if (!row) throw new Error(`send row ${input.sendId} was not found`);

  // 2026-09-16: a row another run already recorded is never re-written or counted twice.
  if (row.status !== "pending") return { sendRow: row };

  const now = deps.clock.nowIso();
  const status = input.outcome === "sent" ? "delivered" : "failed";
  const updated: SendRow = {
    ...row,
    status,
    attempts: row.attempts + 1,
    providerMessageId: input.providerMessageId ?? row.providerMessageId,
    lastError: input.error,
    nextAttemptAt: null, // releases the dispatch lease `claimForDispatch` took (see `claimSendRow`).
    updatedAt: now,
  };
  await deps.sendRepo.save(updated);

  const campaign = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.campaignId });
  if (campaign) {
    const counters = { ...campaign.counters };
    if (input.outcome === "sent") counters.delivered += 1;
    else counters.failed += 1;
    await deps.campaignRepo.saveCampaignRow({ ...campaign, counters, updatedAt: now });
  }

  return { sendRow: updated };
}

/** REQ-18 — flips to `sent` when 0 pending remain. Naturally idempotent — safe to call redundantly. */
export async function completeIfDrained(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; campaignId: string };
}): Promise<{ campaign: CampaignRecord | null }> {
  const { deps, input } = required;
  const campaign = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.campaignId });
  if (!campaign || campaign.status !== "sending") return { campaign: null };

  const pending = await deps.sendRepo.countPendingByCampaign({ workspaceId: input.workspaceId, campaignId: input.campaignId });
  if (pending > 0) return { campaign: null };

  const decision = transitionCampaignStatus({ from: campaign.status, to: "sent", actorTier: "pipeline" });
  if (!decision.allowed) return { campaign: null };

  const now = deps.clock.nowIso();
  const updated: CampaignRecord = { ...campaign, status: "sent", updatedAt: now };
  await deps.campaignRepo.saveCampaignRow(updated);
  return { campaign: updated };
}

/** REQ-19 — admin-triggered pause/resume (`admin.newsletter.campaign.send` tier). `claimBatch` no-ops while paused (checked by the caller before invoking `claimBatch`). */
export async function pauseCampaign(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; campaignId: string };
}): Promise<{ campaign: CampaignRecord }> {
  return transitionAndSave(required.deps, required.input, "paused");
}

export async function resumeCampaign(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; campaignId: string };
}): Promise<{ campaign: CampaignRecord }> {
  return transitionAndSave(required.deps, required.input, "sending");
}

async function transitionAndSave(
  deps: SendPipelineDeps,
  input: { workspaceId: string; campaignId: string },
  to: "paused" | "sending"
): Promise<{ campaign: CampaignRecord }> {
  return deps.campaignRepo.transaction(async () => {
    const campaign = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.campaignId });
    if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${input.campaignId} was not found`);
    const decision = transitionCampaignStatus({ from: campaign.status, to, actorTier: "send" });
    if (!decision.allowed) throw new NewsletterCampaignNotEditableError(decision.reason, campaign.status, to);
    const now = deps.clock.nowIso();
    const updated: CampaignRecord = { ...campaign, status: to, updatedAt: now };
    await deps.campaignRepo.saveCampaignRow(updated);
    return { campaign: updated };
  });
}

/** SEND_TEST_CAMPAIGN — hits only the 1-10 given addresses, no snapshot/send-ledger rows created (AC-26). */
export async function sendTestCampaign(required: {
  deps: SendPipelineDeps;
  input: { workspaceId: string; campaignId: string; testAddresses: readonly string[] };
}): Promise<{ results: { email: string; outcome: "sent" | "failed"; error: string | null }[] }> {
  const { deps, input } = required;
  if (input.testAddresses.length < TEST_SEND_MIN || input.testAddresses.length > TEST_SEND_MAX) {
    throw new NewsletterValidationError(`test-send address count must be between ${TEST_SEND_MIN} and ${TEST_SEND_MAX}`, "testAddresses", "length");
  }
  const campaign = await deps.campaignRepo.findById({ workspaceId: input.workspaceId, id: input.campaignId });
  if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${input.campaignId} was not found`);

  const launchGateSnapshot = await evaluateLaunchGate({ deps: deps.launchGateDeps, workspaceId: input.workspaceId, isTestSend: true });
  if (!launchGateSnapshot.met) {
    throw new NewsletterLaunchGateBlockedError("the Launch Readiness Gate is not satisfied for a test send", launchGateSnapshot.unmetPreconditions);
  }

  const results: { email: string; outcome: "sent" | "failed"; error: string | null }[] = [];
  for (const email of input.testAddresses) {
    const result = await deps.mailer.send(
      {
        workspaceId: input.workspaceId,
        to: { email },
        from: { email: campaign.fromEmail, name: campaign.fromName },
        replyTo: { email: campaign.replyTo },
        subject: `[TEST] ${campaign.subject}`,
        text: campaign.preheader ?? undefined,
      },
      { idempotencyKey: `newsletter:test:${campaign.id}:${email}:${deps.clock.nowIso()}`, workspaceId: input.workspaceId, sourceContext: { module: "newsletter", ref: campaign.id } }
    );
    results.push(result.ok ? { email, outcome: "sent", error: null } : { email, outcome: "failed", error: result.message });
  }
  return { results };
}

/**
 * Leases one send row for this run through `NewsletterSendRepoPort.claimForDispatch` (2026-09-16):
 * the leased row, `"leased-elsewhere"` when another live run already holds its lease, or `null` when
 * it is missing or already terminal (nothing left to dispatch).
 *
 * @complexity O(1) beyond the two repo calls it may make.
 */
async function claimSendRow(required: { deps: SendPipelineDeps; workspaceId: string; sendId: string }): Promise<SendRow | "leased-elsewhere" | null> {
  const { deps, workspaceId, sendId } = required;
  const nowIso = deps.clock.nowIso();
  const leaseUntilIso = new Date(Date.parse(nowIso) + NEWSLETTER_SEND_ROW_LEASE_MS).toISOString();
  const leased = await deps.sendRepo.claimForDispatch({ workspaceId, id: sendId, nowIso, leaseUntilIso });
  if (leased) return leased;
  const current = await deps.sendRepo.findById({ workspaceId, id: sendId });
  return current?.status === "pending" ? "leased-elsewhere" : null;
}

/**
 * Dispatches one already-leased row through the fixed `recipient.filter` -> `beforeSend` -> `send()`
 * -> `recordResult` chain. Extracted from `handleSendBatchClaimed` (2026-09-16) to keep that
 * function's branching under the repo's complexity ceiling.
 *
 * @complexity O(1) beyond the hook chain, the mailer call, and `recordResult`.
 */
async function dispatchAndRecord(required: { deps: SendPipelineDeps; job: SendBatchJob; campaign: CampaignRecord; row: SendRow }): Promise<void> {
  const { deps, job, campaign, row } = required;
  const subscription = await deps.subscriptionRepo.findBySubscriberAndList({
    workspaceId: job.workspaceId,
    listId: campaign.listId,
    subscriberId: row.subscriberId,
  });
  const status = subscription?.status ?? "unsubscribed";
  const dispatchResult = await dispatchRow({
    deps,
    row,
    campaignId: job.campaignId,
    listId: campaign.listId,
    status,
    message: { subject: campaign.subject, text: campaign.preheader ?? undefined, fromName: campaign.fromName, fromEmail: campaign.fromEmail, replyTo: campaign.replyTo },
  });
  // BUG FIX: `recordResult` is the ONLY place a send row's status ever leaves "pending" --
  // `dispatchRow` above never writes. Previously this call was skipped for a "suppressed"
  // outcome, which left the row at "pending" forever: `countPendingByCampaign` could never reach
  // 0 for that campaign, so `completeIfDrained` (below) could never fire once any recipient was
  // suppressed. `recordResult` already maps any non-"sent" outcome (including "suppressed") to a
  // terminal "failed" status, so calling it unconditionally is sufficient -- no new status value
  // is needed.
  await recordResult({
    deps,
    input: {
      workspaceId: job.workspaceId,
      sendId: row.id,
      campaignId: job.campaignId,
      outcome: dispatchResult.outcome,
      providerMessageId: dispatchResult.providerMessageId,
      error: dispatchResult.error,
    },
  });
}

/**
 * The bus-subscriber handler `server/app.ts` wires onto `newsletter.send.batch.claimed` (T040).
 * Per-row fixed order: `recipient.filter` -> `beforeSend` -> `send()` -> `recordResult`; one row's
 * failure never aborts sibling rows in the same batch.
 *
 * Each row is leased (`claimSendRow`) before any hook or send (2026-09-16), so overlapping runs of
 * the same batch never send one row twice. A terminal or missing row is skipped without
 * re-recording. A row leased by another live run is skipped here, and once every row in the job has
 * been attempted, the whole batch fails so the outbox retries it after backoff — that is what lets a
 * run that died mid-batch (holding a lease) release its rows once the lease expires, instead of
 * stranding them.
 */
export async function handleSendBatchClaimed(required: { deps: SendPipelineDeps; job: SendBatchJob }): Promise<void> {
  const { deps, job } = required;
  const campaign = await deps.campaignRepo.findById({ workspaceId: job.workspaceId, id: job.campaignId });
  if (!campaign) return;

  let leasedElsewhere = 0;
  for (const sendId of job.sendIds) {
    const row = await claimSendRow({ deps, workspaceId: job.workspaceId, sendId });
    if (row === "leased-elsewhere") {
      leasedElsewhere += 1;
      continue;
    }
    if (!row) continue;
    await dispatchAndRecord({ deps, job, campaign, row });
  }

  await completeIfDrained({ deps, input: { workspaceId: job.workspaceId, campaignId: job.campaignId } });

  if (leasedElsewhere > 0) {
    throw new Error(`${leasedElsewhere} send row(s) of campaign ${job.campaignId} are leased by another run; the batch will be retried`);
  }
}

export { createHookRegistry };
