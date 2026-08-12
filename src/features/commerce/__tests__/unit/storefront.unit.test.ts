import assert from "node:assert/strict";
import test from "node:test";

import { pickDisplayPrice, toSiteProduct, toSiteProducts } from "../../storefront";
import type { CommercePriceRecord, CommerceProductRecord } from "../../types";

const NOW = "2026-08-12T00:00:00.000Z";

function product(overrides: Partial<CommerceProductRecord> = {}): CommerceProductRecord {
  return {
    id: "product-1",
    workspaceId: "ws-1",
    name: "Classic Boxy Tee",
    slug: "classic-boxy-tee",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function price(overrides: Partial<CommercePriceRecord> = {}): CommercePriceRecord {
  return {
    id: "price-1",
    workspaceId: "ws-1",
    productId: "product-1",
    unitAmountCents: 3500,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
    ...overrides,
  };
}

test("pickDisplayPrice: returns null when no price is active", () => {
  assert.equal(pickDisplayPrice([price({ status: "archived" })]), null);
  assert.equal(pickDisplayPrice([]), null);
});

test("pickDisplayPrice: prefers a one-time price over a recurring one", () => {
  const monthly = price({ id: "price-monthly", unitAmountCents: 1000, billingInterval: "month" });
  const oneTime = price({ id: "price-one-time", unitAmountCents: 3500 });
  assert.equal(pickDisplayPrice([monthly, oneTime])?.id, "price-one-time");
});

test("pickDisplayPrice: among ties, picks the cheapest", () => {
  const cheap = price({ id: "cheap", unitAmountCents: 1000 });
  const expensive = price({ id: "expensive", unitAmountCents: 5000 });
  assert.equal(pickDisplayPrice([expensive, cheap])?.id, "cheap");
});

test("pickDisplayPrice: an archived price is never picked even if it's cheaper", () => {
  const archived = price({ id: "archived", unitAmountCents: 1, status: "archived" });
  const active = price({ id: "active", unitAmountCents: 5000, status: "active" });
  assert.equal(pickDisplayPrice([archived, active])?.id, "active");
});

test("toSiteProduct: maps name -> title, unitAmountCents -> price, compareAtAmountCents -> compareAtPrice", () => {
  const result = toSiteProduct({
    product: product({ name: "Classic Boxy Tee" }),
    price: price({ unitAmountCents: 3500, compareAtAmountCents: 4500 }),
  });
  assert.deepEqual(result, { id: "product-1", title: "Classic Boxy Tee", price: 3500, compareAtPrice: 4500 });
});

test("toSiteProduct: compareAtPrice is undefined, not present-but-null, when not on sale", () => {
  const result = toSiteProduct({ product: product(), price: price({ compareAtAmountCents: undefined }) });
  assert.equal(result.compareAtPrice, undefined);
});

test("toSiteProducts: a product with no active price is skipped, not thrown or rendered priceless", () => {
  const priced = product({ id: "priced", name: "Priced" });
  const unpriced = product({ id: "unpriced", name: "Unpriced" });
  const result = toSiteProducts([
    { product: priced, prices: [price({ productId: "priced" })] },
    { product: unpriced, prices: [] },
  ]);
  assert.deepEqual(
    result.map((p) => p.id),
    ["priced"]
  );
});

test("toSiteProducts: images/stock are absent from the mapped shape (not fabricated -- see file header)", () => {
  const [result] = toSiteProducts([{ product: product(), prices: [price()] }]);
  assert.equal("images" in result, false);
  assert.equal("stock" in result, false);
});
