import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/db/sqlite/content-db";
import { media, members, memberTiers, workspaces } from "#src/db/schema";
import {
  SqliteCommerceOrderRepo,
  SqliteCommercePriceRepo,
  SqliteCommerceProductImageRepo,
  SqliteCommerceProductRepo,
} from "../../repo.sqlite";
import type { CommerceOrderItemRecord, CommerceOrderRecord, CommercePriceRecord, CommerceProductRecord } from "../../types";

/**
 * @file Integration tests against a real SQLite `content.db` (Article V — DB-level invariants get
 * coverage against the real adapter, not just asserted in a design doc). Mirrors
 * `src/features/settings/__tests__/repo.sqlite.test.ts`'s shape: seed the FK targets a test
 * needs, then prove round-trip plus every constraint the schema actually declares.
 */

const NOW = "2026-08-12T00:00:00.000Z";

function openTestDb(): ContentDb {
  return openContentDb(":memory:");
}

function seedWorkspace(db: ContentDb, id: string): void {
  db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
}

function seedMember(db: ContentDb, workspaceId: string, id: string): void {
  db.insert(members)
    .values({
      id,
      workspaceId,
      email: `${id}@example.test`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    })
    .onConflictDoNothing()
    .run();
}

function seedMemberTier(db: ContentDb, workspaceId: string, id: string): void {
  db.insert(memberTiers)
    .values({
      id,
      workspaceId,
      name: id,
      slug: id,
      type: "paid",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    })
    .onConflictDoNothing()
    .run();
}

