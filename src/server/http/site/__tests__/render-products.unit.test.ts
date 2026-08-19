import assert from "node:assert/strict";
import test from "node:test";

import { buildTemplateRenderData, type SiteProduct, type SiteRenderContext } from "../render.js";

/**
 * @file Focused, isolated coverage for `buildTemplateRenderData`'s product mapping (2026-08-12:
 * "wire products into template render data"). Deliberately a SEPARATE file from
 * `render.test.ts` — that file currently carries 9 pre-existing, unrelated failures (media/widget
 * embed rendering); this file must never be mistaken for touching that area or be affected by it.
 */

function minimalContext(overrides: Partial<SiteRenderContext> = {}): SiteRenderContext {
  return {
    siteTitle: "Test Site",
    route: "products",
    posts: [],
    products: [],
    themeName: "test-theme",
    widgetRegions: {},
    widgetInlineResolved: new Map(),
    mediaAssetMetadata: new Map(),
    mediaTransformVersions: new Map(),
    ...overrides,
  };
}

function siteProduct(overrides: Partial<SiteProduct> = {}): SiteProduct {
  return { id: "product-1", title: "Classic Boxy Tee", price: 3500, ...overrides };
}

test("buildTemplateRenderData: a product's compareAtPrice becomes compareAtPriceFormatted", () => {
  const data = buildTemplateRenderData(
    minimalContext({ products: [siteProduct({ price: 3500, compareAtPrice: 4500 })] })
  );
  const products = data.products as Array<Record<string, unknown>>;
  assert.equal(products[0].priceFormatted, "$35.00");
  assert.equal(products[0].compareAtPriceFormatted, "$45.00");
});

test("buildTemplateRenderData: a product not on sale has no compareAtPriceFormatted (undefined, not '$0.00')", () => {
  const data = buildTemplateRenderData(minimalContext({ products: [siteProduct({ compareAtPrice: undefined })] }));
  const products = data.products as Array<Record<string, unknown>>;
  assert.equal(products[0].compareAtPriceFormatted, undefined);
});

test("buildTemplateRenderData: a product with no tracked stock passes stock through as undefined, never a fabricated number", () => {
  const data = buildTemplateRenderData(minimalContext({ products: [siteProduct({ stock: undefined })] }));
  const products = data.products as Array<Record<string, unknown>>;
  assert.equal(products[0].stock, undefined);
});

test("buildTemplateRenderData: the sample-store-plugin shape (real stock, no compareAtPrice) still maps unchanged", () => {
  const data = buildTemplateRenderData(minimalContext({ products: [siteProduct({ stock: 5, compareAtPrice: undefined })] }));
  const products = data.products as Array<Record<string, unknown>>;
  assert.equal(products[0].stock, 5);
  assert.equal(products[0].compareAtPriceFormatted, undefined);
});

test("buildTemplateRenderData: the single `product` (detail route) gets the identical mapping as the `products` list", () => {
  const data = buildTemplateRenderData(
    minimalContext({ route: "product", product: siteProduct({ price: 3500, compareAtPrice: 4500, stock: undefined }) })
  );
  const product = data.product as Record<string, unknown>;
  assert.equal(product.priceFormatted, "$35.00");
  assert.equal(product.compareAtPriceFormatted, "$45.00");
  assert.equal(product.stock, undefined);
});

test("buildTemplateRenderData: `product` is null (not undefined/absent) when the context has none, matching the pre-existing convention", () => {
  const data = buildTemplateRenderData(minimalContext({ route: "products", product: undefined }));
  assert.equal(data.product, null);
});

test("buildTemplateRenderData: a product's specs and currency pass through unchanged (2026-08-12 contract-delta fix -- product.liquid reads both, safely, since neither is emitted via `| raw`)", () => {
  const specs = [{ label: "Material", value: "Combed cotton" }];
  const data = buildTemplateRenderData(
    minimalContext({ products: [siteProduct({ specs, currency: "usd" })] })
  );
  const products = data.products as Array<Record<string, unknown>>;
  assert.deepEqual(products[0].specs, specs);
  assert.equal(products[0].currency, "usd");
});

test("buildTemplateRenderData: a product never emits a `description` field, even if one somehow reached SiteProduct -- see storefront.ts's file header for why raw HTML from an unsanitized source must never reach product.liquid's `| raw` output", () => {
  const data = buildTemplateRenderData(minimalContext({ products: [siteProduct()] }));
  const products = data.products as Array<Record<string, unknown>>;
  assert.equal("description" in products[0], false);
});
