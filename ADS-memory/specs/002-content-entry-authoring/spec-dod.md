# Spec Definition of Done (DoD) Checklist: Content Entry Authoring — Create and Edit Pages + Posts

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-002 |
| feature_name | FEAT-002-content-entry-authoring |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-07T02:05:00Z |
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
| A-03 | `api.spec.md` is present | PASS | 5 new endpoints + 6 modified surfaces |
| A-04 | `state.spec.md` is present | PASS | `kind` extension + create action + Drizzle migration/seed contract (R1) |
| A-05 | `orchestrator.spec.md` present or NA | NA | Synchronous request/response only; no async orchestration; existing outbox worker unchanged |
| A-06 | `ui.spec.md` present or NA | PASS | Admin authoring surfaces are in scope (owner call 2026-07-06) |
| A-07 | `errors.spec.md` is present | PASS | 3 new codes + 3 carried over |
| A-08 | `behavior.spec.md` is present | PASS | Slug derivation, validation ordering, kind guard, tie-break |
| A-09 | `traceability.spec.md` present, all REQ/AC rows populated | PASS | Status "pending implementation" per spec-stage rule |
| A-10 | `spec-manifest.md` present with actual filenames + omission justifications | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | SPEC-002; only SPEC-001 exists |
| B-02 | `version` correct semver | PASS | 1.0.0 |
| B-03 | `status` APPROVED | PASS | 4 `[NEEDS CLARIFICATION]` raised, 4 answered by owner 2026-07-06; human checkpoint still gates Red-Team/Architect dispatch |
| B-04 | `content_hash` computed per canonical rule | PASS | Written by validator `--update-hash` |
| B-05 | `feature_name` matches folder | PASS | FEAT-002-content-entry-authoring / 002-content-entry-authoring |
| B-06 | Zero `[NEEDS CLARIFICATION]` markers | PASS | |
| B-07 | Open Questions have owner + date | PASS | OQ-01…OQ-04 |
| B-08 | REQ items testable, no vague qualifiers | PASS | |
| B-09 | Every REQ has ≥1 AC | PASS | 12 REQ / 20 AC |
| B-10 | Every AC has priority tag | PASS | |
| B-11 | ACs in Given/When/Then | PASS | |
| B-12 | Invariants absolute + falsifiable | PASS | INV-01…INV-06 |
| B-13 | Edge cases have explicit expected behavior | PASS | EC-01…EC-10 |
| B-14 | Dependencies table complete | PASS | Includes SPEC-001 implementation-prerequisite row |
| B-15 | Constitution table complete | PASS | One carried-over EXCEPTION (Art. VI — no auth layer yet) |
| B-16 | Overview present | PASS | Includes owner-requested consequences of the unified-kind decision |
| B-17 | Problem statement with why-now | PASS | |
| B-18 | User journey complete | PASS | |
| B-19 | Scope in/out lists non-empty | PASS | |
| B-20 | Success signal measurable | PASS | |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | 14×P1, 6×P2 |
| B-22 | All P1 AC items are independently testable | PASS | Each P1 AC states its own precondition |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | ACs reference contract fields from api/state specs |
| B-24 | Invariants section has at least one INV-* item | PASS | INV-01…INV-06 |
| B-25 | All INV-* items are absolute statements | PASS | "must always"/"must never" phrasing |
| B-26 | Edge Cases section has at least one EC-* item | PASS | EC-01…EC-10 |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION has a note in this DoD or the ADR | PASS | Art. VI carried over from SPEC-001 (B-15): no auth layer in the dev server; permissions feature replaces AUTH_LOCAL_DEV before non-local deployment |
| B-32 | Implementation Readiness Gate in feature.spec.md complete and PASS | PASS | |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use typed shapes | PASS | YAML-typed contracts in api/state/ui specs |
| C-02 | Public interfaces documented | PASS | |
| C-03 | Optional fields explicit | PASS | create-body optionality + defaults stated per field |
| C-04 | Nullable fields explicitly typed | PASS | `code: string\|null`, `inversePayload: null` profile |
| C-05 | No untyped escape hatches | PASS | `bodyJson: object` is deliberately opaque (TipTap document container) — same call as SPEC-001's inversePayload; validated as JSON object at the boundary |
| C-06 | Immutable constants marked | PASS | `kind` immutability (INV-02, state.spec.md §2/§4) |
| C-07 | Endpoints in single registry | PASS | api.spec.md §1 |
| C-08 | All error codes have HTTP mapping | PASS | errors.spec.md §2 |
| C-09 | All endpoints have explicit auth requirements | PASS | `AUTH_LOCAL_DEV` with carried-over Art. VI exception; site routes marked public |
| C-10 | Initial state covers all fields | PASS | state.spec.md §1/§2 incl. migration defaults |
| C-11 | Actions cover all state-changing ops | PASS | CREATE_ENTRY, UPDATE_ENTRY (extended) |
| C-12 | State invariants falsifiable | PASS | state.spec.md §6 |
| C-13 | Orchestrator async outputs typed | NA | orchestrator.spec.md omitted (A-05) |
| C-14 | Orchestrator invariants falsifiable | NA | orchestrator.spec.md omitted (A-05) |
| C-15 | UI components typed | PASS | ui.spec.md §2 input contracts |
| C-16 | UI display conditions covered | PASS | ui.spec.md §4 rendering rules |
| C-17 | UI accessibility covered | PASS | ui.spec.md §5 |
| C-18 | Error codes complete (status/retry/ownership/message) | PASS | errors.spec.md §2, §4 |
| C-19 | No error code missing from coverage | PASS | traceability.spec.md §4 mirrors errors.spec.md |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover multi-source fields | PASS | slug (provided vs derived) — BR-01/BR-03; kind (route-fixed, body ignored) — BR-06/AC-19 |
| D-02 | Precedence rules ordered | PASS | BR-03 numbered evaluation order, first failure wins |
| D-03 | Default values table covers non-obvious defaults | PASS | behavior.spec.md §3 |
| D-04 | Why column has rationale | PASS | |
| D-05 | Limits table covers behavior-affecting numerics | PASS | §4 (title/slug/body/suffix bounds) |
| D-06 | Enforcement column filled | PASS | |
| D-07 | Duplicate defined precisely | PASS | DUP-01 (SPEC-001 carry-over, stated) |
| D-08 | Tie-break deterministic | PASS | TB-01 |
| D-09 | Edge table covers boundary values | PASS | §7 covers empty/oversize/exhaustion/migration boundaries |
| D-10 | Every behavior rule has traceability row | PASS | traceability.spec.md §5 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | |
| E-02 | Every REQ in §1 | PASS | REQ-01…REQ-12 |
| E-03 | Every AC in §1 | PASS | AC-01…AC-20 |
| E-04 | Every INV in §2 | PASS | INV-01…INV-06 |
| E-05 | Every EC in §3 | PASS | EC-01…EC-10 |
| E-06 | Every error code in §4 | PASS | 6 codes |
| E-07 | Pending rows acceptable at spec stage | PASS | All pending |
| E-08 | §7 Untraced empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors registry | PASS | |
| F-02 | Status enums consistent across files | PASS | `draft`/`published` and `post`/`page` everywhere |
| F-03 | Orchestrator projection valid | NA | orchestrator.spec.md OMITTED per manifest — no orchestration layer, no OrchestratorItem to project |
| F-04 | UI projection valid | PASS | ui.spec.md `AdminEntrySummary` ⊂ `AdminPost` (state.spec.md `PostRecord` serialization); statuses/kinds aligned |
| F-05 | Orchestrator defaults match behavior table | NA | orchestrator.spec.md OMITTED per manifest — no InputProps to compare |
| F-06 | Rate limits match limits table | PASS | Both record none-in-v1; body-size limit consistent across api §4 / behavior §4 / errors PAYLOAD_TOO_LARGE |
| F-07 | Same spec_id/feature_name in all files | PASS | SPEC-002 / FEAT-002-content-entry-authoring |
| F-08 | Version numbers consistent | PASS | 1.0.0 everywhere |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Library-First respected | PASS | Extends existing module; slug derivation is justified small custom code |
| G-02 | Test-First assumed | PASS | TDD before Programmer; both repo adapters require contract tests |
| G-03 | Modules trace to requirements | PASS | |
| G-04 | No speculative abstraction | PASS | No new ports; `list` signature change on an existing two-adapter port (ADR-006 already satisfied) |
| G-05 | P1 ACs have integration-test rows | PASS | Pending status at spec stage per E-07 |
| G-06 | Auth requirements present per endpoint | PASS | Explicit AUTH_LOCAL_DEV / public profiles with recorded exception |
| G-07 | spec_id + hash present in all files | PASS | Contract files reference feature.spec.md as hash of record |
| G-08 | Structured errors with correlation | PASS | Gateway inheritance gives changeSetId correlation on mutations; error registry structured (SPEC-001 pattern) |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate** — a new developer can implement from the package alone | PASS | Package specifies model change, migration, feature function, endpoints, errors, ordering rules, UI contracts, and wiring targets with concrete file references; SPEC-001 dependency explicit |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 9 | 0 | 1 |
| B: feature.spec.md Quality | 32 | 32 | 0 | 0 |
| C: Typed Contract Quality | 19 | 17 | 0 | 2 |
| D: Behavior Rules Quality | 10 | 10 | 0 | 0 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 6 | 0 | 2 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **91** | **0** | **5** |

