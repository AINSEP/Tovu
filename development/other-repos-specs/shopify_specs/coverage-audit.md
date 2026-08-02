# Shopify Specs — Coverage Audit

Last updated: 2026-04-19

## Covered

| Surface | Evidence | Interpretation |
|---------|----------|---------------|
| Admin API overview | `public-api-surface/admin-api-overview.md` | `commerce-primitives.md` |
| Storefront API overview | `public-api-surface/storefront-api-overview.md` | `two-api-pattern.md` |
| Product object | `public-api-surface/product-object.md`, schema dump, sample response | `commerce-primitives.md` |
| ProductVariant object | `public-api-surface/product-variant-object.md`, schema dump | `commerce-primitives.md` |
| Collection object | `public-api-surface/collection-object.md`, schema dump, sample response | `commerce-primitives.md` |
| Cart object | `public-api-surface/cart-object.md` | `commerce-primitives.md` |
| Order object | `public-api-surface/order-object.md` | `commerce-primitives.md` |
| Customer object | `public-api-surface/customer-object.md` | `commerce-primitives.md` |
| Page object | `public-api-surface/page-object.md`, sample response | `commerce-primitives.md` |
| Blog / Article objects | `public-api-surface/blog-object.md`, `article-object.md`, sample response | `commerce-primitives.md` |
| Image object | `public-api-surface/image-object.md` | `commerce-primitives.md` |
| Metafield object + docs | `public-api-surface/metafield-object.md`, `metafields.md` | `custom-data-model.md` |
| Metaobjects docs | `public-api-surface/metaobjects.md` | `custom-data-model.md` |
| Theme architecture | `public-api-surface/theme-architecture.md` | `merchant-editing-model.md` |
| JSON templates | `public-api-surface/json-templates.md` | `merchant-editing-model.md` |
| Sections | `public-api-surface/sections.md` | `merchant-editing-model.md` |
| Blocks | `public-api-surface/blocks.md` | `merchant-editing-model.md` |
| App extensions overview | `public-api-surface/app-extensions.md` | `extensibility-boundaries.md` |
| App extension types list | `public-api-surface/app-extension-types.md` | `extensibility-boundaries.md` |
| App Bridge | `public-api-surface/app-bridge.md` | `extensibility-boundaries.md` |
| Shopify Functions | `public-api-surface/shopify-functions.md` | `extensibility-boundaries.md` |
| Remote rendering | `public-api-surface/remote-rendering.md` | `extensibility-boundaries.md` |
| Webhook topics | `public-api-surface/webhook-topics.md` | `webhooks-and-events.md` |
| Liquid overview | `public-api-surface/liquid-overview.md` | `merchant-editing-model.md` |
| Hydrogen | `public-api-surface/hydrogen.md` | — |
| Polaris | `public-api-surface/polaris-design-system.md` | — |
| Full Admin API schema | `schema-dumps/admin-api-full-schema.json` | `tovu-interpretation/schema-analysis.md` |

## Partial

| Surface | What we have | What's missing |
|---------|-------------|----------------|
| Storefront API schema | Docs only | Full schema introspection (need storefront access token) |
| Liquid objects/filters/tags | Overview only | Full object reference, filter list, tag list |
| Hydrogen architecture | Getting-started level | Deep routing, data loading, caching patterns |
| Polaris components | Overview only | Component catalog, design tokens, patterns |
| Admin UI screenshots | None | Merchant-facing UI for products, pages, theme editor |

## Not started

| Surface | Why it matters |
|---------|---------------|
| Checkout UI extensions | How Shopify sandboxes third-party UI in the most sensitive flow |
| Discount / pricing model | How discounts compose and resolve |
| Fulfillment model | How orders move through fulfillment states |
| Markets / localization | Multi-region, multi-currency, multi-language |
| Customer accounts API | New customer account extensibility |
| Shopify Flow | Automation / workflow engine |

## Archival / low priority for Tovu

| Surface | Why deprioritized |
|---------|------------------|
| POS extensions | Point-of-sale is not relevant to a CMS |
| B2B features | Enterprise commerce features, too specific |
| Shopify Payments internals | Payment processing details not relevant |
| Subscription billing | Commerce-specific recurring billing |
