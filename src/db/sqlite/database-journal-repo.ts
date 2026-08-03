import { and, desc, eq, gte, lte, or, lt, type SQL } from "drizzle-orm";

import type { LedgerReadPort, LedgerRow } from "../../features/database/timeline";
import type { BootLedgerPort, MigrationRunsRepoPort } from "../../features/database/boot/reconcile-interrupted-migration";
import type { CreateRestorePointRepoPort } from "../../features/recovery/restore-points";
import * as schema from "./database-journal-schema";
import type { DatabaseJournalDb } from "./database-journal-db";

/**
 * @file ADR-041 §2/§4 — real SQLite adapters over the sidecar `ops/database-journal.db`, closing
 * the gap Session 2's `features/database` slice explicitly disclosed: the domain-logic layer
 * (`timeline.ts`, `boot/reconcile-interrupted-migration.ts`, ...) existed fakes-only, with no
 * adapter that actually persists into `database_ledger`/`migration_runs`/`restore_points`.
 *
 * Purpose:
 * Every class here is a thin, siteId-scoped implementation of an ALREADY-DEFINED port from
 * `features/database`/`features/recovery` — no port shape changes, only real persistence behind
 * them. `SqliteDatabaseLedgerRepo` doubles as `LedgerReadPort` (Timeline's read side) and
 * `BootLedgerPort` (boot reconciliation's append side), since both operate on the same
 * `database_ledger` table.
 *
 * How it relates to the project:
 * `server/deps.ts` constructs these against the sidecar db `database-journal-db.ts` opens
 * alongside `content.db`; `server/app.ts`'s in-memory test composition uses simple in-process
 * fakes instead (mirrors every other feature's app.ts/deps.ts split in this codebase).
 *
 * Architectural role:
 * Infrastructure adapters. ADR-042 item 1 discipline: single-row workspace/site-scoped lookups
 * reuse `repo-helpers.ts`'s `findOneBy` rather than hand-rolling the `select().where().limit(1)`
 * shape.
 */

function encodeCursor(row: { createdAt: string; id: string }): string {
  return `${row.createdAt}::${row.id}`;
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  const separatorIndex = cursor.indexOf("::");
  if (separatorIndex < 0) return null;
  return { createdAt: cursor.slice(0, separatorIndex), id: cursor.slice(separatorIndex + 2) };
}

/** `database_ledger` adapter — implements both the Timeline's read port and the boot
 * reconciliation's append port, siteId-scoped at construction. */
export class SqliteDatabaseLedgerRepo implements LedgerReadPort, BootLedgerPort {
  constructor(private readonly deps: { db: DatabaseJournalDb; siteId: string }) {}

  /**
   * REQ-01/REQ-04 — filtered, cursor-paginated read over `database_ledger`, newest-first. The
   * cursor is an opaque `${createdAt}::${id}` composite (never a raw offset — stable under
   * concurrent inserts).
   *
   * @complexity O(limit) via the `(site_id, created_at)` index; one extra row fetched to detect
   * `nextCursor` presence without a second COUNT query.
   * @overallScore 100
   */
  async query(filter: {
    kind?: string;
    fromDate?: string;
    toDate?: string;
    outcome?: string;
    cursor?: string | null;
    limit: number;
  }): Promise<{ items: LedgerRow[]; nextCursor: string | null }> {
    const { db, siteId } = this.deps;

    const conditions: SQL[] = [eq(schema.databaseLedger.siteId, siteId)];
    if (filter.kind) conditions.push(eq(schema.databaseLedger.kind, filter.kind));
    if (filter.outcome) conditions.push(eq(schema.databaseLedger.outcome, filter.outcome));
    if (filter.fromDate) conditions.push(gte(schema.databaseLedger.createdAt, filter.fromDate));
    if (filter.toDate) conditions.push(lte(schema.databaseLedger.createdAt, filter.toDate));

    if (filter.cursor) {
      const decoded = decodeCursor(filter.cursor);
      if (decoded) {
        conditions.push(
          or(
            lt(schema.databaseLedger.createdAt, decoded.createdAt),
            and(eq(schema.databaseLedger.createdAt, decoded.createdAt), lt(schema.databaseLedger.id, decoded.id))
          ) as SQL
        );
      }
    }

    const rows = db
      .select()
      .from(schema.databaseLedger)
      .where(and(...conditions))
      .orderBy(desc(schema.databaseLedger.createdAt), desc(schema.databaseLedger.id))
      .limit(filter.limit + 1)
      .all();

    const page = rows.slice(0, filter.limit);
    const items: LedgerRow[] = page.map((row) => ({
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt,
      restorePointId: row.restorePointId,
      outcome: row.outcome,
    }));

    const nextCursor = rows.length > filter.limit ? encodeCursor(page[page.length - 1]) : null;
    return { items, nextCursor };
  }

