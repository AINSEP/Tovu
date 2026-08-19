# Pipeline State: 049-esm-migration

| Field | Value |
|-------|-------|
| feature | 049-esm-migration |
| feat_id | FEAT-049-esm-migration |
| spec_id | SPEC-049 |
| spec_provider | speckit |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/049-esm-migration/ |
| spec_entrypoint_path | ADS-memory/specs/049-esm-migration/feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/049-esm-migration/spec-dod.md |
| spec_support_paths | ADS-memory/specs/049-esm-migration/behavior.spec.md, ADS-memory/specs/049-esm-migration/traceability.spec.md, ADS-memory/specs/049-esm-migration/spec-manifest.md |
| spec_naming | standard |
| spec_mode | migration |
| provider_mode | ai-dev-shop-speckit-compatibility |
| spec_hash | sha256:af12b9f5cc28ea909a62730ed39d59d18897bc5d25de4822aa8dee7f44016fab (v1.1.0) |
| spec_hash_verified_at | 2026-08-18T04:00:00Z |
| validator_result | PASS (`--phase spec --update-hash`, 2026-08-18T04:00:00Z) — zero errors, zero warnings. v1.0.0's validator run (2026-08-18T00:00:00Z) failed with 6 errors, all tracing to the 2 unresolved `[NEEDS CLARIFICATION]` markers; both were resolved by human decision and the v1.1.0 revision pass now validates clean. |
| validator_manual_waiver | N/A |
| planning_preflight_status | NOT STARTED — spec is handoff-ready (both clarifications resolved, validator clean, spec-dod.md overall PASS), but Coordinator Planning Preflight and Red-Team/Software Architect dispatch are **intentionally held** per explicit human instruction (stepping away, will resume later) |
| planning_preflight_checked_at | |
| red_team_status | NOT DISPATCHED — spec not yet clarification-clean |
| red_team_completed_at | |
| red_team_spec_hash | |
| red_team_artifact | |
| codebase_analysis_reports | ADS-memory/reports/codebase-analysis/MIGRATION-esm-2026-08-18.md |
| system_blueprint_path | none — no System Design blueprint was run for this feature (internal engineering/infrastructure change, no UI/data-model/external-contract surface) |
| system_blueprint_status | N/A — compact functional-model self-check and compact NFR light pass run directly by Spec Agent per persona workflow steps 5–6 |
| reverse_spec_review_status | N/A — not reverse-spec-derived |

## Non-Functional Requirements — Compact Light Pass

Run directly by Spec Agent (no System Design blueprint exists for this feature). Full category table omitted per compact-mode guidance (only categories with a real signal are recorded); all uncovered categories are `N/A` for this feature (internal module-system migration, no new UI/data/traffic surface).

| Category | Status | Summary / Assumption | Unknown Class | Downstream Owner |
|---|---|---|---|---|
| Portability / Environment Constraints | Applicable | Migration safety depends on the deploy Node runtime's support for stable synchronous `require(esm)` (Node 24+) vs. the current floor (`engines.node >=20.6.0`, Docker `NODE_VERSION=22`) | BLOCKING | Human (REQ-08 clarification) — see handoff Q1 |
| Maintainability / Evolvability | Applicable | Bottom-up wave structure exists specifically to keep blast radius small and revertible per change, and to remove the CJS-interop shim's fixed dead-coverage cost per file | SAFE DEFAULT | Software Architect (wave-coexistence mechanism, OQ-01) |
| Testability / Verifiability | Applicable | Every wave's merge gate requires the existing test suite, `check:boundaries`, `check:architecture`, and a boot/smoke check to pass (REQ-05) | SAFE DEFAULT | TDD Agent / Programmer |
| Operability / Deployability | Applicable | Wave atomicity (REQ-04) — one wave = one revertible unit — is a deployability/rollback-safety choice | SAFE DEFAULT | Software Architect / DevOps |
| Interoperability / External Integrations | Applicable | `packages/*` workspace package scope relative to the rest of the migration is unresolved | BLOCKING | Human (REQ-10 clarification) — see handoff Q2 |
| Scale / Capacity, Performance / Latency, Availability / Uptime, Reliability / Fault Tolerance, Consistency / Freshness, Durability / Disaster Recovery, Security, Privacy, Data Integrity, Compliance / Auditability, Observability, Cost / Resource Efficiency, Usability / Accessibility | N/A | No new traffic surface, no new data, no new user-facing behavior — REQ-06 explicitly requires zero behavior change | — | — |

**Risk signals found:** One — "the workflow depends on ... a missing NFR would force Programmer/DevOps to invent policy" (Portability category: without a Node-version decision, Programmer/DevOps would have to silently pick a runtime assumption). This is exactly why REQ-08 is `[NEEDS CLARIFICATION]` rather than a safe default.

