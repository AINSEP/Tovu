# Feature Spec: Analytics Sink Durability (ADR-046 Phase 1, final capability slice)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-029 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-029-analytics-sink-durability |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed)

Seventh and final ADR-046 Phase 1 capability slice. Scope is narrower than it first looks: the
`analytics` library exposes TWO ports — `AnalyticsSinkPort` (the ingest write seam, has an
adapter today) and `AnalyticsRepoPort` (the aggregate/time-series/rollup/goals storage surface,
has NO adapter at all). Per `analytics/INFO.md`'s own "Future direction" section, `AnalyticsRepoPort`
is a separate, later, deliberately deferred Tier-3 build — not a durability gap in what ships
today. This slice closes the ONE real gap that exists: `LocalBufferSink` (the only sink adapter
in production composition) is a process-local array that does not survive a restart, while its
own `capabilities()` method claimed `durable: true` — the exact defect capability-inventory.ts's
`analytics` entry already flagged by name (`INV-03 forbids trusting` a self-reported claim like that).

A secondary, necessary change: `RouteDeps.analyticsSink` and `AdminAnalyticsRecentHitsDeps` were
typed against the CONCRETE `LocalBufferSink` class rather than the `AnalyticsSinkPort` interface
(the only such case found among the capabilities this session touched) — this had to be widened
to the port interface for a second adapter to be substitutable at all, which in turn required
adding `list()` to the port interface itself (previously a `LocalBufferSink`-only method the
admin recent-hits route depended on directly).

## Problem Statement

**Current state (before this slice):** `server/deps.ts` and `server/app.ts` both wired
`LocalBufferSink` for `analyticsSink` — every ingested hit (and the admin "recent hits" screen's
only data source) was lost on restart, despite `capabilities().durable` claiming otherwise.

**Desired state:** real composition uses a durable `SqliteBufferSink`; `LocalBufferSink`'s
`capabilities()` honestly reports `durable: false`; `AnalyticsSinkPort` is a real substitution
point (interface-typed at every call site, not the concrete in-memory class).

## Requirements

- REQ-01: `infra/db/schema.ts` shall gain an `analytics_events` table matching `NormalizedHit`'s
  fields (flattened `utm`, JSON-encoded `eventProps`), with a surrogate autoincrement `id` used
  purely for `list()`'s newest-first ordering.
- REQ-02: A `SqliteBufferSink` class shall implement `AnalyticsSinkPort` (`accept`, `acceptBatch`,
  `capabilities` reporting `durable: true`, and `list`).
- REQ-03: `LocalBufferSink.capabilities()` shall report `durable: false` (it is a process-local
  array).
- REQ-04: `AnalyticsSinkPort` shall gain a `list(input?: { limit?: number }): NormalizedHit[]`
  method (both adapters already had equivalent-shaped support; only the port declaration and the
  concrete-class-typed call sites were the gap).
- REQ-05: `RouteDeps.analyticsSink` and `AdminAnalyticsRecentHitsDeps.analyticsSink` shall be
  typed as `AnalyticsSinkPort`, not the concrete `LocalBufferSink` class.
- REQ-06: `server/deps.ts` shall construct `SqliteBufferSink` against the real `content.db`
  connection and the seeded workspace id; `server/app.ts`'s hermetic composition shall remain
  `LocalBufferSink`.
- REQ-07: The capability inventory's `analytics` entry shall be reclassified
  `hasDurableAdapter: true`.

## Acceptance Criteria

- AC-01 (REQ-01/REQ-02) [P1]: `accept`/`acceptBatch`/`list` behave identically (round-trip,
  newest-first ordering, limit clamping, `eventProps` round-trip) across `LocalBufferSink` and
  `SqliteBufferSink`.
- AC-02 (REQ-03) [P1]: `LocalBufferSink.capabilities().durable === false`;
  `SqliteBufferSink.capabilities().durable === true`.
