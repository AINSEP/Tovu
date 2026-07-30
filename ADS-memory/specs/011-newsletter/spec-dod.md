# Spec Definition of Done (DoD) Checklist: newsletter

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-011 |
| feature_name | FEAT-011-newsletter |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-13T00:00:00Z |
| reviewed_by | |
| reviewed_date | |

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | |
| A-03 | `api.spec.md` is present | PASS | Admin CRUD + send/pause/resume/import + public confirm/unsubscribe HTTP surface is in scope |
| A-04 | `state.spec.md` is present | PASS | Durable campaign/list/subscription/snapshot/send/confirmation-token state + admin client state |
| A-05 | `orchestrator.spec.md` is present (or NA with justification) | PASS | Newsletter has a genuine async orchestration layer (audience freeze → outbox fan-out → completion) distinct from a synchronous write chokepoint — unlike SPEC-007/SPEC-009, which correctly omitted this file, this feature's send pipeline earns it |
| A-06 | `ui.spec.md` is present | PASS | Campaign list/composer, list management, subscriber table, send log are in-scope UI surfaces (REQ-26) |
| A-07 | `errors.spec.md` is present | PASS | New feature-specific error registry defined, including `NEWSLETTER_LAUNCH_GATE_BLOCKED` |
| A-08 | `behavior.spec.md` is present | PASS | Status-transition authority, gate precondition ordering, hook ordering, confirmation-token reissuance, defaults, and bounds all require it |
| A-09 | `traceability.spec.md` is present and all REQ-*/AC-* rows populated | PASS | All rows present, status PENDING (pre-implementation, expected) |
| A-10 | `spec-manifest.md` is present and records actual filenames + omissions with justification | PASS | No conditional files are omitted this run — all 8 optional/conditional logical files are PRESENT and justified |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | Verified no prior `011-*` folder existed under `ADS-memory/reports/pipeline/` before this run |
| B-02 | `version` set to correct semver | PASS | 1.0.0, new spec |
| B-03 | `status` is APPROVED | PASS | |
| B-04 | `content_hash` computed and recorded | PASS | Computed via provider-local validator (see spec-manifest/pipeline-state for the actual value post `--update-hash` run) |
| B-05 | `feature_name` matches FEAT folder name exactly | PASS | `FEAT-011-newsletter` matches `011-newsletter` folder (NNN-feature-name convention) |
| B-06 | `last_edited` is valid ISO-8601 UTC | PASS | |
| B-07 | `owner` set to a named human/team | PASS | Leona Burime |
| B-08 | Overview present, 1–3 sentences | PASS | |
| B-09 | Problem Statement complete (current/desired/why now/success signal) | PASS | |
| B-10 | User Journey complete (trigger/steps/outcome/alternate paths) | PASS | |
| B-11 | Scope: in-scope list present and non-empty | PASS | |
| B-12 | Scope: out-of-scope list present and non-empty | PASS | Mirrors ADR-034 §9 DEFERRED items |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain | PASS | None used; real brownfield gaps (unbuilt mail/KeyringPort adapters, unbuilt Members consent ledger, no generalized entries substrate, permission-prefix mismatch) were resolved directly with authoritative sourcing (ADR-034 text, ADR-INDEX, direct repo inspection) and recorded as flagged deviations/dependencies instead, per task instruction — none of them left the requirements untestable |
| B-14 | All Open Questions have owner + resolution date | PASS | OQ-01–OQ-04 each assign an owner and a resolution point (`/plan` dispatch, or explicitly not gating v1) |
| B-15 | Requirements section has ≥1 REQ-* | PASS | 32 requirements |
| B-16 | REQ-* items testable, no vague qualifiers | PASS | |
| B-17 | REQ-* items independently verifiable | PASS | |
| B-18 | Acceptance Criteria has ≥1 AC-* | PASS | 43 acceptance criteria |
| B-19 | Every REQ-* has ≥1 AC-* | PASS | Verified against traceability.spec.md Section 1 |
| B-20 | All AC-* follow Given/When/Then | PASS | |
| B-21 | All AC-* have [P1]/[P2]/[P3] tag | PASS | |
| B-22 | All P1 AC items independently testable | PASS | |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | |
| B-24 | Invariants section has ≥1 INV-* | PASS | 10 invariants |
| B-25 | INV-* written as absolute statements | PASS | |
| B-26 | Edge Cases section has ≥1 EC-* | PASS | 10 edge cases |
| B-27 | EC-* are concrete scenarios | PASS | |
| B-28 | EC-* have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete, no blank cells | PASS | Deliberately candid about which dependencies are real/working vs. named-but-unbuilt |
| B-30 | Constitution Compliance table complete, all 8 articles marked | PASS | All COMPLIES |
| B-31 | Any EXCEPTION has a note in DoD/ADR | NA | No EXCEPTION rows exist in the Constitution Compliance table |
| B-32 | Implementation Readiness Gate checklist complete and PASS | PASS | See `feature.spec.md`'s own gate section |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use the type system, no comment-only behavior | PASS | |
| C-02 | Public interfaces/types have doc comments | PASS | Entity contracts in `state.spec.md`/`api.spec.md`/`orchestrator.spec.md` are annotated inline with rationale |
| C-03 | Optional fields explicitly marked optional | PASS | |
| C-04 | Nullable fields have explicit nullable typing | PASS | |
| C-05 | No untyped/`any`/`object` escape hatches | PASS | `details: object|null` in the error envelope is the template's own standard shape, further specified per-code in `errors.spec.md` § 3 |
| C-06 | Immutable constants marked per language idiom | NA | This spec is language-neutral `.spec.md` contracts, not source code; the underlying `src/newsletter/types.ts` already uses readonly-style declarations where applicable |
| C-07 | API contract: all endpoints in a single registry constant | PASS | `api.spec.md` § 1/1a Endpoint Registry |
| C-08 | API contract: all error codes have HTTP status mapping | PASS | `errors.spec.md` § 2 |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | Named auth profile on every endpoint, including the deliberate `PUBLIC_TOKEN` (unauthenticated-by-design) profile for confirm/unsubscribe |
| C-10 | State contract: initial state covers all fields | PASS | `state.spec.md` § 1 |
| C-11 | State contract: transitions/actions cover all state-changing operations | PASS | `state.spec.md` § 3 |
| C-12 | State contract: invariants are falsifiable | PASS | `state.spec.md` § 5 |
| C-13 | Orchestrator contract: async outputs have explicit result type | PASS | `orchestrator.spec.md` § 4 — every action returns an explicit `Result<...>` shape |
| C-14 | Orchestrator contract: invariants are falsifiable | PASS | `orchestrator.spec.md` § 6 |
| C-15 | UI contract: all components have typed props/params | PASS | `ui.spec.md` § 2 |
| C-16 | UI contract: display conditions cover show/hide/disabled for every interactive element | PASS | `ui.spec.md` § 4 |
| C-17 | UI contract: accessibility requirements cover all components | PASS | `ui.spec.md` § 5 |
| C-18 | Error contract: all codes have HTTP status, retry eligibility, ownership, user message | PASS | `errors.spec.md` § 2/§4 |
| C-19 | Error contract: no error code missing from coverage requirements | PASS | |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field with multiple value sources | PASS | Status transition authority (§1.1) + Launch Readiness Gate evaluation order (§1.2) + hook ordering (§1.3) |
| D-02 | Precedence rules ordered highest-first | PASS | |
| D-03 | Default Values table covers every non-obvious default | PASS | Includes the safety-critical `sending_enabled: false` default and its explicit rationale |
| D-04 | "Why" column has rationale, not restatement | PASS | |
| D-05 | Limits and Bounds table covers every numeric constraint affecting behavior | PASS | |
| D-06 | Enforcement column specifies where each constraint is checked | PASS | |
| D-07 | Deduplication rules define "duplicate" precisely | PASS | § 5.1 |
| D-08 | Tie-break logic deterministic | PASS | § 6.1 |
| D-09 | Edge Case Handling table covers all boundary values from Limits table | PASS | § 7 |
| D-10 | Every behavior rule has a row in traceability.spec.md § 5 | PASS | Verified 1:1 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md is present | PASS | |
| E-02 | Every REQ-* appears in § 1 | PASS | |
| E-03 | Every AC-* appears in § 1 | PASS | |
| E-04 | Every INV-* appears in § 2 | PASS | |
| E-05 | Every EC-* appears in § 3 | PASS | |
| E-06 | Every error code appears in § 4 | PASS | |
| E-07 | "pending" rows acceptable at spec stage | PASS | No FAIL assigned for pending rows, per rule |
| E-08 | § 7 (Untraced Requirements) is empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | Error codes in api.spec.md are a subset of errors.spec.md | PASS | Verified: every `NEWSLETTER_*` code plus `FORBIDDEN`/`VALIDATION_ERROR`/`INTERNAL_ERROR` referenced in `api.spec.md` § 6 appears in `errors.spec.md` § 2 |
| F-02 | Resource status types consistent across api/state/ui | PASS | `Campaign.status`, `Subscription.status`, `SendLogRow.status` enums identical everywhere they appear |
| F-03 | OrchestratorItem is a valid projection of state's FeatureItem | NA | This orchestrator's Output State Contract (`orchestrator.spec.md` § 3) directly references `state.spec.md`'s own entities (`CampaignRecord`, `AudienceSnapshotRow`) rather than defining a separate `OrchestratorItem` projection type — the generic template's frontend-hook `FeatureItem`/`OrchestratorItem` projection pattern does not apply to this backend send-pipeline orchestrator, per this file's own Purpose note explaining the adaptation |
| F-04 | ItemSummary in ui.spec.md is a valid projection of OrchestratorItem | NA | The admin UI has no separate client-side orchestrator (`ui.spec.md` Purpose note) — components consume `state.spec.md` entities directly via the API client, matching every other admin section in this repo |
| F-05 | Default values in orchestrator InputProps match behavior.spec.md Defaults | PASS | `orchestrator.spec.md` § 2's `batchSize` default (`20`) matches `behavior.spec.md` § 3's "Outbox claim batch size" row exactly |
| F-06 | Rate limit values in api.spec.md match behavior.spec.md Limits | PASS | `api.spec.md` § 3 rate-limit profiles are documented-but-unenforced (matches every other admin route in this repo today); `behavior.spec.md` does not separately assert conflicting rate-limit numbers |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-011` / `FEAT-011-newsletter` throughout |
| F-08 | All spec files have consistent version numbers | PASS | `1.0.0` throughout |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I: no custom impl where a library exists | PASS | See feature.spec.md Constitution Compliance table |
| G-02 | Article II: no implementation-order assumptions | PASS | Spec makes no claim implementation exists; TDD runs first |
| G-03 | Article III: every module traces to a requirement | PASS | |
| G-04 | Article IV: no speculative abstractions | PASS | No new ADR-006 port introduced; the Members read seam stays the corrected single-evaluator dependency per ADR-034's own Round-3/4 fold, not re-promoted here |
| G-05 | Article V: every P1 AC has an integration-test row (or pending) | PASS | All P1 rows in traceability.spec.md § 1 are `pending`, acceptable pre-TDD |
| G-06 | Article VI: api.spec.md auth present for all endpoints | PASS | Named auth profile on every endpoint, including the deliberately-unauthenticated `PUBLIC_TOKEN` profile for confirm/unsubscribe (justified, not an oversight) |
| G-07 | Article VII: spec_id + content_hash present/correct everywhere | PASS | |
| G-08 | Article VIII: errors.spec.md defines structured payloads with correlationId | PASS | Base error envelope § 1 of `errors.spec.md` |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | Implementation Readiness Gate: a new developer can implement from the spec-system package alone | PASS | The package names every real integration point (`src/origin`'s `OriginRegistry`, `src/core/events/outbox-worker.ts`'s `processOutbox`, `src/members/subscriber-directory.ts`'s `MembersSubscriberDirectory`) with file paths, and equally names every *unbuilt* precondition (`src/mail` adapters, `KeyringPort` adapter, Members' `member_consents`/`members.consent.*`, the ADR-023 interim table-creation path, the ADR-026 atomic multi-write primitive) as explicit, resolved-with-rationale dependencies rather than leaving a developer to discover mid-implementation that "send real email" silently assumed three unbuilt primitives were ready |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 10 | 0 | 0 |
| B: feature.spec.md Quality | 32 | 31 | 0 | 1 |
| C: Typed Contract Quality | 19 | 18 | 0 | 1 |
| D: Behavior Rules Quality | 10 | 10 | 0 | 0 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 6 | 0 | 2 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **92** | **0** | **4** |

**Overall DoD Result:** PASS

> PASS — All items are PASS or NA (with written justification for each NA). Spec is ready for Software Architect dispatch.

---

## Blocking Issues (if FAIL)

None.

| Item ID | Issue | Required Change | Owner | Target Date |
|---------|-------|----------------|-------|-------------|
| — | — | — | — | — |

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Spec Agent | 2026-07-13T00:00:00Z | Spec Agent |
| Coordinator | Coordinator | 2026-07-13T00:00:00Z | Coordinator — concur with the code-enforced Launch Readiness Gate (REQ-21) as the correct translation of "Members must be live"; concur with `admin.newsletter.*` per the frozen convention |

> By signing, the Coordinator confirms:
> 1. All items in this checklist are PASS or NA with written justification.
> 2. The spec-system package is internally consistent.
> 3. The Implementation Readiness Gate (H-01) is PASS.
> 4. The spec is authorized for dispatch to the Software Architect Agent.
