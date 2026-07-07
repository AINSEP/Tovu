<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Metafield -->

# Metafield Object Schema

## Overview
The Metafield object represents "custom metadata attached to a Shopify resource" like Products, Collections, or Customers. Each metafield is identified by namespace and key, storing a value with an associated type.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| **createdAt** | DateTime! | "The date and time when the storefront metafield was created." |
| **description** | String | "The description of a metafield." |
| **id** | ID! | "A globally-unique ID." |
| **key** | String! | "The unique identifier for the metafield within its namespace." |
| **list** | Boolean! | Indicates whether the metafield type is a list variant (e.g., `list.color`). |
| **namespace** | String! | "The container for a group of metafields that the metafield is associated with." |
| **parentResource** | MetafieldParentResource! | Designates the resource type the metafield is attached to. |
| **reference** | MetafieldReference | Returns a reference object for resource reference type metafields. |
| **references** | MetafieldReferenceConnection | Paginated list of reference objects for resource reference list types. Supports `first`, `after`, `last`, `before` arguments. |
| **type** | String! | "The type name of the metafield." |
| **updatedAt** | DateTime! | "The date and time when the metafield was last updated." |
| **value** | String! | "The data stored in the metafield. Always stored as a string, regardless of the metafield's type." |

## Interfaces
- Implements **Node** interface

## Related Mutations
- **cartMetafieldsSet**: Sets metafield values on carts (up to 25 per request)
