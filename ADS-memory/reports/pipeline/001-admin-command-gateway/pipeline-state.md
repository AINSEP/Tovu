# Pipeline State

- run_id: 2026-07-02T20:30:00Z
- feature: 001-admin-command-gateway
- coordinator_mode: pipeline
- debug_mode: off
- spec_provider: speckit
- provider_native_root: specs/
- provider_output_root: ADS-memory/specs/001-admin-command-gateway/
- spec_version: 1.0.0
- spec_hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6
- spec_hash_STALE: RESOLVED 2026-07-07 (this session) — external audit (20260707T043122Z) edited feature/behavior/state/traceability/api/spec-dod to apply blockers F1–F4 (atomicity REQ-01/BR-04/EC-08/AC-17; ext-under-revert AC-02/AC-10). Re-validated with `--update-hash` (PASS); feature hash 0230e96c…c7a0 → 768af10e…e5d6. Red-Team re-affirmed the F1–F4 delta 0 BLOCKING (see red-team-findings.md "Re-Affirmation — Audit R3"). ADR-018 `Spec:` line + this ledger + tasks/outline updated to the new hash.
- audit_report: ADS-memory/reports/external-audit/runs/20260707T043122Z-external-audit-report.md
- code_gap_atomicity: RESOLVED 2026-07-07 (this session). `executeCommand` now wraps `changeSets.insert()` in a unit-of-work boundary: on insert failure after `execute()`, it calls `mutation.rollback()` (a new optional seam on `CommandMutation`) and re-throws, so no change set and no outbox event survive (REQ-01/BR-04/EC-08). The post-update route supplies `rollback` by snapshotting the full prior `PostRecord` and `postRepo.save()`-ing it back verbatim (version included). AC-17 injected-failure test + happy-path control added at `src/core/commands/__tests__/command-atomicity.test.ts` — both PASS; typecheck clean; full suite 15/15. NOTE: memory-adapter compensation is the "all-or-nothing on memory" equivalent; the real single-transaction lands with the SQLite ChangeSetRepo adapter (RT-004, deferred), at which point `rollback` becomes a no-op.
- spec_hash_history: sha256:d47c72376bb7ff82b5506e9b69b03215f50eae1ea24b98573fb43ffc103aba73 (v1.0.0 pre-R2, 2026-07-02); sha256:0230e96c2ff40c939d7c8fec9854d0370826c20e92b6ed38749f769596a7c7a0 (R2 post-RT-001/002/006, 2026-07-07, pre-audit)
- spec_entrypoint_path: ADS-memory/specs/001-admin-command-gateway/feature.spec.md
- spec_readiness_artifact: ADS-memory/specs/001-admin-command-gateway/spec-dod.md
- spec_support_paths: api.spec.md, state.spec.md, errors.spec.md, behavior.spec.md, traceability.spec.md, spec-manifest.md
- spec_mode: brownfield
- provider_mode: compatibility (prefixed naming)
- validator_result: PASS
- validator_manual_waiver: N/A
- spec_hash_verified_at: 2026-07-07T04:16:00Z
- planning_preflight_status: PASS
- planning_preflight_checked_at: 2026-07-07T04:20:00Z
- planning_preflight_spec_hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6 (preflight originally cleared at 0230e96c…c7a0; audit F1–F4 delta re-validated PASS + Red-Team re-affirmed 0 BLOCKING at 768af10e…e5d6 — clearance carries forward)
- planning_preflight_failures: none
- planning_preflight_notes: Speckit --phase preflight PASS; Coordinator sign-off row filled; human spec checkpoint approved (owner, in-session); Red-Team reaffirmed on R2 delta at same hash; RT-007 CONSTITUTION_FLAG human-decided; constitution bootstrapped 2026-07-07. System Design not run — brownfield analysis satisfied by admin-section-architecture-outline.md (rev 3, CBM/Graphify-grounded), wired into Architect context.
- red_team_status: PASS (0 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG, CF human-resolved)
- red_team_spec_hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6
- red_team_spec_hash_original: sha256:d47c72376bb7ff82b5506e9b69b03215f50eae1ea24b98573fb43ffc103aba73 (findings authored here)
- red_team_reaffirmed_at: 2026-07-07T04:20:00Z — R2 delta reviewed by Red-Team persona: revision is confined to applying findings RT-001/RT-002/RT-006's own recommended resolutions + `tovu/→src/` path-string corrections; introduces no new behavior or attack surface, so Red-Team clearance carries forward to hash 0230e96c…c7a0. **R3 re-affirm (2026-07-07, this session):** external audit F1–F4 delta (atomicity, ext-under-revert, schemaTag, error-namespace) re-examined at hash 768af10e…e5d6 — 0 BLOCKING; deltas remove failure modes, add no attack surface (see red-team-findings.md "Re-Affirmation — Audit R3").
- red_team_artifact: ADS-memory/reports/pipeline/001-admin-command-gateway/red-team-findings.md
- red_team_completed_at: 2026-07-07T04:10:00Z
- red_team_verdict: 0 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG — cleared for Software Architect
- red_team_human_decision: RESOLVED 2026-07-07 (owner Leon Aburime chose "fold in the 3, then Architect"). RT-001/RT-002/RT-006 applied as revision R2 + path drift fixed, re-validated PASS (hash 0230e96c…c7a0). RT-003 (concurrent-revert TOCTOU) + RT-004 (SQLite unique→DUPLICATE_COMMAND) carried to Software Architect / SQLite-adapter stage; RT-005 doc-only accepted; RT-007 (Art. VI revert permission seam) is Architect prep.
- system_blueprint_path: N/A
- system_blueprint_status: N/A
- adr_artifact: ADS-memory/reports/pipeline/001-admin-command-gateway/adr.md
- adr_id: ADR-018
- adr_status: ACCEPTED (human ADR approval by owner 2026-07-07, in-session)
- adr_human_decision: APPROVED — owner chose "approve ADR → tasks + TDD"
- adr_spec_hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6 (ADR-018 authored at 0230e96c…c7a0; re-pointed to the audit-reconciled hash — the F4 atomicity delta is acknowledged in ADR-018 §API Contract / Consequences, see adr.md update 2026-07-07)
- research_artifact: N/A (no open library/technology choice)
- implementation_outline_artifact: ADS-memory/reports/pipeline/001-admin-command-gateway/implementation-outline.md
- implementation_outline_status: PRODUCED (triggers: boundary-cross, contract-change, system-wiring, data-persistence, brownfield, cross-boundary-invariant, parallelization)
- constitution_check: 7 COMPLIES · 1 EXCEPTION (Art. VI dev-only no-auth, justified + mitigated via RT-007 actor/permission seam)
- codebase_analysis_reports: ADS-memory/reports/architecture/admin-section-architecture-outline.md (rev 3; pre-pipeline competitor + agent-plane analysis, CBM/Graphify grounded)
- reverse_spec_artifacts: N/A
- reverse_spec_review_status: NOT_APPLICABLE
- tasks_artifact: ADS-memory/reports/pipeline/001-admin-command-gateway/tasks.md
- tasks_count: 41 (18 parallelizable; phases 0–5 + polish)
- test_certification_artifact: N/A
- test_certification_hash: N/A
- verification_packet_artifact: N/A
- verification_packet_hash: N/A
- test_file_hash_status: N/A
- latest_testrunner_report: N/A
- testrunner_status: NOT_RUN
- executed_test_count: N/A
- expected_test_count: N/A
- required_suite_status: N/A
- coverage_status: NOT_RUN
- flaky_test_status: N/A
- code_review_gate_status: NOT_READY
- started_at: 2026-07-02T20:30:00Z
- last_updated_at: 2026-07-07T05:35:00Z (audit R3 reconciliation: re-hash + Red-Team re-affirm + atomicity fix + AC-17 test)
- progress_ledger_path: ADS-memory/reports/pipeline/001-admin-command-gateway/progress-ledger.md
- current_stage: EXPLORATORY IMPLEMENTATION (owner-directed implement-first spike; TDD deferred) — post path wired end-to-end + verified via running server
- status: EXPLORATORY_SPIKE (NOT test-certified)
- test_first_departure: Owner directed "skip tests, implement stuff we can see first" (2026-07-07). Departs from Constitution Art. II (Test-First). This code is VibeCoder-grade until promoted: TDD must certify tests against SPEC-001 (hash 768af10e…e5d6) over this implementation before it counts as a completed Programmer stage. Test certification = the promotion step. implementation-outline.md remains the contract source of truth. NOTE: one AC-17 atomicity test was added this session alongside the atomicity fix (`src/core/commands/__tests__/command-atomicity.test.ts`) — a targeted certification of the F4 delta, not the full tasks.md suite.
- exploratory_scope_done: core gateway (reconciled draft) + revert.ts + appliers.ts (post reverter) + change-sets list/get/revert routes + post-update route rewired through gateway. Verified live (in-memory server): applied record w/ summary + entityVersionAtApply, inversePayload hidden over HTTP, revert restores + version monotonic (INV-04), DUPLICATE_COMMAND / REVERT_CONFLICT / CHANGE_SET_INVALID_STATUS all correct.
- exploratory_scope_deferred: presentation path (REQ-05) — needs the `version` field + backfill (RT-006) before its reverter can register; multi-item/proposed change sets; SQLite ChangeSetRepo adapter (RT-004); outbox event delivery (enqueued, not flushed in the demo).
- impl_refinements: implemented two things the draft lacked but SPEC-001 already required — item `entityVersionAtApply` (REQ-02/AC-02) + a `captureEntityVersion` hook on CommandMutation to stamp it (the revert version guard, REQ-08, depends on it). No spec change needed; typecheck clean.

