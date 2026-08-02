<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Cart -->
# Shopify Storefront API Cart Object Schema

## Overview
The Cart object represents merchandise a buyer intends to purchase with associated costs throughout their session. It includes a `checkoutUrl` field directing buyers to Shopify's web checkout.

## Core Fields

**Identity & Metadata:**
- `id` (ID!): Globally-unique identifier
- `createdAt` (DateTime!): Creation timestamp
- `updatedAt` (DateTime!): Last update timestamp
- `note` (String): Personalized message or special instructions

**Buyer Information:**
- `buyerIdentity` (CartBuyerIdentity!): Contact info, location, checkout preferences
- `attributes` ([Attribute!]!): Key-value pairs for custom data
- `attribute` (Attribute): Single attribute retrieval by key

**Merchandise:**
- `lines` (BaseCartLineConnection!): Items buyer intends purchasing (paginated, up to 250 items)
- `totalQuantity` (Int!): Total items in cart

**Pricing & Costs:**
- `cost` (CartCost!): Estimated checkout costs based on buyer identity for international pricing
- `appliedGiftCards` ([AppliedGiftCard!]!): Applied gift cards
- `discountCodes` ([CartDiscountCode!]!): Case-insensitive discount codes applied

**Delivery:**
- `delivery` (CartDelivery!): Delivery properties
- `deliveryGroups` (CartDeliveryGroupConnection!): Available delivery options by address (supports carrier-calculated rates via `@defer`)

**Commerce:**
- `checkoutUrl` (URL!): Checkout completion URL
- `metafield` (Metafield): Single custom field (token access required)
- `metafields` ([Metafield]!): Multiple custom fields (token access required)

## Primary Mutations

- `cartCreate`: Initialize new cart
- `cartLinesAdd/Remove/Update`: Manage merchandise (up to 250 per request)
- `cartAttributesUpdate`: Modify custom attributes
- `cartBuyerIdentityUpdate`: Update buyer information
- `cartDiscountCodesUpdate`: Replace discount codes
- `cartGiftCardCodesAdd/Remove/Update`: Manage gift cards
- `cartNoteUpdate`: Update order notes
- `cartDeliveryAddressesAdd/Remove/Replace/Update`: Manage delivery addresses (20 address limit)
- `cartSelectedDeliveryOptionsUpdate`: Select shipping methods

## Interfaces Implemented
- `HasMetafields`
- `Node`
