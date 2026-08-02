# Commerce Primitives

## 1. Summary of the Subsystem

Medusa's commerce model is spread across many domain modules rather than centered in one giant commerce package.

That is the most important fact to preserve.

The model is not merely "products and orders." It is a graph of bounded domains that are explicitly linked:

- catalog
- pricing
- cart
- order
- payment
- fulfillment
- inventory
- customer
- region / store / currency / locale
- promotion
- tax

## 2. Key Primitives / Contracts

### Catalog

From `product`:

- product
- product variant
- product option
- product option value
- product image
- product category
- product collection
- product tag
- product type

### Pricing and promotion

From `pricing`:

- price set
- price
- price list
- price list rule
- price rule
- price preference

From `promotion`:

- promotion
- promotion rule
- promotion rule value
- campaign
- campaign budget
- application method

### Cart and order execution

From `cart`:

- cart
- line item
- shipping method
- tax lines
- adjustments
- credit line
- address

From `order`:

- order
- order item
- order summary
- order change
- order change action
- return
- return item
- return reason
- claim
- claim item
- exchange
- exchange item
- transaction

### Payment

From `payment`:

- payment collection
- payment session
- payment
- capture
- refund
- refund reason
- payment provider
- account holder

### Fulfillment and physical inventory

From `inventory`:

- inventory item
- inventory level
- reservation item

From `stock-location`:

- stock location
- stock location address

From `fulfillment`:

- fulfillment
- fulfillment item
- fulfillment label
- fulfillment set
- fulfillment provider
- service zone
- geo zone
- shipping option
- shipping option type
- shipping option rule
- shipping profile

### Customer and access context

From `customer`:

- customer
- customer group
- customer-group membership
- address

From `auth`, `user`, `rbac`, `api-key`:

- auth identity
- provider identity
- user
- invite
- RBAC role
- RBAC policy
- API key

### Configuration and localization

From `region`, `store`, `currency`, `translation`, `settings`, `tax`:

- region
- country
- store
- locale
- currency
- translation
- property label
- user preference
- tax region
- tax rate
- tax rate rule
- tax provider

## 3. Boundaries and Constraints

The defining architectural constraint is that cross-domain relationships are explicit.

`packages/modules/link-modules/src/definitions` includes link definitions such as:

- `product-variant-price-set`
- `product-variant-inventory-item`
- `product-sales-channel`
- `product-shipping-profile`
- `order-cart`
- `order-fulfillment`
- `order-payment-collection`
- `cart-payment-collection`
- `cart-promotion`
- `region-payment-provider`
- `sales-channel-location`

This means Medusa does not rely solely on one hidden shared relational graph. It exposes cross-module joins as a platform concern.

That is a major architectural lesson:

- module ownership stays local
- shared relationships become explicit infrastructure

## 4. Operational Implications

- Commerce features can evolve by module without forcing one mega-schema to absorb every concern.
- Cross-domain queries and migrations require link-aware infrastructure.
- Provider choice is cleaner because payment, notification, file, locking, and auth dependencies do not have to live inside core domain modules.
- The model is flexible, but understanding end-to-end commerce behavior requires following workflow plus link boundaries.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because Tovu needs to understand not just Medusa's nouns, but how Medusa stops those nouns from collapsing into one provider-coupled commerce blob.

### What Tovu should preserve

- domain ownership by bounded module
- explicit cross-module relationship definitions
- swappable provider seams for infrastructure-sensitive domains
- public/operator domain splits where trust boundaries differ

### What Tovu can simplify

- Tovu does not need Medusa's exact commerce graph
- not every relationship needs a standalone link module if Tovu's scope is narrower
- start with a smaller primitive set aligned to Tovu's user-friction backlog and target slices

### Possible Tovu seams

- `CatalogPort`
- `PricingPort`
- `CheckoutPort`
- `FulfillmentPort`
- `InventoryPort`
- `CrossDomainLinkRegistry`

### Suggested priority

- `V1`: preserve module ownership and explicit links
- `V2`: selectively reconstruct only the commerce domains Tovu truly needs
