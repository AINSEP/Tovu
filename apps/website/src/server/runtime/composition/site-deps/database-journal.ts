import { SqliteDatabaseIntrospectionAdapter } from "#src/platform/db/sqlite/database-introspection-adapter.sqlite";
import { SqliteDatabaseLedgerRepo } from "#src/platform/db/sqlite/database-journal-repo";
import { SqliteMigrationRunsRepo } from "#src/platform/db/sqlite/database-journal-repo";
import { SqlitePublishContentRunRepo } from "#src/platform/db/sqlite/publish-content-run-repo.sqlite";
import { SqliteRestorePointsRepo } from "#src/platform/db/sqlite/database-journal-repo";
import { defaultDatabaseJournalDbPath } from "../site-paths.js";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { openDatabaseJournalDb } from "#src/platform/db/sqlite/database-journal-db";
import type { StoreCloseRegistration } from "./open-store.js";
import type { SiteStore } from "../open-site-store.js";
import type { storeBoundServicesFor } from "../store-bound-services.js";

interface ComposeDatabaseJournalRequired {
  dbPath: string;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  workspaceId: string;
  kernel: SiteStore["content"];
  storeBound: ReturnType<typeof storeBoundServicesFor>;
}

export function composeDatabaseJournal(required: ComposeDatabaseJournalRequired, _optional = {}) {
  const { dbPath, onStoreClose, workspaceId, kernel, storeBound } = required;

  // ADR-041 §2 — opens the sidecar ops journal alongside content.db. `mkdirSync` (recursive) is
  // required first: unlike `openContentDb`'s target (the process cwd, which already exists),
  // `ops/` is a new subdirectory better-sqlite3 will not create for us.
  const databaseJournalDbPath = defaultDatabaseJournalDbPath({}, { contentDbPath: dbPath });
  mkdirSync(dirname(databaseJournalDbPath), { recursive: true });
  const databaseJournalDb = openDatabaseJournalDb({ filePath: databaseJournalDbPath });
  // The ops journal owns a separate SQLite connection on every content dialect.
  onStoreClose({ registration: () => databaseJournalDb.close() });
  // `siteId` reuses `workspaceId` for v1's single-workspace-per-content.db topology — ADR-041 §7
  // names `siteId` vs `workspaceId` as SPEC-003 OQ-04, explicitly unresolved by that ADR; this
  // composition root does not resolve it either, it just picks the only value available today.
  const databaseLedgerRepo = new SqliteDatabaseLedgerRepo({ db: databaseJournalDb, siteId: workspaceId });
  // ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 2 fix) —
  // the real `migration_runs` read side `reconcileInterruptedMigrationOnBoot` needs. The actual
  // boot-time SCAN call lives in `bootstrap.ts` (a proper sequenced boot module), not here —
  // this composition root only constructs and exposes the port.
  const migrationRunsRepo = new SqliteMigrationRunsRepo({ db: databaseJournalDb, siteId: workspaceId });
  // Admin-UI backend-gap closure (design-spec.md §0.4/§3.8/§4.8, this dispatch): both classes were
  // already built (a prior session's disclosed-but-unwired infra work — see each class's own file
  // header) but never constructed by any composition root until now. `SqliteRestorePointsRepo`
  // shares the same sidecar journal db/siteId as `databaseLedgerRepo` above.
  const publishContentRunRepo = new SqlitePublishContentRunRepo({ store: kernel });
  const restorePointsRepo = new SqliteRestorePointsRepo({ db: databaseJournalDb, siteId: workspaceId,
    protectedRestorePointIds: () => publishContentRunRepo.inFlightRestorePointIds({ workspaceId }),
  });
  const { dbOps } = storeBound;
  // ADR-041 §3 (this dispatch) — reuses the SAME already-open store `dbOps` above is bound to,
  // rather than opening a second connection to the same `content.db` file.
  const databaseIntrospection = new SqliteDatabaseIntrospectionAdapter({ db: kernel, dbPath });
  return { databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, databaseIntrospection };
}
