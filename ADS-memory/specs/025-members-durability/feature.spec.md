# Feature Spec: Members Durability (ADR-046 Phase 1, slice 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-025 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-025-members-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed)

Third ADR-046 Phase 1 slice. Unlike Change Sets/Outbox (slices 1-2), the durable adapters
themselves (`SqliteMemberRepo`, `SqliteMemberTierRepo`, `SqliteMemberSubscriptionRepo`,
`SqliteMemberSessionRepo`, `SqliteMagicLinkTokenRepo`, `SqliteMemberConsentRepo`) already existed,
fully built and contract-tested (`members/__tests__/repo.contract.test.ts`, 32 passing cases)
from a prior session — this was a genuine "composed into zero composition roots" gap (the same
pattern already found and fixed for `core/gated-mutations`'s gateway in an earlier session), not
missing adapter code. This slice's actual work: wire the 5 route-consumed repos into
`server/deps.ts`, export the adapter classes from `members/index.ts`'s barrel (they weren't
exported yet), and add the restart-survival integration test ADR-046's own test matrix requires.

`memberConsentRepo` (the 6th adapter, `SqliteMemberConsentRepo`) is NOT wired — `RouteDeps` has no
`memberConsentRepo` field and no route consumes it yet (matches the existing, already-disclosed
`membersConsentCapability: null` note in `deps.ts`: "Members has not shipped a real capability this
pass"). Wiring an adapter nothing calls is out of scope; when a real consent-consuming route lands,
that's the trigger to wire this repo too.

## Problem Statement

**Current state (before this slice):** `server/deps.ts` wired `InMemoryMemberRepo`,
`InMemoryMemberTierRepo`, `InMemoryMemberSubscriptionRepo`, `InMemoryMemberSessionRepo`, and
`InMemoryMagicLinkTokenRepo` — every member, tier, subscription, session, and magic-link token was
lost on every restart. This is real user-facing risk: an active member session (or a mid-flight
magic-link sign-in) would silently vanish on any server restart.

**Desired state:** The real composition root uses the durable SQLite adapters. Test/dev composition
(`server/app.ts`) is unaffected — it already used, and continues to use, the in-memory adapters.

## Requirements

- REQ-01: `server/deps.ts` shall construct `SqliteMemberRepo`, `SqliteMemberTierRepo`,
  `SqliteMemberSubscriptionRepo`, `SqliteMemberSessionRepo`, and `SqliteMagicLinkTokenRepo` against
  the real `content.db` connection, replacing the in-memory equivalents.
- REQ-02: `members/index.ts` shall export the six `Sqlite*` adapter classes, matching the existing
  export pattern for the `InMemory*` adapters.
- REQ-03: `server/app.ts`'s hermetic composition shall remain unchanged (in-memory adapters).
- REQ-04: The capability inventory's `members` entry shall be reclassified
  `hasDurableAdapter: true`.

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: A member created via the real composition, then looked up via a fresh
  `SqliteMemberRepo` instance against the same on-disk `content.db` file (simulating a restart),
  is found.
- AC-02 (REQ-01) [P1] (ADR-046's own required test-matrix row, "Restart + expiration + auth
  integration tests"): a session created against the real composition survives a simulated
  restart, and a subsequent revocation of that session also survives a second simulated restart.
- AC-03 (REQ-02) [P2]: `members/__tests__/repo.contract.test.ts`'s existing 32-case suite
  continues to pass unchanged (proves the newly-exported classes are the same ones already
  certified, not a parallel reimplementation).
- AC-04 (REQ-03) [P1]: `server/app.ts`'s hermetic test suite is unaffected — no test that
  constructs `createRouteDeps()` changes behavior.
- AC-05 (REQ-04) [P2]: `production-readiness-boot.integration.test.ts`'s staleness check
  continues to pass.

## Non-Goals

- Wiring `SqliteMemberConsentRepo` — no route consumes it yet (see Scope Note).
- Building any new adapter code — all six SQLite adapters already existed before this slice.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | Contract suite already existed and passed before this slice began; one new restart-survival test added and passing. |
| III — Simplicity Gate | COMPLIES | Composition-root wiring only — no new code beyond one test file and two export lines. |
| IV — Anti-Abstraction Gate | COMPLIES | No port or abstraction change. |
| V — Integration-First Testing | COMPLIES | AC-02 is a real-file restart test. |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the wiring change it accompanies. |
| VIII — Observability | N/A | No new observable signal. |

## Implementation Record

- `src/members/index.ts`: exports the 6 `Sqlite*` adapter classes.
- `src/server/deps.ts`: wires 5 of the 6 (all but `SqliteMemberConsentRepo`, see Non-Goals).
- `src/server/capability-inventory.ts`: `members` entry now `hasDurableAdapter: true`.
- Tests: `src/members/__tests__/restart.integration.test.ts` (new); existing
  `repo.contract.test.ts` (32 cases) unchanged and still passing.
- Full suite: 1516/1520 passing at completion (4 pre-existing, disclosed, unrelated failures
  carried since before this slice). Typecheck clean.

## Handoff Contract

- **Inputs used:** direct inspection of `members/repo.sqlite.ts` (found fully built, contract-tested,
  never wired — the same disclosed-gap pattern ADR-046's own Context section names for this
  capability family generally).
- **Output summary:** members/sessions/tiers/subscriptions/magic-links now survive a restart in the
  real composition.
- **Risks:** none new. `memberConsentRepo`'s non-wiring is a disclosed, deliberate scope limit
  (nothing calls it), not an oversight.
- **Suggested next assignee:** Coordinator, for the next ADR-046 Phase 1 slice (Webhooks, Origin,
  Media, or Analytics).
