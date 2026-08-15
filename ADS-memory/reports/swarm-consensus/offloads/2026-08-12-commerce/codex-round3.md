I’m using the diff-analysis skill because this round is an implementation critique. I’ll first read its instructions and the entire packet, then inspect the supplied source and verify the final recommendation against primary external sources.
The optional diff knowledge graph is not present in this packet workspace, so I’m continuing with a direct source-level review of the four submitted implementations. That keeps the analysis scoped to the artifacts the packet identifies.
The packet changes the key conclusion: SQLite’s JSONB is explicitly an internal engine format, so the first slice should retain portable JSON text at opaque boundaries and keep every commerce invariant relational. I’m now checking the repository’s exact naming, timestamp, foreign-key, and transaction conventions before writing compile-shaped Drizzle definitions and DDL.
One Round 2 claim is already unsafe: an event timestamp does not “fully solve” ordering unless the provider documents it as a strict per-object sequence. I’m verifying Stripe’s present webhook contract and its money/refund/proration models now, then I’ll align the generic guard with what the provider can actually guarantee.
ACK_PACKET_RECEIVED CTX-COMMERCE-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

The SQLite durability finding reverses my Round 2 storage recommendation. Tovu should retain JSON as `TEXT`, including new opaque commerce payloads. SQLite JSONB is an engine-internal format, so migrating the 37 existing JSON-text columns—or persisting new commerce payloads as JSONB BLOBs—would couple durable site data to the SQLite version bundled by `better-sqlite3`. The existing convention already uses portable JSON text (`files/tovu/schema.ts:12-13`, `files/tovu/schema.ts:49`, `files/tovu/schema.ts:1080`).

The first slice should be:

- A separate `commerce_products` and immutable-price domain.
- An optional workspace-safe FK from a product to `member_tiers` as its entitlement target.
- Single-price orders, deliberately excluding carts, refunds, and proration writes.
- A durable provider-event inbox with exact `UNIQUE(provider, event_id)`.
- A separate strict ordering cursor on orders, updated through one conditional `UPDATE`; local `version` remains optimistic concurrency.

This fits the real boundary: `member_tiers` contains membership presentation fields and only monthly/yearly price slots (`files/tovu/schema.ts:485-504`), while `member_subscriptions.version` has no provider-ordering semantics (`files/tovu/schema.ts:507-524`). PostgreSQL is not yet a live adapter (`files/tovu/db-postgres-ops.ts:4-11`), so equivalence must be demonstrated by engine contract tests, not inferred from that adapter.

Refunds and prorations are intentionally not squeezed into the first order row. Stripe models partial refunds as separate Refund objects and prorations as signed invoice items; Shopify likewise exposes refunds and payment transactions as separate records. The next slice should therefore add append-only `commerce_refunds` and signed order/invoice lines rather than decrementing an order total.

## Sources

