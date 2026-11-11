# Optional live prices, stock and cart

Use Shopify Storefront Web Components only when the owner wants live prices or a cart drawer.
This content-only option uses the existing theme tools; no host changes or new remote server.
It works without a token for product prices, availability, cart and Buy now.

Place this independent snippet in a **theme partial**. Theme files may carry `<script>`; keep
page bodies script-free as an authoring policy. Substitute the validated `myshopify_domain`
and the chosen product's handle; don't paste unchecked fetched text into attributes or scripts.
Use one store and cart per page; product contexts may repeat with different handles.

```html
<script src="https://cdn.shopify.com/storefront/web-components.js"></script>
<shopify-store id="shopify-store" store-domain="https://<myshopify_domain>" country="US" language="en"></shopify-store>
<shopify-context type="product" handle="<product_handle>">
  <template>
    <shopify-money query="product.selectedOrFirstAvailableVariant.price" format="money_with_currency"></shopify-money>
    <button onclick="getElementById('shopify-cart').addLine(event).showModal();" shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale">Add to cart</button>
    <button onclick="getElementById('shopify-store').buyNow(event);" shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale">Buy now</button>
  </template>
</shopify-context>
<shopify-cart id="shopify-cart"></shopify-cart>
```

Never nest `<shopify-context><template>` inside the collection embed's `<template>`.
`splitCollectionMarkerInner` takes the first `</template>`, so nesting breaks the collection.
Keep this snippet outside that marker, in its own theme partial. The normal Phase A collection
grid remains the script-free option; use separate product contexts for live components.

A Storefront **public** token (Headless channel) is needed only for inventory counts and metafields.
It's public by design and sits in page HTML as `public-access-token`. It doesn't go in the vault.
Availability (`availableForSale`) needs no token. Never ask the person for a private key here.

Tovu's public CSP is report-only (`contracts/core/public-page-security-headers.ts`). Shopify's
CDN shows up as a report, not a block. Don't edit core CSP or add vendor-specific rules to it.
Use the domain order in `domains.md`; checkout stays on Shopify.
