import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import { SqlOutboxAdapter } from "@jini-ai/db/events";
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "@jini-ai/infra/events/outbox";
import type { ContentDb } from "./content-db.js";

/** Tovu owns the persisted name; the adapter and the transactional writers use the same wiring. */
export const OUTBOX_TABLES = { outboxEvents: "outbox_events" } as const;

// The adapter's design header, as it stood in this repo before the adapter moved to Jini `@jini-ai/db/events` (S6a); it still holds the
// reasons for the claim lease and the single claim lock.
/**
 * @file THE `OutboxPort` adapter over `outbox_events` (ADR-046 Phase 1): one Kysely query body for
 * every dialect (storage plan §4, ADR-066). ADR-006 rule-of-two "second adapter" half;
 * `core/events/memory-bus.ts`'s `InMemoryOutbox` is the first. `sqlite/outbox-repo.sqlite.ts` is the
 * thin subclass the composition root (`apps/website/src/server/runtime/composition/deps.ts`) builds from the content db handle.
 *
 * Events enqueued by `executeCommand()` (via `ChangeSetRepoPort.insert()`'s co-persisted write) and
 * by direct `OutboxPort.enqueue()` callers survive a restart. `enqueue()` is the plain single-row
 * path for callers outside `executeCommand()`.
 *
 * `claimPending()` selects and marks rows `processing` inside one kernel transaction under
 * `lockKey("outbox_events:claim")` (ADR-046's "claim rows atomically"): two concurrent claims can
 * never both walk away with the same row — on Postgres too, where a transaction alone would not
 * serialize the select-then-update.
 *
 * A claim is a lease (2026-09-14). The claim stores its expiry in `next_attempt_at`, and a
 * `processing` row past that expiry is claimable again, so a process that dies mid-drain no longer
 * strands its rows forever; delivery is at-least-once. `idx_outbox_events_claim` (status,
 * next_attempt_at) covers the query.
 */

// The constructor doc of the adapter before it moved: the lease default it names now lives in the binding class below.
/**
 * @param kernel the content database holding `outbox_events`.
 * @param optional.claimLeaseMs claim lease length (default {@link DEFAULT_OUTBOX_CLAIM_LEASE_MS}).
 */

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

/** Outbox rows still owed delivery: a delayed retry waits as `pending` and is still queue load. */
const LIVE_OUTBOX_STATUSES = ["pending", "processing"] as const;

/**
 * The durable outbox depth of one workspace, for the drainer's `outbox.queue_depth` gauge: rows
 * `pending` or `processing` (delayed retries included), never `delivered` or terminal `failed`.
 * One aggregate query; no rows are materialized. Postgres returns the count as a string.
 * @param required.store the connection's kernel.
 * @param required.workspaceId the workspace whose rows count.
 * @returns the live row count (0 when none).
 * @complexity O(rows in the workspace) inside the database, O(1) memory here.
 */
export async function readOutboxQueueDepth({ store, workspaceId }: { store: ContentKernel; workspaceId: string }, _optional = {}): Promise<number> {
  const row = await store.run((db) =>
    db.selectFrom(OUTBOX_TABLES.outboxEvents)
      .select((eb) => eb.fn.countAll().as("depth"))
      .where("workspace_id", "=", workspaceId)
      .where("status", "in", LIVE_OUTBOX_STATUSES)
      .executeTakeFirst());
  return Number(row?.depth ?? 0);
}
