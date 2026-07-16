# Spec Definition of Done (DoD) Checklist: content-admin-core-contract

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-016 |
| feature_name | FEAT-016-content-admin-core-contract |
| version | 1.4.0 |
| filled_by | Spec Agent (Claude Sonnet 5) |
| filled_date | 2026-07-15T05:00:00Z |
| reviewed_by | Coordinator (Claude Sonnet 5) |
| reviewed_date | 2026-07-15T05:35:00Z |

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` is present in the feature folder | PASS | `SPEC-016-feature.spec.md` |
| A-02 | `feature.spec.md` is non-empty — all placeholder values have been replaced with real content | PASS | All template placeholder prose/examples were removed and replaced with real requirements, ACs, invariants, edge cases, dependencies, and open questions |
| A-03 | `api.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-016-api.spec.md` — the gated-mutation gateway's routes and agent-tool catalog are a real callable surface |
| A-04 | `state.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-016-state.spec.md` — the watermark counter/mirror and confirmation-token lifecycle are durable state this contract owns directly |
| A-05 | `orchestrator.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-016-orchestrator.spec.md` — the plan/confirm/execute sequencing is itself an orchestration contract |
| A-06 | `ui.spec.md` is present (or explicitly marked NA with justification) | NA | Omitted — this core contract has no independent UI surface; every screen is owned by its dependent domain spec's own `ui.spec.md`, recorded in `spec-manifest.md` |
| A-07 | `errors.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-016-errors.spec.md` — defines the gateway/watermark error codes dependent specs must reuse |
| A-08 | `behavior.spec.md` is present (or explicitly marked NA with justification) | PASS | `SPEC-016-behavior.spec.md` — real precedence, ordering, default, and limit rules exist |
| A-09 | `traceability.spec.md` is present and all REQ-*/AC-* rows populated (may be "pending implementation") | PASS | `SPEC-016-traceability.spec.md` — every REQ/AC/INV/EC/error code/behavior rule is seeded, all rows PENDING as expected pre-implementation |
| A-10 | `spec-manifest.md` is present and records actual filenames plus omitted files with justification | PASS | `SPEC-016-spec-manifest.md` |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` is assigned and unique | PASS | `ADS-memory/specs/001-*` and `ADS-memory/reports/pipeline/001-*` were confirmed absent before this run |
| B-02 | `version` is set to correct semver (1.0.0 for new specs) | PASS | `1.4.0` — minor version bump from `1.3.0` for this fourth Red-Team-driven revision pass (RT4-001: SPEC-016 self-defines the Postgres-backed watermark mechanism instead of delegating to SPEC-017, closing a live cross-package contradiction — not a scope change) |
| B-03 | `status` is APPROVED (not DRAFT or REVIEW) | PASS | `APPROVED` — this marks the artifact itself complete; the human spec-approval checkpoint itself is now recorded separately in this file's Sign-Off Block (Human row, 2026-07-15T06:00:00Z) |
| B-04 | `content_hash` is computed and recorded, matches the canonical hash rule | PASS | Recomputed and verified by the provider-local validator with `--update-hash` before handoff (see Validation Notes in `spec-manifest.md`) |
| B-05 | `feature_name` matches the FEAT folder name exactly | PASS | `FEAT-016-content-admin-core-contract` matches the spec folder `016-content-admin-core-contract` |
| B-06 | `last_edited` is a valid ISO-8601 UTC timestamp | PASS | `2026-07-15T05:00:00Z` — matches the header and Sign-Off Block timestamp for this v1.4.0 revision |
| B-07 | `owner` is set to a named human or team | PASS | `Leon Aburime` |
| B-08 | Overview section present, 1-3 sentences | PASS | |
| B-09 | Problem Statement present with Current/Desired state, Why now, Success signal | PASS | |
| B-10 | User Journey present with Trigger, Steps, Outcome, Alternate paths | PASS | |
| B-11 | Scope: In-scope list present and non-empty | PASS | 6 in-scope bullets |
| B-12 | Scope: Out-of-scope list present and non-empty | PASS | 6 out-of-scope bullets, each citing the owning dependent spec |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers remain | PASS | None were required — every mechanism in scope was already decided by the four Accepted ADRs |
| B-14 | All Open Questions have an owner AND a resolution target date | PASS | OQ-01 through OQ-04 each carry an Owner and a Resolve-by milestone |
| B-15 | Requirements section has at least one REQ-* item | PASS | 22 requirements (REQ-01 – REQ-22) |
| B-16 | All REQ-* items are observable/testable, no vague qualifiers | PASS | No instance of "fast/robust/intuitive/seamless" found |
| B-17 | All REQ-* items are independently verifiable | PASS | |
| B-18 | Acceptance Criteria section has at least one AC-* item | PASS | 40 acceptance criteria (AC-01 – AC-40) — AC-33/AC-34/AC-35 added in the round-1 Red-Team revision (RT-003, RT-005, RT-009); AC-36/AC-37 added for RT-012/RT-015 (`db-ops` `kind='external'` trigger and configured-but-broken Postgres tooling); AC-38 added for RT-017 (actor-class-before-plan-staleness ordering); AC-39/AC-40 added this round for RT4-001 (Postgres-backed atomic stamping and concurrent-writer serialization, now self-defined in REQ-01 instead of delegated to SPEC-017) |
| B-19 | Every REQ-* has at least one corresponding AC-* | PASS | Verified 1:1 or more for all 22 REQs |
| B-20 | All AC-* items follow Given/When/Then format | PASS | |
| B-21 | All AC-* items have a [P1]/[P2]/[P3] priority tag | PASS | 33 P1, 5 P2 — no P3 (this is a foundational safety/integrity contract; nothing in it is a nice-to-have) |
| B-22 | All P1 AC items are independently testable | PASS | |
| B-23 | No AC item requires implementation knowledge to evaluate | PASS | |
| B-24 | Invariants section has at least one INV-* item | PASS | 7 invariants (INV-01 – INV-07) |
| B-25 | All INV-* items are absolute statements ("must always"/"must never") | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | 10 edge cases (EC-01 – EC-10) — EC-09 added in the round-1 Red-Team revision (RT-009, unrecognized/forged confirmationToken); EC-10 added this round (RT-017, actor-class rule evaluated before plan-staleness check) |
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
| C-01 | All contract files use the language's type system, no comment-only behavior | PASS | yaml/TS-shaped blocks throughout `api.spec.md`/`state.spec.md`/`orchestrator.spec.md` |
| C-02 | All public interfaces and types have doc comments | PASS | Field-level Description/Notes columns and inline `#`/`//` comments document every non-obvious type |
| C-03 | All optional fields explicitly marked as optional | PASS | Every request field in `api.spec.md` §4 carries an explicit `required: true/false` |
| C-04 | Nullable fields have explicit nullable typing | PASS | `state.spec.md` §1's State Shape table has an explicit Nullable column for every field |
| C-05 | No untyped / `any` / `object` escape hatches — all types are specific | NA | This spec is a generic contract multiple future domain specs instantiate; the `object`-typed fields (`details` in `GatewayPlanResponse`, `params`/`returns` in `AgentToolDefinition`) are the explicitly-disclosed instantiation points where each dependent domain supplies its own concrete schema (see `api.spec.md` §4-5, §7) — not an undisclosed escape hatch within a single closed API |
| C-06 | Immutable constants marked per language idiom (`as const`, `Final`, etc.) | NA | Contract files here are language-neutral yaml/markdown per the Speckit compatibility format, not literal source code; fixed values (the exact 600-second TTL, the exactly-1 increment) are documented as fixed in `behavior.spec.md` §3/§4 rather than marked with a language-specific immutability idiom |
| C-07 | API contract: all endpoints registered in a single registry constant | PASS | `api.spec.md` §1 Endpoint Registry is the single registry |
| C-08 | API contract: all error codes have an HTTP status mapping | PASS | `errors.spec.md` §2 |
| C-09 | API contract: all endpoints have explicit auth requirements | PASS | `api.spec.md` §2 |
| C-10 | State contract: initial state covers all fields | PASS | `state.spec.md` §1 Initial Value column |
| C-11 | State contract: transitions/actions cover all state-changing operations | PASS | `state.spec.md` §3 Action Catalog |
| C-12 | State contract: invariants are falsifiable statements | PASS | `state.spec.md` §5 |
| C-13 | Orchestrator contract: all async outputs have an explicit result type | PASS | `Result<GatewayPlan>` / `Result<ConfirmationToken>` / `Result<domain-defined>` — the wrapper type is explicit even where the payload is intentionally domain-parametric |
| C-14 | Orchestrator contract: invariants are falsifiable statements | PASS | `orchestrator.spec.md` §6 |
| C-15 | UI contract: all components have typed props/params | NA | `ui.spec.md` is OMITTED for this core contract (see `spec-manifest.md`) |
| C-16 | UI contract: display conditions cover show/hide/disabled state | NA | Same basis as C-15 |
| C-17 | UI contract: accessibility requirements cover all components | NA | Same basis as C-15 |
| C-18 | Error contract: all error codes have HTTP status, retry, ownership, user message | PASS | `errors.spec.md` §2 and §4 |
| C-19 | Error contract: no error code missing from coverage requirements | PASS | |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover every field that can receive a value from multiple sources | PASS | Two precedence rules cover the two multi-source cases at this contract's level: `authorize()` vs. idempotency, and the watermark's authoritative value vs. its sidecar mirror |
| D-02 | Precedence rules are ordered, highest priority first | PASS | |
| D-03 | Default Values table covers every field with a non-obvious default | PASS | Token TTL, watermark initial value, mirror staleness initial value |
| D-04 | "Why" column contains a rationale, not a restatement | PASS | |
| D-05 | Limits and Bounds table covers every numeric constraint affecting behavior | PASS | Token TTL, redemption count, per-transaction increment amount |
| D-06 | Enforcement column specifies where each constraint is checked | PASS | |
| D-07 | Deduplication rules define "duplicate" precisely | NA | `behavior.spec.md` §5 is explicitly N/A — this core contract has no content-deduplication concept; that is domain-owned (e.g. Collections' reserved keys, Categories & Tags' term-merge dedup) |
| D-08 | Tie-break logic is deterministic | NA | `behavior.spec.md` §6 is explicitly N/A — this core contract has no scenario where multiple items compete for the same role; the `execute()` check sequence (§2.2) is ordered gate evaluation, not a tie-break |
| D-09 | Edge Case Handling table covers all boundary values from the Limits table | PASS | TTL boundary, redemption-count boundary (double-redeem via `TOKEN_ALREADY_REDEEMED`), and the increment-amount boundary (double-stamp-in-one-transaction row added) are all represented in §7 |
| D-10 | Every behavior rule in behavior.spec.md has a corresponding row in traceability.spec.md Section 5 | PASS | Verified 1:1 against `traceability.spec.md` §5, including the double-stamp edge case and the RT-009 unrecognized-token edge case added in this revision |

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
| F-01 | Error codes in api.spec.md are a subset of errors.spec.md | PASS | `PLAN_STALE, TOKEN_EXPIRED, TOKEN_ALREADY_REDEEMED, FORBIDDEN, UNAUTHENTICATED, VALIDATION_ERROR, RATE_LIMIT_EXCEEDED, INTERNAL_ERROR` all appear in both; `WATERMARK_BASELINE_UNAVAILABLE` appears in `errors.spec.md` only, which is a superset, not a violation |
| F-02 | Resource status types consistent across api/state/orchestrator/ui | PASS | `TokenStatus` and `ConfirmationToken` fields are identical between `state.spec.md` and the values `api.spec.md`/`orchestrator.spec.md` reference; no `ui.spec.md` exists to include |
| F-03 | OrchestratorItem fields are a valid projection of FeatureItem in state.spec.md | NA | This core contract is not an items/CRUD-list feature and has no `FeatureItem`/`OrchestratorItem` type pair; the analogous check — `orchestrator.spec.md`'s Output State Contract (`plan`, `confirmationToken`, `executionResult`) against `state.spec.md`'s State Shape (`watermark`, `mirror`, `confirmationToken`, `restorePoint`) — holds, since `confirmationToken`'s fields are identical across both files |
| F-04 | ItemSummary fields are a valid projection of OrchestratorItem in ui.spec.md | NA | `ui.spec.md` is OMITTED for this core contract |
| F-05 | Default values in orchestrator.spec.md InputProps match the Default Values table in behavior.spec.md | NA | No field in `orchestrator.spec.md` §2's Input Contract carries a Default value (all are required or conditionally required) — there is nothing to compare against `behavior.spec.md` §3's state-level defaults, so no contradiction is possible |
| F-06 | Rate limit values in api.spec.md match the Limits and Bounds table in behavior.spec.md | NA | Rate-limit values are defined once, in `api.spec.md` §3 only; `behavior.spec.md` §4 intentionally does not restate them to avoid a second source of truth, so there is no duplicate value pair to reconcile |
| F-07 | All spec files reference the same spec_id and feature_name | PASS | `SPEC-016` / `FEAT-016-content-admin-core-contract` in every file's header |
| F-08 | All spec files have consistent version numbers | PASS | `1.4.0` in every file after this revision |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First): no custom implementation where a library exists | PASS | This spec defines a backend contract already architecturally decided by ADR-021/041/043/044/045; it introduces no custom implementation choice over an available library |
| G-02 | Article II (Test-First): spec makes no assumptions about implementation order | PASS | `traceability.spec.md` marks every row PENDING; TDD has not been assumed to have run |
| G-03 | Article III (Simplicity Gate): every module in contract files traces to a requirement | PASS | Every type/entity in `api.spec.md`/`state.spec.md`/`orchestrator.spec.md` maps to at least one REQ-* |
| G-04 | Article IV (Anti-Abstraction Gate): no speculative abstractions unless 3+ concrete uses | PASS | The generic `{domain}`/`{action}` gateway parametrization has 3 named concrete consumers: Storage's forward-migration ceremony (ADR-041 §3), Recovery's restore ceremony (ADR-045 §3), and Collections' destructive-cleanup step (ADR-043 §6) — not a speculative one-off abstraction |
| G-05 | Article V (Integration-First Testing): every P1 AC has an integration test row or "pending" | PASS | All 30 P1 ACs have a PENDING row in `traceability.spec.md` §1 |
| G-06 | Article VI (Security-by-Default): api.spec.md auth requirements present for all endpoints | PASS | `api.spec.md` §2 |
| G-07 | Article VII (Spec Integrity): spec_id and content_hash present and correct | PASS | `feature.spec.md` is the canonical hash anchor per the Speckit `hash_anchor` role; every other file in this package carries the same `spec_id`/`content_hash` value for human cross-reference, and the validator's hash check is scoped to `feature.spec.md` |
| G-08 | Article VIII (Observability): errors.spec.md defines structured error payloads with correlationId | PASS | `errors.spec.md` §1 Error Envelope |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate:** a new developer can implement the feature from these specs alone, without asking clarifying questions | PASS | This gate applies to the shared core contract's own scope only (the watermark counter/mirror, the gated-mutation gateway, the actor-identity/soft-reference pattern, and the `db-ops` capability shape) — a developer could implement all of REQ-01 through REQ-22 from this package without asking a scope/behavior/error/state question. Concrete business logic for any one gated mutation (the actual migration steps, the actual restore steps) is explicitly out of scope here and owned by SPEC-017/SPEC-019, per this spec's own Scope section — that is a deliberate boundary, not a gap. |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 9 | 0 | 1 |
| B: feature.spec.md Quality | 32 | 31 | 0 | 1 |
| C: Typed Contract Quality | 19 | 14 | 0 | 5 |
| D: Behavior Rules Quality | 10 | 8 | 0 | 2 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 4 | 0 | 4 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **83** | **0** | **13** |

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
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-15T05:00:00Z | Spec Agent (Claude Sonnet 5) |
| Coordinator | Coordinator (Claude Sonnet 5) | 2026-07-15T05:35:00Z | Planning Preflight PASS — validator clean at v1.4.0, Red-Team round 5 cleared (0 BLOCKING) |
| Human (Project Owner) | Leona Burime | 2026-07-15T06:00:00Z | APPROVED — spec approval checkpoint cleared for Software Architect dispatch, alongside SPEC-016/017/018/019/020 as a set |
