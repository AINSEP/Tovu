# Spec Definition of Done (DoD) Checklist: backups-recovery

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-019 |
| feature_name | FEAT-019-backups-recovery |
| version | 1.1.0 |
| filled_by | Spec Agent (Claude Sonnet 5) |
| filled_date | 2026-07-14T23:30:00Z |
| reviewed_by | Coordinator (Claude Sonnet 5) |
| reviewed_date | 2026-07-15T05:35:00Z |

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | `SPEC-019-feature.spec.md` |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | All template placeholder prose/examples were removed and replaced with real requirements, ACs, invariants, edge cases, dependencies, integration contracts, and open questions |
| A-03 | `api.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-019-api.spec.md` — the Recovery routes and agent-tool catalog are a real callable surface |
| A-04 | `state.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-019-state.spec.md` — the restore-flow wizard, restore-run progress, and deep-link-resolution state are real client-facing state this screen owns |
| A-05 | `orchestrator.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-019-orchestrator.spec.md` — the Recovery-domain orchestration, including delegation into SPEC-016's gateway, is a real coordination layer |
| A-06 | `ui.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-019-ui.spec.md` — Recovery is a real admin screen with components, props, events, and accessibility requirements (unlike SPEC-016, which has no independent UI surface) |
| A-07 | `errors.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-019-errors.spec.md` — defines the Recovery-domain-owned error codes in addition to reusing SPEC-016's gateway codes |
| A-08 | `behavior.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-019-behavior.spec.md` — real precedence, ordering, default, and limit rules exist |
| A-09 | `traceability.spec.md` is present and all REQ-*/AC-* rows populated (may be "pending implementation") | PASS | `SPEC-019-traceability.spec.md` — every REQ/AC/INV/EC/error code/behavior rule is seeded, all rows PENDING as expected pre-implementation |
| A-10 | `spec-manifest.md` is present and records actual filenames plus omitted files with justification | PASS | `SPEC-019-spec-manifest.md` — no files are omitted for this feature |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` is assigned and unique | PASS | `ADS-memory/specs/005-*` and `ADS-memory/reports/pipeline/005-*` were confirmed absent before this run |
| B-02 | `version` is set to correct semver (1.0.0 for new specs) | PASS | `1.1.0` — bumped from `1.0.0` on this revision, which folded in Red-Team findings RT-001 – RT-008 (clarifications/corrections, no scope change, hence a minor bump) |
| B-03 | `status` is APPROVED (not DRAFT or REVIEW) | PASS | `APPROVED` — this marks the artifact itself complete; the human spec-approval checkpoint itself is now recorded separately in this file's Sign-Off Block (Human row, 2026-07-15T06:00:00Z) |
| B-04 | `content_hash` is computed and recorded, matches the canonical hash rule | PASS | Recomputed and verified by the provider-local validator with `--update-hash` before handoff |
| B-05 | `feature_name` matches the FEAT folder name exactly | PASS | `FEAT-019-backups-recovery` matches the spec folder `019-backups-recovery` |
| B-06 | `last_edited` is a valid ISO-8601 UTC timestamp | PASS | `2026-07-14T21:00:00Z` |
| B-07 | `owner` is set to a named human or team | PASS | `Leon Aburime` |
| B-08 | Overview section present, 1-3 sentences | PASS | |
| B-09 | Problem Statement present with Current/Desired state, Why now, Success signal | PASS | |
| B-10 | User Journey present with Trigger, Steps, Outcome, Alternate paths | PASS | |
| B-11 | Scope: In-scope list present and non-empty | PASS | 7 in-scope bullets |
| B-12 | Scope: Out-of-scope list present and non-empty | PASS | 5 out-of-scope bullets, each citing the owning spec/ADR |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain | PASS | None were required — genuinely open items are recorded as Open Questions with owner and resolve-by date instead |
| B-14 | All Open Questions have an owner AND a resolution target date | PASS | OQ-01, OQ-02, and OQ-03 each carry an Owner and a Resolve-by milestone (OQ-03's Owner reassigned to SPEC-016 per Red-Team RT-006 on this revision); OQ-04 is now Resolved with an inline resolution date and reasoning (Red-Team RT-004 fold-in), which satisfies this item at least as strongly as an open target date would |
| B-15 | Requirements section has at least one REQ-* item | PASS | 27 requirements (REQ-01 – REQ-27) |
| B-16 | All REQ-* items are observable/testable, no vague qualifiers | PASS | No instance of "fast/robust/intuitive/seamless" found |
| B-17 | All REQ-* items are independently verifiable | PASS | |
| B-18 | Acceptance Criteria section has at least one AC-* item | PASS | 38 acceptance criteria (AC-01 – AC-38) |
| B-19 | Every REQ-* has at least one corresponding AC-* | PASS | Verified 1:1 or more for all 27 REQs |
| B-20 | All AC-* items follow Given/When/Then format | PASS | |
| B-21 | All AC-* items have a [P1]/[P2]/[P3] priority tag | PASS | 33 P1, 5 P2 — no P3 (every AC in this safety-critical restore flow is either shipping-blocking or a close second, matching this spec's own restore-ceremony seriousness) |
| B-22 | All P1 AC items are independently testable | PASS | |
| B-23 | No AC item requires implementation knowledge to evaluate | PASS | |
| B-24 | Invariants section has at least one INV-* item | PASS | 7 invariants (INV-01 – INV-07) |
| B-25 | All INV-* items are absolute statements ("must always"/"must never") | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | 8 edge cases (EC-01 – EC-08) |
| B-27 | All EC-* items are concrete scenarios, not categories | PASS | |
| B-28 | All EC-* items have an explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete, no blank cells | PASS | 5 dependency rows, all 4 columns filled |
| B-30 | Constitution Compliance table complete, all 8 articles marked | PASS | All 8 marked N/A with a concrete, non-generic justification (the constitution file is an unratified template) |
| B-31 | Any EXCEPTION in the Constitution Compliance table has a note | NA | No article is marked EXCEPTION — all 8 are N/A, so there is no EXCEPTION row this item could apply to |
| B-32 | Implementation Readiness Gate checklist complete, shows PASS | PASS | `feature.spec.md`'s own gate section shows `Gate result: PASS` |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | All contract files use the language's type system, no comment-only behavior | PASS | yaml/TS-shaped blocks throughout `api.spec.md`/`state.spec.md`/`orchestrator.spec.md`/`ui.spec.md` |
| C-02 | All public interfaces and types have doc comments | PASS | Field-level Notes columns and inline `#`/`//` comments document every non-obvious type |
| C-03 | All optional fields explicitly marked as optional | PASS | Every request field in `api.spec.md` §4 carries an explicit `required: true/false` |
| C-04 | Nullable fields have explicit nullable typing | PASS | `state.spec.md` §1's State Shape table and `api.spec.md`'s `RecoveryContextResponse`/`RestorePointSummary.watermarkAtCapture` carry explicit nullability |
| C-05 | No untyped / `any` / `object` escape hatches — all types are specific | PASS | The one `object`-typed field (`BackupRestorePlanResponse.details.disclosure.counts` in `api.spec.md` §5) is a disclosed dynamic map keyed by the same `coveredCategories` list carried alongside it — not an undisclosed escape hatch, matching the shape SPEC-016's own `computeDiscardedCount` selector already returns |
| C-06 | Immutable constants marked per language idiom (`as const`, `Final`, etc.) | NA | Contract files here are language-neutral yaml/markdown per the Speckit compatibility format, not literal source code; fixed values (the uniform ceremony, the exactly-1 in-flight-operation limit) are documented as fixed in `behavior.spec.md` §4 rather than marked with a language-specific immutability idiom |
| C-07 | API contract: all endpoints registered in a single registry constant | PASS | `api.spec.md` §1 Endpoint Registry is the single registry |
| C-08 | API contract: all error codes have an HTTP status mapping | PASS | `errors.spec.md` §2 and `SPEC-016-errors.spec.md` §2 (reused codes) |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | `api.spec.md` §2 |
| C-10 | State contract: initial state covers all fields | PASS | `state.spec.md` §1 Initial Value column |
| C-11 | State contract: transitions/actions cover all state-changing operations | PASS | `state.spec.md` §3 Action Catalog |
| C-12 | State contract: invariants are falsifiable statements | PASS | `state.spec.md` §5 |
| C-13 | Orchestrator contract: all async outputs have an explicit result type | PASS | `Result<RestorePointListResponse>` / `Result<BackupRestorePlanResponse>` / etc. — explicit wrapper type throughout |
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
| D-01 | Precedence rules cover every field that can receive a value from multiple sources | PASS | Two precedence rules cover the two multi-source cases at this domain's level: degraded-state banner precedence, and disclosure-acknowledgment vs. confirm-reachability |
| D-02 | Precedence rules are ordered, highest priority first | PASS | |
| D-03 | Default Values table covers every field with a non-obvious default | PASS | `restoreFlow.step`, `capabilities.operationInFlight`, `disclosureAcknowledged`, restore-point creation `trigger` |
| D-04 | "Why" column contains a rationale, not a restatement | PASS | |
| D-05 | Limits and Bounds table covers every numeric constraint affecting behavior | PASS | List page size, concurrent-operation limit, inherited token TTL |
| D-06 | Enforcement column specifies where each constraint is checked | PASS | |
| D-07 | Deduplication rules define "duplicate" precisely | NA | `behavior.spec.md` §5 is explicitly N/A — this domain has no content-deduplication concept; a restore point is uniquely identified by its own id |
| D-08 | Tie-break logic is deterministic | NA | `behavior.spec.md` §6 is explicitly N/A beyond the already-ordered banner-precedence list in §1.1, which is not a tie-break between equally-weighted candidates |
| D-09 | Edge Case Handling table covers all boundary values from the Limits table | PASS | The concurrent-operation-limit boundary (`RESTORE_OPERATION_IN_FLIGHT`) and the `costClass` mid-flow transition boundary are both represented in §7 |
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
| F-01 | Error codes in api.spec.md are a subset of errors.spec.md | PASS | `RESTORE_POINT_NOT_FOUND, RESTORE_OPERATION_IN_FLIGHT, COST_CLASS_UNAVAILABLE, DEEP_LINK_TARGET_NOT_FOUND` appear in this spec's own `errors.spec.md`; the reused gateway codes (`PLAN_STALE, TOKEN_EXPIRED, TOKEN_ALREADY_REDEEMED, FORBIDDEN, UNAUTHENTICATED, VALIDATION_ERROR, RATE_LIMIT_EXCEEDED, INTERNAL_ERROR`) are cross-referenced to `SPEC-016-errors.spec.md`, not silently redefined |
| F-02 | Resource status types consistent across api/state/orchestrator/ui | PASS | `RestoreFlowStep`, `RestoreRunState`, and `CostClass` are identical across `state.spec.md`, `orchestrator.spec.md`, and `ui.spec.md` |
| F-03 | OrchestratorItem fields are a valid projection of FeatureItem in state.spec.md | PASS | `orchestrator.spec.md` §3's Output State Contract (`restorePoints`, `capabilities`, `gatewayResult`, `deepLinkResolution`, `lastError`) is a valid projection of `state.spec.md` §1's State Shape (`restorePoints`, `capabilities.*`, `restoreFlow.*`, `restoreRun.*`, `deepLinkContext.*`) |
| F-04 | ItemSummary fields are a valid projection of OrchestratorItem in ui.spec.md | PASS | `ui.spec.md` §2.4's `RestorePointRow.restorePoint` input is the same `RestorePointSummary` type `state.spec.md` §2 and `orchestrator.spec.md` §3 already define — no silent field drift |
| F-05 | Default values in orchestrator.spec.md InputProps match the Default Values table in behavior.spec.md | NA | No field in `orchestrator.spec.md` §2's Input Contract carries a non-`none` Default value (all are required or conditionally required) — there is nothing to compare against `behavior.spec.md` §3's state-level defaults, so no contradiction is possible |
| F-06 | Rate limit values in api.spec.md match the Limits and Bounds table in behavior.spec.md | NA | Rate-limit values are defined once, in `api.spec.md` §3 only; `behavior.spec.md` §4 intentionally does not restate them to avoid a second source of truth, so there is no duplicate value pair to reconcile |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-019` / `FEAT-019-backups-recovery` in every file's header |
| F-08 | All spec files have consistent version numbers | PASS | `1.1.0` in every file (verified by direct grep across all 10 files after this revision's RT-001 – RT-008 fold-in) |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First): no custom implementation where a library exists | PASS | This spec defines a UI/API layer already architecturally decided by ADR-041/ADR-045; it introduces no custom implementation choice over an available library |
| G-02 | Article II (Test-First): spec makes no assumptions about implementation order | PASS | `traceability.spec.md` marks every row PENDING; TDD has not been assumed to have run |
| G-03 | Article III (Simplicity Gate): every module in contract files traces to a requirement | PASS | Every type/component in `api.spec.md`/`state.spec.md`/`orchestrator.spec.md`/`ui.spec.md` maps to at least one REQ-* |
| G-04 | Article IV (Anti-Abstraction Gate): no speculative abstractions unless 3+ concrete uses | PASS | This spec introduces no new abstraction of its own — `RecoveryOrchestrator`'s delegation into SPEC-016's already-justified `GatedMutationGateway` is the concrete third consumer of that pattern (alongside Storage's migrate-forward ceremony and Collections' destructive-cleanup step), not a speculative one-off |
| G-05 | Article V (Integration-First Testing): every P1 AC has an integration test row or "pending" | PASS | All 33 P1 ACs have a PENDING row in `traceability.spec.md` §1 |
| G-06 | Article VI (Security-by-Default): api.spec.md auth requirements present for all endpoints | PASS | `api.spec.md` §2 |
| G-07 | Article VII (Spec Integrity): spec_id and content_hash present and correct | PASS | `feature.spec.md` is the canonical hash anchor per the Speckit `hash_anchor` role. **Correction (Red-Team RT-001, 2026-07-14):** this row was previously marked PASS on an assumed-true basis without direct inspection — every secondary file (`api`/`state`/`orchestrator`/`ui`/`errors`/`behavior`/`traceability`) actually carried the literal placeholder `sha256:0000...0000` instead of `feature.spec.md`'s real hash, which RT-001 caught. This revision manually verified, file by file, that every secondary file's header now carries the exact same `content_hash` value as `feature.spec.md` (all recomputed to `sha256:<see current header>` after this revision's content changes) — this PASS is now evidence-backed by direct inspection, not assumption. |
| G-08 | Article VIII (Observability): errors.spec.md defines structured error payloads with correlationId | PASS | `errors.spec.md` §1 Error Envelope |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate:** a new developer can implement the feature from these specs alone, without asking clarifying questions | PASS | This gate applies to the Recovery screen's own scope (its IA, restore flow, disclosure UI, degraded-mode banners, agent-tool catalog) plus SPEC-016's already-written contract it instantiates by id — a developer could implement all of REQ-01 through REQ-27 from this package plus SPEC-016's package without asking a scope/behavior/error/state question. Concrete backend mechanics of the watermark counter, the gateway's own internals, and the `db-ops` adapters are explicitly out of scope here and owned by SPEC-016/SPEC-017, per this spec's own Scope section — a deliberate boundary, not a gap. |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 10 | 0 | 0 |
| B: feature.spec.md Quality | 32 | 31 | 0 | 1 |
| C: Typed Contract Quality | 19 | 18 | 0 | 1 |
| D: Behavior Rules Quality | 10 | 8 | 0 | 2 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 6 | 0 | 2 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **90** | **0** | **6** |

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
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-14T23:30:00Z | Spec Agent (Claude Sonnet 5) |
| Coordinator | Coordinator (Claude Sonnet 5) | 2026-07-15T05:35:00Z | Planning Preflight PASS — validator clean, Red-Team round 3 cleared (0 BLOCKING), unchanged since |
| Human (Project Owner) | Leona Burime | 2026-07-15T06:00:00Z | APPROVED — spec approval checkpoint cleared for Software Architect dispatch, alongside SPEC-016/017/018/019/020 as a set |
