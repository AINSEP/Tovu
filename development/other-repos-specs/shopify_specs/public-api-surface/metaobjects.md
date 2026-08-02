<!-- Source: https://shopify.dev/docs/apps/build/custom-data/metaobjects -->
# Shopify Metaobjects: Comprehensive Technical Overview

## Core Concept

Metaobjects are structured data entities with multiple interconnected fields, distinct from metafields which add individual custom fields to existing resources. As stated in the documentation, "metaobjects are standalone entities that can be referenced from multiple resources."

## Key Differences from Metafields

| Aspect | Metafields | Metaobjects |
|--------|-----------|------------|
| Purpose | Single custom fields on existing Shopify resources | Complex data structures with multiple related fields |
| Structure | Individual values | Comprehensive, reusable entities |
| Reusability | Attached to one resource | Referenced across multiple resources |

## Metaobject Components

Each instance contains:
- **ID**: Shopify-assigned unique identifier
- **Handle**: URL-friendly identifier (auto-generated or custom)
- **Display name**: Human-readable label (auto-generated from specified field)
- **Field values**: Data adhering to the metaobject definition
- **Capability states**: Optional features like publish/unpublish status

## Metaobject Definitions

Definitions function as schemas establishing:
- Type identifier (e.g., `$app:author` or `size_chart`)
- Field specifications with data types and validation rules
- Access permissions for Shopify admin and storefront
- Optional capabilities and display configuration

The relationship follows: "one definition can have many metaobject instances."

## Ownership Models

**App-owned metaobjects** use the reserved `$app` (GraphQL) or `app` (TOML) prefix and are managed entirely by the application. Configuration occurs via `shopify.app.toml`.

**Merchant-owned metaobjects** use non-reserved prefixes (like `custom`) and are manageable in the Shopify admin across all installed apps. Creation requires GraphQL API exclusively.

**Shopify-reserved** definitions are platform-standard structures controlled by Shopify, though merchants typically manage entries.

## Configuration Approaches

### App-owned via TOML
Define metaobject structures in `shopify.app.toml`:

```toml
[metaobjects.app.author]
name = "Author"
access.admin = "merchant_read_write"
access.storefront = "public_read"

[metaobjects.app.author.fields.full_name]
name = "Full Name"
type = "single_line_text_field"
```

Deploy with `shopify app deploy`.

### Merchant-owned via GraphQL
Create definitions using GraphQL mutations to establish the schema structure with field definitions and access parameters.

## Practical Use Cases

- Product size charts with multiple measurements
- Author profiles with biographical details and contact information
- Ingredient lists incorporating nutritional data
- Warranty information with terms and conditions documentation

## Access Control

**Admin access** (Shopify admin and GraphQL Admin API):
- `merchant_read`: View-only access
- `merchant_read_write`: Full read/write permissions

**Storefront access** (Storefront API for headless implementations):
- `none`: Not accessible (default)
- `public_read`: Available via Storefront API

Merchant-owned metaobjects maintain full access across all apps with appropriate scopes.

## Functions Integration

App-owned metaobjects (using `$app` prefix) integrate with Shopify Functions through input queries across discount, cart transform, delivery customization, and fulfillment constraint function types. Each metaobject query costs 1 complexity point, while field queries cost 3 points each, with a 30-point total input query budget.

## GraphQL Operations

**Creation workflow** requires mutation calls to `metaobjectCreate` with type identifier and field key-value pairs. **Merchant-owned definitions** require `metaobjectDefinitionCreate` mutations specifying field definitions, access settings, and validation rules.
