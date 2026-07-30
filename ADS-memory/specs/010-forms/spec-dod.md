# Spec Definition of Done (DoD) Checklist: forms

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-010 |
| feature_name | FEAT-010-forms |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-13T00:00:00Z |
| reviewed_by | (Coordinator — Planning Preflight, pending) |
| reviewed_date | |

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | |
| A-03 | `api.spec.md` is present | PASS | 7 admin endpoints + 1 public submission endpoint |
| A-04 | `state.spec.md` is present | PASS | Two new tables (`form_definitions`, `form_submissions`) |
| A-05 | `orchestrator.spec.md` is present (or explicitly marked NA with justification) | NA | No distinct orchestrator layer in this codebase's admin app (see `spec-manifest.md` applicability matrix) |
| A-06 | `ui.spec.md` is present | PASS | Forms list, form editor + fields editor, submissions list+detail |
| A-07 | `errors.spec.md` is present | PASS | 6 new + 3 shared codes |
| A-08 | `behavior.spec.md` is present | PASS | Immutability rules, honeypot discard rule, defaults, limits, tie-break all present |
| A-09 | `traceability.spec.md` is present and all REQ-*/AC-* rows are populated | PASS | All rows populated, status PENDING (expected pre-implementation) |
| A-10 | `spec-manifest.md` is present and records actual filenames plus omitted files with justification | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` is assigned and unique | PASS | SPEC-010; verified `ADS-memory/reports/pipeline/` had no prior `010-*` folder before this run |
| B-02 | `version` is set to correct semver | PASS | 1.0.0, new spec |
| B-03 | `status` is APPROVED | PASS | |
| B-04 | `content_hash` is computed and recorded | PASS | `sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e`, computed and written by the provider-local validator (`--phase spec --update-hash`) |
| B-05 | `feature_name` matches the FEAT folder name exactly | PASS | `FEAT-010-forms` matches folder `010-forms` |
| B-06 | `last_edited` is a valid ISO-8601 UTC timestamp | PASS | |
| B-07 | `owner` is set to a named human or team | PASS | Leona Burime |
| B-08 | Overview section is present and describes the feature in 1–3 sentences | PASS | |
| B-09 | Problem Statement is present with Current state, Desired state, Why now, and Success signal | PASS | |
| B-10 | User Journey section is present with Trigger, Steps, Outcome, and Alternate paths | PASS | |
| B-11 | Scope: In-scope list is present and non-empty | PASS | |
| B-12 | Scope: Out-of-scope list is present and non-empty | PASS | 8 explicit exclusions, matching AW-7's own "keep v1 tight" instruction |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain anywhere in `feature.spec.md` | PASS | Zero markers; the one real ambiguity (whether Forms is an installable Tier-1 package or a bundled module) is resolved directly in Scope/Dependencies/OQ-01, not left as a marker |
| B-14 | All Open Questions have an owner AND a resolution target date | PASS | OQ-01 (Coordinator/Software Architect, resolve before a second Tier-1 sample), OQ-02/OQ-03 (Software Architect, 2026-07-20) |
| B-15 | Requirements section has at least one REQ-* item | PASS | 16 requirements |
| B-16 | All REQ-* items are observable and testable — no vague qualifiers | PASS | |
| B-17 | All REQ-* items are independently verifiable | PASS | |
| B-18 | Acceptance Criteria section has at least one AC-* item | PASS | 24 acceptance criteria |
| B-19 | Every REQ-* has at least one corresponding AC-* | PASS | Verified against `traceability.spec.md` §1 |
| B-20 | All AC-* items follow Given/When/Then format | PASS | |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | |
| B-22 | All P1 AC items are independently testable | PASS | Each targets one HTTP route or one pure observable outcome |
| B-23 | No AC item requires knowledge of the implementation to evaluate | PASS | All phrased in terms of request/response or observable state |
| B-24 | Invariants section has at least one INV-* item | PASS | 8 invariants |
| B-25 | All INV-* items are written as absolute statements | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | 9 edge cases |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have an explicit Expected Behavior | PASS | |
| B-29 | Dependencies table is complete — no blank Failure Mode or Fallback cells | PASS | 5 dependency rows, all cells filled, including the explicitly-named plugin-loader gap |
| B-30 | Constitution Compliance table is complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION in the Constitution Compliance table has a note | PASS | Article VI EXCEPTION explained inline (standing v1 dev-auth exception, distinct from the deliberate public-submission-route decision) |
| B-32 | Implementation Readiness Gate checklist in `feature.spec.md` is complete and shows PASS | PASS | |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | All contract files use the language's type system — no behavior defined only in comments | PASS | `state.spec.md`/`api.spec.md` use YAML schema blocks throughout |
| C-02 | All public interfaces and types have doc comments | PASS | Every entity block is annotated inline or via surrounding prose |
| C-03 | All optional fields are explicitly marked as optional | PASS | `?`/`required: false` used consistently |
| C-04 | Nullable fields have explicit nullable typing | PASS | |
| C-05 | No untyped / `any` / `object` escape hatches | PASS | `data: object` on `FormSubmission` is intentionally open (field id → string/boolean per a caller-defined vocabulary), matching the same open-JSON pattern SEO's `JsonLd`/errors' `details: object` already used, not an escape hatch introduced by this spec |
| C-06 | Immutable constants are marked as such | NA | Spec-level YAML/markdown contracts have no language-level const idiom; the equivalent (fixed field-type enum, fixed rate-limit values) is expressed as literal values in `behavior.spec.md` §4 |
| C-07 | API contract: all endpoints are registered in a single registry constant | PASS | `api.spec.md` §1 Endpoint Registry |
| C-08 | API contract: all error codes have an HTTP status mapping | PASS | `errors.spec.md` §2 |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | `api.spec.md` §2, incl. explicit `FORMS_PUBLIC` for the one public route |
| C-10 | State contract: initial state covers all fields | PASS | `state.spec.md` §1 |
| C-11 | State contract: transitions/actions cover all state-changing operations | PASS | `state.spec.md` §3 |
| C-12 | State contract: invariants are falsifiable statements | PASS | `state.spec.md` §5 |
| C-13 | Orchestrator contract: all async outputs have an explicit result type | NA | `orchestrator.spec.md` omitted (Section A-05) |
| C-14 | Orchestrator contract: invariants are falsifiable statements | NA | Same as C-13 |
| C-15 | UI contract: all components have a typed props/params definition | PASS | `ui.spec.md` §2 |
| C-16 | UI contract: display conditions cover show/hide/disabled state for every interactive element | PASS | `ui.spec.md` §4 |
| C-17 | UI contract: accessibility requirements cover all components | PASS | `ui.spec.md` §5 |
| C-18 | Error contract: all error codes have entries for HTTP status, retry eligibility, ownership, and user message guidance | PASS | `errors.spec.md` §2/§4 |
| C-19 | Error contract: no error code is missing from coverage requirements | PASS | Cross-checked against `api.spec.md` §6 |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field that can receive a value from multiple sources | NA | Forms has no multi-source precedence chain (unlike SEO's override▸default▸derived) — `behavior.spec.md` §1 instead documents the two immutability rules, which is the closest analog this feature has, and is explicitly labeled as such |
| D-02 | Precedence rules are ordered — highest priority source is first | NA | Same as D-01 |
| D-03 | Default Values table covers every field with a non-obvious default | PASS | `behavior.spec.md` §3, 5 rows |
| D-04 | "Why" column in Default Values table contains a rationale — not just a restatement | PASS | |
| D-05 | Limits and Bounds table covers every numeric constraint that affects behavior | PASS | `behavior.spec.md` §4 |
| D-06 | Enforcement column in Limits table specifies where each constraint is checked | PASS | All API-enforced |
| D-07 | Deduplication rules define "duplicate" precisely | PASS | `behavior.spec.md` §5 explicitly states Forms has no duplicate-submission concept in v1 and instead defines the honeypot-trip condition precisely |
| D-08 | Tie-break logic is deterministic | PASS | `behavior.spec.md` §6.1 |
| D-09 | Edge Case Handling table covers all boundary values from the Limits table | PASS | `behavior.spec.md` §7 covers the 20/21-field, 10/11-recipient, and 5th/6th-submission boundaries |
| D-10 | Every behavior rule in behavior.spec.md has a corresponding row in traceability.spec.md Section 5 | PASS | Cross-checked |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md is present | PASS | |
| E-02 | Every REQ-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | 16/16 |
| E-03 | Every AC-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | 24/24 |
| E-04 | Every INV-* from feature.spec.md appears in traceability.spec.md Section 2 | PASS | 8/8 |
| E-05 | Every EC-* from feature.spec.md appears in traceability.spec.md Section 3 | PASS | 9/9 |
| E-06 | Every error code from errors.spec.md appears in traceability.spec.md Section 4 | PASS | 9/9 |
| E-07 | Rows with "pending" status are acceptable at spec stage | PASS | Entire matrix is PENDING, expected before TDD |
| E-08 | Section 7 (Untraced Requirements) is empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | Error codes in api.spec.md match (are a subset of or equal to) error codes in errors.spec.md | PASS | |
| F-02 | Resource status types in api.spec.md, state.spec.md, orchestrator.spec.md, and ui.spec.md are consistent | PASS | `FormDefinition`/`FormSubmission` field names and enums (`status`, field `type` vocabulary) match across `api.spec.md`/`state.spec.md`/`ui.spec.md`; `orchestrator.spec.md` omitted |
| F-03 | OrchestratorItem fields are a valid projection of FeatureItem in state.spec.md | NA | `orchestrator.spec.md` omitted |
| F-04 | ItemSummary fields in ui.spec.md are a valid projection of OrchestratorItem | NA | `orchestrator.spec.md` omitted; `ui.spec.md` projects directly from `state.spec.md`/`api.spec.md` |
| F-05 | Default values in orchestrator.spec.md match behavior.spec.md | NA | `orchestrator.spec.md` omitted |
| F-06 | Rate limit values in api.spec.md match the Limits and Bounds table in behavior.spec.md | PASS | `api.spec.md` §3 `FORMS_SUBMIT` (5/60s per `(ip, formId)`) matches `behavior.spec.md` §4 exactly |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-010`/`FEAT-010-forms` throughout |
| F-08 | All spec files have consistent version numbers | PASS | `1.0.0` throughout |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First): spec does not specify custom implementations where libraries exist | PASS | See `feature.spec.md` Constitution Compliance — no library gap exists for the small, closed validation/rate-limit/honeypot logic this feature needs |
| G-02 | Article II (Test-First): spec makes no assumptions about implementation order | PASS | |
| G-03 | Article III (Simplicity Gate): every module referenced in contract files traces to a requirement | PASS | See `feature.spec.md` Constitution Compliance table row III |
| G-04 | Article IV (Anti-Abstraction Gate): no speculative abstractions in contract files | PASS | No new port introduced; Forms consumes `MailerPort` and the outbox/webhook mechanism by handle, consistent with the existing Rule-of-Two discipline |
| G-05 | Article V (Integration-First Testing): every P1 AC has a corresponding integration test row in traceability.spec.md | PASS | All P1 rows present, status PENDING (pre-TDD) |
| G-06 | Article VI (Security-by-Default): api.spec.md auth requirements are present for all endpoints; no endpoint is unauthenticated without explicit NA justification | PASS | `api.spec.md` §2 documents `FORMS_PUBLIC` explicitly and justifies it (a public contact form must be reachable by any site visitor) |
| G-07 | Article VII (Spec Integrity): spec_id and content_hash are present and correct in all spec files | PASS | `content_hash` verified via the provider-local validator's `--phase spec --update-hash` run |
| G-08 | Article VIII (Observability): errors.spec.md defines structured error payloads with correlationId for all server-side errors | PASS | `errors.spec.md` §1 envelope includes `correlationId` (deferred/`null` per the existing Article VIII deferral pattern) |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate:** A new developer who has never worked on this codebase can read the spec-system package and implement the feature from these specs alone — without asking clarifying questions about scope, behavior, error handling, state, or UI contract. | PASS | The one genuine architectural tension this feature faces (Forms is described as a Tier-1 "install from anyone" plugin, but no such installable-package runtime exists in this codebase) is resolved concretely in Scope/Dependencies/OQ-01 — Forms ships as a bundled, hand-wired core module, matching the SEO/Redirects precedent — not left as an unresolved ambiguity. Zero `[NEEDS CLARIFICATION]` markers remain. All three Open Questions are non-blocking. |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 9 | 0 | 1 |
| B: feature.spec.md Quality | 32 | 32 | 0 | 0 |
| C: Typed Contract Quality | 19 | 16 | 0 | 3 |
| D: Behavior Rules Quality | 10 | 8 | 0 | 2 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 5 | 0 | 3 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **87** | **0** | **9** |

**Overall DoD Result:** PASS

---

## Blocking Issues (if FAIL)

None. No FAIL items. `content_hash` was computed and written by
`validate_spec_package.py --phase spec --update-hash` (see B-04/G-07).

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Spec Agent | 2026-07-13T00:00:00Z | Spec Agent — FEAT-010-forms v1.0.0 |
| Coordinator | Coordinator | 2026-07-13T00:00:00Z | Coordinator — concur with the plugin-loader-gap finding (OQ-01); confirm Forms ships as a hand-wired bundled core module for now, not a true Tier-1 installable plugin, until a manifest loader exists |

> By signing, the Coordinator confirms:
> 1. All items in this checklist are PASS or NA with written justification.
> 2. The spec-system package is internally consistent.
> 3. The Implementation Readiness Gate (H-01) is PASS.
> 4. The spec is authorized for dispatch to the Software Architect Agent.
