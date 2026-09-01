import { count, eq } from "drizzle-orm";

import { gatedMutationTokens } from "../schema.js";
import type { ContentDb } from "./content-db.js";
import { isRedeemable } from "#src/contracts/core/gated-mutations/token";
import type { ConfirmationTokenRecord, TokenStorePort } from "#src/contracts/core/gated-mutations/token";

/**
 * @file SPEC-022 durability fix — real SQLite `TokenStorePort` adapter.
 *
 * Purpose:
 * `core/gated-mutations/token.ts`'s own file header disclosed that a durable SQLite-backed token
 * store "is not required by this test slice" and shipped only `InMemoryTokenStore`. That made the
 * `gated-mutations` capability-inventory entry `hasDurableAdapter: false` — a `classification:
 * "production"` capability with no durable adapter, which `production-readiness-gate.ts`'s
 * `collectDurabilityFailures` unconditionally fails on. This adapter closes that gap: confirmation
 * tokens now survive a process restart via the `gated_mutation_tokens` table (migration `0052`).
 *
 * `tryRedeem`'s atomicity requirement (`TokenStorePort.tryRedeem`'s own doc comment: "must perform
 * the check and the mutation without an intervening await") is satisfied the same way
 * `outbox-repo.sqlite.ts`'s `claimPending()` satisfies it for outbox events: the read, the
 * `isRedeemable` check, and the conditional write all run inside one `this.db.transaction()`
 * callback, which better-sqlite3 executes fully synchronously — no other statement (from this
 * process or a concurrent request handler) can interleave partway through.
 *
 * Architectural role:
 * Infrastructure adapter. `core/gated-mutations` never imports this file — it depends only on
 * `TokenStorePort`; composition roots (`server/deps.ts`) bind the concrete class.
 */

function toRecord(row: typeof gatedMutationTokens.$inferSelect): ConfirmationTokenRecord {
  return {
    confirmationToken: row.confirmationToken,
    planHash: row.planHash,
    scopeId: row.scopeId,
    confirmerPrincipalId: row.confirmerPrincipalId,
    status: row.status as ConfirmationTokenRecord["status"],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export class SqliteTokenStore implements TokenStorePort {
  constructor(private readonly db: ContentDb) {}

  async save(record: ConfirmationTokenRecord): Promise<void> {
    this.db
      .insert(gatedMutationTokens)
      .values({ ...record })
      .onConflictDoUpdate({ target: gatedMutationTokens.confirmationToken, set: { ...record } })
      .run();
  }

  async findByToken(token: string): Promise<ConfirmationTokenRecord | null> {
    const row = this.db.select().from(gatedMutationTokens).where(eq(gatedMutationTokens.confirmationToken, token)).get();
    return row ? toRecord(row) : null;
  }

  /** See this file's own header for why the transaction (not a raw conditional `UPDATE`) is what
   * makes this atomic. */
  async tryRedeem(params: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }> {
    return this.db.transaction((tx) => {
      const row = tx.select().from(gatedMutationTokens).where(eq(gatedMutationTokens.confirmationToken, params.token)).get();
      if (!row) return { redeemed: false, record: null };

      const record = toRecord(row);
      if (!isRedeemable({ record, now: params.now })) return { redeemed: false, record };

      tx.update(gatedMutationTokens)
        .set({ status: "redeemed" })
        .where(eq(gatedMutationTokens.confirmationToken, params.token))
        .run();

      return { redeemed: true, record: { ...record, status: "redeemed" } };
    });
  }

  async count(): Promise<number> {
    const row = this.db.select({ value: count() }).from(gatedMutationTokens).get();
    return row?.value ?? 0;
  }
}
