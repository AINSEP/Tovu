// Implementation: /Users/la/Programming/Jini/packages/integrations/src/webhooks/delivery.ts
/** Translate existing durable ports and supply Tovu's webhook header vocabulary.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
 * @file The two-stage webhook delivery worker (ADR-036 §4): fan-out enqueue + the
 * claim/sign/POST/retry loop.
 *
 * Purpose:
 * - `enqueueDelivery` — Stage A. The outbox fan-out subscriber's per-event work: match a
 *   delivered domain event's topic against active subscriptions and enqueue one
 *   `webhook_deliveries` row per match, idempotently keyed on `(event_id, subscription_id)`.
 * - `processDueDeliveries` — Stage B, mirrors `src/contracts/core/events/outbox-worker.ts`'s
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
 * the repo ports) so the Jini implementation stays a pure orchestration of the retry/backoff/hook state
 * machine, which is the part actually worth testing in isolation.
 *
 * Capped delivery attempts before a row dead-letters (ADR-036 §4: "default 8 over ~ a day").
 *
 * Backoff base: the first retry after a failure waits (before jitter) this long.
 *
 * Backoff cap: no single step waits longer than this, however high `attempts` climbs.
 *
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
 *
 * Thrown when a `webhooks.beforeDispatch` hook explicitly vetoes a delivery (`send: false`).
 *
 * The minimal shape `enqueueDelivery` needs from a delivered domain event — a narrowed
 * `DomainEvent` (../core/ports) with a JSON-safe payload, since the envelope this becomes must
 * be structured-clone-safe (ADR-024 §3 ABI).
 *
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
 *
 * Check-before-insert idempotency guard for `(eventId, subscriptionId)`. `WebhookDeliveryRepoPort`
 * has no direct by-event lookup, so this scans the subscription's deliveries via
 * `listBySubscription` — see this function's caller's `@complexity` note for the scaling caveat.
 *
 * Ordered by `priority` internally regardless of input order (ADR-024 §7). Defaults to none.
 *
 * Override for tests; production always uses `MAX_DELIVERY_ATTEMPTS`.
 *
 * Injected into `computeBackoffMs` for deterministic tests.
 *
 * Rows claimed this pass.
 *
 * Failed but still retryable (re-entered "pending" with a future `nextAttemptAt`).
 *
 * Failed and exhausted `maxAttempts` — transitioned to `dead`.
 *
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
 *
 * Applies `processDueDeliveries`' documented defaults to the caller-supplied optional bag —
 *  extracted purely so the defaulting decisions don't count against the orchestrator's own
 *  complexity budget (see the batch's complexity-refactor brief on default-parameter cost).
 *
 * Persists one claimed row's attempt outcome (mark delivered, or compute backoff/dead-letter and
 *  mark failed) and reports which bucket the caller's result tally should credit. Pure sequencing
 *  in `processDueDeliveries` calls this once per claimed row; extracting it is what let the loop
 *  body stop carrying the mark-delivered/backoff/dead-letter branching itself.
 *
 * One claimed row's full attempt: resolve subscription + envelope, run hooks, sign, POST.
 * Every failure mode (missing subscription, paused/disabled subscription, missing envelope, a
 * throwing/vetoing hook, a transport error, a non-2xx response) funnels into the same
 * `{ ok: false }` shape so the caller's retry/backoff/dead-letter logic is a single code path.
 *
 * Run `webhooks.beforeDispatch` contributors in deterministic priority order (ADR-024 §7, lower
 * runs first), threading each contributor's optional replacement envelope to the next. Throws
 * `WebhookDeliveryVetoedError` on an explicit `{ send: false }` veto; a contributor's own
 * throw/rejection propagates unchanged. Both cases are failures the caller treats identically —
 * see `attemptOneDelivery`'s doc for why: `WebhookDeliveryRepoPort` has no terminal state
 * distinct from `failed`/`dead` for "a filter said don't send this one", so a veto rides the
 * same backoff→dead path as any other failure (flagged as an open item: ADR-036 doesn't specify
 * a vetoed delivery's terminal status, and the port doesn't yet offer one).
 */
