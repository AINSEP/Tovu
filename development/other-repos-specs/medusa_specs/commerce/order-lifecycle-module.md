# Order Lifecycle Module

## 1. Summary of the Subsystem

Medusa's `order` module is not just an order table. It is the post-checkout change-management core.

Visible source anchors:

- `packages/modules/order/src/`
- `packages/core/core-flows/src/order/`
- `packages/modules/link-modules/src/definitions/order-*`

The module owns the durable order record plus the machinery for edits, returns, claims, exchanges, shipping-method changes, transactions, and credit lines.

This makes the order module look much closer to a commerce ledger with staged mutations than to a simple "completed purchase" record store.

## 2. Key Primitives / Contracts

Visible module entrypoints:

- `packages/modules/order/src/index.ts` registers `OrderModuleService` as `Modules.ORDER`
- `packages/modules/order/src/services/order-module-service.ts` is the main service
- `packages/modules/order/src/joiner-config.ts` declares the query surface

The model family spans several operational layers:

- core order state:
  - `Order`
  - `OrderSummary`
  - `OrderItem`
  - `OrderAddress`
  - `OrderTransaction`
- item and shipping accounting:
  - `OrderLineItem`
  - `OrderLineItemAdjustment`
  - `OrderLineItemTaxLine`
  - `OrderShippingMethod`
  - `OrderShippingMethodAdjustment`
  - `OrderShippingMethodTaxLine`
  - `OrderShipping`
- change-management layer:
  - `OrderChange`
  - `OrderChangeAction`
- reverse-flow and remediation layer:
  - `Return`
  - `ReturnItem`
  - `ReturnReason`
  - `OrderClaim`
  - `OrderClaimItem`
  - `OrderClaimItemImage`
  - `OrderExchange`
  - `OrderExchangeItem`
  - `OrderCreditLine`

The module service itself exposes the internal complexity. It wires a large set of model services and carries utility logic such as:

- order-change calculation
- order-change application
- order formatting and transformation
- version propagation from order and order-change parents into child records

`joiner-config.ts` also exposes `claim_id` and `exchange_id` as linkable keys, which is a clue that claims and exchanges are first-class queryable branches of the order lifecycle rather than afterthoughts.

Workflow families under `packages/core/core-flows/src/order/` show how broad this lifecycle really is:

- order creation and completion
- shipping-option fetch and shipping refresh
- payment-collection creation and payment state transitions
- fulfillment and shipment creation/cancellation
- order edits
- returns
- claims
- exchanges
- transfers
- tax-line updates and adjustment previews

## 3. Boundaries and Constraints

The order module owns post-checkout business truth, but not the entire commerce universe.

It is linked externally to adjacent systems such as:

- carts
- payment collections
- fulfillments
- promotions
- customers
- products
- sales channels
- regions

Visible link definitions confirm this:

- `order-cart`
- `order-payment-collection`
- `order-fulfillment`
- `order-return-fulfillment`
- `order-promotion`
- readonly `order-customer`
- readonly `order-product`
- readonly `order-sales-channel`
- readonly `order-region`

The architectural implication is that order state is authoritative for order lifecycle, but not for upstream catalog/payment/fulfillment ownership.

Medusa also treats order mutation as staged and reviewable. The presence of `OrderChange` and `OrderChangeAction` as dedicated models means order edits are explicit artifacts, not only imperative updates to order rows.

## 4. Operational Implications

- Post-purchase mutation is treated as a first-class system, not a patch on top of order CRUD.
- Claims, returns, exchanges, and edits can share infrastructure instead of each inventing their own side tables and flows.
- The module has high cognitive weight, but the weight is earned: real commerce mutation after checkout is complicated.
- This design is more compatible with auditability, previewing, rollback-style workflows, and support tooling than a flatter order schema would be.

The cost is that order behavior is distributed across:

- module models and services
- workflow families
- query graph reads
- external links to payment and fulfillment

## 5. Tovu Reconstruction Notes

### Why this exists

This deep dive matters because Tovu should treat post-checkout change management as its own domain if it ever takes commerce reliability seriously.

### What Tovu should preserve

- an explicit order-lifecycle module, not just an order record
- staged mutation artifacts for edits and reversals
- clear separation between order truth and adjacent payment/fulfillment modules
- workflow-level handling for returns, claims, exchanges, and transfers

### What Tovu can simplify

- defer claims and transfers if Tovu starts with a narrower DTC scope
- begin with fewer change-action variants
- avoid Medusa's full surface until user-friction or support requirements justify it

### Possible Tovu seams

- `OrderLedgerPort`
- `OrderChangePort`
- `ReturnAndExchangePort`
- `PostCheckoutWorkflowPort`

### Suggested priority

- `V1`: preserve explicit order-change and post-checkout workflow boundaries
- `V2`: add the wider remediation surface only when the target commerce slice truly needs it
