import type { ClockPort, IdGeneratorPort, ISODateTime, JsonObject, UUID } from "../core/ports";
import type { DeliveryEnvelopeStore } from "./repo.memory";
import type { HttpClientPort, WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "./ports";
import type { WebhookSigner } from "./signing";
import type {
  IntegrationId,
  WebhookBeforeDispatchHook,
  WebhookDeliveryRecord,
  WebhookEventEnvelope,
  WebhookSubscriptionRecord,
  WebhookTopic,
} from "./types";

/**
 * @file The two-stage webhook delivery worker (ADR-036 §4): fan-out enqueue + the
 * claim/sign/POST/retry loop.
 *
 * Purpose:
 * - `enqueueDelivery` — Stage A. The outbox fan-out subscriber's per-event work: match a
 *   delivered domain event's topic against active subscriptions and enqueue one
 *   `webhook_deliveries` row per match, idempotently keyed on `(event_id, subscription_id)`.
 * - `processDueDeliveries` — Stage B, mirrors `src/core/events/outbox-worker.ts`'s
 *   `processOutbox`: claims due rows, runs the `webhooks.beforeDispatch` hook chain, signs, and
 *   POSTs via the injected `HttpClientPort`, then marks delivered/failed/dead.
 *
 * How it relates to the project:
 * - Depends on `WebhookSubscriptionRepoPort` / `WebhookDeliveryRepoPort` (./ports.ts) and
 *   `HttpClientPort` (../http, ADR-038) — never a concrete adapter.
 * - `DeliveryEnvelopeStore` (./repo.memory.ts) is a scope-gap seam, not part of the reviewed
 *   port surface — see that file's doc comment for why `WebhookDeliveryRecord` alone isn't
 *   enough to rebuild the outbound envelope at Stage B.
 *
 * Architectural role:
 * Core business logic for the webhook subsystem. No HTTP transport, no signing algorithm, no
 * persistence details live here — those are injected (`HttpClientPort`, `WebhookSigner`,
 * the repo ports) so this file stays a pure orchestration of the retry/backoff/hook state
 * machine, which is the part actually worth testing in isolation.
 */

/** Capped delivery attempts before a row dead-letters (ADR-036 §4: "default 8 over ~ a day"). */
export const MAX_DELIVERY_ATTEMPTS = 8;

/** Backoff base: the first retry after a failure waits (before jitter) this long. */
const BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

/** Backoff cap: no single step waits longer than this, however high `attempts` climbs. */
const MAX_BACKOFF_STEP_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Exponential backoff with "equal jitter": `half = min(cap, base * 2^(attempts-1)) / 2`, then
 * `half + random() * half` — always at least `half`, at most the full exponential step, so
 * retries never collapse to zero delay (thundering-herd risk) or drift outside the exponential
 * envelope. `attempts` is 1-based (the count *after* the failing attempt that just happened).
 * At `attempts = 1..8` with the constants above, the un-jittered midpoints are roughly
 * 2.5m, 5m, 10m, 20m, 40m, 80m, 160m, 180m(capped) — summing to a bit under a day across all 8
 * steps, matching the ADR's "~ a day" target.
 *
 * `random` is injectable (defaults to `Math.random`) purely for deterministic tests — this is
 * the one place non-determinism enters the module.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function computeBackoffMs(attempts: number, optional: { random?: () => number } = {}): number {
  const { random = Math.random } = optional;
  const exponentialStep = Math.min(MAX_BACKOFF_STEP_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1));
  const half = exponentialStep / 2;
  return Math.round(half + random() * half);
}

