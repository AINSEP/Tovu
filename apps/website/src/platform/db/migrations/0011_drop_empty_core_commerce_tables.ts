/**
 * @file Retire the six unwired core commerce tables (owner, 2026-10-11; ADR-066).
 * The store plugin owns live commerce. The parked Jini commerce library and all plugin tables stay.
 * Frozen baselines still create these tables, so fresh installs and upgrades need this forward step.
 * Any populated target refuses the entire step before a DROP. The runner supplies the transaction;
 * SQLite holds BEGIN IMMEDIATE, and Postgres/PGlite locks all existing targets before counting.
 *
 * Historical schema rationale follows, preserved from the removed definitions.
 */

// ---------------------------------------------------------------------------
// Commerce (2026-08-12 swarm-consensus debate, section 5 — "Commerce and the tri-dialect data
// model"). First vertical slice only: catalog (products/prices), orders/order_items, and the
// webhook inbox that makes provider event ingestion idempotent AND ordered. Refunds, proration,
// carts, and multi-provider reconciliation are explicitly next-slice work — see each table's doc.
//
// Column-vs-document rule applied throughout (converged unanimously across the debate): if a
// query, index, constraint, join, or sort ever touches a field, it is a column; if it is read
// back whole by id and only ever rendered, it is JSON, never indexed. The only JSON column in
// this slice is `commerceWebhookEvents.payloadJson` — a provider-owned payload Tovu never
// queries into. Every other field the debate looked at (currency, amounts, status, timestamps,
// the ordering cursor) is a real column, per that rule.
//
// SQLite JSON storage stays `text("*_json")`, matching every other JSON column in this file
// (see this file's own module doc: "portable to Postgres `jsonb` later"). This is a TOOLING
// decision, not a durability or contract one — persisting SQLite's binary JSONB is safe
// (sqlite.org/jsonb.html commits to backward compatibility across versions) and its JSON
// functions (`json()`, `json_extract()`, `jsonb_extract()`, `json_type()`) work directly against
// a `jsonb()`-written BLOB. The actual blocker is that `jsonb()` is NOT a `drizzle-orm/
// sqlite-core` column builder (verified against the installed package: `integer`, `real`,
// `text`, `blob`, `numeric` is the complete list) and Drizzle's `customType.fromDriver` cannot
// rewrite a SELECT to wrap the column in `json(...)`, so binary storage would mean hand-written
// `sql` fragments at every call site. What would change this: a Drizzle `jsonb` column builder,
// or a codegen layer that rewrites SELECTs. The unwired JSONB codec this decision was grounded in
// (`sqlite/jsonb-column.ts`) was deleted in the storage-kernel move; it is in git history.
// ---------------------------------------------------------------------------

/**
 * Commerce products — the sellable thing. Deliberately NOT folded into `memberTiers` above:
 * that table carries `welcomePagePath`/`visibleInPortal` (portal-presentation fields, meaningless
 * for a one-time digital good) and locks pricing to exactly two recurring slots
 * (`monthlyPriceCents`/`yearlyPriceCents`, no one-time representation at all). `grantsMemberTierId`
 * is the one bridge column: set only when purchasing this product is how a member obtains a tier.
 * Commerce owns financial truth; `memberSubscriptions` stays the access-entitlement projection —
 * this slice does not yet derive one from an order (see the commerce feature's own README/report
 * for what remains).
 */

/** Open string, not a DB enum — matches this file's existing convention (e.g. `posts.status`). */

// 'one_time' | 'membership' | 'digital' ...
// 'active' | 'archived'

/**
     * Set only when this product's purchase grants a `memberTiers` row. The composite FK below
     * targets `(memberTiers.workspaceId, memberTiers.id)`, not just `.id` — a plain single-column
     * FK to `memberTiers.id` would accept a tier id that belongs to a DIFFERENT workspace, which
     * is exactly the cross-tenant mistake C2 (every table workspace-scoped) exists to prevent.
     * NULL is exempt from FK enforcement by SQL's ordinary MATCH SIMPLE semantics, so a product
     * with no tier bridge needs no special-casing here.
     */

