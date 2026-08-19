# Spec Definition of Done (DoD) Checklist: esm-migration

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-049 |
| feature_name | FEAT-049-esm-migration |
| version | 1.1.0 |
| filled_by | Spec Agent |
| filled_date | 2026-08-18T04:00:00Z (revised — both clarification markers resolved) |
| reviewed_by | (Coordinator — Planning Preflight, not yet run; dispatch intentionally held per Coordinator instruction) |
| reviewed_date | |

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | The 2 remaining `[NEEDS CLARIFICATION]` markers (REQ-08, REQ-10) are intentional, real blocking markers — not unfilled template placeholders. |
| A-03 | `api.spec.md` is present (or explicitly marked NA with justification) | NA | Omitted — no API surface. Justification in `spec-manifest.md`. |
| A-04 | `state.spec.md` is present (or explicitly marked NA with justification) | NA | Omitted — no durable/stateful data contract. Justification in `spec-manifest.md`. |
| A-05 | `orchestrator.spec.md` is present (or explicitly marked NA with justification) | NA | Omitted — no coordinator/orchestrator layer. Justification in `spec-manifest.md`. |
| A-06 | `ui.spec.md` is present (or explicitly marked NA with justification) | NA | Omitted — no UI surface. Justification in `spec-manifest.md`. |
| A-07 | `errors.spec.md` is present (or explicitly marked NA with justification) | NA | Omitted — no new product-facing error codes. Justification in `spec-manifest.md`. |
| A-08 | `behavior.spec.md` is present (or explicitly marked NA with justification) | PASS | Present — ordering rules govern this feature (§2). |
| A-09 | `traceability.spec.md` is present and all REQ-* and AC-* rows are populated | PASS | All rows populated, status PENDING (pre-TDD, expected). |
| A-10 | `spec-manifest.md` is present and records actual filenames plus omitted files with justification | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` is assigned and unique | PASS | SPEC-049; verified against existing `ADS-memory/reports/pipeline/` (highest prior: 043) and `ADS-memory/specs/` (highest prior: 048) folders. |
| B-02 | `version` is set to correct semver (1.0.0 for new specs) | PASS | |
| B-03 | `status` is APPROVED (not DRAFT or REVIEW) | PASS | Status is APPROVED as of v1.1.0 — both REQ-08 and REQ-10 clarifications resolved by human decision, 2026-08-18. |
| B-04 | `content_hash` is computed and recorded | PASS | `sha256:d5304d10208cfb1b06d327380bf47fc248d8a46242cca25d26fda4f4ad050d0c`, computed by `validate_spec_package.py --update-hash` and propagated to `behavior.spec.md` and `traceability.spec.md`. |
| B-05 | `feature_name` matches the FEAT folder name exactly | PASS | `FEAT-049-esm-migration` matches folder `049-esm-migration`. |
| B-06 | `last_edited` is a valid ISO-8601 UTC timestamp | PASS | |
| B-07 | `owner` is set to a named human or team | PASS | Leona Burime (repo git user / project owner, per session environment context). |
| B-08 | Overview section is present and describes the feature in 1–3 sentences | PASS | |
| B-09 | Problem Statement is present with Current state, Desired state, Why now, and Success signal | PASS | "Why now" answer is explicitly "no deadline, technical-debt initiative." |
| B-10 | User Journey section is present with Trigger, Steps, Outcome, and Alternate paths | PASS | |
| B-11 | Scope: In-scope list is present and non-empty | PASS | |
| B-12 | Scope: Out-of-scope list is present and non-empty | PASS | |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain anywhere in `feature.spec.md` | PASS | Both markers resolved 2026-08-18: REQ-08 (Node 24 Phase 0), REQ-10 (`packages/*` in scope, `packages/sdk` pre-migrated no-op). Zero markers remain in v1.1.0. |
| B-14 | All Open Questions have an owner AND a resolution target date | PASS | OQ-01 — Owner: Software Architect, Resolve by: 2026-08-25. |
| B-15 | Requirements section has at least one REQ-* item | PASS | 11 requirements (REQ-01–REQ-11). |
| B-16 | All REQ-* items are observable and testable — no vague qualifiers | PASS | |
| B-17 | All REQ-* items are independently verifiable | PASS | |
| B-18 | Acceptance Criteria section has at least one AC-* item | PASS | 13 ACs (AC-01–AC-13). |
| B-19 | Every REQ-* has at least one corresponding AC-* | PASS | |
| B-20 | All AC-* items follow Given/When/Then format | PASS | |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | 12 P1, 1 P2 (AC-05). |
| B-22 | All P1 AC items are independently testable | PASS | |
| B-23 | No AC item requires knowledge of the implementation to evaluate | PASS | |
| B-24 | Invariants section has at least one INV-* item | PASS | 5 invariants (INV-01–INV-05). |
| B-25 | All INV-* items are written as absolute statements | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | 5 edge cases (EC-01–EC-05). |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have an explicit Expected Behavior | PASS | |
| B-29 | Dependencies table is complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table is complete — all 8 articles marked | PASS | 4 COMPLIES, 4 N/A, 0 EXCEPTION. |
| B-31 | Any EXCEPTION in the Constitution Compliance table has a note in this DoD or the ADR | NA | No article is marked EXCEPTION — nothing to note. |
| B-32 | Implementation Readiness Gate checklist in `feature.spec.md` is complete and shows PASS | PASS | Checklist is complete and its own Gate result is PASS as of v1.1.0. |

---

## Section C: Typed Contract Quality

*Mark NA per template rule — feature has no typed contract files (api/state/orchestrator/ui/errors all OMITTED, justified in `spec-manifest.md`).*

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | All contract files use the language's type system | NA | No typed contract files exist in this package. |
| C-02 | All public interfaces and types have doc comments | NA | No typed contract files exist in this package. |
| C-03 | All optional fields are explicitly marked as optional | NA | No typed contract files exist in this package. |
| C-04 | Nullable fields have explicit nullable typing | NA | No typed contract files exist in this package. |
| C-05 | No untyped / `any` / `object` escape hatches | NA | No typed contract files exist in this package. |
| C-06 | Immutable constants are marked as such | NA | No typed contract files exist in this package. |
| C-07 | API contract: all endpoints registered in a single registry constant | NA | No API contract exists — `api.spec.md` is OMITTED. |
| C-08 | API contract: all error codes have an HTTP status mapping | NA | No API contract exists — `api.spec.md` is OMITTED. |
| C-09 | API contract: all endpoints have explicit auth requirements | NA | No API contract exists — `api.spec.md` is OMITTED. |
| C-10 | State contract: initial state covers all fields | NA | No state contract exists — `state.spec.md` is OMITTED. |
| C-11 | State contract: transitions/actions cover all state-changing operations | NA | No state contract exists — `state.spec.md` is OMITTED. |
| C-12 | State contract: invariants are falsifiable statements | NA | No state contract exists — `state.spec.md` is OMITTED. |
| C-13 | Orchestrator contract: all async outputs have an explicit result type | NA | No orchestrator contract exists — `orchestrator.spec.md` is OMITTED. |
| C-14 | Orchestrator contract: invariants are falsifiable statements | NA | No orchestrator contract exists — `orchestrator.spec.md` is OMITTED. |
| C-15 | UI contract: all components have a typed props/params definition | NA | No UI contract exists — `ui.spec.md` is OMITTED. |
| C-16 | UI contract: display conditions cover show/hide/disabled state | NA | No UI contract exists — `ui.spec.md` is OMITTED. |
| C-17 | UI contract: accessibility requirements cover all components | NA | No UI contract exists — `ui.spec.md` is OMITTED. |
| C-18 | Error contract: all error codes have entries for HTTP status, retry, ownership, user message | NA | No error contract exists — `errors.spec.md` is OMITTED. |
| C-19 | Error contract: no error code is missing from coverage requirements | NA | No error contract exists — `errors.spec.md` is OMITTED. |

---

## Section D: Behavior Rules Quality

*`behavior.spec.md` is present — this section applies for real, but several of its subsections were themselves marked N/A within `behavior.spec.md` because their subject matter (precedence, defaults, limits, dedup, tie-break) does not apply to this feature.*

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field that can receive a value from multiple sources | NA | No precedence rules apply — no field in this migration has multiple competing value sources (`behavior.spec.md` §1). |
| D-02 | Precedence rules are ordered — highest priority source is first | NA | Same reason as D-01. |
| D-03 | Default Values table covers every field with a non-obvious default | NA | No configuration/API/UI fields with defaults exist in this feature (`behavior.spec.md` §3). |
| D-04 | "Why" column in Default Values table contains a rationale | NA | Same reason as D-03. |
| D-05 | Limits and Bounds table covers every numeric constraint that affects behavior | NA | The feature's numeric facts are evidence citations from `MIGRATION-esm-2026-08-18.md`, not enforceable behavior limits — cited by reference per `behavior.spec.md` §4, not restated in table form. |
| D-06 | Enforcement column in Limits table specifies where each constraint is checked | NA | Same reason as D-05 — no Limits table in this feature. |
| D-07 | Deduplication rules define "duplicate" precisely | NA | No deduplication logic (`behavior.spec.md` §5). |
| D-08 | Tie-break logic is deterministic | NA | No tie-break scenario — independent waves have no "winner" to determine (`behavior.spec.md` §6). |
| D-09 | Edge Case Handling table covers all boundary values from the Limits table | NA | No Limits table exists (D-05); the Edge Case Handling table instead maps 1:1 to the Ordering Rules in §2, covered by D-10. |
| D-10 | Every behavior rule in behavior.spec.md has a corresponding row in traceability.spec.md Section 5 | PASS | All 2 ordering rules (§2.1, §2.2) and all 10 EARS edge-case rows (§7) have matching rows in `traceability.spec.md` §5. |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md is present | PASS | |
| E-02 | Every REQ-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | REQ-01 through REQ-11, all present. |
| E-03 | Every AC-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | AC-01 through AC-13, all present. |
| E-04 | Every INV-* from feature.spec.md appears in traceability.spec.md Section 2 | PASS | INV-01 through INV-05, all present. |
| E-05 | Every EC-* from feature.spec.md appears in traceability.spec.md Section 3 | PASS | EC-01 through EC-05, all present. |
| E-06 | Every error code from errors.spec.md appears in traceability.spec.md Section 4 | NA | `errors.spec.md` OMITTED — no error codes to trace. |
| E-07 | Rows with "pending" status are acceptable at spec stage | PASS | All rows are PENDING, as expected pre-TDD. |
| E-08 | Section 7 (Untraced Requirements) is empty | PASS | Confirmed empty. |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | Error codes in api.spec.md match errors.spec.md | NA | Neither file exists in this package. |
| F-02 | Resource status types consistent across api/state/orchestrator/ui | NA | None of those files exist in this package. |
| F-03 | OrchestratorItem fields are a valid projection of FeatureItem in state.spec.md | NA | Neither `orchestrator.spec.md` nor `state.spec.md` exists in this package. |
| F-04 | ItemSummary fields are a valid projection of OrchestratorItem | NA | Neither `ui.spec.md` nor `orchestrator.spec.md` exists in this package. |
| F-05 | Default values in orchestrator.spec.md match behavior.spec.md Defaults table | NA | `orchestrator.spec.md` does not exist; `behavior.spec.md`'s Defaults table is itself N/A. |
| F-06 | Rate limit values in api.spec.md match behavior.spec.md Limits table | NA | Neither exists in a form with rate limits. |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-049` / `FEAT-049-esm-migration` consistent across all 5 present files. |
| F-08 | All spec files have consistent version numbers | PASS | `1.0.0` across all 5 present files. |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First): spec does not specify custom implementations where libraries exist | PASS | Uses Node/TypeScript's native ESM support; no custom module-loader built. |
| G-02 | Article II (Test-First): spec makes no assumptions about implementation order | PASS | REQ-05's verification gate is stated as an outcome requirement, not an implementation-order prescription. |
| G-03 | Article III (Simplicity Gate): every module referenced in contract files traces to a requirement | PASS | Every named module (Wave 1's 5 sub-modules, `core`) traces to REQ-02 or REQ-03. |
| G-04 | Article IV (Anti-Abstraction Gate): no speculative abstractions in contract files | PASS | No new abstractions introduced; `behavior.spec.md` defines rules, not interfaces. |
| G-05 | Article V (Integration-First Testing): every P1 AC has an integration test row in traceability (or "pending") | PASS | All P1 ACs have PENDING rows in `traceability.spec.md` Section 1 — acceptable per E-07. |
| G-06 | Article VI (Security-by-Default): api.spec.md auth requirements present for all endpoints | NA | No `api.spec.md` — no endpoints exist in this feature. |
| G-07 | Article VII (Spec Integrity): spec_id and content_hash present and correct in all spec files | PASS | `spec_id` (`SPEC-049`) is present and correct everywhere; `content_hash` is now the validator-computed value, propagated to `feature.spec.md`, `behavior.spec.md`, and `traceability.spec.md`. |
| G-08 | Article VIII (Observability): errors.spec.md defines structured error payloads with correlationId | NA | No `errors.spec.md` — REQ-06 requires observability to stay unchanged, not to be extended with new error payloads. |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate:** A new developer who has never worked on this codebase can read the spec-system package and implement the feature from these specs alone — without asking clarifying questions about scope, behavior, error handling, state, or UI contract. | PASS | REQ-08 now states the concrete Phase 0 mechanism (Node 24 bump, `engines.node`, Dockerfile `NODE_VERSION`) and its verification criteria; REQ-10 now states `packages/*`'s concrete scope and the pre-migrated-no-op treatment for `packages/sdk`. A new developer can implement Wave 1 from this package without asking either question. |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 5 | 0 | 5 |
| B: feature.spec.md Quality | 32 | 31 | 0 | 1 |
| C: Typed Contract Quality | 19 | 0 | 0 | 19 |
| D: Behavior Rules Quality | 10 | 1 | 0 | 9 |
| E: Traceability Quality | 8 | 7 | 0 | 1 |
| F: Internal Consistency | 8 | 2 | 0 | 6 |
| G: Constitution Compliance | 8 | 6 | 0 | 2 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **53** | **0** | **43** |

**Overall DoD Result:** PASS

> PASS — All items are PASS or NA, each NA with written justification. Both `[NEEDS CLARIFICATION]` markers (REQ-08, REQ-10) were resolved by human decision on 2026-08-18: REQ-08 → Node 24 bump as Phase 0 (Option A); REQ-10 → `packages/*` in scope, with `packages/sdk` treated as a pre-migrated no-op (already `"type": "module"`, zero outward `#src/`-internal dependencies, one-way consumer relationship verified by direct grep). Spec is ready for Software Architect dispatch — pending only the Coordinator's Planning Preflight sign-off below, which per explicit instruction is intentionally held until the human resumes this work.

---

## Blocking Issues (if FAIL)

None. Both prior blocking issues (REQ-08, REQ-10 clarification markers) were resolved by human decision on 2026-08-18 — see the Revision note in `feature.spec.md`'s Header Metadata section.

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Spec Agent | 2026-08-18T04:00:00Z | Spec Agent |
| Coordinator | | | |

> By signing, the Coordinator confirms:
> 1. All items in this checklist are PASS or NA with written justification.
> 2. The spec-system package is internally consistent.
> 3. The Implementation Readiness Gate (H-01) is PASS.
> 4. The spec is authorized for dispatch to the Software Architect Agent.
>
> **The Coordinator row is intentionally left blank.** Not because the package is unready — all clarification markers are resolved and H-01 is PASS — but per explicit Coordinator instruction: the human is stepping away and does not want Red-Team or Software Architect dispatch pushed forward yet. This row is reserved for Coordinator Planning Preflight, to be completed whenever the human resumes this work.
