# Shopify Specs — Corpus Index

## Navigational docs

- [README.md](README.md) — what this is, why it matters to Tovu, what to keep, what not to copy
- [coverage-audit.md](coverage-audit.md) — what's covered, partial, missing, archival
- [TODO.md](TODO.md) — operational next steps
- [index.md](index.md) — this file

## Tovu interpretation (synthesized analysis with Reconstruction Notes)

- [tovu-interpretation/commerce-primitives.md](tovu-interpretation/commerce-primitives.md) — Product, Variant, Collection, Page, Blog, Article, Cart, Order, Customer, Image, Metafield, Metaobject
- [tovu-interpretation/custom-data-model.md](tovu-interpretation/custom-data-model.md) — Metafields + Metaobjects: how Shopify extends entities with arbitrary typed data
- [tovu-interpretation/merchant-editing-model.md](tovu-interpretation/merchant-editing-model.md) — Templates > Sections > Blocks: how non-developers compose pages
- [tovu-interpretation/two-api-pattern.md](tovu-interpretation/two-api-pattern.md) — Storefront API (public read) vs Admin API (authenticated write)
- [tovu-interpretation/extensibility-boundaries.md](tovu-interpretation/extensibility-boundaries.md) — App extensions, App Bridge, Functions, remote rendering
- [tovu-interpretation/webhooks-and-events.md](tovu-interpretation/webhooks-and-events.md) — 150+ webhook topics organized by domain
- [tovu-interpretation/schema-analysis.md](tovu-interpretation/schema-analysis.md) — 3,269-type Admin API schema: type breakdown, domain clusters, interfaces, Relay pagination

## Raw evidence — public-api-surface/

28 markdown files extracted from shopify.dev. Each has a source URL comment at the top.

**API overviews:**
- [storefront-api-overview.md](public-api-surface/storefront-api-overview.md)
- [admin-api-overview.md](public-api-surface/admin-api-overview.md)

**Object schemas (Storefront API):**
- [product-object.md](public-api-surface/product-object.md)
- [product-variant-object.md](public-api-surface/product-variant-object.md)
- [collection-object.md](public-api-surface/collection-object.md)
- [cart-object.md](public-api-surface/cart-object.md)
- [order-object.md](public-api-surface/order-object.md)
- [customer-object.md](public-api-surface/customer-object.md)
- [page-object.md](public-api-surface/page-object.md)
- [blog-object.md](public-api-surface/blog-object.md)
- [article-object.md](public-api-surface/article-object.md)
- [image-object.md](public-api-surface/image-object.md)
- [metafield-object.md](public-api-surface/metafield-object.md)

**Custom data:**
- [metafields.md](public-api-surface/metafields.md)
- [metaobjects.md](public-api-surface/metaobjects.md)

**Theme architecture:**
- [theme-architecture.md](public-api-surface/theme-architecture.md)
- [json-templates.md](public-api-surface/json-templates.md)
- [sections.md](public-api-surface/sections.md)
- [blocks.md](public-api-surface/blocks.md)
- [liquid-overview.md](public-api-surface/liquid-overview.md)

**Extensibility:**
- [app-extensions.md](public-api-surface/app-extensions.md)
- [app-extension-types.md](public-api-surface/app-extension-types.md)
- [app-bridge.md](public-api-surface/app-bridge.md)
- [shopify-functions.md](public-api-surface/shopify-functions.md)
- [remote-rendering.md](public-api-surface/remote-rendering.md)

**Platform:**
- [webhook-topics.md](public-api-surface/webhook-topics.md)
- [hydrogen.md](public-api-surface/hydrogen.md)
- [polaris-design-system.md](public-api-surface/polaris-design-system.md)

## Raw evidence — schema-dumps/

- [admin-api-full-schema.json](schema-dumps/admin-api-full-schema.json) — 7.7MB, 3,269 types. Full Admin API GraphQL introspection from live dev store.

## Raw evidence — sample-responses/

- [products.json](sample-responses/products.json) — 4 products with variants, metafields, collections
- [collections.json](sample-responses/collections.json) — 2 collections with nested products
- [pages-and-blogs.json](sample-responses/pages-and-blogs.json) — 2 pages, 1 blog
- [shop-themes-locations-metadefs.json](sample-responses/shop-themes-locations-metadefs.json) — shop config, theme, location
