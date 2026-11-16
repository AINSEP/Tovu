# website/contracts/core/events — BLOCKED (W1 #16). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`.
Skeleton: `make-sheet.py website/contracts/core/events --kind all` (DL-events-1 x2, MV-events-1). KIND-SUSPECT fired twice (both DELETE rows).
untangle_overlap: yes — C3.repoint.tsv:284 (jini-outbox-adapter.ts), :285 (enqueue-only-outbox.ts), :286 (outbox-worker.ts), :288 (memory-bus.ts), :287 (outbox-drainer.ts), :289-291 (tests): every file of this feature changes its `@jini-ai/cms/core` import to `@jini-ai/core/contracts/events` in C3. **Execute after wave B merge** in any case.

## Why BLOCKED (owner/Opus decision needed)
The feature is not three independent files; it is a binding layer between TWO Jini outbox port shapes:
- `@jini-ai/cms/core` `OutboxPort` (positional `enqueue(event)`, `claimPending({batchSize, nowIso})`), which Tovu implements everywhere (`platform/db/repos/outbox-repo.ts`, `memory-bus.ts`) and which C3 moves verbatim to `@jini-ai/core/contracts/events`;
- `@jini-ai/infra/events/outbox` `OutboxPort<Event>` (object args, `claimLeaseMs`), which the Jini worker/drainer/enqueue-only code consumes.
`jini-outbox-adapter.ts` (`toJiniOutbox`/`toCmsOutbox`/`outboxWorkerArgs`) converts between them; every other file here is built on that adapter.

Per-file findings (real code, not shims):
1. `enqueue-only-outbox.ts` (DELETE label, KIND-SUSPECT correct): `toEnqueueOnlyOutbox` = `toCmsOutbox(jini(toJiniOutbox(x)))`. **0 production callers**; used only by 3 Tovu tests (`enqueue-only-outbox.payload.test.ts:5`, `enqueue-only-outbox.test.ts:6`, `jini-outbox-parity.test.ts:9`) and the barrel `index.ts:7`. Deleting it drops those tests' assertions (COMMON rule 20) unless they are relocated to infra against the infra port — which is only possible once one port shape exists.
2. `outbox-worker.ts` (DELETE label, KIND-SUSPECT correct): 3 constant re-exports + `computeOutboxBackoffMs` (adds the `random = Math.random` default the Jini one lacks: Jini `computeOutboxBackoffMs({attempts, random})` requires `random`) + `processOutbox` bound to the Tovu retry policy (`outbox-retry-policies.ts`). `processOutbox` is STAY-WIRING; the rest is a repoint touching ~140 files that name these identifiers (most via `#src/contracts/core/events`), so it is a REPOINT slice of its own, not a DELETE.
3. `memory-bus.ts` (MOVE to `@jini-ai/cms/core`): cannot land as labelled. It needs `DEFAULT_OUTBOX_CLAIM_LEASE_MS` from `@jini-ai/infra`, and cms may not import infra (COMMON rule 5).

## Question for the owner (one answer unblocks all three slices)
Q-events: After C3, which outbox port is THE Jini contract?
  (a) RECOMMENDED: the core-contract shape (C3's `@jini-ai/core/contracts/events` `OutboxPort`) — infra's worker/drainer/enqueue-only take it directly (infra may import core), infra's private `OutboxPort<Event>` is deleted in an Opus HARDEN slice, and `InMemoryEventBus`/`InMemoryOutbox` (memory-bus.ts) MOVE to a new leaf `packages/infra/src/events/outbox/in-memory.ts` with the lease from `./policy.js`. Then Tovu deletes `jini-outbox-adapter.ts`, `enqueue-only-outbox.ts` and the `outbox-worker.ts` re-exports (tests relocated to infra vitest with assertions verbatim), keeping only `processOutbox` + `outbox-retry-policies.ts` as the binding.
  (b) keep both shapes: then memory-bus.ts must take the lease as a required argument and goes to cms (a behaviour-free signature change for every `new InMemoryOutbox()` caller), and the adapter stays in Tovu forever (it would be a Jini-internal duplication Tovu papers over).
Who answers: owner (contract choice); then an Opus sheet (it is a HARDEN on infra plus a 140-file repoint), not Sonnet.

## Facts for the follow-up sheet (current HEAD)
- blobs: enqueue-only-outbox.ts 7b51a69e76caa601c5f6feb28cd382aecde8ef6f; outbox-worker.ts 686bb1a6cbec349e4ec4509aa0e3793c1947b5ee; memory-bus.ts (re-take: `git hash-object`), 156 loc, 2 prod importers.
- outbox-worker.ts importers: 2 prod (`index.ts:5` re-export, `memory-bus.ts:3`), 5 tests (listed in `make-sheet` output: enqueue-only-outbox.payload.test.ts:7, outbox-repo.contract.test.ts:10, outbox-retry-policies.unit.test.ts:9, outbox-worker.test.ts:5, server/__tests__/integration/create-app-event-subscriptions-once.integration.test.ts:6).
- baselines naming outbox-worker.ts: `development/scripts/write-path-inventory.baseline.json:193,202,211,220` (must be edited if the file is deleted; not if reduced).
- comment refs: `memory-bus.ts:15`, `platform/db/repos/outbox-repo.ts:135`.
