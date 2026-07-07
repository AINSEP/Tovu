# shopify_specs

Reverse-engineered research specs from Shopify’s public developer surface.

Shopify is proprietary. We are not inspecting its private core implementation, internal service topology, or internal multi-tenant operational code. What we can study safely and usefully is the public system design exposed through:

- official docs
- public APIs
- dev stores
- Shopify CLI
- themes and app-extension models
- Hydrogen/Oxygen
- public engineering posts

That is enough to learn a lot about how Shopify thinks about commerce, merchant editing, and safe extensibility.

## Why This Matters To Tovu

Shopify is not a CMS in the WordPress sense, but it is highly relevant to Tovu because it is one of the strongest public references for:

- commerce primitives and relationships
- merchant-safe customization
- hosted extension boundaries
- public storefront vs privileged admin separation
- platform-controlled UI extensibility
- secure execution of partner logic

## What Tovu May Want To Keep

- the two-surface model:
  - public storefront/read contracts
  - privileged admin/write contracts
- structured custom data via metafields and metaobjects
- merchant-editable composition through JSON templates, sections, and blocks
- strong extension boundaries instead of arbitrary host DOM access
- remote-rendered or sandboxed UI/plugin surfaces
- CLI-driven developer workflow against a dev environment

## What Tovu Should Not Copy Blindly

- private/internal implementation assumptions we cannot verify
- Shopify’s exact resource graph or pricing-plan gates
- commerce-specific constraints that only make sense for a hosted retail platform
- every extension type or compliance workflow just because Shopify has it

The right use is: extract the boundary design and product lessons, then translate them into Tovu’s own modular architecture.

## How We Got the Data

### Prerequisites

- Node.js installed
- Shopify CLI: `npm install -g @shopify/cli@latest`
- A Shopify dev store (created free via Shopify Partners dashboard)

### Dev store

Store: `ai-powered-furniture-sales.myshopify.com`

### Authentication

```bash
shopify store auth \
  --store ai-powered-furniture-sales.myshopify.com \
  --scopes read_products,write_products,read_orders,read_customers,read_content,write_content,read_themes,read_metaobjects,write_metaobjects,read_inventory,read_fulfillments,read_shipping,read_locations
```

This opens the browser for OAuth. Once authenticated, you can run queries against the store.

### Schema introspection (schema-dumps/)

Full Admin API GraphQL introspection query run via:

```bash
shopify store execute \
  --store ai-powered-furniture-sales.myshopify.com \
  --json \
  --query '__full_introspection_query__'
```

The actual introspection query is the standard `__schema { types { ... } }` query. Output saved to `schema-dumps/admin-api-full-schema.json` (7.7MB, 3,269 types).

### Sample data creation

Products, collections, pages, and blogs were created via mutations through the CLI:

```bash
# Example: create a product
shopify store execute \
  --store ai-powered-furniture-sales.myshopify.com \
  --allow-mutations \
  --json \
  --query 'mutation { productCreate(product: { title: "Modern Oak Desk", ... }) { product { id } } }'
```

Key mutations used:
- `productCreate` — create products
- `productOptionsCreate` — add options (must be done before variants)
- `productVariantsBulkCreate` — add variants with prices
- `collectionCreate` + `collectionAddProductsV2` — create collections and link products
- `pageCreate` — create pages
- `blogCreate` — create blogs
- `metafieldsSet` — attach metafields to products

Note: `--allow-mutations` flag is required for any write operations.

### Sample response capture (sample-responses/)

Read queries run after data creation:

```bash
# Products with variants, metafields, and collections
shopify store execute \
  --store ai-powered-furniture-sales.myshopify.com \
  --json \
  --query '{ products(first: 10) { edges { node { title variants(first: 5) { edges { node { title price } } } metafields(first: 5) { edges { node { namespace key value } } } } } } }'
```

### Public docs (public-api-surface/)

Fetched programmatically from `shopify.dev` URLs. Each markdown file has a source URL comment at the top. Some required retries due to redirects (e.g., `polaris.shopify.com` → `polaris-react.shopify.com`).

### Gotchas

- `shopify store auth` requires explicit `--scopes` — there's no default
- Mutations are disabled by default; must pass `--allow-mutations`
- Product options must exist before variants can reference them
- `productVariantUpdate` is deprecated; use `productVariantsBulkUpdate`
- Customer/article creation may need additional scopes not in our initial auth
- The `--store` flag is required on every `shopify store execute` call