/**
     * Migration 0038 — variable-key, per-product display attributes (theme example: "Material" ->
     * "Thick premium weight combed cotton", "Care" -> "...", "Warranty" -> "..."; different
     * products use different keys). Column-vs-document call, made explicitly rather than by
     * silently stretching this file's "provider-owned payload" JSON scope: this data is
     * author-owned, not provider-owned, so that framing doesn't literally apply — but the
     * decisive property under the underlying rule still holds. Nothing today queries, filters, or
     * sorts on a spec label, so it is a document.
     *
     * PROMOTION TRIGGER, recorded so it isn't re-litigated from scratch later: the day someone
     * wants "filter by material: cotton", this is NOT an index-the-JSON-path fix — SQLite and
     * MySQL only index a NAMED EXTRACTED SCALAR, not an arbitrary JSON path per row, so there is
     * no way to index "whichever key happens to be present." It needs
     * `product_attribute_definitions` (a controlled label vocabulary) + `product_attribute_values`
     * (typed value, FK to definition) — a migration, not a follow-up index.
     */

/**
 * Migration 0038 — ordered product image gallery. Deliberately a thin join over the EXISTING
 * `media`/`assetBlobs` system (content-addressed storage, alt/title/caption already modeled
 * there) rather than a parallel media table — this table carries only the product<->media
 * relationship and its display position, nothing about the image asset itself.
 */

/** Gallery display order, ascending. Ties broken by `id` (insertion order) at read time. */

/**
 * Commerce prices — one or more price points per product. Rows are never mutated once referenced
 * by an order: `commerceOrderItems` snapshots `unitAmountCents`/`currency`/`description` at
 * purchase time instead of joining live (Stripe's own Invoice Line Item object does the same —
 * verified against `docs.stripe.com/api/invoice-line-item/object` during the 2026-08-12 debate),
 * so a later price change never rewrites history. `status: 'archived'` retires a price without
 * deleting it; `onDelete: "restrict"` on `commerceOrderItems.priceId` enforces that a referenced
 * price can never be hard-deleted out from under a historical order.
 */

/**
     * Migration 0038 — the struck-through "was" price shown next to `unitAmountCents`'s "now"
     * price (a static list-price display, not a time-boxed promotion or coupon — those are a
     * separate, genuinely temporal/conditional concern this column deliberately does not model).
     * A column, not a document: it is the same class of fact as `unitAmountCents` itself (a
     * typed, filterable/sortable money figure), and money is never JSON under this file's own
     * convention. NULL means "not on sale." The CHECK below prevents a data-entry error from
     * displaying a fake discount (a compare-at price that isn't actually higher than the real one).
     */

/** Lowercase ISO-4217, matching Stripe's own convention — enforced by the CHECK below. */

/** NULL = one-time. 'month' | 'year' = recurring, mirroring `memberTiers`' monthly/yearly split. */

// 'active' | 'archived'

/**
 * Orders — the financial-truth header row for one checkout. `providerEventAt` is the ordering
 * cursor: the provider's own event timestamp for the last webhook event actually applied to this
 * row, compared — never blindly overwritten — on every subsequent delivery by
 * `features/commerce/webhook-inbox.ts`'s single atomic `UPDATE ... WHERE`. `totalAmountCents` is
 * denormalized from `commerceOrderItems` (computed once at checkout, not DB-enforced — SQLite
 * CHECK cannot aggregate across rows): the column-vs-document rule makes it a column anyway
 * because it is reported/sorted on, the same reasoning this file already applies denormalizing
 * `workspaceId` into `outboxEvents` above.
 */

// 'pending' | 'paid' | 'failed' | 'canceled'

/** Ordering cursor — see table header. NULL until the first webhook event is applied. */

/**
 * Order line items — one row per priced item, snapshotted (see `commercePrices`' header).
 * `productId` is denormalized off `priceId` for reporting without a join, same pattern as
 * `outboxEvents.workspaceId` above. `orderId` cascades with its parent order; `priceId`/
 * `productId` are `onDelete: "restrict"` so a historical line item can never be orphaned by
 * deleting the catalog row it snapshot from.
 */

