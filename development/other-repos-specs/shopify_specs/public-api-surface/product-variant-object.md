<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/ProductVariant -->

# ProductVariant Object Schema

## Overview
"A specific version of a product available for sale, differentiated by options like size or color." The schema requires the `unauthenticated_read_product_listings` access scope.

## Complete Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `availableForSale` | Boolean! | Indicates product variant availability for purchase |
| `barcode` | String | Identifier codes (ISBN, UPC, GTIN) associated with the variant |
| `compareAtPrice` | MoneyV2 | Reference pricing used to display sale status when higher than current price |
| `components` | ProductVariantComponentConnection! | Bundle components within the variant (fixed bundles only) |
| `currentlyNotInStock` | Boolean! | Indicates out-of-stock status while remaining available for backorders |
| `groupedBy` | ProductVariantConnection! | Bundles containing this variant (fixed bundles only) |
| `id` | ID! | Globally-unique identifier |
| `image` | Image | Variant-specific image; defaults to product image if unavailable |
| `metafield` | Metafield | Custom field by namespace and key (token access required) |
| `metafields` | [Metafield]! | Collection of custom fields (token access required) |
| `price` | MoneyV2! | Current variant pricing |
| `product` | Product! | Parent product object reference |
| `quantityAvailable` | Int | Total sellable quantity for online channels (token access required) |
| `quantityPriceBreaks` | QuantityPriceBreakConnection! | Volume-based pricing tiers |
| `quantityRule` | QuantityRule! | Minimum, maximum, and increment purchase constraints |
| `requiresComponents` | Boolean! | Indicates if purchase requires bundle components |
| `requiresShipping` | Boolean! | Indicates customer shipping address necessity |
| `selectedOptions` | [SelectedOption!]! | Applied product option selections |
| `sellingPlanAllocations` | SellingPlanAllocationConnection! | Subscription and pre-order associations |
| `shopPayInstallmentsPricing` | ShopPayInstallmentsProductVariantPricing | Installment payment options (token access required) |
| `sku` | String | Stock keeping unit identifier |
| `storeAvailability` | StoreAvailabilityConnection! | In-store pickup availability by location |
| `taxable` | Boolean! | Tax applicability indicator |
| `title` | String! | Variant display name |
| `unitPrice` | MoneyV2 | Per-unit pricing based on measurement |
| `unitPriceMeasurement` | UnitPriceMeasurement | Measurement specification for unit pricing |
| `weight` | Float | Variant weight value |
| `weightUnit` | WeightUnit! | Weight measurement unit system |

## Implemented Interfaces
- HasMetafields
- Node

## Deprecated Fields
- `compareAtPriceV2` (MoneyV2)
- `priceV2` (MoneyV2!)
