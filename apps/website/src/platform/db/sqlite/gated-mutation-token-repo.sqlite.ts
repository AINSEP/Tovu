import { SqlTokenStore } from "@jini-ai/db/gated-mutations";
import type { ConfirmationTokenRecord, TokenStorePort } from "#src/contracts/core/gated-mutations/token";
import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";

// Why this store exists and why redemption is single-use (the retired `repos/` file's header, kept with the binding):
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
 * `TokenStorePort`; composition roots (`apps/website/src/server/runtime/composition/deps.ts`) bind the concrete class.
 */

/** Tovu owns the persisted name; the token store, backups and the pins use the same wiring. */
export const GATED_MUTATION_TOKEN_TABLES = { tokens: "gated_mutation_tokens" } as const;

/** The Jini store this binding adapts: core's object-shaped port plus the host's `count()`. */
export type InnerTokenStore = Pick<SqlTokenStore, "save" | "findByToken" | "tryRedeem" | "expire" | "count">;

/**
 * @file The gated-mutation token store on a site's SQLite `content.db`: {@link SqlTokenStore} (the
 * one Kysely query body, in Jini `@jini-ai/db/gated-mutations`), kept as a named class so the
 * composition root that builds it from the content db handle stays as it is. It keeps Tovu's positional
 * `save(record)` and adapts it to core's `save({ record })`.
 */
export class SqliteTokenStore implements TokenStorePort {
  private readonly inner: InnerTokenStore;

  /**
   * @param required.store The connection's kernel, or the content db handle it is derived from.
   * @param optional.inner The Jini store to delegate to; defaults to the one over `store` and Tovu's table name.
   */
  constructor({ store }: { store: ContentKernel | ContentDb }, optional: { inner?: InnerTokenStore } = {}) {
    this.inner = optional.inner ?? new SqlTokenStore({ kernel: schemaErasedKernel({ store }), tables: GATED_MUTATION_TOKEN_TABLES }, {});
  }

  save(record: ConfirmationTokenRecord): Promise<void> {
    return this.inner.save({ record });
  }

  findByToken(required: { token: string }): Promise<ConfirmationTokenRecord | null> {
    return this.inner.findByToken(required);
  }

  tryRedeem(required: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }> {
    return this.inner.tryRedeem(required);
  }

  expire(required: { token: string }): Promise<void> {
    return this.inner.expire(required);
  }

  count(): Promise<number> {
    return this.inner.count();
  }
}
