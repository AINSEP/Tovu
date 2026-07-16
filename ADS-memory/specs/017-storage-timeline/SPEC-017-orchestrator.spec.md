# Orchestrator Contract Spec: storage-timeline

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/orchestrator.spec.md`

- Spec ID: `SPEC-017`
- Feature: `FEAT-017-storage-timeline`
- Version: `1.3.0`
- Content Hash: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`
- Last Edited: `2026-07-15T00:45:00Z`

## Purpose

Defines the `MigrateForwardOrchestrator`: this domain's concrete instantiation of SPEC-016's
generic `GatedMutationGateway` (SPEC-016 `orchestrator.spec.md` §1) for `domain="storage.migrate"`,
plus the boot-time orchestration (crash reconciliation, cost-gated auto-migrate,
`PENDING_MIGRATION` entry) that has no equivalent in SPEC-016 because it runs outside any
interactive gateway call.

## 1) Orchestrator Identity
- Name: `MigrateForwardOrchestrator`
- Responsibility: sequence the dialect-conditional migrate-forward state machine (REQ-11/REQ-12)
  inside SPEC-016's generic `plan→confirm→execute` gateway, and separately, at boot, decide
  between cost-gated auto-migration and `PENDING_MIGRATION` degradation (REQ-28 – REQ-30).

## 2) Input Contract

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `siteId` | yes | `string` | none | must resolve to an install-dir site | Fills SPEC-016's generic `scopeId` slot (REQ-07) |
| `principalId` | yes (interactive path only) | `string` | none | must resolve to a `principals` row, or the seeded `kind='system'` principal for the boot path | Boot auto-migrate uses the system principal, never a human session (REQ-28) |
| `principalKind` | yes (interactive path only) | `enum[user, agent, api_key, system]` | none | `system` is valid only for the boot auto-migrate path | |
| `planId` / `planHash` | conditional | per SPEC-016 | none | required for `confirm()` | Not restated |
| `confirmationToken` | conditional | `string` | none | required for interactive `execute()`; absent entirely for the boot auto-migrate path (REQ-28) | The boot path is a "reserved no-token boot policy," not a bypass of the state machine itself |

## 3) Output State Contract

| Field | Type | Nullability | Source | Notes |
|---|---|---|---|---|
| `migrationRun` | `MigrationRun` | non-null once planned | derived | see `state.spec.md` §2 |
| `terminalState` | `MigrationRunStatus` | nullable until terminal | derived | one of `DONE, ABORTED_SAFE, RESTORED, RESTORE_FAILED, ROLLBACK_TO_BLUE` |
| `discardedWindowDisclosure` | `object` | nullable | derived (only on a failure that hands off to Recovery) | computed per SPEC-016 REQ-06/REQ-07; owned in full by the Recovery surface's own UI once handed off (REQ-14) |
| `siteServingStatus` | `SiteServingStatus` | non-null | derived | `SERVING` unless boot orchestration set `PENDING_MIGRATION` (REQ-29) |

## 4) Action Contracts

