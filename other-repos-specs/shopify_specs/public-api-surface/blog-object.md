<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Blog -->

# Blog Object Schema - Storefront API

## Overview
The Blog object is a GraphQL type in Shopify's Storefront API (v2026-04) that serves as "a container for Article objects" organizing content by topic or purpose.

## Complete Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| **articleByHandle** | Article | Locates a specific article using its handle identifier |
| **articles** | ArticleConnection! | Paginated collection of blog articles with sorting and filtering options |
| **authors** | [ArticleAuthor!]! | Contributors who have written for the blog |
| **handle** | String! | "A human-friendly unique string for the Blog automatically generated from its title" |
| **id** | ID! | Globally-unique identifier |
| **metafield** | Metafield | Individual custom field by namespace and key |
| **metafields** | [Metafield]! | Collection of custom fields (max 250 values per request) |
| **onlineStoreUrl** | URL | Direct link to the blog on the shop's Online Store |
| **seo** | SEO | Search engine optimization metadata |
| **title** | String! | Blog's display name |

## Access & Interfaces
- **Required Scope:** unauthenticated_read_content
- **Implements:** HasMetafields, Node, OnlineStorePublishable

## Primary Queries
- `blog` - Retrieve by handle or ID
- `blogs` - Paginated list of all shop blogs
