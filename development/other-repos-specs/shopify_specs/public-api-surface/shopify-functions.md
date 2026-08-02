<!-- Source: https://shopify.dev/docs/apps/build/functions -->

# Shopify Functions: Comprehensive Overview

## What Are Shopify Functions?

Shopify Functions enable developers to "customize the backend logic of Shopify" by injecting custom code into core platform operations. They operate as serverless functions that execute during customer interactions with a store.

## Availability

- Public apps with functions work on any Shopify plan
- Custom apps containing Shopify Functions require a Shopify Plus plan
- Some capabilities are exclusive to Shopify Plus stores

## Architecture and How They Work

Functions follow a three-part architecture:

**Input:** A JSON object derived from a GraphQL query you define, allowing selection of specific data like cart line products or metafields.

**Logic:** Written in WebAssembly-compatible languages. Shopify provides templates and libraries for Rust and JavaScript, with "Rust" recommended as the most performant choice to prevent failures with large carts.

**Output:** A JSON document describing operations for Shopify to execute.

## Function Types and Use Cases

The documentation covers these function categories:

- **Discounts**: Create custom discount types
- **Payments**: Manage payment option visibility at checkout
- **Delivery Options**: Customize shipping presentation
- **Validation**: Block checkout progress based on conditions
- **Order Routing**: Direct orders to specific locations
- **Bundles**: Group products for sale as units
- **Fulfillment**: Customize fulfillment strategies
- **Local Pickup**: Generate pickup options and charges
- **Pickup Points**: Generate alternative delivery options

## Lifecycle

Developers create and deploy apps containing functions → Merchants install and configure them → Shopify automatically executes functions during customer interactions (never via direct URL invocation).
