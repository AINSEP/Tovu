import { sql } from "kysely";
import type { MigrationStep } from "../step.js";

/** Host-owned borrowed catalog schema; activation never imports legacy store or payment rows. */
export const COMMERCE_CATALOG_STATEMENTS = [
  `CREATE TABLE commerce_products (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    name text NOT NULL, slug text NOT NULL, kind text NOT NULL, status text NOT NULL,
    description text, grants_member_tier_id text, specs_json text, created_at text NOT NULL,
    updated_at text NOT NULL, version integer NOT NULL, UNIQUE(workspace_id, slug))`,
  `CREATE TABLE commerce_prices (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    product_id text NOT NULL, unit_amount_cents integer NOT NULL, compare_at_amount_cents integer,
    currency text NOT NULL, billing_interval text, status text NOT NULL, created_at text NOT NULL,
    version integer NOT NULL)`,
  `CREATE TABLE commerce_product_images (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    product_id text NOT NULL, media_id text NOT NULL, position integer NOT NULL DEFAULT 0, created_at text NOT NULL)`,
  `CREATE TABLE commerce_orders (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    member_id text NOT NULL, status text NOT NULL, currency text NOT NULL, total_amount_cents integer NOT NULL,
    provider text NOT NULL, provider_customer_ref text, provider_payment_ref text, provider_event_at text,
    placed_at text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, version integer NOT NULL)`,
  `CREATE TABLE commerce_order_items (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    order_id text NOT NULL REFERENCES commerce_orders(id), price_id text NOT NULL, product_id text NOT NULL,
    description text NOT NULL, unit_amount_cents integer NOT NULL, quantity integer NOT NULL DEFAULT 1,
    currency text NOT NULL, created_at text NOT NULL)`,
  `CREATE TABLE commerce_webhook_events (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL, event_occurred_at text NOT NULL,
    payload_json text NOT NULL, status text NOT NULL, received_at text NOT NULL, processed_at text,
    last_error text, UNIQUE(provider, event_id))`,
  `CREATE TABLE commerce_price_provider_refs (workspace_id text NOT NULL, price_id text NOT NULL,
    provider_id text NOT NULL, provider_account_id text NOT NULL, mode text NOT NULL CHECK (mode IN ('test','live')),
    provider_price_ref text NOT NULL CHECK (length(provider_price_ref) > 0), created_at text NOT NULL,
    PRIMARY KEY (workspace_id, price_id, provider_id, provider_account_id, mode))`,
  `CREATE TABLE commerce_order_payments (workspace_id text NOT NULL, order_id text NOT NULL,
    site_id text NOT NULL, provider_id text NOT NULL, provider_account_id text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('test','live')), amount_minor bigint NOT NULL, currency text NOT NULL,
    payment_id text, created_at text NOT NULL, PRIMARY KEY (workspace_id, order_id), UNIQUE(workspace_id, mode, payment_id))`,
  "CREATE INDEX idx_commerce_catalog_products_workspace ON commerce_products (workspace_id, status)",
  "CREATE INDEX idx_commerce_catalog_prices_product ON commerce_prices (workspace_id, product_id)",
  "CREATE INDEX idx_commerce_catalog_images_product ON commerce_product_images (workspace_id, product_id, position)",
  "CREATE INDEX idx_commerce_catalog_orders_member ON commerce_orders (workspace_id, member_id, created_at)",
  "CREATE INDEX idx_commerce_catalog_order_items_order ON commerce_order_items (workspace_id, order_id)",
] as const;

/** Create only the catalog contract when its plugin activates; the runner owns locking/rollback.
 * @param required The source-pinned checksum recorded in the dedicated commerce ledger.
 * @returns One immutable ADR-066 step; DDL failures propagate to the activation warning.
 * @complexity Fixed eight table and five index writes, O(1) application memory; no row reads.
 */
export function commerceCatalog({ checksum }: { checksum: string }, _optional: Record<string, never> = {}): MigrationStep {
  return { id: "0000_catalog", checksum,
    async up(kernel) {
      for (const statement of COMMERCE_CATALOG_STATEMENTS) await kernel.execute(sql.raw(statement));
    },
  };
}