/**
 * Webhook inbox — idempotency AND the audit trail for provider events (2026-08-12 debate: "these
 * are different problems"). `payloadJson` stores the full, opaque provider payload whole,
 * unindexed — the one legitimate JSON-document field in this slice (see file-level note above);
 * every field a query/constraint touches (`workspaceId`, `provider`, `eventId`, `status`,
 * `receivedAt`) is a real column instead.
 *
 * `UNIQUE(provider, eventId)` — deliberately NOT scoped by `workspaceId` — is the replay guard: a
 * provider's `eventId` is already globally unique per provider, and narrowing the constraint by
 * workspace would let the same event double-process if a provider ever misrouted it across
 * workspaces. That constraint stops replay; it does NOT stop out-of-order delivery by itself —
 * `features/commerce/webhook-inbox.ts`'s single atomic `UPDATE ... WHERE providerEventAt < ?`
 * against `commerceOrders` is the ordering half.
 */

/** The provider's own event timestamp (e.g. Stripe's `event.created`), NOT `receivedAt`. */

// 'received' | 'applied' | 'ignored' | 'failed'

import { sql } from "kysely";

import { tableExists } from "../kernel/dialect.js";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

export const DROP_EMPTY_CORE_COMMERCE_TABLES_ID = "0011_drop_empty_core_commerce_tables";

/** Children first, without CASCADE; also used by the fresh-only synchronous SQLite constructor. */
export const CORE_COMMERCE_TABLES_IN_DROP_ORDER = [
  "commerce_order_items",
  "commerce_product_images",
  "commerce_webhook_events",
  "commerce_orders",
  "commerce_prices",
  "commerce_products",
] as const;

/** Drop only when every existing target is empty; invalid/missing counts fail closed.
 * @throws If any target has rows, a count is invalid, or database DDL fails (runner rolls back).
 * @complexity Six existence queries, at most one PG lock, six COUNT scans and six DROP statements;
 * counting costs O(total target rows), with O(1) space for the fixed six-table inventory.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  const existing: string[] = [];
  for (const table of CORE_COMMERCE_TABLES_IN_DROP_ORDER) {
    if (await tableExists(kernel, table)) existing.push(table);
  }
  if (kernel.dialect === "postgres" && existing.length > 0) {
    // Advisory migration locks do not exclude ordinary writers between COUNT and DROP.
    await kernel.execute(sql`LOCK TABLE ${sql.join(existing.map(table => sql.table(table)))} IN ACCESS EXCLUSIVE MODE`);
  }

  const populated: string[] = [];
  for (const table of existing) {
    const rows = await kernel.query<{ n: number | string }>(sql`SELECT count(*) AS n FROM ${sql.table(table)}`);
    const value = rows[0]?.n;
    const count = Number(value);
    if (rows.length !== 1 ||
        !((typeof value === "number") || (typeof value === "string" && /^\d+$/.test(value))) ||
        !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`${DROP_EMPTY_CORE_COMMERCE_TABLES_ID}: invalid row count for ${table}; nothing dropped`);
    }
    if (count > 0) populated.push(`${table}: ${count}`);
  }
  if (populated.length > 0) {
    throw new Error(`${DROP_EMPTY_CORE_COMMERCE_TABLES_ID}: populated tables (${populated.join(", ")}); nothing dropped`);
  }
  for (const table of existing) {
    await kernel.execute(sql`DROP TABLE ${sql.table(table)}`);
  }
}

/** Build the host-owned retirement step with its immutable source checksum.
 * @example dropEmptyCoreCommerceTables({ checksum: MIGRATION_CHECKSUMS[DROP_EMPTY_CORE_COMMERCE_TABLES_ID]! })
 */
export const dropEmptyCoreCommerceTables = (
  required: { checksum: string },
  _optional: Record<string, never> = {}
): MigrationStep => ({ id: DROP_EMPTY_CORE_COMMERCE_TABLES_ID, checksum: required.checksum, up });
