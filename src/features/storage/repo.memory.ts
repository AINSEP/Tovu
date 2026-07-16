import type { LedgerReadPort, LedgerRow } from "./timeline";
import type { CreateRestorePointRepoPort } from "../recovery/restore-points";
import type { RestorePointListPort, RestorePointRecord } from "./restore-points";
import type { SiteServeStatus, SiteStatusPort } from "./boot/reconcile-interrupted-migration";
import type { DbOpsPort } from "../../core/gated-mutations/ports";

/**
 * @file In-memory `LedgerReadPort` double (ADR-006 rule-of-two's "one being built now" partner
 * to `infra/sqlite/storage-journal-repo.ts`'s `SqliteStorageLedgerRepo`). Backs
 * `server/app.ts`'s hermetic test/dev composition, mirroring every other feature's
 * `repo.memory.ts`/`repo.sqlite.ts` split in this codebase.
 */
export class InMemoryStorageLedgerRepo implements LedgerReadPort {
  private rows: LedgerRow[] = [];

  constructor(initial: LedgerRow[] = []) {
    this.rows = [...initial];
  }

  async append(row: LedgerRow): Promise<void> {
    this.rows.push(row);
  }

  async query(filter: {
    kind?: string;
    fromDate?: string;
    toDate?: string;
    outcome?: string;
    cursor?: string | null;
    limit: number;
  }): Promise<{ items: LedgerRow[]; nextCursor: string | null }> {
    const filtered = this.rows
      .filter((row) => !filter.kind || row.kind === filter.kind)
      .filter((row) => !filter.outcome || row.outcome === filter.outcome)
      .filter((row) => !filter.fromDate || row.createdAt >= filter.fromDate)
      .filter((row) => !filter.toDate || row.createdAt <= filter.toDate)
      .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));

    const startIndex = filter.cursor ? filtered.findIndex((row) => row.id === filter.cursor) + 1 : 0;
    const page = filtered.slice(startIndex, startIndex + filter.limit);
    const nextCursor = startIndex + filter.limit < filtered.length ? page[page.length - 1]?.id ?? null : null;

    return { items: page, nextCursor };
  }
}

/**
 * In-memory double for both `recovery/restore-points.ts`'s `CreateRestorePointRepoPort` (the
 * idempotency-keyed persistence side) and `storage/restore-points.ts`'s `RestorePointListPort`
 * (the read side this dispatch adds) — the same dual-port shape
 * `infra/sqlite/storage-journal-repo.ts`'s real `SqliteRestorePointsRepo` already implements.
 * Backs `server/app.ts`'s hermetic composition.
 */
export class InMemoryRestorePointsRepo implements CreateRestorePointRepoPort, RestorePointListPort {
  private readonly rows: Array<{
    restorePointId: string;
    idempotencyKey: string;
    trigger: string;
    createdAt: string;
    createdBy: string;
    costClass?: string;
    kind?: string;
    watermarkAtCapture?: number | null;
  }> = [];

  async save(row: {
    restorePointId: string;
    idempotencyKey: string;
    trigger: string;
    createdAt: string;
    createdBy: string;
    costClass?: string;
    kind?: string;
    watermarkAtCapture?: number | null;
  }): Promise<void> {
    this.rows.push(row);
  }

  async findByIdempotencyKey(key: string): Promise<{ restorePointId: string; idempotencyKey: string } | null> {
    const row = this.rows.find((r) => r.idempotencyKey === key);
    return row ? { restorePointId: row.restorePointId, idempotencyKey: row.idempotencyKey } : null;
  }

  async list(): Promise<RestorePointRecord[]> {
    return [...this.rows]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((row) => ({
        id: row.restorePointId,
        trigger: row.trigger,
        costClass: row.costClass ?? "cheap",
        kind: row.kind ?? "file-snapshot",
        watermarkAtCapture: row.watermarkAtCapture ?? null,
        createdAt: row.createdAt,
      }));
  }
}

/** In-memory `SiteStatusPort` double, defaulted to `"SERVING"` — no boot-time reconciliation
 * caller is wired this pass (`reconcileInterruptedMigrationOnBoot`/`evaluateBootMigrationPolicy`
 * are domain logic only, not yet invoked from a composition root's boot sequence; see this
 * dispatch's handoff), so this status only ever changes if a future route/boot-hook calls
 * `.set()`. Backs both `server/app.ts` and, until a real persisted site-status store exists,
 * `server/deps.ts` too. */
export class InMemorySiteStatusRepo implements SiteStatusPort {
  private status: SiteServeStatus = "SERVING";

  async get(_siteId: string): Promise<SiteServeStatus> {
    return this.status;
  }

  async set(_siteId: string, status: SiteServeStatus): Promise<void> {
    this.status = status;
  }
}

/** In-memory `DbOpsPort` double (`core/gated-mutations/ports.ts`) — reports the same static
 * `cheap`/`file-snapshot` capability `infra/sqlite/db-ops.ts`'s real `SqliteDbOpsAdapter` reports
 * for a SQLite-backed site (this codebase's only dialect today), and fabricates an in-process
 * `artifactRef` instead of performing a real online backup, since `server/app.ts`'s hermetic
 * composition never touches a real content.db file. `server/deps.ts`'s real composition uses
 * `SqliteDbOpsAdapter` instead. */
export class InMemoryDbOpsAdapter implements DbOpsPort {
  private watermark = 0;

  async getCapabilities(): Promise<{ restorePoint: { costClass: "cheap" | "expensive" | "unavailable"; kind: "file-snapshot" | "logical-dump" | "external" } }> {
    return { restorePoint: { costClass: "cheap", kind: "file-snapshot" } };
  }

  async captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    this.watermark += 1;
    return { artifactRef: `memory://restore-point/${required.scopeId}/${this.watermark}`, watermarkAtCapture: this.watermark };
  }
}
