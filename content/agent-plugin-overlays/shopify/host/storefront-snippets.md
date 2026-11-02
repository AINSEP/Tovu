# Shop grid and Buy links

Use the existing collection embed. This markup contains no script:

```html
<div class="shop-grid" data-embed-config='{"type":"collection","id":"product","limit":24,"columns":3,"sort":"title","layout":"cards"}'>
  <template>
    <article class="shop-card">
      <img src="{{fields.image_url}}" alt="{{fields.image_alt}}" loading="lazy">
      <h3>{{title}}</h3>
      <p class="shop-card__price">{{fields.price_label}}</p>
      <p class="shop-card__summary">{{fields.summary}}</p>
      <a class="shop-card__buy" href="{{fields.buy_url}}" rel="nofollow">{{fields.buy_label}}</a>
    </article>
  </template>
  <p>Products coming soon.</p>
</div>
```

`id` names the content type, not a DOM id; substitute `shop_product` if that fallback was used.
The renderer escapes text and allows only `https://…` and `#…` links; anything else becomes `#`.

An "only in stock" variant adds `"where":{"available":true}` to the marker configuration.
Empty image URLs are scheme-checked to `#`; for a catalog without photos omit the `<img>` from
its authored template instead of promising placeholder images. The fallback is static and stays
visible when no products resolve; it does not load products asynchronously.

**At most 24 products per marker.** For 25–48, add a second marker with `"sort":"-title"`;
the two selections can overlap, so say that plainly. For larger catalogs, split into disjoint
groups using `where` on declared fields, with each group at most 24. Do not claim the entire
catalog is shown when a group exceeds that limit.

Styling goes in the theme's CSS, using its own tokens and the `ui-ux-design` skill's guidance.
Never use inline `style` from product data. Do not put a live storefront component's nested
`<template>` into this collection template; use the separate theme partial in `live-storefront.md`.

Cart permalink grammar and Shopify restrictions live in the portable
`references/storefront-snippets.md`; read it through `agent_plugin_shopify`.
