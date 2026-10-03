import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlOutboxAdapter } from "../repos/outbox-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The outbox on a site's SQLite `content.db`: {@link SqlOutboxAdapter} (the one Kysely query
 * body, `repos/outbox-repo.ts`), kept as a named class so the composition root that builds it from
 * the content db handle stays as it is. Transactional callers use the shared Kysely row builder.
 * outboxRowFor (platform/db/sqlite/outbox-repo.sqlite.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
 */

/**
 * Builds the `outbox_events` insert row for a freshly-produced `event`, factored out of
 * `SqlOutboxAdapter.enqueue()` (`repos/outbox-repo.ts`) so a caller that inserts the row as part of its OWN
 * transaction (e.g. `SqliteUserPurge.purgeUser()`, which must enqueue its audit event atomically
 * with the purge deletes rather than through this adapter's own single-row `enqueue()`) can reuse
 * the identical row shape ({@link outboxEventValues}, renamed to Drizzle's keys) instead of a copy.
 */
// outboxRowFor (apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.

export class SqliteOutboxAdapter extends SqlOutboxAdapter {
  /**
   * @param store the connection's kernel, or the content db handle it is derived from.
   * @param optional.claimLeaseMs claim lease length.
   */
  constructor(store: ContentKernel | ContentDb, optional: { claimLeaseMs?: number } = {}) {
    super(contentKernel(store), optional);
  }
}
