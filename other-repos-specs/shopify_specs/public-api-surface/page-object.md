<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Page -->

# Page Object Schema - Storefront API

## Overview
The Page object represents custom content pages on a merchant's store, such as "About Us" or policy pages. It requires the `unauthenticated_read_content` access scope.

## Complete Field Definitions

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `body` | HTML | Non-null | "The description of the page, complete with HTML formatting" |
| `bodySummary` | String | Non-null | "Summary of the page body" |
| `createdAt` | DateTime | Non-null | "The timestamp of the page creation" |
| `handle` | String | Non-null | "A human-friendly unique string for the page automatically generated from its title" |
| `id` | ID | Non-null | "A globally-unique ID" |
| `metafield` | Metafield | Nullable | Custom field with namespace/key arguments (token access required) |
| `metafields` | [Metafield]! | Non-null | List of custom fields with identifiers argument, max 250 values (token access required) |
| `onlineStoreUrl` | URL | Nullable | URL for viewing on Online Store; null if unpublished |
| `seo` | SEO | Nullable | "The page's SEO information" |
| `title` | String | Non-null | "The title of the page" |
| `trackingParameters` | String | Nullable | URL parameters for analytics; returns value via search queries only |
| `updatedAt` | DateTime | Non-null | "The timestamp of the latest page update" |

## Implemented Interfaces
- HasMetafields
- Node
- OnlineStorePublishable
- Trackable

## Primary Queries
- `page` – retrieve by handle or ID
- `pages` – paginated list with sorting and filtering
- `pageByHandle` – deprecated query
