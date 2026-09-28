import type { Insertable, Selectable } from "kysely";

import { isRedeemable } from "#src/contracts/core/gated-mutations/token";
import type { ConfirmationTokenRecord, TokenStorePort } from "#src/contracts/core/gated-mutations/token";
import type { ContentKernel } from "../content-kernel.js";
import type { GatedMutationTokensTable } from "../content-database.generated.js";

/**
 * @file SPEC-022 durability fix — THE durable `TokenStorePort` adapter: one Kysely query body for
 * every dialect (storage plan §4, ADR-066). `sqlite/gated-mutation-token-repo.sqlite.ts` is the
 * thin subclass the composition root builds from the content db handle.
 *
 * Purpose:
 * `core/gated-mutations/token.ts`'s own file header disclosed that a durable token store "is not
 * required by this test slice" and shipped only `InMemoryTokenStore`. That made the
 * `gated-mutations` capability-inventory entry `hasDurableAdapter: false` — a `classification:
 * "production"` capability with no durable adapter, which `production-readiness-gate.ts`'s
 * `collectDurabilityFailures` unconditionally fails on. This adapter closes that gap: confirmation
 * tokens survive a process restart via the `gated_mutation_tokens` table (migration `0052`).
 *
 * `tryRedeem` is single-use on every dialect: the read, the `isRedeemable` check and the
 * conditional write run inside one kernel transaction holding `lockKey` on the token, so no other
 * redemption of the same token can interleave (SQLite: `BEGIN IMMEDIATE` holds the write lock;
 * Postgres: a transaction advisory lock — READ COMMITTED alone would let two redeems both read
 * `minted`). The update is also conditioned on the status it read, so a missed lock could never
 * turn into a second redemption.
 *
 * Architectural role:
 * Infrastructure adapter. `core/gated-mutations` never imports this file — it depends only on
 * `TokenStorePort`; composition roots (`server/deps.ts`) bind the concrete class.
 */

function toRecord(row: Selectable<GatedMutationTokensTable>): ConfirmationTokenRecord {
  return {
    confirmationToken: row.confirmation_token,
    planHash: row.plan_hash,
    scopeId: row.scope_id,
    confirmerPrincipalId: row.confirmer_principal_id,
    status: row.status as ConfirmationTokenRecord["status"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function toRow(record: ConfirmationTokenRecord): Insertable<GatedMutationTokensTable> {
  return {
    confirmation_token: record.confirmationToken,
    plan_hash: record.planHash,
    scope_id: record.scopeId,
    confirmer_principal_id: record.confirmerPrincipalId,
    status: record.status,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
  };
}

export class SqlTokenStore implements TokenStorePort {
  constructor(protected readonly kernel: ContentKernel) {}

  async save(record: ConfirmationTokenRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("gated_mutation_tokens")
        .values(row)
        .onConflict((oc) => oc.column("confirmation_token").doUpdateSet(row))
        .execute()
    );
  }

  async findByToken(token: string): Promise<ConfirmationTokenRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("gated_mutation_tokens").selectAll().where("confirmation_token", "=", token).executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  /** See this file's own header for what makes this single-use on every dialect. */
  async tryRedeem(params: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`gated_mutation_tokens:${params.token}`);
      const row = await this.kernel.run((db) =>
        db.selectFrom("gated_mutation_tokens").selectAll().where("confirmation_token", "=", params.token).executeTakeFirst()
      );
      if (!row) return { redeemed: false, record: null };

      const record = toRecord(row);
      if (!isRedeemable({ record, now: params.now })) return { redeemed: false, record };

      const result = await this.kernel.run((db) =>
        db
          .updateTable("gated_mutation_tokens")
          .set({ status: "redeemed" })
          .where("confirmation_token", "=", params.token)
          .where("status", "=", row.status)
          .executeTakeFirst()
      );
      if (Number(result.numUpdatedRows) === 0) return { redeemed: false, record };

      return { redeemed: true, record: { ...record, status: "redeemed" } };
    });
  }

  async count(): Promise<number> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("gated_mutation_tokens").select((eb) => eb.fn.countAll<number | string>().as("value")).executeTakeFirst()
    );
    return Number(row?.value ?? 0);
  }
}
