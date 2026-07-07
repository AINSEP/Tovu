<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Article -->

# Article Object Schema - Shopify Storefront API

## Overview
The Article object represents "a post that belongs to a Blog" with content, author details, images, and SEO metadata. It requires `unauthenticated_read_content` access scope.

## Complete Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| **authorV2** | ArticleAuthor | The article's author information |
| **blog** | Blog! (non-null) | The blog containing this article |
| **comments** | CommentConnection! (non-null) | Posted comments; supports pagination (first, after, last, before) and reverse ordering |
| **content** | String! (non-null) | "Stripped content of the article, single line with HTML tags removed"; accepts truncateAt argument |
| **contentHtml** | HTML! (non-null) | Complete article content with HTML formatting |
| **excerpt** | String | Plain text preview excerpt; accepts truncateAt argument |
| **excerptHtml** | HTML | Preview excerpt with HTML formatting |
| **handle** | String! (non-null) | "A human-friendly unique string for the Article automatically generated from its title" |
| **id** | ID! (non-null) | Globally-unique identifier |
| **image** | Image | Associated article image |
| **metafield** | Metafield | Custom field by namespace/key (token access required) |
| **metafields** | [Metafield]! (non-null) | Custom fields list; max 250 identifiers (token access required) |
| **onlineStoreUrl** | URL | Shop URL for viewing; null if unpublished |
| **publishedAt** | DateTime! (non-null) | Publication timestamp |
| **seo** | SEO | SEO metadata |
| **tags** | [String!]! (non-null) | Article categorization tags |
| **title** | String! (non-null) | Article name |
| **trackingParameters** | String | Analytics tracking URL parameters |
| **author** | ArticleAuthor! (non-null) | **Deprecated** — Use authorV2 instead |

## Interfaces Implemented
- HasMetafields
- Node
- OnlineStorePublishable
- Trackable

## Query Access
- `article(id: ID!)` — Retrieve single article by ID
- `articles(...)` — Paginated article list with filtering and sorting