**Overall DoD Result:** PASS

---

## Sign-Off Block

| Role | Name/Agent | Date | Result |
|------|-----------|------|--------|
| Spec Agent | Claude Opus 4.8 — persona `agents/spec/skills.md` loaded this session; retroactive persona audit + Drizzle revision (R1); re-ran the validator. (Original draft 2026-07-07T02:05Z was by Claude Fable 5 *before* the persona was loaded — Direct-Mode output, attribution invalid per `AI-Dev-Shop/AGENTS.md`; see note below.) | 2026-07-07T03:55:00Z | PASS — no correctness gaps found beyond attribution; ready for human spec checkpoint, then Red-Team |
| Coordinator | | | |

**Persona-audit note (retroactive, owner-approved 2026-07-07):** The original draft was produced before the Spec Agent persona file was loaded — per `AI-Dev-Shop/AGENTS.md` that made the prior "Spec Agent" attribution invalid. This session loaded the persona and re-audited the package against the persona Workflow and Guardrails: package completeness, testable ACs, zero clarification markers, FEAT uniqueness, and validator pass all hold. Remaining known gap (unchanged): the project `constitution.md` is still not bootstrapped, so toolkit-default articles + the Art. VI no-auth exception apply — already flagged to Coordinator. Sign-off attribution corrected above.