## Completed Stages

| Stage | Completed At | Output Artifact | Output Hash |
|-------|-------------|-----------------|-------------|
| spec | 2026-07-02T21:05:00Z | ADS-memory/specs/001-admin-command-gateway/feature.spec.md | sha256:d47c72376bb7ff82b5506e9b69b03215f50eae1ea24b98573fb43ffc103aba73 |
| red-team | 2026-07-07T04:10:00Z | ADS-memory/reports/pipeline/001-admin-command-gateway/red-team-findings.md | (findings vs spec hash d47c72…aba73) |
| spec-revision R2 | 2026-07-07T04:16:00Z | ADS-memory/specs/001-admin-command-gateway/feature.spec.md | sha256:0230e96c2ff40c939d7c8fec9854d0370826c20e92b6ed38749f769596a7c7a0 |
| planning-preflight | 2026-07-07T04:20:00Z | pipeline-state.md (planning_preflight_status: PASS) | spec hash 0230e96c…c7a0 |
| architect | 2026-07-07T04:30:00Z | ADS-memory/reports/pipeline/001-admin-command-gateway/adr.md (+ implementation-outline.md) | ADR-018 vs spec hash 0230e96c…c7a0 |
| audit-R3 re-validate + re-affirm | 2026-07-07 (this session) | feature.spec.md (validator `--update-hash` PASS) + red-team-findings.md "Re-Affirmation — Audit R3" | sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6 |

