import { outboxEvents } from "../schema.sqlite.js";
import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { outboxEventValues, SqlOutboxAdapter } from "../repos/outbox-repo.js";
import type { ContentDb } from "./content-db.js";
import type { DomainEvent } from "@jini-ai/cms/core";

/**
 * @file The outbox on a site's SQLite `content.db`: {@link SqlOutboxAdapter} (the one Kysely query
 * body, `repos/outbox-repo.ts`), kept as a named class so the composition root that builds it from
 * the content db handle stays as it is. Also {@link outboxRowFor}, the same row in Drizzle's shape
 * for the callers that still insert it through Drizzle inside their own transaction.
 */

/**
 * Builds the `outbox_events` insert row for a freshly-produced `event`, factored out of
 * `SqlOutboxAdapter.enqueue()` (`repos/outbox-repo.ts`) so a caller that inserts the row as part of its OWN
 * transaction (e.g. `SqliteUserPurge.purgeUser()`, which must enqueue its audit event atomically
 * with the purge deletes rather than through this adapter's own single-row `enqueue()`) can reuse
 * the identical row shape ({@link outboxEventValues}, renamed to Drizzle's keys) instead of a copy.
 */
export function outboxRowFor(event: DomainEvent): typeof outboxEvents.$inferInsert {
  const row = outboxEventValues(event);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    eventJson: row.event_json,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
  };
}

export class SqliteOutboxAdapter extends SqlOutboxAdapter {
  /**
   * @param store the connection's kernel, or the content db handle it is derived from.
   * @param optional.claimLeaseMs claim lease length.
   */
  constructor(store: ContentKernel | ContentDb, optional: { claimLeaseMs?: number } = {}) {
    super(contentKernel(store), optional);
  }
}
