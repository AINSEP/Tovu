# Spec Definition of Done (DoD) Checklist: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-004 |
| feature_name | FEAT-004-declarative-theme-system |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-07T03:40:00Z |
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
| A-03 | `api.spec.md` is present | PASS | 1 new endpoint (THEMES_LIST) + 4 modified surfaces + `HeadlessThemeId` widening |
| A-04 | `state.spec.md` is present | PASS | Theme package format as durable ecosystem state; discovery record + token/template schemas |
| A-05 | `orchestrator.spec.md` present or NA | NA | Discovery/validation/render are synchronous in-process operations; no queues or async coordination |
| A-06 | `ui.spec.md` present or NA | PASS | Appearance section generalizes 3 hardcoded themes to the discovery-driven list (REQ-11) |
| A-07 | `errors.spec.md` is present | PASS | 2 new HTTP codes + 16-code validation vocabulary + 3 carried over |
| A-08 | `behavior.spec.md` is present | PASS | Resolution chain, validation ordering, discovery precedence, activation guard, render fallback |
| A-09 | `traceability.spec.md` present, all REQ/AC rows populated | PASS | Status "pending implementation" per spec-stage rule |
| A-10 | `spec-manifest.md` present with actual filenames + omission justifications | PASS | orchestrator OMITTED with reason |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | SPEC-004; SPEC-001/002/003 exist |
| B-02 | `version` correct semver | PASS | 1.0.0 |
| B-03 | `status` APPROVED | PASS | Zero `[NEEDS CLARIFICATION]`; human checkpoint still gates Red-Team/Architect dispatch |
| B-04 | `content_hash` computed per canonical rule | PASS | Written by validator `--update-hash` |
| B-05 | `feature_name` matches folder | PASS | FEAT-004-declarative-theme-system / 004-declarative-theme-system |
| B-06 | Zero `[NEEDS CLARIFICATION]` markers | PASS | v1 boundary calls documented in Overview; deferred items are OQ-01…OQ-05 |
| B-07 | Open Questions have owner + date | PASS | OQ-01…OQ-05 (all Owner: Leon Aburime, resolve-by set) |
| B-08 | REQ items testable, no vague qualifiers | PASS | |
| B-09 | Every REQ has ≥1 AC | PASS | 11 REQ / 14 AC |
| B-10 | Every AC has priority tag | PASS | |
| B-11 | ACs in Given/When/Then | PASS | |
| B-12 | Invariants absolute + falsifiable | PASS | INV-01…INV-06 |
| B-13 | Edge cases have explicit expected behavior | PASS | EC-01…EC-09 |
| B-14 | Dependencies table complete | PASS | SPEC-001/002/003 + render.ts + presentation + contracts rows |
| B-15 | Constitution table complete | PASS | Art. VI EXCEPTION (carry-over, no-auth) + COMPLIES on new theme-data surface |
| B-16 | Overview present | PASS | Includes the four v1 boundary calls |
| B-17 | Problem statement with why-now | PASS | Phase 3 build order; second ecosystem surface after install dir |
| B-18 | User journey complete | PASS | Drop → discover → activate → revert |
| B-19 | Scope in/out lists non-empty | PASS | |
| B-20 | Success signal measurable | PASS | Built-ins pixel-equivalent; test theme activates; invalid rejected; revert restores |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | 11×P1, 3×P2 |
| B-22 | All P1 AC items are independently testable | PASS | Each P1 AC states its own precondition |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | ACs reference contract fields from api/state/errors specs |
| B-24 | Invariants section has at least one INV-* item | PASS | INV-01…INV-06 |
| B-25 | All INV-* items are absolute statements | PASS | "must always"/"must never" phrasing |
| B-26 | Edge Cases section has at least one EC-* item | PASS | EC-01…EC-09 |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION has a note in this DoD or the ADR | PASS | Art. VI carried over from SPEC-001 (B-15): no auth layer in dev server; permissions feature replaces AUTH_LOCAL_DEV before non-local deployment |
| B-32 | Implementation Readiness Gate in feature.spec.md complete and PASS | PASS | Gate result: PASS |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use typed shapes | PASS | YAML-typed contracts in api/state/ui specs |
| C-02 | Public interfaces documented | PASS | THEMES_LIST response; discovery record; token/template schemas |
| C-03 | Optional fields explicit | PASS | `styles.css`/`assets/`/`description`/`settingsSchema` marked optional |
| C-04 | Nullable fields explicitly typed | PASS | `errors[]` empty-when-valid; `active` boolean |
| C-05 | No untyped escape hatches | PASS | `settingsSchema` parsed/stored/unused in v1 is a deliberate, documented deferral (OQ-03) |
| C-06 | Immutable constants marked | PASS | `class` fixed `"declarative"`; `engine` = 1 (REQ-02); built-in ids never shadowed (INV-03) |
| C-07 | Endpoints in single registry | PASS | api.spec.md §1 |
| C-08 | All error codes have HTTP mapping | PASS | errors.spec.md §2 (THEME_NOT_FOUND 404, THEME_INVALID 422) |
| C-09 | All endpoints have explicit auth requirements | PASS | `AUTH_LOCAL_DEV` with carried-over Art. VI exception; site render routes public |
| C-10 | Initial state covers all fields | PASS | state.spec.md §1/§2 discovery record + token schema |
| C-11 | Actions cover all state-changing ops | PASS | Activation via existing presentation mutation (REQ-08); discovery is read-derived |
| C-12 | State invariants falsifiable | PASS | state.spec.md invariants + INV-01…INV-06 |
| C-13 | Orchestrator async outputs typed | NA | orchestrator.spec.md omitted (A-05) |
| C-14 | Orchestrator invariants falsifiable | NA | orchestrator.spec.md omitted (A-05) |
| C-15 | UI components typed | PASS | ui.spec.md input contracts for the Appearance list |
| C-16 | UI display conditions covered | PASS | ui.spec.md grouping/badges/activation-eligibility rules |
| C-17 | UI accessibility covered | PASS | ui.spec.md a11y section |
| C-18 | Error codes complete (status/retry/ownership/message) | PASS | errors.spec.md §2, §4; 16-code validation vocabulary in §3 |
| C-19 | No error code missing from coverage | PASS | traceability.spec.md §4 mirrors errors.spec.md (2 new + vocabulary + 3 carried) |

