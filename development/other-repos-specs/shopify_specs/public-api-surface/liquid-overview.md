<!-- Source: https://shopify.dev/docs/api/liquid -->

# Shopify Liquid: Template Language Overview

## What is Liquid?

Liquid is "a template language created by Shopify" that enables dynamic content rendering. It allows developers to build single templates with static content while inserting information conditionally based on context—such as displaying product details that change based on which product is being viewed.

## Core Components

### Objects
Liquid objects represent variables for theme building, accessed via double curly braces `{{ }}`. They include:
- Store resources (products, collections)
- Standard content (e.g., `content_for_header`)
- Functional elements (`paginate`, `search`)

Properties are accessed using dot notation: `{{ product.title }}`

**Object Access Types:**
- Globally available (in most Liquid files)
- Template-specific (like `product` in product templates)
- Through parent objects (e.g., `article` within `articles`)

### Tags
Tags define logic using `{% %}` delimiters. Examples include `if` statements and the `for` loop. Tags can accept required or optional parameters—for instance, `for` loops support a `limit` parameter to restrict iterations.

### Filters
Filters modify output using the pipe character `|`. They apply left-to-right when chained. Example: `{{ product.title | upcase | remove: 'HEALTH' }}`

## Data Types & Operators

Liquid supports six basic data types and includes logical and comparison operators for conditional logic.

## Available Resources
- Liquid Cheat Sheet
- Theme Check (linter)
- Shopify CLI for Themes
- Open source Liquid on GitHub