## Current Contents

### public-api-surface

`28` markdown extracts from Shopify’s official docs, covering major public surfaces such as:

- Admin API
- Storefront API
- products, variants, collections, carts, customers, orders
- metafields and metaobjects
- themes, JSON templates, sections, blocks, Liquid
- app extensions, App Bridge, Shopify Functions
- Hydrogen
- remote rendering
- Polaris and webhooks

### schema-dumps

`1` full Admin API GraphQL schema introspection dump from a live dev store.

This is the closest thing we have to a structural ground truth for Shopify’s public admin surface.

### sample-responses

`4` saved sample responses from a dev store, showing real API shapes for:

- products
- collections
- pages and blogs
- shop/themes/locations/metadefs

### TODO.md

Operational next steps for expanding the corpus with more live-store captures.

## Suggested Reading Order

1. `public-api-surface/admin-api-overview.md`
2. `public-api-surface/storefront-api-overview.md`
3. `public-api-surface/product-object.md`
4. `public-api-surface/product-variant-object.md`
5. `public-api-surface/collection-object.md`
6. `public-api-surface/metafields.md`
7. `public-api-surface/metaobjects.md`
8. `public-api-surface/theme-architecture.md`
9. `public-api-surface/json-templates.md`
10. `public-api-surface/sections.md`
11. `public-api-surface/blocks.md`
12. `public-api-surface/app-extensions.md`
13. `public-api-surface/shopify-functions.md`
14. `public-api-surface/hydrogen.md`
15. `public-api-surface/remote-rendering.md`

Then validate assumptions against:

- `schema-dumps/admin-api-full-schema.json`
- `sample-responses/`

## Official Source Map

These are the main official surfaces worth studying first:

- Shopify Dev Docs:
  - https://shopify.dev/docs
- Admin GraphQL API:
  - https://shopify.dev/docs/api/admin-graphql
- Themes / JSON templates / blocks:
  - https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates
  - https://shopify.dev/docs/storefronts/themes/architecture/blocks
- App extensions:
  - https://shopify.dev/docs/apps/build/app-extensions
- Checkout UI extensions:
  - https://shopify.dev/docs/api/checkout-ui-extensions/latest
- Metafields and metaobjects:
  - https://shopify.dev/docs/apps/build/custom-data/metafields
  - https://shopify.dev/docs/apps/build/metaobjects
  - https://shopify.dev/docs/apps/build/metaobjects/data-modeling-with-metafields-and-metaobjects
- Shopify Functions:
  - https://shopify.dev/docs/apps/build/functions
  - https://shopify.dev/docs/apps/build/functions/programming-languages/webassembly-for-functions
- Hydrogen / Oxygen:
  - https://shopify.dev/docs/storefronts/headless/hydrogen/fundamentals
  - https://shopify.dev/docs/storefronts/headless/hydrogen/storefronts
- Dev stores and CLI:
  - https://shopify.dev/docs/apps/build/dev-dashboard/stores/development-stores
  - https://shopify.dev/docs/api/shopify-cli
- Engineering philosophy:
  - https://shopify.engineering/blogs/engineering/remote-rendering-ui-extensibility

## Recommended Decomposition Order

For Tovu, decompose Shopify in this order:

1. Commerce primitives
   - product
   - variant
   - collection
   - cart
   - customer
   - order

2. Custom data model
   - metafields
   - metaobjects
   - definitions and references

3. Merchant editing model
   - theme architecture
   - JSON templates
   - sections
   - blocks

4. Extensibility boundaries
   - app extensions
   - checkout UI extensions
   - App Bridge
   - remote rendering

5. Hosted logic surfaces
   - Shopify Functions
   - Wasm constraints

6. Headless/runtime tooling
   - Storefront API
   - Hydrogen
   - Oxygen
   - CLI / dev store workflow

## Tovu Translation Rules

Use Shopify as evidence for:

- where a merchant should be allowed to customize
- where an app should be allowed to extend
- where the host platform should refuse arbitrary power

Do not use Shopify as evidence that Tovu must reproduce:

- Shopify’s exact commerce model
- Shopify’s exact UI stack
- Shopify’s exact hosted platform assumptions

The right question is:

- “What strong platform boundary is Shopify protecting here, and does Tovu need an equivalent?”
