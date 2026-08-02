# Schema Analysis — Admin API Full Introspection

## Summary

The Shopify Admin API GraphQL schema contains **3,269 types** dumped from a live dev store (`ai-powered-furniture-sales.myshopify.com`). This is the most structurally complete evidence we have of Shopify's public admin surface. The schema reveals how Shopify organizes its entire commerce platform into domains, how it handles pagination, and what interfaces enforce shared behavior across entities.

## Type Breakdown

| Kind | Count |
|------|-------|
| OBJECT | 1,922 |
| ENUM | 626 |
| INPUT_OBJECT | 600 |
| UNION | 56 |
| INTERFACE | 46 |
| SCALAR | 19 |
| **Total** | **3,269** |

The ratio of INPUT_OBJECT (600) to OBJECT (1,922) shows that roughly one input type exists for every three output types — Shopify has a dedicated input shape for most mutations rather than reusing output types for writes.

## Top-Level Entry Points

### Queries: 268 fields

These are the read entry points on the `QueryRoot` type. Every piece of data a Shopify admin app can read starts here.

### Mutations: 477 fields

Grouped by domain prefix, the mutation landscape reveals where Shopify invests the most write-path complexity:

| Domain prefix | Mutation count |
|---------------|---------------|
| customer* | 29 |
| fulfillment* | 29 |
| product* | 26 |
| order* | 25 |
| discount* | 20+ |
| metafield* / metaobject* | 15+ |
| inventory* | 12+ |
| collection* | 8 |
| app* | 8 |
| webhook* | 6 |

Key observation: fulfillment and customer mutations rival product mutations in count, reflecting Shopify's investment in post-purchase operational complexity. Discount mutations are also heavily represented — discounts are not simple; they compose and resolve through multiple rules.

## Connection Types: 183

Shopify uses the Relay Connection/Edge/PageInfo pattern universally. Every list query returns a Connection type with:

- `edges` → array of Edge types
- `edges[].node` → the actual entity
- `edges[].cursor` → opaque pagination cursor
- `pageInfo` → `hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor`

183 Connection types means there are roughly 183 distinct list-query surfaces in the admin API. This is the pagination pattern Tovu should study — it is the de facto standard for GraphQL APIs at scale.

## Interfaces: 46

Interfaces enforce shared contracts across entity types. The most important ones:

| Interface | What it enforces |
|-----------|-----------------|
| `Node` | Global ID (`id: ID!`) on every addressable entity |
| `HasMetafields` | `metafield(namespace, key)` and `metafields(...)` on any entity that supports custom data |
| `HasEvents` | Event timeline on entities (audit trail) |
| `Publishable` | Publish/unpublish lifecycle for content that appears on channels |
| `Navigable` | URL handle for entities with public-facing paths |
| `Media` | Shared contract for images, videos, 3D models |
| `File` | Shared contract for uploaded files |
| `CommentEventEmbed` | Timeline comment embedding |
| `MetafieldReference` | Entities that can be referenced by metafield values |
| `SellingPlanMemberSelector` | Subscription/selling-plan composition |

### Interface pattern insight

Shopify uses interfaces as **capability markers**, not inheritance hierarchies. An entity either `HasMetafields` or it doesn't. An entity is either `Publishable` or it isn't. This is a composition pattern, not an OOP inheritance tree.

The `Node` interface is universal — every entity has a globally unique ID. This enables Shopify's `node(id:)` query, which can fetch any entity by ID without knowing its type in advance.

## Domain Clusters

Based on type name prefixes and mutation groupings, the schema organizes into these major domains:

1. **Product & Catalog** — Product, ProductVariant, ProductOption, Collection, CollectionRule
2. **Orders & Checkout** — Order, DraftOrder, LineItem, Checkout, Payment
3. **Customer** — Customer, CustomerAddress, CustomerPaymentMethod, CompanyContact
4. **Fulfillment & Shipping** — Fulfillment, FulfillmentOrder, FulfillmentService, DeliveryProfile, ShippingLine
5. **Inventory** — InventoryItem, InventoryLevel, Location
6. **Discounts & Pricing** — DiscountAutomatic, DiscountCode, PriceRule, SellingPlan
7. **Content** — Page, Blog, Article, Metafield, Metaobject, MetafieldDefinition, MetaobjectDefinition
8. **Media & Files** — MediaImage, Video, Model3d, GenericFile, FileCreateInput
9. **Apps & Extensions** — App, AppInstallation, AppSubscription, AppCredit
10. **Online Store** — Theme, ScriptTag, Redirect, UrlRedirect
11. **Markets & Localization** — Market, MarketWebPresence, Translation, Locale
12. **Analytics & Events** — Event, WebhookSubscription

## Key Scalars

Beyond the standard GraphQL scalars, Shopify defines:

- `Money` — decimal monetary value
- `DateTime` — ISO 8601 timestamp
- `URL` — validated URL
- `HTML` — rich text as HTML string
- `JSON` — arbitrary JSON blob
- `Decimal` — precise decimal (for weights, dimensions)
- `UnsignedInt64` — large unsigned integer (for Shopify GIDs)
- `Color` — hex color value
- `FormattedString` — string with formatting metadata

## Tovu Reconstruction Notes

### What Tovu should preserve

- **Node interface pattern**: Every entity should have a globally unique ID. A `node(id:)` resolver that can fetch any entity by ID is extremely powerful for generic tooling, caching, and admin UIs.

- **HasMetafields as a capability interface**: Tovu should define a similar marker (e.g., `HasCustomFields`) that any entity can implement. This avoids hardcoding custom-data support into specific entity types.

- **Connection pagination**: Relay-style cursor pagination is the right choice for any API that may need to page through large datasets. Tovu should adopt this pattern from the start rather than retrofitting it later.

- **Mutation-per-domain grouping**: Shopify's mutation naming (`productCreate`, `productUpdate`, `productDelete`, `productVariantsBulkCreate`) makes the API self-documenting. Tovu's command/mutation layer should follow the same discipline.

- **Dedicated input types**: Separate input types for mutations (not reusing output types) keeps the read and write contracts independent. This is important for validation, permissions, and schema evolution.

### What Tovu can simplify

- **Type count**: 3,269 types reflects a decade of commerce feature accumulation. Tovu's initial schema should be 50-100 types max, growing only as features demand it.

- **Domain breadth**: Tovu does not need fulfillment, shipping, inventory, discount, or payment domains. The CMS core needs: content types, custom fields, media, users/roles, and page composition.

- **477 mutations**: Tovu's initial mutation surface should be ~30-50 mutations covering CRUD for core entities plus publish/unpublish lifecycle.

- **Subscription/selling-plan types**: Commerce-specific complexity that Tovu can ignore entirely.

### Possible Tovu seams

- **`Node` interface + `node(id:)` query** → Implement as a core GraphQL pattern from day one. Enables generic admin UI components that can display any entity.

- **`HasCustomFields` interface** → Tovu's equivalent of `HasMetafields`. Any content type, user, or workspace entity can opt into custom field support.

- **`Publishable` interface** → Tovu needs a publish lifecycle for content. Adopt this as an interface that content types can implement.

- **Connection types** → Generate Connection/Edge types automatically for any list field. Don't hand-write 183 connection types.

- **Domain-prefixed mutations** → Use `contentTypeCreate`, `contentTypeUpdate`, `fieldDefinitionCreate`, etc. as the naming convention.

### Suggested priority

**P0** — Adopt Node, Connection, and capability-interface patterns in Tovu's GraphQL schema design.

**P1** — Design Tovu's custom-field system informed by the HasMetafields + MetafieldDefinition pattern.

**P2** — Use the mutation grouping pattern to structure Tovu's command layer.

**P3** — Study the Publishable interface when implementing Tovu's content lifecycle.
