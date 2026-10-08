import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlOutboxAdapter } from "../repos/outbox-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The outbox on a site's SQLite `content.db`: {@link SqlOutboxAdapter} (the one Kysely query
 * body, `repos/outbox-repo.ts`), kept as a named class so the composition root that builds it from
 * the content db handle stays as it is. Transactional callers use the shared Kysely row builder.
 */

export class SqliteOutboxAdapter extends SqlOutboxAdapter {
  /**
   * @param store the connection's kernel, or the content db handle it is derived from.
   * @param optional.claimLeaseMs claim lease length.
   */
  constructor(store: ContentKernel | ContentDb, optional: { claimLeaseMs?: number } = {}) {
    super(contentKernel(store), optional);
  }
}
