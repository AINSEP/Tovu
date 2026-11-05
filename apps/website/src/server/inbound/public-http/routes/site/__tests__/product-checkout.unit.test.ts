import assert from "node:assert/strict";
import test from "node:test";
import { appendProductCheckout } from "../product-checkout.js";

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
