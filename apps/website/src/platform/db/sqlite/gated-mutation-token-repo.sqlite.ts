import { SqlTokenStore } from "@jini-ai/db/gated-mutations";
import type { ConfirmationTokenRecord, TokenStorePort } from "#src/contracts/core/gated-mutations/token";
import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";

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
