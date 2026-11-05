import assert from "node:assert/strict";
import test from "node:test";
import { appendProductCheckout, productCheckoutWhenReady } from "../product-checkout.js";

test("purchase markup uses trusted workspace scope and exact escaped price, an external script, and accessible status", () => {
  const html = appendProductCheckout({ html: "<html><body><main>Product</main></body></html>", workspaceId: "site/foreign", priceId: 'price"><script>bad</script>' });
  assert.match(html, /data-orders-url="\/api\/commerce\/v1\/workspaces\/site%2Fforeign\/orders"/);
  assert.match(html, /data-price-id="price&quot;&gt;&lt;script&gt;bad&lt;\/script&gt;"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<script src="\/commerce\/checkout.js" defer><\/script><\/main>/);
  assert.doesNotMatch(html, /<script>bad|onclick=|window\./);
});
test("checkout markup fits theme layouts without a main element and fragment renders", () => {
  for (const source of ["<body>Product</body>", "Product"]) {
    const html = appendProductCheckout({ html: source, workspaceId: "site", priceId: "price" }, {});
    assert.match(html, /Buy now/); assert.equal((html.match(/data-commerce-checkout/g) ?? []).length, 1);
  }
});

test("the host only displays purchase controls for an active, ready commerce plugin and exact price", async () => {
  for (const status of [{ active: false, ready: false }, { active: false, ready: true }, { active: true, ready: false }]) {
    assert.equal(await productCheckoutWhenReady({ html: "Product", workspaceId: "site", productSlug: "book", currentOrigin: "https://shop.test", priceId: "price", commerce: { checkoutOrigin: async () => "https://shop.test", status: async () => status } }), "Product");
  }
  const html = await productCheckoutWhenReady({ html: "Product", workspaceId: "site", productSlug: "book", currentOrigin: "https://shop.test", priceId: "price", commerce: { checkoutOrigin: async () => "https://shop.test", status: async () => ({ active: true, ready: true }) } });
  assert.match(html, /Buy now/);
  let reads = 0;
  assert.equal(await productCheckoutWhenReady({ html: "Product", workspaceId: "site", productSlug: "book", currentOrigin: "https://shop.test", priceId: undefined, commerce: { checkoutOrigin: async () => "https://shop.test", status: async () => { reads++; return { active: true, ready: true }; } } }), "Product");
  assert.equal(reads, 0);
  assert.equal(await productCheckoutWhenReady({ html: "Product", workspaceId: "site", productSlug: "book", currentOrigin: "https://shop.test", priceId: "price", commerce: undefined }, {}), "Product");
});

test("desktop management links to the deployed shop and never includes a local purchase form", async () => {
  const html = await productCheckoutWhenReady({ html: "Product", workspaceId: "site", productSlug: "book/one", currentOrigin: "http://localhost:3000", priceId: "price", commerce: { status: async () => ({ active: true, ready: true }), checkoutOrigin: async () => "https://shop.test" } });
  assert.match(html, /href="https:\/\/shop.test\/products\/book%2Fone"/);
  assert.match(html, /Open shop to buy/); assert.doesNotMatch(html, /data-commerce-checkout|checkout.js|Buy now/);
});
test("invalid or unavailable configured shop origins never produce payment controls or unsafe links", async () => {
  for (const origin of [null, "http://shop.test", "javascript:alert(1)", "https://user:secret@shop.test", "https://shop.test/path"]) {
    assert.equal(await productCheckoutWhenReady({ html: "Product", workspaceId: "site", productSlug: "book", currentOrigin: "http://localhost", priceId: "price", commerce: { status: async () => ({ active: true, ready: true }), checkoutOrigin: async () => origin } }), "Product");
  }
});