import {
  enqueueDelivery as enqueueWebhookDelivery,
  processDueDeliveries as processWebhookDeliveries,
  type WebhookDeliveryRepoPort as JiniDeliveryRepo,
  type EnqueueDeliveryDeps as JiniEnqueueDeps,
  type ProcessDueDeliveriesDeps as JiniProcessDeps,
  type EnqueueDeliveryOptional,
  type ProcessDueDeliveriesOptional,
  type ProcessDueDeliveriesResult,
  type WebhookSourceEvent,
} from "@jini-ai/integrations/webhooks";
import type { WebhookDeliveryRepoPort, HttpClientPort } from "./ports.js";

export { computeBackoffMs, MAX_DELIVERY_ATTEMPTS, WebhookDeliveryVetoedError } from "@jini-ai/integrations/webhooks";
export type { EnqueueDeliveryOptional, ProcessDueDeliveriesOptional, ProcessDueDeliveriesResult, WebhookSourceEvent } from "@jini-ai/integrations/webhooks";

export interface EnqueueDeliveryDeps extends Omit<JiniEnqueueDeps, "deliveryRepo" | "clock"> {
  deliveryRepo: WebhookDeliveryRepoPort;
  clock: { nowIso(): string };
}
export interface EnqueueDeliveryRequired { deps: EnqueueDeliveryDeps; input: { event: WebhookSourceEvent }; }
export interface ProcessDueDeliveriesDeps extends Omit<JiniProcessDeps, "deliveryRepo" | "httpClient" | "headers" | "clock"> {
  deliveryRepo: WebhookDeliveryRepoPort;
  httpClient: HttpClientPort;
  clock: { nowIso(): string };
}
export interface ProcessDueDeliveriesRequired { deps: ProcessDueDeliveriesDeps; }

/** Retain atomic durable enqueue(record, envelope) and the host's failed-at field placement.
 * ADR-046 fold-in item 5 (GAP-05/GAP-12): the durable adapter writes the envelope in the SAME
 * INSERT as the delivery row, closing the crash gap. Jini's following envelopeStore.save remains
 * the actual write for memory adapters and a harmless repeated write for co-persisting adapters.
 */
function adaptDeliveryRepo(repo: WebhookDeliveryRepoPort): JiniDeliveryRepo {
  return {
    enqueue: ({ record }, optional = {}) => repo.enqueue(record, optional.envelope),
    claimPending: (required) => repo.claimPending(required),
    markDelivered: (required) => repo.markDelivered(required),
    markFailed: (required, optional = {}) => repo.markFailed({ ...required, ...optional }),
    findById: (required) => repo.findById(required),
    listBySubscription: (required) => repo.listBySubscription(required),
  };
}

/** Delegate fan-out without changing durable deduplication or envelope co-persistence.
 * @complexity O(matching subscriptions × delivery history), as defined by the existing repo port.
 */
export function enqueueDelivery({ deps, input }: EnqueueDeliveryRequired, optional: EnqueueDeliveryOptional = {}) {
  return enqueueWebhookDelivery({ deps: {
    ...deps,
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
    deliveryRepo: adaptDeliveryRepo(deps.deliveryRepo),
  }, input }, optional);
}

/** Jini owns claim/retry/hooks/sign/send; host adapters preserve transport and signature headers.
 * @complexity O(batch size × bounded envelope bytes), with one bounded HTTP request per delivery.
 */
export function processDueDeliveries({ deps }: ProcessDueDeliveriesRequired, optional: ProcessDueDeliveriesOptional = {}): Promise<ProcessDueDeliveriesResult> {
  return processWebhookDeliveries({ deps: {
    ...deps,
    deliveryRepo: adaptDeliveryRepo(deps.deliveryRepo),
    // Preserve the signed body bytes; only unwrap the canonical HTTP request object.
    // Redirect policy comes from host composition; unsupported per-call controls fail closed.
    httpClient: { send: ({ request }, options = {}) => {
      if (options.redirect !== undefined) throw new Error("webhook HTTP adapter does not support per-request redirect controls");
      return deps.httpClient.send(request);
    } },
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
    headers: { signature: "tovu-signature", deliveryId: "tovu-delivery-id", eventId: "tovu-event-id" },
  } }, optional);
}
