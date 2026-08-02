# Fulfillment Module

## 1. Summary of the Subsystem

Medusa's `fulfillment` module separates shipping topology and option policy from actual fulfillment execution.

Visible source anchors:

- `packages/modules/fulfillment/src/`
- `packages/core/core-flows/src/fulfillment/`
- `packages/modules/link-modules/src/definitions/*fulfillment*`

This module does not just represent "shipments." It also owns the configuration model that determines where fulfillment can happen, which shipping options exist, how service zones are expressed, and which providers can serve them.

## 2. Key Primitives / Contracts

Visible module entrypoints:

- `packages/modules/fulfillment/src/index.ts` registers `FulfillmentModuleService`
- the module loads providers through `loaders/providers`

The visible model family includes:

- execution records:
  - `Fulfillment`
  - `FulfillmentItem`
  - `FulfillmentLabel`
  - `Address`
- network and configuration records:
  - `FulfillmentSet`
  - `ServiceZone`
  - `GeoZone`
  - `ShippingOption`
  - `ShippingOptionRule`
  - `ShippingOptionType`
  - `ShippingProfile`
  - `FulfillmentProvider`

The service layer is also opinionated about what should be public. `generateMethodForModels` intentionally excludes `Fulfillment` from auto-generated service methods so the module can expose only the fulfillment APIs it wants rather than leaking the whole generic CRUD surface.

The joiner config makes several entities externally linkable:

- `fulfillment_id`
- `fulfillment_set_id`
- `shipping_option_id`
- `shipping_option_rule_id`
- `fulfillment_provider_id`

The service implementation shows one especially important behavior: `listShippingOptionsForContext` evaluates shipping-option rules against request context and address rather than assuming every option is globally valid.

Workflow families under `packages/core/core-flows/src/fulfillment/` include:

- create and update shipping profiles
- create and update service zones
- create, update, and delete shipping options
- calculate shipping-option prices
- create and cancel fulfillments
- create shipments and mark delivery
- validate providers, shipments, and shipping-option prices

## 3. Boundaries and Constraints

The fulfillment module owns shipping/fulfillment configuration and execution, but not the full stock or order picture.

Visible links show the surrounding relationships:

- `fulfillment-provider-location`
- `fulfillment-set-location`
- `order-fulfillment`
- `order-return-fulfillment`
- `shipping-option-price-set`
- readonly `inventory-level-stock-location`
- `sales-channel-location`

This means several important things are kept outside the module itself:

- inventory truth still belongs elsewhere
- shipping prices are linked rather than collapsed into the shipping-option model
- order ownership remains in the order domain
- physical location topology is explicit at the platform level

The result is a module that sits between order intent and physical execution without trying to absorb every logistics concern into one schema.

## 4. Operational Implications

- Shipping-option eligibility can be policy-driven instead of hardcoded in routes.
- Provider swap and provider heterogeneity are easier because provider loading is separate.
- The platform can distinguish "what can be shipped" from "what was shipped."
- Shipping pricing can evolve as a separate concern from shipping-option metadata.

The tradeoff is additional complexity around:

- rule evaluation
- price linking
- provider validation
- coordination with stock locations and orders

## 5. Tovu Reconstruction Notes

### Why this exists

This deep dive matters because fulfillment is usually where a commerce system either becomes a provider-coupled mess or establishes durable logistics boundaries.

### What Tovu should preserve

- a clear split between shipping policy/configuration and fulfillment execution
- provider loading as an explicit extension seam
- link-based coordination with orders, stock locations, and price sets
- context-aware shipping-option selection

### What Tovu can simplify

- fewer location and zone concepts if Tovu starts with a smaller shipping model
- defer advanced provider validation until multiple providers are real
- keep shipping-option pricing simpler until dynamic pricing is required

### Possible Tovu seams

- `FulfillmentConfigPort`
- `ShippingOptionPolicyPort`
- `FulfillmentExecutionPort`
- `ShipmentWorkflowPort`

### Suggested priority

- `V1`: preserve the configuration-vs-execution split
- `V2`: add richer provider, zone, and price-link sophistication when logistics scope actually expands