- **Loud contradiction:** SQLite documents JSONB as an internal representation that applications must not use outside SQLite. This contradicts Primary, Codex Round 2, and both Gemini answers recommending persisted SQLite JSONB BLOBs: [SQLite JSON functions and JSONB](https://www.sqlite.org/json1.html).
- SQLite’s affinity rules confirm why a declared `JSONB` column becomes NUMERIC affinity and can coerce numeric-looking text: [SQLite datatypes](https://www.sqlite.org/datatype3.html).
- Stripe recommends recording event IDs for duplicate suppression, explicitly says webhook delivery order is not guaranteed, and recommends retrieving current API objects when necessary: [Stripe webhook guidance](https://docs.stripe.com/webhooks).
- Stripe exposes `created` only as a seconds-resolution timestamp, not as a documented per-object revision. Therefore it must not be treated as the strict ordering cursor: [Stripe Event object](https://docs.stripe.com/api/events/object).
- Stripe Prices associate products with integer amounts and three-letter currencies, and distinguish one-time from recurring prices: [Stripe Price object](https://docs.stripe.com/api/prices/object).
- Stripe represents refunds as separate objects, supports multiple partial refunds, and limits their sum to the unrefunded charge amount: [Stripe Refund object](https://docs.stripe.com/api/refunds/object).
- Stripe represents prorations as signed invoice items; importantly, a negative proration is not automatically a refund: [Stripe proration guidance](https://docs.stripe.com/billing/subscriptions/prorations).
- Shopify independently models refunds and payment/refund transactions as separate order-associated facts, and warns not to parse gateway receipt JSON for business logic: [Shopify Refund](https://shopify.dev/docs/api/admin-graphql/latest/objects/Refund), [Shopify OrderTransaction](https://shopify.dev/docs/api/admin-graphql/latest/objects/OrderTransaction).
- SQLite requires a composite parent key to be primary or unique, supporting the `(workspace_id, id)` entitlement FK used below: [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).
- PostgreSQL supports the chosen composite foreign keys and automatically indexes primary/unique constraints: [PostgreSQL `CREATE TABLE`](https://www.postgresql.org/docs/current/sql-createtable.html).
- **DDL difference:** MySQL cannot use `TEXT` columns in foreign keys because their indexes require prefix lengths. MySQL therefore needs bounded `VARCHAR` for logical text IDs, plus InnoDB and matching collations: [MySQL foreign-key constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html), [MySQL index prefixes](https://dev.mysql.com/doc/refman/8.4/en/create-index.html).

## Solution Slate

Ranking criteria, in order: financial and ordering correctness (35%), demonstrated tri-dialect behavior (30%), fit with the current Tovu schema (20%), and first-slice implementation cost (15%).

1. **Separate commerce catalog with a tier-entitlement FK, relational invariants, JSON text, and guarded projections.**

   Benefits: prices can be versioned independently; orders snapshot charged amounts; non-membership products remain possible; workspace boundaries are enforced by composite FKs; idempotency and ordering have distinct mechanisms.

   Sacrifice: this creates a new catalog/admin boundary and requires existing `member_tiers.monthly_price_cents`, `yearly_price_cents`, and `currency` to become compatibility projections or be deprecated. The first slice also supports one price per order and deliberately cannot issue refunds, carts, or prorations.

2. **Extend `member_tiers` and add only orders plus the provider-event inbox.**

   Benefits: fewer tables, no entitlement bridge, and minimal disruption for existing membership-only screens.

   Sacrifice: every purchasable product becomes a membership tier; arbitrary price history and multiple currencies/intervals do not fit the existing two-slot price shape at `files/tovu/schema.ts:497-499`. A later generic catalog would require a more expensive split and backfill.

Recommendation: option 1. The cheapest falsifying implementation test is the real-engine contract below: if any engine accepts a cross-workspace tier FK, accepts a duplicate provider event, or lets sequence 10 overwrite sequence 20, the option is not portable enough to ship. At the product level, option 2 wins if the accepted roadmap proves every purchasable item will permanently be one membership tier with only the existing monthly/yearly pricing shape.

## Leading Option — Code

### SQLite Drizzle definitions

This is an additive patch to `files/tovu/schema.ts`. It adds `foreignKey` to the existing import and adds a composite unique key to `memberTiers`.

```ts
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Existing memberTiers callback gains the second index:
(table) => [
  uniqueIndex("member_tiers_workspace_slug_unique").on(table.workspaceId, table.slug),
  uniqueIndex("member_tiers_workspace_id_unique").on(table.workspaceId, table.id),
];

export const commerceProducts = sqliteTable(
  "commerce_products",
  {
    id: text("id").notNull().primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    entitlementTierId: text("entitlement_tier_id"),
    // Opaque, whole-value application data. Never indexed or queried by path.
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("commerce_products_workspace_id_unique").on(table.workspaceId, table.id),
    index("idx_commerce_products_workspace_status").on(table.workspaceId, table.status),
    foreignKey({
      name: "commerce_products_entitlement_tier_fk",
      columns: [table.workspaceId, table.entitlementTierId],
      foreignColumns: [memberTiers.workspaceId, memberTiers.id],
    }).onDelete("restrict"),
    check("commerce_products_status_check", sql`${table.status} IN ('active', 'archived')`),
  ]
);

export const commercePrices = sqliteTable(
  "commerce_prices",
  {
    id: text("id").notNull().primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    productId: text("product_id").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    billingType: text("billing_type", { enum: ["one_time", "recurring"] }).notNull(),
    billingInterval: text("billing_interval", {
      enum: ["day", "week", "month", "year"],
    }),
    billingIntervalCount: integer("billing_interval_count"),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    currency: text("currency").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("commerce_prices_workspace_id_unique").on(table.workspaceId, table.id),
    index("idx_commerce_prices_workspace_product").on(table.workspaceId, table.productId),
    foreignKey({
      name: "commerce_prices_product_fk",
      columns: [table.workspaceId, table.productId],
      foreignColumns: [commerceProducts.workspaceId, commerceProducts.id],
    }).onDelete("restrict"),
    check("commerce_prices_amount_check", sql`${table.unitAmountCents} >= 0`),
    check(
      "commerce_prices_currency_check",
      sql`length(${table.currency}) = 3 AND ${table.currency} = lower(${table.currency})`
    ),
    check(
      "commerce_prices_billing_shape_check",
      sql`(
        ${table.billingType} = 'one_time'
        AND ${table.billingInterval} IS NULL
        AND ${table.billingIntervalCount} IS NULL
      ) OR (
        ${table.billingType} = 'recurring'
        AND ${table.billingInterval} IS NOT NULL
        AND ${table.billingIntervalCount} > 0
      )`
    ),
  ]
);

export const commerceOrders = sqliteTable(
  "commerce_orders",
  {
    id: text("id").notNull().primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    priceId: text("price_id").notNull(),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id"),
    status: text("status", {
      enum: ["pending", "paid", "failed", "canceled"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull(),

    // Strict provider revision or serialized-authoritative-read revision.
    // This is not Stripe Event.created and is independent of local version.
    sourceSequence: integer("source_sequence").notNull().default(0),

    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("commerce_orders_workspace_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("commerce_orders_provider_order_unique").on(
      table.workspaceId,
      table.provider,
      table.providerOrderId
    ),
    index("idx_commerce_orders_workspace_status").on(table.workspaceId, table.status),
    foreignKey({
      name: "commerce_orders_price_fk",
      columns: [table.workspaceId, table.priceId],
      foreignColumns: [commercePrices.workspaceId, commercePrices.id],
    }).onDelete("restrict"),
    check(
      "commerce_orders_money_check",
      sql`${table.quantity} > 0
        AND ${table.unitAmountCents} >= 0
        AND ${table.subtotalCents} = ${table.unitAmountCents} * ${table.quantity}
        AND ${table.discountCents} >= 0
        AND ${table.discountCents} <= ${table.subtotalCents}
        AND ${table.taxCents} >= 0
        AND ${table.totalCents}
          = ${table.subtotalCents} - ${table.discountCents} + ${table.taxCents}`
    ),
    check(
      "commerce_orders_currency_check",
      sql`length(${table.currency}) = 3 AND ${table.currency} = lower(${table.currency})`
    ),
    check("commerce_orders_source_sequence_check", sql`${table.sourceSequence} >= 0`),
  ]
);

export const commerceProviderEvents = sqliteTable(
  "commerce_provider_events",
  {
    id: text("id").notNull().primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    objectId: text("object_id"),
    // Verified raw JSON text; retained as text, never converted to SQLite JSONB.
    payloadJson: text("payload_json").notNull(),
    sourceCreatedAt: text("source_created_at"),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
    status: text("status", { enum: ["received", "processed", "failed"] }).notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("commerce_provider_events_provider_event_unique").on(
      table.provider,
      table.eventId
    ),
    index("idx_commerce_provider_events_workspace_status").on(
      table.workspaceId,
      table.status,
      table.receivedAt
    ),
    check(
      "commerce_provider_events_status_check",
      sql`${table.status} IN ('received', 'processed', 'failed')`
    ),
  ]
);
```

### SQLite and PostgreSQL migration SQL

The core DDL can be identical on these two engines. SQLite connections must additionally execute `PRAGMA foreign_keys = ON`.

```sql
CREATE UNIQUE INDEX member_tiers_workspace_id_unique
  ON member_tiers(workspace_id, id);

CREATE TABLE commerce_products (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  entitlement_tier_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT commerce_products_workspace_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT commerce_products_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT commerce_products_entitlement_tier_fk
    FOREIGN KEY (workspace_id, entitlement_tier_id)
    REFERENCES member_tiers(workspace_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_commerce_products_workspace_status
  ON commerce_products(workspace_id, status);

CREATE TABLE commerce_prices (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_type TEXT NOT NULL,
  billing_interval TEXT,
  billing_interval_count INTEGER,
  unit_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT commerce_prices_workspace_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT commerce_prices_amount_check CHECK (unit_amount_cents >= 0),
  CONSTRAINT commerce_prices_currency_check
    CHECK (length(currency) = 3 AND currency = lower(currency)),
  CONSTRAINT commerce_prices_billing_shape_check CHECK (
    (
      billing_type = 'one_time'
      AND billing_interval IS NULL
      AND billing_interval_count IS NULL
    ) OR (
      billing_type = 'recurring'
      AND billing_interval IN ('day', 'week', 'month', 'year')
      AND billing_interval_count > 0
    )
  ),
  CONSTRAINT commerce_prices_product_fk
    FOREIGN KEY (workspace_id, product_id)
    REFERENCES commerce_products(workspace_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_commerce_prices_workspace_product
  ON commerce_prices(workspace_id, product_id);

CREATE TABLE commerce_orders (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  status TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_amount_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  source_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT commerce_orders_workspace_id_unique UNIQUE (workspace_id, id),
  CONSTRAINT commerce_orders_provider_order_unique
    UNIQUE (workspace_id, provider, provider_order_id),
  CONSTRAINT commerce_orders_money_check CHECK (
    quantity > 0
    AND unit_amount_cents >= 0
    AND subtotal_cents = unit_amount_cents * quantity
    AND discount_cents >= 0
    AND discount_cents <= subtotal_cents
    AND tax_cents >= 0
    AND total_cents = subtotal_cents - discount_cents + tax_cents
  ),
  CONSTRAINT commerce_orders_currency_check
    CHECK (length(currency) = 3 AND currency = lower(currency)),
  CONSTRAINT commerce_orders_source_sequence_check CHECK (source_sequence >= 0),
  CONSTRAINT commerce_orders_price_fk
    FOREIGN KEY (workspace_id, price_id)
    REFERENCES commerce_prices(workspace_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_commerce_orders_workspace_status
  ON commerce_orders(workspace_id, status);

CREATE TABLE commerce_provider_events (
  id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  object_id TEXT,
  payload_json TEXT NOT NULL,
  source_created_at TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT commerce_provider_events_provider_event_unique
    UNIQUE (provider, event_id),
  CONSTRAINT commerce_provider_events_status_check
    CHECK (status IN ('received', 'processed', 'failed'))
);

CREATE INDEX idx_commerce_provider_events_workspace_status
  ON commerce_provider_events(workspace_id, status, received_at);
```

### MySQL 8.4/InnoDB migration SQL

The logical text keys become bounded `VARCHAR` because MySQL cannot use `TEXT` in these PKs and FKs.

```sql
ALTER TABLE member_tiers
  ADD UNIQUE KEY member_tiers_workspace_id_unique (workspace_id, id);

CREATE TABLE commerce_products (
  id VARCHAR(191) NOT NULL,
  workspace_id VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  entitlement_tier_id VARCHAR(191) NULL,
  metadata_json TEXT NULL,
  created_at VARCHAR(35) NOT NULL,
  updated_at VARCHAR(35) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY commerce_products_workspace_id_unique (workspace_id, id),
  KEY idx_commerce_products_workspace_status (workspace_id, status),
  CONSTRAINT commerce_products_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT commerce_products_entitlement_tier_fk
    FOREIGN KEY (workspace_id, entitlement_tier_id)
    REFERENCES member_tiers(workspace_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE commerce_prices (
  id VARCHAR(191) NOT NULL,
  workspace_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL,
  billing_type VARCHAR(16) NOT NULL,
  billing_interval VARCHAR(16) NULL,
  billing_interval_count INT NULL,
  unit_amount_cents INT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  created_at VARCHAR(35) NOT NULL,
  updated_at VARCHAR(35) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY commerce_prices_workspace_id_unique (workspace_id, id),
  KEY idx_commerce_prices_workspace_product (workspace_id, product_id),
  CONSTRAINT commerce_prices_amount_check CHECK (unit_amount_cents >= 0),
  CONSTRAINT commerce_prices_currency_check
    CHECK (CHAR_LENGTH(currency) = 3 AND currency = LOWER(currency)),
  CONSTRAINT commerce_prices_billing_shape_check CHECK (
    (
      billing_type = 'one_time'
      AND billing_interval IS NULL
      AND billing_interval_count IS NULL
    ) OR (
      billing_type = 'recurring'
      AND billing_interval IN ('day', 'week', 'month', 'year')
      AND billing_interval_count > 0
    )
  ),
  CONSTRAINT commerce_prices_product_fk
    FOREIGN KEY (workspace_id, product_id)
    REFERENCES commerce_products(workspace_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE commerce_orders (
  id VARCHAR(191) NOT NULL,
  workspace_id VARCHAR(191) NOT NULL,
  price_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_order_id VARCHAR(191) NULL,
  status VARCHAR(32) NOT NULL,
  quantity INT NOT NULL,
  unit_amount_cents INT NOT NULL,
  subtotal_cents INT NOT NULL,
  discount_cents INT NOT NULL DEFAULT 0,
  tax_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  source_sequence INT NOT NULL DEFAULT 0,
  created_at VARCHAR(35) NOT NULL,
  updated_at VARCHAR(35) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY commerce_orders_workspace_id_unique (workspace_id, id),
  UNIQUE KEY commerce_orders_provider_order_unique
    (workspace_id, provider, provider_order_id),
  KEY idx_commerce_orders_workspace_status (workspace_id, status),
  CONSTRAINT commerce_orders_money_check CHECK (
    quantity > 0
    AND unit_amount_cents >= 0
    AND subtotal_cents = unit_amount_cents * quantity
    AND discount_cents >= 0
    AND discount_cents <= subtotal_cents
    AND tax_cents >= 0
    AND total_cents = subtotal_cents - discount_cents + tax_cents
  ),
  CONSTRAINT commerce_orders_currency_check
    CHECK (CHAR_LENGTH(currency) = 3 AND currency = LOWER(currency)),
  CONSTRAINT commerce_orders_source_sequence_check CHECK (source_sequence >= 0),
  CONSTRAINT commerce_orders_price_fk
    FOREIGN KEY (workspace_id, price_id)
    REFERENCES commerce_prices(workspace_id, id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE commerce_provider_events (
  id VARCHAR(191) NOT NULL,
  workspace_id VARCHAR(191) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  event_id VARCHAR(191) NOT NULL,
  event_type VARCHAR(191) NOT NULL,
  object_id VARCHAR(191) NULL,
  payload_json TEXT NOT NULL,
  source_created_at VARCHAR(35) NULL,
  received_at VARCHAR(35) NOT NULL,
  processed_at VARCHAR(35) NULL,
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY commerce_provider_events_provider_event_unique (provider, event_id),
  KEY idx_commerce_provider_events_workspace_status
    (workspace_id, status, received_at),
  CONSTRAINT commerce_provider_events_status_check
    CHECK (status IN ('received', 'processed', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

### Ordering types, atomic statement, and changed call site

```ts
export type CommerceDialect = "sqlite" | "postgres" | "mysql";
export type OrderStatus = "pending" | "paid" | "failed" | "canceled";

declare const isoBrand: unique symbol;
declare const sourceSequenceBrand: unique symbol;

export type Iso8601 = string & { readonly [isoBrand]: true };
export type StrictSourceSequence = number & {
  readonly [sourceSequenceBrand]: true;
};

export function iso8601(value: string): Iso8601 {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new TypeError(`Invalid UTC ISO-8601 timestamp: ${value}`);
  }
  return value as Iso8601;
}

export function strictSourceSequence(value: number): StrictSourceSequence {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`Source sequence must be a positive safe integer: ${value}`);
  }
  return value as StrictSourceSequence;
}

export type OrderingEvidence =
  | {
      kind: "provider-monotonic-revision";
      value: StrictSourceSequence;
    }
  | {
      // Issued by a durable, per-provider-object serialized reconciler
      // after retrieving the provider's authoritative current object.
      kind: "serialized-authoritative-read";
      value: StrictSourceSequence;
    };

export interface OrderedOrderSnapshot {
  workspaceId: string;
  provider: string;
  providerOrderId: string;
  status: OrderStatus;
  updatedAt: Iso8601;
  ordering: OrderingEvidence;
}

export interface SqlStatementExecutor {
  execute(
    statement: string,
    parameters: readonly (string | number | null)[]
  ): Promise<{ rowsAffected: number }>;
}

const guardedUpdateSql: Record<CommerceDialect, string> = {
  sqlite: `
    UPDATE commerce_orders
       SET status = ?,
           source_sequence = ?,
           updated_at = ?,
           version = version + 1
     WHERE workspace_id = ?
       AND provider = ?
       AND provider_order_id = ?
       AND source_sequence < ?
  `,
  mysql: `
    UPDATE commerce_orders
       SET status = ?,
           source_sequence = ?,
           updated_at = ?,
           version = version + 1
     WHERE workspace_id = ?
       AND provider = ?
       AND provider_order_id = ?
       AND source_sequence < ?
  `,
  postgres: `
    UPDATE commerce_orders
       SET status = $1,
           source_sequence = $2,
           updated_at = $3,
           version = version + 1
     WHERE workspace_id = $4
       AND provider = $5
       AND provider_order_id = $6
       AND source_sequence < $7
  `,
};

export async function applyOrderSnapshotIfNewer(
  executor: SqlStatementExecutor,
  dialect: CommerceDialect,
  snapshot: OrderedOrderSnapshot
): Promise<boolean> {
  const sequence = snapshot.ordering.value;
  const result = await executor.execute(guardedUpdateSql[dialect], [
    snapshot.status,
    sequence,
    snapshot.updatedAt,
    snapshot.workspaceId,
    snapshot.provider,
    snapshot.providerOrderId,
    sequence,
  ]);

  return result.rowsAffected === 1;
}

export interface VerifiedProviderEvent {
  id: string;
  workspaceId: string;
  provider: string;
  eventId: string;
  eventType: string;
  objectId: string;
  rawPayload: string;
  sourceCreatedAt: Iso8601 | null;
  receivedAt: Iso8601;
}

export interface CommerceProjectionTx {
  insertProviderEventIfAbsent(event: VerifiedProviderEvent): Promise<boolean>;
  applyOrderSnapshotIfNewer(snapshot: OrderedOrderSnapshot): Promise<boolean>;
  markProviderEventProcessed(eventId: string, processedAt: Iso8601): Promise<void>;
}

export interface CommerceUnitOfWork {
  transaction<T>(work: (tx: CommerceProjectionTx) => Promise<T>): Promise<T>;
}

export interface ProviderProjectionPort {
  /*
   * Stripe implementations must retrieve the authoritative current object and
   * use serialized-authoritative-read. Event.created is not accepted as ordering
   * evidence because Stripe does not document it as a strict object revision.
   */
  loadOrderSnapshot(event: VerifiedProviderEvent): Promise<OrderedOrderSnapshot>;
}

export async function handleVerifiedCommerceEvent(
  deps: {
    provider: ProviderProjectionPort;
    unitOfWork: CommerceUnitOfWork;
    now: () => Iso8601;
  },
  event: VerifiedProviderEvent
): Promise<"duplicate" | "applied" | "stale"> {
  // Signature verification occurs before this call.
  const snapshot = await deps.provider.loadOrderSnapshot(event);

  return deps.unitOfWork.transaction(async (tx) => {
    // This INSERT is protected by UNIQUE(provider, event_id).
    const inserted = await tx.insertProviderEventIfAbsent(event);
    if (!inserted) return "duplicate";

    // Receipt, guarded projection, and processed marker commit atomically.
    const applied = await tx.applyOrderSnapshotIfNewer(snapshot);
    await tx.markProviderEventProcessed(event.id, deps.now());
    return applied ? "applied" : "stale";
  });
}
```

`source_created_at` remains audit data. It is never substituted for `source_sequence`. For providers without a documented monotonic revision, the provider adapter must perform an authoritative read through a durable per-object serialized reconciler.

### Real three-engine contract test

The test does not skip missing engines: CI must provide disposable PostgreSQL and MySQL databases. It runs the migration files above against bundled SQLite, PostgreSQL, and MySQL, then executes identical invariants.

```ts
import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import { Pool as PgPool } from "pg";
import {
  createPool as createMysqlPool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyOrderSnapshotIfNewer,
  iso8601,
  strictSourceSequence,
  type CommerceDialect,
  type SqlStatementExecutor,
} from "../src/commerce/order-projection";

interface TestDb extends SqlStatementExecutor {
  dialect: CommerceDialect;
  exec(statement: string): Promise<void>;
  one<T>(statement: string, parameters?: readonly unknown[]): Promise<T>;
  close(): Promise<void>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; this test never skips an engine`);
  return value;
}

function pgBindings(statement: string): string {
  let position = 0;
  return statement.replace(/\?/g, () => `$${++position}`);
}

function openSqlite(): TestDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  return {
    dialect: "sqlite",
    async exec(statement) {
      db.exec(statement);
    },
    async execute(statement, parameters) {
      const result = db.prepare(statement).run(...parameters);
      return { rowsAffected: result.changes };
    },
    async one<T>(statement, parameters = []) {
      return db.prepare(statement).get(...parameters) as T;
    },
    async close() {
      db.close();
    },
  };
}

function openPostgres(): TestDb {
  const pool = new PgPool({ connectionString: requiredEnv("TEST_POSTGRES_URL") });

  return {
    dialect: "postgres",
    async exec(statement) {
      await pool.query(statement);
    },
    async execute(statement, parameters) {
      const result = await pool.query(statement, [...parameters]);
      return { rowsAffected: result.rowCount ?? 0 };
    },
    async one<T>(statement, parameters = []) {
      const result = await pool.query(pgBindings(statement), [...parameters]);
      return result.rows[0] as T;
    },
    async close() {
      await pool.end();
    },
  };
}

function openMysql(): TestDb {
  const pool = createMysqlPool(requiredEnv("TEST_MYSQL_URL"));

  return {
    dialect: "mysql",
    async exec(statement) {
      await pool.query(statement);
    },
    async execute(statement, parameters) {
      const [result] = await pool.execute<ResultSetHeader>(
        statement,
        [...parameters]
      );
      return { rowsAffected: result.affectedRows };
    },
    async one<T>(statement, parameters = []) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        statement,
        [...parameters]
      );
      return rows[0] as T;
    },
    async close() {
      await pool.end();
    },
  };
}

async function migrate(db: TestDb): Promise<void> {
  await db.exec(
    db.dialect === "mysql"
      ? `CREATE TABLE member_tiers (
           id VARCHAR(191) NOT NULL,
           workspace_id VARCHAR(191) NOT NULL,
           PRIMARY KEY (id)
         ) ENGINE=InnoDB
           DEFAULT CHARSET=utf8mb4
           COLLATE=utf8mb4_bin`
      : `CREATE TABLE member_tiers (
           id TEXT NOT NULL PRIMARY KEY,
           workspace_id TEXT NOT NULL
         )`
  );

  const migration = await readFile(
    new URL(`../migrations/commerce.${db.dialect}.sql`, import.meta.url),
    "utf8"
  );

  for (const statement of migration.split(/;\s*(?:\n|$)/)) {
    if (statement.trim()) await db.exec(statement);
  }
}

const databases: TestDb[] = [
  openSqlite(),
  openPostgres(),
  openMysql(),
];

beforeAll(async () => {
  for (const db of databases) await migrate(db);
});

afterAll(async () => {
  for (const db of databases) await db.close();
});

describe.each(databases.map((db) => [db.dialect, db] as const))(
  "commerce SQL contract: %s",
  (_dialect, db) => {
    it("enforces workspace FKs, money checks, event uniqueness, and ordering", async () => {
      await db.execute(
        "INSERT INTO member_tiers(id, workspace_id) VALUES (?, ?)",
        ["tier-pro", "workspace-a"]
      );

      await db.execute(
        `INSERT INTO commerce_products(
           id, workspace_id, name, status, entitlement_tier_id,
           metadata_json, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "product-pro",
          "workspace-a",
          "Pro",
          "active",
          "tier-pro",
          '{"source":"test"}',
          "2026-08-12T12:00:00.000Z",
          "2026-08-12T12:00:00.000Z",
          1,
        ]
      );

      await expect(
        db.execute(
          `INSERT INTO commerce_products(
             id, workspace_id, name, status, entitlement_tier_id,
             metadata_json, created_at, updated_at, version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "cross-tenant-product",
            "workspace-b",
            "Invalid",
            "active",
            "tier-pro",
            null,
            "2026-08-12T12:00:00.000Z",
            "2026-08-12T12:00:00.000Z",
            1,
          ]
        )
      ).rejects.toThrow();

      await expect(
        db.execute(
          `INSERT INTO commerce_prices(
             id, workspace_id, product_id, status, billing_type,
             billing_interval, billing_interval_count, unit_amount_cents,
             currency, created_at, updated_at, version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "bad-price",
            "workspace-a",
            "product-pro",
            "active",
            "recurring",
            "month",
            1,
            -1,
            "usd",
            "2026-08-12T12:00:00.000Z",
            "2026-08-12T12:00:00.000Z",
            1,
          ]
        )
      ).rejects.toThrow();

      await db.execute(
        `INSERT INTO commerce_prices(
           id, workspace_id, product_id, status, billing_type,
           billing_interval, billing_interval_count, unit_amount_cents,
           currency, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "price-monthly",
          "workspace-a",
          "product-pro",
          "active",
          "recurring",
          "month",
          1,
          1000,
          "usd",
          "2026-08-12T12:00:00.000Z",
          "2026-08-12T12:00:00.000Z",
          1,
        ]
      );

      await db.execute(
        `INSERT INTO commerce_orders(
           id, workspace_id, price_id, provider, provider_order_id,
           status, quantity, unit_amount_cents, subtotal_cents,
           discount_cents, tax_cents, total_cents, currency,
           source_sequence, created_at, updated_at, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "order-1",
          "workspace-a",
          "price-monthly",
          "stripe",
          "pi_1",
          "pending",
          1,
          1000,
          1000,
          0,
          0,
          1000,
          "usd",
          0,
          "2026-08-12T12:00:00.000Z",
          "2026-08-12T12:00:00.000Z",
          1,
        ]
      );

      const firstEvent = [
        "receipt-1",
        "workspace-a",
        "stripe",
        "evt_1",
        "payment_intent.succeeded",
        "pi_1",
        "123",
        "2026-08-12T12:01:00.000Z",
        "2026-08-12T12:01:01.000Z",
        null,
        "received",
        1,
      ] as const;

      await db.execute(
        `INSERT INTO commerce_provider_events(
           id, workspace_id, provider, event_id, event_type, object_id,
           payload_json, source_created_at, received_at, processed_at,
           status, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        firstEvent
      );

      await expect(
        db.execute(
          `INSERT INTO commerce_provider_events(
             id, workspace_id, provider, event_id, event_type, object_id,
             payload_json, source_created_at, received_at, processed_at,
             status, version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ["receipt-2", ...firstEvent.slice(1)]
        )
      ).rejects.toThrow();

      expect(
        await applyOrderSnapshotIfNewer(db, db.dialect, {
          workspaceId: "workspace-a",
          provider: "stripe",
          providerOrderId: "pi_1",
          status: "paid",
          updatedAt: iso8601("2026-08-12T12:02:00.000Z"),
          ordering: {
            kind: "serialized-authoritative-read",
            value: strictSourceSequence(20),
          },
        })
      ).toBe(true);

      expect(
        await applyOrderSnapshotIfNewer(db, db.dialect, {
          workspaceId: "workspace-a",
          provider: "stripe",
          providerOrderId: "pi_1",
          status: "failed",
          updatedAt: iso8601("2026-08-12T12:03:00.000Z"),
          ordering: {
            kind: "serialized-authoritative-read",
            value: strictSourceSequence(10),
          },
        })
      ).toBe(false);

      const order = await db.one<{
        status: string;
        source_sequence: number;
        version: number;
      }>(
        `SELECT status, source_sequence, version
           FROM commerce_orders
          WHERE id = ?`,
        ["order-1"]
      );

      expect(order).toEqual({
        status: "paid",
        source_sequence: 20,
        version: 2,
      });

      const payload = await db.one<{ payload_json: string }>(
        `SELECT payload_json
           FROM commerce_provider_events
          WHERE id = ?`,
        ["receipt-1"]
      );
      expect(payload.payload_json).toBe("123");
    });
  }
);
```

This suite makes portability a release gate. SQLite’s bundled engine, PostgreSQL, and MySQL all execute their real constraints and the same duplicate, tenant-isolation, money, JSON-text round-trip, and reverse-order scenarios.

## Critique Of Another Participant's Round 2 Code

Sonnet’s proposed atomic construct:

```sql
UPDATE ...
SET ...
WHERE id = ? AND provider_event_at < ?
```

is atomic, but `provider_event_at` is unsafe when populated from Stripe’s `Event.created`. Stripe documents that field only as a seconds-resolution timestamp and does not document it as a strict per-object revision. Two state changes can share the same second, and an arbitrary event-ID tie-breaker would impose a deterministic order rather than the correct provider order. The single statement is good; its cursor source is not. The leading code accepts only a documented provider revision or a serialized authoritative-read revision.

Gemini 3.1’s concrete migration:

```sql
UPDATE table SET col = jsonb(col)
```

is also now rejected. It converts application-owned JSON text into SQLite’s internal binary representation, directly contradicting SQLite’s current JSONB warning and the repository’s explicit text convention (`files/tovu/schema.ts:12-13`). Because `better-sqlite3` supplies the SQLite engine, updating an npm dependency would also change the implementation responsible for interpreting those persisted bytes.

Finally, Gemini 3.1’s assertion that comparing provider event timestamps “fully solves” inverted delivery is too strong. `(provider, event_id)` solves replay; a strict source revision solves ordering; an event creation timestamp documented merely as seconds since epoch is neither.

## What Would Change My Mind

- I would extend `member_tiers` instead if the product roadmap permanently limits commerce to exactly one membership entitlement with the current monthly/yearly price slots and no independent catalog.
- I would add refund and proration tables immediately if the first shipping workflow includes refunds, upgrades, downgrades, or multi-line invoices. They must be separate facts; a negative proration must not be labeled a refund.
- I would permit SQLite JSONB only if SQLite published an application-level durable compatibility contract strong enough for database files to survive bundled-engine replacement, and measurements showed a relevant benefit. Current documentation says the opposite.
- I would reject this implementation if the three-engine contract test allows a cross-workspace entitlement, duplicate provider event, malformed money row, or stale projection overwrite.
- If a provider offers neither a strict object revision nor an authoritative object read that can be serialized, I would not project mutable state from its webhooks; I would retain the inbox and require reconciliation instead.

<<SWARM_END>>