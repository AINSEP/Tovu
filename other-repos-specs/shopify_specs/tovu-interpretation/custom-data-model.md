# Shopify Custom Data Model

## Summary

Shopify's custom data system has two layers: **metafields** (key-value pairs attached to existing entities) and **metaobjects** (standalone structured entities). Together they let merchants and apps extend the data model without schema migrations.

## Metafields

### How they work
A metafield is a typed key-value pair attached to any resource (Product, Collection, Customer, Page, etc). It's identified by `namespace` + `key` and stores a typed `value`.

### Structure
- **namespace**: groups related metafields (e.g., `custom`, `$app:my-app`)
- **key**: unique within namespace (e.g., `material`, `warranty_years`)
- **value**: always stored as a string, interpreted by `type`
- **type**: data format — `single_line_text_field`, `number_integer`, `boolean`, `multi_line_text_field`, `date`, `url`, `color`, `json`, `list.*`, `file_reference`, `product_reference`, etc.

### Ownership models
- **App-owned** (`$app` namespace): controlled by the app, read-only in admin by default.
- **Merchant-owned** (`custom` or any non-reserved namespace): editable by merchants and all apps.
- **App-data**: attached to app installations, completely hidden from admin.

### Definitions
Before creating metafields, you define a **metafield definition** — a schema that enables type validation, admin UI integration, filtering, and access control. Shopify provides pre-built "standard" definitions for common cases (ISBN, care instructions, etc).

### Access control
- Admin access: `merchant_read` or `merchant_read_write`
- Storefront access: available or not available via Storefront API

## Metaobjects

### How they differ from metafields
Metafields attach data **to** an existing entity. Metaobjects **are** standalone entities with their own ID, handle, and multiple fields. They can be referenced from multiple resources.

### Structure
- **Type identifier**: e.g., `$app:author` or `size_chart`
- **Fields**: multiple typed fields with validation rules
- **Handle**: URL-friendly identifier
- **Display name**: auto-generated from a specified field
- **Capabilities**: optional features like publish/unpublish

### Use cases
- Author profiles (multiple fields: name, bio, photo, social links)
- Size charts (rows of measurements)
- Ingredient lists with nutritional data
- Any "custom content type" that doesn't fit into Product/Page/Article

### Configuration
App-owned metaobjects are defined in `shopify.app.toml`. Merchant-owned require GraphQL mutations.

## Boundaries and Constraints

- Metafield values are always stored as strings regardless of type.
- Max 250 metafield identifiers per query.
- Metafield definitions are required for type validation and admin integration.
- App-owned metafields/metaobjects use reserved `$app` namespace — other apps can't modify them.
- Metaobjects can reference other metaobjects and resources via reference fields.
- Functions integration: metaobject queries cost complexity points (1 per object, 3 per field, 30 total budget).

## Tovu Reconstruction Notes

### Why this exists
Shopify can't anticipate every merchant's data needs. Metafields let anyone add typed data to any entity without Shopify changing its schema. Metaobjects let anyone create entirely new entity types. This is the primary extensibility mechanism for the data layer.

### What Tovu should preserve
- **Typed custom fields on any entity**: the core pattern. Every Tovu entity (Post, Workspace, future Collection) should support arbitrary typed metadata.
- **Namespace + key identification**: prevents collisions between different apps/plugins.
- **Ownership model**: distinguish between platform-defined, app-defined, and user-defined custom data.
- **Definitions as schemas**: validate types, drive admin UI, control access — don't just store raw JSON blobs.
- **Metaobjects as user-defined content types**: this is how Shopify solves "I need a content type that doesn't exist yet" without code changes.

### What Tovu can simplify
- Tovu doesn't need the `$app` namespace convention initially — that's for a marketplace with thousands of apps. Start with `custom` (user-defined) and `system` (platform-defined).
- Tovu can store metafield values in their native types (not always-string) if using a flexible store like JSON columns or a document DB.
- The Functions complexity budget doesn't apply — Tovu isn't running untrusted Wasm.

### Possible Tovu seams
- `src/features/custom-data/metafield.ts` — typed key-value pairs attachable to any entity via a `parentResource` reference.
- `src/features/custom-data/metaobject.ts` — user-defined structured entities with field definitions.
- `src/features/custom-data/definition.ts` — schemas that drive validation and admin UI rendering.
- A `HasMetafields` interface on the port level (like Shopify's GraphQL interface) so all entities share the same custom data API.

### Suggested priority
High — this is the most directly actionable Shopify pattern for Tovu. The current Post model has no custom fields. Adding metafield support would immediately make Tovu more flexible than most CMS prototypes.
