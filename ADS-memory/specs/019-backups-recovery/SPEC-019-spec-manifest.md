# Spec Manifest: backups-recovery

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-019 |
| feature_name | FEAT-019-backups-recovery |
| version | 1.1.0 |
| last_edited | 2026-07-14T23:30:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/019-backups-recovery/ |
| spec_entrypoint | SPEC-019-feature.spec.md |
| spec_readiness_artifact | SPEC-019-spec-dod.md |

**Purpose:** This manifest is the package index for SPEC-019 (Backups/Recovery), a dependent domain spec
over SPEC-016's shared core contract (the global write-watermark, the `plan→confirm→execute`
gated-mutation gateway, the composite actor-identity pattern, and the `db-ops` port surface). SPEC-019's own
`## Integration Contracts` section in `SPEC-019-feature.spec.md` cites SPEC-016's exact REQ/AC/INV ids
rather than restating them.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `SPEC-019-feature.spec.md` | Canonical primary requirements spec for the Recovery screen |
| `api.spec.md` | PRESENT | `SPEC-019-api.spec.md` | Recovery exposes a real callable surface: restore-points/capabilities/context reads, restore-point creation, and the `backup/restore` gateway instantiation |
| `state.spec.md` | PRESENT | `SPEC-019-state.spec.md` | Recovery owns real client-facing state: the restore-flow wizard, the restore-run progress projection, and the deep-link-resolution state |
| `orchestrator.spec.md` | PRESENT | `SPEC-019-orchestrator.spec.md` | Recovery's own orchestration (list/capability/context reads, ordinary restore-point creation, and delegation into SPEC-016's gateway) is a real coordination layer |
| `ui.spec.md` | PRESENT | `SPEC-019-ui.spec.md` | Recovery is a real admin screen with components, props, events, and accessibility requirements (unlike SPEC-016, which has no independent UI surface) |
| `errors.spec.md` | PRESENT | `SPEC-019-errors.spec.md` | Recovery defines its own error codes (`RESTORE_POINT_NOT_FOUND`, `RESTORE_OPERATION_IN_FLIGHT`, `COST_CLASS_UNAVAILABLE`, `DEEP_LINK_TARGET_NOT_FOUND`) in addition to reusing SPEC-016's gateway codes |
| `behavior.spec.md` | PRESENT | `SPEC-019-behavior.spec.md` | Real precedence (banner precedence, disclosure-vs-confirm ordering), ordering (the five-step restore flow), default, and limit rules exist and are load-bearing |
| `traceability.spec.md` | PRESENT | `SPEC-019-traceability.spec.md` | Seeds REQ/AC/INV/EC coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `SPEC-019-spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `SPEC-019-spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `SPEC-019-feature.spec.md`, `SPEC-019-api.spec.md`, `SPEC-019-state.spec.md`, `SPEC-019-orchestrator.spec.md`, `SPEC-019-ui.spec.md`, `SPEC-019-errors.spec.md`, `SPEC-019-behavior.spec.md`, `SPEC-019-traceability.spec.md`, `SPEC-019-spec-dod.md`, plus **all of SPEC-016's `PRESENT` files** (`SPEC-016-feature.spec.md`, `SPEC-016-api.spec.md`, `SPEC-016-state.spec.md`, `SPEC-016-orchestrator.spec.md`, `SPEC-016-errors.spec.md`, `SPEC-016-behavior.spec.md`, `SPEC-016-traceability.spec.md`) since SPEC-019 instantiates SPEC-016's gateway rather than restating it |
| `tdd` | `SPEC-019-feature.spec.md`, `SPEC-019-traceability.spec.md`, `SPEC-019-spec-dod.md`, plus SPEC-016's `feature.spec.md`/`traceability.spec.md` for the gateway mechanics this spec's restore action instantiates |
| `programmer` | `SPEC-019-feature.spec.md`, `SPEC-019-traceability.spec.md`, all `PRESENT` contract files listed above, plus SPEC-016's `PRESENT` contract files and certified tests for the gateway/watermark/actor-identity/`db-ops` mechanisms this spec consumes |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — it extends a running application (per the Coordinator's directive) even
though no prior code implements this exact screen yet; ADR-045 was written directly against the live
codebase and against ADR-041's already-Accepted backend primitive.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-045-backups-recovery-screen.md` | source touchpoint | The full origin of this spec: the Recovery screen's IA, the discarded-write-window disclosure's centrality, the screen structure (§3), the degraded modes (§4), and the deep-link wiring (§5) |
| `ADS-memory/reports/architecture/ADR-041-storage-timeline.md` §§2, 3, 5, 6, 7, 9, 10, item 11 | source touchpoint | Origin of the `db-ops` port, the sidecar ops journal, the `plan→confirm→execute` gateway, the global watermark and its covered-category inventory, the agent-tool catalog precedent, the deep-link `StorageContextEnvelope`, the quiesce-integrity residual, and the `PENDING_MIGRATION`/`migration.interrupted` boot states this spec's degraded modes deep-link into |
| `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-feature.spec.md` | source touchpoint | The shared core contract this spec instantiates by REQ/AC id — the watermark counter, the gated-mutation gateway, the composite actor-identity pattern, and the `db-ops` capability shape |
| `ADS-memory/reports/architecture/ADR-021-identity-and-authorization.md` §§2, 3, 4, 6 | source touchpoint | Origin of `authorize()`, the flat-dotted permission house style (`backup.read`/`backup.create`/`backup.restore`), the composite `(workspace_id, id)` FK convention, and agent delegation semantics this spec cites by reference, not restatement |
| `ADS-memory/reports/architecture/ADR-023-core-mediated-plugin-data-modules.md` §7 | source touchpoint | Origin of the plugin-table typed-write category the discarded-window disclosure currently includes as watermark-stamped (REQ-09) |
| No `ANALYSIS-*` / `MIGRATION-*` / `TESTABILITY-*` reports exist in `ADS-memory/reports/codebase-analysis/` | codebase-analysis | Directory was confirmed absent before this run; no CodeBase Analyzer output exists yet for the Recovery/backup surface — this spec proceeds directly from the Accepted ADRs' own direct-codebase verification instead |

---

## Validation Notes

- Validator last run: pending first run at handoff time — see this spec's own `pipeline-state.md` for the
  actual command/exit-status record.
- Validator manual waiver: N/A — `python3` is expected to be available in this environment.
- Notes: This is the first draft of SPEC-019. No prior version exists. Zero `[NEEDS CLARIFICATION]` markers
  were required — every mechanism in scope was already decided by ADR-041/ADR-045 or is cited by id from
  SPEC-016; the four genuinely open items are recorded as Open Questions (OQ-01 – OQ-04) in
  `SPEC-019-feature.spec.md`, each with an owner and a resolution target, per this project's Spec Agent
  workflow rule that overflow ambiguity becomes an Open Question, not a guess.
