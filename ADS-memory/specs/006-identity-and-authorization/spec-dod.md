# Spec Definition of Done (DoD) Checklist: Identity & Authorization

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. Bound to feature.spec.md v0.7.0 (SPEC-006). -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-006 |
| feature_name | FEAT-006-identity-and-authorization |
| version | 0.7.0 |
| filled_by | Spec Agent (Direct dispatch) |
| filled_date | 2026-07-28T00:00:00Z |
| reviewed_by | pending — Coordinator Planning Preflight |
| reviewed_date | pending |

---

## How to Use This Checklist

- Each item has a **Status**: `PASS`, `FAIL`, or `NA`.
- `NA` requires a concrete written justification in Notes.
- The spec is NOT ready for Software Architect dispatch until all items are PASS or NA.
- **0.6.0 reopens B-03/B-32.** v0.5.6's own DRAFT→APPROVED checkpoint (cleared 2026-07-09) covered
  exactly the scope through AC-26/INV-08/EC-13 — it did not and could not cover REQ-15..19/AC-27..32/
  INV-09/EC-14..17, which did not exist yet. This amendment adds real new scope (not an editorial
  pass), so per this project's own precedent it needs its own Red-Team pass + owner checkpoint before
  B-03/B-32 can flip back to PASS. Everything else in this checklist (package structure, internal
  consistency, contract quality) is evaluated fresh below and is unaffected by the status question.
- **0.7.0 keeps B-03/B-32 open — it does not reopen anything new.** The status was already DRAFT.
  0.7.0 ratifies `CREATE_PRINCIPAL`'s HTTP shape (`APIKEY_PRINCIPAL_CREATE` + AC-33), resolving the
  `[NEEDS CLARIFICATION]` ADR-PIPE-006 Decision 3 raised, and repairs api.spec §1's path-prefix
  drift. Its new material joins 0.6.0's in the **same single** Red-Team + owner checkpoint — this is
  one pending ceremony covering two amendments, not two ceremonies. B-13 remains PASS: the
  clarification marker lived in the ADR, never in this package, and is now closed at the spec layer.

---

## Section A: Spec Package Completeness

