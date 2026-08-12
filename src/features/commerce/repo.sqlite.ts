import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

import {
  commerceOrderItems,
  commerceOrders,
  commercePrices,
  commerceProductImages,
  commerceProducts,
  commerceWebhookEvents,
} from "../../db/schema";
import type { ContentDb } from "../../db/sqlite/content-db";
import { findOneBy } from "../../db/sqlite/repo-helpers";
import type {
  ApplyProviderEventResult,
  CommerceOrderRepoPort,
  CommercePriceRepoPort,
  CommerceProductImageRepoPort,
  CommerceProductRepoPort,
  CommerceWebhookEventRepoPort,
} from "./ports";
import type {
  CommerceBillingInterval,
  CommerceOrderItemRecord,
  CommerceOrderRecord,
  CommerceOrderStatus,
  CommercePriceRecord,
  CommercePriceStatus,
  CommerceProductImageRecord,
  CommerceProductKind,
  CommerceProductRecord,
  CommerceProductSpec,
  CommerceProductStatus,
} from "./types";

/**
 * @file Drizzle/SQLite adapter for the Commerce first vertical slice (2026-08-12 swarm-consensus
 * debate, section 5). Mirrors `src/members/repo.sqlite.ts`'s exact shape: typed row -> domain-
 * record mapping, `findOneBy` for workspace-scoped single-row lookups, and — for
 * `applyProviderEvent` — the same synchronous `db.transaction((tx) => ...)` pattern
 * `src/db/sqlite/outbox-repo.sqlite.ts`'s `claimPending` uses (better-sqlite3 has no real async
 * I/O, so a synchronous callback is both required by Drizzle and safe: no other statement can
 * interleave on this connection between two `.run()`/`.all()` calls inside it).
 *
 * NOT wired into `server/app.ts`'s boot path this pass, matching `SqliteMemberRepo`'s own
 * precedent — no feature in this codebase has flipped that switch yet for a brand-new adapter.
 */

function toCommerceProductRecord(row: typeof commerceProducts.$inferSelect): CommerceProductRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    kind: row.kind as CommerceProductKind,
    status: row.status as CommerceProductStatus,
    description: row.description ?? undefined,
    grantsMemberTierId: row.grantsMemberTierId ?? undefined,
    specs: row.specsJson == null ? undefined : (JSON.parse(row.specsJson) as CommerceProductSpec[]),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class SqliteCommerceProductRepo implements CommerceProductRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CommerceProductRecord | null> {
    return findOneBy(
      this.db,
      commerceProducts,
      [eq(commerceProducts.workspaceId, required.workspaceId), eq(commerceProducts.id, required.id)],
      toCommerceProductRecord
    );
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<CommerceProductRecord | null> {
    return findOneBy(
      this.db,
      commerceProducts,
      [eq(commerceProducts.workspaceId, required.workspaceId), eq(commerceProducts.slug, required.slug)],
      toCommerceProductRecord
    );
  }

  /**
   * Powers the public storefront grid — `status: "active"` only, so an archived product never
   * appears to a visitor even though the row still exists for historical orders to reference.
   *
   * @complexity Time: O(min(limit, 100)) rows scanned via `idx_...` — no covering index exists
   * for `(workspaceId, status, name)` yet; adequate for this slice's catalog sizes, flagged rather
   * than silently assumed to scale.
   */
  async listActive(required: { workspaceId: string; limit?: number }): Promise<CommerceProductRecord[]> {
    const limit = Math.min(required.limit ?? 100, 100);
    const rows = this.db
      .select()
      .from(commerceProducts)
      .where(and(eq(commerceProducts.workspaceId, required.workspaceId), eq(commerceProducts.status, "active")))
      .orderBy(asc(commerceProducts.name))
      .limit(limit)
      .all();
    return rows.map(toCommerceProductRecord);
  }

  async save(record: CommerceProductRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      name: record.name,
      slug: record.slug,
      kind: record.kind,
      status: record.status,
      description: record.description ?? null,
      grantsMemberTierId: record.grantsMemberTierId ?? null,
      specsJson: record.specs == null ? null : JSON.stringify(record.specs),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
    };
    this.db.insert(commerceProducts).values(row).onConflictDoUpdate({ target: commerceProducts.id, set: row }).run();
  }
}

