# Feature Spec: Outbox Durability + BR-04 Resolution (ADR-046 Phase 1, slice 2)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-024 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-024-outbox-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, per explicit user request) |
| spec_mode | greenfield |

## Scope Note (disclosed)

Second ADR-046 Phase 1 slice (first: SPEC-023, Change Sets). This slice was gated behind resolving
ADR-046's own BR-04 outbox-transaction-seam question (fold-in item 1) — a dedicated 2-round Swarm
Consensus debate (Primary + agy/Gemini 3.1 Pro + Codex gpt-5.6-terra + Fable, full 4/4 convergence)
resolved it first. Full debate record:
`ADS-project-knowledge/reports/swarm-consensus/runs/20260716T-br04-outbox-seam-consensus-report.md`.
This spec covers both the BR-04 amendment and the resulting Outbox durable adapter as one slice,
since the BR-04 mechanism *is* how the outbox gets wired for its first (and, per scope, only)
covered producer.

## Problem Statement

**Current state (before this slice):** `server/deps.ts` wired `new InMemoryOutbox()` — every
enqueued domain event was lost on restart. `core/commands/command.ts`'s `executeCommand()` called
`deps.outbox.enqueue(event)` as a separate step after `changeSets.insert()`, with no transactional
tie-back (BR-04) — a crash between the two left a committed change-set with no delivery record.

**Desired state:** `content.db` gains a durable `outbox_events` table. `ChangeSetRepoPort.insert()`
accepts an optional `event` argument and, on the SQLite adapter, co-persists it inside the same
transaction as the change-set header + items — the event can never land without the record it
belongs to, or vice versa. A new `SqliteOutboxAdapter` implements `claimPending`/`markDelivered`/
`markFailed` against the same table for the delivery-worker side.

**Why now:** User-directed sequencing — Outbox was the designated next ADR-046 Phase 1 slice after
Change Sets, contingent on BR-04 being resolved first.

## Requirements

- REQ-01: `ChangeSetRepoPort.insert()` shall accept an optional third argument, a fully-formed
  `DomainEvent`.
- REQ-02: The SQLite `ChangeSetRepoPort` adapter shall co-persist the event (when present) as a
  durable outbox row inside the same transaction as the change-set header and items.
- REQ-03: The in-memory `ChangeSetRepoPort` adapter shall forward the event (when present) to an
  `OutboxPort` instance injected at construction, preserving pre-slice delivery behavior exactly.
- REQ-04: `executeCommand()` shall pass its `change-set.applied` event through `insert()`'s third
  argument instead of a separate `deps.outbox.enqueue()` call, deleting that separate call.
- REQ-05: A new `SqliteOutboxAdapter` shall implement the full `OutboxPort` contract
  (`enqueue`/`claimPending`/`markDelivered`/`markFailed`) against the same `outbox_events` table,
  with `claimPending` selecting and marking rows `processing` inside one atomic transaction.
- REQ-06: `executeCommand()`'s existing compensating-rollback path for `changeSets.insert()`
  failure shall remain unchanged in behavior — this slice does not widen or narrow what triggers
  `mutation.rollback()`.
- REQ-07: The hermetic test/dev composition (`server/app.ts`) shall continue delivering events via
  an in-memory outbox, wired through the same constructor-injection mechanism (REQ-03) rather than
  the deleted separate enqueue call.
- REQ-08: The capability inventory's `outbox` entry shall be reclassified `hasDurableAdapter: true`.

## Acceptance Criteria

- AC-01 (REQ-01/REQ-02) [P1]: Given a change-set insert with an event, when queried immediately
  after via a fresh `SqliteOutboxAdapter` against the same connection, then the event is present
  and claimable.
- AC-02 (REQ-02) [P1]: Given a change-set insert with an event where the transaction is never
  committed (simulated failure), neither the change-set rows nor the outbox row exist.
- AC-03 (REQ-03) [P1]: Given `InMemoryChangeSetRepo` constructed with an injected outbox and an
  `insert()` call carrying an event, the injected outbox receives exactly that event.
- AC-04 (REQ-04) [P1]: `core/commands/__tests__/command-atomicity.test.ts`'s existing certified
  "happy path" test (exactly one change set + one event) passes unchanged in observable behavior
  after this slice, with its `InMemoryChangeSetRepo` construction updated to inject the outbox.
- AC-05 (REQ-05) [P1]: The `OutboxPort` contract test suite passes identically against both
  `InMemoryOutbox` and `SqliteOutboxAdapter`.
- AC-06 (REQ-05) [P1]: Two sequential `claimPending()` calls at different times never both return
  the same row (no double-claim).
- AC-07 (REQ-05) [P2]: `markFailed()` returns a row to `pending` with the supplied error and
  `nextAttemptAt`, and it is re-claimable once that time passes.
- AC-08 (REQ-06) [P1]: `command-atomicity.test.ts`'s AC-17 test (injected change-set persist
  failure rolls back the post, no change set, no event) passes unchanged.
