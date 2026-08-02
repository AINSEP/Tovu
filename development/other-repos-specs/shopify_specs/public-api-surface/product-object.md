<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Product -->
# Shopify Storefront API: Product Object Schema

## Core Object Definition

The Product object represents items in a shop's catalog. It requires the `unauthenticated_read_product_listings` access scope and implements four interfaces: HasMetafields, Node, OnlineStorePublishable, and Trackable.

## Primary Fields

**Identification & Metadata:**
- `id` (ID!, non-null) — Globally-unique identifier
- `handle` (String!, non-null) — Human-readable URL slug
- `title` (String!, non-null) — Customer-facing product name
- `productType` (String!, non-null) — Merchant-defined categorization
- `vendor` (String!, non-null) — Product vendor name

**Descriptive Content:**
- `description` (String!, non-null) — Single-line summary without HTML
- `descriptionHtml` (HTML!, non-null) — Description with HTML formatting
- `tags` (String array, non-null) — Searchable keywords

**Temporal Data:**
- `createdAt` (DateTime!, non-null) — Creation timestamp
- `publishedAt` (DateTime!, non-null) — Channel publication timestamp
- `updatedAt` (DateTime!, non-null) — Last modification timestamp

**Availability & Pricing:**
- `availableForSale` (Boolean!, non-null) — Stock availability indicator
- `priceRange` (ProductPriceRange!, non-null) — Min/max pricing
- `compareAtPriceRange` (ProductPriceRange!, non-null) — "Compare-at" pricing

**Product Organization:**
- `category` (TaxonomyCategory, nullable) — Shopify Standard Product Taxonomy classification
- `collections` (CollectionConnection!, non-null) — Associated collections with pagination
- `sellingPlanGroups` (SellingPlanGroupConnection!, non-null) — Subscription options

## Variant & Media Relationships

**Variant Selection:**
- `variants` (ProductVariantConnection!, non-null) — Full variant list with sorting/pagination
- `variantsCount` (Count) — Variant quantity
- `selectedOrFirstAvailableVariant` (ProductVariant, nullable) — Smart variant matching
- `variantBySelectedOptions` (ProductVariant, nullable) — Exact variant lookup
- `adjacentVariants` (ProductVariant array, non-null) — Similar variant suggestions

**Media Assets:**
- `images` (ImageConnection!, non-null) — Product images with sorting
- `featuredImage` (Image, nullable) — Primary product image
- `media` (MediaConnection!, non-null) — Images, videos, and 3D models

**Encoded Variant Data:**
- `encodedVariantAvailability` (String, nullable) — Compressed availability encoding
- `encodedVariantExistence` (String, nullable) — Compressed variant existence encoding

## Custom Data & SEO

- `metafield` (Metafield, nullable) — Single custom field (token access required)
- `metafields` (Metafield array, non-null) — Multiple custom fields (token access required)
- `seo` (SEO!, non-null) — Title and description for search engines

## Additional Properties

- `isGiftCard` (Boolean!, non-null) — Gift card indicator
- `onlineStoreUrl` (URL, nullable) — Published storefront URL
- `requiresSellingPlan` (Boolean!, non-null) — Subscription-only flag
- `totalInventory` (Int, nullable) — Stock quantity (token access required)
- `trackingParameters` (String, nullable) — Analytics URL parameters (search/predictive contexts)

## Query Access Points

Three primary queries retrieve products:
- `product` — Single product by ID or handle
- `products` — Paginated collection with filtering and sorting
- `productRecommendations` — Related/complementary suggestions by intent
