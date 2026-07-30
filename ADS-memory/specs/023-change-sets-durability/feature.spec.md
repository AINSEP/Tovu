# Feature Spec: Change Sets Durability (ADR-046 Phase 1, slice 1)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-023 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-023-change-sets-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, per explicit user request) |
| spec_mode | greenfield |

## Scope Note (disclosed)

This is a single, narrow slice off ADR-046 Phase 1's capability-durability table — deliberately
NOT the full 6-file speckit package SPEC-022 received. ADR-046 fold-in item 4 is explicit that
Phase 1 is "pull-based per capability, not a uniform sweep"; the user selected Change Sets as the
first slice (over Outbox, which is blocked on resolving BR-04's transaction-seam question first,
and over Members, which has a wider adapter surface). This doc records the decision and contract;
it does not re-derive ADR-046's own architecture reasoning.

## Problem Statement

**Current state:** `server/deps.ts` (the real production composition root) wires
`new InMemoryChangeSetRepo()` for `ChangeSetRepoPort` — every change-set record (ADR-008's
audit/undo trail: who changed what, when, and how to revert it) is lost on every process restart.
ADR-046's Context section names this explicitly as unacceptable for user-visible state.

**Desired state:** Change-set headers and their items persist in `content.db` and survive a
restart. `core/commands/command.ts`'s `executeCommand()` — the single mutation write path every
admin route runs through — continues to work unchanged; no route contract changes.

**Why now:** The user directed this as the first ADR-046 Phase 1 slice, chosen over Outbox
(blocked on BR-04) and Members (wider surface) for being the cleanest, fastest-to-ship of the
three: no unresolved design question, and it follows the exact `repo.memory.ts`/`repo.sqlite.ts`
rule-of-two pattern already used ~15 times elsewhere in this codebase (taxonomy, entries,
content-types, redirects, forms, settings, identity, ...).

## Requirements

- REQ-01: The system shall persist a change set's header row and its item rows in `content.db`
  as one atomic transaction — the two can never partially land.
- REQ-02: `findByIdempotencyKey` shall be enforced by a real database unique index on
  `(workspace_id, idempotency_key)`, not just an application-level check, so the guarantee holds
  under concurrent requests racing the same key.
- REQ-03: A change set's items shall always be returned in `position` order, regardless of
  insertion order.
