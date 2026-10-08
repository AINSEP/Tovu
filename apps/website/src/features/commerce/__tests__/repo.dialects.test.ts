import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { CommerceProductSlugConflictError } from "@jini-ai/commerce";
import {
  commerceOrderRepoFor,
  commercePriceRepoFor,
  commerceProductImageRepoFor,
  commerceProductRepoFor,
  commerceWebhookEventRepoFor,
} from "@jini-ai/commerce/repo";
import type {
  CommerceOrderItemRecord,
  CommerceOrderRecord,
  CommercePriceRecord,
  CommerceProductImageRecord,
  CommerceProductRecord,
} from "@jini-ai/commerce";

/**
 * @file The commerce repos on every dialect through the kernel's matrix (`describeEachDialect` + ONE
 * factory: one query body serves every dialect). One `describe` per repo class; each covers every
 * public method: hit, miss, other-workspace isolation and rollback, plus the webhook inbox's replay
 * and ordering guards.
 */

const WS = "ws-dialects";
const OTHER = "ws-other";
const T0 = "2026-09-28T00:00:00.000Z";
const T1 = "2026-09-28T01:00:00.000Z";
const T2 = "2026-09-28T02:00:00.000Z";

// `workspaces` last: TRUNCATE … CASCADE (PGlite) empties everything that references it.
const TABLES = [
  "commerce_webhook_events",
  "commerce_order_items",
  "commerce_orders",
  "commerce_prices",
  "commerce_product_images",
  "commerce_products",
  "member_tiers",
  "members",
  "media",
  "workspaces",
] as const;

function product(id: string, slug: string, overrides: Partial<CommerceProductRecord> = {}): CommerceProductRecord {
  return {
    id,
    workspaceId: WS,
    name: `Product ${slug}`,
    slug,
    kind: "one_time",
    status: "active",
    description: "A thing",
    grantsMemberTierId: undefined,
    specs: [{ label: "Material", value: "cotton" }],
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

function image(id: string, position: number, overrides: Partial<CommerceProductImageRecord> = {}): CommerceProductImageRecord {
  return { id, workspaceId: WS, productId: "p1", mediaId: `m-${id}`, position, createdAt: T0, ...overrides };
}

function price(id: string, overrides: Partial<CommercePriceRecord> = {}): CommercePriceRecord {
  return {
    id,
    workspaceId: WS,
    productId: "p1",
    unitAmountCents: 1999,
    compareAtAmountCents: 2499,
    currency: "usd",
    billingInterval: "month",
    status: "active",
    createdAt: T0,
    version: 1,
    ...overrides,
  };
}

function order(id: string, overrides: Partial<CommerceOrderRecord> = {}): CommerceOrderRecord {
  return {
    id,
    workspaceId: WS,
    memberId: "mem-1",
    status: "pending",
    currency: "usd",
    totalAmountCents: 3998,
    provider: "stripe",
    providerCustomerRef: "cus_1",
    providerPaymentRef: "pi_1",
    providerEventAt: undefined,
    placedAt: T0,
    createdAt: T0,
    updatedAt: T0,
    version: 1,
    ...overrides,
  };
}

function item(id: string, orderId: string, overrides: Partial<CommerceOrderItemRecord> = {}): CommerceOrderItemRecord {
  return {
    id,
    workspaceId: WS,
    orderId,
    priceId: "pr1",
    productId: "p1",
    description: "Product one",
    unitAmountCents: 1999,
    quantity: 2,
    currency: "usd",
    createdAt: T0,
    ...overrides,
  };
}

function inboundEvent(id: string, eventId: string, occurredAt: string, workspaceId = WS) {
  return {
    id,
    workspaceId,
    provider: "stripe",
    eventId,
    eventType: "payment_intent.succeeded",
    eventOccurredAt: occurredAt,
    payload: '{"id":"evt"}',
    status: "received" as const,
    receivedAt: occurredAt,
  };
}

function repos(kernel: ContentKernel) {
  return {
    kernel,
    products: commerceProductRepoFor({ kernel: kernel }),
    images: commerceProductImageRepoFor({ kernel: kernel }),
    prices: commercePriceRepoFor({ kernel: kernel }),
    orders: commerceOrderRepoFor({ kernel: kernel }),
    events: commerceWebhookEventRepoFor({ kernel: kernel }),
  };
}

/** The FK targets every commerce row needs: both workspaces, a member each, and media rows. */
async function seed(kernel: ContentKernel, mediaIds: readonly string[] = []): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("workspaces")
      .values([WS, OTHER].map((id) => ({ id, name: id, slug: id, created_at: T0 })))
      .execute()
  );
  await kernel.run((db) =>
    db
      .insertInto("members")
      .values(
        [WS, OTHER].map((ws) => ({
          id: ws === WS ? "mem-1" : "mem-o",
          workspace_id: ws,
          email: `${ws}@example.test`,
          status: "active",
          created_at: T0,
          updated_at: T0,
          version: 1,
        }))
      )
      .execute()
  );
  for (const id of mediaIds) {
    await kernel.run((db) =>
      db
        .insertInto("media")
        .values({
          id,
          workspace_id: WS,
          title: id,
          alt: id,
          caption: "",
          credit: "",
          source_sha256: `sha-${id}`,
          status: "active",
          created_at: T0,
          updated_at: T0,
          version: 1,
        })
        .execute()
    );
  }
}