function toCommerceProductImageRecord(row: typeof commerceProductImages.$inferSelect): CommerceProductImageRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    productId: row.productId,
    mediaId: row.mediaId,
    position: row.position,
    createdAt: row.createdAt,
  };
}

export class SqliteCommerceProductImageRepo implements CommerceProductImageRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByProduct(required: { workspaceId: string; productId: string }): Promise<CommerceProductImageRecord[]> {
    const rows = this.db
      .select()
      .from(commerceProductImages)
      .where(
        and(
          eq(commerceProductImages.workspaceId, required.workspaceId),
          eq(commerceProductImages.productId, required.productId)
        )
      )
      .all()
      .sort((a, b) => (a.position !== b.position ? a.position - b.position : a.id < b.id ? -1 : 1));
    return rows.map(toCommerceProductImageRecord);
  }

  async save(record: CommerceProductImageRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      productId: record.productId,
      mediaId: record.mediaId,
      position: record.position,
      createdAt: record.createdAt,
    };
    this.db
      .insert(commerceProductImages)
      .values(row)
      .onConflictDoUpdate({ target: commerceProductImages.id, set: row })
      .run();
  }
}

function toCommercePriceRecord(row: typeof commercePrices.$inferSelect): CommercePriceRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    productId: row.productId,
    unitAmountCents: row.unitAmountCents,
    compareAtAmountCents: row.compareAtAmountCents ?? undefined,
    currency: row.currency,
    billingInterval: (row.billingInterval as CommerceBillingInterval | null) ?? undefined,
    status: row.status as CommercePriceStatus,
    createdAt: row.createdAt,
    version: row.version,
  };
}

export class SqliteCommercePriceRepo implements CommercePriceRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CommercePriceRecord | null> {
    return findOneBy(
      this.db,
      commercePrices,
      [eq(commercePrices.workspaceId, required.workspaceId), eq(commercePrices.id, required.id)],
      toCommercePriceRecord
    );
  }

  async listByProduct(required: { workspaceId: string; productId: string }): Promise<CommercePriceRecord[]> {
    const rows = this.db
      .select()
      .from(commercePrices)
      .where(
        and(eq(commercePrices.workspaceId, required.workspaceId), eq(commercePrices.productId, required.productId))
      )
      .all();
    return rows.map(toCommercePriceRecord);
  }

  async save(record: CommercePriceRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      productId: record.productId,
      unitAmountCents: record.unitAmountCents,
      compareAtAmountCents: record.compareAtAmountCents ?? null,
      currency: record.currency,
      billingInterval: record.billingInterval ?? null,
      status: record.status,
      createdAt: record.createdAt,
      version: record.version,
    };
    this.db.insert(commercePrices).values(row).onConflictDoUpdate({ target: commercePrices.id, set: row }).run();
  }
}

function toCommerceOrderRecord(row: typeof commerceOrders.$inferSelect): CommerceOrderRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    status: row.status as CommerceOrderStatus,
    currency: row.currency,
    totalAmountCents: row.totalAmountCents,
    provider: row.provider,
    providerCustomerRef: row.providerCustomerRef ?? undefined,
    providerPaymentRef: row.providerPaymentRef ?? undefined,
    providerEventAt: row.providerEventAt ?? undefined,
    placedAt: row.placedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toCommerceOrderItemRecord(row: typeof commerceOrderItems.$inferSelect): CommerceOrderItemRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    orderId: row.orderId,
    priceId: row.priceId,
    productId: row.productId,
    description: row.description,
    unitAmountCents: row.unitAmountCents,
    quantity: row.quantity,
    currency: row.currency,
    createdAt: row.createdAt,
  };
}

