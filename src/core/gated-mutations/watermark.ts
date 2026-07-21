import { eq, sql } from "drizzle-orm";

import type { ContentDb } from "../../infra/sqlite/content-db";
import * as schema from "../../infra/db/schema";
import type { MirrorStorePort } from "./ports";

/**
 * @file SPEC-016 C-004 / U-002 / U-004 / REQ-01 / REQ-04 / REQ-05 / INV-01 — the site-wide
 * gated-mutation write watermark and its read-side mirror reconciliation.
 *
 * Purpose:
 * `database_write_watermark` is a singleton row in `content.db`, advanced by exactly 1 inside the
 * SAME transaction as the gated mutation it stamps (same-transaction atomicity, U-002-B1/INV-01).
 * `reconcileMirror` is the boot-time (and on-demand) sync that overwrites a cheap, possibly-stale
 * read-side mirror from that authoritative value — never the other way around (U-004-B1).
 *
 * How it relates to the project:
 * - `gateway.ts`'s `hooks.executeMutation()` calls `stampWatermarkTx` inside its own open
 *   Drizzle transaction, alongside whatever domain rows that mutation writes.
 * - `openContentDb` (infra/sqlite/content-db.ts) guarantees the singleton row exists.
 *
 * Architectural role:
 * Core primitive shared by every gated-mutation domain (database, recovery, ...); no domain-specific
 * knowledge here.
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

/** The Drizzle transaction callback argument `content-db.ts`'s `db.transaction((tx) => ...)` idiom hands the caller. */
export type ContentDbTransaction = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

/**
 * Real `content.db`-backed variant of `stampWatermark`: wraps the given Drizzle transaction in an
 * `OpenTransactionHandle` whose `increment()` performs the actual `UPDATE ... SET value = value +
 * 1` against `database_write_watermark`'s singleton row, then reuses `stampWatermark`'s guard/shape
 * so both entry points share one increment-exactly-once contract.
 *
 * Must be called from inside the caller's own already-open transaction (same `tx`), never on a
 * bare `db` — that is what makes the increment atomic with whatever sibling row that transaction
 * also writes (U-002-B1, INV-01).
 *
 * @complexity O(1) — one UPDATE + one SELECT against a single-row table.
 * @overallScore 100
 */
export function stampWatermarkTx(
  required: { tx: ContentDbTransaction },
  _optional: Record<string, never> = {}
): { newValue: number } {
  const { tx } = required;
  const handle: OpenTransactionHandle = {
    isOpen: true,
    increment: () => {
      tx.update(schema.databaseWriteWatermark)
        .set({
          value: sql`${schema.databaseWriteWatermark.value} + 1`,
          lastStampedAt: new Date().toISOString(),
        })
        .where(eq(schema.databaseWriteWatermark.id, 1))
        .run();
      const row = tx
        .select({ value: schema.databaseWriteWatermark.value })
        .from(schema.databaseWriteWatermark)
        .where(eq(schema.databaseWriteWatermark.id, 1))
        .all()[0];
      return row?.value ?? 0;
    },
  };
  return stampWatermark({ tx: handle });
}

/**
 * Reads the current authoritative watermark value directly from `content.db`.
 *
 * @complexity O(1) — single-row lookup by primary key.
 * @overallScore 100
 */
export function getCurrentWatermark(required: { db: ContentDb }, _optional: Record<string, never> = {}): { value: number } {
  const row = required.db
    .select({ value: schema.databaseWriteWatermark.value })
    .from(schema.databaseWriteWatermark)
    .where(eq(schema.databaseWriteWatermark.id, 1))
    .all()[0];
  return { value: row?.value ?? 0 };
}

/**
 * Boot-time (and on-demand) mirror reconciliation (U-004). `db: null` models "content.db failed
 * to open" — the composition root catches the open failure and passes `null` rather than this
 * function performing the open call itself, keeping it pure with respect to filesystem/DB-open
 * error handling (the composition root's job).
 *
 * On a successful open: unconditionally overwrites the mirror from the authoritative value,
 * discarding the mirror's own prior value entirely (U-004-B1 — never a merge, never "keep the
 * higher of the two").
 *
 * On a failed open: leaves the mirror's `value` untouched and marks it `'unrefreshable'`
 * (U-004-B2/U-004-F1/REQ-05) — never a precise-looking but wrong value.
 *
 * @complexity O(1) plus one read against `content.db` when `db` is non-null.
 * @overallScore 100
 */
export async function reconcileMirror(
  required: { db: ContentDb | null; mirror: MirrorStorePort },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { db, mirror } = required;
  if (!db) {
    await mirror.markUnrefreshable();
    return;
  }
  const { value } = getCurrentWatermark({ db });
  await mirror.set(value);
}
