# Product Catalog Module

## 1. Summary of the Subsystem

Medusa's `product` module is the catalog authority, but it is intentionally not the whole merchandising system.

Visible source anchors:

- `packages/modules/product/src/`
- `packages/core/core-flows/src/product/`
- `packages/modules/link-modules/src/definitions/product-*`

The module owns catalog records such as products, variants, options, categories, collections, tags, and images. Pricing, inventory, sales-channel distribution, and shipping-profile assignment are deliberately linked in from elsewhere.

That separation is the important architectural move.

## 2. Key Primitives / Contracts

Visible entrypoints show a compact but rich module surface:

- `packages/modules/product/src/index.ts` registers `ProductModuleService` as the `Modules.PRODUCT` module service.
- `packages/modules/product/src/services/product-module-service.ts` exposes the main service implementation.
- `packages/modules/product/src/joiner-config.ts` declares the module's query and link posture.

The module-owned model family includes:

- `Product`
- `ProductVariant`
- `ProductOption`
- `ProductOptionValue`
- `ProductType`
- `ProductTag`
- `ProductCollection`
- `ProductCategory`
- `ProductImage`
- `ProductVariantProductImage`

The joiner config makes several design choices visible:

- primary keys are `id` and `handle`
- `variant_id` is kept as a linkable key for compatibility
- variant aliases are exposed under names like `variant`, `variants`, and `product_variant`

The service implementation also shows that Medusa is willing to carry module-local assembly logic when needed. For example, variant-image hydration is handled inside product retrieval/listing logic when callers request `variants.images`.

Workflow families in `packages/core/core-flows/src/product/` show the operational surface around this module:

- create, update, delete products
- create, update, delete variants
- create, update, delete collections, tags, types, and options
- batch operations for products, categories, collections, and variant images
- import/export flows and CSV helpers
- variant-price upsert/link flows

Cross-module link definitions show what the product module does not own directly:

- `product-variant-price-set`
- `product-variant-inventory-item`
- `product-sales-channel`
- `product-shipping-profile`
- readonly `product-translation`

## 3. Boundaries and Constraints

The product module is deliberately narrower than a naive "catalog" implementation:

- It owns product structure and merchandising taxonomy.
- It does not own pricing records.
- It does not own inventory records.
- It does not own sales-channel publication.
- It does not own shipping-profile assignment.

Those concerns are attached through explicit links and queried through the broader query graph.

That means Medusa treats "what a product is" separately from:

- how much it costs
- where it can be sold
- what inventory backs it
- how it ships

This is a stronger boundary than a single giant product table with every concern bolted onto it.

## 4. Operational Implications

- Catalog change velocity can stay high without forcing pricing or inventory schemas to churn in lockstep.
- Import/export behavior is treated as workflow-level orchestration, not as ad hoc route logic.
- Variant availability and price resolution become cross-module composition problems, not module-internal fields.
- Product reads can feel unified to callers even though the underlying ownership is split.

The tradeoff is higher coordination cost:

- richer joins require link infrastructure
- write flows often need follow-up linking steps
- reasoning about final product state requires tracing more than one module

## 5. Tovu Reconstruction Notes

### Why this exists

This deep dive matters because a Tovu commerce slice should not let catalog, pricing, inventory, and channel publication collapse into one provider-coupled blob.

### What Tovu should preserve

- a bounded catalog authority
- explicit links from variants to prices and inventory
- workflow-based import/export and batch mutation paths
- stable query aliases for public-facing catalog reads

### What Tovu can simplify

- fewer catalog nouns if Tovu starts with a narrower commerce scope
- fewer batch workflows until import/export is actually needed
- simpler aliasing if Tovu does not need Medusa's compatibility surface

### Possible Tovu seams

- `CatalogModulePort`
- `VariantRelationshipRegistry`
- `CatalogImportExportWorkflowPort`
- `CatalogQuerySurface`

### Suggested priority

- `V1`: preserve catalog ownership and externalized price/inventory links
- `V2`: add batch import/export and richer variant-asset workflows only when operator demand is real