export class SqliteCommerceOrderRepo implements CommerceOrderRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CommerceOrderRecord | null> {
    return findOneBy(
      this.db,
      commerceOrders,
      [eq(commerceOrders.workspaceId, required.workspaceId), eq(commerceOrders.id, required.id)],
      toCommerceOrderRecord
    );
  }

  async listItems(required: { workspaceId: string; orderId: string }): Promise<CommerceOrderItemRecord[]> {
    const rows = this.db
      .select()
      .from(commerceOrderItems)
      .where(
        and(eq(commerceOrderItems.workspaceId, required.workspaceId), eq(commerceOrderItems.orderId, required.orderId))
      )
      .all();
    return rows.map(toCommerceOrderItemRecord);
  }

  /** Header + line items in one synchronous transaction — see file header. */
  async placeOrder(required: {
    order: CommerceOrderRecord;
    items: readonly CommerceOrderItemRecord[];
  }): Promise<void> {
    const { order, items } = required;
    this.db.transaction((tx) => {
      tx.insert(commerceOrders)
        .values({
          id: order.id,
          workspaceId: order.workspaceId,
          memberId: order.memberId,
          status: order.status,
          currency: order.currency,
          totalAmountCents: order.totalAmountCents,
          provider: order.provider,
          providerCustomerRef: order.providerCustomerRef ?? null,
          providerPaymentRef: order.providerPaymentRef ?? null,
          providerEventAt: order.providerEventAt ?? null,
          placedAt: order.placedAt,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          version: order.version,
        })
        .run();

      if (items.length > 0) {
        tx.insert(commerceOrderItems)
          .values(
            items.map((item) => ({
              id: item.id,
              workspaceId: item.workspaceId,
              orderId: item.orderId,
              priceId: item.priceId,
              productId: item.productId,
              description: item.description,
              unitAmountCents: item.unitAmountCents,
              quantity: item.quantity,
              currency: item.currency,
              createdAt: item.createdAt,
            }))
          )
          .run();
      }
    });
  }
}

export class SqliteCommerceWebhookEventRepo implements CommerceWebhookEventRepoPort {
  constructor(private readonly db: ContentDb) {}

  /**
   * See `ports.ts`'s doc for the returned outcomes. `db.transaction` here must stay a
   * *synchronous* callback (see file header) — every statement below is a direct `.run()`/`.all()`
   * call, never `await`ed.
   */
  async applyProviderEvent(required: {
    event: {
      id: string;
      workspaceId: string;
      provider: string;
      eventId: string;
      eventType: string;
      eventOccurredAt: string;
      payload: string;
      status: "received";
      receivedAt: string;
    };
    orderId: string;
    projection: { status: CommerceOrderStatus; providerEventAt: string; updatedAt: string };
    processedAt: string;
  }): Promise<ApplyProviderEventResult> {
    const { event, orderId, projection, processedAt } = required;

    return this.db.transaction((tx): ApplyProviderEventResult => {
      // Statement 1 — idempotency guard. A conflict on UNIQUE(provider, eventId) means this
      // exact event was already recorded; nothing is applied a second time.
      const inserted = tx
        .insert(commerceWebhookEvents)
        .values({
          id: event.id,
          workspaceId: event.workspaceId,
          provider: event.provider,
          eventId: event.eventId,
          eventType: event.eventType,
          eventOccurredAt: event.eventOccurredAt,
          payloadJson: event.payload,
          status: "received",
          receivedAt: event.receivedAt,
        })
        .onConflictDoNothing({ target: [commerceWebhookEvents.provider, commerceWebhookEvents.eventId] })
        .returning({ id: commerceWebhookEvents.id })
        .all();

      if (inserted.length === 0) {
        return "duplicate";
      }
      const inboxId = inserted[0].id;

      // Statement 2 — ordering guard, one atomic UPDATE. The WHERE comparison (not a prior
      // SELECT) is what makes "is this event newer than what's applied" and "apply it" a single
      // indivisible operation — see db/schema.ts's commerceWebhookEvents doc.
      const applied = tx
        .update(commerceOrders)
        .set({
          status: projection.status,
          providerEventAt: projection.providerEventAt,
          updatedAt: projection.updatedAt,
          version: sql`${commerceOrders.version} + 1`,
        })
        .where(
          and(
            eq(commerceOrders.id, orderId),
            eq(commerceOrders.workspaceId, event.workspaceId),
            or(isNull(commerceOrders.providerEventAt), lt(commerceOrders.providerEventAt, projection.providerEventAt))
          )
        )
        .returning({ id: commerceOrders.id })
        .all();

      const outcome: ApplyProviderEventResult = applied.length === 0 ? "stale" : "applied";
      tx.update(commerceWebhookEvents)
        .set({ status: outcome === "stale" ? "ignored" : "applied", processedAt })
        .where(eq(commerceWebhookEvents.id, inboxId))
        .run();
      return outcome;
    });
  }
}