| Action | Inputs | Returns | Side Effects | Failure Codes |
|---|---|---|---|---|
| `planMigrateForward` | `{siteId, principalId, principalKind}` | `Result<MigratePlan>` | none — read-only (REQ-06) | `UNAUTHENTICATED, FORBIDDEN` |
| `confirmMigrateForward` | `{siteId, principalId, principalKind, planId, planHash}` | `Result<ConfirmationToken>` (SPEC-016 shape) | mints a token if `authorize()` passes (SPEC-016 REQ-10, this domain's REQ-07) | `UNAUTHENTICATED, FORBIDDEN` (includes non-`user` principal kind) |
| `executeMigrateForward` | `{siteId, principalId, principalKind, confirmationToken}` | `Result<MigrateExecuteResult>` | runs the dialect-conditional state machine (REQ-11/REQ-12) exactly once on success; stamps composite actor identity on every ledger row it produces | `UNAUTHENTICATED, FORBIDDEN, PLAN_STALE, TOKEN_EXPIRED, TOKEN_ALREADY_REDEEMED, RESTORE_POINT_UNAVAILABLE, SCHEMA_DRIFT_DIVERGED, INTERNAL_ERROR` |
| `reconcileInterruptedMigrationOnBoot` | none (boot-time) | `Result<void>` | converts a non-terminal `migration_runs` row to a `migration.interrupted` ledger row; blocks normal site-open (REQ-15); MUST run to resolution/block before `evaluateBootMigrationPolicy` is ever invoked, per `behavior.spec.md` §2.4's boot-sequence ordering rule | none — this action is itself the recovery path for a prior failure |
| `evaluateBootMigrationPolicy` | none (boot-time) | `Result<'auto-migrated' \| 'pending-migration' \| 'no-action-needed'>` | either runs `AUTO_MIGRATE_ON_BOOT` (REQ-28) or `ENTER_PENDING_MIGRATION` (REQ-29), depending on drift status and `costClass`; MUST NOT be invoked while a non-terminal `migration_runs` row exists for the site — unreachable until `reconcileInterruptedMigrationOnBoot` has resolved it, per `behavior.spec.md` §2.4 | none — this action's own branching logic cannot itself fail; a failure inside the auto-migrate branch surfaces via `executeMigrateForward`'s own failure codes |

## 5) Lifecycle Hooks

| Hook | Trigger | Ordering | Failure Behavior |
|---|---|---|---|
| `onBeforeQuiesce` | after `CONFIRMED`, before `QUIESCING` begins | after SPEC-016's `authorize()`/token-state/actor-class/plan-hash checks have all passed (REQ-08) | if any SPEC-016-owned check fails, quiesce never begins |
| `onQuiesceComplete` | after the ADR-022 §4a chokepoint closes | records `revisionSeqAtQuiesce` from SPEC-016's watermark (REQ-10) before `SNAPSHOTTING` begins | none — quiesce completion is not itself a failure point |
| `onSnapshotFailure` | `SNAPSHOTTING` fails | transitions directly to `ABORTED_SAFE` (REQ-13) | no restore attempted — nothing was applied yet |
| `onApplyOrVerifyFailure` | `APPLYING` or `VERIFYING` fails | re-snapshots the broken state, then hands off to the Recovery surface's own restore-confirmation flow (REQ-14) — this orchestrator does not itself execute a restore | terminal state becomes `RESTORED` or `RESTORE_FAILED`, decided by the Recovery surface's own execute outcome |
| `onCutoverFailure` | Postgres `CUTOVER` fails after a validated green schema | distinct from `onApplyOrVerifyFailure` — repoints back to blue, retains green for forensics (REQ-12) | terminal state becomes `ROLLBACK_TO_BLUE` |
| `onBootDriftDetected` | at boot, before the site accepts public traffic | runs only after `reconcileInterruptedMigrationOnBoot` (REQ-15) has resolved or blocked — never in parallel with it — then evaluates `costClass` before deciding `AUTO_MIGRATE_ON_BOOT` vs `ENTER_PENDING_MIGRATION` (REQ-28/REQ-29), per `behavior.spec.md` §2.4's boot-sequence ordering rule | a `costClass === 'unavailable'` or `'expensive'` site never silently serves — `ENTER_PENDING_MIGRATION` always runs first in that branch; a site with a non-terminal `migration_runs` row never reaches this hook at all until Recovery has resolved it |

## 6) Invariants
- [x] `executeMigrateForward` never runs `APPLY_SCHEMA` before `SNAPSHOT` has completed
      successfully (INV-01, inherited ordering).
- [x] `onApplyOrVerifyFailure` never itself performs the restore — it only hands off to the
      Recovery surface, matching the "Restore is a Recovery tool, not a Storage tool" rule
      (feature.spec.md REQ-14).
- [x] `evaluateBootMigrationPolicy` never lets a `costClass !== 'cheap'` site auto-migrate on
      boot (INV-04, REQ-29).
- [x] `onCutoverFailure` never reuses the `onApplyOrVerifyFailure` failure edge — they are
      distinct, per REQ-12.
- [x] `evaluateBootMigrationPolicy` never runs while a non-terminal `migration_runs` row exists for
      the site — `reconcileInterruptedMigrationOnBoot` (REQ-15) always resolves or blocks first,
      per `behavior.spec.md` §2.4.

## 7) Acceptance Checklist
- [x] Inputs/outputs/actions are fully documented.
- [x] Failure codes align with `errors.spec.md` and SPEC-016's `errors.spec.md`.
- [x] Entity field names align with `state.spec.md`.
- [x] UI projection (drift banner, migrate-ceremony wizard, Tier-3 browser) aligns with
      `ui.spec.md`.
