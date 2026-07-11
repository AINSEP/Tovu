# Pipeline State: FEAT-007 Settings (Core-Only Layered Ledger)

| Field | Value |
|---|---|
| feat_id | FEAT-007-settings-core-ledger |
| spec_id | SPEC-007 |
| stage | implementation (Phase 0+1 of 8 complete — see tasks.md) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-project-knowledge/specs/007-settings-core-ledger |
| spec_path | ADS-project-knowledge/specs/007-settings-core-ledger |
| spec_entrypoint_path | ADS-project-knowledge/specs/007-settings-core-ledger/feature.spec.md |
| spec_readiness_artifact | ADS-project-knowledge/specs/007-settings-core-ledger/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, behavior.spec.md, errors.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield |
| spec_hash | sha256:fc322f69fe3cc586dbe9823c4d3d6d5225e419d538be554bdfe88873a40a501b |
| spec_hash_verified_at | 2026-07-11 (provider-local validator, --phase spec, post-redteam-fix-precision-pass) |
| planning_preflight_status | PASS (--phase preflight, v0.3.1) |
| planning_preflight_checked_at | 2026-07-11T20:25:00Z |
| validator_result | PASS (--phase spec) |
| red_team_status | PASS (0 BLOCKING) — confirm-pass against v0.3.1 closed RT-001/002/003; RT-004 ADVISORY carries forward |
| red_team_spec_hash | sha256:fc322f69fe3cc586dbe9823c4d3d6d5225e419d538be554bdfe88873a40a501b (v0.3.1) |
| governing_adr | ADR-028 (Settings — Layered Settings Ledger), ACCEPTED 2026-07-11 |
| pipeline_adr | ADS-project-knowledge/reports/pipeline/007-settings-core-ledger/adr.md — ADR-PIPE-007, status ACCEPTED 2026-07-11 (human approved, Leon Aburime) |
| implementation_outline | ADS-project-knowledge/reports/pipeline/007-settings-core-ledger/implementation-outline.md — Status: PRODUCED (5 triggers: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant) |
| governance_adr_promotion | Evaluated, not promoted — ADR-PIPE-007 applies existing governance ADRs (006/007/015/021/022), introduces no new durable cross-cutting rule |
| research_artifact | N/A — no library/technology/persistence choice open (all reused per ADR-015/021/022) |
| tasks_path | ADS-project-knowledge/reports/pipeline/007-settings-core-ledger/tasks.md — 55 tasks, 8 phases (0 Setup, 1 Foundational, 2 Def lifecycle, 3 Purge, 4 Presentation retirement, 5 API, 6 UI, 7 Cache, N Polish) |
| implementation_progress | Phase 0 (T001-T003) + Phase 1 (T004-T021) DONE — 424/424 tests passing, tsc clean. `src/features/settings/{types,ports,errors,settings,write-service,repo.memory,repo.sqlite}.ts` + 8 test files; 5 Drizzle tables + migration `drizzle/0002_skinny_network.sql`; `settings.*` permission catalog in `src/identity/permissions.ts`+`seed.ts`; `npm run test:cov` script added. Phases 2-7 (def lifecycle, purge, presentation retirement, API routes, UI, cache) + Polish NOT started. |

## Notes

- Scope is the **core-only subset** of ADR-028: tables + resolver + write chokepoint + full
  `settings.*` permission catalog + core/site/theme definitions. Plugin-owned settings (gated on
  capability-taxonomy-v1, ADR-024 §6) and the secret path (gated on the Integrations/secret-store
  ADR) are explicitly out of scope.
- Brownfield: retires the existing `PresentationSettingsRepoPort` (`src/features/presentation/*`)
  into `core.presentation.activeThemeId`; theme presets → `theme.{themeId}`.
- Reconciles the pre-existing spec stub at `src/server/__specs__/70-settings-admin/`.
- v0.2.0 `/clarify` pass (2026-07-11) resolved OQ-01 (defer revision-history screen, no scope change)
  and OQ-02 (ship `PrincipalSelector` target-principal affordance now — added REQ-11 language, AC-22,
  AC-23). Hash recomputed and validator rerun (`--phase spec --update-hash`), PASS.
- v0.3.0 (2026-07-11) fixes 3 Red-Team BLOCKING findings against v0.2.0 (red-team-findings.md):
  RT-001 → REQ-13 + AC-24 + INV-09 + EC-11 + `PRINCIPAL_NOT_FOUND`; RT-002 → `PrincipalSelector`
  redefined as a validated identifier field (no new cross-spec dependency); RT-003 →
  behavior.spec.md §1.3 + AC-25/AC-26. Validator PASS, hash recomputed. v0.3.1 (2026-07-11) is a
  precision patch found during self-review: reworded REQ-13/INV-09/AC-24/EC-11 from "member of
  workspaceId" to "principal whose own workspace_id equals workspaceId" (ADR-007 structural scoping —
  confirmed SPEC-006 has no separate workspace-membership concept). Validator PASS, hash recomputed.
  Owes a Red-Team confirm-pass and a fresh Coordinator Planning Preflight before Software Architect
  dispatch.