---

## Section D: Behavior Rules Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| D-01 | Precedence rules cover multi-source fields | PASS | Template resolution chain (BR-01); discovery precedence + shadowing (BR-04) |
| D-02 | Precedence rules ordered | PASS | BR-01 home→post/page→entry→not-found; BR-05 activation guard order, gateway last |
| D-03 | Default values table covers non-obvious defaults | PASS | Missing optional templates fall through; `paper` render fallback default |
| D-04 | Why column has rationale | PASS | |
| D-05 | Limits table covers behavior-affecting numerics | PASS | CSS ≤128 KiB, package ≤10 MiB, depth ≤50, nodes ≤5000 |
| D-06 | Enforcement column filled | PASS | Validation pipeline (REQ-06, EC-04) |
| D-07 | Duplicate defined precisely | PASS | DUP-01 case-insensitive id duplicate (EC-02); shadowing (REQ-05) |
| D-08 | Tie-break deterministic | PASS | TB-01 list ordering |
| D-09 | Edge table covers boundary values | PASS | §7 covers oversize/deep/missing-token/deleted-active boundaries |
| D-10 | Every behavior rule has traceability row | PASS | traceability.spec.md §5 (BR-01…BR-06, DUP-01, TB-01) |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | |
| E-02 | Every REQ in §1 | PASS | REQ-01…REQ-11 |
| E-03 | Every AC in §1 | PASS | AC-01…AC-14 |
| E-04 | Every INV in §2 | PASS | INV-01…INV-06 |
| E-05 | Every EC in §3 | PASS | EC-01…EC-09 |
| E-06 | Every error code in §4 | PASS | 2 new + 16-code validation vocabulary + 3 carried |
| E-07 | Pending rows acceptable at spec stage | PASS | All pending |
| E-08 | §7 Untraced empty | PASS | (none) |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors registry | PASS | THEME_NOT_FOUND / THEME_INVALID / VALIDATION_ERROR present in registry |
| F-02 | Status enums consistent across files | PASS | `valid`/`invalid`, `built-in`/`site`, `home`/`post`/`page`/`entry`/`not-found` everywhere |
| F-03 | Orchestrator projection valid | NA | orchestrator.spec.md OMITTED per manifest — no orchestration layer to project |
| F-04 | UI projection valid | PASS | ui.spec.md theme-list item ⊂ THEMES_LIST response (api.spec.md); source/status/errors/active aligned |
| F-05 | Orchestrator defaults match behavior table | NA | orchestrator.spec.md OMITTED per manifest — no InputProps to compare |
| F-06 | Rate limits match limits table | PASS | No rate limits in v1; size/complexity bounds consistent across api/state/behavior/errors |
| F-07 | Same spec_id/feature_name in all files | PASS | SPEC-004 / FEAT-004-declarative-theme-system |
| F-08 | Version numbers consistent | PASS | 1.0.0 everywhere |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Library-First respected | PASS | Validation + rendering extend existing server modules; CSS sanitization is justified security-critical owned code (ADR-010) |
| G-02 | Test-First assumed | PASS | TDD before Programmer; fixture themes (valid + each invalid class) are the test corpus |
| G-03 | Modules trace to requirements | PASS | Reader/validator/resolver/registry each trace to REQ-01…REQ-11 |
| G-04 | No speculative abstraction | PASS | No new ports; discovery reads filesystem directly (rule-of-two fails for a ThemeStorePort); registry is a plain map until plugins arrive |
| G-05 | P1 ACs have integration-test rows | PASS | Pending status at spec stage per E-07; ACs framed at HTTP/render level |
| G-06 | Auth requirements present per endpoint | PASS | Explicit AUTH_LOCAL_DEV / public profiles with recorded exception |
| G-07 | spec_id + hash present in all files | PASS | Contract files reference feature.spec.md as hash of record |
| G-08 | Structured errors with correlation | PASS | Activation inherits gateway changeSetId correlation; validation errors machine-readable + persisted (REQ-06, INV/REQ-10 logging) |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate** — a new developer can implement from the package alone | PASS | Package specifies package format, manifest schema, resolution chain, block vocabulary + registry, discovery/shadowing, validation pipeline with bounds, built-in port target, activation guard, THEMES_LIST endpoint, render fallback, and UI contracts with concrete file references (`render.ts`, `presentation.ts`, `contracts.ts`, `Appearance.tsx`); SPEC-001/002/003 dependencies explicit |

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
| Spec Agent | Spec Agent (Claude Opus 4.8, AI Dev Shop pipeline — persona `agents/spec/skills.md` loaded this session) | 2026-07-07T03:40:00Z | PASS — ready for human spec checkpoint, then Red-Team |
| Coordinator | | | |
