/**
 * @file SPEC-016 C-004 / U-002-B1 — the dialect-neutral half of the site-wide gated-mutation write
 * watermark: the transaction-boundary guard every concrete stamping adapter is built on.
 *
 * Purpose:
 * `stampWatermark` only inspects `OpenTransactionHandle.isOpen` and invokes `increment()` — it
 * never touches a schema, a table, or a SQL dialect, which is what lets it live in `core` without
 * creating a dependency on `db`. The SQLite-concrete adapter that wraps a real Drizzle transaction
 * in an `OpenTransactionHandle` (`stampWatermarkTx`), reads the authoritative value
 * (`getCurrentWatermark`), and reconciles the boot-time mirror (`reconcileMirror`) lives in
 * `db/sqlite/watermark.ts` instead, since all three need the concrete `ContentDb`/schema types to
 * do their job (SPEC-016 C-004/U-004/REQ-01/REQ-04/REQ-05/INV-01 — see that file's own doc comment).
 *
 * How it relates to the project:
 * - `gateway.ts`'s `hooks.executeMutation()` calls `db/sqlite/watermark.ts`'s `stampWatermarkTx`
 *   inside its own open Drizzle transaction, alongside whatever domain rows that mutation writes.
 *
 * Architectural role:
 * Core primitive shared by every gated-mutation domain (database, recovery, ...); no domain-specific
 * or dialect-specific knowledge here.
 */

/**
 * Opaque transaction-boundary guard. Real callers pass the concrete SQLite/Postgres transaction
 * object; `stampWatermark` only inspects `isOpen` and invokes `increment()` — see `stampWatermarkTx`
 * for how the real Drizzle transaction is adapted to this shape.
 */
export interface OpenTransactionHandle {
  readonly isOpen: true;
  /** Performs the actual +1 write against the open transaction and returns the new value. */
  increment(): number;
}

/** Thrown when `stampWatermark` is called without an open transaction (U-002-B1). */
export class WatermarkTransactionRequiredError extends Error {}

/**
 * Advances the watermark by exactly 1 using the caller-supplied transaction handle. Throws
 * `WatermarkTransactionRequiredError` rather than silently succeeding outside an open transaction
 * (AC-02/U-002-B1) — a watermark stamp with no transaction backing it can never be atomic with the
 * sibling mutation it is meant to certify.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function stampWatermark(
  required: { tx: OpenTransactionHandle | null },
  _optional: Record<string, never> = {}
): { newValue: number } {
  const { tx } = required;
  if (!tx || !tx.isOpen) {
    throw new WatermarkTransactionRequiredError(
      "stampWatermark must be called with an open transaction handle (U-002-B1)"
    );
  }
  return { newValue: tx.increment() };
}
