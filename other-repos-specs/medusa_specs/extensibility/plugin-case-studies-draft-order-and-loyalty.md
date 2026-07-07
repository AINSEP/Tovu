# Plugin Case Studies: Draft Order And Loyalty

## 1. Summary of the Subsystem

These two plugins are useful together because they show two different Medusa plugin shapes:

- `draft-order` is an admin-first operational plugin built on top of existing order-management primitives.
- `loyalty` is a fuller vertical plugin that adds new modules, links, workflows, APIs, subscribers, and admin/store surfaces.

Visible source anchors:

- `packages/plugins/draft-order/`
- `packages/plugins/loyalty/`
- Medusa blog posts for Draft Orders:
  - `medusajs.com/blog/announcing-draft-orders/`
  - `medusajs.com/blog/draft-orders-open-source/`

Taken together, they show that Medusa plugins are not just provider adapters. A plugin can be:

- a purpose-built operator workflow on top of core APIs
- a new business domain with its own persisted models
- a cross-cutting slice that attaches itself to carts, orders, customers, and admin/store UX at once

## 2. Case Study A: Draft Order

### What is directly visible

The visible source tree for `draft-order` is surprisingly narrow:

- `package.json`
- `README.md`
- `src/admin/`
- `src/types/http/`

The package exports are broader than the checked-in source tree:

- `./workflows`
- `./modules/*`
- `./providers/*`
- `./admin`

Those exports point at generated `.medusa/server` artifacts. So the plugin clearly ships server-side behavior, but that behavior is not fully inspectable from the small checked-in source slice alone. That makes this case study partly direct evidence and partly inference from the package contract.

### What the plugin is for

The public README and Medusa blog posts make its role clear:

- admin users create and manage orders on behalf of customers
- it is aimed at support, offline sales, B2B negotiation, quote flows, and white-glove ordering
- it is built on top of Medusa's `Order Edit API`

That last point matters most. Draft Orders are not a new parallel order engine. They are a productized admin workflow built on top of existing order-edit and order-management primitives.
More precisely: the public README, blog posts, admin surface, and HTTP types strongly suggest that shape, but the server-side workflow internals are not directly inspectable in the checked-in source slice.

### What the visible admin surface shows

The admin route tree is purpose-built:

- `draft-orders/page.tsx`
- `draft-orders/@create/page.tsx`
- `draft-orders/[id]/page.tsx`

The list page shows:

- a dedicated nested admin route under `/orders`
- filtering by customer, region, sales channel, and dates
- explicit table-driven operator workflow

The create page shows:

- region and sales-channel selection
- optional customer association or raw email fallback
- shipping and billing address capture
- saved-customer-address reuse

The detail page composes a fairly rich operational screen:

- general information
- customer section
- shipping section
- summary
- metadata
- activity
- JSON view
- active order changes

That is revealing. Draft Orders are not just "one extra button." The visible admin surface shows Medusa packaging a full operator workflow and screen suite around a preexisting core order primitive, even though the underlying server workflow implementation is only partly visible through exports and published materials.

### What the HTTP types show

The checked-in HTTP types define:

- draft-order creation payloads
- draft-order response wrappers
- order-preview line items with change actions
- order-edit shipping-method request types

That indicates the plugin has a clear contract layer around core order entities rather than inventing an entirely separate domain model.

### What this means architecturally

Within the visible evidence, Draft Order is a strong example of a Medusa plugin that:

- reuses a powerful core domain (`order edit`)
- packages a focused operational UX around it
- adds plugin-specific HTTP typing and admin composition
- ships server/runtime artifacts whose full implementation is not co-located with the visible admin source

This is a useful lesson for Tovu: some "plugins" should really be productized workflows over existing core capabilities, not brand-new core modules. That lesson is well supported by the visible package contract and admin/type surfaces, even if the complete server-side draft-order workflow internals are not directly inspectable here.

## 3. Case Study B: Loyalty

### What is directly visible

The `loyalty` plugin is much more source-visible than `draft-order`.

Its `src/` tree includes:

- `modules`
- `links`
- `api`
- `workflows`
- `subscribers`
- `admin`
- `types`
- `utils`
- placeholder `jobs`

This is the clearest local example of a Medusa plugin behaving like a mini-application slice.

### Domain shape

The plugin actually contains two modules:

- `loyalty`
- `store-credit`

The `loyalty` module is small and focused:

