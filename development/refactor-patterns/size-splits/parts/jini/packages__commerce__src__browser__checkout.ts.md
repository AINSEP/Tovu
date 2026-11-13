### jini:packages/commerce/src/browser/checkout.ts
- **Over:** `installCommerceCheckout` 117 · its `forEach(form => …)` callback 115
- **Phase:** now (JINI 232) · **Batch:** size-22
- **Tests:** `src/browser/__tests__/checkout.vitest.test.ts`, `src/catalog/__tests__/unit/checkout.unit.test.ts` (package `@jini-ai/commerce`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `installCommerceCheckout` and every nested closure (`CheckoutResponseError`, `showOrder`, `restoreOrder`, `post`, `navigate`, `prepareOrder`, `offerNewOrder`, `paymentRefusal`, `reportError`, `startNewOrder`, `finish`, `buy`) | bind one checkout form |
| B | `COMMERCE_CHECKOUT_SCRIPT` | the external-script payload |

- **Splits:** none.
- **Importers to update:** none.
- **After:** unchanged (117 / 115).
- **Risks / notes:** `COMMERCE_CHECKOUT_SCRIPT` is built from `installCommerceCheckout.toString()` and run in the browser on its own. Any helper lifted to module level (or a sibling file) is missing from that string, so the shipped script would throw `ReferenceError` at runtime, and unit tests that call the function directly would still pass. So everything the function uses has to stay lexically inside it. Nesting a `bindCheckoutForm` inside it doesn't help either, because nested functions count toward the parent.
- **Owner exception candidate:** this is a self-contained, serialized browser script (`fn.toString()` payload), so it can't be split by responsibility without changing how the script is delivered (for example, bundling it as a real asset), and that would be a behavior change. Listing it for the size-exceptions file.