  /** Appends one `database_ledger` row (ADR-041 §4). Never mutates or deletes an existing row —
   * the ledger is append-only by construction. */
  async append(row: {
    id: string;
    kind: string;
    correlationId?: string | null;
    restorePointId?: string | null;
    schemaBeforeVersion?: number | null;
    schemaBeforeTag?: string | null;
    schemaAfterVersion?: number | null;
    schemaAfterTag?: string | null;
    driftStatus?: string | null;
    outcome: string;
    detailJson?: string | null;
    actorWorkspaceId?: string | null;
    actorId?: string | null;
    delegatedByWorkspaceId?: string | null;
    delegatedById?: string | null;
    createdAt: string;
  }): Promise<void> {
    this.deps.db
      .insert(schema.databaseLedger)
      .values({ siteId: this.deps.siteId, ...row })
      .run();
  }

  /** SPEC-017 C-106 — converts a non-terminal `migration_runs` row into a `migration.interrupted`
   * ledger row (ADR-041 §3's boot-time crash reconciliation).
   *
   * Round-5 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, codex `R5-F1-BLOCKED-RECOVERY-
   * NOT-RESTART-SAFE` / Fable `R5-F1-INTERRUPTED-SECOND-BOOT-BRICK`, both independently confirmed
   * by direct code inspection and Fable's empirical double-boot reproduction): `database_ledger.id`
   * is `text("id").primaryKey()`, and this method's id (`interrupted-${migrationRunId}`) is
   * deterministic BY DESIGN so a second boot re-detecting the SAME still-unresolved migration
   * targets the same row. Before this fix, the plain `.insert().run()` this called through
   * `append()` threw `UNIQUE constraint failed` on that second boot, which — because this is a
   * CRITICAL boot module — failed the whole boot and `process.exit(1)`'d before `app.listen()`,
   * making Recovery itself unreachable. `onConflictDoNothing` makes the deterministic id do what
   * it was always meant to: every boot re-detects and re-blocks idempotently. */
  async appendInterruptedRow(params: { siteId: string; migrationRunId: string }): Promise<void> {
    this.deps.db
      .insert(schema.databaseLedger)
      .values({
        id: `interrupted-${params.migrationRunId}`,
        siteId: this.deps.siteId,
        kind: "migration.interrupted",
        restorePointId: null,
        outcome: "blocked_pending_recovery",
        detailJson: JSON.stringify({ migrationRunId: params.migrationRunId }),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing({ target: schema.databaseLedger.id })
      .run();
  }
}

/** `migration_runs` adapter — implements the boot-sequence's `MigrationRunsRepoPort`, plus the
 * insert/status-update helpers the state machine's own persistence caller needs. */
export class SqliteMigrationRunsRepo implements MigrationRunsRepoPort {
  private static readonly TERMINAL_STATUSES = new Set(schema.MIGRATION_RUN_TERMINAL_STATUSES as readonly string[]);

  constructor(private readonly deps: { db: DatabaseJournalDb; siteId: string }) {}

  /**
   * SPEC-017 C-106/C-107 (INV-08) — the single defensive read both boot-sequence steps consult:
   * a non-null result means a crashed-mid-migration run has not yet been reconciled.
   *
   * @complexity O(1) via the `(site_id, status)` index.
   * @overallScore 100
   */
  async findNonTerminalForSite(siteId: string): Promise<{ id: string; status: string } | null> {
    const rows = this.deps.db
      .select({ id: schema.migrationRuns.id, status: schema.migrationRuns.status })
      .from(schema.migrationRuns)
      .where(eq(schema.migrationRuns.siteId, siteId))
      .all();

    const nonTerminal = rows.find((row) => !SqliteMigrationRunsRepo.TERMINAL_STATUSES.has(row.status));
    return nonTerminal ?? null;
  }

  /** Round-5 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, R5-F1/R5-F2 fix) — terminalizes
   * a run as `RESTORED` (a real member of `MIGRATION_RUN_TERMINAL_STATUSES`) so the next boot's
   * `findNonTerminalForSite` no longer re-detects it. Thin wrapper over `updateState`, kept as its
   * own port method so callers outside this file (the restore ceremony) don't need `updateState`'s
   * full row shape. */
  async markResolved(params: { id: string }): Promise<void> {
    this.deps.db
      .update(schema.migrationRuns)
      .set({ status: "RESTORED", updatedAt: new Date().toISOString() })
      .where(eq(schema.migrationRuns.id, params.id))
      .run();
  }

  /** Inserts a new `migration_runs` row (state machine's initial `IDLE`/`PLANNED` write). */
  async insert(row: {
    id: string;
    dialect: "sqlite" | "postgres";
    status: string;
    correlationId?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    this.deps.db
      .insert(schema.migrationRuns)
      .values({ siteId: this.deps.siteId, blueTouched: 0, ...row })
      .run();
  }

  /** Persists a state-machine transition's resulting fields against an existing row. */
  async updateState(row: {
    id: string;
    status: string;
    revisionSeqAtQuiesce?: number | null;
    quiesceIntegrity?: string | null;
    blueTouched?: boolean;
    restorePointId?: string | null;
    updatedAt: string;
  }): Promise<void> {
    this.deps.db
      .update(schema.migrationRuns)
      .set({
        status: row.status,
        revisionSeqAtQuiesce: row.revisionSeqAtQuiesce,
        quiesceIntegrity: row.quiesceIntegrity,
        blueTouched: row.blueTouched === undefined ? undefined : row.blueTouched ? 1 : 0,
        restorePointId: row.restorePointId,
        updatedAt: row.updatedAt,
      })
      .where(and(eq(schema.migrationRuns.siteId, this.deps.siteId), eq(schema.migrationRuns.id, row.id)))
      .run();
  }
}

/** `restore_points` adapter — implements `features/recovery/restore-points.ts`'s
 * `CreateRestorePointRepoPort`, plus the database-side persistence helper `db-ops`'s
 * `captureRestorePoint()` result needs to become a durable row. */
export class SqliteRestorePointsRepo implements CreateRestorePointRepoPort {
  constructor(private readonly deps: { db: DatabaseJournalDb; siteId: string }) {}

  /** REQ-05 (recovery) / REQ-22 (database) — persists one `restore_points` row. */
  async save(row: {
    restorePointId: string;
    idempotencyKey: string;
    trigger: string;
    createdAt: string;
    createdBy: string;
    costClass?: string;
    kind?: string;
    artifactRef?: string;
    watermarkAtCapture?: number | null;
    capturedSchemaVersion?: number | null;
    capturedSchemaTag?: string | null;
  }): Promise<void> {
    this.deps.db
      .insert(schema.restorePoints)
      .values({
        id: row.restorePointId,
        siteId: this.deps.siteId,
        trigger: row.trigger,
        costClass: row.costClass ?? "cheap",
        kind: row.kind ?? "file-snapshot",
        artifactRef: row.artifactRef ?? "",
        watermarkAtCapture: row.watermarkAtCapture ?? null,
        capturedSchemaVersion: row.capturedSchemaVersion ?? null,
        capturedSchemaTag: row.capturedSchemaTag ?? null,
        idempotencyKey: row.idempotencyKey,
        actorId: row.createdBy,
        createdAt: row.createdAt,
      })
      .run();
  }

  /**
   * AC-11 (recovery) — `(site_id, idempotency_key)` single-row lookup. Deliberately NOT routed
   * through `repo-helpers.ts`'s `findOneBy` (ADR-042 item 1's normal reuse target): that helper's
   * `db` parameter is pinned to `ContentDb`'s specific schema-typed generic, and this adapter
   * operates on a structurally different database (the sidecar journal, a separate physical
   * SQLite file with its own schema type) — reusing it would require either an unsound cast or
   * widening `findOneBy`'s signature for every one of its 11 existing `content.db` call sites,
   * neither of which this single lookup justifies. This is the same `select().where().limit(1)`
   * shape `findOneBy` wraps, disclosed as a one-off exception rather than silently duplicated.
   */
  async findByIdempotencyKey(key: string): Promise<{ restorePointId: string; idempotencyKey: string } | null> {
    const rows = this.deps.db
      .select({ id: schema.restorePoints.id, idempotencyKey: schema.restorePoints.idempotencyKey })
      .from(schema.restorePoints)
      .where(and(eq(schema.restorePoints.siteId, this.deps.siteId), eq(schema.restorePoints.idempotencyKey, key)))
      .limit(1)
      .all();
    const row = rows[0];
    return row && row.idempotencyKey ? { restorePointId: row.id, idempotencyKey: row.idempotencyKey } : null;
  }

  /** Newest-first restore-point listing for the Recovery screen / Timeline. */
  async list(): Promise<
    Array<{
      id: string;
      trigger: string;
      costClass: string;
      kind: string;
      watermarkAtCapture: number | null;
      createdAt: string;
      artifactRef: string;
    }>
  > {
    return this.deps.db
      .select({
        id: schema.restorePoints.id,
        trigger: schema.restorePoints.trigger,
        costClass: schema.restorePoints.costClass,
        kind: schema.restorePoints.kind,
        watermarkAtCapture: schema.restorePoints.watermarkAtCapture,
        createdAt: schema.restorePoints.createdAt,
        // 2026-07-16: previously never selected — see this file's `save()` for the matching
        // write side and `features/recovery/gated-hooks.ts`'s `buildRestoreHooks` for why the
        // omission mattered (the restore ceremony had no way to know which file to restore from).
        artifactRef: schema.restorePoints.artifactRef,
      })
      .from(schema.restorePoints)
      .where(eq(schema.restorePoints.siteId, this.deps.siteId))
      .orderBy(desc(schema.restorePoints.createdAt))
      .all();
  }
}
