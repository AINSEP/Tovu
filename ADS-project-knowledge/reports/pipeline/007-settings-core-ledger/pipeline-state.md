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
| spec_hash | sha256:768c5eeb06b1fd41fd77ac677fb5fd8b2c80eb2ebe212e219f934baaa73f9bdd |
| spec_hash_verified_at | 2026-07-11 (provider-local validator, --phase spec, post-clarify) |
| planning_preflight_status | PASS (--phase preflight) |
| planning_preflight_checked_at | 2026-07-11T19:25:00Z |
| validator_result | PASS (--phase spec) |
| red_team_status | FAIL — 3 BLOCKING (see red-team-findings.md), routed back to Spec Agent |
| red_team_spec_hash | sha256:768c5eeb06b1fd41fd77ac677fb5fd8b2c80eb2ebe212e219f934baaa73f9bdd |
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
