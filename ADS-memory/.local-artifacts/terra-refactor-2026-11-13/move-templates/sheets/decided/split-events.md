# EV-1..EV-5: one shared event contract in `@jini-ai/core/contracts/events`; delivery machinery in `@jini-ai/infra/events/outbox`; Tovu keeps bindings (templates T-HARDEN + T-SPLIT + T-REPOINT)

Owner decision 2026-11-15 (#2, Codex decide-4.md §2): core `contracts/events` is the single contract owner (it gains `EventEnvelope`, generic `OutboxRecord<Event>`, `OutboxClaim`, generic `OutboxPort<Event>` with an explicit per-call claim lease and optional fencing receipts, `EventPublisher`, `OutboxRetryPolicy`, `OutboxRetryPolicyResolver`); infra `events/outbox` keeps `processOutbox`, `startOutboxDrainer`, `toEnqueueOnlyOutbox`, policies, and gains `InMemoryOutbox` + `InMemoryEventBus`, all consuming core types directly; Tovu's SQL adapter honours the passed lease; Tovu deletes `jini-outbox-adapter.ts`, `enqueue-only-outbox.ts`, `memory-bus.ts` and every forwarding re-export, and keeps only its bindings (`processOutbox` + `startOutboxDrainer` wrappers, retry table, tracing, drainer ownership).
Written 2026-11-15 from Jini `integ/wave-b` 843bf7189 and Tovu `integ/wave-b` c6d5b56af (Tovu event files: blobs equal on `refactor/terra`; the wave-B C3 rows C3.repoint.tsv:284-294,298 rewrite their `@jini-ai/cms/core` import line to `@jini-ai/core/contracts/events`).
**Execute after wave B merge** (Jini: core `contracts/events` exists only from C3b; Tovu: the C3 import rewrite). Coordinator precondition: record in the decision log that this amends C3's "verbatim contract" decision (decide-4.md §2 RISKS).
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base  SHEETS=/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/move-templates/sheets/decided

| slice | repo | what | behaviour change | tier | est. executor tokens |
|---|---|---|---|---|---|
| EV-1 | Jini | core contract amendment (types only, additive) | no (types) | Sonnet high; Opus review of the contract text | ~25k |
| EV-2 | Tovu | SQL + in-memory outbox honour a per-call `claimLeaseMs` | YES: failing test first | Sonnet high; Opus checks RED/GREEN | ~20k |
| EV-3 | Jini | infra consumes core types; `InMemoryOutbox`/`InMemoryEventBus` + their tests move in; why-comments move onto policy constants | no (pure move; the lease behaviour moved is already GREEN from EV-2) | Sonnet high | ~60k |
| EV-4 | Tovu | scripted repoint (133 files) + call-shape edits + binding rewrite + deletions | no | Sonnet high | ~70k |
| EV-5 | Jini | delete infra's transitional type re-export | no | Sonnet/Haiku | ~10k |

Order: EV-1 -> EV-2 -> EV-3 -> EV-4 -> EV-5, one commit each, in that order. EV-2 typechecks only once Tovu is linked to the EV-1 Jini commit (D1); its node:test run does not depend on that.

## Design decisions made here (executor makes none)
- `claimLeaseMs` is OPTIONAL inside the claim's required object (`{ batchSize, nowIso, claimLeaseMs? }`). The worker always passes it (it already does); an adapter must honour a passed value and falls back to its configured default when absent. Required would break ~110 direct `claimPending({ batchSize, nowIso })` test callers in Tovu and Jini cms for no correctness gain, and the decision text asks the SQL adapter to keep its "default behaviour". Production lease is unchanged (worker default 30 min == adapter default 30 min).
- Generic defaults: `OutboxRecord<Event extends EventEnvelope = DomainEvent>`, `OutboxPort<Event … = DomainEvent>`, `EventPublisher<Event … = DomainEvent>`, so every existing unparameterized core/cms/Tovu use keeps its meaning (additive). Infra code that relied on infra's old `= EventEnvelope` default is parameterized explicitly (worker.ts line 20).
- Fencing receipts: `OutboxClaim { id; claimToken? }` on `markDelivered`/`markFailed`, and `OutboxRecord.claimToken?`. No Tovu adapter issues tokens (no row-format change); documented as distinct from `FencedOutboxPort`.
- DEFERRED, NOT in this sheet: the decision's "`enqueue` and `publish` receive `{ event }`". `OutboxPort.enqueue(event)` and `EventBusPort.publish(event)` stay positional. Switching them breaks ~300 `enqueue(` and ~200 `publish(` call sites plus cms's own narrow outbox ports in both repos; that needs a type-aware codemod sheet (Opus), coordinator to schedule. Consequence now: infra's `toEnqueueOnlyOutbox` follows the core port (`enqueue(event)`), and Tovu keeps one bus adapter lambda (`({ event }) => bus.publish(event)`) in its binding.
- In-memory implementations land in ONE leaf `packages/infra/src/events/outbox/in-memory.ts`, exported from the existing `@jini-ai/infra/events/outbox` barrel: no new subpath, no package.json edit.
- Tovu keeps `contracts/core/events/{index,outbox-worker,outbox-drainer,outbox-retry-policies}.ts` as its binding module; `index.ts` exports only Tovu's own `processOutbox` and `startOutboxDrainer`. `outboxWorkerArgs` moves from the deleted `jini-outbox-adapter.ts` into `outbox-worker.ts`; `toJiniOutbox`/`toCmsOutbox` are deleted (the SQL adapter now IS a core `OutboxPort` the worker consumes).
- Tovu's `computeOutboxBackoffMs({ attempts }, { random })` wrapper is deleted; callers use Jini's `computeOutboxBackoffMs({ attempts, random })` (the no-random caller passes `random: Math.random`, which its test mocks). Tovu's positional `toEnqueueOnlyOutbox(outbox)` is deleted; callers use Jini's `toEnqueueOnlyOutbox({ outbox })`. All its callers are tests (ADR-070 removed the daemon use).
- Tests: the 9 `memory-bus.test.ts` cases move to Jini (vitest, assertions 1:1) and the file is deleted; Tovu's `outbox-repo.contract.test.ts` keeps running its full suite against Jini's `InMemoryOutbox` (rule-of-two) and the SQL adapters. Every other Tovu test only has its import repointed or its call shape converted.
- `development/scripts/write-path-inventory.baseline.json`: drop the 3 entries whose `file` is `src/contracts/core/events/memory-bus.ts`; the 4 `outbox-worker.ts` entries stay (file kept). The baseline is not a CI gate and is already stale (it names `src/contracts/core/ports.ts`).

Guard helper used below (Tovu files whose import line the wave-B C3 rows rewrite):
```bash
sg() { grep -v -E "@jini-ai/(cms/core|core/contracts/events)['\"]" "$1" | git hash-object --stdin; }   # run from TOVU_CLONE
```
A file guarded with `sg` must ALSO print 0 for `grep -c "@jini-ai/cms/core" <file>` (wave B merged). Either check failing = SKIP that slice.

---------------------------------------------------------------------------------------------------
## EV-1 (Jini): core contract amendment, types only

Guards: `git hash-object packages/core/src/contracts/events/ports.ts` = `e491e52db15bdf83e2a930915d2631d85334e85f`; `packages/core/README.md` = `d2fffd937d9f84c19e9b6672869123e8604465eb`; `rg -n "EventEnvelope|OutboxClaim|EventPublisher|OutboxRetryPolicy" packages/core/src` prints nothing.

### EV-1a. `packages/core/src/contracts/events/ports.ts`: replace lines 81-138 (the `/**` above ` * Persisted outbox row used for reliable async event delivery.` through the `}` closing `export interface OutboxPort`; line 139 is blank, line 140 is `/** Clock and ID generator contracts are owned by the shared kernel primitives. */`) with exactly:
```ts
/**
 * The smallest event shape the delivery machinery reads: only `name` (to pick a retry policy and to
 * label a delivery). The full application envelope passes through delivery unchanged. `DomainEvent`
 * satisfies it, so a host that is not a CMS need not manufacture CMS fields to use the worker.
 */
export interface EventEnvelope {
  readonly name: string;
}

/**
 * Persisted outbox row used for reliable async event delivery.
 */
export interface OutboxRecord<Event extends EventEnvelope = DomainEvent> {
  /** Primary key for the outbox row (same as `event.id`). */
  id: UUID;
  /**
   * The full event envelope. The outbox must preserve everything the producer
   * emitted (workspaceId, aggregateId, actorId, occurredAt, metadata) so
   * delivery replays the original event, not a reconstruction.
   */
  event: Event;
  /** Delivery lifecycle state. */
  status: "pending" | "processing" | "delivered" | "failed";
  /** Number of delivery attempts so far; one-based once claimed, incremented atomically by `claimPending`. */
  attempts: number;
  /** Retry eligibility timestamp; while `processing`, the claim lease expiry. */
  nextAttemptAt: ISODateTime;
  /** Most recent delivery failure reason. */
  lastError?: string;
  /** Row creation timestamp. */
  createdAt: ISODateTime;
  /**
   * Optional fencing receipt, issued and checked by a token-capable adapter. It only stops a stale
   * outcome overwriting a newer claim of the same row; it does not give the guarantees of the separate
   * fenced-delivery protocol (`FencedOutboxPort` in the outbox worker package). Adapters without tokens
   * leave it absent and keep their historical unfenced late-write behaviour.
   */
  claimToken?: string;
}

/** Identifies the claim an outcome settles; carries the claim's fencing receipt when the adapter issued one. */
export interface OutboxClaim {
  id: UUID;
  claimToken?: string;
}

/**
 * Reliable outbox contract.
 *
 * Command handlers enqueue events here in the same unit of work as the write.
 * A worker later claims and delivers rows to the event bus.
 */
export interface OutboxPort<Event extends EventEnvelope = DomainEvent> {
  /** Append an event for later delivery. */
  enqueue(event: Event): Promise<void>;
  /**
   * Atomically claim due `pending` rows and `processing` rows whose claim lease has expired, never a
   * terminal row: mark each `processing`, increment `attempts`, persist `nowIso + claimLeaseMs` as its
   * lease (in `nextAttemptAt`) and return detached copies.
   *
   * `claimLeaseMs` is the lease the caller's delivery-timeout budget was validated against (the lease
   * must outlast a full batch of delivery timeouts). The outbox worker always passes it and an adapter
   * must honour it; absent (a direct caller), the adapter applies its configured default lease.
   */
  claimPending(
    required: { batchSize: number; nowIso: ISODateTime; claimLeaseMs?: number },
    optional?: Record<string, never>
  ): Promise<OutboxRecord<Event>[]>;
  /** Mark a row as delivered. With a `claimToken`, a stale outcome must not overwrite a newer claim. */
  markDelivered(required: OutboxClaim, optional?: Record<string, never>): Promise<void>;
  /**
   * Mark a row as failed and set its next retry time.
   *
   * `nextStatus` is decided by the CALLER (the retry-policy owner, e.g. a worker that tracks an
   * attempt cap) — an implementation must persist exactly what it is told, not re-derive the
   * decision from the row's own stored `attempts` (2026-09-06: this parameter replaced that
   * adapter-side re-derivation, mirroring `WebhookDeliveryRepoPort.markFailed`'s `nextStatus`
   * shape in the host). `"pending"` re-enters the retry queue at `nextAttemptAt`; `"failed"`
   * is terminal — `claimPending` only ever selects `"pending"` rows, so a `"failed"` row is
   * permanently excluded from retry regardless of `nextAttemptAt`. With a `claimToken`, a stale
   * outcome must not overwrite a newer claim.
   */
  markFailed(
    required: OutboxClaim & {
      error: string;
      nextAttemptAt: ISODateTime;
      nextStatus: Extract<OutboxRecord["status"], "pending" | "failed">;
    },
    optional?: Record<string, never>
  ): Promise<void>;
}

/** The delivery side of an event bus as an outbox worker sees it: publish one claimed event. */
export interface EventPublisher<Event extends EventEnvelope = DomainEvent> {
  publish(required: { event: Event }): Promise<void>;
}

/**
 * Retry policy for one event, chosen by the host per event name. Events with no policy keep the
 * worker's default six attempts and 15s..30min equal-jitter backoff. `error` is whatever failed the
 * attempt (a publish failure, or a storage failure recording a delivery). A policy that throws, or
 * returns an invalid cap or delay, is reported and the row falls back to the default policy.
 */
export interface OutboxRetryPolicy {
  /** Positive integer cap; a failed attempt at or past it is terminal. */
  readonly maxAttempts: number;
  /** Finite, nonnegative delay before the next attempt. */
  backoffMs(required: { attempts: number; random: () => number; error: unknown }): number;
  /** `false` makes this failure terminal at once; absent means every failure is retryable. */
  retryable?(required: { error: unknown }): boolean;
}

/** The only per-event retry seam: return a policy for events that need one, `undefined` otherwise. */
export type OutboxRetryPolicyResolver = (required: { event: EventEnvelope }) => OutboxRetryPolicy | undefined;
```
Do it with a script, never by hand-counting: `python3 -I -c 'import sys;p=sys.argv[1];L=open(p).read().split("\n");assert L[80]=="/**" and L[81].startswith(" * Persisted outbox row") and L[137]=="}" and L[139].startswith("/** Clock and ID");new=open(sys.argv[2]).read().rstrip("\n").split("\n");open(p,"w").write("\n".join(L[:80]+new+L[138:]))' packages/core/src/contracts/events/ports.ts {SCRATCH}/ev1-block.ts` (save the block above to `{SCRATCH}/ev1-block.ts` first). An assertion error = SKIP.
(`events.ts` already does `export type * from "./events/ports.js"`: no barrel edit.)

### EV-1b. `packages/core/README.md`: OLD (once)
```
`@jini-ai/core/contracts/events` holds the type-only command/event/outbox vocabulary: `DomainEvent`, `EventBusPort`,
`OutboxPort`, `OutboxRecord`, `TransactionalRepoPort`, the change-set records and `ChangeSetRepoPort`, the command
```
NEW
```
`@jini-ai/core/contracts/events` holds the type-only command/event/outbox vocabulary: `DomainEvent`, `EventEnvelope`,
`EventBusPort`, `EventPublisher`, `OutboxPort`, `OutboxRecord`, `OutboxClaim`, `OutboxRetryPolicy`,
`OutboxRetryPolicyResolver`, `TransactionalRepoPort`, the change-set records and `ChangeSetRepoPort`, the command
```

### EV-1c. Changeset `.changeset/core-events-outbox-contract.md`:
```
---
"@jini-ai/core": minor
---

`@jini-ai/core/contracts/events` is the one outbox contract: `EventEnvelope`, generic `OutboxRecord<Event>`/`OutboxPort<Event>`, `OutboxClaim` (optional fencing receipt), an explicit per-call `claimLeaseMs` on `claimPending`, `EventPublisher`, `OutboxRetryPolicy` and `OutboxRetryPolicyResolver`.
```
Checks: COMMON rule 2 grep on the two edited files + changeset; eslint `packages/core/src/contracts/events/ports.ts`. Commit `git commit -F {SCRATCH}/ev1.msg -- packages/core/src/contracts/events/ports.ts packages/core/README.md .changeset/core-events-outbox-contract.md`; message `feat(core): one outbox contract with an explicit claim lease and fencing receipts` / body `Adds EventEnvelope, OutboxClaim, EventPublisher and the retry-policy types to contracts/events and makes OutboxRecord/OutboxPort generic (default DomainEvent). Types only; enqueue stays positional until the enqueue/publish normalization.`

---------------------------------------------------------------------------------------------------
## EV-2 (Tovu): adapters honour a per-call claim lease (BEHAVIOUR CHANGE -> failing test first, same commit)

Guards (from TOVU_CLONE; `sg` + zero `@jini-ai/cms/core`): `apps/website/src/contracts/core/events/__tests__/outbox-repo.contract.test.ts` sg = `eb8cf408ee7ebc7a3daf422923b448f72b6f641f`; `apps/website/src/contracts/core/events/memory-bus.ts` sg = `7f91f95beb365eea2207296d273def51065e88f1`; `apps/website/src/platform/db/repos/outbox-repo.ts` sg = `9db60005fc7c0aa92534359c6cfacbd27adb465b`.

### EV-2a (test FIRST). `outbox-repo.contract.test.ts`: insert the block below immediately BEFORE the line (occurs once)
`  test(\`[${label}] a delivered or terminally failed row is never reclaimed, however old its claim\`, async () => {`
```ts
  test(`[${label}] a claimLeaseMs passed to claimPending wins over the configured lease`, async () => {
    const outbox = makeOutbox({ claimLeaseMs: 60_000 });
    await outbox.enqueue(makeEvent());
    await outbox.claimPending({ batchSize: 10, nowIso: "2026-07-16T00:00:01.000Z", claimLeaseMs: 120_000 });

    const afterConfiguredLease = await outbox.claimPending({ batchSize: 10, nowIso: "2026-07-16T00:01:01.000Z" });
    assert.equal(afterConfiguredLease.length, 0, "the per-call lease, not the configured one, must hold the claim");

    const afterPassedLease = await outbox.claimPending({ batchSize: 10, nowIso: "2026-07-16T00:02:01.000Z" });
    assert.deepEqual(afterPassedLease.map((row) => [row.id, row.attempts]), [["evt-1", 2]]);
  });

```
On the parent this is RED for every label (`memory`, `sqlite`, `kysely/*`: the 60 s configured lease expires at 00:01:01 and the row is reclaimed); GREEN on the EV-2 commit. Report "RED on parent expected: outbox-repo.contract.test.ts › [*] a claimLeaseMs passed to claimPending wins over the configured lease".

### EV-2b. `apps/website/src/platform/db/repos/outbox-repo.ts`: OLD (once)
```ts
   * they were claimed at. */
  async claimPending({ batchSize, nowIso }: { batchSize: number; nowIso: ISODateTime }): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + this.claimLeaseMs).toISOString();
```
NEW
```ts
   * they were claimed at. A `claimLeaseMs` passed by the caller (the outbox worker always passes the
   * lease its delivery-timeout budget was validated against) wins over the configured lease; the row
   * format is unchanged (the lease expiry lives in `next_attempt_at`). */
  async claimPending({ batchSize, nowIso, claimLeaseMs = this.claimLeaseMs }: { batchSize: number; nowIso: ISODateTime; claimLeaseMs?: number }): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + claimLeaseMs).toISOString();
```

### EV-2c. `apps/website/src/contracts/core/events/memory-bus.ts`: OLD (once)
```ts
   * the same shape `SqliteOutboxAdapter.claimPending` returns.
   *
   * @complexity O(stored rows) per claim.
   */
  async claimPending({ batchSize, nowIso }: { batchSize: number; nowIso: string }): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + this.claimLeaseMs).toISOString();
```
NEW
```ts
   * the same shape `SqliteOutboxAdapter.claimPending` returns. A `claimLeaseMs` passed by the caller
   * (the outbox worker always passes the lease its delivery-timeout budget was validated against)
   * wins over the configured lease.
   *
   * @complexity O(stored rows) per claim.
   */
  async claimPending({ batchSize, nowIso, claimLeaseMs = this.claimLeaseMs }: { batchSize: number; nowIso: string; claimLeaseMs?: number }): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + claimLeaseMs).toISOString();
```
After EV-2c, `sg apps/website/src/contracts/core/events/memory-bus.ts` must print `0dd92701c3c61c9a37409cec121cdbcd1f161c01` (else restore and SKIP).
Production effect: none (the worker passes 30 min, the adapters' default is 30 min; `jini-outbox-adapter.ts` still drops the lease until EV-4).
Checks: eslint the 3 files (a type error on the new `claimLeaseMs` key in the test before EV-1 is linked is expected: record). Commit `git commit -F {SCRATCH}/ev2.msg -- <the 3 paths>`; message `fix(outbox): honour the claim lease the outbox worker passes` / body `The SQL and in-memory outboxes used only their configured lease; a passed claimLeaseMs now wins, so the lease the worker validated its delivery-timeout budget against is the one stored. Row format unchanged. Failing contract test first.`

---------------------------------------------------------------------------------------------------
## EV-3 (Jini): infra consumes the core contract; in-memory implementations move in

Guards (Jini, `git hash-object`): `packages/infra/src/events/outbox/ports.ts` e1d15f28bb0f8e3caa83afe5de67eb21878d0270; `policy.ts` 7c3056d86287b87fcb11b4c08aa71a269e856ff4; `index.ts` f2c78be7a1601f4dfccfab5723f7305c8985990a; `enqueue-only.ts` b97d9c1941d4f302ba4ce9bd0d5c1f184e496a35; `drainer.ts` d4e25b9e314bc2e2ae3ad5c0a75f91a808bac5af; `worker.ts` e8834da0c26c0f74c0d5dd85b4c0861107a2d552; `__tests__/fixtures.ts` c397a770c82a22a408c762594f3232abef0b3b11; `__tests__/enqueue-only.test.ts` 945b81fa63f78a336eb65452c8db496936734418; `__tests__/batch-parity.dbpkg-infra.test.ts` 0a8ae85548a01e082547464450cdaff44cc3c269; `__tests__/retry-policy.test.ts` cd2cfd71e77b5df30686181a2016a1aecdd843a8; `packages/infra/README.md` 42546b519bb72057c7941328c6feb4a25c9e99d7; EV-1 committed (`rg -n "export interface OutboxClaim" packages/core/src/contracts/events/ports.ts` prints 1 line); `packages/infra/src/events/outbox/in-memory.ts` and `__tests__/in-memory.test.ts` absent; `rg -n "InMemoryOutbox|InMemoryEventBus" packages/infra` prints nothing. Tovu precondition: EV-2 committed (`rg -c "claimLeaseMs = this.claimLeaseMs" {TOVU_CLONE}/apps/website/src/contracts/core/events/memory-bus.ts` prints 1).
All paths below are under `packages/infra/src/events/outbox/` unless stated; each OLD occurs exactly once.

### EV-3a. `ports.ts`
1. Replace lines 1-31 (from `import type { Clock, Logger } from '@jini-ai/core/primitives';` through the `}` closing `export interface EventPublisher`) with:
```ts
import type { Clock, Logger } from '@jini-ai/core/primitives';
import type { EventEnvelope, EventPublisher, OutboxPort, OutboxRetryPolicyResolver } from '@jini-ai/core/contracts/events';

// Transitional, removed once no consumer imports them from here: these contract types are owned by @jini-ai/core/contracts/events.
export type { EventEnvelope, EventPublisher, OutboxClaim, OutboxPort, OutboxRecord, OutboxRetryPolicy, OutboxRetryPolicyResolver } from '@jini-ai/core/contracts/events';
```
2. Delete the block from the line `/**` directly above ` * Retry policy for one event, chosen by the host per event name. Events with no policy keep the` through `export type OutboxRetryPolicyResolver = (required: { event: EventEnvelope }) => OutboxRetryPolicy | undefined;` (16 lines, originally 47-62). `export interface OutboxWorkerOptions {` must directly follow `}` of `OutboxWorkerArgs` afterwards.

### EV-3b. `policy.ts`: OLD
```ts
import type { OutboxRetryPolicyResolver, OutboxWorkerOptions } from './ports.js';

export const MAX_OUTBOX_ATTEMPTS = 6;
export const DEFAULT_OUTBOX_CLAIM_LEASE_MS = 30 * 60 * 1000;
export const DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS = 60 * 1000;
export const DEFAULT_OUTBOX_DRAIN_INTERVAL_MS = 1000;

/** Source equal-jitter retry formula. Randomness is always supplied by the host. */
```
NEW (the why-comments moved from the host facade, rule 12)
```ts
import type { OutboxRetryPolicyResolver } from '@jini-ai/core/contracts/events';
import type { OutboxWorkerOptions } from './ports.js';

/** Capped delivery attempts before an outbox row is permanently excluded from retry (`"failed"`). */
export const MAX_OUTBOX_ATTEMPTS = 6;
/**
 * How long a claim holds a row before another drain may claim it again.
 *
 * A claimer that dies between `claimPending` and `markDelivered`/`markFailed` (a crash, a dev-server
 * reload) must not strand its rows as `"processing"`. Adapters store the lease expiry in the row's
 * `nextAttemptAt` and treat an expired `"processing"` row as claimable, so delivery is at-least-once.
 * The lease must outlast the slowest full batch a live claimer can take; otherwise a second drain
 * takes over a row that is still being delivered, and it is delivered twice.
 */
export const DEFAULT_OUTBOX_CLAIM_LEASE_MS = 30 * 60 * 1000;
/**
 * How long one row's delivery (its `bus.publish`) may run before `processOutbox` gives up on it and
 * the drain moves on. A timed-out delivery is recorded at once as a retryable failure (`lastError` is
 * visible immediately), but the row is not due again until `DEFAULT_OUTBOX_CLAIM_LEASE_MS` later, not
 * at the ordinary backoff: the handler cannot be cancelled and keeps running, and redelivering it in
 * 15-30s would start a second copy while the first is still live, exactly what the claim lease exists
 * to prevent. The handler's real outcome, once it settles, replaces that record (see `recordOverrun`
 * in worker.ts). A full default batch of 20 deliveries that each time out takes 20 minutes, inside
 * `DEFAULT_OUTBOX_CLAIM_LEASE_MS`.
 */
export const DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS = 60 * 1000;
/** Wait between drains when the last one did not fill a batch; bounds how late an event is delivered. */
export const DEFAULT_OUTBOX_DRAIN_INTERVAL_MS = 1000;

/**
 * Exponential backoff with "equal jitter": `half = min(cap, base * 2^(attempts-1)) / 2`, then
 * `half + random() * half`, so a retry is always at least `half` and at most the full exponential
 * step: retries never collapse to zero delay (thundering herd) or drift outside the exponential
 * envelope. `attempts` is 1-based (the count after the failing attempt; `claimPending` increments it
 * before the attempt runs). At `attempts = 1..6` the un-jittered midpoints are roughly 15s, 30s, 1m,
 * 2m, 4m, 8m: an in-process event-bus failure is expected to be a real bug or a short-lived dependency
 * outage, not a slow external endpoint, so this window is far shorter than an outgoing-webhook
 * schedule. Randomness is always supplied by the host.
 */
```

### EV-3c. `worker.ts`
1. OLD `import type { EventEnvelope, OutboxClaim, OutboxRecord, OutboxRetryPolicy, OutboxWorkerArgs, OutboxWorkerOptions, Scheduler } from './ports.js';`
   NEW (two lines)
   `import type { EventEnvelope, OutboxClaim, OutboxRecord, OutboxRetryPolicy } from '@jini-ai/core/contracts/events';`
   `import type { OutboxWorkerArgs, OutboxWorkerOptions, Scheduler } from './ports.js';`
2. OLD `function claim(row: OutboxRecord): OutboxClaim {` NEW `function claim(row: OutboxRecord<EventEnvelope>): OutboxClaim {` (core's default event is `DomainEvent`; infra's was `EventEnvelope`).

### EV-3d. `drainer.ts`: OLD `import type { Empty, EventEnvelope, OutboxWorkerArgs, OutboxWorkerOptions, ScheduledTask, Scheduler } from './ports.js';`
NEW (two lines) `import type { EventEnvelope } from '@jini-ai/core/contracts/events';` / `import type { Empty, OutboxWorkerArgs, OutboxWorkerOptions, ScheduledTask, Scheduler } from './ports.js';`

### EV-3e. `enqueue-only.ts`
1. OLD `import type { EventEnvelope, OutboxPort } from './ports.js';` NEW `import type { EventEnvelope, OutboxPort } from '@jini-ai/core/contracts/events';`
2. OLD `    enqueue: args => required.outbox.enqueue(args),` NEW `    enqueue: event => required.outbox.enqueue(event),`

### EV-3f. New `in-memory.ts` (moved from Tovu `memory-bus.ts` as committed by EV-2; bodies verbatim, docs neutral):
```ts
import type { DomainEvent, EventBusPort, OutboxPort, OutboxRecord } from '@jini-ai/core/contracts/events';
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from './policy.js';

/**
 * @file In-memory implementations of the event bus and outbox contracts (`@jini-ai/core/contracts/events`).
 *
 * Zero-infrastructure adapters: a host can run without a database, queue or broker, and tests can
 * exercise delivery without external dependencies. Durable adapters (a SQL outbox, a broker-backed bus)
 * replace these without touching feature logic.
 */
export class InMemoryEventBus implements EventBusPort {
  /** Map of event name -> subscribed handlers. */
  private handlers = new Map<string, Array<(event: DomainEvent) => Promise<void>>>();
  /** Handlers subscribed to every event regardless of name. */
  private allHandlers: Array<(event: DomainEvent) => Promise<void>> = [];

  /** Publish a single event to all handlers registered for `event.name`, then every `subscribeAll` handler. */
  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    const eventHandlers = this.handlers.get(event.name) ?? [];
    for (const handler of eventHandlers) {
      await handler(event as DomainEvent);
    }
    for (const handler of this.allHandlers) {
      await handler(event as DomainEvent);
    }
  }

  /** Publish events in order. */
  async publishBatch<TPayload>({ events }: { events: Array<DomainEvent<TPayload>> }): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /** Register a handler and return an async unsubscriber. */
  async subscribe<TPayload>(
    { eventName, handler }: { eventName: string; handler: (event: DomainEvent<TPayload>) => Promise<void> }
  ): Promise<() => Promise<void>> {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as (event: DomainEvent) => Promise<void>);
    this.handlers.set(eventName, list);

    return async () => {
      // `subscribe` set this key above and nothing ever deletes a key from `handlers` (unsubscribing
      // replaces the list with a filtered copy), so the list is always present here.
      const current = this.handlers.get(eventName) as Array<(event: DomainEvent) => Promise<void>>;
      this.handlers.set(
        eventName,
        current.filter((h) => h !== (handler as (event: DomainEvent) => Promise<void>))
      );
    };
  }

  /** Register a handler for every event; returns an async unsubscriber. */
  async subscribeAll({ handler }: { handler: (event: DomainEvent) => Promise<void> }): Promise<() => Promise<void>> {
    this.allHandlers.push(handler);

    return async () => {
      this.allHandlers = this.allHandlers.filter((h) => h !== handler);
    };
  }
}

/** A row is claimable when it is due and was either never claimed or is held by an expired claim lease. */
function isClaimable({ row, nowIso }: { row: OutboxRecord; nowIso: string }, _options = {}): boolean {
  return (row.status === 'pending' || row.status === 'processing') && row.nextAttemptAt <= nowIso;
}

/**
 * In-memory outbox implementation.
 *
 * This mirrors durable outbox behaviour for local execution without a database.
 */
export class InMemoryOutbox implements OutboxPort {
  /** Internal mutable storage for outbox rows. */
  private records: OutboxRecord[] = [];
  /** How long a claim holds a row before it may be claimed again, when the caller passes no lease. */
  private readonly claimLeaseMs: number;

  /** @param optional.claimLeaseMs claim lease length (default {@link DEFAULT_OUTBOX_CLAIM_LEASE_MS}). */
  constructor(optional: { claimLeaseMs?: number } = {}) {
    this.claimLeaseMs = optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS;
  }

  /** Enqueue a domain event as a pending outbox row, preserving the full envelope. A repeated
   *  `event.id` is a no-op, as in a durable adapter keyed by event id. */
  async enqueue(event: DomainEvent): Promise<void> {
    if (this.records.some((record) => record.id === event.id)) return;
    this.records.push({
      id: event.id,
      event,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: event.occurredAt,
      createdAt: event.occurredAt,
    });
  }

  /**
   * Claim up to `batchSize` rows due at `nowIso`: `"pending"` rows, and `"processing"` rows whose
   * claim lease has expired (their claimer may have died before recording an outcome). Each claimed
   * row is marked `processing`, its `attempts` incremented and its stored `nextAttemptAt` set to the
   * new lease expiry. The returned records are copies that keep the due time they were claimed at,
   * the same shape a durable adapter returns. A `claimLeaseMs` passed by the caller (the outbox worker
   * always passes the lease its delivery-timeout budget was validated against) wins over the
   * configured lease.
   *
   * @complexity O(stored rows) per claim.
   */
  async claimPending({ batchSize, nowIso, claimLeaseMs = this.claimLeaseMs }: { batchSize: number; nowIso: string; claimLeaseMs?: number }): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + claimLeaseMs).toISOString();
    const due = this.records.filter((row) => isClaimable({ row: row, nowIso: nowIso })).slice(0, batchSize);

    return due.map((row) => {
      const claimed: OutboxRecord = { ...row, status: 'processing', attempts: row.attempts + 1 };
      row.status = 'processing';
      row.attempts = claimed.attempts;
      row.nextAttemptAt = leaseExpiresAt;
      return claimed;
    });
  }

  /** Mark a claimed row as delivered. */
  async markDelivered({ id }: { id: string }): Promise<void> {
    const row = this.records.find((r) => r.id === id);
    if (row) row.status = 'delivered';
  }

  /**
   * Persist the worker's `nextStatus` decision for a failed row. Retry policy belongs to the worker,
   * not storage; this adapter does not evaluate `attempts`.
   */
  async markFailed(
    { id, error, nextAttemptAt, nextStatus }: {
      id: string;
      error: string;
      nextAttemptAt: string;
      nextStatus: Extract<OutboxRecord['status'], 'pending' | 'failed'>;
    }
  ): Promise<void> {
    const row = this.records.find((r) => r.id === id);
    if (!row) return;
    row.status = nextStatus;
    row.lastError = error;
    row.nextAttemptAt = nextAttemptAt;
  }
}
```
Before writing it, confirm the Tovu source still has exactly these bodies: `sg {TOVU_CLONE}/apps/website/src/contracts/core/events/memory-bus.ts` (run from TOVU_CLONE) prints `0dd92701c3c61c9a37409cec121cdbcd1f161c01`; else SKIP.

### EV-3g. `index.ts`: after the line `export * from './in-memory-fenced.js';` insert `export * from './in-memory.js';`.

### EV-3h. Tests
1. `__tests__/fixtures.ts`: OLD `import type { OutboxRecord, OutboxWorkerArgs, Scheduler } from '../index.js';` NEW (two lines) `import type { OutboxRecord } from '@jini-ai/core/contracts/events';` / `import type { OutboxWorkerArgs, Scheduler } from '../index.js';`. OLD `    enqueue: vi.fn(async (_args: { event: TestEvent }) => {}),` NEW `    enqueue: vi.fn(async (_event: TestEvent) => {}),`.
2. `__tests__/enqueue-only.test.ts`: OLD (3 lines)
```ts
  await view.enqueue({ event });
  expect(f.outbox.enqueue).toHaveBeenCalledWith({ event });
  expect(f.outbox.enqueue.mock.calls[0]![0].event).toBe(event);
```
NEW
```ts
  await view.enqueue(event);
  expect(f.outbox.enqueue).toHaveBeenCalledWith(event);
  expect(f.outbox.enqueue.mock.calls[0]![0]).toBe(event);
```
3. `__tests__/batch-parity.dbpkg-infra.test.ts`: OLD (2 lines) `  await view.enqueue({ event });` + `  expect(f.outbox.enqueue.mock.calls[0]![0].event).toBe(event);` NEW `  await view.enqueue(event);` + `  expect(f.outbox.enqueue.mock.calls[0]![0]).toBe(event);`
4. `__tests__/retry-policy.test.ts`: OLD `import { processOutbox, startOutboxDrainer, type OutboxRetryPolicyResolver } from '../index.js';` NEW (two lines) `import type { OutboxRetryPolicyResolver } from '@jini-ai/core/contracts/events';` / `import { processOutbox, startOutboxDrainer } from '../index.js';`
5. New `__tests__/in-memory.test.ts` (the 9 Tovu `memory-bus.test.ts` cases, assertions 1:1 in vitest, then in-memory outbox cases):
```ts
import { expect, test } from 'vitest';
import type { DomainEvent } from '@jini-ai/core/contracts/events';
import { InMemoryEventBus, InMemoryOutbox } from '../in-memory.js';

const event = (id: string, name: string, occurredAt = '2026-02-21T00:00:00.000Z'): DomainEvent =>
  ({ id, name, occurredAt, workspaceId: 'workspace-1', payload: {} });

test('subscribeAll delivers events of several different names to one handler', async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  await bus.subscribeAll({ handler: async (e) => { seen.push(e.name); } });
  await bus.publish(event('evt-1', 'workspace.created'));
  await bus.publish(event('evt-2', 'entry.published', '2026-02-21T00:00:01.000Z'));
  expect(seen).toEqual(['workspace.created', 'entry.published']);
});

test("subscribeAll's unsubscriber stops delivery", async () => {
  const bus = new InMemoryEventBus();
  let count = 0;
  const unsubscribe = await bus.subscribeAll({ handler: async () => { count += 1; } });
  await bus.publish(event('evt-1', 'workspace.created'));
  expect(count).toBe(1);
  await unsubscribe();
  await bus.publish(event('evt-2', 'workspace.created', '2026-02-21T00:00:01.000Z'));
  expect(count).toBe(1);
});

test('subscribeAll handlers run alongside per-name subscribe handlers', async () => {
  const bus = new InMemoryEventBus();
  const order: string[] = [];
  await bus.subscribe({ eventName: 'workspace.created', handler: async () => { order.push('named'); } });
  await bus.subscribeAll({ handler: async () => { order.push('all'); } });
  await bus.publish(event('evt-1', 'workspace.created'));
  expect(order).toEqual(['named', 'all']);
});

test('publishBatch delivers every event, in order, to a subscribeAll handler', async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  await bus.subscribeAll({ handler: async (e) => { seen.push(e.name); } });
  await bus.publishBatch({ events: [
    event('evt-1', 'workspace.created'),
    event('evt-2', 'entry.published', '2026-02-21T00:00:01.000Z'),
    event('evt-3', 'entry.unpublished', '2026-02-21T00:00:02.000Z'),
  ] });
  expect(seen).toEqual(['workspace.created', 'entry.published', 'entry.unpublished']);
});

test('publishBatch on an empty array delivers nothing', async () => {
  const bus = new InMemoryEventBus();
  let calls = 0;
  await bus.subscribeAll({ handler: async () => { calls += 1; } });
  await bus.publishBatch({ events: [] });
  expect(calls).toBe(0);
});

test("subscribe's unsubscriber removes only that handler, leaving a second handler on the same event name intact", async () => {
  const bus = new InMemoryEventBus();
  const firstSeen: string[] = [];
  const secondSeen: string[] = [];
  const unsubscribeFirst = await bus.subscribe({ eventName: 'workspace.created', handler: async (e) => { firstSeen.push(e.name); } });
  await bus.subscribe({ eventName: 'workspace.created', handler: async (e) => { secondSeen.push(e.name); } });
  await unsubscribeFirst();
  await bus.publish(event('evt-1', 'workspace.created'));
  expect(firstSeen, 'the unsubscribed handler must not run').toEqual([]);
  expect(secondSeen, 'the still-subscribed handler must still run').toEqual(['workspace.created']);
});

test('named subscriptions deliver only the matching name', async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  for (const eventName of ['workspace.created', 'entry.published']) {
    await bus.subscribe({ eventName, handler: async (e) => { seen.push(`${eventName}:${e.id}`); } });
  }
  await bus.publish(event('evt-a', 'workspace.created'));
  expect(seen).toEqual(['workspace.created:evt-a']);
  await bus.publish(event('evt-b', 'entry.published', '2026-02-21T00:00:01.000Z'));
  expect(seen).toEqual(['workspace.created:evt-a', 'entry.published:evt-b']);
});

test('a handler failure is reported by publish for the outbox to retry', async () => {
  const bus = new InMemoryEventBus();
  const failure = new Error('consumer failed');
  await bus.subscribe({ eventName: 'entry.published', handler: async () => { throw failure; } });
  await expect(bus.publish(event('evt', 'entry.published'))).rejects.toBe(failure);
});

test('unsubscribing repeatedly preserves other wildcard handlers and later named subscriptions', async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  const removed = await bus.subscribeAll({ handler: async () => { seen.push('removed'); } });
  await bus.subscribeAll({ handler: async (e) => { seen.push(`all:${e.id}`); } });
  const named = await bus.subscribe({ eventName: 'entry.published', handler: async () => { seen.push('old'); } });
  await removed();
  await removed();
  await named();
  await named();
  await bus.subscribe({ eventName: 'entry.published', handler: async (e) => { seen.push(`new:${e.id}`); } });
  await bus.publish(event('evt', 'entry.published'));
  expect(seen).toEqual(['new:evt', 'all:evt']);
});

test('InMemoryOutbox: enqueue is idempotent by id and a claim marks the row processing with attempts 1', async () => {
  const outbox = new InMemoryOutbox();
  const first = event('evt-1', 'demo.event');
  await outbox.enqueue(first);
  await outbox.enqueue({ ...first, payload: { later: true } });
  const claimed = await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:00:01.000Z' });
  expect(claimed.map((row) => [row.event, row.status, row.attempts])).toEqual([[first, 'processing', 1]]);
});

test('InMemoryOutbox: an expired configured lease makes a processing row claimable again', async () => {
  const outbox = new InMemoryOutbox({ claimLeaseMs: 60_000 });
  await outbox.enqueue(event('evt-1', 'demo.event'));
  await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:00:01.000Z' });
  expect(await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:01:00.999Z' })).toEqual([]);
  const again = await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:01:01.000Z' });
  expect(again.map((row) => row.attempts)).toEqual([2]);
});

test('InMemoryOutbox: a claimLeaseMs passed to claimPending wins over the configured lease', async () => {
  const outbox = new InMemoryOutbox({ claimLeaseMs: 60_000 });
  await outbox.enqueue(event('evt-1', 'demo.event'));
  await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:00:01.000Z', claimLeaseMs: 120_000 });
  expect(await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:01:01.000Z' })).toEqual([]);
  const again = await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:02:01.000Z' });
  expect(again.map((row) => [row.id, row.attempts])).toEqual([['evt-1', 2]]);
});

test('InMemoryOutbox: settled rows are never claimed again; markFailed persists the caller\'s nextStatus', async () => {
  const outbox = new InMemoryOutbox();
  await outbox.enqueue(event('evt-delivered', 'demo.event'));
  await outbox.enqueue(event('evt-retry', 'demo.event'));
  await outbox.enqueue(event('evt-dead', 'demo.event'));
  await outbox.claimPending({ batchSize: 10, nowIso: '2026-02-21T00:00:01.000Z' });
  await outbox.markDelivered({ id: 'evt-delivered' });
  await outbox.markFailed({ id: 'evt-retry', error: 'try later', nextAttemptAt: '2026-02-21T00:05:00.000Z', nextStatus: 'pending' });
  await outbox.markFailed({ id: 'evt-dead', error: 'poison', nextAttemptAt: '2026-02-21T00:00:02.000Z', nextStatus: 'failed' });
  await outbox.markDelivered({ id: 'missing' });
  const later = await outbox.claimPending({ batchSize: 10, nowIso: '2099-01-01T00:00:00.000Z' });
  expect(later.map((row) => [row.id, row.lastError, row.attempts])).toEqual([['evt-retry', 'try later', 2]]);
});
```
(All GREEN on the EV-3 commit; nothing to prove RED: the lease behaviour was proven RED/GREEN in EV-2 and moves verbatim.)

### EV-3i. `packages/infra/README.md`: OLD (3 lines)
```
The host's outbox and bus receive `{ event }` objects. Claims receive `{ batchSize, nowIso,
claimLeaseMs }`; storage remains host-owned. Start the drainer only after the delivering process
subscribes its real handlers. Importing the entry or creating a scheduler starts no background work.
```
NEW
```
The host's outbox implements `OutboxPort` from `@jini-ai/core/contracts/events` (its `enqueue` takes the
event itself); the bus side receives `{ event }` objects. Claims receive `{ batchSize, nowIso,
claimLeaseMs }` and an adapter must honour that lease; storage remains host-owned. `InMemoryOutbox` and
`InMemoryEventBus` are zero-infrastructure implementations for development and tests. Start the drainer
only after the delivering process subscribes its real handlers. Importing the entry or creating a
scheduler starts no background work.
```

### EV-3j. Changeset `.changeset/infra-outbox-core-contract.md`:
```
---
"@jini-ai/infra": minor
---

`@jini-ai/infra/events/outbox` consumes the outbox contract from `@jini-ai/core/contracts/events` and exports `InMemoryOutbox` and `InMemoryEventBus`; `toEnqueueOnlyOutbox` follows the core port (`enqueue(event)`).
```
Checks: COMMON rule 2 grep on every created/edited file (in particular `in-memory.ts` must not contain `Sqlite`, `tovu`, `apps/`); rule 5: `rg -n "^import" in-memory.ts` shows only `@jini-ai/core/contracts/events` and `./policy.js`; eslint all touched `.ts`. Commit every path (ports.ts, policy.ts, worker.ts, drainer.ts, enqueue-only.ts, index.ts, in-memory.ts, the 4 edited tests, `__tests__/in-memory.test.ts`, README.md, the changeset). Message `feat(infra): outbox machinery consumes the core event contract; in-memory bus and outbox move in` / body `The worker, drainer and enqueue-only view use @jini-ai/core/contracts/events types directly; the outbox constants carry their lease/timeout/backoff rationale. ports.ts re-exports the contract types until the host stops importing them here.`

---------------------------------------------------------------------------------------------------
## EV-4 (Tovu): repoint, call-shape edits, bindings, deletions

Guards (TOVU_CLONE; `sg` + zero `@jini-ai/cms/core` for the sg rows):
- `apps/website/src/contracts/core/events/jini-outbox-adapter.ts` sg `e282c16f051b79dba742c8b29ea8a5bee3a7e297`; `enqueue-only-outbox.ts` sg `c3ad22944f9eceb6e9c49a1ba7c3ad9b71ef2e51`; `outbox-worker.ts` sg `5367e43917a156c2cdf755f73f663f165ca63e1d`; `outbox-drainer.ts` sg `a46b849155430b192d5fadfe94d8459116d9ca41`; `memory-bus.ts` sg `0dd92701c3c61c9a37409cec121cdbcd1f161c01` (post-EV-2).
- `git hash-object`: `apps/website/src/contracts/core/events/index.ts` `36b3397959c073c107eda50b7d210c816c2e9782`; `outbox-retry-policies.ts` `a87d1093ccb0ce35f9e0bab0f1529a1c3fdcb231`; `__tests__/memory-bus.test.ts` `6c8fac9a4b6039624b57b1f0f4f4c6dc9d861219`; `development/scripts/write-path-inventory.baseline.json` `4013829dc6f0a7ba3c2be10b945b3b0c5b094237`.
- EV-3 committed in JINI_CLONE (`rg -n "export \* from './in-memory.js'" {JINI_CLONE}/packages/infra/src/events/outbox/index.ts` prints 1 line).

### EV-4a. Scripted import repoint (run FIRST, before any other EV-4 edit)
`python3 -I $SHEETS/split-events.repoint.py {TOVU_CLONE} --dry-run > {SCRATCH}/ev4-dry.txt`. It must exit 0, its last line must be `TOTAL 133`, and `grep CHANGED {SCRATCH}/ev4-dry.txt | diff - $SHEETS/split-events.repoint.expected.txt` must print nothing. Any `STOP …` line, other total or diff = SKIP (another lane changed an importer; never patch the list). Then run it for real: `python3 -I $SHEETS/split-events.repoint.py {TOVU_CLONE}` (same output). What it does: in every Tovu file except the 7 events sources and `memory-bus.test.ts`, each import from the events facade (`#src/contracts/core/events/<m>`, `../…/contracts/core/events/<m>.js`, and `../<m>.js` inside `events/__tests__`, `<m>` ∈ index|memory-bus|outbox-worker|outbox-drainer|enqueue-only-outbox) is split: `processOutbox`/`startOutboxDrainer` keep their original specifier; `InMemoryOutbox`, `InMemoryEventBus`, `toEnqueueOnlyOutbox`, `MAX_OUTBOX_ATTEMPTS`, `DEFAULT_OUTBOX_*`, `computeOutboxBackoffMs`, `OutboxDrainer` go to one `@jini-ai/infra/events/outbox` import per file (e.g. `serving-app.ts:7` becomes `import { startOutboxDrainer } from "#src/contracts/core/events/index";` + `import { type OutboxDrainer } from "@jini-ai/infra/events/outbox";`; `outbox-repo.ts:5` becomes `import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "@jini-ai/infra/events/outbox";`).

### EV-4b. Call-shape edits (python, exact regex, expected counts; any other count = restore + SKIP)
```python
import re
E = "apps/website/src/contracts/core/events/__tests__/"
R1 = (re.compile(r"toEnqueueOnlyOutbox\((inner|outbox|new InMemoryOutbox\(\))\)"), r"toEnqueueOnlyOutbox({ outbox: \1 })")
R2 = (re.compile(r"computeOutboxBackoffMs\(\{ attempts: ([^{}]+?) \}, \{ random: ([^{}]+?) \}\)"), r"computeOutboxBackoffMs({ attempts: \1, random: \2 })")
R3 = (re.compile(re.escape("computeOutboxBackoffMs({ attempts: 1 })")), "computeOutboxBackoffMs({ attempts: 1, random: Math.random })")
plan = [(E + "enqueue-only-outbox.payload.test.ts", R1, 2), (E + "enqueue-only-outbox.test.ts", R1, 3),
        (E + "jini-outbox-parity.test.ts", R1, 2), (E + "outbox-worker.test.ts", R2, 11), (E + "outbox-worker.test.ts", R3, 1),
        ("apps/website/src/features/newsletter/__tests__/send-pipeline.test.ts", R2, 3),
        ("apps/website/src/features/newsletter/send-pipeline.ts", R2, 1)]
```
For each row: read, `new, n = pattern.subn(repl, text)`, assert `n == expected`, write. (send-pipeline.ts and send-pipeline.test.ts:1440 are doc comments naming the call; they follow the new shape.)

### EV-4c. Exact text edits (each OLD occurs once)
1. `apps/website/src/contracts/core/events/__tests__/outbox-drainer.scheduling.test.ts`: OLD
   ``    import { InMemoryEventBus, InMemoryOutbox } from ${JSON.stringify(new URL('../memory-bus.ts', import.meta.url).href)};``
   NEW
   ``    import { InMemoryEventBus, InMemoryOutbox } from ${JSON.stringify(import.meta.resolve('@jini-ai/infra/events/outbox'))};``
2. `apps/website/src/contracts/core/events/__tests__/outbox-repo.contract.test.ts`: OLD `` * `memory-bus.ts`'s `InMemoryOutbox` and `` NEW `` * `@jini-ai/infra/events/outbox`'s `InMemoryOutbox` and ``
3. `apps/website/src/platform/db/repos/outbox-repo.ts`: OLD `` * `core/events/memory-bus.ts`'s `InMemoryOutbox` is the first.`` NEW `` * `@jini-ai/infra/events/outbox`'s `InMemoryOutbox` is the first.``
4. `apps/website/src/features/webhooks/repo.memory.ts`: OLD `` `src/contracts/core/events/memory-bus.ts`'s `InMemoryOutbox` shape`` NEW `` `@jini-ai/infra/events/outbox`'s `InMemoryOutbox` shape``
5. `apps/website/src/server/runtime/composition/modules/forms.ts`: OLD `` (`core/events/memory-bus.ts`'s `publish`` NEW `` (`@jini-ai/infra/events/outbox` `InMemoryEventBus`'s `publish``
6. `apps/website/src/contracts/core/events/outbox-retry-policies.ts`: OLD `import type { OutboxRetryPolicyResolver } from "@jini-ai/infra/events/outbox";` NEW `import type { OutboxRetryPolicyResolver } from "@jini-ai/core/contracts/events";`
7. `apps/website/src/contracts/core/events/INFO.md`: OLD (3 lines)
```
- `memory-bus.ts`: in-memory `EventBusPort` and `OutboxPort` adapters
- `outbox-worker.ts`: publishes claimed outbox rows to the event bus
- `index.ts`: public exports for event infrastructure
```
   NEW
```
- `outbox-worker.ts`: `processOutbox`, the site's binding of the Jini outbox worker (retry table, bus adapter)
- `outbox-drainer.ts`: `startOutboxDrainer`, the serving process's background delivery owner (adds tracing)
- `outbox-retry-policies.ts`: the site's per-event retry table
- `index.ts`: exports `processOutbox` and `startOutboxDrainer`

The contract types live in `@jini-ai/core/contracts/events`; the worker, policies, enqueue-only view and the
in-memory bus/outbox live in `@jini-ai/infra/events/outbox`.
```
8. `development/scripts/write-path-inventory.baseline.json`: `python3 -I -c 'import json,sys;p=sys.argv[1];t=open(p).read();d=json.loads(t);assert json.dumps(d,indent=2)+"\n"==t;k=[e for e in d if e.get("file")!="src/contracts/core/events/memory-bus.ts"];assert len(d)-len(k)==3;open(p,"w").write(json.dumps(k,indent=2)+"\n")' development/scripts/write-path-inventory.baseline.json`

### EV-4d. Rewrite three binding files with exactly this content
`apps/website/src/contracts/core/events/index.ts`:
```ts
/**
 * The site's outbox bindings: `processOutbox` (inline drains after a write) and `startOutboxDrainer`
 * (the serving process's background delivery owner). Contract types live in
 * `@jini-ai/core/contracts/events`; the worker, policies, enqueue-only view and the in-memory bus and
 * outbox live in `@jini-ai/infra/events/outbox`.
 */
export { processOutbox } from "./outbox-worker.js";
export { startOutboxDrainer } from "./outbox-drainer.js";
```
`apps/website/src/contracts/core/events/outbox-worker.ts`:
```ts
import { createConsoleLogger, type Clock as ClockPort } from "@jini-ai/core/primitives";
import type { DomainEvent, EventBusPort, OutboxPort } from "@jini-ai/core/contracts/events";
import { createNodeOutboxScheduler, processOutbox as processJiniOutbox, type OutboxWorkerArgs } from "@jini-ai/infra/events/outbox";
import { outboxRetryPolicyForEvent } from "./outbox-retry-policies.js";

/**
 * @file Outbox processing orchestration.
 *
 * Purpose:
 * Converts persisted outbox records into delivered bus events.
 *
 * How it relates to the project:
 * - Reads and updates outbox state through `OutboxPort` (`@jini-ai/core/contracts/events`); the site's
 *   SQL adapter honours the claim lease the worker passes.
 * - Publishes delivered events through `EventBusPort`.
 * - Called by `apps/website/src/server/runtime/composition/app.ts` after a successful command write.
 *
 * Architectural role:
 * This is the hybrid reliability bridge:
 * synchronous command handling writes data immediately, and this worker
 * handles asynchronous side effects with retry semantics.
 *
 * Jini's outbox worker owns equal-jitter backoff, the attempt cap and terminal `failed` status.
 * Storage adapters persist its `nextStatus` decision; they do not rederive retry policy.
 * Claim leases and delivery timeouts prevent a stalled handler from blocking the drain or
 * immediately starting a second copy. Detailed lifecycle rationale lives in
 * Jini/packages/infra/src/events/outbox/{worker,policy}.ts.
 */

/**
 * Bind the site's bus, storage and clock to Jini's outbox worker. Node scheduling and console logging
 * use their owning Jini adapters; the host supplies its Math.random default. The bus adapter remains
 * until `EventBusPort.publish` takes `{ event }` (the deferred enqueue/publish normalization).
 * @example const args = outboxWorkerArgs({ outbox, bus, clock }, { random: () => 0 });
 */
export function outboxWorkerArgs(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort }, optional: { random?: () => number } = {},
): OutboxWorkerArgs<DomainEvent> {
  return {
    outbox: required.outbox,
    bus: { publish: ({ event }) => required.bus.publish(event) },
    clock: required.clock,
    scheduler: createNodeOutboxScheduler({}),
    random: optional.random ?? Math.random,
    logger: createConsoleLogger({ prefix: "" }),
  };
}

/**
 * Claims due outbox rows and attempts to publish each to the event bus, marking delivered on
 * success or scheduling a backed-off retry (or permanent exclusion past `MAX_OUTBOX_ATTEMPTS`,
 * see this file's header doc) on failure. See Jini's `deliver` for a row claimed more
 * than `MAX_OUTBOX_ATTEMPTS` times. Each delivery may run at most `deliveryTimeoutMs` (default
 * `DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS`) before the drain moves on; see Jini's `recordOverrun`.
 * Events listed in `outbox-retry-policies.ts` (external form deliveries) use their own cap and backoff.
 *
 * @throws RangeError before claiming if the batch/timeout bounds are invalid or outlast the lease.
 * @example await processOutbox({ outbox, bus, clock }, { batchSize: 1 });
 * @complexity O(batchSize) publish attempts, each O(subscribed handlers for the event's name).
 */
export async function processOutbox(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { batchSize?: number; random?: () => number; deliveryTimeoutMs?: number } = {}
): Promise<number> {
  return processJiniOutbox(outboxWorkerArgs(required, { random: optional.random }), {
    batchSize: optional.batchSize, deliveryTimeoutMs: optional.deliveryTimeoutMs, retryPolicyForEvent: outboxRetryPolicyForEvent,
  });
}
```
`apps/website/src/contracts/core/events/outbox-drainer.ts`:
```ts
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/core/contracts/events";
import { startOutboxDrainer as startJiniOutboxDrainer, type OutboxDrainer } from "@jini-ai/infra/events/outbox";
import { outboxWorkerArgs } from "./outbox-worker.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { outboxRetryPolicyForEvent } from "./outbox-retry-policies.js";

/**
 * @file Background outbox drainer: the one owner that delivers outbox rows in a site-serving process.
 *
 * Enqueue-only writes need a background drain so their events do not wait for an unrelated write.
 *
 * Contract:
 * - Start it only in the process whose bus carries the site's real subscribers, and only after they
 *   are subscribed. `server/runtime/composition/serving-app.ts` is the one caller and does both. A
 *   drain anywhere else marks rows delivered against the wrong handlers (see `toEnqueueOnlyOutbox` in
 *   `@jini-ai/infra/events/outbox`).
 * - One drain at a time. The next drain is scheduled only after the current one settles, so a slow
 *   handler never overlaps itself. A full batch drains again at once; otherwise the loop waits
 *   `intervalMs`. A handler that never settles costs at most the delivery timeout per row
 *   (`processOutbox`'s `deliveryTimeoutMs`), so it cannot stall the loop.
 * - Retry, backoff and the terminal `"failed"` state stay in `processOutbox`. A failing handler
 *   reschedules only its own row, so the rows behind it keep flowing. A drain that throws (e.g. a
 *   locked database) goes to `onError` and the loop carries on.
 * - Inline route drains stay safe beside it: `claimPending` is atomic, so whichever drain claims a
 *   row delivers it. A claim is a lease (`DEFAULT_OUTBOX_CLAIM_LEASE_MS`): if its claimer dies or
 *   outlives the lease, another drain claims the row again, so delivery is at-least-once.
 * - The timer is `unref`'d, so the drainer never keeps a process alive by itself.
 */

/**
 * Starts draining `outbox` into `bus` in the background. The first drain runs on the next timer turn.
 *
 * @param required.outbox the shared outbox to claim rows from.
 * @param required.bus the bus whose subscribers must see every delivered event.
 * @param required.clock passed through to `processOutbox`.
 * @param optional.intervalMs idle wait between drains (default `DEFAULT_OUTBOX_DRAIN_INTERVAL_MS` from `@jini-ai/infra/events/outbox`).
 * @param optional.batchSize rows claimed per drain (default 20).
 * @param optional.deliveryTimeoutMs how long one row's delivery may run (default: `processOutbox`'s own).
 * @param optional.tracker traces each delivery as an `outbox.deliver` operation (default: untraced).
 * @param optional.onError receives any error a drain throws (default: `console.error`). If it throws
 *   itself, that is swallowed, so a broken reporter can never end the loop.
 * @returns a handle whose `stop()` ends the loop.
 * @throws RangeError before scheduling if the interval or delivery policy is invalid.
 * @example const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 1000 });
 * @complexity O(batchSize) publish attempts per drain (see `processOutbox`); O(1) state between drains.
 */
export function startOutboxDrainer(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { intervalMs?: number; batchSize?: number; deliveryTimeoutMs?: number; onError?: (error: unknown) => void; tracker?: Tracker } = {}
): OutboxDrainer {
  const { tracker = createNoopTracker({}), ...drainOptions } = optional;
  const args = outboxWorkerArgs(required);
  return startJiniOutboxDrainer({ ...args, bus: trackedDelivery({ bus: args.bus, tracker }) }, { ...drainOptions, retryPolicyForEvent: outboxRetryPolicyForEvent });
}

type DeliveryBus = ReturnType<typeof outboxWorkerArgs>["bus"];

/** Outbox/job-queue chokepoint: each background delivery is one `outbox.deliver` operation labelled
 * with the event's stable name only (never its payload); a failed delivery is reported and still
 * rethrown, so retry/backoff stays `processOutbox`'s. Without a port the bus is used as-is. */
function trackedDelivery({ bus, tracker }: { bus: DeliveryBus; tracker: Tracker }): DeliveryBus {
  return { publish: (input) => tracker.trace({ name: "outbox.deliver", run: async (span) => {
    const result = await bus.publish(input);
    span.setOutcome({ outcome: "delivered", failed: false });
    return result;
  } }, { attributes: { "event.name": input.event.name } }) };
}
```

### EV-4e. Deletions
`git rm -q --` `apps/website/src/contracts/core/events/jini-outbox-adapter.ts` `apps/website/src/contracts/core/events/enqueue-only-outbox.ts` `apps/website/src/contracts/core/events/memory-bus.ts` `apps/website/src/contracts/core/events/__tests__/memory-bus.test.ts` (its 9 cases live in Jini `__tests__/in-memory.test.ts` since EV-3).

### EV-4f. Census (after all EV-4 edits; each must print exactly what is stated)
- `rg -n "jini-outbox-adapter|enqueue-only-outbox|memory-bus|toJiniOutbox|toCmsOutbox" apps development/scripts` -> nothing.
- `rg -n "from ['\"][^'\"]*contracts/core/events/(index|outbox-worker|outbox-drainer)(\.js)?['\"]" apps | rg -v "processOutbox|startOutboxDrainer"` -> nothing.
- `rg -n "@jini-ai/infra/events/outbox" apps/website/src/contracts/core/events/*.ts` -> exactly 2 lines (outbox-worker.ts:3, outbox-drainer.ts:3).
- `rg -n "computeOutboxBackoffMs\(\{ attempts: [^}]*\}, " apps` -> nothing.
Anything else = restore every EV-4 path with `git show HEAD:<path> > <path>` (edited and `git rm`-ed files alike; then `git add -- <path>` for the 4 deleted ones to undo the staged removal) and SKIP.

Checks: eslint every touched `.ts` (unresolved `InMemoryOutbox`/`InMemoryEventBus` from `@jini-ai/infra/events/outbox` until the Tovu clone is linked to EV-3 is expected: record). Commit with one pathspec listing the 133 script-changed files (from `{SCRATCH}/ev4-dry.txt`), the EV-4b/EV-4c files, the three rewritten files and the four deleted files; verify `git show --stat HEAD` lists 4 deletions. Message `refactor(events): import the outbox contract and machinery from their Jini owners` / body `Deletes the CMS/Jini translation adapter, the enqueue-only forwarder, the in-memory adapters and every forwarding re-export; tests import InMemoryOutbox/InMemoryEventBus and the policy constants from @jini-ai/infra/events/outbox. Tovu keeps processOutbox/startOutboxDrainer (retry table, bus adapter, tracing), the SQL adapter and the drainer ownership in serving-app.`

---------------------------------------------------------------------------------------------------
## EV-5 (Jini): delete the transitional re-export

Guards: EV-3 and EV-4 committed; in TOVU_CLONE `rg -n "(EventEnvelope|EventPublisher|OutboxClaim|OutboxPort|OutboxRecord|OutboxRetryPolicy)[^\n]*@jini-ai/infra/events/outbox" apps` prints nothing; in JINI_CLONE `rg -n "(EventEnvelope|EventPublisher|OutboxClaim|OutboxPort|OutboxRecord|OutboxRetryPolicy)\b" packages/infra/src/events/outbox/__tests__ | rg "from '\.\./(index|ports)\.js'"` prints nothing, and `rg -n "@jini-ai/infra/events/outbox" packages --glob '!packages/infra/**' --glob '*.ts'` shows no line importing one of those names.
Edit `packages/infra/src/events/outbox/ports.ts`: delete exactly these 3 lines (the blank line after the `import type … '@jini-ai/core/contracts/events';` line stays):
```ts

// Transitional, removed once no consumer imports them from here: these contract types are owned by @jini-ai/core/contracts/events.
export type { EventEnvelope, EventPublisher, OutboxClaim, OutboxPort, OutboxRecord, OutboxRetryPolicy, OutboxRetryPolicyResolver } from '@jini-ai/core/contracts/events';
```
(i.e. the blank line before the comment, the comment, the export). Changeset `.changeset/infra-outbox-drop-contract-reexport.md`: `"@jini-ai/infra": minor` / "`@jini-ai/infra/events/outbox` no longer re-exports the outbox contract types; import them from `@jini-ai/core/contracts/events`." eslint ports.ts; commit both paths. Message `refactor(infra): stop re-exporting the core outbox contract`.

---------------------------------------------------------------------------------------------------
## Extra STOPs for this sheet
- Any guard hash differs, or a Tovu `sg` file still contains `@jini-ai/cms/core` (wave B not merged): SKIP the slice.
- EV-4a dry-run differs from `split-events.repoint.expected.txt`, prints `STOP`, or the total is not 133.
- A regex count in EV-4b differs.
- Any file outside the ones named here would need an edit to make eslint import/unused rules pass.

## Deferred (coordinator; not executable from this sheet)
- `{ event }` normalization of `OutboxPort.enqueue` and `EventBusPort.publish` (decide-4.md §2 "enqueue and publish receive `{ event }`"): ~300 `.enqueue(` / ~200 `.publish(` call sites in Tovu + Jini cms, plus cms's narrow per-module outbox ports and every test fake. Needs a type-aware codemod sheet (Opus) after EV-5; it then deletes Tovu's bus adapter lambda and returns `toEnqueueOnlyOutbox` to `{ event }`.
