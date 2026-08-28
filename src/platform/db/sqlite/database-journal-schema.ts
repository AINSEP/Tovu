import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * @file Drizzle schema for the sidecar `ops/database-journal.db` (ADR-041 §2, code-first per
 * ADR-015/ADR-012).
 *
 * Purpose:
 * `database_ledger`, `migration_runs`, and `restore_points` — the three tables ADR-041 §2/§4
 * requires to live OUTSIDE `content.db`, in a physically separate SQLite file, so that restoring
 * `content.db` from a snapshot never erases the incident record that snapshot restore is supposed
 * to narrate, and boot recovery can append a `migration.interrupted` row even when `content.db`
 * itself won't open. This is a DIFFERENT physical database from `src/platform/db/schema.ts`
 * (`content.db`'s schema) — generated via its own `drizzle.database-journal.config.ts` into
 * `src/platform/db/drizzle-database-journal/`, never merged into the `content.db` migration stream.
 *
 * Composite actor identity (`actorWorkspaceId`/`actorId`, `delegatedByWorkspaceId`/`delegatedById`)
 * is populated by the core-mediated write path at append time and is a soft, value-join reference
 * only — SQLite has no cross-database FK, so this is NOT a DB-enforced foreign key against
 * `content.db`'s `principals` table (ADR-041 §4, stated explicitly so this isn't mistaken for a
 * regression later).
 *
 * `SITE_SCOPE_EXEMPT_TABLES` (ADR-041 §4, extending ADR-007 Decision 2's workspace-less-events
 * escape hatch to these three tables): every row here carries `siteId` (never `workspaceId`) — a
 * deliberate, disclosed extension, not a silent gap.
 */

/**
 * The never-brick ledger (ADR-041 §1/§4). Append-only; `restorePointId` is `NULL` only for
 * `index.provision`/`index.drop` rows (the ADR-023 §4 carve-out, INV-03) — every other kind
 * anchors to a restore point at creation (INV-02).
 */
export const databaseLedger = sqliteTable(
  "database_ledger",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    /** core.migration | plugin.ddl | index.provision | index.drop | template.upgrade |
     * restore_point.created | restore.executed | migration.interrupted (ADR-041 §4). */
    kind: text("kind").notNull(),
    correlationId: text("correlation_id"),
    restorePointId: text("restore_point_id"),
    schemaBeforeVersion: integer("schema_before_version"),
    schemaBeforeTag: text("schema_before_tag"),
    schemaAfterVersion: integer("schema_after_version"),
    schemaAfterTag: text("schema_after_tag"),
    driftStatus: text("drift_status"),
    outcome: text("outcome").notNull(),
    detailJson: text("detail_json"),
    actorWorkspaceId: text("actor_workspace_id"),
    actorId: text("actor_id"),
    delegatedByWorkspaceId: text("delegated_by_workspace_id"),
    delegatedById: text("delegated_by_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_storage_ledger_site_created").on(t.siteId, t.createdAt),
    index("idx_storage_ledger_site_kind").on(t.siteId, t.kind),
  ]
);

/** One row per migrate-forward attempt (ADR-041 §3), driven by `features/storage`'s pure
 * `advance()` state machine. The only place a non-terminal row survives a `content.db` crash. */
export const migrationRuns = sqliteTable(
  "migration_runs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    dialect: text("dialect").notNull(),
    status: text("status").notNull(),
    revisionSeqAtQuiesce: integer("revision_seq_at_quiesce"),
    /** 'chokepoint-only' whenever any Tier-3 in-process plugin was enabled at quiesce time (ADR-041 §9); NULL otherwise. */
    quiesceIntegrity: text("quiesce_integrity"),
    blueTouched: integer("blue_touched").notNull().default(0),
    correlationId: text("correlation_id"),
    restorePointId: text("restore_point_id"),
    actorWorkspaceId: text("actor_workspace_id"),
    actorId: text("actor_id"),
    delegatedByWorkspaceId: text("delegated_by_workspace_id"),
    delegatedById: text("delegated_by_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_migration_runs_site_status").on(t.siteId, t.status)]
);

/** Terminal `migration_runs.status` values a row is never found by `findNonTerminalForSite`
 * (kept in sync with `features/storage/migrate-forward/state-machine.ts`'s `MigrationRunStatus`). */
export const MIGRATION_RUN_TERMINAL_STATUSES = ["DONE", "ABORTED_SAFE", "RESTORED", "RESTORE_FAILED", "ROLLBACK_TO_BLUE"] as const;

/** One row per restore-point artifact (ADR-041 §2). `watermarkAtCapture` is required going
 * forward, but nullable at the column level (EC-02, ADR-045 §2/`disclosure.ts`'s "unknown, never
 * zero" rule) so a pre-column legacy row is representable without a fabricated value. */
export const restorePoints = sqliteTable(
  "restore_points",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    /** manual | pre-migration-auto | template-upgrade (ADR-045 §3 restore-points-list row shape). */
    trigger: text("trigger").notNull(),
    costClass: text("cost_class").notNull(),
    kind: text("kind").notNull(),
    artifactRef: text("artifact_ref").notNull(),
    watermarkAtCapture: integer("watermark_at_capture"),
    capturedSchemaVersion: integer("captured_schema_version"),
    capturedSchemaTag: text("captured_schema_tag"),
    sizeBytes: integer("size_bytes"),
    idempotencyKey: text("idempotency_key"),
    actorWorkspaceId: text("actor_workspace_id"),
    actorId: text("actor_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_restore_points_site_created").on(t.siteId, t.createdAt),
    uniqueIndex("idx_restore_points_site_idempotency_key").on(t.siteId, t.idempotencyKey),
  ]
);
