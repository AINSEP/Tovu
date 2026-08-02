<!-- Source: https://shopify.dev/docs/apps/build/custom-data/metafields -->
# Overview of Shopify Metafields

## Core Definition

Metafields are key-value pairs that extend Shopify's built-in data models by enabling custom data storage on resources like products, customers, and orders. As the documentation explains, they let developers "add custom data to any Shopify resource."

## Essential Components

Each metafield consists of three parts:

1. **Identifier**: A namespace and key combination (e.g., `custom.warranty_info`) that provides organization and establishes ownership
2. **Value**: The actual data being stored
3. **Type**: Defines the data format (text, number, date, reference, etc.) and how it's interpreted

## Metafield Definitions

Before creating metafields, developers must establish metafield definitions—schemas that enable type validation, admin integration, filtering, access control, and performance optimization. Shopify provides pre-built "standard" definitions for common use cases like ISBN numbers and care instructions.

## Ownership Models

**App-owned metafields** use the `$app` namespace and are controlled by the app. They appear as read-only in the Shopify admin by default, though this can be configured.

**Merchant-owned metafields** use non-reserved namespaces like `custom` and can be modified by merchants and all installed apps, making them suitable for shared data.

**App-data metafields** attach to app installations specifically and remain completely hidden from the admin interface.

## Creation Methods

App-owned metafields are defined in `shopify.app.toml` and deployed with the app. Merchant-owned metafields require GraphQL API calls to create both the definition and the values.

## Permissions Configuration

Access settings control who can read and write metafields in both the admin and Storefront API contexts, with options ranging from merchant read-only to merchant read-write access.
