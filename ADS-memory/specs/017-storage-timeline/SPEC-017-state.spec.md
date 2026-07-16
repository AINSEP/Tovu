# State Contract Spec: storage-timeline

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-017`
- Feature: `FEAT-017-storage-timeline`
- Version: `1.3.0`
- Content Hash: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8`
- Last Edited: `2026-07-15T00:45:00Z`

## Purpose

Defines the durable state this domain owns: the `storage_ledger`/`migration_runs`/`restore_points`
sidecar tables, the dialect-conditional migrate-forward state machine, and the site-level
`PENDING_MIGRATION` status. Does not restate SPEC-016's `storage_write_watermark`/mirror/token
state (SPEC-016 `state.spec.md` §1) — this domain only reads and references it.

## 1) State Shape

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `migrationRun.status` | `MigrationRunStatus` | no | `IDLE` | Current node in the dialect-conditional state machine |
| `migrationRun.dialect` | `'sqlite'\|'postgres'` | no | resolved at plan time | Selects which state-machine branch applies (REQ-11/REQ-12) |
| `migrationRun.revisionSeqAtQuiesce` | `integer` | yes | `null` until `QUIESCING` completes | SPEC-016's `storage_write_watermark` value at quiesce (REQ-10) |
| `migrationRun.quiesceIntegrity` | `'chokepoint-only'` | yes | `null` (full integrity) | Set only when a Tier-3 plugin is enabled (REQ-27) |
| `ledgerRow.restorePointId` | `string (ulid)` | yes | n/a — set at creation | Null only for `index.provision`/`index.drop` (REQ-18, INV-03) |
| `restorePoint.watermarkAtCapture` | `integer` | yes | n/a — required except for pre-ADR-041 rows | SPEC-016 REQ-06's baseline column; null only for rows captured before the column existed (EC-06) |
| `site.servingStatus` | `SiteServingStatus` | no | `SERVING` | Whether the site is fully open, or gated behind `PENDING_MIGRATION` (REQ-29, REQ-30) |

## 2) Entity Contracts
```yaml
MigrationRunStatus:
  enum:
    # SQLite branch (REQ-11)
    - IDLE
    - PLANNED
    - CONFIRMED
    - QUIESCING
    - SNAPSHOTTING
    - APPLYING
    - VERIFYING
    - JOURNALING
    - DONE
    - SNAPSHOT_FAILED
    - ABORTED_SAFE
    - RESTORING
    - RESTORED
    - RESTORE_FAILED
    # Postgres-only additional states (REQ-12)
    - CUTOVER
    - CUTOVER_FAILED
    - ROLLBACK_TO_BLUE

SiteServingStatus: enum[SERVING, PENDING_MIGRATION]

LedgerKind: enum[core.migration, plugin.ddl, index.provision, index.drop, template.upgrade, restore_point.created, restore.executed, migration.interrupted]

DriftStatus: enum[in-sync, ahead, diverged, behind]
  # 'ahead'/'diverged' → drift banner shown (REQ-02); classification by schemaTag identity, never count (REQ-03)

StorageLedgerRow:
  id: string (ulid)
  kind: LedgerKind
  scope: "site"                     # CHECK(scope='site') — SITE_SCOPE_EXEMPT_TABLES member (REQ-17)
  siteId: string
  correlationId: string
  restorePointId: string (ulid) | null
  schemaBefore: { version: integer, tag: string }
  schemaAfter: { version: integer, tag: string } | null
  driftStatus: DriftStatus
  outcome: "success" | "failed" | "interrupted"
  actorWorkspaceId: string          # SPEC-016 REQ-16 composite actor identity
  actorId: string
  delegatedByWorkspaceId: string | null
  delegatedById: string | null
  detail: object
  createdAt: string (date-time)

MigrationRun:
  id: string (ulid)
  siteId: string
  dialect: "sqlite" | "postgres"
  status: MigrationRunStatus
  revisionSeqAtQuiesce: integer | null
  quiesceIntegrity: "chokepoint-only" | null
  planHash: string
  restorePointId: string (ulid)
  actorWorkspaceId: string
  actorId: string
  createdAt: string (date-time)
  completedAt: string (date-time) | null

RestorePoint:
  id: string (ulid)
  siteId: string
  kind: "file-snapshot" | "logical-dump" | "external"
  costClass: "cheap" | "expensive" | "unavailable"
  watermarkAtCapture: integer | null     # SPEC-016 REQ-06; null only per EC-06
  createdBy: { actorWorkspaceId: string, actorId: string }
  createdAt: string (date-time)
```

