# Spec Definition of Done (DoD) Checklist: Settings (Core-Only Layered Ledger)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-007 |
| feature_name | FEAT-007-settings-core-ledger |
| version | 0.3.1 |
| filled_by | Spec Agent |
| filled_date | 2026-07-11T20:15:00Z |
| reviewed_by | Coordinator (pending re-run Planning Preflight after Red-Team fix) |
| reviewed_date | pending |

---

## How to Use This Checklist

Each item is `PASS`, `FAIL`, or `NA` (NA requires concrete justification). The spec is not ready for
Software Architect dispatch until all items are PASS or NA and the Sign-Off Block is complete.

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | Present |
| A-02 | `feature.spec.md` is non-empty — all placeholders replaced | PASS | Fully authored |
| A-03 | `api.spec.md` is present (or NA) | PASS | Present — admin HTTP surface |
| A-04 | `state.spec.md` is present (or NA) | PASS | Present — tables + transitions |
| A-05 | `orchestrator.spec.md` is present (or NA) | NA | No orchestration layer: the write chokepoint and resolver are synchronous ordinary core code, and reset is a synchronous loop over clear(); omission justified in spec-manifest.md |
| A-06 | `ui.spec.md` is present (or NA) | PASS | Present — Settings admin screen |
| A-07 | `errors.spec.md` is present (or NA) | PASS | Present — new error registry |
| A-08 | `behavior.spec.md` is present (or NA) | PASS | Present — resolver/lifecycle rules |
| A-09 | `traceability.spec.md` present and REQ/AC rows populated | PASS | All REQ/AC/INV/EC/error rows seeded (pending impl) |
| A-10 | `spec-manifest.md` present with filenames + omissions | PASS | Present with brownfield references |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | SPEC-007; SPEC-001..006 exist |
| B-02 | `version` correct semver | PASS | 0.3.1 (patch — precision pass ties principal validation to ADR-007 structural scoping) |
| B-03 | `status` is APPROVED | PASS | APPROVED for spec handoff |
| B-04 | `content_hash` computed per canonical rule | PASS | Set by provider-local validator --update-hash |
| B-05 | `feature_name` matches FEAT folder name | PASS | FEAT-007-settings-core-ledger / 007-settings-core-ledger |
| B-06 | `last_edited` valid ISO-8601 UTC | PASS | 2026-07-11T20:15:00Z |
| B-07 | `owner` set to a named human/team | PASS | Leon Aburime |
| B-08 | Overview present (1–3 sentences) | PASS | Present |
| B-09 | Problem Statement complete (current/desired/why now/success) | PASS | All four filled |
| B-10 | User Journey has trigger/steps/outcome/alternate | PASS | Present |
| B-11 | In-scope list present and non-empty | PASS | Present |
| B-12 | Out-of-scope list present and non-empty | PASS | Present (plugin/secret gates, sync, batch repair) |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers | PASS | None |
| B-14 | Open Questions have owner AND date | PASS | OQ-01/OQ-02 both owned + dated; both RESOLVED 2026-07-11 via `/clarify` |
| B-15 | ≥1 REQ-* item | PASS | REQ-01..13 |
| B-16 | REQ-* observable/testable, no vague qualifiers | PASS | Reviewed |
| B-17 | REQ-* independently verifiable | PASS | Reviewed |
| B-18 | ≥1 AC-* item | PASS | AC-01..26 |
| B-19 | Every REQ-* has ≥1 AC-* | PASS | Verified in traceability §1 |
| B-20 | AC-* follow Given/When/Then | PASS | All ACs Given/When/Then |
| B-21 | AC-* have [P1]/[P2]/[P3] | PASS | All tagged |
| B-22 | P1 ACs independently testable | PASS | Reviewed |
| B-23 | No AC requires implementation knowledge | PASS | Behavioral outcomes only |
| B-24 | ≥1 INV-* item | PASS | INV-01..09 |
| B-25 | INV-* absolute statements | PASS | "must always"/"must never" |
| B-26 | ≥1 EC-* item | PASS | EC-01..11 |
| B-27 | EC-* concrete scenarios | PASS | Each names a scenario |
| B-28 | EC-* have explicit Expected Behavior | PASS | Each has one |
| B-29 | Dependencies table complete (no blank cells) | PASS | All rows filled |
| B-30 | Constitution Compliance table complete (8 articles) | PASS | All COMPLIES |
| B-31 | Any EXCEPTION has a note | NA | No EXCEPTION rows — all articles COMPLIES, so no exception note is required |
| B-32 | Implementation Readiness Gate complete and PASS | PASS | Gate result PASS |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use the type system, not comments-only | PASS | YAML-typed contracts in api/state/ui/errors |
| C-02 | Public interfaces/types have doc context | PASS | Descriptions on entities/endpoints |
| C-03 | Optional fields explicitly marked | PASS | `required: false` / nullable noted |
| C-04 | Nullable fields explicitly typed | PASS | `nullable: true` used |
| C-05 | No untyped/any escape hatches | PASS | Concrete types/enums throughout |
| C-06 | Immutable constants marked in idiom | NA | Spec-level language-neutral contracts define no language constants; `as const`/`Final` is an implementation concern deferred to the Programmer stage |
| C-07 | API: endpoints in a single registry | PASS | api.spec §1 Endpoint Registry |
| C-08 | API: every error code has HTTP status | PASS | api.spec §6 + errors.spec §2 |
| C-09 | API: endpoints have explicit auth | PASS | api.spec §2 profiles |
| C-10 | State: initial state covers all fields | PASS | state.spec §1 initial values |
| C-11 | State: transitions cover all state-changing ops | PASS | state.spec §3 action catalog |
| C-12 | State: invariants falsifiable | PASS | state.spec §5 |
| C-13 | Orchestrator: async outputs typed | NA | No orchestrator.spec.md — no async orchestration layer (see A-05) |
| C-14 | Orchestrator: invariants falsifiable | NA | No orchestrator.spec.md — no async orchestration layer (see A-05) |
| C-15 | UI: components have typed props | PASS | ui.spec §2 input tables |
| C-16 | UI: display conditions cover show/hide/disabled | PASS | ui.spec §4 rules |
| C-17 | UI: accessibility covers all components | PASS | ui.spec §5 |
| C-18 | Error: all codes have status/retry/ownership/message | PASS | errors.spec §2 + §4 |
| C-19 | Error: no code missing coverage | PASS | api ⊆ errors verified (F-01) |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every multi-source field | PASS | §1.1 layer precedence; §1.2 cleared-state |
| D-02 | Precedence rules ordered high→low | PASS | user > workspace > global > default |
| D-03 | Default Values table covers non-obvious defaults | PASS | §3 |
| D-04 | "Why" column has rationale | PASS | Each default justified |
| D-05 | Limits/Bounds cover numeric constraints | PASS | §4 (scopes 1..7, alias depth, rates) |
| D-06 | Enforcement column specifies where checked | PASS | API/DB/chokepoint noted |
| D-07 | Deduplication defines "duplicate" precisely | PASS | §5.1 (namespace,key,workspace partition) |
| D-08 | Tie-break deterministic | PASS | §6.1 total-order of 3 layers |
| D-09 | Edge Case table covers boundary values | PASS | §7 covers scope/secret/alias/rename bounds |
| D-10 | Every behavior rule has a traceability §5 row | PASS | traceability §5 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | Present |
| E-02 | Every REQ-* in §1 | PASS | REQ-01..13 present |
| E-03 | Every AC-* in §1 | PASS | AC-01..26 present |
| E-04 | Every INV-* in §2 | PASS | INV-01..09 present |
| E-05 | Every EC-* in §3 | PASS | EC-01..11 present |
| E-06 | Every error code in §4 | PASS | 16 codes present |
| E-07 | Pending rows acceptable at spec stage | PASS | All impl/test cells pending (pre-TDD) |
| E-08 | §7 Untraced is empty | PASS | Empty |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors.spec codes | PASS | All api §6 codes exist in errors §2 |
| F-02 | Status/enum types consistent across files | PASS | scope/state/status enums match across state/api/ui/behavior |
| F-03 | OrchestratorItem is a valid projection of FeatureItem | NA | No orchestrator.spec.md; there is no OrchestratorItem to project (see A-05) |
| F-04 | ui ItemSummary projects OrchestratorItem | NA | No orchestrator layer; ui.spec projects from state.spec/api.spec entities (SettingSummary/ResolvedValue), which are aligned |
| F-05 | Orchestrator InputProps defaults match behavior defaults | NA | No orchestrator.spec.md; UI/API defaults are reconciled against behavior.spec §3 directly |
| F-06 | Rate-limit values match behavior Limits table | PASS | 30/60s write, 300/60s read in both api §3 and behavior §4 |
| F-07 | All files share spec_id and feature_name | PASS | SPEC-007 / FEAT-007-settings-core-ledger everywhere |
| F-08 | Consistent version numbers | PASS | All 0.3.1 (bumped together during Red-Team fix + precision pass) |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First): no custom impl where a library/decided primitive exists | PASS | Reuses Drizzle, ADR-022 chokepoint, ADR-021 authorize() |
| G-02 | Article II (Test-First): no assumption of impl order | PASS | ACs/INVs/ECs written to drive TDD-first |
| G-03 | Article III (Simplicity Gate): modules trace to requirements | PASS | Each contract module maps to a REQ |
| G-04 | Article IV (Anti-Abstraction): no speculative abstractions | PASS | SettingsRepoPort has rule-of-two adapters; no plugin/secret abstraction |
| G-05 | Article V (Integration-First): every P1 AC has an integration test row | PASS | Seeded in traceability §1 (pending TDD) |
| G-06 | Article VI (Security-by-Default): all endpoints authed | PASS | Every endpoint has an auth profile; secret path rejected |
| G-07 | Article VII (Spec Integrity): spec_id + hash present in all files | PASS | Present; feature.spec hash validator-managed |
| G-08 | Article VIII (Observability): structured errors with correlationId | PASS | errors.spec §1 envelope includes correlationId |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | A new developer can implement the feature from this package alone | PASS | Data model, API, UI, resolver behavior, errors, and permission catalog are fully specified against ADR-028 |

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

> PASS — All items are PASS or NA (with written justification for each NA). Spec is ready for Software
> Architect dispatch pending Coordinator Planning Preflight sign-off.

---

## Blocking Issues (if FAIL)

| Item ID | Issue | Required Change | Owner | Target Date |
|---------|-------|----------------|-------|-------------|
| — | — | — | — | — |

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Spec Agent | 2026-07-11T16:55:07Z | SPEC-007-v0.1.0-spec-handoff |
| Spec Agent | Spec Agent | 2026-07-11T19:10:00Z | SPEC-007-v0.2.0-clarify-update |
| Coordinator | Coordinator | 2026-07-11T19:25:00Z | SPEC-007-v0.2.0-preflight-pass (superseded — Red-Team found 3 BLOCKING against this version) |
| Spec Agent | Spec Agent | 2026-07-11T20:00:00Z | SPEC-007-v0.3.0-redteam-fix |
| Spec Agent | Spec Agent | 2026-07-11T20:15:00Z | SPEC-007-v0.3.1-precision-fix (ADR-007 structural-scoping wording) |
| Coordinator | | | |

> By signing, the Coordinator confirms all items are PASS/NA, the package is internally consistent,
> H-01 is PASS, and the spec is authorized for Software Architect dispatch.
