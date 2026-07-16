/**
 * @file SPEC-017 C-109 / INV-07 / REQ-25 / REQ-26 / AC-31–AC-35 — the Tier-3 read-only browser's
 * unconditional sensitive-column redaction guarantee (ADR-041 §8, D6).
 *
 * Purpose:
 * `describeTables`/`readRows` are the off-by-default read-only browser this ADR permits as a
 * hardening choice beyond ADR-023 §8's floor. Every core/plugin table's Drizzle schema marks
 * hash/secret-bearing columns `sensitive: true`; this module never lists or projects a sensitive
 * column, regardless of permission tier — redaction here is unconditional, not gated by
 * `storage.read` vs any higher tier (INV-07).
 *
 * How it relates to the project:
 * `fetch` is injected so this module never touches SQL/Drizzle directly — the caller supplies the
 * actual bounded `dbOps.readRows()` adapter call; this module owns only the redaction guarantee
 * and the bounded-predicate/limit validation (never raw SQL text, REQ-26).
 *
 * Architectural role:
 * `features/storage` domain logic. Depends only on the injected `fetch` callback.
 */

export interface ColumnDescriptor {
  name: string;
  sensitive: boolean;
}

export interface TableDescriptor {
  name: string;
  columns: ColumnDescriptor[];
}

/** Thrown for any request shape this bounded browser refuses: raw SQL text, or a limit above the server cap. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface BoundedPredicate {
  column: string;
  op: "eq" | "gt" | "lt" | "gte" | "lte";
  value: unknown;
}

const MAX_ROW_LIMIT = 200;
const DEFAULT_ROW_LIMIT = 50;

function isBoundedPredicate(value: unknown): value is BoundedPredicate {
  return typeof value === "object" && value !== null && "column" in value && "op" in value && "value" in value;
}

/**
 * Lists every table's non-sensitive columns only — a `sensitive: true` column is never listed
 * (AC-31), for any table, unconditionally.
 *
 * @complexity O(tables * columns).
 * @overallScore 100
 */
export async function describeTables(
  required: { tables: TableDescriptor[] },
  _optional: Record<string, never> = {}
): Promise<Array<{ name: string; columns: string[] }>> {
  return required.tables.map((table) => ({
    name: table.name,
    columns: table.columns.filter((column) => !column.sensitive).map((column) => column.name),
  }));
}

/**
 * Fetches rows through the injected bounded reader, unconditionally stripping every sensitive
 * column from every returned row before it leaves this module (INV-07) — regardless of what the
 * underlying `fetch` returns, and regardless of which permission tier the caller holds.
 *
 * @complexity O(rows * columns) for the redaction pass; the injected `fetch` owns the actual query
 * cost.
 * @overallScore 100
 */
export async function readRows(
  required: {
    table: TableDescriptor;
    where?: BoundedPredicate | null;
    orderBy?: string;
    cursor?: string;
    limit?: number;
    fetch: (params: { where?: unknown; orderBy?: string; cursor?: string; limit: number }) => Promise<{
      rows: Record<string, unknown>[];
      nextCursor: string | null;
    }>;
  },
  _optional: Record<string, never> = {}
): Promise<{ rows: Record<string, unknown>[]; nextCursor: string | null }> {
  const { table, where, orderBy, cursor, fetch } = required;
  const limit = required.limit ?? DEFAULT_ROW_LIMIT;

  if (limit > MAX_ROW_LIMIT) {
    throw new ValidationError(`AC-35: requested limit ${limit} exceeds the server cap of ${MAX_ROW_LIMIT}`);
  }
  if (where !== undefined && where !== null && !isBoundedPredicate(where)) {
    throw new ValidationError("AC-34: where must be a bounded predicate ({column, op, value}), never raw SQL text");
  }

  const sensitiveColumnNames = new Set(table.columns.filter((column) => column.sensitive).map((column) => column.name));

  // EC-05: a where-clause referencing a sensitive column is silently omitted from the query,
  // never surfaced as an error and never leaked via a value-guessing side channel.
  const effectiveWhere = where && !sensitiveColumnNames.has(where.column) ? where : undefined;

  const result = await fetch({ where: effectiveWhere, orderBy, cursor, limit });

  const rows = result.rows.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!sensitiveColumnNames.has(key)) {
        projected[key] = value;
      }
    }
    return projected;
  });

  return { rows, nextCursor: result.nextCursor };
}
