# Spec Definition of Done (DoD) Checklist: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-005 |
| feature_name | FEAT-005-plugin-system |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-07T04:10:00Z |
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
| A-03 | `api.spec.md` is present | PASS | 2 new admin endpoints + additive `ext` on entry DTOs + fail-closed 500 path |
| A-04 | `state.spec.md` is present | PASS | Manifest/artifact format + `ext` column + `plugin_activations` + `@tovu/sdk` surface |
| A-05 | `orchestrator.spec.md` present or NA | NA | Discovery/validation/load/hook-run are synchronous in-process operations; no async orchestration |
| A-06 | `ui.spec.md` present or NA | NA | No UI in this slice — enable/disable is API + gateway only; extension-manager UI deferred (OQ-02) |
| A-07 | `errors.spec.md` is present | PASS | 4 new HTTP codes + 18-code validation vocabulary + 3 carried |
| A-08 | `behavior.spec.md` is present | PASS | Load pipeline, validation ordering, capability enforcement, hook firing, enable/disable, `ext` writes, fail-closed |
| A-09 | `traceability.spec.md` present, all REQ/AC rows populated | PASS | Status "pending implementation" per spec-stage rule |
| A-10 | `spec-manifest.md` present with actual filenames + omission justifications | PASS | orchestrator + ui OMITTED with reasons |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | SPEC-005; SPEC-001…004 exist |
| B-02 | `version` correct semver | PASS | 1.0.0 |
| B-03 | `status` APPROVED | PASS | Zero `[NEEDS CLARIFICATION]`; human checkpoint still gates Red-Team/Architect dispatch |
| B-04 | `content_hash` computed per canonical rule | PASS | Written by validator `--update-hash` |
| B-05 | `feature_name` matches folder | PASS | FEAT-005-plugin-system / 005-plugin-system |
| B-06 | Zero `[NEEDS CLARIFICATION]` markers | PASS | v1 slice boundary owner-approved 2026-07-07; deferred surface is OQ-01…OQ-08 |
| B-07 | Open Questions have owner + date | PASS | OQ-01…OQ-08 (Owner: Leon Aburime, resolve-by set) |
| B-08 | REQ items testable, no vague qualifiers | PASS | |
| B-09 | Every REQ has ≥1 AC | PASS | 11 REQ / 16 AC |
| B-10 | Every AC has priority tag | PASS | |
| B-11 | ACs in Given/When/Then | PASS | |
| B-12 | Invariants absolute + falsifiable | PASS | INV-01…INV-07 |
| B-13 | Edge cases have explicit expected behavior | PASS | EC-01…EC-10 |
| B-14 | Dependencies table complete | PASS | SPEC-001/002/003/004 + Drizzle + `@tovu/sdk` rows |
| B-15 | Constitution table complete | PASS | Art. VI EXCEPTION (carry-over) + COMPLIES on the new third-party-code surface |
| B-16 | Overview present | PASS | Includes the prominent "come back later" deferral block + v1 boundary calls |
| B-17 | Problem statement with why-now | PASS | Tier-4 extension surface; ADR-005 "promise before first plugin" |
| B-18 | User journey complete | PASS | Build → discover → enable → hook writes `ext` → disable/revert |
| B-19 | Scope in/out lists non-empty | PASS | Out-of-scope explicitly maps to OQs |
| B-20 | Success signal measurable | PASS | word-count `ext` write; tamper refused; sdkRange refused; snapshot passes |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | 12×P1, 4×P2 |
| B-22 | All P1 AC items are independently testable | PASS | Each P1 AC states its own precondition |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | ACs reference manifest fields, error codes, `ext` payload, change sets |
| B-24 | Invariants section has at least one INV-* item | PASS | INV-01…INV-07 |
| B-25 | All INV-* items are absolute statements | PASS | "must never"/"must always" phrasing |
| B-26 | Edge Cases section has at least one EC-* item | PASS | EC-01…EC-10 |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION has a note in this DoD or the ADR | PASS | Art. VI carried from SPEC-001 (B-15): no auth layer; permissions feature replaces AUTH_LOCAL_DEV before non-local deployment |
| B-32 | Implementation Readiness Gate in feature.spec.md complete and PASS | PASS | Gate result: PASS |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use typed shapes | PASS | YAML-typed manifest/SDK/state contracts + api contracts |
| C-02 | Public interfaces documented | PASS | `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` + the `@tovu/sdk` `SdkSurface` (state.spec.md §2) |
| C-03 | Optional fields explicit | PASS | Manifest `adminSurfaces`/`provenance`/`dependencies` marked parsed-but-unused; `ext` DTO field optional |
| C-04 | Nullable fields explicitly typed | PASS | `errors[]` empty-when-valid; `file: string\|null`; deferred manifest fields `…|null` |
| C-05 | No untyped escape hatches | PASS | `ext` values constrained by declared field types; deferred fields are explicitly parsed-and-stored, unused |
| C-06 | Immutable constants marked | PASS | `class`/`engine` gate; hook-point name + capability tokens are ADR-005 public constants; built-in ids never shadowed (DUP-01) |
| C-07 | Endpoints in single registry | PASS | api.spec.md §1 |
| C-08 | All error codes have HTTP mapping | PASS | errors.spec.md §2 (404/422/422/500 + carried) |
| C-09 | All endpoints have explicit auth requirements | PASS | `AUTH_LOCAL_DEV` with carried-over Art. VI exception |
| C-10 | Initial state covers all fields | PASS | state.spec.md §1/§2 incl. `ext` default `{}` and empty `plugin_activations` |
| C-11 | Actions cover all state-changing ops | PASS | SET_PLUGIN_ENABLED, WRITE_EXT_FIELD, extended ENTRY_CREATE/UPDATE |
| C-12 | State invariants falsifiable | PASS | state.spec.md §6 |
| C-13 | Orchestrator async outputs typed | NA | orchestrator.spec.md omitted (A-05) |
| C-14 | Orchestrator invariants falsifiable | NA | orchestrator.spec.md omitted (A-05) |
| C-15 | UI components typed | NA | ui.spec.md omitted (A-06) |
| C-16 | UI display conditions covered | NA | ui.spec.md omitted (A-06) |
| C-17 | UI accessibility covered | NA | ui.spec.md omitted (A-06) |
| C-18 | Error codes complete (status/retry/ownership/message) | PASS | errors.spec.md §2, §4; validation vocabulary §3 |
| C-19 | No error code missing from coverage | PASS | traceability.spec.md §4 mirrors errors.spec.md |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover multi-source fields | PASS | Load pipeline order (BR-01); hook composition order (BR-04/TB-01) |
| D-02 | Precedence rules ordered | PASS | BR-01 numbered pipeline; BR-05 enable-guard order, gateway last |
| D-03 | Default values table covers non-obvious defaults | PASS | behavior.spec.md §10 (`ext` `{}`, unseeded disabled, zero-plugin identity) |
| D-04 | Why column has rationale | PASS | |
| D-05 | Limits table covers behavior-affecting numerics | PASS | §11 (size, id length, vocabulary/hook cardinality, queryable rule) |
| D-06 | Enforcement column filled | PASS | validator/loader codes named |
| D-07 | Duplicate defined precisely | PASS | DUP-01 case-insensitive id; site-vs-built-in shadowing |
| D-08 | Tie-break deterministic | PASS | TB-01 (list AND composition order) |
| D-09 | Edge table covers boundary values | PASS | §12 covers tamper/incompatible/undeclared-hook/undeclared-cap/fail-closed |
| D-10 | Every behavior rule has traceability row | PASS | traceability.spec.md §5 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | |
| E-02 | Every REQ in §1 | PASS | REQ-01…REQ-11 |
| E-03 | Every AC in §1 | PASS | AC-01…AC-16 |
| E-04 | Every INV in §2 | PASS | INV-01…INV-07 |
| E-05 | Every EC in §3 | PASS | EC-01…EC-10 |
| E-06 | Every error code in §4 | PASS | 4 new HTTP + validation vocabulary + 3 carried |
| E-07 | Pending rows acceptable at spec stage | PASS | All pending |
| E-08 | §7 Untraced empty | PASS | (none) |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors registry | PASS | PLUGIN_NOT_FOUND / PLUGIN_INVALID / PLUGIN_INCOMPATIBLE / PLUGIN_HOOK_FAILED present in registry |
| F-02 | Status enums consistent across files | PASS | `valid`/`invalid`/`incompatible`, `built-in`/`site`, capability + hook names aligned everywhere |
| F-03 | Orchestrator projection valid | NA | orchestrator.spec.md OMITTED per manifest — no orchestration layer |
| F-04 | UI projection valid | NA | ui.spec.md OMITTED per manifest — no UI surface |
| F-05 | Orchestrator defaults match behavior table | NA | orchestrator.spec.md OMITTED per manifest |
| F-06 | Rate limits match limits table | PASS | None-in-v1 recorded consistently; size/cardinality bounds consistent across state/behavior/errors |
| F-07 | Same spec_id/feature_name in all files | PASS | SPEC-005 / FEAT-005-plugin-system |
| F-08 | Version numbers consistent | PASS | 1.0.0 everywhere |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Library-First respected | PASS | Loader/validator/registry are core; SDK is a thin public surface; integrity + capability enforcement are justified owned code |
| G-02 | Test-First assumed | PASS | TDD before Programmer; fixture plugins + SDK snapshot test are the corpus |
| G-03 | Modules trace to requirements | PASS | Reader/validator/loader/SDK builder/hook registry/`ext` validator/activations repo each trace to REQ-01…REQ-11 |
| G-04 | No speculative abstraction | PASS | One hook point, one capability vocabulary, one `ext` column; no `PluginStorePort` (rule-of-two fails); registries are plain typed maps |
| G-05 | P1 ACs have integration-test rows | PASS | Pending status at spec stage per E-07; ACs framed at HTTP/gateway/render level |
| G-06 | Auth requirements present per endpoint | PASS | Explicit AUTH_LOCAL_DEV with recorded exception |
| G-07 | spec_id + hash present in all files | PASS | Contract files reference feature.spec.md as hash of record |
| G-08 | Structured errors with correlation | PASS | Enable/disable inherit gateway changeSetId; validation errors machine-readable + persisted; hook failures logged (EC-10) |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate** — a new developer can implement from the package alone | PASS | Package specifies artifact/manifest format, install layout, load pipeline, capability model, the one hook point + signature, `ext` field contract, enable/disable via gateway, minimal SDK + snapshot test, the bundled `word-count` plugin, list endpoint, and DTO exposure — with concrete file references (`features/post`, `infra/db/schema.ts`, `features/presentation`, `core/commands`) and ADR-003/004/005/015 grounding |

---

## Summary

| Section | Items | Passing | Failing | NA |
|---------|-------|---------|---------|-----|
| A: Package Completeness | 10 | 8 | 0 | 2 |
| B: feature.spec.md Quality | 32 | 32 | 0 | 0 |
| C: Typed Contract Quality | 19 | 14 | 0 | 5 |
| D: Behavior Rules Quality | 10 | 10 | 0 | 0 |
| E: Traceability Quality | 8 | 8 | 0 | 0 |
| F: Internal Consistency | 8 | 5 | 0 | 3 |
| G: Constitution Compliance | 8 | 8 | 0 | 0 |
| H: Final Gate | 1 | 1 | 0 | 0 |
| **TOTAL** | **96** | **86** | **0** | **10** |

**Overall DoD Result:** PASS

---

## Sign-Off Block

| Role | Name/Agent | Date | Result |
|------|-----------|------|--------|
| Spec Agent | Claude Opus 4.8 — persona `agents/spec/skills.md` loaded this session; thin walking-skeleton slice per owner direction 2026-07-07 (deferred surface tracked OQ-01…OQ-08) | 2026-07-07T04:10:00Z | PASS — ready for human spec checkpoint, then Red-Team |
| Coordinator | | | |