- REQ-04: `core/commands/command.ts`'s existing capture-then-compensating-rollback design (its own
  documented `REQ-01/BR-04` unit-of-work contract) shall remain unchanged — this slice does not
  unify the domain-entity write and the change-set write into one shared database transaction
  (that is Phase 3 composition-root-rework territory, not this row's job; see Non-Goals).
- REQ-05: The hermetic test/dev composition (`server/app.ts`, `createRouteDeps()`) shall continue
  using `InMemoryChangeSetRepo` unchanged — this slice only replaces the real composition's
  (`server/deps.ts`) adapter selection.
- REQ-06: The capability inventory (SPEC-022's `capability-inventory.ts`) shall reclassify the
  `change-sets` entry's `hasDurableAdapter` from `false` to `true`.

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a change-set header and 2+ items, when `insert()` is called, then a
  query against `content.db` immediately after shows both the header row and every item row.
- AC-02 (REQ-01) [P2]: The contract test suite (`core/commands/__tests__/repo.contract.test.ts`)
  passes identically against both `InMemoryChangeSetRepo` and `SqliteChangeSetRepo`.
- AC-03 (REQ-02) [P1]: Given two change sets in the same workspace with no idempotency key set on
  either, when both are inserted, then neither insert fails (SQL `NULL <> NULL` semantics must
  not collide two "no key" rows).
- AC-04 (REQ-02) [P1]: Given a change set with idempotency key `k`, when `findByIdempotencyKey`
  is called with `k`, then it returns that change set; called with an unused key, it returns
  `null`.
- AC-05 (REQ-03) [P1]: Given items inserted in an order that does not match their `position`
  values, when `findById` is called, then `items` is sorted by `position`, not insertion order.
- AC-06 (REQ-04) [P1]: `core/commands/__tests__/command-atomicity.test.ts` (the existing certified
  suite for `executeCommand`'s unit-of-work contract) passes unchanged against the real SQLite
  composition — proving this slice introduced no behavior change to that contract.
- AC-07 [P1] (ADR-046's own required test-matrix row for this capability, "Restart ... integration
  tests"): a change set applied against a real on-disk `content.db`, then re-opened via a fresh
  `openContentDb()` call against the same file (simulating a process restart), still returns the
  full header + items + a working `findByIdempotencyKey` lookup.
- AC-08 [P1] (ADR-046's "... and revert integration tests"): a `save()` status transition
  (`applied` → `reverted`) persists and survives a second simulated restart.

## Non-Goals (explicitly out of scope)

- Unifying the domain-entity write and the change-set write into one shared database transaction.
  `executeCommand`'s existing capture-then-compensating-rollback mechanism is the cross-write
  consistency guarantee and stays as-is (REQ-04). Doing this properly means threading a
  transaction handle through every `CommandMutation.execute()` call site across the whole
  codebase — an ADR-046 Phase 3 (composition-root rework) concern, not this slice's.
- Outbox, Members, Webhooks, Origin, Media, or Analytics durability — each is its own future
  ADR-046 Phase 1 slice, pulled individually per the ADR's own pull-based sequencing.
- Resolving BR-04 (the outbox transaction-seam design question) — not applicable to this
  capability; change sets do not touch the outbox.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Drizzle, already the project's ORM (ADR-015) — no new dependency. |
| II — Test-First | COMPLIES | Contract suite + restart-survival integration test both written and passing before this doc was finalized. |
| III — Simplicity Gate | COMPLIES | Follows the established `repo.memory.ts`/`repo.sqlite.ts` rule-of-two pattern verbatim; no new abstraction. |
| IV — Anti-Abstraction Gate | COMPLIES | No new port — implements the existing `ChangeSetRepoPort` unchanged. |
| V — Integration-First Testing | COMPLIES | AC-07/AC-08 are real-file restart tests, not mocked. |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal introduced by this slice. |

## Implementation Record

- `src/infra/db/schema.ts`: `changeSets`/`changeSetItems` tables (migration `0011_right_thunderbolt_ross.sql`).
- `src/infra/sqlite/change-set-repo.sqlite.ts`: `SqliteChangeSetRepo`.
- `src/server/deps.ts`: real composition now wires `SqliteChangeSetRepo` (unchanged in `server/app.ts`).
- `src/server/capability-inventory.ts`: `change-sets` entry now `hasDurableAdapter: true`.
- Tests: `src/core/commands/__tests__/repo.contract.test.ts` (18 cases, both adapters),
  `src/core/commands/__tests__/change-sets-restart.integration.test.ts` (restart + revert survival).
- Full suite: 1501/1505 passing at completion (4 pre-existing, disclosed, unrelated failures
  carried from before this slice — `operation-lock.unit.test.ts` ×2, `redirects-site-serving.test.ts`,
  `seo-site-serving.test.ts`). Typecheck clean.

## Handoff Contract

- **Inputs used:** ADR-046 (fold-in item 4), the existing `ChangeSetRepoPort` contract, the
  established rule-of-two adapter pattern (15+ prior examples in this codebase), direct source
  inspection of `core/commands/command.ts`'s unit-of-work design.
- **Output summary:** Change-set mutation history now survives a restart in the real composition;
  test/dev composition unaffected.
- **Risks:** None new. The Non-Goals section names the one deliberate scope boundary (no shared
  transaction with the domain write) explicitly, so a future reader does not mistake it for an
  oversight.
- **Suggested next assignee:** Coordinator, to pick the next ADR-046 Phase 1 slice (Outbox, once
  BR-04 is resolved, or Members) whenever prioritized.
