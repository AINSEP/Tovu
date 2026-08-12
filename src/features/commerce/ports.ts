import type {
  CommerceOrderItemRecord,
  CommerceOrderRecord,
  CommerceOrderStatus,
  CommercePriceRecord,
  CommerceProductRecord,
  CommerceWebhookEventRecord,
} from "./types";

/**
 * @file Port contracts for the Commerce first vertical slice (dependency-inversion seams, ADR-006
 * rule-of-two). Interfaces only — no feature logic. Mirrors `src/members/ports.ts`'s shape.
 *
 * Only a SQLite adapter exists this pass (`repo.sqlite.ts`) — Postgres/MySQL have no live driver
 * anywhere in this codebase yet (2026-08-12 debate F3), so a second adapter would have nothing
 * real to prove itself against. The ports are still declared as the seam a future adapter (and
 * an in-memory test double) implements against, matching every other feature in this repo.
 */

export interface CommerceProductRepoPort {
  findById(required: { workspaceId: string; id: string }): Promise<CommerceProductRecord | null>;
  findBySlug(required: { workspaceId: string; slug: string }): Promise<CommerceProductRecord | null>;
  save(record: CommerceProductRecord): Promise<void>;
}

export interface CommercePriceRepoPort {
  findById(required: { workspaceId: string; id: string }): Promise<CommercePriceRecord | null>;
  listByProduct(required: { workspaceId: string; productId: string }): Promise<CommercePriceRecord[]>;
  save(record: CommercePriceRecord): Promise<void>;
}

export interface CommerceOrderRepoPort {
  findById(required: { workspaceId: string; id: string }): Promise<CommerceOrderRecord | null>;
  listItems(required: { workspaceId: string; orderId: string }): Promise<CommerceOrderItemRecord[]>;
  /**
   * Persists an order header plus its line items in one atomic write — a checkout is all-or-
   * nothing; a partially-written order (header with no items, or vice versa) must never be
   * observable to a concurrent reader.
   */
  placeOrder(required: {
    order: CommerceOrderRecord;
    items: readonly CommerceOrderItemRecord[];
  }): Promise<void>;
}

export type ApplyProviderEventResult = "applied" | "duplicate" | "stale";

export interface ApplyProviderEventProjection {
  status: CommerceOrderStatus;
  /** The provider's own event timestamp for the event being applied — becomes the new cursor. */
  providerEventAt: string;
  updatedAt: string;
}

export interface CommerceWebhookEventRepoPort {
  /**
   * Applies one inbound provider webhook event to `orderId`, atomically guarding BOTH replay
   * (the event row's `UNIQUE(provider, eventId)` insert) and out-of-order delivery (a single
   * `UPDATE ... WHERE providerEventAt < ?` inside the SAME transaction as the insert — never a
   * prior `SELECT` deciding whether to write, which would reopen the race the unique index
   * exists to close). See `db/schema.ts`'s `commerceWebhookEvents` doc.
   *
   * `event.status` is caller-supplied only as `"received"` — the repo owns the terminal
   * `"applied"`/`"ignored"` transition once the projection outcome is known.
   *
   * @returns `"duplicate"` if `(event.provider, event.eventId)` was already seen (nothing
   *   applied, the earlier outcome stands); `"stale"` if this is a genuinely new event but
   *   chronologically older than what is already applied to the order (the inbox row is recorded
   *   as `"ignored"`, the order is untouched); `"applied"` otherwise.
   */
  applyProviderEvent(required: {
    event: Omit<CommerceWebhookEventRecord, "status" | "processedAt"> & { status: "received" };
    orderId: string;
    projection: ApplyProviderEventProjection;
    /** When the inbox row's terminal `"applied"`/`"ignored"` status is recorded — repo stays
     * clock-agnostic; the caller (which already holds a `ClockPort`) supplies it explicitly. */
    processedAt: string;
  }): Promise<ApplyProviderEventResult>;
}
