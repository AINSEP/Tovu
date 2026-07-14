# Spec Definition of Done (DoD) Checklist: redirects

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-009 |
| feature_name | FEAT-009-redirects |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-12T00:00:00Z |
| reviewed_by | Coordinator |
| reviewed_date | 2026-07-13T00:00:00Z |

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | |
| A-03 | `api.spec.md` is present | PASS | Admin CRUD + import + hit-read HTTP surface is in scope |
| A-04 | `state.spec.md` is present | PASS | Durable rule/revision/hit-stat state + admin client state |
| A-05 | `orchestrator.spec.md` is present (or NA with justification) | NA | No async orchestration/coordinator layer distinct from the synchronous write chokepoint and routing-chain phase handler; mirrors SPEC-007 (settings) precedent's identical reasoning |
| A-06 | `ui.spec.md` is present | PASS | Admin list + create/edit form is in scope (REQ-23–REQ-25) |
| A-07 | `errors.spec.md` is present | PASS | New feature-specific error registry defined |
| A-08 | `behavior.spec.md` is present | PASS | Match-type precedence, phase eligibility, tie-break, one-hop collapse, dynamic-set cap all require it |
| A-09 | `traceability.spec.md` is present and all REQ-*/AC-* rows populated | PASS | All rows present, status PENDING (pre-implementation, expected) |
| A-10 | `spec-manifest.md` is present and records actual filenames + omissions with justification | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | Verified no prior `009-*` folder existed under `ADS-project-knowledge/reports/pipeline/` before this run |
| B-02 | `version` set to correct semver | PASS | 1.0.0, new spec |
| B-03 | `status` is APPROVED | PASS | |
| B-04 | `content_hash` computed and recorded | PASS | Computed via provider-local validator (see spec-manifest/pipeline-state for the actual value post `--update-hash` run) |
| B-05 | `feature_name` matches FEAT folder name exactly | PASS | `FEAT-009-redirects` matches `009-redirects` folder (NNN-feature-name convention) |
| B-06 | `last_edited` is valid ISO-8601 UTC | PASS | |
| B-07 | `owner` set to a named human/team | PASS | Leona Burime |
| B-08 | Overview present, 1–3 sentences | PASS | |
| B-09 | Problem Statement complete (current/desired/why now/success signal) | PASS | |
| B-10 | User Journey complete (trigger/steps/outcome/alternate paths) | PASS | |
| B-11 | Scope: in-scope list present and non-empty | PASS | |
| B-12 | Scope: out-of-scope list present and non-empty | PASS | Mirrors ADR-033 §8 DEFERRED items |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain | PASS | None used; two real ambiguities found (SlugChangeCapture name collision, `admin.` permission prefix) were resolved directly with authoritative sourcing and recorded as flagged deviations instead, per task instruction |
| B-14 | All Open Questions have owner + resolution date | PASS | OQ-01/02/03 each assign Software Architect + `/plan` dispatch as the resolution point |
| B-15 | Requirements section has ≥1 REQ-* | PASS | 26 requirements |
| B-16 | REQ-* items testable, no vague qualifiers | PASS | |
| B-17 | REQ-* items independently verifiable | PASS | |
| B-18 | Acceptance Criteria has ≥1 AC-* | PASS | 31 acceptance criteria |
| B-19 | Every REQ-* has ≥1 AC-* | PASS | Verified against traceability.spec.md Section 1 |
| B-20 | All AC-* follow Given/When/Then | PASS | |
| B-21 | All AC-* have [P1]/[P2]/[P3] tag | PASS | |
| B-22 | All P1 AC items independently testable | PASS | |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | |
| B-24 | Invariants section has ≥1 INV-* | PASS | 7 invariants |
| B-25 | INV-* written as absolute statements | PASS | |
| B-26 | Edge Cases section has ≥1 EC-* | PASS | 8 edge cases |
| B-27 | EC-* are concrete scenarios | PASS | |
| B-28 | EC-* have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete, no blank cells | PASS | |
| B-30 | Constitution Compliance table complete, all 8 articles marked | PASS | All COMPLIES |
| B-31 | Any EXCEPTION has a note in DoD/ADR | NA | No EXCEPTION rows exist in the Constitution Compliance table |
| B-32 | Implementation Readiness Gate checklist complete and PASS | PASS | See `feature.spec.md`'s own gate section |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use the type system, no comment-only behavior | PASS | |
| C-02 | Public interfaces/types have doc comments | PASS | Entity contracts in `state.spec.md`/`api.spec.md` are annotated inline with rationale |
| C-03 | Optional fields explicitly marked optional | PASS | |
| C-04 | Nullable fields have explicit nullable typing | PASS | |
| C-05 | No untyped/`any`/`object` escape hatches | PASS | `details: object|null` in the error envelope is the template's own standard shape, further specified per-code in errors.spec.md §3 |
| C-06 | Immutable constants marked per language idiom | NA | This spec is language-neutral `.spec.md` contracts, not source code; the underlying `src/redirects/types.ts` already uses readonly-style declarations where applicable |
| C-07 | API contract: all endpoints in a single registry constant | PASS | `api.spec.md` § 1 Endpoint Registry |
| C-08 | API contract: all error codes have HTTP status mapping | PASS | `errors.spec.md` § 2 |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | `ADMIN_SESSION` profile on every endpoint |
| C-10 | State contract: initial state covers all fields | PASS | `state.spec.md` § 1 |
| C-11 | State contract: transitions/actions cover all state-changing operations | PASS | `state.spec.md` § 3 |
| C-12 | State contract: invariants are falsifiable | PASS | `state.spec.md` § 5 |
| C-13 | Orchestrator contract: async outputs have explicit result type | NA | `orchestrator.spec.md` omitted (A-05) |
| C-14 | Orchestrator contract: invariants are falsifiable | NA | `orchestrator.spec.md` omitted (A-05) |
| C-15 | UI contract: all components have typed props/params | PASS | `ui.spec.md` § 2 |
| C-16 | UI contract: display conditions cover show/hide/disabled for every interactive element | PASS | `ui.spec.md` § 4 |
| C-17 | UI contract: accessibility requirements cover all components | PASS | `ui.spec.md` § 5 |
| C-18 | Error contract: all codes have HTTP status, retry eligibility, ownership, user message | PASS | `errors.spec.md` § 2/§4 |
| C-19 | Error contract: no error code missing from coverage requirements | PASS | |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field with multiple value sources | PASS | Match-type precedence (§1.1) + phase eligibility precedence (§1.2) |
| D-02 | Precedence rules ordered highest-first | PASS | |
| D-03 | Default Values table covers every non-obvious default | PASS | Includes the dynamic-rule cap default, flagged as an assumption pending OQ-01 |
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
| F-01 | Error codes in api.spec.md are a subset of errors.spec.md | PASS | Verified: `REDIRECT_NOT_FOUND`, `REDIRECT_VALIDATION_ERROR`, `REDIRECT_TARGET_NOT_ALLOWED`, `REDIRECT_CONFLICT`, `REDIRECT_LOOP_DETECTED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INTERNAL_ERROR` all appear in both |
| F-02 | Resource status types consistent across api/state/ui | PASS | `status: active|disabled`, `matchType: exact|prefix|wildcard(|regex reserved)`, `source: manual|auto_slug_change|import` identical everywhere they appear |
| F-03 | OrchestratorItem is a valid projection of state's FeatureItem | NA | No orchestrator contract (A-05) |
| F-04 | ItemSummary in ui.spec.md is a valid projection of OrchestratorItem | NA | No orchestrator layer; `ui.spec.md` components consume `RedirectRecord` directly from `state.spec.md`/`api.spec.md`, not an orchestrator-derived summary type |
| F-05 | Default values in orchestrator InputProps match behavior.spec.md Defaults | NA | No orchestrator contract (A-05) |
| F-06 | Rate limit values in api.spec.md match behavior.spec.md Limits | PASS | `api.spec.md` § 3 rate-limit profiles are documented-but-unenforced (matches every other admin route in this repo today); `behavior.spec.md` does not separately assert conflicting rate-limit numbers |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-009` / `FEAT-009-redirects` throughout |
| F-08 | All spec files have consistent version numbers | PASS | `1.0.0` throughout |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I: no custom impl where a library exists | PASS | See feature.spec.md Constitution Compliance table |
| G-02 | Article II: no implementation-order assumptions | PASS | Spec makes no claim implementation exists; TDD runs first |
| G-03 | Article III: every module traces to a requirement | PASS | |
| G-04 | Article IV: no speculative abstractions | PASS | `RedirectMatcher`/`RedirectHitSink` deliberately stay seams, not ports, per ADR-033's own ADR-006 accounting |
| G-05 | Article V: every P1 AC has an integration-test row (or pending) | PASS | All P1 rows in traceability.spec.md § 1 are `pending`, acceptable pre-TDD |
| G-06 | Article VI: api.spec.md auth present for all endpoints | PASS | `ADMIN_SESSION` on every endpoint in `api.spec.md` § 1 |
| G-07 | Article VII: spec_id + content_hash present/correct everywhere | PASS | |
| G-08 | Article VIII: errors.spec.md defines structured payloads with correlationId | PASS | Base error envelope § 1 of `errors.spec.md` |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | Implementation Readiness Gate: a new developer can implement from the spec-system package alone | PASS | The package explicitly names every real integration point this feature must wire into (`src/routing`'s `registerResolvePhase`/`SlugChangeCapture` slot, `src/origin`'s `isAllowedRedirectTarget`, `src/identity/permissions.ts`'s catalog pattern, the Menus admin-route/UI convention) with file paths, and flags the two real ambiguities found (SlugChangeCapture name collision; `admin.` permission-prefix inconsistency) as explicit, resolved-with-rationale deviations rather than leaving them for a developer to discover mid-implementation |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 9 | 0 | 1 |
| B: feature.spec.md Quality | 32 | 31 | 0 | 1 |
| C: Typed Contract Quality | 19 | 16 | 0 | 3 |
| D: Behavior Rules Quality | 10 | 10 | 0 | 0 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 5 | 0 | 3 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **88** | **0** | **8** |

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
| Spec Agent | Spec Agent | 2026-07-12T00:00:00Z | Spec Agent |
| Coordinator | Coordinator | 2026-07-13T00:00:00Z | Coordinator — reviewed both flagged deviations. SlugChangeCapture: concur, routing-owned shape is correct. Permission prefix: RESOLVED — `admin.redirects.manage` is the frozen, owner-decided convention per `sweep-crosscutting-decisions-20260710.md` line 71; no change needed. The real gap is retroactive (Menus/Members shipped without it) — flagged separately, not held against this spec |

> By signing, the Coordinator confirms:
> 1. All items in this checklist are PASS or NA with written justification.
> 2. The spec-system package is internally consistent.
> 3. The Implementation Readiness Gate (H-01) is PASS.
> 4. The spec is authorized for dispatch to the Software Architect Agent.
