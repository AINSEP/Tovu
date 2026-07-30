# Pipeline State: FEAT-007 Settings (Core-Only Layered Ledger)

| Field | Value |
|---|---|
| feat_id | FEAT-007-settings-core-ledger |
| spec_id | SPEC-007 |
| stage | implementation (Phase 0-7 of 8 complete — all acceptance-criteria-bearing work done; only Phase N Polish remains, see tasks.md) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/007-settings-core-ledger |
| spec_path | ADS-memory/specs/007-settings-core-ledger |
| spec_entrypoint_path | ADS-memory/specs/007-settings-core-ledger/feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/007-settings-core-ledger/spec-dod.md |
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
| pipeline_adr | ADS-memory/reports/pipeline/007-settings-core-ledger/adr.md — ADR-PIPE-007, status ACCEPTED 2026-07-11 (human approved, Leon Aburime) |
| implementation_outline | ADS-memory/reports/pipeline/007-settings-core-ledger/implementation-outline.md — Status: PRODUCED (5 triggers: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant) |
| governance_adr_promotion | Evaluated, not promoted — ADR-PIPE-007 applies existing governance ADRs (006/007/015/021/022), introduces no new durable cross-cutting rule |
| research_artifact | N/A — no library/technology/persistence choice open (all reused per ADR-015/021/022) |
| tasks_path | ADS-memory/reports/pipeline/007-settings-core-ledger/tasks.md — 55 tasks, 8 phases (0 Setup, 1 Foundational, 2 Def lifecycle, 3 Purge, 4 Presentation retirement, 5 API, 6 UI, 7 Cache, N Polish) |
| implementation_progress | Phase 0-7 DONE — 474/474 tests passing, root + `apps/admin` `tsc --noEmit` both clean (Coordinator-verified full-suite run 2026-07-13). Phase 0+1 (T001-T021): `src/features/settings/{types,ports,errors,settings,write-service,repo.memory,repo.sqlite}.ts`, 5 Drizzle tables + migration, `settings.*` permission catalog. Phase 2 (def lifecycle): rename/retype/deprecate/tombstone in `write-service.ts`. Phase 3 (purge): `purge-service.ts`. Phase 4 (presentation retirement): `migration.ts`, `appliers.ts`/`navigation/ports.ts` re-pointed. Phase 5 (T036-T044, admin API): 5 HTTP routes at `src/server/routes/admin/settings/*.ts`, mounted workspace-scoped (deviation from api.spec.md's literal unscoped path, matching every other admin route in this codebase); caught+fixed a real bug where global-scope writes were denied even for the owner (bad workspace-id fallback in `authorize()` calls). Phase 6 (T045-T047, UI): `apps/admin/src/sections/Settings.tsx` + `lib/api.ts` extensions; 3 disclosed adaptations since `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS` were never built (namespace typed not browsed; per-layer breakdown derived via double `GET_EFFECTIVE` calls, with global-under-workspace honestly rendered "hidden" rather than fabricated; `PrincipalSelector` visibility solved for real via `/auth/me`'s `effectivePermissions`). T047's manual browser verification is still owed by the human — cannot be automated. Phase 7 (T048-T051, cache): per-layer + workspace-qualified definition cache in `settings.ts`, wired into every write path incl. Phase 2 lifecycle ops and purge. Phase N (Polish, T052-T055) NOT started — non-blocking (INFO.md docs, coverage-gap sweep, `test:cov` measurement, traceability.spec.md backfill). |

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