## 3) Action Catalog

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `PLAN_MIGRATE_FORWARD` | none | caller holds `storage.read` | none (read-only, REQ-06) | none — pure read |
| `CONFIRM_MIGRATE_FORWARD` | `{planId, planHash}` | per SPEC-016 REQ-10, `siteId` as `scopeId` | mints token via SPEC-016's `MINT_TOKEN` (not restated) | per SPEC-016 REQ-10 |
| `EXECUTE_MIGRATE_FORWARD` | `{confirmationToken}` | per SPEC-016 REQ-11–REQ-13 plus `costClass !== 'unavailable'` (REQ-08) | `migrationRun.status` advances through REQ-11/REQ-12's state machine to a terminal state | `PLAN_STALE` / `TOKEN_EXPIRED` / `TOKEN_ALREADY_REDEEMED` / `FORBIDDEN` / `RESTORE_POINT_UNAVAILABLE` per which precondition failed |
| `QUIESCE` | none (internal, entered from `CONFIRMED`) | previous state is `CONFIRMED` | closes ADR-022 §4a chokepoint; sets `migrationRun.revisionSeqAtQuiesce` to the current `storage_write_watermark` value (REQ-10); if a Tier-3 plugin is enabled, sets `quiesceIntegrity = 'chokepoint-only'` (REQ-27) | none — quiesce itself does not fail; it drains and records |
| `SNAPSHOT` | none (internal) | previous state is `QUIESCING` (complete) | creates a `restore_points` row with `watermarkAtCapture` set (SPEC-016 REQ-06); `migrationRun.status = SNAPSHOTTING` then `APPLYING` on success | on failure: `migrationRun.status = SNAPSHOT_FAILED` then `ABORTED_SAFE` (REQ-13); no restore state entered |
| `APPLY_SCHEMA` | none (internal) | previous state is `SNAPSHOTTING` (complete) | SQLite: in-place DDL. Postgres: builds schema on a green target, blue keeps serving (REQ-12) | on failure: transitions to `(APPLYING)_FAILED→RESTORING` |
| `VERIFY_SCHEMA` | none (internal) | previous state is `APPLYING` (complete) | validates the applied/green schema against the plan | on failure: transitions to `(VERIFYING)_FAILED→RESTORING` |
| `CUTOVER` | none (internal, Postgres only) | previous state is `VERIFYING` (complete), dialect is `postgres` | atomic repoint blue→green | on failure: `CUTOVER_FAILED→ROLLBACK_TO_BLUE` — a distinct edge from the `APPLYING`/`VERIFYING` failure edge (REQ-12) |
| `JOURNAL_AND_COMPLETE` | none (internal) | previous state is `VERIFYING` (SQLite) or `CUTOVER` (Postgres), all complete | writes the terminal `storage_ledger` row (kind `core.migration`); `migrationRun.status = DONE` | none — terminal success |
| `RESTORE_FROM_MIGRATION_FAILURE` | none (internal, hands off to Recovery — REQ-14) | `migrationRun.status` is `RESTORING` | re-snapshots the broken state; presents the discarded-write-window disclosure; hands control to the Recovery surface's own restore-confirmation flow, never executing the restore itself | `RESTORE_FAILED` if the Recovery-executed restore itself fails |
| `RECONCILE_INTERRUPTED_MIGRATION` | none (boot-time) | a non-terminal `migration_runs` row exists in the sidecar journal after a crash | creates a `migration.interrupted` ledger row; sets `site.servingStatus` to a state that blocks normal open until Recovery resolves it (REQ-15) | none — this is itself the failure-handling path |
| `ENTER_PENDING_MIGRATION` | none (boot-time) | drift check shows the site behind the runtime and `costClass` is `'expensive'` or `'unavailable'` | `site.servingStatus = PENDING_MIGRATION` (REQ-29) | none |
| `AUTO_MIGRATE_ON_BOOT` | none (boot-time, no token) | drift check shows the site behind the runtime and `costClass === 'cheap'` | runs `EXECUTE_MIGRATE_FORWARD`'s state machine under a reserved no-token boot policy, attributed to the seeded `kind='system'` principal (REQ-28) | same failure handling as `EXECUTE_MIGRATE_FORWARD` |

## 4) Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `getDriftStatus` | none | `DriftStatus` | Never throws; computed from `.site-meta.json` vs `__drizzle_migrations` by tag identity (REQ-03) |
| `getTimeline` | `{kind?, fromDate?, toDate?, outcome?, cursor?, limit}` | `{items: StorageLedgerRow[], nextCursor: string|null}` | Empty `items` array when no rows match — never an error |
| `getMigrationRunState` | `migrationRunId` | `MigrationRun` | Not found ⇒ a `NOT_FOUND`-shaped result, not a thrown exception |
| `isPendingMigration` | `site.servingStatus` | `boolean` | `true` only when `servingStatus === 'PENDING_MIGRATION'` |
| `canAutoMigrateOnBoot` | `costClass` | `boolean` | `true` only when `costClass === 'cheap'` (REQ-28); `false` for `'expensive'`/`'unavailable'` (REQ-29) |

## 5) State Invariants
- [x] `migrationRun.status` never enters `SNAPSHOTTING` before `QUIESCING` has completed (INV-01).
- [x] A `StorageLedgerRow` of a kind other than `index.provision`/`index.drop` always references
      an existing `RestorePoint` at creation time (INV-02).
- [x] `index.provision`/`index.drop` rows never carry a non-null `restorePointId` (INV-03,
      REQ-18).
- [x] `site.servingStatus` never transitions from `PENDING_MIGRATION` back to `SERVING` except via
      a successful `EXECUTE_MIGRATE_FORWARD` or a later boot where `costClass` has become
      `'cheap'` (INV-04, REQ-30).
- [x] A Postgres `migrationRun` never applies schema changes in place against the currently
      serving (blue) schema — `APPLY_SCHEMA` always targets a green target (INV-05).
- [x] `migrationRun.quiesceIntegrity` is never set to any value other than `'chokepoint-only'` or
      `null` (INV-06).

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md`, `orchestrator.spec.md`, and `ui.spec.md`.
