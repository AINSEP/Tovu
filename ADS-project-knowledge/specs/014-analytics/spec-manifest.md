# Spec Manifest: analytics

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-014 |
| feature_name | FEAT-014-analytics |
| version | 1.0.0 |
| last_edited | 2026-07-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/014-analytics |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow.
It exists to make downstream stages read the full package instead of guessing filenames
from memory.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary as-built requirements spec. |
| `api.spec.md` | PRESENT | `api.spec.md` | Feature exposes two real HTTP endpoints (`POST /_analytics/e`, `GET .../recent-hits`). |
| `state.spec.md` | PRESENT | `state.spec.md` | Feature manages stateful data — the server-side in-memory hit buffer and the admin UI's local fetch state — even though none of it is durable/DB-backed; that absence is itself part of what this file documents. |
| `orchestrator.spec.md` | OMITTED | `—` | No async orchestration/coordinator layer distinct from the synchronous `ingestHit` application service and the two direct HTTP route handlers exists. There is no queue, no multi-step saga, and no background job wired for analytics today (the rollup/retention jobs ADR-035 names are unbuilt) — mirrors SPEC-007 (settings) and SPEC-009 (redirects)'s identical reasoning for omitting this file. |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Feature has a UI surface — the admin `Analytics.tsx` screen. |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Feature defines a closed error/drop-reason vocabulary (`IngestDropReason` plus the one HTTP-level `404`), even though it deliberately does not use the project's generic structured-error envelope — that deviation is itself documented in this file. |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Feature has real precedence (drop-reason ordering, config-vs-client-flag precedence), ordering (recent-hits read order), non-obvious defaults, and numeric bounds (event-prop limits, `list()` clamp bounds) that materially affect behavior. |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC coverage mapping — populated against already-shipped code and tests, not left pending. |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages. |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof. |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md` |
| `tdd` | `feature.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR-035, the coverage gaps in `traceability.spec.md` §6.2 (these are the concrete next tests to write) |
| `programmer` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR-035, certified tests — note that most implementation already exists; new work here is closing the §6.2 gaps and the Known Deviations (permission gating, Tier-3 build-out), not building the ingest slice from scratch |

---

## Brownfield / Reverse-Spec References

This is a brownfield, as-built spec written directly from already-shipped source code and
already-existing tests (not a formal 5-pass reverse-spec extraction — the dispatching
Coordinator directive explicitly scoped this as a lightweight backfill, skipping the full
reverse-spec pipeline).

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/analytics/INFO.md` | source touchpoint | The module's own header explicitly states the ingest-only scope and disclaims the storage/rollup/dashboard/goals/export surface — primary evidence for this spec's Scope section. |
| `src/analytics/types.ts`, `src/analytics/ports.ts` | source touchpoint | Full type/port surface; distinguishes what is a live implementation vs. a declared-but-unimplemented interface (e.g. `AnalyticsRepoPort`, `AnalyticsGoalDef`, `AnalyticsDomainEventPayloads`). |
| `src/analytics/ingest.ts`, `src/analytics/salt.ts`, `src/analytics/repo.memory.ts` | source touchpoint | The entire implemented ingest application service, salt derivation, and in-memory sink adapter — ground truth for REQ-01 through REQ-12. |
| `src/server/routes/site/analytics-ingest.ts`, `src/server/routes/admin/analytics/recent-hits.ts` | source touchpoint | The two HTTP boundaries — ground truth for `api.spec.md` and REQ-13 through REQ-15. |
| `src/server/app.ts` (lines wiring `analyticsSink`, `registerAdminAnalyticsRecentHitsRoute`, `registerAnalyticsIngestRoute`) | source touchpoint | Confirms both routes are actually wired into the running `createApp()` — contradicts stale comments in the route-level test files (see Validation Notes below). |
| `apps/admin/src/sections/Analytics.tsx`, `apps/admin/src/lib/api.ts` (`listRecentAnalyticsHits`, `AdminAnalyticsHit`) | source touchpoint | Ground truth for `ui.spec.md` and `state.spec.md` §4. |
| `src/identity/permissions.ts` | source touchpoint | Confirms **no** `analytics.*` or `admin.analytics.*` permission is registered anywhere in the code-side catalog — direct evidence for Known Deviations item 2. |
| `src/analytics/__tests__/ingest.test.ts`, `salt.test.ts`, `repo.memory.test.ts` | source touchpoint (existing tests) | Unit-level test evidence cited throughout `traceability.spec.md`. |
| `src/server/__tests__/routes/analytics-ingest.test.ts`, `analytics-recent-hits.test.ts` | source touchpoint (existing tests) | Route/integration-level test evidence; also the source of the stale "not wired into createApp() yet" file-header comments noted above as a minor doc/code drift (the routes *are* wired — `app.ts` calls both registrars) — flagged for correction as a documentation cleanup, not a functional defect. |
| `ADS-project-knowledge/reports/architecture/ADR-035-analytics.md` | governing ADR | Source of the target/aspirational design this spec's "Desired state" and Known Deviations sections compare the as-built reality against. |
| `ADS-project-knowledge/reports/architecture/sweep-crosscutting-decisions-20260710.md` §D/§E | source touchpoint | Source of the `admin.{section}.{action}` permission-namespace convention and the `admin.analytics.view` naming ADR-035's Round-2 fold adopted — used to evaluate Known Deviations item 2 against the frozen convention, not just against ADR-035's own text. |
| `ADS-project-knowledge/reports/architecture/ADR-INDEX.md` line 43 | source touchpoint | Confirms ADR-035's accepted status and its own one-line summary ("Ingest backend built (`src/analytics`)") — corroborates this spec's scope finding independently of ADR-035's body text. |

---

## Validation Notes

- Validator last run: not-run (pending — will be run immediately after this manifest is
  finalized, per the Speckit compatibility flow).
- Validator result: PENDING
- Validator manual waiver: N/A
- Canonical hash verified at: not-run
- Notes: This package documents already-shipped code. Two real deviations from ADR-035
  were found and are recorded in `feature.spec.md`'s Known Deviations section (the
  Tier-2/Tier-3 split is aspirational-only, not implemented as a plugin boundary; no
  `admin.analytics.view`/`analytics.*` permission is registered or enforced anywhere). A
  minor, non-blocking documentation drift was also found: both route-level test files'
  header comments claim the routes are "not wired into `createApp()` yet," but `server/app.ts`
  does wire both (`registerAdminAnalyticsRecentHitsRoute` at the `/api/admin` block,
  `registerAnalyticsIngestRoute` ahead of the site catch-all) — recorded in the Brownfield
  References table above as a stale-comment cleanup item, not a spec blocker.