function addMsToIso(iso: ISODateTime, ms: number): ISODateTime {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/** Thrown when a `webhooks.beforeDispatch` hook explicitly vetoes a delivery (`send: false`). */
export class WebhookDeliveryVetoedError extends Error {}

/**
 * The minimal shape `enqueueDelivery` needs from a delivered domain event — a narrowed
 * `DomainEvent` (../core/ports) with a JSON-safe payload, since the envelope this becomes must
 * be structured-clone-safe (ADR-024 §3 ABI).
 */
export interface WebhookSourceEvent {
  id: UUID;
  name: WebhookTopic;
  workspaceId: UUID;
  occurredAt: ISODateTime;
  payload: JsonObject;
}

export interface EnqueueDeliveryDeps {
  subscriptionRepo: WebhookSubscriptionRepoPort;
  deliveryRepo: WebhookDeliveryRepoPort;
  envelopeStore: DeliveryEnvelopeStore;
  idGenerator: IdGeneratorPort;
  clock: ClockPort;
}

export interface EnqueueDeliveryRequired {
  deps: EnqueueDeliveryDeps;
  input: { event: WebhookSourceEvent };
}

export interface EnqueueDeliveryOptional {}

/**
 * Stage A: fan a delivered event out to one `webhook_deliveries` row per matching active
 * subscription, idempotently on `(eventId, subscriptionId)` (ADR-036 §4 — "an outbox
 * re-delivery cannot double-enqueue"). Safe to call more than once for the same event.
 *
 * @complexity O(matching subscriptions × their existing delivery count) — the idempotency check
 * scans a subscription's prior deliveries (see `isAlreadyEnqueued`'s doc: `listBySubscription`
 * is the only lookup the port surface offers; a production SQLite adapter would use a unique
 * index on `(workspace_id, subscription_id, event_id)` instead of a scan).
 * @overallScore 95
 * Findings (Low): the idempotency check is O(n) in a subscription's delivery history for the
 * in-memory adapter; acceptable for dev/test data volumes, called out so it isn't silently
 * assumed to scale — a production adapter must back this with a unique index, not a scan.
 */
export async function enqueueDelivery(
  required: EnqueueDeliveryRequired,
  _optional: EnqueueDeliveryOptional = {}
): Promise<{ enqueued: WebhookDeliveryRecord[] }> {
  const { deps, input } = required;
  const { event } = input;

  const matches = await deps.subscriptionRepo.findMatching({
    workspaceId: event.workspaceId,
    topic: event.name,
  });

  const enqueued: WebhookDeliveryRecord[] = [];

  for (const subscription of matches) {
    const duplicate = await isAlreadyEnqueued({
      deliveryRepo: deps.deliveryRepo,
      workspaceId: event.workspaceId,
      subscriptionId: subscription.id,
      eventId: event.id,
    });
    if (duplicate) continue;

    const now = deps.clock.nowIso();
    const record: WebhookDeliveryRecord = {
      id: deps.idGenerator.newId(),
      workspaceId: event.workspaceId,
      subscriptionId: subscription.id,
      eventId: event.id,
      topic: event.name,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lastResponseStatus: null,
      lastError: null,
      signedWithVersion: null,
      createdAt: now,
      deliveredAt: null,
      deadAt: null,
    };

    const envelope: WebhookEventEnvelope = {
      deliveryId: record.id,
      eventId: event.id,
      topic: event.name,
      workspaceId: event.workspaceId,
      occurredAt: event.occurredAt,
      data: event.payload,
    };

    await deps.deliveryRepo.enqueue(record);
    await deps.envelopeStore.save({ deliveryId: record.id, envelope });
    enqueued.push(record);
  }

  return { enqueued };
}

/**
 * Check-before-insert idempotency guard for `(eventId, subscriptionId)`. `WebhookDeliveryRepoPort`
 * has no direct by-event lookup, so this scans the subscription's deliveries via
 * `listBySubscription` — see this function's caller's `@complexity` note for the scaling caveat.
 */
async function isAlreadyEnqueued(params: {
  deliveryRepo: WebhookDeliveryRepoPort;
  workspaceId: UUID;
  subscriptionId: IntegrationId;
  eventId: UUID;
}): Promise<boolean> {
  const existing = await params.deliveryRepo.listBySubscription({
    workspaceId: params.workspaceId,
    subscriptionId: params.subscriptionId,
    limit: Number.MAX_SAFE_INTEGER,
  });
  return existing.some((delivery) => delivery.eventId === params.eventId);
}

export interface ProcessDueDeliveriesDeps {
  deliveryRepo: WebhookDeliveryRepoPort;
  subscriptionRepo: WebhookSubscriptionRepoPort;
  envelopeStore: DeliveryEnvelopeStore;
  httpClient: HttpClientPort;
  signer: WebhookSigner;
  clock: ClockPort;
}

export interface ProcessDueDeliveriesRequired {
  deps: ProcessDueDeliveriesDeps;
}

export interface ProcessDueDeliveriesOptional {
  batchSize?: number;
  /** Ordered by `priority` internally regardless of input order (ADR-024 §7). Defaults to none. */
  hooks?: readonly WebhookBeforeDispatchHook[];
  requestTimeoutMs?: number;
  /** Override for tests; production always uses `MAX_DELIVERY_ATTEMPTS`. */
  maxAttempts?: number;
  /** Injected into `computeBackoffMs` for deterministic tests. */
  random?: () => number;
}

export interface ProcessDueDeliveriesResult {
  /** Rows claimed this pass. */
  processed: number;
  delivered: number;
  /** Failed but still retryable (re-entered "pending" with a future `nextAttemptAt`). */
  failed: number;
  /** Failed and exhausted `maxAttempts` — transitioned to `dead`. */
  dead: number;
}

/**
 * Stage B: claim due rows, run `webhooks.beforeDispatch`, sign, POST, and record the outcome.
 *
 * Fail-closed hook semantics (ADR-036 Round-3 audit fold): if any registered `beforeDispatch`
 * contributor throws/rejects (or explicitly vetoes via `{ send: false }`), this delivery
 * ATTEMPT fails — it is retried on the standard backoff clock (or dead-lettered once attempts
 * are exhausted) and the un-filtered/un-redacted envelope is never dispatched. There is no
 * fall-through path that reaches `httpClient.send` after a hook failure.
 *
 * @complexity O(batchSize) delivery attempts, each O(rawBody length) for signing + one HTTP call.
 * @overallScore 100
 */
export async function processDueDeliveries(
  required: ProcessDueDeliveriesRequired,
  optional: ProcessDueDeliveriesOptional = {}
): Promise<ProcessDueDeliveriesResult> {
  const { deliveryRepo, subscriptionRepo, envelopeStore, httpClient, signer, clock } = required.deps;
  const {
    batchSize = 20,
    hooks = [],
    requestTimeoutMs = 10_000,
    maxAttempts = MAX_DELIVERY_ATTEMPTS,
    random,
  } = optional;

  const nowIso = clock.nowIso();
  const claimed = await deliveryRepo.claimPending({ batchSize, nowIso });

  const result: ProcessDueDeliveriesResult = { processed: claimed.length, delivered: 0, failed: 0, dead: 0 };

  for (const row of claimed) {
    const outcome = await attemptOneDelivery(row, {
      subscriptionRepo,
      envelopeStore,
      httpClient,
      signer,
      hooks,
      requestTimeoutMs,
    });

    if (outcome.ok) {
      await deliveryRepo.markDelivered({
        workspaceId: row.workspaceId,
        id: row.id,
        responseStatus: outcome.responseStatus,
        deliveredAtIso: clock.nowIso(),
      });
      result.delivered += 1;
      continue;
    }

    const isExhausted = row.attempts >= maxAttempts;
    const nextStatus = isExhausted ? "dead" : "failed";
    const failedAtIso = clock.nowIso();
    const nextAttemptAt = isExhausted
      ? failedAtIso
      : addMsToIso(failedAtIso, computeBackoffMs(row.attempts, { random }));

    await deliveryRepo.markFailed({
      workspaceId: row.workspaceId,
      id: row.id,
      error: outcome.error,
      responseStatus: outcome.responseStatus,
      nextStatus,
      nextAttemptAt,
      deadAtIso: isExhausted ? failedAtIso : undefined,
    });

    if (isExhausted) result.dead += 1;
    else result.failed += 1;
  }

  return result;
}

type DeliveryAttemptOutcome =
  | { ok: true; responseStatus: number }
  | { ok: false; error: string; responseStatus: number | null };

/**
 * One claimed row's full attempt: resolve subscription + envelope, run hooks, sign, POST.
 * Every failure mode (missing subscription, paused/disabled subscription, missing envelope, a
 * throwing/vetoing hook, a transport error, a non-2xx response) funnels into the same
 * `{ ok: false }` shape so the caller's retry/backoff/dead-letter logic is a single code path.
 */
async function attemptOneDelivery(
  row: WebhookDeliveryRecord,
  deps: {
    subscriptionRepo: WebhookSubscriptionRepoPort;
    envelopeStore: DeliveryEnvelopeStore;
    httpClient: HttpClientPort;
    signer: WebhookSigner;
    hooks: readonly WebhookBeforeDispatchHook[];
    requestTimeoutMs: number;
  }
): Promise<DeliveryAttemptOutcome> {
  try {
    const subscription = await deps.subscriptionRepo.findById({
      workspaceId: row.workspaceId,
      id: row.subscriptionId,
    });
    if (!subscription) {
      return { ok: false, error: `subscription '${row.subscriptionId}' was not found`, responseStatus: null };
    }
    if (subscription.status !== "active") {
      return {
        ok: false,
        error: `subscription '${row.subscriptionId}' is '${subscription.status}', not active`,
        responseStatus: null,
      };
    }

    const storedEnvelope = await deps.envelopeStore.find({ deliveryId: row.id });
    if (!storedEnvelope) {
      return { ok: false, error: `no envelope recorded for delivery '${row.id}'`, responseStatus: null };
    }

    // Fail-closed: any hook throwing/rejecting propagates out of this try block and becomes a
    // failed attempt below — it never falls through to httpClient.send with an unfiltered body.
    const envelope = await runBeforeDispatchHooks(deps.hooks, { subscription, envelope: storedEnvelope });

    const rawBody = JSON.stringify(envelope);
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const signatureHeader = await deps.signer.signForSubscription({
      subscription,
      rawBody,
      timestampSeconds,
    });

    const response = await deps.httpClient.send({
      method: "POST",
      url: subscription.targetUrl,
      headers: {
        "content-type": "application/json",
        "tovu-signature": signatureHeader,
        "tovu-delivery-id": row.id,
        "tovu-event-id": row.eventId,
      },
      body: rawBody,
      timeoutMs: deps.requestTimeoutMs,
    });

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, responseStatus: response.status };
    }
    return {
      ok: false,
      error: `non-2xx response: ${response.status}`,
      responseStatus: response.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown webhook delivery error";
    return { ok: false, error: message, responseStatus: null };
  }
}

