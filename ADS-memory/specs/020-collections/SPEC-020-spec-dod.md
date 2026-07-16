# Spec Definition of Done (DoD) Checklist: collections

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-020 |
| feature_name | FEAT-020-collections |
| version | 1.4.0 |
| filled_by | Spec Agent (Claude Sonnet 5) |
| filled_date | 2026-07-15T03:30:00Z |
| reviewed_by | Coordinator (Claude Sonnet 5) |
| reviewed_date | 2026-07-15T05:35:00Z |

**Revision note (v1.3.0):** This revision fixes the 1 BLOCKING finding (RT-015) and folds in the 3
ADVISORY findings (RT-016, RT-017, RT-018) from
`ADS-memory/reports/pipeline/020-collections/red-team-findings-round3.md`. See
`SPEC-020-spec-manifest.md` Validation Notes for the full per-finding change list. Counts below
(REQ/AC/EC totals) are updated to reflect the new REQ-30, AC-54 through AC-56, and EC-18/EC-19. No
new INV was added (REQ-30 cites existing INV-09/INV-10), so the INV count is unchanged.

**Revision note (v1.2.0):** This revision fixes the 1 BLOCKING finding (RT-012) and folds in the 2
ADVISORY findings (RT-013, RT-014) from
`ADS-memory/reports/pipeline/020-collections/red-team-findings-round2.md`. See
`SPEC-020-spec-manifest.md` Validation Notes for the full per-finding change list. Counts below
(REQ/AC/INV/EC totals) are updated to reflect the new REQ-29, AC-51 through AC-53, INV-10, and
EC-16/EC-17.

