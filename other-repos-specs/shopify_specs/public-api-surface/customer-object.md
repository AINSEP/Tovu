<!-- Source: https://shopify.dev/docs/api/storefront/2024-10/objects/Customer -->

# Customer Object Schema - Storefront API

## Overview
The Customer object represents a shop account with contact information, addresses, and marketing preferences. Access requires `unauthenticated_read_customers` scope and a customer access token from `customerAccessTokenCreate` mutation.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `acceptsMarketing` | Boolean! | "Indicates whether the customer has consented to be sent marketing material via email" |
| `addresses` | MailingAddressConnection! | Paginated list of customer addresses (supports first, after, last, before, reverse) |
| `avatarUrl` | String | URL pointing to customer's profile image |
| `createdAt` | DateTime! | Timestamp of account creation |
| `defaultAddress` | MailingAddress | Customer's primary address |
| `displayName` | String! | Customer's name, email, or phone number |
| `email` | String | Customer's email address |
| `firstName` | String | Customer's given name |
| `id` | ID! | Unique customer identifier |
| `lastName` | String | Customer's surname |
| `metafield` | Metafield | Single custom field (requires namespace and key arguments) |
| `metafields` | [Metafield]! | List of custom fields (max 250 identifiers per query) |
| `numberOfOrders` | UnsignedInt64! | Lifetime order count |
| `orders` | OrderConnection! | Paginated orders (supports sorting, filtering, pagination) |
| `phone` | String | Customer's contact number |
| `socialLoginProvider` | SocialLoginProvider | Associated social authentication provider |
| `tags` | [String!]! | Comma-separated customer tags (requires additional scope) |
| `updatedAt` | DateTime! | Last modification timestamp |

## Key Relationships
- Implements `HasMetafields` interface for custom data retrieval
- Appears in `CartBuyerIdentity.customer` field
- Queryable via `customer` query with access token
- Mutable through 7 mutations (create, activate, update, reset, address management)
