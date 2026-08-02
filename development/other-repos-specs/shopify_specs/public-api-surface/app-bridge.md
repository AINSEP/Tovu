<!-- Source: https://shopify.dev/docs/api/app-bridge-library -->

# Shopify App Bridge: Comprehensive Overview

## What It Is

App Bridge is a JavaScript SDK that enables apps to communicate with other parts of the Shopify admin interface. As stated in the documentation, apps in App Home use this tool to "interact with other Shopify admin components outside this iframe."

## How It Works

**Architecture:**
The App Home operates as an iframe within Shopify admin. Since apps are isolated in this iframe, they require App Bridge to "communicate with Shopify admin, and App Bridge web components to add UI elements such as title bars and navigation menus to other parts of Shopify admin outside the app's iframe."

**Authentication:**
App Bridge handles authentication automatically. Developers don't need to manage tokens manually since "your app runs inside an authenticated session in Shopify admin, so you don't need to manage tokens or headers yourself."

## Key Features

**API Capabilities:**
The SDK provides access to multiple functionalities including the ability to "read information from Shopify admin, launch workflows like creating products or editing orders, and provide feedback to merchants through toasts and modals."

**Web Components:**
App Bridge includes web components for UI elements. Developers can "add UI elements like title bars and navigation menus to the main Shopify admin area outside of your app's iframe."

**Direct GraphQL Access:**
Apps can query data directly using "App Bridge automatically authenticates these requests, so you don't need to manage tokens or headers yourself" via the special URL `shopify:admin/api/graphql.json`.

## Technical Implementation

Apps access functionality through the `shopify` global variable. For TypeScript support, Shopify provides the `@shopify/app-bridge-types` npm package to maintain type safety with the latest library version.