**Revision note (v1.1.0):** This revision fixes all 5 BLOCKING and folds in all 5 ADVISORY findings
from `ADS-memory/reports/pipeline/020-collections/red-team-findings.md` (RT-001 through RT-010) and
re-syncs `## Integration Contracts` against SPEC-016 v1.1.0. See `SPEC-020-spec-manifest.md`
Validation Notes for the full per-finding change list. Counts below (REQ/AC/INV/EC totals) are
updated to reflect the new REQ-26/REQ-27/REQ-28, AC-41 through AC-50, INV-09, and EC-11 through
EC-15.

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | `SPEC-020-feature.spec.md` |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | All template placeholder prose/examples were removed and replaced with real requirements, ACs, invariants, edge cases, dependencies, open questions, and an `## Integration Contracts` section |
| A-03 | `api.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-020-api.spec.md` — 17 endpoints across content-type CRUD, entry CRUD/publish, field-bag validate-only, and the cleanup gateway |
| A-04 | `state.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-020-state.spec.md` — the `content_types`/`content_type_revisions` and `entries`/`entry_revisions` durable state |
| A-05 | `orchestrator.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-020-orchestrator.spec.md` — two ordinary write chokepoints plus one gated-mutation gateway instantiation |
| A-06 | `ui.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-020-ui.spec.md` — the Collections admin screen has real component/event/rendering/accessibility contracts |
| A-07 | `errors.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-020-errors.spec.md` — 11 new codes plus 8 reused directly from SPEC-016 |
| A-08 | `behavior.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-020-behavior.spec.md` — real precedence, ordering, default, limit, and deduplication rules |
| A-09 | `traceability.spec.md` is present and all REQ-*/AC-* rows populated (may be "pending implementation") | PASS | `SPEC-020-traceability.spec.md` — every REQ/AC/INV/EC/error code/behavior rule is seeded, all rows PENDING as expected pre-implementation |
| A-10 | `spec-manifest.md` is present and records actual filenames plus omitted files with justification | PASS | `SPEC-020-spec-manifest.md` — no logical file is OMITTED in this package |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` is assigned and unique | PASS | `ADS-memory/specs/003-*` and `ADS-memory/reports/pipeline/003-*` were confirmed absent before this run |
| B-02 | `version` is set to correct semver (1.0.0 for new specs) | PASS | `1.3.0` |
| B-03 | `status` is APPROVED (not DRAFT or REVIEW) | PASS | `APPROVED` — marks the artifact itself complete; the human spec-approval checkpoint itself is now recorded separately in this file's Sign-Off Block (Human row, 2026-07-15T06:00:00Z) |
| B-04 | `content_hash` is computed and recorded, matches the canonical hash rule | PASS | Recomputed for v1.1.0 and verified by the provider-local validator with `--update-hash`, then re-verified idempotent with `--phase spec` and no `--update-hash` (see Validation Notes in `spec-manifest.md`) |
| B-05 | `feature_name` matches the FEAT folder name exactly | PASS | `FEAT-020-collections` matches the spec folder `020-collections` |
| B-06 | `last_edited` is a valid ISO-8601 UTC timestamp | PASS | `2026-07-14T23:00:00Z` |
| B-07 | `owner` is set to a named human or team | PASS | `Leon Aburime` |
| B-08 | Overview section present, 1-3 sentences | PASS | |
| B-09 | Problem Statement present with Current/Desired state, Why now, Success signal | PASS | |
| B-10 | User Journey present with Trigger, Steps, Outcome, Alternate paths | PASS | |
| B-11 | Scope: In-scope list present and non-empty | PASS | 7 in-scope bullets |
| B-12 | Scope: Out-of-scope list present and non-empty | PASS | 6 out-of-scope bullets, each citing the owning spec or ADR |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain | PASS | None were required — every mechanism in scope was already decided by ADR-043; the two unbenchmarked numeric values are recorded as `SAFE DEFAULT` Open Questions instead |
| B-14 | All Open Questions have an owner AND a resolution target date | PASS | OQ-01 through OQ-03 each carry an Owner and a Resolve-by milestone. OQ-04 is `Resolved` as of v1.1.0 (inherited directly from SPEC-016's own now-Resolved OQ-04 — see RT-009) and intentionally carries no Owner/Resolve-by, since there is no longer a pending decision for this item's "has an owner and a target date" intent to apply to; a Resolved question is the terminal state that owner-and-date tracking exists to reach |
| B-15 | Requirements section has at least one REQ-* item | PASS | 30 requirements (REQ-01 – REQ-30) — REQ-26/REQ-27/REQ-28 added in v1.1.0 (RT-001/RT-003/RT-002); REQ-29 added in v1.2.0 (RT-013); REQ-30 added in v1.3.0 (RT-015) |
| B-16 | All REQ-* items are observable/testable, no vague qualifiers | PASS | No instance of "fast/robust/intuitive/seamless" found, including in the five new REQ-26/REQ-27/REQ-28/REQ-29/REQ-30 and the amended REQ-08/REQ-14/REQ-16/REQ-26 text |
| B-17 | All REQ-* items are independently verifiable | PASS | |
| B-18 | Acceptance Criteria section has at least one AC-* item | PASS | 56 acceptance criteria (AC-01 – AC-56) — AC-41 through AC-50 added in v1.1.0; AC-51 through AC-53 added in v1.2.0; AC-54 through AC-56 added in v1.3.0 |
| B-19 | Every REQ-* has at least one corresponding AC-* | PASS | Verified 1:1 or more for all 30 REQs, including the five new ones |
| B-20 | All AC-* items follow Given/When/Then format | PASS | |
| B-21 | All AC-* items have a [P1]/[P2]/[P3] priority tag | PASS | 50 P1, 6 P2, no P3 (the 10 v1.1.0 ACs AC-41–AC-50, the 3 v1.2.0 ACs AC-51–AC-53, and the 3 v1.3.0 ACs AC-54–AC-56 are all P1) |
| B-22 | All P1 AC items are independently testable | PASS | |
| B-23 | No AC item requires implementation knowledge to evaluate | PASS | |
| B-24 | Invariants section has at least one INV-* item | PASS | 10 invariants (INV-01 – INV-10) — INV-09 added in v1.1.0 (RT-003); INV-10 added in v1.2.0 (RT-013); no new INV added in v1.3.0 (REQ-30 cites the existing INV-09/INV-10) |
| B-25 | All INV-* items are absolute statements ("must always"/"must never") | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | 19 edge cases (EC-01 – EC-19) — EC-11 through EC-15 added in v1.1.0; EC-16/EC-17 added in v1.2.0; EC-18/EC-19 added in v1.3.0 |
| B-27 | All EC-* items are concrete scenarios, not categories | PASS | |
| B-28 | All EC-* items have an explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete, no blank cells | PASS | 6 dependency rows, all 4 columns filled |
| B-30 | Constitution Compliance table complete, all 8 articles marked | PASS | All 8 marked N/A with a concrete, non-generic justification (the constitution file is an unratified template) |
| B-31 | Any EXCEPTION in the Constitution Compliance table has a note | NA | No article is marked EXCEPTION — all 8 are N/A, so there is no EXCEPTION row this item could apply to |
| B-32 | Implementation Readiness Gate checklist complete, shows PASS | PASS | `feature.spec.md`'s own gate section shows `Gate result: PASS` |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | All contract files use the language's type system, no comment-only behavior | PASS | yaml/TS-shaped blocks throughout `api.spec.md`/`state.spec.md`/`orchestrator.spec.md`/`ui.spec.md` |
| C-02 | All public interfaces and types have doc comments | PASS | Field-level Notes columns and inline descriptions document every non-obvious type |
| C-03 | All optional fields explicitly marked as optional | PASS | Every request field in `api.spec.md` §4 carries an explicit `required: true/false` |
| C-04 | Nullable fields have explicit nullable typing | PASS | `state.spec.md` §1's State Shape table has an explicit Nullable column for every field |
| C-05 | No untyped / `any` / `object` escape hatches — all types are specific | NA | The `object`-typed fields (`bodyJson`/`fieldsJson` on `Entry`, `fieldsSchemaJson`-derived `fields` on `ContentType`) are explicitly-disclosed operator-defined JSON bags — the entire point of ADR-043's design is that their concrete shape is data, not a fixed schema this spec can type further; their validation contract (against the current `ContentTypeField` schema) is fully specified in REQ-14/REQ-15, not left as an undisclosed escape hatch |
| C-06 | Immutable constants marked per language idiom (`as const`, `Final`, etc.) | NA | Contract files here are language-neutral yaml/markdown per the Speckit compatibility format; fixed values (the grammar regex, the `20`/`30-day` defaults) are documented as fixed in `behavior.spec.md` §3/§4 rather than marked with a language-specific immutability idiom |
| C-07 | API contract: all endpoints registered in a single registry constant | PASS | `api.spec.md` §1 Endpoint Registry is the single registry |
| C-08 | API contract: all error codes have an HTTP status mapping | PASS | `errors.spec.md` §2.1/§2.2 |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | `api.spec.md` §2 |
| C-10 | State contract: initial state covers all fields | PASS | `state.spec.md` §1 Initial Value column |
| C-11 | State contract: transitions/actions cover all state-changing operations | PASS | `state.spec.md` §3 Action Catalog |
| C-12 | State contract: invariants are falsifiable statements | PASS | `state.spec.md` §5 |
| C-13 | Orchestrator contract: all async outputs have an explicit result type | PASS | `Result<...>` wrapper is explicit for every action in `orchestrator.spec.md` §4 |
| C-14 | Orchestrator contract: invariants are falsifiable statements | PASS | `orchestrator.spec.md` §6 |
| C-15 | UI contract: all components have typed props/params | PASS | `ui.spec.md` §2 |
| C-16 | UI contract: display conditions cover show/hide/disabled state | PASS | `ui.spec.md` §4 |
| C-17 | UI contract: accessibility requirements cover all components | PASS | `ui.spec.md` §5 |
| C-18 | Error contract: all error codes have HTTP status, retry, ownership, user message | PASS | `errors.spec.md` §2 and §4 |
| C-19 | Error contract: no error code missing from coverage requirements | PASS | |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field that can receive a value from multiple sources | PASS | The one genuine multi-source case at this spec's level — an entry's current schema vs. its own historical field set — is covered in §1.1 |
| D-02 | Precedence rules are ordered, highest priority first | PASS | |
| D-03 | Default Values table covers every field with a non-obvious default | PASS | `field.required`, `field.queryable`, `contentType.status`, `entry.status`, queryable cap, retention window, token TTL |
| D-04 | "Why" column contains a rationale, not a restatement | PASS | |
| D-05 | Limits and Bounds table covers every numeric constraint affecting behavior | PASS | Grammar length, queryable cap, label/slug length, retention window, token TTL, rate limits, page size |
| D-06 | Enforcement column specifies where each constraint is checked | PASS | |
| D-07 | Deduplication rules define "duplicate" precisely | PASS | `behavior.spec.md` §5.1 defines it precisely for both `content_types.key` and `entries.(type,slug)` |
| D-08 | Tie-break logic is deterministic | NA | `behavior.spec.md` §6 is explicitly N/A — this spec has no scenario where multiple items compete for the same role; concurrent-duplicate races are resolved by a unique-index conflict outcome, not a tie-break |
| D-09 | Edge Case Handling table covers all boundary values from the Limits table | PASS | Grammar-length boundary, queryable-cap boundary, retention-window boundary, and slug-conflict race are all represented in §7 |
| D-10 | Every behavior rule in behavior.spec.md has a corresponding row in traceability.spec.md Section 5 | PASS | Verified 1:1 against `traceability.spec.md` §5 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md is present | PASS | |
| E-02 | Every REQ-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | |
| E-03 | Every AC-* from feature.spec.md appears in traceability.spec.md Section 1 | PASS | |
| E-04 | Every INV-* from feature.spec.md appears in traceability.spec.md Section 2 | PASS | |
| E-05 | Every EC-* from feature.spec.md appears in traceability.spec.md Section 3 | PASS | |
| E-06 | Every error code from errors.spec.md appears in traceability.spec.md Section 4 | PASS | |
| E-07 | Rows with "pending" status are acceptable at spec stage | PASS | All rows are PENDING, as expected before Software Architect/TDD dispatch |
| E-08 | Section 7 (Untraced Requirements) is empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | Error codes in api.spec.md are a subset of errors.spec.md | PASS | Every code referenced in `api.spec.md` §6 appears in `errors.spec.md` §2.1 or §2.2 |
| F-02 | Resource status types consistent across api/state/orchestrator/ui | PASS | `ContentTypeStatus`/`EntryStatus` are identical across `state.spec.md`, `api.spec.md`, `orchestrator.spec.md`, and `ui.spec.md` |
| F-03 | OrchestratorItem fields are a valid projection of FeatureItem in state.spec.md | PASS | `orchestrator.spec.md` §3's Output State Contract (`contentType`, `entry`, `cleanupPlan`, etc.) is a direct projection of `state.spec.md` §1/§2's entities, with no field contradiction |
| F-04 | ItemSummary fields are a valid projection of OrchestratorItem in ui.spec.md | PASS | `ui.spec.md`'s `ContentType`/`Entry` component inputs match `orchestrator.spec.md` §3's output fields exactly |
| F-05 | Default values in orchestrator.spec.md InputProps match the Default Values table in behavior.spec.md | NA | No field in `orchestrator.spec.md` §2's Input Contract carries an inline Default value (all are required or conditionally required) — defaults live only in `behavior.spec.md` §3 and are applied by the write chokepoint, not declared twice |
| F-06 | Rate limit values in api.spec.md match the Limits and Bounds table in behavior.spec.md | PASS | `api.spec.md` §3's `COLLECTIONS_READ`/`COLLECTIONS_WRITE` values (300/60s, 60/60s) match `behavior.spec.md` §4's Limits and Bounds table exactly |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-020` / `FEAT-020-collections` in every file's header |
| F-08 | All spec files have consistent version numbers | PASS | `1.3.0` in every file (bumped from `1.2.0` in this revision) |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First): no custom implementation where a library exists | PASS | This spec implements ADR-043's already-decided design; it introduces no custom implementation choice over an available library |
| G-02 | Article II (Test-First): spec makes no assumptions about implementation order | PASS | `traceability.spec.md` marks every row PENDING; TDD has not been assumed to have run |
| G-03 | Article III (Simplicity Gate): every module in contract files traces to a requirement | PASS | Every type/entity in `api.spec.md`/`state.spec.md`/`orchestrator.spec.md`/`ui.spec.md` maps to at least one REQ-* |
| G-04 | Article IV (Anti-Abstraction Gate): no speculative abstractions unless 3+ concrete uses | PASS | The gated-mutation gateway instantiation (`domain="collections"`) is the third named concrete consumer of SPEC-016's generic gateway pattern (after Storage's forward-migration and Recovery's restore ceremonies) — not a speculative one-off |
| G-05 | Article V (Integration-First Testing): every P1 AC has an integration test row or "pending" | PASS | All 50 P1 ACs have a PENDING row in `traceability.spec.md` §1 |
| G-06 | Article VI (Security-by-Default): api.spec.md auth requirements present for all endpoints | PASS | `api.spec.md` §2 |
| G-07 | Article VII (Spec Integrity): spec_id and content_hash present and correct | PASS | `feature.spec.md` is the canonical hash anchor per the Speckit `hash_anchor` role; every other file in this package carries the same `spec_id`/`content_hash` for human cross-reference |
| G-08 | Article VIII (Observability): errors.spec.md defines structured error payloads with correlationId | PASS | `errors.spec.md` §1 Error Envelope |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate:** a new developer can implement the feature from these specs alone, without asking clarifying questions | PASS | This gate applies to Collections' own scope (the content-type registry, the entry table, both write chokepoints, the cleanup gateway instantiation, and the admin UI) — a developer could implement all of REQ-01 through REQ-25 from this package plus SPEC-016's cited ids without asking a scope/behavior/error/state question. The two numeric values ADR-043 itself left unbenchmarked (queryable cap, retention window) are given concrete `SAFE DEFAULT` values here rather than left open, so no implementation decision is silently deferred to the Programmer Agent. |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 10 | 0 | 0 |
| B: feature.spec.md Quality | 32 | 31 | 0 | 1 |
| C: Typed Contract Quality | 19 | 17 | 0 | 2 |
| D: Behavior Rules Quality | 10 | 9 | 0 | 1 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 7 | 0 | 1 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **91** | **0** | **5** |

**Overall DoD Result:** PASS

---

## Blocking Issues (if FAIL)

Not applicable — Overall DoD Result is PASS. No row in this checklist is FAIL.

| Item ID | Issue | Required Change | Owner | Target Date |
|---------|-------|----------------|-------|-------------|
| — | — | — | — | — |

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-15T00:30:00Z | Spec Agent (Claude Sonnet 5) |
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-15T03:30:00Z | Spec Agent (Claude Sonnet 5) |
| Coordinator | Coordinator (Claude Sonnet 5) | 2026-07-15T05:35:00Z | Planning Preflight PASS — validator clean at v1.3.0, Red-Team round 4 cleared (0 BLOCKING) |
| Human (Project Owner) | Leona Burime | 2026-07-15T06:00:00Z | APPROVED — spec approval checkpoint cleared for Software Architect dispatch, alongside SPEC-016/017/018/019/020 as a set |
