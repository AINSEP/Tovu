# Tovu routing, domains and live storefront placement

## Old paths and domain move

Save exact redirects with `redirects_import` for `/products/<handle>`, `/collections/all` and
known `/collections/<handle>` paths, pointing at the actual Shop page (default `/shop`).
Check per-rule failures; duplicates need no new rule.

Today the live server only applies redirects to one-segment paths (`/` and `/:slug`). Do not
claim nested old links already work. Say: "Old product links will forward once the site supports
nested old addresses." Rules can still be saved and included in static export.

Follow the portable `references/domains.md` in order: connect `shop.<domain>` to Shopify,
wait for its secure connection, and make it primary BEFORE the main domain points at Tovu.
The owner performs the Shopify clicks. Use Tovu's domain tools and their returned DNS guidance
for this side; move `www` too when needed. Never invent DNS values or claim an unverified move.
Shopify retains checkout and payments.

## Live components (only on request)

Read `references/live-storefront.md` through `agent_plugin_shopify` for the independent snippet.
Put it in a theme partial using the existing theme tools. Theme files may carry `<script>`;
page bodies stay script-free as an authoring policy. The normal collection grid stays script-free.

Never nest `<shopify-context><template>` inside the collection embed's `<template>`.
`splitCollectionMarkerInner` takes the first `</template>`, so nesting breaks the collection.
Keep the live snippet outside that marker, in its own theme partial.

Tovu's public CSP is report-only (`contracts/core/public-page-security-headers.ts`). Shopify's
CDN produces a report rather than a block. Do not edit core CSP or add vendor-specific rules.
The portable reference owns public-token versus private-key handling; never ask for a private key.
