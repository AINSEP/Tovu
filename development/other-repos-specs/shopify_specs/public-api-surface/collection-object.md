<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Collection -->
# Collection Object Schema - Shopify Storefront API

## Overview
The Collection object represents "a group of products organized by a merchant to make their store easier to browse." It requires the `unauthenticated_read_product_listings` access scope.

## Complete Field Definitions

| Field | Type | Nullability | Description |
|-------|------|-------------|-------------|
| **description** | String | Non-null | "Stripped description of the collection, single line with HTML tags removed." Accepts optional `truncateAt` argument. |
| **descriptionHtml** | HTML | Non-null | "The description of the collection, complete with HTML formatting." |
| **handle** | String | Non-null | "A human-friendly unique string for the collection automatically generated from its title. Limit of 255 characters." |
| **id** | ID | Non-null | "A globally-unique ID." |
| **image** | Image | Nullable | Image associated with the collection. |
| **metafield** | Metafield | Nullable | Single custom field lookup by namespace and key (token access required). |
| **metafields** | [Metafield]! | Non-null | "A list of custom fields that a merchant associates with a Shopify resource." Max 250 values (token access required). |
| **onlineStoreUrl** | URL | Nullable | Shop's Online Store viewing URL; returns null if unpublished. |
| **products** | ProductConnection! | Non-null | List of products with pagination and filtering arguments (first, after, last, before, reverse, sortKey, filters). |
| **seo** | SEO | Non-null | "The collection's SEO information." |
| **title** | String | Non-null | "The collection's name. Limit of 255 characters." |
| **trackingParameters** | String | Nullable | "URL parameters to be added to a page URL to track the origin of on-site search traffic for analytics reporting." |
| **updatedAt** | DateTime | Non-null | "The date and time when the collection was last modified." |

## Implemented Interfaces
- HasMetafields
- Node
- OnlineStorePublishable
- Trackable

## Primary Queries
- `collection(id, handle)` - Single collection retrieval
- `collections(first, after, last, before, reverse, sortKey, query)` - Paginated collections list