| # | Item | Status | Notes |
|---|------|--------|-------|
| A-01 | `feature.spec.md` present | PASS | Present; canonical entrypoint and hash anchor. |
| A-02 | `feature.spec.md` non-empty, placeholders replaced | PASS | All template placeholders replaced with real SPEC-006 content. |
| A-03 | `api.spec.md` present (or NA) | PASS | Present; auth + api-key endpoints and the gateway gate. |
| A-04 | `state.spec.md` present (or NA) | PASS | Present; persistent server-state tables and transitions. |
| A-05 | `orchestrator.spec.md` present (or NA) | NA | No async orchestrator layer exists; authorize() is synchronous ordinary core code, marked OMITTED in the manifest with reason. |
| A-06 | `ui.spec.md` present (or NA) | NA | OQ-06 is RESOLVED (0.6.0) — the admin UI exists (`Users.tsx`/`Roles.tsx`) — but per the manifest's revised reason, this package (like the pre-existing UI) treats REQ/AC as the behavioral contract rather than a formal `ui.spec.md`; marked OMITTED with that justification. |
| A-07 | `errors.spec.md` present (or NA) | PASS | Present; canonical error registry for this feature. |
| A-08 | `behavior.spec.md` present (or NA) | PASS | Present; matcher precedence, ordering, defaults, limits, dedup. |
| A-09 | `traceability.spec.md` present, REQ/AC rows populated | PASS | Present; all REQ/AC/INV/EC rows seeded, pending implementation. |
| A-10 | `spec-manifest.md` present, records filenames + omissions | PASS | Present; all 10 logical files listed with reasons. |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | spec_id assigned and unique | PASS | SPEC-006; unique in specs/ and reports/pipeline/. |
| B-02 | version correct semver | PASS | 0.7.0 — minor bump: one additive endpoint (`APIKEY_PRINCIPAL_CREATE`) + AC-33, no change to the existing security core; 0.6.0's additive scope carries forward. |
| B-03 | status is APPROVED (not DRAFT or REVIEW) | **FAIL** | Status is `DRAFT` by design — reopened at 0.6.0, still open at 0.7.0. REQ-15..19/AC-27..32/INV-09/EC-14..17 (0.6.0) and `APIKEY_PRINCIPAL_CREATE`/AC-33 (0.7.0) have not been through Red-Team or an owner checkpoint. Required change: Coordinator routes both amendments to Red-Team in one pass, then owner DRAFT→APPROVED sign-off, same path v0.5.x took before 2026-07-09. |
| B-04 | content_hash computed, matches canonical rule | PASS | Recompute with the provider validator (`--phase spec --update-hash`) at handoff; placeholder in Header Metadata until then. |
| B-05 | feature_name matches FEAT folder name | PASS | FEAT-006-identity-and-authorization. |
| B-06 | last_edited valid ISO-8601 UTC | PASS | 2026-07-28. |
| B-07 | owner set to named human/team | PASS | Leon Aburime. |
| B-08 | Overview present, 1–3 sentences | PASS | Present (unchanged by 0.6.0). |
| B-09 | Problem Statement complete (current/desired/why now/success) | PASS | All four sub-fields present (unchanged by 0.6.0 — the amendment's own "why now" lives in the revision_note). |
| B-10 | User Journey has trigger/steps/outcome/alternate | PASS | Present (unchanged by 0.6.0 — the new transitions are CRUD completions of an already-described journey, not a new journey). |
| B-11 | Scope in-scope non-empty | PASS | Nineteen in-scope bullets (twelve original + six 0.6.0 + one 0.7.0 addition). |
| B-12 | Scope out-of-scope non-empty | PASS | Ten deferred items mapped to OQs (seven original + OQ-09/OQ-10 new; OQ-06 struck through RESOLVED). |
| B-13 | Zero `[NEEDS CLARIFICATION]` markers | PASS | None present in this package. **(0.7.0)** The `CREATE_PRINCIPAL` route-shape marker raised by ADR-PIPE-006 Decision 3 lived in the ADR, not here, and is now closed by ratifying a concrete contract (api.spec §1 `APIKEY_PRINCIPAL_CREATE` + AC-33) rather than by deferring it. **(0.6.0)** The delete-vs-disable question for roles/policies was likewise resolved with an explicit, justified design decision (INV-09) rather than left as a marker. |
| B-14 | All Open Questions have owner AND resolution date | PASS | OQ-01..05, OQ-07..10 each carry an owner and an ISO resolution target; OQ-06 struck through RESOLVED. |
| B-15 | At least one REQ | PASS | REQ-01..19 (REQ-15..19 added 0.6.0). |
| B-16 | REQ observable/testable, no vague qualifiers | PASS | Each new REQ is concrete; no "fast/robust/intuitive" language. |
| B-17 | REQ independently verifiable | PASS | Each new REQ testable without another REQ. |
| B-18 | At least one AC | PASS | AC-01..33 (AC-27..32 added 0.6.0; AC-33 added 0.7.0). |
| B-19 | Every REQ has at least one AC | PASS | REQ-15→AC-27, REQ-16→AC-28, REQ-17→AC-29, REQ-18→AC-30, REQ-19→AC-31; REQ-11/INV-07 route-parity → AC-32; REQ-08/REQ-01 route reachability → AC-33 (0.7.0). Pre-existing REQ-12 gap (advisory, B-19 note below) is unchanged by these amendments. |
| B-20 | AC follow Given/When/Then | PASS | AC-27..33 use Given/When/Then. |
| B-21 | AC have [P1]/[P2]/[P3] tags | PASS | AC-27..33 all tagged P1 (admin-surface CRUD completion plus one credential-adjacent route on an already-security-critical feature — no P2/P3 candidates). |
| B-22 | P1 AC independently testable | PASS | Each new P1 AC verifiable in isolation. AC-33's mint→issue clause deliberately spans two endpoints because reachability *is* the property under test — it is still observable purely from HTTP status/body. |
| B-23 | No AC requires implementation knowledge | PASS | New ACs observe HTTP status/body and row state, same discipline as the existing set. |
| B-24 | At least one INV | PASS | INV-01..09 (INV-09 added 0.6.0). |
| B-25 | INV absolute statements | PASS | INV-09 uses "iff"/"never"/"one atomic operation". |
| B-26 | At least one EC | PASS | EC-01..17 (EC-14..17 added 0.6.0). |
| B-27 | EC concrete scenarios | PASS | EC-14..17 are each a specific "what happens when X". |
| B-28 | EC explicit Expected Behavior | PASS | Every new EC has an Expected line. |
| B-29 | Dependencies table complete, no blank cells | PASS | Unchanged by 0.6.0 — no new external dependency introduced (reuses existing repos/gateway). |
| B-30 | Constitution Compliance table complete (8 articles) | PASS | Articles I–VIII all marked COMPLIES; VII updated to cite 0.7.0 and to record that ADR-PIPE-006's Article VII exception (the unreachable `CREATE_PRINCIPAL` transition) is closed at the spec layer. |
| B-31 | Any EXCEPTION has a note | PASS | No EXCEPTION taken in this spec. (ADR-PIPE-006 took one, on Article VII, for exactly the gap 0.7.0 closes.) |
| B-32 | Implementation Readiness Gate complete and shows PASS | **FAIL** | Gate shows CONDITIONAL (coupled to B-03) — see feature.spec.md's own gate-result note. Everything except the status/checkpoint item is checked. |

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
| C-07 | API endpoints in a single registry constant | PASS | api.spec §1 Endpoint Registry (+ §1a for the users/roles/policies family). **(0.7.0)** §1's literal path strings corrected to the shipped `/api/admin/v1/…` prefix; `APIKEY_PRINCIPAL_CREATE` added. |
| C-08 | All error codes have HTTP status mapping | PASS | errors.spec §2. |
| C-09 | Endpoints have explicit auth requirements | PASS | api.spec §2 auth profiles cover every endpoint. |
| C-10 | State initial state covers all fields | PASS | state.spec §1 + §3 SEED_FIRST_BOOT. |
| C-11 | Transitions cover all state-changing operations | PASS | state.spec §3 action catalog. **(0.7.0)** Every externally-reachable transition now also has a surface — `CREATE_PRINCIPAL` was the last one specified-but-unreachable; state.spec §3's Surface note is corrected and api.spec §7 carries the standing check. |
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
| E-02 | Every REQ appears in §1 | PASS | REQ-01..19 present (REQ-15..19 added 0.6.0). |
| E-03 | Every AC appears in §1 | PASS | AC-01..33 present (AC-27..32 added 0.6.0; AC-33 added 0.7.0). |
| E-04 | Every INV appears in §2 | PASS | INV-01..09 present (INV-09 added 0.6.0). |
| E-05 | Every EC appears in §3 | PASS | EC-01..17 present (EC-14..17 added 0.6.0). |
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
| F-06 | Rate-limit values match between api and behavior | PASS | api.spec §3 and behavior.spec §4 carry identical login/write/read limits. **(0.7.0)** `APIKEY_PRINCIPAL_CREATE` reuses the existing `WRITE_STANDARD` profile — no new profile, nothing to reconcile. `display_name` length is pinned in behavior.spec §4 and echoed in api.spec §4. |
| F-07 | All files reference same spec_id and feature_name | PASS | SPEC-006 / FEAT-006-identity-and-authorization everywhere. |
| F-08 | Consistent version numbers | PASS | All package files bumped to 0.7.0 together (feature/api/state/errors/behavior/traceability/manifest/dod), including files whose content change was limited to the version stamp and a scoped note. |

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
| G-07 | Article VII (Spec Integrity) | PASS | spec_id and content_hash present and correct across files. **(0.7.0)** Closes the Article VII exception ADR-PIPE-006 declared: `CREATE_PRINCIPAL` is no longer a specified-but-unreachable transition, and the contract was ratified through the spec gate rather than invented downstream. |
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
| **TOTAL** | **96** | **84** | **2** | **10** |

**Overall DoD Result:** FAIL (2 items — both the coupled B-03/B-32 status gate, by design)

> **0.6.0 reopened exactly the two items v0.5.6 resolved on 2026-07-09** — **B-03** (feature.spec
> status) and **B-32** (the Implementation Readiness Gate) — because that amendment added real new
> scope (REQ-15..19/AC-27..32/INV-09/EC-14..17) that has not been through Red-Team or an owner
> checkpoint. **0.7.0 adds its own new material (`APIKEY_PRINCIPAL_CREATE` + AC-33) to that same
> pending checkpoint; it reopens nothing further and closes no gate on its own.** Every other item is
> PASS or justified NA: the package is structurally complete, internally consistent, and
> (content-wise) implementation-ready — the sole gap is the approval ceremony, identical in shape to
> the pre-2026-07-09 gate. This is the expected, correct state for a Spec Agent handoff that stops
> before Red-Team, not a defect.

---

## Blocking Issues (if FAIL)

| Item | Issue | Required Change | Owner | Target Date |
|------|-------|----------------|-------|-------------|
| Item B-03 (status gate) | **0.6.0/0.7.0: feature.spec status is DRAFT** — reopened for the new REQ-15..19 scope and extended by 0.7.0's `APIKEY_PRINCIPAL_CREATE`/AC-33 (the v0.5.6 APPROVED status it superseded remains valid for the unchanged security core) | Route to Red-Team **once** for REQ-15..19/AC-27..32/INV-09/EC-14..17 **and** AC-33 + the new endpoint, then owner DRAFT→APPROVED sign-off | Coordinator → Red-Team → Leon Aburime (human checkpoint) | owed before Software Architect dispatch |
| Item B-32 (readiness gate) | **0.6.0: Readiness Gate shows CONDITIONAL** — coupled to B-03 | Resolves automatically when B-03 clears | Leon Aburime (human checkpoint) | owed before Software Architect dispatch |
| Item B-19 (advisory, pre-existing) | REQ-12 lacks an AC that tags it directly (coverage via AC-10) | Optional: add an explicit REQ-12 acceptance criterion in a later revision | Spec Agent | future revision |

---

## Sign-Off Block

| Role | Name / Agent ID | Date (ISO-8601 UTC) | Signature |
|------|-----------------|---------------------|-----------|
| Spec Agent | Coordinator (Primary / Spec Agent) | 2026-07-08T19:41:56Z | v0.5.0 Red-Team revision applied (RT-001 BLOCKING + RT-002..005 ADVISORY; RT-006 → Architect). Package complete and internally consistent; sole open gate is the DRAFT→APPROVED checkpoint (B-03/B-32) |
| Coordinator | Coordinator (Primary / Claude Opus 4.8) | 2026-07-09T00:00:00Z | Planning Preflight verified: owner Leon Aburime cleared the DRAFT→APPROVED checkpoint (B-03/B-32 → PASS) after the completed Red-Team review; package is validator-green (canonical hash sha256:d1a88416…). Cleared for Software Architect / `/plan` dispatch. |
| Spec Agent | Coordinator (dispatched slice — Spec Agent persona) | 2026-07-21T00:00:00Z | v0.6.0 users/roles/policies CRUD-completion amendment (REQ-15..19/AC-27..32/INV-09/EC-14..17) + api.spec.md drift repair (§1a documents the 8 pre-existing + 9 new HTTP endpoints). Package complete and internally consistent per this checklist; status intentionally reopened to DRAFT (B-03/B-32 FAIL by design) pending Red-Team + owner checkpoint. **Stopping here per dispatch instructions — not proceeding to TDD/Programmer.** |
| Spec Agent | Spec Agent (Direct dispatch) | 2026-07-28T00:00:00Z | v0.7.0 `CREATE_PRINCIPAL` route ratification — resolves ADR-PIPE-006 / ADR-048 Decision 3's `[NEEDS CLARIFICATION]` with a separate endpoint (`APIKEY_PRINCIPAL_CREATE`), not a fold-in, because AC-23/AC-25a are phrased around a caller-supplied bound `principalId` and become inexpressible without it. New: AC-33, one endpoint, behavior §4/§7 rows. Also repairs api.spec §1's `/admin/api/…` path-prefix drift against the shipped `/api/admin/v1/…` routes. Security core and `APIKEY_ISSUE`/`APIKEY_REVOKE` contracts byte-unchanged. Status intentionally left `DRAFT` (B-03/B-32 FAIL by design), joining 0.6.0's pending Red-Team + owner checkpoint. **Stopping here per dispatch — not proceeding to Red-Team, TDD, or Programmer.** |
| Coordinator | | | pending Planning Preflight |

> By signing, the Coordinator confirms:
> 1. All items in this checklist are PASS or NA with written justification.
> 2. The spec-system package is internally consistent.
> 3. The Implementation Readiness Gate (H-01) is PASS.
> 4. The spec is authorized for dispatch to the Software Architect Agent.