- it exposes a `GiftCard` model
- the service is mostly a generated `MedusaService` over that model

The `store-credit` module is richer:

- `StoreCreditAccount`
- `AccountTransaction`
- service methods for listing accounts with derived balances
- credit and debit operations
- balance and stats retrieval
- transaction validation and insufficient-balance guards

So the plugin is not just "gift cards." It splits the business concept into:

- a gift-card identity layer
- a backing stored-value ledger

That is a strong modular design choice.

### Link layer

The plugin defines explicit links to the rest of Medusa:

- cart ↔ gift cards
- order ↔ gift cards
- order line item ↔ gift card
- customer ↔ store credit account
- gift card ↔ store credit account

This is exactly how Medusa wants plugins to participate in the broader domain graph: through links, not by smuggling foreign tables into core modules.

### Workflow layer

The workflow tree includes:

- `carts`
- `gift-cards`
- `orders`
- `store-credit`
- shared steps and hooks

The `create-gift-cards` workflow is especially revealing:

- create gift cards
- create anonymous backing store-credit accounts
- create links between gift cards and credit accounts
- credit those accounts with the gift-card value
- update the gift-card status

This is a very "Medusa-native" plugin shape. Even plugin-side business logic is expressed as orchestrated workflows instead of ad hoc service chaining.

### Event/subscriber layer

The plugin includes a subscriber for `OrderWorkflowEvents.PLACED`.

That subscriber:

- queries the order
- finds gift-card line items
- creates one gift card per purchased quantity
- uses workflow execution rather than raw record mutation

This is another important pattern: plugin behavior can hook into core events and still delegate the heavy lifting back into plugin workflows.

### API layer

The API tree is split into:

- `api/admin/gift-cards`
- `api/admin/store-credit-accounts`
- `api/store/carts`
- `api/store/gift-cards`
- `api/store/store-credit-accounts`

The plugin also publishes route middleware as one combined file.

This shows Medusa plugins can extend both trust zones:

- operator/admin operations
- storefront/customer operations

So the plugin is not only a back-office extension or only a public API extension. It can straddle both sides.

## 4. Cross-Case Lessons

These two plugins together show a few repeatable Medusa patterns.

### A plugin may wrap core primitives instead of inventing new ones

Draft Order is the cleaner example here:

- reuse the order-edit core, at least according to the visible package contract and public Medusa descriptions
- package new admin workflow and HTTP contracts around it

### A plugin may add brand-new modules when the domain truly warrants it

Loyalty does this with:

- `GiftCard`
- `StoreCreditAccount`
- `AccountTransaction`

### Links are the plugin-safe way into the broader graph

Loyalty shows the preferred Medusa move:

- connect to carts, orders, customers, and line items through explicit links
- avoid hidden ORM coupling inside core modules

### Workflows are plugin infrastructure, not only core infrastructure

Loyalty workflows and the Draft Order packaging both reinforce this:

- reusable orchestration belongs in workflows
- route handlers and subscribers should stay thinner than the business logic they trigger

### Plugins can extend admin, store, and events at once

Loyalty shows the full stack:

- new modules
- new APIs
- new middleware
- new subscribers
- new admin surfaces

Draft Order shows the complementary pattern:

- deep operator UX over existing core business primitives

## 5. Tovu Reconstruction Notes

### Why this exists

This matters because Tovu will likely need more than one kind of extension surface.

Some extensions should look like `draft-order`:

- productized workflow packs on top of existing Tovu primitives

Others should look more like `loyalty`:

- bounded vertical features with their own modules, links, workflows, and screens

### What Tovu should preserve

- plugins as first-class application slices, not only provider adapters
- links as the preferred way for plugin domains to join core domains
- workflow-oriented plugin business logic
- support for admin, public, and event-driven extension points

### What Tovu can simplify

- start with one plugin type before generalizing all extension shapes
- do not expose every possible plugin seam at once
- keep generated/built plugin artifacts honest and inspectable where possible

### Possible Tovu seams

- `WorkflowPackPlugin`
- `FeatureSlicePlugin`
- `PluginDomainLinkRegistry`
- `PluginEventSubscriberPort`
- `PluginAdminSurfaceRegistry`

### Suggested priority

- `V1`: support workflow-pack and feature-slice plugin categories explicitly
- `V2`: broaden public/storefront and event surfaces as real plugin needs appear
