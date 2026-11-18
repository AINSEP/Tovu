import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import { SqlOutboxAdapter } from "@jini-ai/db/events";
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "#src/contracts/core/events/index";
import type { ContentDb } from "./content-db.js";

/** Tovu owns the persisted name; the adapter and the transactional writers use the same wiring. */
export const OUTBOX_TABLES = { outboxEvents: "outbox_events" } as const;

/**
 * @file The outbox on a site's SQLite `content.db`: {@link SqlOutboxAdapter} (the one Kysely query
 * body, in Jini `@jini-ai/db/events`), kept as a named class so the composition root that builds it from
 * the content db handle stays as it is. Transactional callers use the shared Kysely row builder,
 * `outboxEventValues` from the same Jini module. The claim lease is the host's number, passed here.
 */

export class SqliteOutboxAdapter extends SqlOutboxAdapter {
  /**
   * @param required.store the connection's kernel, or the content db handle it is derived from.
   * @param optional.claimLeaseMs claim lease length (default {@link DEFAULT_OUTBOX_CLAIM_LEASE_MS}).
   */
  constructor({ store }: { store: ContentKernel | ContentDb }, optional: { claimLeaseMs?: number } = {}) {
    super({ kernel: schemaErasedKernel({ store }), tables: OUTBOX_TABLES, claimLeaseMs: optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS }, {});
  }
}