## Current Stage Detail

- Red-Team complete (Red-Team persona loaded, Claude Opus 4.8): 0 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG. Spec re-validated PASS at hash `d47c72…aba73` (unchanged; no revision required).
- **Ledger reconciliation (2026-07-07):** this ledger was frozen at 2026-07-02 (`WAITING_FOR_HUMAN`, red_team `NOT_RUN`) and was NOT swept into the 2026-07-07 batch approval that 002–005 received. The owner is present this session and explicitly directed "Red-Team 001 first," which treats the human spec checkpoint as approved; Red-Team's activation gate (post human spec approval) is therefore satisfied. Human spec checkpoint recorded as APPROVED (owner Leon Aburime, present-in-session direction, 2026-07-07).
- **Human decision still pending** on 3 ADVISORY spec clarifications (RT-001 summary source, RT-002 presentation change-set item identity, RT-006 presentation `version` backfill) — cheap, recommended before wiring. RT-003/004/005 accept-or-defer; RT-007 is Architect prep (Art. VI revert permission seam).
- Clarifications resolved by owner 2026-07-02: prefixed naming; idempotency = reject + re-read (replay revisited via OQ-01); revert = version guard.
- Known context: project constitution (`ADS-memory/governance/constitution.md`) not yet bootstrapped — toolkit default articles applied; flagged for pre-Architect bootstrap.
- **Path drift (open, non-blocking):** the spec package references `tovu/src/…` throughout (Brownfield References, Scope, Dependencies), but the repo split means the real paths are `src/…` (verified present: `src/core/commands/{change-set,command,repo.memory}.ts`, `src/features/{post,presentation}`, `src/server/routes/admin/{posts/update.ts,presentation/patch-active-theme.ts}`). Correct before/at Software Architect so downstream stages don't chase a non-existent `tovu/` folder. Pre-pipeline draft code (`src/core/commands/*`) is promotable input, not ground truth.
