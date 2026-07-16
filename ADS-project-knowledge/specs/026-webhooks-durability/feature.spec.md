# Feature Spec: Webhooks Durability + GAP-05/GAP-12 Fix (ADR-046 Phase 1, slice 4)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-026 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-026-webhooks-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed)

Fourth ADR-046 Phase 1 slice. Like Members (slice 3), `SqliteWebhookSubscriptionRepo` and
`SqliteWebhookDeliveryRepo` already existed, fully built and contract-tested — another "composed
into zero composition roots" gap. This slice's work: fix the named pre-requisite (ADR-046 fold-in
item 5, GAP-05/GAP-12), wire the two adapters into `server/deps.ts`, add one missing restart test.

**GAP-05/GAP-12, and why the fix is additive, not a rewrite:** `enqueueDelivery()`
(`integrations/delivery.ts`) called `deliveryRepo.enqueue(record)` then, separately,
`envelopeStore.save(...)` — a crash between the two left a claimable delivery row with no
envelope. The obvious fix (widen `WebhookDeliveryRepoPort.enqueue()` to take the envelope and stop
calling `envelopeStore.save()`) was evaluated and rejected: `EnqueueDeliveryDeps.envelopeStore` is
depended on by 10+ existing test call sites and by `processDueDeliveries`'s own separate deps type.
Instead: `enqueue()` gained a purely additive optional second argument. `SqliteWebhookDeliveryRepo`
writes it inline in the same `INSERT` (closing the gap on its own, for the adapter that matters).
`InMemoryWebhookDeliveryRepo` ignores the new argument — for it, the original `envelopeStore.save()`
call remains the actual (and sufficient) write path, since an in-memory Map has no
crash-between-two-statements failure mode to begin with. No existing call site changed shape.

## Problem Statement

**Current state (before this slice):** `server/deps.ts` wired `InMemoryWebhookSubscriptionRepo`
and `InMemoryWebhookDeliveryRepo` — subscriptions and pending deliveries were lost on restart.
Separately, GAP-05/GAP-12 meant even a durable adapter could produce an envelope-less claimable
delivery row if used naively.

**Desired state:** Real composition uses the durable SQLite adapters. `enqueue()`'s envelope
argument makes the delivery-row-plus-envelope write self-sufficient for the SQLite adapter, closing
the crash window this ADR named as a required pre-requisite.

## Requirements

- REQ-01: `WebhookDeliveryRepoPort.enqueue()` shall accept an optional second argument, the
  `WebhookEventEnvelope`, purely additively (no existing single-argument caller breaks).
- REQ-02: `SqliteWebhookDeliveryRepo.enqueue()` shall write the envelope, when supplied, in the
  same `INSERT` as the delivery row.
- REQ-03: `enqueueDelivery()` shall pass the envelope through `enqueue()`'s new argument, in
  addition to (not instead of) its existing `envelopeStore.save()` call.
- REQ-04: `server/deps.ts` shall construct `SqliteWebhookSubscriptionRepo` and
  `SqliteWebhookDeliveryRepo` against the real `content.db` connection.
- REQ-05: `server/app.ts`'s hermetic composition shall remain unchanged (in-memory adapters).
- REQ-06: The capability inventory's `webhooks` entry shall be reclassified
  `hasDurableAdapter: true`. `capabilityRouteGuard`'s unconditional production-mode containment
  for `"webhooks"` (REQ-07, SPEC-022) is unaffected — durability does not itself activate the
  delivery worker.

## Acceptance Criteria

- AC-01 (REQ-01/REQ-02) [P1]: Calling `SqliteWebhookDeliveryRepo.enqueue(record, envelope)` and
  then immediately calling `find({ deliveryId })` — with no `save()` call ever made — returns the
  envelope.
- AC-02 (REQ-01) [P1]: All existing `WebhookDeliveryRepoPort` contract tests and all existing
  `enqueueDelivery()` callers (10+ in `delivery.test.ts`, plus `forms-webhook-fanout.test.ts`)
  pass unchanged.
- AC-03 (REQ-04) [P1]: A subscription created via the real composition, then looked up via a
  fresh `SqliteWebhookSubscriptionRepo` instance against the same on-disk file (restart
  simulation), is found.
- AC-04 (REQ-04) [P1]: The existing delivery-repo restart test (`repo.delivery.contract.test.ts`)
  continues to pass; a new equivalent restart test for the subscription repo was added.
- AC-05 (REQ-06) [P2]: `production-readiness-boot.integration.test.ts`'s staleness check continues
  to pass.

## Non-Goals

- Activating the delivery worker (`processDueDeliveries`) in production — still unconditionally
  gated per REQ-07 (SPEC-022), pending its own future spec covering the rest of ADR-046's named
  production gate for this row (guarded `HttpClientPort`, egress policy, worker lifecycle,
  signing/retry/SSRF integration tests).
- Making the delivery-row-plus-envelope write a single atomic SQL transaction. The additive
  `enqueue(record, envelope)` write is durable and complete on its own for the SQLite adapter (no
  second write is required to make the envelope present) — but it is technically still two
  separate calls at the `enqueueDelivery()` call-site level (`enqueue()` then the now-redundant
  `envelopeStore.save()`). This is disclosed, not hidden: the first call alone already closes the
  gap; the second is harmless legacy redundancy, not a residual risk.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | New tests (envelope-at-enqueue proof, subscription restart) written and passing; full existing suite re-verified unchanged. |
| III — Simplicity Gate | COMPLIES | Additive optional argument, not a new abstraction; composition-root wiring only. |
| IV — Anti-Abstraction Gate | COMPLIES | No new port. |
| V — Integration-First Testing | COMPLIES | AC-01/AC-03 are real-file/real-adapter tests. |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the wiring + fix it accompanies. |
| VIII — Observability | N/A | No new observable signal. |

## Implementation Record

- `src/integrations/ports.ts`: `WebhookDeliveryRepoPort.enqueue()` widened (optional 2nd arg).
- `src/integrations/repo.sqlite.ts`: `SqliteWebhookDeliveryRepo.enqueue()` writes envelope inline.
- `src/integrations/delivery.ts`: `enqueueDelivery()` passes envelope through `enqueue()`.
- `src/integrations/index.ts`, `src/server/deps.ts`: durable adapters exported and wired.
- `src/server/capability-inventory.ts`: `webhooks` entry now `hasDurableAdapter: true`.
- Tests: one new atomicity-proof test (`repo.delivery.contract.test.ts`), one new restart test
  (`repo.subscription.contract.test.ts`); all 18+11 = 29 tests in both files passing, plus the
  full 68-test `integrations`/`forms-webhook-fanout` run confirmed unaffected.
- Full suite: 1518/1522 passing at completion (4 pre-existing, disclosed, unrelated failures
  carried since before this slice). Typecheck clean.

## Handoff Contract

- **Inputs used:** ADR-046 fold-in item 5's exact GAP-05/GAP-12 finding, direct inspection of
  `integrations/repo.sqlite.ts`'s own file-header disclosure, the existing (wide) test surface for
  `enqueueDelivery()`.
- **Output summary:** subscriptions and deliveries now survive a restart; the specific named
  pre-requisite (envelope-less claimable delivery) is closed for the SQLite adapter.
- **Risks:** none new. The Non-Goals section names the "still two calls, not one transaction"
  reality explicitly — it doesn't matter for correctness (the first call alone suffices) but a
  future reader should not assume a database-level transaction exists here.
- **Suggested next assignee:** Coordinator, for the next ADR-046 Phase 1 slice (Origin, Media, or
  Analytics).
