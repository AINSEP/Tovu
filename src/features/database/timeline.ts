/**
 * @file SPEC-017 C-101 / REQ-01 / REQ-04 / REQ-05 / AC-01 / AC-04 / AC-05 — the Timeline read
 * model (ADR-041 §1).
 *
 * Purpose:
 * Renders the never-brick ledger (migrations, snapshots, index provisions, template upgrades,
 * restores, interrupted migrations) as a filterable, cursor-paginated read surface. This module
 * is deliberately read-only by construction — no raw-row-edit, SQL-console, or DB-first-mode
 * export may ever exist here (AC-05); that is a permanent category error against this codebase's
 * write-chokepoint/authorize/append-only-revision model (ADR-041 "Why Database, not Database").
 *
 * How it relates to the project:
 * `LedgerReadPort` is implemented by the sidecar ops-journal adapter (ADR-041 §2); this module
 * has no knowledge of that adapter's database details.
 *
 * Architectural role:
 * `features/database` domain logic. Depends only on the injected `LedgerReadPort`.
 */

/** One row of the append-only `storage_ledger` (ADR-041 §4), as rendered to the Timeline UI. */
export interface LedgerRow {
  id: string;
  kind: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  restorePointId: string | null;
  outcome: string;
}

export interface LedgerReadPort {
  query(filter: {
    kind?: string;
    fromDate?: string;
    toDate?: string;
    outcome?: string;
    cursor?: string | null;
    limit: number;
  }): Promise<{ items: LedgerRow[]; nextCursor: string | null }>;
}

/** The server-side row cap (REQ-04) — no raw/unbounded query surface is ever offered. */
const MAX_TIMELINE_PAGE_SIZE = 200;
const DEFAULT_TIMELINE_PAGE_SIZE = 50;

/** Thrown when a caller requests a page size above the server's bound. */
class TimelineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineValidationError";
  }
}

/**
 * Returns a filtered, cursor-paginated page of the Timeline ledger.
 *
 * @complexity O(1) plus one `LedgerReadPort.query()` call (the port owns the actual scan/index
 * cost).
 * @overallScore 100
 */
export async function getTimeline(
  required: {
    ledger: LedgerReadPort;
    filter?: { kind?: string; fromDate?: string; toDate?: string; outcome?: string; cursor?: string; limit?: number };
  },
  _optional: Record<string, never> = {}
): Promise<{ items: LedgerRow[]; nextCursor: string | null }> {
  const { ledger, filter = {} } = required;
  const limit = filter.limit ?? DEFAULT_TIMELINE_PAGE_SIZE;

  if (limit > MAX_TIMELINE_PAGE_SIZE) {
    throw new TimelineValidationError(`REQ-04: requested limit ${limit} exceeds the server cap of ${MAX_TIMELINE_PAGE_SIZE}`);
  }

  return ledger.query({ ...filter, limit });
}
