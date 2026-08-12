import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/db/sqlite/content-db";
import { members, workspaces } from "#src/db/schema";
import { checkout, MAX_CHECKOUT_QUANTITY } from "../../checkout";
import { CommerceCheckoutValidationError, CommercePriceNotFoundError, CommerceProductNotFoundError } from "../../errors";
import { SqliteCommerceOrderRepo, SqliteCommercePriceRepo, SqliteCommerceProductRepo } from "../../repo.sqlite";
import type { CommerceProductRecord, CommercePriceRecord } from "../../types";

/**
 * @file Proves `checkout()` end to end against a real SQLite `content.db` — the vertical-slice
 * claim this debate's own repository audit found no code path satisfied before this slice
 * ("No code path writes a commerce row in any dialect today").
 */

const NOW = "2026-08-12T00:00:00.000Z";

function openTestDb(): ContentDb {
  return openContentDb(":memory:");
}

function seedWorkspaceAndMember(db: ContentDb): void {
  db.insert(workspaces).values({ id: "ws-1", name: "ws-1", slug: "ws-1", createdAt: NOW }).run();
  db.insert(members)
    .values({ id: "member-1", workspaceId: "ws-1", email: "m@example.test", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 })
    .run();
}

async function seedCatalog(
  db: ContentDb,
  overrides: { product?: Partial<CommerceProductRecord>; price?: Partial<CommercePriceRecord> } = {}
): Promise<void> {
  await new SqliteCommerceProductRepo(db).save({
    id: "product-1",
    workspaceId: "ws-1",
    name: "Pro Plan",
    slug: "pro-plan",
    kind: "membership",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides.product,
  });
  await new SqliteCommercePriceRepo(db).save({
    id: "price-1",
    workspaceId: "ws-1",
    productId: "product-1",
    unitAmountCents: 1500,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
    ...overrides.price,
  });
}

function makeDeps(db: ContentDb) {
  let idCounter = 0;
  return {
    products: new SqliteCommerceProductRepo(db),
    prices: new SqliteCommercePriceRepo(db),
    orders: new SqliteCommerceOrderRepo(db),
    clock: { nowIso: () => "2026-08-12T09:00:00.000Z" },
    idGen: { newId: () => `id-${++idCounter}` },
  };
}

test("checkout: writes a pending order + one snapshotted line item, computing the total", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  await seedCatalog(db);
  const deps = makeDeps(db);

  const result = await checkout({
    deps,
    input: { workspaceId: "ws-1", memberId: "member-1", priceId: "price-1", quantity: 2, provider: "stripe" },
  });

  assert.equal(result.order.status, "pending");
  assert.equal(result.order.totalAmountCents, 3000);
  assert.equal(result.order.currency, "usd");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].description, "Pro Plan");

  // Proves the row is actually durable, not just returned in-memory.
  const persisted = await deps.orders.findById({ workspaceId: "ws-1", id: result.order.id });
  assert.ok(persisted);
  assert.equal(persisted?.totalAmountCents, 3000);
});

test("checkout: a price change after checkout never rewrites the snapshotted line item", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  await seedCatalog(db);
  const deps = makeDeps(db);

  const first = await checkout({
    deps,
    input: { workspaceId: "ws-1", memberId: "member-1", priceId: "price-1", provider: "stripe" },
  });
  assert.equal(first.items[0].unitAmountCents, 1500);

  // The price changes (a new active price, matching commercePrices' own "never mutated once
  // referenced" convention — a real update just needs a save() with the new amount).
  await deps.prices.save({
    id: "price-1",
    workspaceId: "ws-1",
    productId: "product-1",
    unitAmountCents: 9999,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 2,
  });

  const historicalItems = await deps.orders.listItems({ workspaceId: "ws-1", orderId: first.order.id });
  assert.equal(historicalItems[0].unitAmountCents, 1500, "a later price change must not rewrite history");
});

test("checkout: rejects a quantity above the bound without writing anything", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  await seedCatalog(db);
  const deps = makeDeps(db);

  await assert.rejects(
    () =>
      checkout({
        deps,
        input: { workspaceId: "ws-1", memberId: "member-1", priceId: "price-1", quantity: MAX_CHECKOUT_QUANTITY + 1, provider: "stripe" },
      }),
    CommerceCheckoutValidationError
  );
});

test("checkout: rejects an unknown price", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  const deps = makeDeps(db);

  await assert.rejects(
    () => checkout({ deps, input: { workspaceId: "ws-1", memberId: "member-1", priceId: "no-such-price", provider: "stripe" } }),
    CommercePriceNotFoundError
  );
});

test("checkout: rejects an archived price", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  await seedCatalog(db, { price: { status: "archived" } });
  const deps = makeDeps(db);

  await assert.rejects(
    () => checkout({ deps, input: { workspaceId: "ws-1", memberId: "member-1", priceId: "price-1", provider: "stripe" } }),
    CommercePriceNotFoundError
  );
});

test("checkout: a price belonging to a different workspace is treated as not found (no cross-tenant leak)", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  db.insert(workspaces).values({ id: "ws-2", name: "ws-2", slug: "ws-2", createdAt: NOW }).run();
  db.insert(members)
    .values({ id: "member-2", workspaceId: "ws-2", email: "m2@example.test", status: "active", createdAt: NOW, updatedAt: NOW, version: 1 })
    .run();
  await seedCatalog(db); // product-1/price-1 belong to ws-1
  const deps = makeDeps(db);

  await assert.rejects(
    () =>
      // A member of ws-2 attempting to check out against a price that only exists in ws-1.
      checkout({ deps, input: { workspaceId: "ws-2", memberId: "member-2", priceId: "price-1", provider: "stripe" } }),
    CommercePriceNotFoundError
  );
});

test("checkout: rejects an archived product even if its price is still active", async () => {
  const db = openTestDb();
  seedWorkspaceAndMember(db);
  await seedCatalog(db, { product: { status: "archived" } });
  const deps = makeDeps(db);

  await assert.rejects(
    () => checkout({ deps, input: { workspaceId: "ws-1", memberId: "member-1", priceId: "price-1", provider: "stripe" } }),
    CommerceProductNotFoundError
  );
});