/**
 * Run `webhooks.beforeDispatch` contributors in deterministic priority order (ADR-024 §7, lower
 * runs first), threading each contributor's optional replacement envelope to the next. Throws
 * `WebhookDeliveryVetoedError` on an explicit `{ send: false }` veto; a contributor's own
 * throw/rejection propagates unchanged. Both cases are failures the caller treats identically —
 * see `attemptOneDelivery`'s doc for why: `WebhookDeliveryRepoPort` has no terminal state
 * distinct from `failed`/`dead` for "a filter said don't send this one", so a veto rides the
 * same backoff→dead path as any other failure (flagged as an open item: ADR-036 doesn't specify
 * a vetoed delivery's terminal status, and the port doesn't yet offer one).
 */
async function runBeforeDispatchHooks(
  hooks: readonly WebhookBeforeDispatchHook[],
  input: { subscription: WebhookSubscriptionRecord; envelope: WebhookEventEnvelope }
): Promise<WebhookEventEnvelope> {
  const ordered = [...hooks].sort((a, b) => a.priority - b.priority);
  let envelope = input.envelope;

  for (const hook of ordered) {
    const result = await hook.handle({ subscription: input.subscription, envelope });
    if (!result.send) {
      throw new WebhookDeliveryVetoedError(
        `webhooks.beforeDispatch hook vetoed delivery for subscription '${input.subscription.id}'`
      );
    }
    if (result.envelope) envelope = result.envelope;
  }

  return envelope;
}
