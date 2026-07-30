# Feature Spec: Origin Durability (ADR-046 Phase 1, slice 5)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-027 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-027-origin-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed)

Fifth ADR-046 Phase 1 slice. Unlike Members/Webhooks (slices 3-4), `origin` genuinely had no
SQLite adapter at all — new code, not just wiring. `OriginSettingRepoPort` declares no write
method (no admin route/verification flow exists yet to let an operator register a real production
origin) — this remains a real, disclosed, un-closed gap after this slice. What this slice closes:
the *storage* is now durable; the *content* is still a hardcoded dev-capability seed either way
(unchanged behavior, just no longer re-fabricated fresh on every restart).

## Problem Statement

**Current state (before this slice):** `server/deps.ts` constructed a fresh
`InMemoryOriginSettingRepo` with a hardcoded `localhost:3000` dev-capability origin on every boot
— not really "seeded once," just re-created identically every restart, which happened to look
durable only because the seed data never changes.

**Desired state:** `content.db` gains an `origin_settings` table. `seedDevCapabilityOrigin()`
idempotently writes the dev-capability origin once; a real future write (from a verification flow
that doesn't exist yet) would never be silently clobbered by a re-run of this seed.

## Requirements

- REQ-01: `infra/db/schema.ts` shall gain an `origin_settings` table: one row per workspace, the
  verified origin fields, and two JSON-array allowlist columns.
- REQ-02: `SqliteOriginSettingRepo` shall implement `OriginSettingRepoPort` (read-only, matching
  the port's own shape).
- REQ-03: A standalone `seedDevCapabilityOrigin()` function (not part of the port) shall
  idempotently insert a workspace's dev-capability origin — a no-op if a row already exists.
- REQ-04: `seedDevCapabilityOrigin()` shall normalize allowlist hosts (trim + lowercase),
  matching `InMemoryOriginSettingRepo`'s existing normalization exactly.
- REQ-05: `server/deps.ts` shall call `seedDevCapabilityOrigin()` once at boot and construct
  `OriginRegistry` over `SqliteOriginSettingRepo`, replacing the in-memory adapter.
- REQ-06: The capability inventory's `origin` entry shall be reclassified
  `hasDurableAdapter: true`, with its `readinessDependencies` narrowed to the one real remaining
  gap (a genuine verification flow), not durability (now closed).

## Acceptance Criteria

- AC-01 (REQ-02) [P1]: The full `OriginSettingRepoPort` read contract (found/not-found origin,
  both allowlists, unregistered-workspace empty-array behavior) passes identically against both
  `InMemoryOriginSettingRepo` and `SqliteOriginSettingRepo`.
- AC-02 (REQ-03) [P1]: Calling `seedDevCapabilityOrigin()` twice with different candidate origins
  for the same workspace leaves the FIRST seed's data in place — the second call is a no-op.
- AC-03 (REQ-04) [P1]: An allowlist host seeded with mixed case / surrounding whitespace is
  returned lowercased and trimmed.
- AC-04 [P1] (ADR-046's own required test-matrix row, restart): an origin seeded against a real
  on-disk `content.db`, then re-opened via a fresh `openContentDb()` call against the same file,
  is still found, with its allowlists intact.
- AC-05 (REQ-06) [P2]: `production-readiness-boot.integration.test.ts`'s staleness check continues
  to pass.

## Non-Goals

- Building a real origin-verification flow (admin route, DNS/TXT-record or similar proof, a
  write path on the port). `OriginSettingRepoPort` stays read-only. This is a real, disclosed,
  future gap — not fixed here.
- Changing `seedDevCapabilityOrigin`'s hardcoded `localhost:3000` seed content. Only its
  persistence mechanism changed.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Drizzle, no new dependency. |
| II — Test-First | COMPLIES | Contract + restart tests written and passing; two real bugs (undefined-vs-omitted-key mismatch, missing host normalization) were caught by the tests before this doc was finalized and fixed. |
| III — Simplicity Gate | COMPLIES | One table, one adapter, one seed function — no new abstraction. |
| IV — Anti-Abstraction Gate | COMPLIES | Implements the existing port unchanged; the seed function is deliberately NOT part of the port (no write method exists there by design). |
| V — Integration-First Testing | COMPLIES | AC-04 is a real-file restart test. |
| VI — Security-by-Default | N/A | No authz surface change; egress-allowlist enforcement behavior is unchanged (same data, durable storage). |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal. |

## Implementation Record

- `src/infra/db/schema.ts`: `originSettings` table (migration `0013_fat_kabuki.sql`).
- `src/infra/sqlite/origin-repo.sqlite.ts`: `SqliteOriginSettingRepo` + `seedDevCapabilityOrigin`.
- `src/server/deps.ts`: real composition now seeds + reads via the SQLite adapter.
- `src/server/capability-inventory.ts`: `origin` entry now `hasDurableAdapter: true`.
- Tests: `src/origin/__tests__/repo.contract.test.ts` (10 cases: shared read-contract suite over
  both adapters, idempotent-seed proof, restart survival).
- Two bugs found and fixed during test-writing (both before this doc was finalized): `toVerifiedOrigin()`
  was setting `port`/`basePath` to explicit `undefined` rather than omitting them (broke
  deep-equality against the in-memory shape); `seedDevCapabilityOrigin()` wasn't normalizing
  allowlist hosts like the in-memory constructor does.
- Full suite: 1528/1532 passing at completion (4 pre-existing, disclosed, unrelated failures
  carried since before this slice). Typecheck clean.

## Handoff Contract

- **Inputs used:** direct inspection of `origin/ports.ts` (confirmed no write method exists on the
  port — a real design constraint, not an oversight to route around), `origin/repo.memory.ts`'s
  own "no SQLite adapter yet" disclosure, `content-db.ts`'s `seedContentDb()` idempotent-seed
  precedent.
- **Output summary:** the origin/allowlist data now survives a restart. The dev-capability content
  itself is unchanged — this slice is purely a persistence-mechanism upgrade.
- **Risks:** the real gap (no way for an operator to register a genuine production origin) is
  unaffected by this slice and remains open — named explicitly in Non-Goals so it isn't mistaken
  for solved.
- **Suggested next assignee:** Coordinator, for the next ADR-046 Phase 1 slice (Media or
  Analytics — the last two).
