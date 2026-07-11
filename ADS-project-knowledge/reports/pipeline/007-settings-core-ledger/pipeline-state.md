# Pipeline State: FEAT-007 Settings (Core-Only Layered Ledger)

| Field | Value |
|---|---|
| feat_id | FEAT-007-settings-core-ledger |
| spec_id | SPEC-007 |
| stage | spec |
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
| spec_hash | sha256:7deff736934b36e0544daaf5a424e639222d15478ac7f6c246762a0801e05ccd |
| spec_hash_verified_at | 2026-07-11 (provider-local validator, --phase spec, post-redteam-fix) |
| planning_preflight_status | pending (superseded by v0.3.0 content change — re-run owed) |
| planning_preflight_checked_at | pending |
| validator_result | PASS (--phase spec) |
| red_team_status | v0.2.0 FAIL (3 BLOCKING) fixed in v0.3.0 — confirm-pass owed before Architect dispatch |
| red_team_spec_hash | sha256:768c5eeb06b1fd41fd77ac677fb5fd8b2c80eb2ebe212e219f934baaa73f9bdd (v0.2.0, superseded) |
| governing_adr | ADR-028 (Settings — Layered Settings Ledger), ACCEPTED 2026-07-11 |

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
  behavior.spec.md §1.3 + AC-25/AC-26. Validator PASS, hash recomputed. Owes a Red-Team confirm-pass
  and a fresh Coordinator Planning Preflight before Software Architect dispatch.