- AC-09 (ADR-046's own required test-matrix row for Outbox, "Restart ... integration tests")
  [P1]: an event enqueued against a real on-disk `content.db`, then re-opened via a fresh
  `openContentDb()` call against the same file (simulating a process restart), is still claimable.
- AC-10 [P1]: The SAME restart test, but for a `SqliteChangeSetRepo.insert()`-co-persisted event —
  proving `SqliteChangeSetRepo` and `SqliteOutboxAdapter` share one physical table, not two
  disconnected write paths.
- AC-11 (REQ-08) [P2]: `production-readiness-boot.integration.test.ts`'s staleness check
  (AC-23/24, SPEC-022) continues to pass — the `outbox` capability entry still resolves to
  something real in `deps.ts`.

## Non-Goals (explicitly out of scope, per the BR-04 debate's own resolution)

- Bringing the domain mutation itself (`mutation.execute()`) into the same transaction as the
  change-set/outbox write. Remains covered by the existing compensating-rollback path until
  ADR-046 Phase 3 gives domain writes a shared transaction-participating boundary.
- The 12 other direct-`OutboxPort.enqueue()` producers found during the debate
  (`features/post/post.ts`, `forms/submit-service.ts`, `features/entries/write-service.ts` ×3,
  `features/workspace/create.ts`, `features/taxonomy/write-service.ts`,
  `features/content-types/lifecycle.ts`, `navigation/menu-service.ts`, `integrations/delivery.ts`,
  `redirects/phase-handler.ts`, `redirects/redirects.ts`, `newsletter/send-pipeline.ts`) — each is
  its own future, individually-pulled Phase 1 durability slice.
- A background delivery worker/scheduler. `processOutbox()` remains synchronously invoked
  after a write (unchanged from before this slice) — no new timer/cron mechanism is introduced.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Drizzle, already the project's ORM — no new dependency. |
| II — Test-First | COMPLIES | Contract suite + two restart-survival integration tests written and passing before this doc was finalized. |
| III — Simplicity Gate | COMPLIES | Follows the established `repo.memory.ts`/`repo.sqlite.ts` rule-of-two pattern; the BR-04 mechanism itself was chosen specifically because it required no new abstraction (verified: async-transaction-handle and domain-write-inclusive alternatives both failed the Anti-Abstraction Gate or a hard technical constraint). |
| IV — Anti-Abstraction Gate | COMPLIES | No new port — implements the existing `OutboxPort` unchanged; widens `ChangeSetRepoPort.insert()` by one optional argument. |
| V — Integration-First Testing | COMPLIES | AC-09/AC-10 are real-file restart tests, not mocked. |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal beyond the existing `OutboxRecord.lastError`/`attempts` fields. |

## Implementation Record

- `src/infra/db/schema.ts`: `outboxEvents` table (migration `0012_long_war_machine.sql`).
- `src/infra/sqlite/outbox-repo.sqlite.ts`: `SqliteOutboxAdapter`.
- `src/infra/sqlite/change-set-repo.sqlite.ts`: `insert()` widened, co-persists the outbox row.
- `src/core/commands/change-set.ts`: `ChangeSetRepoPort.insert()` widened (optional `event` arg).
- `src/core/commands/repo.memory.ts`: `InMemoryChangeSetRepo` takes an optional injected `OutboxPort`.
- `src/core/commands/command.ts`: `executeCommand()` passes the event through `insert()`; separate
  `deps.outbox.enqueue()` call deleted.
- `src/server/deps.ts`: real composition wires `SqliteOutboxAdapter` (was `InMemoryOutbox`).
- `src/server/app.ts`: hermetic composition's `InMemoryChangeSetRepo` now receives its outbox.
- `src/server/capability-inventory.ts`: `outbox` entry now `hasDurableAdapter: true`.
- Fixed one existing test call site (`command-atomicity.test.ts`'s "happy path") that would have
  silently broken — it built `InMemoryChangeSetRepo()` without an outbox while separately passing
  one to `executeCommand`'s deps, a pattern this slice's design retires.
- Tests: `src/core/commands/__tests__/repo.contract.test.ts` (already covered `insert()`'s
  behavior, unaffected), `src/core/events/__tests__/outbox-repo.contract.test.ts` (12 cases, both
  adapters), `src/core/events/__tests__/outbox-restart.integration.test.ts` (2 cases: standalone
  restart survival, and cross-adapter shared-table survival).
- Full suite: 1515/1519 passing at completion (4 pre-existing, disclosed, unrelated failures
  carried since before this slice). Typecheck clean.

## Handoff Contract

- **Inputs used:** ADR-046 fold-in item 1, the BR-04 resolution debate (4-way convergence,
  independently source-verified), the existing `OutboxPort`/`ChangeSetRepoPort` contracts, the
  established rule-of-two adapter pattern.
- **Output summary:** the `executeCommand()`/`change-set.applied` producer's event now survives a
  restart, atomically with the record it describes. Test/dev composition unaffected in behavior.
- **Risks:** the two Non-Goals above are real, disclosed, deliberate scope limits — not oversights.
  A future reader implementing one of the 12 other producers' durability should apply the same
  adapter-owned co-persistence pattern locally, not assume this slice already covers them.
- **Suggested next assignee:** Coordinator, to pick the next ADR-046 Phase 1 slice (Members,
  Webhooks, Origin, Media, or Analytics) whenever prioritized, per the phase's own pull-based
  sequencing.
