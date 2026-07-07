<!-- Source: https://shopify.dev/docs/api/admin-graphql -->
# Shopify GraphQL Admin API Overview

## Purpose
The Admin API enables developers to create applications and integrations that extend the Shopify admin interface. It provides programmatic access to shop data and operations through GraphQL queries and mutations.

## Authentication
All requests require a valid Shopify access token. The token should be included as an `X-Shopify-Access-Token` header. Access tokens are generated through OAuth for public and custom apps, or created directly in the Shopify admin for custom apps. Developers must request specific access scopes during installation based on their app's needs.

## Endpoint
Requests are sent as POST requests to:
`https://{store_name}.myshopify.com/admin/api/2026-04/graphql.json`

## Client Libraries
Shopify provides official libraries for:
- **React Router**: For React Router applications
- **Node.js**: Framework-agnostic Node.js support
- **Ruby**: Official Ruby gem for Shopify API
- **cURL**: Direct command-line access
- **Direct API Access**: Browser-native fetch API with automatic authentication

## Available Resources
The documentation references the following business domains and object types:

**Core Commerce**: Products and collections, Orders, Customers, Inventory, Cart, Checkout

**Advanced Features**: Discounts and marketing, B2B, Retail, Shopify Payments, Shipping and fulfillment

**Configuration**: Metafields, Metaobjects, Store properties, Localizations, Shopify Markets, Checkout branding, Online store

**Administrative**: Analytics, Apps, Events, Webhooks, Privacy, Access controls, Billing

## Rate Limits
The documentation confirms rate limiting exists but specifics are referenced in a separate section not detailed in the provided content.
