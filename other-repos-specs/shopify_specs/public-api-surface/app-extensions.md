<!-- Source: https://shopify.dev/docs/apps/build/app-extensions -->
# Shopify App Extensions: Overview

## Core Purpose

App extensions enable developers to integrate application functionality directly into Shopify's user interfaces. Rather than requiring merchants to leave Shopify to access your app, extensions bring your features into their workflow.

## How Extensions Work

**Without Extensions:** Users navigate between Shopify and your app separately, with information flowing through your application as an intermediary.

**With Extensions:** "Users interact with Shopify. Shopify relays information to your app that gets surfaced back to the users through your app extension in Shopify."

Extensions surface functionality where merchants need it most—appearing as dropdown menu items in the admin for orders, products, customers, and other resources while maintaining Shopify's visual design language.

## Key Characteristics

- Extensions are not standalone apps; they're mechanisms that add features to defined parts of Shopify interfaces
- They must comply with the same authentication requirements and rate limits as traditional apps
- Extension-only apps (composed entirely of extensions without App Home pages) can be hosted on Shopify but require custom distribution

## Technical Requirements

UI extensions face a **64 KB compressed size limit**. The Shopify CLI (version 3.92.0+) generates esbuild metafiles to help analyze bundle contributions and optimize size.

## Configuration & Deployment

- Each extension requires a `shopify.extension.toml` configuration file
- Extensions and app configuration version together as a single app version
- Some extension types require review and approval before release
- Deployments can be reverted to previous versions anytime
