# Spec Manifest: Settings (Core-Only Layered Ledger)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-007 |
| feature_name | FEAT-007-settings-core-ledger |
| version | 0.3.1 |
| last_edited | 2026-07-11T20:15:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/007-settings-core-ledger |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow — the authoritative list of which
SPEC-007 files exist, which are omitted and why, and which files each downstream stage must read.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | feature.spec.md | Canonical primary requirements spec (REQ/AC/INV/EC), hash anchor |
| `api.spec.md` | PRESENT | api.spec.md | Real admin HTTP surface: register/getEffective/set/clear/reset + read variants |
| `state.spec.md` | PRESENT | state.spec.md | Persistent tables (definitions, per-scope values, revisions), transitions, resolver selectors |
| `orchestrator.spec.md` | OMITTED | — | No async orchestration/coordinator layer; the write chokepoint and resolver are synchronous ordinary core code (REQ-04, ADR-021 precedent); reset is a synchronous loop over clear() defined in behavior.spec §7 and state.spec §3 |
| `ui.spec.md` | PRESENT | ui.spec.md | The Settings admin screen (list/detail/value-editor/reset) — an in-scope UI surface (REQ-11) |
| `errors.spec.md` | PRESENT | errors.spec.md | New error registry: DEFINITION_INVALID, SCOPE_NOT_ALLOWED, SECRET_NOT_SUPPORTED, RENAME_RETYPE_CONFLICT, ALIAS_DEPTH_EXCEEDED, PURGE_REQUIRED + standard codes |
| `behavior.spec.md` | PRESENT | behavior.spec.md | Deterministic resolver precedence, cleared-state fall-through, rename retarget ordering, defaults, limits, dedup |
| `traceability.spec.md` | PRESENT | traceability.spec.md | Seeds REQ/AC/INV/EC + error + behavior coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | spec-manifest.md | This package index |
| `spec-dod.md` | PRESENT | spec-dod.md | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | feature.spec.md, traceability.spec.md, spec-dod.md, api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, ADR-028 |
| `tdd` | feature.spec.md, traceability.spec.md, spec-dod.md, api.spec.md, state.spec.md, errors.spec.md, behavior.spec.md, ADR-028, tasks |
| `programmer` | feature.spec.md, traceability.spec.md, api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, ADR-028, certified tests |

---

## Brownfield / Reverse-Spec References

This feature extends an existing system (`spec_mode = brownfield`): it retires the single-purpose
presentation settings port into the general ledger. Concrete touchpoints:

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/features/presentation/*` (`PresentationSettingsRepoPort`, `repo.memory.ts`, `repo.sqlite.ts`, `presentation.ts`) | source touchpoint | The feature this spec retires; REQ-08 migrates its active-theme value into `core.presentation.activeThemeId` and routes reads through the resolver |
| `src/features/presentation/__specs__/presentation-settings.spec.md` | source touchpoint | The prior narrow spec superseded by SPEC-007; its behavior is preserved as one setting |
| `src/server/__specs__/70-settings-admin/settings-and-admin-signals.spec.md` | source touchpoint | Pre-existing settings-admin spec stub reconciled by this package |
| `src/infra/db/schema.ts` (PresentationSettings table + FKs) | source touchpoint | The schema the new `setting_*` tables land beside; REQ-01/REQ-08 migration source |
| `src/core/commands/appliers.ts`, `src/server/seed.ts`, `src/navigation/ports.ts` | source touchpoint | Current `activeThemeId`/PresentationSettingsRepoPort consumers that must route through the resolver post-migration |
| `ADR-028 Settings — Layered Settings Ledger` (ACCEPTED 2026-07-11) | codebase-analysis | The governing decision this spec makes real (tables, resolver, chokepoint, permission catalog, purge) |
| `ADR-021 Identity & Authorization` (ACCEPTED) | codebase-analysis | `authorize()` + the flat `settings.*` permission strings this spec enumerates |
| `ADR-022 Content Model` (ACCEPTED) | codebase-analysis | The chokepoint + append-only revision discipline reused on the new tables |
| `SPEC-006 identity-and-authorization` (permission catalog + gateway) | source touchpoint | The `settings.*` strings register into the same catalog; the admin routes mount on the same gateway |

---

## Validation Notes

- Validator last run: 2026-07-11 (spec phase, `--update-hash`, post-redteam-fix precision pass)
- Validator result: PASS
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-11 (provider-local validator)
- Notes: v0.1.0 initial Spec Agent package for the ADR-028 core-only subset. v0.2.0 resolves OQ-01
  (defer revision-history screen, no scope change) and OQ-02 (ship the `PrincipalSelector`
  target-principal affordance now — REQ-11, AC-22, AC-23) via Coordinator `/clarify`. v0.3.0 fixes 3
  Red-Team BLOCKING findings from the v0.2.0 addition (`red-team-findings.md`, 2026-07-11):
  RT-001 (no target-principal validation/error code) → REQ-13, AC-24, INV-09, EC-11,
  `PRINCIPAL_NOT_FOUND`; RT-002 (undefined `PrincipalSelector` data source) → redefined as a validated
  identifier field, not a directory picker — no new cross-spec dependency; RT-003 (ambiguous
  self-vs-other permission derivation) → behavior.spec.md §1.3, AC-25, AC-26. v0.3.1 is a precision
  patch: REQ-13/INV-09/AC-24/EC-11 reworded to say "principal whose own `workspace_id` equals the
  request's `workspaceId`" (ADR-007 structural scoping — a principal belongs to exactly one workspace,
  no membership join) instead of the looser "member of" phrasing, after confirming SPEC-006 has no
  workspace-membership concept to borrow. Ready for re-run Coordinator Planning Preflight and Red-Team
  confirm-pass; plugin-owned settings and the secret path
  remain out of scope by ADR gates.
