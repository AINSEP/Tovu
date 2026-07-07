# Spec Definition of Done (DoD) Checklist: Site Install Dir — Instantiate a Template, Serve the Folder

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-dod.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-003 |
| feature_name | FEAT-003-site-install-dir |
| version | 1.0.0 |
| filled_by | Spec Agent |
| filled_date | 2026-07-07T02:20:00Z |
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
| A-03 | `api.spec.md` is present | PASS | Adapted to the CLI/process surface (no HTTP changes); justification in manifest |
| A-04 | `state.spec.md` is present | PASS | Install-dir layout + file schemas + template format |
| A-05 | `orchestrator.spec.md` present or NA | NA | init/serve are synchronous single-process flows; no async orchestration |
| A-06 | `ui.spec.md` present or NA | NA | CLI-only feature; the multi-site manager UI is open-design's product (ADR-011) |
| A-07 | `errors.spec.md` is present | PASS | 7 codes with exit-code registry |
| A-08 | `behavior.spec.md` is present | PASS | Ordering, commit marker, precedence |
| A-09 | `traceability.spec.md` present, all REQ/AC rows populated | PASS | Status "pending implementation" per spec-stage rule |
| A-10 | `spec-manifest.md` present with actual filenames + omission justifications | PASS | |

---

## Section B: feature.spec.md Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| B-01 | `spec_id` assigned and unique | PASS | SPEC-003 |
| B-02 | `version` correct semver | PASS | 1.0.0 |
| B-03 | `status` APPROVED | PASS | Design call (config.json vs content.db) documented in Overview; human checkpoint still gates Red-Team/Architect dispatch |
| B-04 | `content_hash` computed per canonical rule | PASS | Written by validator `--update-hash` |
| B-05 | `feature_name` matches folder | PASS | FEAT-003-site-install-dir / 003-site-install-dir |
| B-06 | Zero `[NEEDS CLARIFICATION]` markers | PASS | Open items are scoped OQ-01…OQ-04 with owners |
| B-07 | Open Questions have owner + date | PASS | OQ-01…OQ-04 |
| B-08 | REQ items testable, no vague qualifiers | PASS | |
| B-09 | Every REQ has ≥1 AC | PASS | 10 REQ / 14 AC |
| B-10 | Every AC has priority tag | PASS | |
| B-11 | ACs in Given/When/Then | PASS | |
| B-12 | Invariants absolute + falsifiable | PASS | INV-01…INV-06 |
| B-13 | Edge cases have explicit expected behavior | PASS | EC-01…EC-09 |
| B-14 | Dependencies table complete | PASS | |
| B-15 | Constitution table complete | PASS | Art. VI EXCEPTION carried over |
| B-16 | Overview present | PASS | Includes the config.json-vs-db design call and its rationale |
| B-17 | Problem statement with why-now | PASS | |
| B-18 | User journey complete | PASS | |
| B-19 | Scope in/out lists non-empty | PASS | |
| B-20 | Success signal measurable | PASS | |
| B-21 | All AC-* items have a [P1], [P2], or [P3] priority tag | PASS | 9×P1, 5×P2 |
| B-22 | All P1 AC items are independently testable | PASS | Each states its own precondition (temp-dir scenarios) |
| B-23 | No AC requires implementation knowledge to evaluate | PASS | ACs reference file layout, exit codes, and stderr contract |
| B-24 | Invariants section has at least one INV-* item | PASS | |
| B-25 | All INV-* items are absolute statements | PASS | |
| B-26 | Edge Cases section has at least one EC-* item | PASS | |
| B-27 | All EC-* items are concrete scenarios | PASS | |
| B-28 | All EC-* items have explicit Expected Behavior | PASS | |
| B-29 | Dependencies table complete — no blank Failure Mode or Fallback cells | PASS | |
| B-30 | Constitution Compliance table complete — all 8 articles marked | PASS | |
| B-31 | Any EXCEPTION has a note in this DoD or the ADR | PASS | Art. VI: no auth layer (SPEC-001 carry-over); INV-01 additionally pins path-safety for the CLI |
| B-32 | Implementation Readiness Gate in feature.spec.md complete and PASS | PASS | |

---