- AC-03 [P1] (ADR-046's own required test-matrix row, restart): a hit written against a real
  on-disk `content.db` via `SqliteBufferSink` is still returned by `list()` after a simulated
  restart (fresh `openContentDb()` against the same file).
- AC-04 (REQ-05) [P2]: `npm run typecheck` is clean with `analyticsSink` typed as the port
  interface everywhere it is consumed.
- AC-05 (REQ-07) [P2]: `production-readiness-boot.integration.test.ts`'s staleness check
  continues to pass.

## Non-Goals

- `AnalyticsRepoPort` (aggregate/time-series/rollup/goals storage) — see Scope Note; remains
  unbuilt, unchanged, and explicitly out of scope.
- The rollup job, dashboards, goal evaluation, or the `AnalyticsConfigPort`-driven per-site
  enable/disable/retention flow — none of that exists yet; this slice only makes the raw ingest
  buffer that already exists durable.
- Session stitching / `AnalyticsSessionRow` — belongs to the deferred rollup layer per
  `analytics/INFO.md`.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Drizzle, no new dependency. |
| II — Test-First | COMPLIES | 12-case contract suite (both adapters × 5 shared cases, plus a durable-vs-non-durable capabilities() assertion and a real-file restart test) written and passing before this doc was finalized. |
| III — Simplicity Gate | COMPLIES | Follows the established `repo.memory.ts`/`repo.sqlite.ts` rule-of-two pattern; `list()`'s addition to the port is the minimum needed to make the second adapter substitutable, not a speculative surface. |
| IV — Anti-Abstraction Gate | COMPLIES | Implements the existing port; widens it by exactly one method the concrete class already had. |
| V — Integration-First Testing | COMPLIES | AC-03 is a real-file restart test. |
| VI — Security-by-Default | N/A | No authz surface change (the recent-hits route's `analytics.read` gate is unchanged). |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal. |

## Implementation Record

- `src/infra/db/schema.ts`: `analyticsEvents` table (migration `0015_blue_dazzler.sql`).
- `src/infra/sqlite/analytics-sink.sqlite.ts`: `SqliteBufferSink`.
- `src/analytics/ports.ts`: `AnalyticsSinkPort` gains `list()`.
- `src/analytics/repo.memory.ts`: `LocalBufferSink.capabilities()` now reports `durable: false`.
- `src/server/routes/types.ts`: `RouteDeps.analyticsSink` retyped to `AnalyticsSinkPort`.
- `src/server/routes/admin/analytics/recent-hits.ts`: `AdminAnalyticsRecentHitsDeps.analyticsSink`
  retyped to `AnalyticsSinkPort`.
- `src/server/deps.ts`: real composition now wires `SqliteBufferSink` (unchanged for
  `server/app.ts`).
- `src/server/capability-inventory.ts`: `analytics` entry now `hasDurableAdapter: true`.
- Tests: `src/analytics/__tests__/repo.contract.test.ts` (12 cases).
- Full suite: 1573/1573 (1569 passing, 4 pre-existing, disclosed, unrelated failures carried
  since before this slice). Typecheck clean.

## Handoff Contract

- **Inputs used:** direct inspection of `analytics/ports.ts`, `analytics/types.ts`,
  `analytics/repo.memory.ts`, `analytics/INFO.md` (confirmed `AnalyticsRepoPort` has no adapter
  and is explicitly future-deferred), and the two route/type call sites
  (`server/routes/types.ts`, `server/routes/admin/analytics/recent-hits.ts`) that constrained the
  sink to the concrete `LocalBufferSink` class.
- **Output summary:** the raw analytics ingest buffer (and the admin "recent hits" screen it
  feeds) now survives a restart in real composition; `LocalBufferSink`'s durability
  self-misreport is fixed. This closes the LAST capability in ADR-046 Phase 1's table — every
  Phase 1 capability slice (`change-sets`, `outbox`, `members`, `webhooks`, `origin`, `media`,
  `analytics`) now has `hasDurableAdapter: true`.
- **Risks:** none disclosed beyond the Scope Note's `AnalyticsRepoPort` boundary.
- **Suggested next assignee:** Coordinator, for ADR-046 Phase 2 (async boot/readiness lifecycle).