**Deep pass:** Not run. Only the 2 BLOCKING categories above needed escalation beyond the light pass; both are already captured as spec-level `[NEEDS CLARIFICATION]` markers (REQ-08, REQ-10), which is the correct handling per this skill's guardrail ("BLOCKING unknowns should block only the stage that cannot proceed responsibly without the answer") — Software Architect dispatch, not the light pass itself.

**Dominant quality-attribute candidates for Software Architect:** Portability/Environment Constraints (Node version) and Maintainability/Evolvability (wave-coexistence mechanism, OQ-01) are the two axes most likely to shape the eventual ADR.

## Functional Model — Compact Self-Check

Run directly by Spec Agent (no blueprint exists). Actors are developers and CI/build/deploy tooling, not end users — scoped accordingly per the dispatch brief.

- **Actors:** Developers authoring code in this repo; the CI system; the Docker build/deploy pipeline.
- **Goals:** Migrate the module system from CommonJS to native ESM with zero behavior change, in small revertible increments.
- **Workflows:** Migration waves (candidate selection → conversion → verification gate → atomic merge or atomic revert) — captured as the User Journey and REQ-01/04/05 in `feature.spec.md`.
- **Resources:** The module dependency graph itself (990 imports, 67 barrels, the 24-file Wave-1 leaf set) — not a data entity, a structural resource this spec operates over.
- **Rules:** Strictly bottom-up wave ordering (REQ-01/INV-04); barrel re-export gating (REQ-11); explicit scope exclusions (REQ-09).
- **Lifecycle/state:** Per-file migration status (unmigrated CommonJS → migrated ESM, monotonic, no reverse transition once a wave is merged) and per-wave status (proposed → converting → gate-verified → merged, or → reverted).
- **Exceptions:** Wave gate failure (EC-01), tool/grep disagreement on module dependencies (EC-02/REQ-03), mixed-eligibility barrels (EC-03/REQ-11), independent-wave scheduling (EC-04), Node-version-gated boundaries (EC-05/REQ-08).
- **Integrations:** None external. Internal tooling dependencies only: `check:architecture`, `check:boundaries`, the Node runtime, and the CodeBase Analyzer evidence report (see Dependencies table in `feature.spec.md`).
- **Categories not applicable and not covered:** permissions/ownership, communication/collaboration, search/reporting/analytics, admin/support UI, audit/history beyond git, settings, account/data lifecycle — none of these apply to an internal module-system migration with no new UI, data model, or external contract. Per compact-mode guidance, these are covered by the surrounding categories (or genuinely N/A) rather than separately elaborated.

Functional model status: **CLEAR, pending 2 blocking clarifications** (not `BLOCKED` in the blueprint sense — there is no blueprint — but Software Architect dispatch is still gated on REQ-08/REQ-10 per the Spec Agent's own `[NEEDS CLARIFICATION]` guardrail).

## Clarification Status

**RESOLVED, 2026-08-18.** Both blocking `[NEEDS CLARIFICATION]` markers were answered by the human via the Coordinator:
- **REQ-08 (Node engines-floor):** Option A — bump the deploy Node runtime to 24 as Phase 0, before Wave 1 (raise `engines.node` and the Dockerfile's `ARG NODE_VERSION` together). Judged low-risk: single-container app, owner controls the full deploy path end-to-end.
- **REQ-10 (`packages/*` scope):** In scope. `packages/*` contains exactly one package, `packages/sdk` (`@tovu/sdk`), already `"type": "module"`, 2 TypeScript files, one-way dependency direction (consumed by `src/`, consumes nothing from `src/`/`apps/`) — independently re-verified via direct grep during this revision pass. Resolves as a pre-migrated no-op, not real migration work.

`feature.spec.md` revised to v1.1.0, `status: APPROVED`, zero `[NEEDS CLARIFICATION]` markers remain. `spec-dod.md` overall result is now PASS (was FAIL in v1.0.0, blocked on exactly these 2 items). Validator (`--phase spec --update-hash`) passes clean.

**Per explicit human/Coordinator instruction: STOP here.** Do not proceed to Red-Team or Software Architect dispatch, and do not start implementation. The human is stepping away and will resume this pipeline in a future session. This package is handoff-ready and waiting, not yet handed off.

## Notes

This is the repo's first cross-cutting infrastructure/module-system spec (as opposed to a product-domain spec like SPEC-001–048). `apps/admin/**`, `src/themes/static/**`, and `src/features/theme/**` are explicitly out of scope (REQ-09) because a different, concurrently-live session owns that territory — this is a coordination boundary, not a technical exclusion; those trees will need their own future ESM migration pass.
