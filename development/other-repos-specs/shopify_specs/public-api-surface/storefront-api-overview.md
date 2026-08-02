<!-- Source: https://shopify.dev/docs/api/storefront -->
# Storefront API Overview

## Core Purpose

The Storefront API enables developers to build custom shopping experiences across web, mobile apps, and games. It provides "commerce primitives to build custom, scalable, and performant shopping experiences" through GraphQL queries.

## Primary Capabilities

The API supports:
- Product and collection browsing with filtering
- Shopping cart management (read/write)
- Checkout functionality
- Product search
- Pages, blogs, and articles access
- Selling plans
- Customer data (with authentication)
- Product tags, metaobjects, and metafields
- Online Store navigation menus

## Authentication Models

**Tokenless Access** supports essential features like products, collections, and carts without credentials, but has a 1,000 query complexity limit.

**Token-Based Access** provides two approaches:
- Public access tokens for browser and mobile app queries
- Private access tokens for server-side requests and Hydrogen backends

Token authentication unlocks product tags, metaobjects, customer data, and menu access.

## Rate Limiting

The API applies "no rate limits on the number of requests," scaling to handle traffic surges. However, tokenless requests face a 1,000 complexity threshold. Security protections flag suspicious patterns with a "430 Shopify Security Rejection" response.

## Key Resource Types

- **Products & Collections** - Browse and filter merchandise
- **Carts** - Manage buyer shopping carts
- **Customers** - Access customer information (requires authentication)
- **Metafields/Metaobjects** - Store custom data
- **Search** - Query products and content

All queries route through a single GraphQL endpoint: `https://{store_name}.myshopify.com/api/2026-04/graphql.json`
