# Shopify Extensibility Boundaries

## Summary

Shopify has a layered extensibility model that gives third parties increasing power at increasing levels of review and constraint. The key design principle: **extensions surface functionality inside Shopify's UI, not outside it**.

## Extension Layers (from most to least constrained)

### 1. Theme App Extensions
Integrate with Online Store 2.0 themes. Merchants add app blocks to sections via the theme editor. The app provides Liquid + assets but the theme controls placement.

### 2. Admin Extensions (22 types)

**Admin Actions**: Custom modals on resource pages (orders, products, customers).
**Admin Blocks**: Custom cards on resource pages.
**Admin Link Extensions**: Quick links to your app from any admin page.
**Navigation Links**: App nav items across devices.

All admin extensions render inside Shopify's admin UI, maintaining visual consistency.

### 3. Checkout UI Extensions
Add custom UI at defined points in the checkout flow. Most sensitive surface — strict constraints:
- 64 KB compressed size limit
- Runs in sandboxed environment
- Remote-rendered (app defines UI tree, Shopify renders it)
- No direct DOM access

### 4. App Bridge
JavaScript SDK for apps running in an iframe within the Shopify admin. Provides:
- Authenticated GraphQL access (automatic, no token management)
- UI components (title bars, navigation menus, toasts, modals)
- Workflow launchers (create product, edit order)

Apps communicate with Shopify admin via message passing, not direct DOM manipulation.

### 5. Shopify Functions
Serverless backend logic injection. Runs during checkout/cart operations.
- **Input**: JSON from a GraphQL query you define
- **Logic**: WebAssembly (Rust recommended, JS supported)
- **Output**: JSON describing operations for Shopify to execute

Function types: discounts, payments, delivery, validation, order routing, bundles, fulfillment, local pickup, pickup points.

Never invoked by URL — Shopify executes them automatically during customer interactions.

### 6. Remote Rendering Architecture
The underlying technique for sandboxed UI:
- Extensions define UI as component trees (using `remote-ui` library)
- Serialized as JSON messages
- Host (Shopify) reconstructs and renders them natively
- Communication via async message passing (RPC layer)
- Extensions run in isolated environments (web workers, webviews, JSCore)
- JavaScript globals are restricted

This achieves: consistency, developer familiarity, security, cross-platform parity.

## The 22 Extension Types (Complete List)

**Admin**: Actions, Blocks, Product Config, Link Extensions, Channel Config, Discount Settings, Navigation Links, Purchase Options, Subscription Link, Web Pixel (Admin)

**Checkout**: UI Extensions, Functions, Post-Purchase (needs approval), Web Pixel (Checkout)

**Customer & Flow**: Account UI Extensions, Flow Triggers, Flow Actions, Flow Templates (needs approval), Lifecycle Events

**Online Store & Payments**: Theme App Extensions, Payments Extension (needs approval)

**Point of Sale**: POS UI Extensions

## Boundaries and Constraints

- Extensions are not standalone apps — they add features to defined parts of Shopify's UI
- 64 KB compressed size limit for UI extensions
- Some extension types require review and approval
- Extensions version together with the app as a single app version
- Each extension needs a `shopify.extension.toml` config
- Functions use Wasm for untrusted code isolation — Rust recommended for performance
- No direct DOM access from any extension type

## Tovu Reconstruction Notes

### Why this exists
Shopify has 10,000+ apps in its ecosystem. Without strong boundaries, apps would break the admin UI, slow down checkout, leak customer data, and conflict with each other. Every extension type is a carefully designed surface that gives apps enough power to be useful while preventing them from harming the platform.

### What Tovu should preserve
- **Extension points, not arbitrary hooks**: define specific places where extensions can plug in, not a WordPress-style "hook into anything." This is the biggest philosophical lesson.
- **UI extensions render through the host**: the host controls rendering, the extension provides data/intent. This prevents style clashes, accessibility violations, and performance problems.
- **Sandboxed execution for untrusted code**: if Tovu ever runs third-party logic, it should be isolated (Wasm, workers, or similar).
- **Size limits and review gates**: constraints on what extensions can do prevent ecosystem degradation.

### What Tovu can simplify
- Tovu doesn't need 22 extension types at launch. Start with 2-3: an admin block extension (cards on admin pages), a content extension (custom content types), and maybe a theme extension (custom sections/blocks).
- Tovu doesn't need Wasm/Functions initially — that's for a platform running untrusted partner code at scale.
- Remote rendering is powerful but complex. Tovu can start with simpler extension patterns (config-driven components, registered React/Vue components) and add sandboxing later.
- App Bridge's iframe + message passing pattern is only needed when apps are separate web applications. If Tovu extensions are code modules loaded into the same process, message passing is overkill.

### Possible Tovu seams
- A future `src/features/extensions/` module defining extension points and a registration API.
- Extension manifest format (like `shopify.extension.toml`) describing what an extension provides and where it plugs in.
- Admin shell extension points: "add a card to the post editor page," "add a sidebar widget," "add a navigation item."
- Content extension points: "register a custom content type," "add a custom field type."

### Suggested priority
Low for now — Tovu needs its core content model and presentation layer working before adding extension infrastructure. But the *design principle* (constrained extension points, not arbitrary hooks) should inform every architectural decision from day one.