function seedMedia(db: ContentDb, workspaceId: string, id: string): void {
  db.insert(media)
    .values({
      id,
      workspaceId,
      title: id,
      alt: id,
      caption: "",
      credit: "",
      sourceSha256: `sha-${id}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    })
    .onConflictDoNothing()
    .run();
}

function sampleProduct(overrides: Partial<CommerceProductRecord> = {}): CommerceProductRecord {
  return {
    id: "product-1",
    workspaceId: "ws-1",
    name: "Pro Plan",
    slug: "pro-plan",
    kind: "membership",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function samplePrice(overrides: Partial<CommercePriceRecord> = {}): CommercePriceRecord {
  return {
    id: "price-1",
    workspaceId: "ws-1",
    productId: "product-1",
    unitAmountCents: 1000,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SqliteCommerceProductRepo
// ---------------------------------------------------------------------------

test("SqliteCommerceProductRepo: save + findById round-trips a product, including its member-tier bridge", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  seedMemberTier(db, "ws-1", "tier-pro");
  const repo = new SqliteCommerceProductRepo(db);

  await repo.save(sampleProduct({ grantsMemberTierId: "tier-pro" }));

  const found = await repo.findById({ workspaceId: "ws-1", id: "product-1" });
  assert.ok(found);
  assert.equal(found?.slug, "pro-plan");
  assert.equal(found?.grantsMemberTierId, "tier-pro");
});

test("SqliteCommerceProductRepo: findBySlug returns null for an unknown slug", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  const repo = new SqliteCommerceProductRepo(db);
  const found = await repo.findBySlug({ workspaceId: "ws-1", slug: "nope" });
  assert.equal(found, null);
});

test("commerce_products: a cross-workspace grants_member_tier_id is rejected by the composite FK", async () => {
  // The adversarial case the 2026-08-12 debate's own reviewers named explicitly: a product in
  // workspace-b must not be able to bridge to a tier that belongs to workspace-a, even though
  // both tables independently declare `id` as a valid-looking foreign key target.
  const db = openTestDb();
  seedWorkspace(db, "ws-a");
  seedWorkspace(db, "ws-b");
  seedMemberTier(db, "ws-a", "tier-in-a");
  const repo = new SqliteCommerceProductRepo(db);

  await assert.rejects(() =>
    repo.save(
      sampleProduct({
        id: "cross-tenant-product",
        workspaceId: "ws-b",
        slug: "cross-tenant",
        grantsMemberTierId: "tier-in-a",
      })
    )
  );
});

test("commerce_products: a same-workspace grants_member_tier_id is accepted", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  seedMemberTier(db, "ws-1", "tier-pro");
  const repo = new SqliteCommerceProductRepo(db);

  await assert.doesNotReject(() => repo.save(sampleProduct({ grantsMemberTierId: "tier-pro" })));
});

test("SqliteCommerceProductRepo: specs round-trip as an ordered array of label/value pairs (migration 0038)", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  const repo = new SqliteCommerceProductRepo(db);
  const specs = [
    { label: "Material", value: "Thick premium weight combed cotton" },
    { label: "Care", value: "Cool wash with similar colors" },
    { label: "Warranty", value: "Color fastness and shape guarantee" },
  ];

  await repo.save(sampleProduct({ specs }));

  const found = await repo.findById({ workspaceId: "ws-1", id: "product-1" });
  assert.deepEqual(found?.specs, specs);
});

test("SqliteCommerceProductRepo: a product with no specs round-trips specs as undefined, not an empty array", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  const repo = new SqliteCommerceProductRepo(db);

  await repo.save(sampleProduct());

  const found = await repo.findById({ workspaceId: "ws-1", id: "product-1" });
  assert.equal(found?.specs, undefined);
});

// ---------------------------------------------------------------------------
// SqliteCommerceProductImageRepo (migration 0038)
// ---------------------------------------------------------------------------

test("SqliteCommerceProductImageRepo: save + listByProduct returns images ordered by position", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  seedMedia(db, "ws-1", "media-1");
  seedMedia(db, "ws-1", "media-2");
  const repo = new SqliteCommerceProductImageRepo(db);

  await repo.save({ id: "img-2", workspaceId: "ws-1", productId: "product-1", mediaId: "media-2", position: 1, createdAt: NOW });
  await repo.save({ id: "img-1", workspaceId: "ws-1", productId: "product-1", mediaId: "media-1", position: 0, createdAt: NOW });

  const images = await repo.listByProduct({ workspaceId: "ws-1", productId: "product-1" });
  assert.deepEqual(images.map((i) => i.mediaId), ["media-1", "media-2"]);
});

test("commerce_product_images: the same media cannot be linked to one product twice (unique constraint)", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  seedMedia(db, "ws-1", "media-1");
  const repo = new SqliteCommerceProductImageRepo(db);
  await repo.save({ id: "img-1", workspaceId: "ws-1", productId: "product-1", mediaId: "media-1", position: 0, createdAt: NOW });

  await assert.rejects(() =>
    repo.save({ id: "img-2", workspaceId: "ws-1", productId: "product-1", mediaId: "media-1", position: 1, createdAt: NOW })
  );
});

test("commerce_product_images: a nonexistent media_id is rejected by the FK", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  const repo = new SqliteCommerceProductImageRepo(db);

  await assert.rejects(() =>
    repo.save({ id: "img-1", workspaceId: "ws-1", productId: "product-1", mediaId: "no-such-media", position: 0, createdAt: NOW })
  );
});

// ---------------------------------------------------------------------------
// SqliteCommercePriceRepo
// ---------------------------------------------------------------------------

test("SqliteCommercePriceRepo: save + listByProduct round-trips a price", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  const repo = new SqliteCommercePriceRepo(db);

  await repo.save(samplePrice());

  const prices = await repo.listByProduct({ workspaceId: "ws-1", productId: "product-1" });
  assert.equal(prices.length, 1);
  assert.equal(prices[0].unitAmountCents, 1000);
  assert.equal(prices[0].currency, "usd");
});

test("SqliteCommercePriceRepo: compare_at_amount_cents round-trips when set (migration 0038)", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  const repo = new SqliteCommercePriceRepo(db);

  await repo.save(samplePrice({ unitAmountCents: 3500, compareAtAmountCents: 4500 }));

  const [price] = await repo.listByProduct({ workspaceId: "ws-1", productId: "product-1" });
  assert.equal(price.unitAmountCents, 3500);
  assert.equal(price.compareAtAmountCents, 4500);
});

test("commerce_prices: a compare_at_amount_cents that is not strictly greater than unit_amount_cents is rejected (no fake discount)", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  const repo = new SqliteCommercePriceRepo(db);

  await assert.rejects(() =>
    repo.save(samplePrice({ id: "equal-compare-at", unitAmountCents: 3500, compareAtAmountCents: 3500 }))
  );
  await assert.rejects(() =>
    repo.save(samplePrice({ id: "lower-compare-at", unitAmountCents: 3500, compareAtAmountCents: 3000 }))
  );
});

test("commerce_prices: a negative unit_amount_cents is rejected by the CHECK constraint", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  const repo = new SqliteCommercePriceRepo(db);

  await assert.rejects(() => repo.save(samplePrice({ id: "bad-price", unitAmountCents: -1 })));
});

test("commerce_prices: an uppercase currency is rejected by the CHECK constraint", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  const repo = new SqliteCommercePriceRepo(db);

  await assert.rejects(() => repo.save(samplePrice({ id: "bad-currency", currency: "USD" })));
});

// ---------------------------------------------------------------------------
// SqliteCommerceOrderRepo
// ---------------------------------------------------------------------------

function sampleOrder(overrides: Partial<CommerceOrderRecord> = {}): CommerceOrderRecord {
  return {
    id: "order-1",
    workspaceId: "ws-1",
    memberId: "member-1",
    status: "pending",
    currency: "usd",
    totalAmountCents: 1000,
    provider: "stripe",
    placedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function sampleOrderItem(overrides: Partial<CommerceOrderItemRecord> = {}): CommerceOrderItemRecord {
  return {
    id: "item-1",
    workspaceId: "ws-1",
    orderId: "order-1",
    priceId: "price-1",
    productId: "product-1",
    description: "Pro Plan",
    unitAmountCents: 1000,
    quantity: 1,
    currency: "usd",
    createdAt: NOW,
    ...overrides,
  };
}

test("SqliteCommerceOrderRepo.placeOrder: writes the order header and its line items atomically", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  seedMember(db, "ws-1", "member-1");
  await new SqliteCommerceProductRepo(db).save(sampleProduct());
  await new SqliteCommercePriceRepo(db).save(samplePrice());
  const repo = new SqliteCommerceOrderRepo(db);

  await repo.placeOrder({ order: sampleOrder(), items: [sampleOrderItem()] });

  const order = await repo.findById({ workspaceId: "ws-1", id: "order-1" });
  assert.ok(order);
  assert.equal(order?.totalAmountCents, 1000);

  const items = await repo.listItems({ workspaceId: "ws-1", orderId: "order-1" });
  assert.equal(items.length, 1);
  assert.equal(items[0].description, "Pro Plan");
});

test("SqliteCommerceOrderRepo.placeOrder: a line item FK failure rolls back the order header too (atomicity)", async () => {
  // Adversarial aggregate-behavior case (5a5): if the two inserts inside placeOrder were NOT in
  // one transaction, an item referencing a nonexistent price would leave an orphaned order header
  // behind. Forcing that FK violation and then re-querying for the header is the only way to
  // actually prove atomicity rather than merely assert it.
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  seedMember(db, "ws-1", "member-1");
  const repo = new SqliteCommerceOrderRepo(db);

  await assert.rejects(() =>
    repo.placeOrder({
      order: sampleOrder(),
      items: [sampleOrderItem({ priceId: "does-not-exist", productId: "does-not-exist" })],
    })
  );

  const order = await repo.findById({ workspaceId: "ws-1", id: "order-1" });
  assert.equal(order, null, "the order header must not survive when its line item fails to insert");
});

test("commerce_orders: an unknown member_id is rejected by the FK", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-1");
  const repo = new SqliteCommerceOrderRepo(db);

  await assert.rejects(() => repo.placeOrder({ order: sampleOrder({ memberId: "no-such-member" }), items: [] }));
});