## Section C: Typed Contract Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| C-01 | Contract files use typed shapes | PASS | YAML-typed file schemas + command contracts |
| C-02 | Public interfaces documented | PASS | CLI commands, env inputs, stderr/exit contract |
| C-03 | Optional fields explicit | PASS | `domain`/`port` absence semantics stated |
| C-04 | Nullable fields explicitly typed | PASS | `string\|null` notation in ConfigJson |
| C-05 | No untyped escape hatches | PASS | TemplateSeedContent entries pinned to PostRecord shape (state.spec.md §2) |
| C-06 | Immutable constants marked | PASS | schemaVersion monotonicity; template files read-only |
| C-07 | Endpoints in single registry | PASS | api.spec.md §1 (command registry) |
| C-08 | All error codes have HTTP mapping | PASS | Adapted: every code has an exit-code mapping (errors.spec.md §2) |
| C-09 | All endpoints have explicit auth requirements | PASS | `LOCAL_PROCESS` profile; served HTTP surface unchanged (`AUTH_LOCAL_DEV`) |
| C-10 | Initial state covers all fields | PASS | state.spec.md §1/§2 |
| C-11 | Actions cover all state-changing ops | PASS | INIT_SITE, SERVE_SITE, STOP_SITE |
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
| D-01 | Precedence rules cover multi-source fields | PASS | port (BR-02), name (BR-03), dir-vs-env (BR-04) |
| D-02 | Precedence rules ordered | PASS | Explicit tiers; invalid values error rather than fall through |
| D-03 | Default values table covers non-obvious defaults | PASS | behavior.spec.md §3 |
| D-04 | Why column has rationale | PASS | |
| D-05 | Limits table covers behavior-affecting numerics | PASS | §4 |
| D-06 | Enforcement column filled | PASS | |
| D-07 | Duplicate defined precisely | PASS | N/A-class: no dedup semantics exist; recorded via TB-01 note (no collections) |
| D-08 | Tie-break deterministic | PASS | TB-01 records not-applicable with the future rule |
| D-09 | Edge table covers boundary values | PASS | §7 covers empty dir, file-at-path, locks, crash-mid-migration |
| D-10 | Every behavior rule has traceability row | PASS | traceability.spec.md §5 |

---

## Section E: Traceability Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| E-01 | traceability.spec.md present | PASS | |
| E-02 | Every REQ in §1 | PASS | REQ-01…REQ-10 |
| E-03 | Every AC in §1 | PASS | AC-01…AC-14 |
| E-04 | Every INV in §2 | PASS | INV-01…INV-06 |
| E-05 | Every EC in §3 | PASS | EC-01…EC-09 |
| E-06 | Every error code in §4 | PASS | 7 codes |
| E-07 | Pending rows acceptable at spec stage | PASS | All pending |
| E-08 | §7 Untraced empty | PASS | |

---

## Section F: Internal Consistency

| # | Item | Status | Notes |
|---|------|--------|-------|
| F-01 | api error codes ⊆ errors registry | PASS | Exit-code map mirrors errors.spec.md §2 |
| F-02 | Status enums consistent across files | PASS | Lifecycle states + codes consistent |
| F-03 | Orchestrator projection valid | NA | orchestrator.spec.md OMITTED per manifest — no orchestration layer |
| F-04 | UI projection valid | NA | ui.spec.md OMITTED per manifest — no UI surface |
| F-05 | Orchestrator defaults match behavior table | NA | orchestrator.spec.md OMITTED per manifest |
| F-06 | Rate limits match limits table | PASS | None-in-v1 recorded consistently |
| F-07 | Same spec_id/feature_name in all files | PASS | SPEC-003 / FEAT-003-site-install-dir |
| F-08 | Version numbers consistent | PASS | 1.0.0 everywhere |

---

## Section G: Constitution Compliance Verification

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-01 | Library-First respected | PASS | Node built-ins only; no CLI framework at two commands |
| G-02 | Test-First assumed | PASS | Process-level tests with temp dirs specified |
| G-03 | Modules trace to requirements | PASS | |
| G-04 | No speculative abstraction | PASS | TemplatePort explicitly rejected (rule-of-two fails with one template) |
| G-05 | P1 ACs have integration-test rows | PASS | Pending status at spec stage per E-07 |
| G-06 | Auth requirements present per endpoint | PASS | LOCAL_PROCESS + unchanged HTTP posture, exception recorded |
| G-07 | spec_id + hash present in all files | PASS | Contract files reference feature.spec.md as hash of record |
| G-08 | Structured errors with correlation | PASS | Machine-parseable stderr line + exit-code registry |

---

## Section H: Final Gate

| # | Item | Status | Notes |
|---|------|--------|-------|
| H-01 | **Implementation Readiness Gate** — a new developer can implement from the package alone | PASS | Layout, file schemas, template format, command contracts, ordering rules, error/exit registry, and wiring targets (index.ts/deps.ts/package.json) all specified with concrete references |

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
| Spec Agent | Claude Opus 4.8 — persona `agents/spec/skills.md` loaded this session; retroactive persona audit + Drizzle reconciliation (R1); re-ran the validator. (Original draft 2026-07-07T02:20Z was by Claude Fable 5 *before* the persona was loaded — Direct-Mode output, attribution invalid per `AI-Dev-Shop/AGENTS.md`; see note below.) | 2026-07-07T03:55:00Z | PASS — no correctness gaps found beyond attribution; ready for human spec checkpoint, then Red-Team |
| Coordinator | | | |

**Persona-audit note (retroactive, owner-approved 2026-07-07):** The original draft predated loading the Spec Agent persona file, making the prior "Spec Agent" attribution invalid per `AI-Dev-Shop/AGENTS.md`. This session loaded the persona and re-audited against the persona Workflow and Guardrails: package completeness, testable ACs, zero clarification markers, FEAT uniqueness, and validator pass all hold. Known gap (unchanged): `constitution.md` is not bootstrapped, so toolkit-default articles + the Art. VI no-auth exception apply — flagged to Coordinator. Sign-off attribution corrected above.
