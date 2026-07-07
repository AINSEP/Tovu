# Spec Definition of Done (DoD) Checklist: Admin Command Gateway — Auditable, Undoable Mutations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-001 |
| feature_name | FEAT-001-admin-command-gateway |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-02T20:45:00Z |
| reviewed_by | (Coordinator Planning Preflight — pending) |
| reviewed_date | (pending) |

---

## How to Use This Checklist

- Each item has a **Status** field: `PASS`, `FAIL`, or `NA`.
- **The spec is NOT ready for Software Architect dispatch until all items are PASS or NA.**

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | |
| A-02 | `feature.spec.md` is non-empty — all placeholder values replaced | PASS | |
| A-03 | `api.spec.md` is present | PASS | 3 new + 2 modified endpoints |
| A-04 | `state.spec.md` is present | PASS | Change-set rows + lifecycle |
| A-05 | `orchestrator.spec.md` present or NA | NA | Synchronous in-process gateway; no orchestration layer, no async coordinator state; existing outbox worker unchanged |
| A-06 | `ui.spec.md` present or NA | NA | No UI surface in this slice; undo UI is a separate frontend feature |
| A-07 | `errors.spec.md` is present | PASS | 5 new codes + 2 existing |
| A-08 | `behavior.spec.md` is present | PASS | Ordering/guard-precedence rules exist |
| A-09 | `traceability.spec.md` present, all REQ/AC rows populated | PASS | Status "pending implementation" per spec-stage rule |
| A-10 | `spec-manifest.md` present with actual filenames + omission justifications | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | First feature in reports/pipeline/ |
| B-02 | `version` correct semver | PASS | 1.0.0 |
| B-03 | `status` APPROVED | PASS | Human checkpoint still gates Red-Team/Architect dispatch |
| B-04 | `content_hash` computed per canonical rule | PASS | Written by validator `--update-hash` |
| B-05 | `feature_name` matches folder | PASS | FEAT-001-admin-command-gateway / 001-admin-command-gateway |
| B-06 | Zero `[NEEDS CLARIFICATION]` markers | PASS | 3 raised, 3 answered by owner 2026-07-02 |
| B-07 | Open Questions have owner + date | PASS | OQ-01…OQ-03 |
| B-08 | REQ items testable, no vague qualifiers | PASS | |
| B-09 | Every REQ has ≥1 AC | PASS | 12 REQ / 16 AC |
| B-10 | Every AC has priority tag | PASS | |
| B-11 | ACs in Given/When/Then | PASS | |
| B-12 | Invariants absolute + falsifiable | PASS | INV-01…INV-05 |
| B-13 | Edge cases have explicit expected behavior | PASS | EC-01…EC-07 |
| B-14 | Dependencies table complete | PASS | |
| B-15 | Constitution table complete | PASS | One recorded EXCEPTION (Art. VI — no auth layer yet) |
| B-16 | Overview present | PASS | |
| B-17 | Problem statement with why-now | PASS | |
| B-18 | User journey complete | PASS | |
| B-19 | Scope in/out lists non-empty | PASS | |
| B-20 | Success signal measurable | PASS | |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | 14×P1, 2×P2 |
| B-22 | All P1 AC items are independently testable | PASS | Each P1 AC states its own precondition |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | ACs reference contract fields from state.spec.md, not implementation internals |
| B-24 | Invariants section has at least one INV-* item | PASS | INV-01…INV-05 |
| B-25 | All INV-* items are absolute statements | PASS | "must always"/"must never" phrasing throughout |
| B-26 | Edge Cases section has at least one EC-* item | PASS | EC-01…EC-07 |
| B-27 | All EC-* items are concrete scenarios | PASS | Each is a "what happens when X" with a specific X |
| B-28 | All EC-* items have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION has a note in this DoD or the ADR | PASS | Art. VI exception noted at B-15/G-06: no auth layer exists in the dev server; permissions feature will replace AUTH_LOCAL_DEV before non-local deployment |
| B-32 | Implementation Readiness Gate in feature.spec.md complete and PASS | PASS | |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use typed shapes | PASS | YAML-typed contracts in api/state specs |
| C-02 | Public interfaces documented | PASS | |
| C-03 | Optional fields explicit | PASS | `nullable`/`|null` notation throughout |
| C-04 | Nullable fields explicitly typed | PASS | |
| C-05 | No untyped escape hatches | PASS | `inversePayload: object|null` is deliberately opaque (snapshot container) with per-entity shape owned by appliers — documented in state.spec.md |
| C-06 | Immutable constants marked | PASS | `entityVersionAtApply` immutability stated in state.spec.md §6 |
| C-07 | Endpoints in single registry | PASS | api.spec.md §1 |
| C-08 | All error codes have HTTP mapping | PASS | errors.spec.md §2 |
| C-09 | All endpoints have explicit auth requirements | PASS | `AUTH_LOCAL_DEV` with recorded Art. VI exception |
| C-10 | Initial state covers all fields | PASS | state.spec.md §1 |
| C-11 | Actions cover all state-changing ops | PASS | EXECUTE_COMMAND, REVERT_CHANGE_SET |
| C-12 | State invariants falsifiable | PASS | state.spec.md §6 |
| C-13 | Orchestrator async outputs typed | NA | orchestrator.spec.md omitted (A-05) |
| C-14 | Orchestrator invariants falsifiable | NA | orchestrator.spec.md omitted (A-05) |
| C-15 | UI components typed | NA | ui.spec.md omitted (A-06) |
| C-16 | UI display conditions covered | NA | ui.spec.md omitted (A-06) |
| C-17 | UI accessibility covered | NA | ui.spec.md omitted (A-06) |
| C-18 | Error codes complete (status/retry/ownership/message) | PASS | errors.spec.md §2, §4 |
| C-19 | No error code missing from coverage | PASS | traceability.spec.md §4 mirrors errors.spec.md |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover multi-source fields | PASS | BR-05 guard precedence; no other multi-source fields |
| D-02 | Precedence rules ordered | PASS | BR-05 numbered evaluation order |
| D-03 | Default values table covers non-obvious defaults | PASS | behavior.spec.md §3 |
| D-04 | Why column has rationale | PASS | |
| D-05 | Limits table covers behavior-affecting numerics | PASS | §4 |
| D-06 | Enforcement column filled | PASS | |
| D-07 | Duplicate defined precisely | PASS | DUP-01 |
| D-08 | Tie-break deterministic | PASS | TB-01 |
| D-09 | Edge table covers boundary values | PASS | §7 covers status/entity/applier/key boundaries |
| D-10 | Every behavior rule has traceability row | PASS | traceability.spec.md §5 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | |
| E-02 | Every REQ in §1 | PASS | REQ-01…REQ-12 |
| E-03 | Every AC in §1 | PASS | AC-01…AC-16 |
| E-04 | Every INV in §2 | PASS | INV-01…INV-05 |
| E-05 | Every EC in §3 | PASS | EC-01…EC-07 |
| E-06 | Every error code in §4 | PASS | 7 codes |
| E-07 | Pending rows acceptable at spec stage | PASS | All pending |
| E-08 | §7 Untraced empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors registry | PASS | |
| F-02 | Status enums consistent across files | PASS | applied/reverted (+reserved proposed/discarded) everywhere |
| F-03 | Orchestrator projection valid | NA | orchestrator.spec.md OMITTED per manifest — feature has no orchestration layer, so there is no OrchestratorItem to project |
| F-04 | UI projection valid | NA | ui.spec.md OMITTED per manifest — no UI surface in this slice, so there is no ItemSummary projection |
| F-05 | Orchestrator defaults match behavior table | NA | orchestrator.spec.md OMITTED per manifest — no InputProps exist to compare against behavior defaults |
| F-06 | Rate limits match limits table | PASS | Both record none-in-v1 |
| F-07 | Same spec_id/feature_name in all files | PASS | SPEC-001 / FEAT-001-admin-command-gateway |
| F-08 | Version numbers consistent | PASS | 1.0.0 everywhere |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Library-First respected | PASS | Justified custom core module |
| G-02 | Test-First assumed | PASS | TDD before Programmer; pre-pipeline draft flagged as reconcilable input in manifest |
| G-03 | Modules trace to requirements | PASS | |
| G-04 | No speculative abstraction | PASS | ChangeSetRepoPort passes ADR-006 rule-of-two (memory + planned SQLite) |
| G-05 | P1 ACs have integration-test rows | PASS | Pending status at spec stage per E-07 |
| G-06 | Auth requirements present per endpoint | PASS | Explicit AUTH_LOCAL_DEV profile with recorded exception |
| G-07 | spec_id + hash present in all files | PASS | Contract files reference feature.spec.md as hash of record |
| G-08 | Structured errors with correlation | PASS | changeSetId as feature-scope correlation id; full correlationId deferred, noted in errors.spec.md §1 |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate** — a new developer can implement from the package alone | PASS | Package specifies write path, storage, endpoints, errors, ordering rules, and wiring targets with concrete file references |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 8 | 0 | 2 |
| B: feature.spec.md Quality | 32 | 32 | 0 | 0 |
| C: Typed Contract Quality | 19 | 14 | 0 | 5 |
| D: Behavior Rules Quality | 10 | 10 | 0 | 0 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 6 | 0 | 2 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **87** | **0** | **9** |

**Overall DoD Result:** PASS

---

## Sign-Off Block

| Role | Name/Agent | Date | Result |
|------|-----------|------|--------|
| Spec Agent | Spec Agent (Claude Fable 5, AI Dev Shop pipeline) | 2026-07-02T20:45:00Z | PASS — ready for human spec checkpoint, then Red-Team |
| Coordinator | | | |
