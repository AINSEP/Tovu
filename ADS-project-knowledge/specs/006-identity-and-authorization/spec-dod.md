# Spec Definition of Done (DoD) Checklist: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.5.6 (SPEC-006). -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| feature_name | FEAT-006-identity-and-authorization |
| version | 0.5.6 |
| filled_by | Coordinator (Primary / Spec Agent) |
| filled_date | 2026-07-08T19:41:56Z |
| reviewed_by | pending — Coordinator Planning Preflight |
| reviewed_date | pending |

---

## How to Use This Checklist

- Each item has a **Status**: `PASS`, `FAIL`, or `NA`.
- `NA` requires a concrete written justification in Notes.
- The spec is NOT ready for Software Architect dispatch until all items are PASS or NA.
- The two previously-coupled items **B-03** (status APPROVED) and **B-32** (readiness gate) are now
  `PASS`: the DRAFT→APPROVED human checkpoint was cleared 2026-07-09 by owner Leon Aburime, following
  the completed Red-Team review (v0.5.0 applied its 1 BLOCKING + 4 ADVISORY findings; report in
  `reports/pipeline/006-identity-and-authorization/`). All items are now PASS or justified NA; the
  package is validator-green.

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` present | PASS | Present; canonical entrypoint and hash anchor. |
| A-02 | `feature.spec.md` non-empty, placeholders replaced | PASS | All template placeholders replaced with real SPEC-006 content. |
| A-03 | `api.spec.md` present (or NA) | PASS | Present; auth + api-key endpoints and the gateway gate. |
| A-04 | `state.spec.md` present (or NA) | PASS | Present; persistent server-state tables and transitions. |
| A-05 | `orchestrator.spec.md` present (or NA) | NA | No async orchestrator layer exists; authorize() is synchronous ordinary core code, marked OMITTED in the manifest with reason. |
| A-06 | `ui.spec.md` present (or NA) | NA | This feature ships API plus core only; the admin management UI is deferred to open question OQ-06, marked OMITTED in the manifest. |
| A-07 | `errors.spec.md` present (or NA) | PASS | Present; canonical error registry for this feature. |
| A-08 | `behavior.spec.md` present (or NA) | PASS | Present; matcher precedence, ordering, defaults, limits, dedup. |
| A-09 | `traceability.spec.md` present, REQ/AC rows populated | PASS | Present; all REQ/AC/INV/EC rows seeded, pending implementation. |
| A-10 | `spec-manifest.md` present, records filenames + omissions | PASS | Present; all 10 logical files listed with reasons. |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | spec_id assigned and unique | PASS | SPEC-006; unique in specs/ and reports/pipeline/. |
| B-02 | version correct semver | PASS | 0.5.6. |
| B-03 | status is APPROVED (not DRAFT or REVIEW) | PASS | Status is APPROVED; DRAFT→APPROVED human checkpoint cleared 2026-07-09 by owner Leon Aburime after the completed Red-Team review. |
| B-04 | content_hash computed, matches canonical rule | PASS | Recomputed by the provider validator after the 0.5.0 Red-Team additions. |
| B-05 | feature_name matches FEAT folder name | PASS | FEAT-006-identity-and-authorization. |
| B-06 | last_edited valid ISO-8601 UTC | PASS | 2026-07-08. |
| B-07 | owner set to named human/team | PASS | Leon Aburime. |
| B-08 | Overview present, 1–3 sentences | PASS | Present. |
| B-09 | Problem Statement complete (current/desired/why now/success) | PASS | All four sub-fields present. |
| B-10 | User Journey has trigger/steps/outcome/alternate | PASS | Present. |
| B-11 | Scope in-scope non-empty | PASS | Twelve in-scope bullets. |
| B-12 | Scope out-of-scope non-empty | PASS | Seven deferred items mapped to OQs. |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers | PASS | None present. |
| B-14 | All Open Questions have owner AND resolution date | PASS | OQ-01..08 each carry an owner and an ISO resolution target (OQ-08 added 0.5.0 for the RT-001 CLI-auth revisit). |
| B-15 | At least one REQ | PASS | REQ-01..14 (REQ-13 CLI/core auth, REQ-14 rate limiting added 0.5.0). |
| B-16 | REQ observable/testable, no vague qualifiers | PASS | Each REQ is concrete; no "fast/robust/intuitive" language. |
| B-17 | REQ independently verifiable | PASS | Each REQ testable without another REQ. |
| B-18 | At least one AC | PASS | AC-01..26 (AC-17..21 added 0.5.0; AC-22 added 0.5.1; AC-23 added 0.5.2; AC-24 added 0.5.3; AC-25 added 0.5.4; AC-26 added 0.5.5). |
| B-19 | Every REQ has at least one AC | PASS | Direct: REQ-02..14 tagged (REQ-13→AC-17, REQ-14→AC-18, REQ-01 now directly tagged by AC-19/AC-22/AC-23, REQ-08 by AC-15/AC-23/AC-25/AC-26, REQ-02/INV-07 by AC-24/AC-25). Remaining cross-reference: REQ-12 by AC-10 (permissions-list enumeration). Flagged as a candidate for an explicit REQ-12 AC tag in a later revision. |
| B-20 | AC follow Given/When/Then | PASS | All ACs use Given/When/Then. |
| B-21 | AC have [P1]/[P2]/[P3] tags | PASS | Every AC tagged. |
| B-22 | P1 AC independently testable | PASS | Each P1 AC verifiable in isolation. |
| B-23 | No AC requires implementation knowledge | PASS | Data-layer outcomes (change-set actorId, composite-FK rejection) are the inherent observable surface of an identity/audit feature and are observable via the audit trail and API, not internal store internals. |
| B-24 | At least one INV | PASS | INV-01..08 (INV-08 last-owner-lockout added 0.5.0). |
| B-25 | INV absolute statements | PASS | Each uses "never/always/exactly one". |
| B-26 | At least one EC | PASS | EC-01..13 (EC-12 CLI auth, EC-13 expired session added 0.5.0). |
| B-27 | EC concrete scenarios | PASS | Each is a specific "what happens when X". |
| B-28 | EC explicit Expected Behavior | PASS | Every EC has an Expected line. |
| B-29 | Dependencies table complete, no blank cells | PASS | Six dependencies with failure mode + fallback filled. |
| B-30 | Constitution Compliance table complete (8 articles) | PASS | Articles I–VIII all marked COMPLIES (section added 0.4.1). |
| B-31 | Any EXCEPTION has a note | PASS | No EXCEPTION taken; all eight articles COMPLIES, so vacuously satisfied. |
| B-32 | Implementation Readiness Gate complete and shows PASS | PASS | The gate now shows PASS — the final item (status=APPROVED, coupled to B-03) was checked at the 2026-07-09 DRAFT→APPROVED human checkpoint. |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contracts use a type system, not comment-only behavior | PASS | api/state/errors use typed language-neutral shapes. |
| C-02 | Public interfaces/types have doc comments | PASS | Security-relevant and non-obvious contract fields carry descriptions; trivially-named fields (`id`, `createdAt`) may not (external audit Fable F6). |
| C-03 | Optional fields explicitly marked optional | PASS | `required: false` used throughout. |
| C-04 | Nullable fields explicitly nullable | PASS | `| null` / `nullable: true` used explicitly. |
| C-05 | No untyped/any/object escape hatches | PASS | The only object-typed fields are error `details` (bounded by per-code schemas in errors §3) and `constraint_json` (a documented deferred ABAC seam, OQ-03). |
| C-06 | Immutable constants marked in idiom | PASS | The permission catalog is code-registered (`as const` idiom); built-in roles/policies flagged `is_builtin`. |
| C-07 | API endpoints in a single registry constant | PASS | api.spec §1 Endpoint Registry. |
| C-08 | All error codes have HTTP status mapping | PASS | errors.spec §2. |
| C-09 | Endpoints have explicit auth requirements | PASS | api.spec §2 auth profiles cover every endpoint. |
| C-10 | State initial state covers all fields | PASS | state.spec §1 + §3 SEED_FIRST_BOOT. |
| C-11 | Transitions cover all state-changing operations | PASS | state.spec §3 action catalog. |
| C-12 | State invariants are falsifiable | PASS | state.spec §5 maps to INV-01..08. |
| C-13 | Orchestrator async outputs have explicit result types | NA | No orchestrator contract exists for this feature; there is no async orchestrator layer to type. |
| C-14 | Orchestrator invariants falsifiable | NA | No orchestrator contract exists; there are no orchestrator invariants to falsify here. |
| C-15 | UI components have typed props | NA | No UI contract in v1; the admin management interface is deferred to OQ-06. |
| C-16 | UI display conditions cover show/hide/disabled | NA | No UI surface exists in this API-plus-core feature; display conditions do not apply. |
| C-17 | UI accessibility covers all components | NA | No UI components exist in v1; accessibility requirements do not apply here. |
| C-18 | Error contract complete (status/retry/ownership/message) | PASS | errors.spec §2 + §4 cover all four dimensions. |
| C-19 | No error code missing from coverage | PASS | Every emitted code is registered and traced. |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence covers every multi-source field | PASS | authorize() matcher (§1.1) covers the one multi-source decision. |
| D-02 | Precedence ordered highest-first | PASS | §1.1 lists disabled → owner `*` → exact match → fail-closed. |
| D-03 | Defaults table covers non-obvious defaults | PASS | §3 covers status/resource_type/constraint_json/is_builtin/expiry/cookie flags. |
| D-04 | Why column is rationale, not restatement | PASS | Each default has a reason, not a value echo. |
| D-05 | Limits table covers numeric constraints | PASS | §4 covers hashing, lengths, rate limits, wildcard scope. |
| D-06 | Enforcement column present | PASS | Each limit marks its enforcement layer. |
| D-07 | Deduplication defines duplicate precisely | PASS | §5.1: username, per workspace, NFC + case-insensitive. |
| D-08 | Tie-break deterministic | PASS | §6.1 OR-semantics; deterministic given the DB snapshot. |
| D-09 | Edge-case table covers boundary values | PASS | §7 covers scope mismatch, disabled principal, clamp, replay, seed. |
| D-10 | Every behavior rule has a traceability §5 row | PASS | Ten behavior rules mapped in traceability §5. |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | Present. |
| E-02 | Every REQ appears in §1 | PASS | REQ-01..14 present. |
| E-03 | Every AC appears in §1 | PASS | AC-01..26 present. |
| E-04 | Every INV appears in §2 | PASS | INV-01..08 present. |
| E-05 | Every EC appears in §3 | PASS | EC-01..13 present. |
| E-06 | Every error code appears in §4 | PASS | Ten codes present (added `OWNER_REQUIRED` in 0.5.1). |
| E-07 | Pending rows acceptable at spec stage | PASS | All rows pending pre-TDD; no FAIL for pending. |
| E-08 | §7 (Untraced) is empty | PASS | Empty; confirmed all IDs are in the matrix. |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors codes | PASS | Every code in api.spec §6 is registered in errors.spec §2. |
| F-02 | Status/enum types consistent across present files | PASS | `kind` and `status` enums identical in api.spec and state.spec. |
| F-03 | OrchestratorItem is a valid projection of FeatureItem | NA | No orchestrator contract exists; there is no OrchestratorItem to reconcile against state. |
| F-04 | ItemSummary is a valid projection of OrchestratorItem | NA | No UI contract exists; there is no ItemSummary projection to check here. |
| F-05 | Orchestrator InputProps defaults match behavior defaults | NA | No orchestrator contract exists; there are no InputProps defaults to align with behavior. |
| F-06 | Rate-limit values match between api and behavior | PASS | api.spec §3 and behavior.spec §4 carry identical login/write/read limits. |
| F-07 | All files reference same spec_id and feature_name | PASS | SPEC-006 / FEAT-006-identity-and-authorization everywhere. |
| F-08 | Consistent version numbers | PASS | All package files are 0.5.1 (binding comments corrected in 0.5.1 — delta-audit SF-3). |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Article I (Library-First) | PASS | argon2 library and Drizzle repos, not custom implementations. Hand-rolled session store (REQ-06) + rate limiter (REQ-14) carry a Red-Team RT-006 Architect note: record a Complexity Justification (adopt a library or justify ownership) in ADR-021. Not an EXCEPTION at spec stage — the control is flagged for the Architect, not waived. |
| G-02 | Article II (Test-First) | PASS | TDD dispatched before Programmer; no implementation-order assumptions. |
| G-03 | Article III (Simplicity Gate) | PASS | Every contract module traces to a REQ (traceability §1). |
| G-04 | Article IV (Anti-Abstraction) | PASS | authorize() is not a port (ADR-006); only HasherPort, a rule-of-two candidate. |
| G-05 | Article V (Integration-First) | PASS | Every P1 AC has an integration test row (pending pre-TDD) in traceability §1. |
| G-06 | Article VI (Security-by-Default) | PASS | Every endpoint has an auth profile (api §2); this feature is the security surface. |
| G-07 | Article VII (Spec Integrity) | PASS | spec_id and content_hash present and correct across files. |
| G-08 | Article VIII (Observability) | PASS | errors.spec defines a correlationId envelope for all server-side errors. |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | Implementation Readiness Gate: a new developer can implement from these specs alone | PASS | The package specifies schema, authorize() semantics, endpoints, error codes, defaults, limits, and edge cases with no open scope questions blocking build; the only pending item is the approval ceremony, not content. |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 8 | 0 | 2 |
| B: feature.spec.md Quality | 32 | 30 | 2 | 0 |
| C: Typed Contract Quality | 19 | 14 | 0 | 5 |
| D: Behavior Rules Quality | 10 | 10 | 0 | 0 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 5 | 0 | 3 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **86** | **0** | **10** |

**Overall DoD Result:** PASS

> The two previously-coupled blocking items — **B-03** (feature.spec status) and **B-32** (the
> Implementation Readiness Gate) — are now PASS. The DRAFT→APPROVED human checkpoint was cleared
> 2026-07-09 by owner Leon Aburime, following the completed Red-Team review. Every item is PASS or
> justified NA; no other change was made to resolve the gate.

---

## Blocking Issues (if FAIL)

| Item | Issue | Required Change | Owner | Target Date |
|------|-------|----------------|-------|-------------|
| Item B-03 (status gate) | ~~feature.spec status is DRAFT~~ | RESOLVED 2026-07-09 — status flipped DRAFT→APPROVED at the human checkpoint after the completed Red-Team review | Leon Aburime (human checkpoint) | ✅ cleared 2026-07-09 |
| Item B-32 (readiness gate) | ~~Readiness Gate shows CONDITIONAL PASS~~ | RESOLVED 2026-07-09 — resolved with B-03; status→APPROVED checked the last gate item | Leon Aburime (human checkpoint) | ✅ cleared 2026-07-09 |
| Item B-19 (advisory) | REQ-12 lacks an AC that tags it directly (coverage via AC-10); REQ-01 now directly tagged by AC-19 (0.5.0) | Optional: add an explicit REQ-12 acceptance criterion in a later revision | Spec Agent | future revision |

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Coordinator (Primary / Spec Agent) | 2026-07-08T19:41:56Z | v0.5.0 Red-Team revision applied (RT-001 BLOCKING + RT-002..005 ADVISORY; RT-006 → Architect). Package complete and internally consistent; sole open gate is the DRAFT→APPROVED checkpoint (B-03/B-32) |
| Coordinator | Coordinator (Primary / Claude Opus 4.8) | 2026-07-09T00:00:00Z | Planning Preflight verified: owner Leon Aburime cleared the DRAFT→APPROVED checkpoint (B-03/B-32 → PASS) after the completed Red-Team review; package is validator-green (canonical hash sha256:d1a88416…). Cleared for Software Architect / `/plan` dispatch. |

> By signing, the Coordinator confirms:
> 1. All items in this checklist are PASS or NA with written justification.
> 2. The spec-system package is internally consistent.
> 3. The Implementation Readiness Gate (H-01) is PASS.
> 4. The spec is authorized for dispatch to the Software Architect Agent.
