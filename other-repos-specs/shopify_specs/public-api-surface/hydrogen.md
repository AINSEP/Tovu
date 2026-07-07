<!-- Source: https://shopify.dev/docs/storefronts/headless/hydrogen -->

# Hydrogen Framework: Getting Started Guide

## What is Hydrogen?

Hydrogen is Shopify's framework for building custom storefronts. A new project is created using `npm create @shopify/hydrogen@latest -- --quickstart`, which sets up a storefront with example data from Mock.shop.

## Architecture & Core Components

The framework follows a structured routing system supporting multiple commerce functions:

**Key Routes Include:**
- Home pages and catch-all routes
- Product and collection displays
- Shopping cart and discount management
- Customer account functionality
- Search capabilities
- SEO features (robots.txt, sitemap.xml)

The setup uses JavaScript as its primary language and includes pre-configured paths for blogs, policies, and account management.

## Technical Integration Points

**Storefront API Connection:**
Hydrogen connects to Shopify's commerce data through environment variables. After linking a project to a Shopify store, developers update configurations with API credentials:
- Storefront IDs and tokens
- Customer Account API credentials
- Store domain information

**Environment Management:**
The `npx shopify hydrogen env pull` command syncs credentials from your Shopify storefront, replacing mock data credentials with production values.

## Oxygen Hosting Relationship

Oxygen serves as the recommended deployment platform. The deployment process involves running `npx shopify hydrogen deploy`, which pushes the configured storefront to Shopify's hosting infrastructure for public access.

## Development Workflow

The framework provides a local development server (`shopify hydrogen dev`) running on localhost:3000, enabling real-time testing before deployment to production.