describeEachDialect("commerce repos", { tables: TABLES, make: repos }, (makeRepos) => {
  describe("CommerceProductRepo", () => {
    test("save then findById / findBySlug round-trip, JSON specs and optional columns included", async () => {
      const { kernel, products } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "tee"));
      await products.save(product("p2", "mug", { description: undefined, specs: undefined }));
      assert.deepEqual(await products.findById({ workspaceId: WS, id: "p1" }), product("p1", "tee"));
      assert.deepEqual(
        await products.findBySlug({ workspaceId: WS, slug: "mug" }),
        product("p2", "mug", { description: undefined, specs: undefined })
      );
    });

    test("reads miss unknown ids/slugs and never cross workspaces", async () => {
      const { kernel, products } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "tee"));
      assert.equal(await products.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await products.findById({ workspaceId: OTHER, id: "p1" }), null);
      assert.equal(await products.findBySlug({ workspaceId: WS, slug: "nope" }), null);
      assert.equal(await products.findBySlug({ workspaceId: OTHER, slug: "tee" }), null);
      assert.deepEqual(await products.listActive({ workspaceId: OTHER }), []);
    });

    test("listActive: active only, by name, workspace-scoped, limit capped at 100", async () => {
      const { kernel, products } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "c", { name: "Charlie" }));
      await products.save(product("p2", "a", { name: "Alpha" }));
      await products.save(product("p3", "b", { name: "Bravo", status: "archived" }));
      await products.save(product("p4", "d", { name: "Delta", workspaceId: OTHER }));
      assert.deepEqual((await products.listActive({ workspaceId: WS })).map((p) => p.id), ["p2", "p1"]);
      assert.deepEqual((await products.listActive({ workspaceId: WS, limit: 1 })).map((p) => p.id), ["p2"]);
      for (let i = 0; i < 101; i += 1) {
        await products.save(product(`bulk-${i}`, `bulk-${i}`, { name: `Z${String(i).padStart(3, "0")}` }));
      }
      assert.equal((await products.listActive({ workspaceId: WS, limit: 500 })).length, 100);
    });

    test("save upserts on id; a slug held by another product throws before writing; other workspaces may reuse it", async () => {
      const { kernel, products } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "tee"));
      await products.save(product("p1", "tee", { name: "Renamed", version: 2 }));
      assert.equal((await products.findById({ workspaceId: WS, id: "p1" }))?.name, "Renamed");
      await assert.rejects(
        products.save(product("p2", "tee")),
        (err: unknown) => err instanceof CommerceProductSlugConflictError && err.slug === "tee" && /already exists/.test(err.message)
      );
      assert.equal(await products.findById({ workspaceId: WS, id: "p2" }), null);
      await products.save(product("p3", "tee", { workspaceId: OTHER }));
      assert.equal((await products.findBySlug({ workspaceId: OTHER, slug: "tee" }))?.id, "p3");
    });

    test("a slug conflict inside a caller's transaction rolls back the earlier writes too", async () => {
      const { kernel, products } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "tee"));
      await assert.rejects(
        kernel.transaction(async () => {
          await products.save(product("p2", "fresh"));
          await products.save(product("p3", "tee"));
        }),
        CommerceProductSlugConflictError
      );
      assert.equal(await products.findBySlug({ workspaceId: WS, slug: "fresh" }), null);
    });
  });

  describe("CommerceProductImageRepo", () => {
    test("save then listByProduct: position order with an id tie-break, upsert on id", async () => {
      const { kernel, products, images } = makeRepos();
      await seed(kernel, ["m-a", "m-b", "m-c"]);
      await products.save(product("p1", "tee"));
      await images.save(image("c", 2));
      await images.save(image("b", 1));
      await images.save(image("a", 1));
      assert.deepEqual((await images.listByProduct({ workspaceId: WS, productId: "p1" })).map((i) => i.id), ["a", "b", "c"]);
      await images.save(image("c", 0));
      const listed = await images.listByProduct({ workspaceId: WS, productId: "p1" });
      assert.deepEqual(listed[0], image("c", 0));
    });

    test("listByProduct misses unknown products and never crosses workspaces; a failed transaction leaves nothing", async () => {
      const { kernel, products, images } = makeRepos();
      await seed(kernel, ["m-a"]);
      await products.save(product("p1", "tee"));
      await images.save(image("a", 0));
      assert.deepEqual(await images.listByProduct({ workspaceId: WS, productId: "nope" }), []);
      assert.deepEqual(await images.listByProduct({ workspaceId: OTHER, productId: "p1" }), []);
      await assert.rejects(
        kernel.transaction(async () => {
          await images.save(image("a", 5));
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal((await images.listByProduct({ workspaceId: WS, productId: "p1" }))[0]?.position, 0);
    });
  });

  describe("CommercePriceRepo", () => {
    test("save then findById / listByProduct round-trip integer cents; optional columns become undefined", async () => {
      const { kernel, products, prices } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "tee"));
      await products.save(product("p2", "mug"));
      await prices.save(price("pr1"));
      await prices.save(price("pr2", { compareAtAmountCents: undefined, billingInterval: undefined, unitAmountCents: 0 }));
      await prices.save(price("pr3", { productId: "p2" }));
      assert.deepEqual(await prices.findById({ workspaceId: WS, id: "pr1" }), price("pr1"));
      assert.deepEqual(
        await prices.findById({ workspaceId: WS, id: "pr2" }),
        price("pr2", { compareAtAmountCents: undefined, billingInterval: undefined, unitAmountCents: 0 })
      );
      assert.deepEqual((await prices.listByProduct({ workspaceId: WS, productId: "p1" })).map((p) => p.id).sort(), ["pr1", "pr2"]);
    });

    test("reads miss unknown ids and never cross workspaces; save upserts on id", async () => {
      const { kernel, products, prices } = makeRepos();
      await seed(kernel);
      await products.save(product("p1", "tee"));
      await prices.save(price("pr1"));
      await prices.save(price("pr1", { status: "archived", version: 2 }));
      assert.equal((await prices.findById({ workspaceId: WS, id: "pr1" }))?.status, "archived");
      assert.equal(await prices.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await prices.findById({ workspaceId: OTHER, id: "pr1" }), null);
      assert.deepEqual(await prices.listByProduct({ workspaceId: OTHER, productId: "p1" }), []);
      assert.deepEqual(await prices.listByProduct({ workspaceId: WS, productId: "nope" }), []);
    });
  });

  describe("CommerceOrderRepo", () => {
    async function seedCatalog(r: ReturnType<typeof repos>): Promise<void> {
      await seed(r.kernel);
      await r.products.save(product("p1", "tee"));
      await r.prices.save(price("pr1"));
    }

    test("placeOrder then findById / listItems round-trip", async () => {
      const r = makeRepos();
      await seedCatalog(r);
      await r.orders.placeOrder({ order: order("o1"), items: [item("i1", "o1"), item("i2", "o1", { quantity: 1 })] });
      await r.orders.placeOrder({ order: order("o2", { providerCustomerRef: undefined, providerPaymentRef: undefined }), items: [] });
      assert.deepEqual(await r.orders.findById({ workspaceId: WS, id: "o1" }), order("o1"));
      assert.deepEqual(
        await r.orders.findById({ workspaceId: WS, id: "o2" }),
        order("o2", { providerCustomerRef: undefined, providerPaymentRef: undefined })
      );
      const items = await r.orders.listItems({ workspaceId: WS, orderId: "o1" });
      assert.deepEqual(items.sort((a, b) => a.id.localeCompare(b.id)), [item("i1", "o1"), item("i2", "o1", { quantity: 1 })]);
      assert.deepEqual(await r.orders.listItems({ workspaceId: WS, orderId: "o2" }), []);
    });

    test("reads miss unknown ids and never cross workspaces", async () => {
      const r = makeRepos();
      await seedCatalog(r);
      await r.orders.placeOrder({ order: order("o1"), items: [item("i1", "o1")] });
      assert.equal(await r.orders.findById({ workspaceId: WS, id: "nope" }), null);
      assert.equal(await r.orders.findById({ workspaceId: OTHER, id: "o1" }), null);
      assert.deepEqual(await r.orders.listItems({ workspaceId: OTHER, orderId: "o1" }), []);
    });

    test("a failing line item rolls the header back too (all-or-nothing)", async () => {
      const r = makeRepos();
      await seedCatalog(r);
      await assert.rejects(r.orders.placeOrder({ order: order("o1"), items: [item("i1", "o1", { priceId: "no-such-price" })] }));
      assert.equal(await r.orders.findById({ workspaceId: WS, id: "o1" }), null);
      assert.deepEqual(await r.orders.listItems({ workspaceId: WS, orderId: "o1" }), []);
    });
  });

  describe("CommerceWebhookEventRepo", () => {
    async function seedOrder(r: ReturnType<typeof repos>): Promise<void> {
      await seed(r.kernel);
      await r.products.save(product("p1", "tee"));
      await r.prices.save(price("pr1"));
      await r.orders.placeOrder({ order: order("o1"), items: [item("i1", "o1")] });
    }
    const eventRow = (kernel: ContentKernel, id: string) =>
      kernel.run((db) => db.selectFrom("commerce_webhook_events").select(["status", "processed_at"]).where("id", "=", id).executeTakeFirst());

    test("a new event applies its projection, bumps version and records 'applied'", async () => {
      const r = makeRepos();
      await seedOrder(r);
      const outcome = await r.events.applyProviderEvent({
        event: inboundEvent("e1", "evt_1", T1),
        orderId: "o1",
        projection: { status: "paid", providerEventAt: T1, updatedAt: T1 },
        processedAt: T1,
      });
      assert.equal(outcome, "applied");
      assert.deepEqual(await r.orders.findById({ workspaceId: WS, id: "o1" }), order("o1", { status: "paid", providerEventAt: T1, updatedAt: T1, version: 2 }));
      assert.deepEqual(await eventRow(r.kernel, "e1"), { status: "applied", processed_at: T1 });
    });

    test("a duplicate provider event id is recorded once and applied once", async () => {
      const r = makeRepos();
      await seedOrder(r);
      const apply = (id: string, status: "paid" | "failed", at: string) =>
        r.events.applyProviderEvent({
          event: inboundEvent(id, "evt_1", at),
          orderId: "o1",
          projection: { status, providerEventAt: at, updatedAt: at },
          processedAt: at,
        });
      assert.equal(await apply("e1", "paid", T1), "applied");
      assert.equal(await apply("e2", "failed", T2), "duplicate");
      const rows = await r.kernel.run((db) => db.selectFrom("commerce_webhook_events").select("id").execute());
      assert.deepEqual(rows.map((row) => row.id), ["e1"]);
      const after = await r.orders.findById({ workspaceId: WS, id: "o1" });
      assert.equal(after?.status, "paid");
      assert.equal(after?.version, 2);
    });

    test("an older event is recorded as 'ignored' and leaves the order untouched", async () => {
      const r = makeRepos();
      await seedOrder(r);
      await r.events.applyProviderEvent({
        event: inboundEvent("e2", "evt_2", T2),
        orderId: "o1",
        projection: { status: "paid", providerEventAt: T2, updatedAt: T2 },
        processedAt: T2,
      });
      const outcome = await r.events.applyProviderEvent({
        event: inboundEvent("e1", "evt_1", T1),
        orderId: "o1",
        projection: { status: "failed", providerEventAt: T1, updatedAt: T2 },
        processedAt: T2,
      });
      assert.equal(outcome, "stale");
      assert.equal((await r.orders.findById({ workspaceId: WS, id: "o1" }))?.status, "paid");
      assert.deepEqual(await eventRow(r.kernel, "e1"), { status: "ignored", processed_at: T2 });
    });

    test("an event for another workspace's order is recorded but never touches it (stale)", async () => {
      const r = makeRepos();
      await seedOrder(r);
      const outcome = await r.events.applyProviderEvent({
        event: inboundEvent("e1", "evt_1", T1, OTHER),
        orderId: "o1",
        projection: { status: "paid", providerEventAt: T1, updatedAt: T1 },
        processedAt: T1,
      });
      assert.equal(outcome, "stale");
      assert.equal((await r.orders.findById({ workspaceId: WS, id: "o1" }))?.status, "pending");
    });

    test("a caller's failed transaction rolls back both the inbox row and the projection", async () => {
      const r = makeRepos();
      await seedOrder(r);
      await assert.rejects(
        r.kernel.transaction(async () => {
          await r.events.applyProviderEvent({
            event: inboundEvent("e1", "evt_1", T1),
            orderId: "o1",
            projection: { status: "paid", providerEventAt: T1, updatedAt: T1 },
            processedAt: T1,
          });
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await eventRow(r.kernel, "e1"), undefined);
      assert.equal((await r.orders.findById({ workspaceId: WS, id: "o1" }))?.status, "pending");
    });
  });
});
