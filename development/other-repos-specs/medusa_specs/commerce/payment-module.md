# Payment Module

## 1. Summary of the Subsystem

Medusa's `payment` module is the provider-facing payment state machine, not the owner of checkout as a whole.

Visible source anchors:

- `packages/modules/payment/src/`
- `packages/core/core-flows/src/payment/`
- `packages/core/core-flows/src/order/workflows/create-order-payment-collection.ts`
- `packages/modules/link-modules/src/definitions/*payment*`

It owns payment collections, sessions, payments, captures, refunds, and account-holder/payment-provider abstractions. Order completion and cart completion happen around it through workflows and links, not inside one giant payment blob.

## 2. Key Primitives / Contracts

Visible module entrypoints show a two-part structure:

- `packages/modules/payment/src/index.ts` registers `PaymentModuleService`
- the module also loads providers through `loaders/providers`

The visible model family includes:

- `PaymentCollection`
- `PaymentSession`
- `Payment`
- `Capture`
- `Refund`
- `RefundReason`
- `AccountHolder`
- `PaymentProvider`

The service layer is split between:

- `PaymentModuleService`
- `PaymentProviderService`

That split matters because it separates payment-domain state from provider interaction.

The joiner config exposes several linkable keys:

- `payment_id`
- `payment_collection_id`
- `payment_provider_id`
- `refund_reason_id`
- `account_holder_id`

It also exposes an alias for `payment_method`, which signals that Medusa wants the payment surface queryable in more operator-friendly terms than only low-level model names.

Workflow families under `packages/core/core-flows/src/payment/` cover:

- payment processing
- capture
- refund

The webhook-driven `process-payment` workflow is especially revealing:

- it uses query-graph reads to locate payment, payment session, cart-payment-collection, and order-cart relationships
- it acquires and releases a lock around cart completion
- it branches between authorize, capture, and complete-cart behavior based on webhook action and current payment state

This shows Medusa treats payment as asynchronous, stateful, and workflow-mediated.

## 3. Boundaries and Constraints

The payment module does not own:

- cart line items
- order lifecycle
- shipping choices
- catalog pricing rules as a whole

Instead it links to adjacent domains such as:

- `cart-payment-collection`
- `order-payment-collection`
- `order-claim-payment-collection`
- `order-exchange-payment-collection`
- `region-payment-provider`

That means the module's real job is narrower and clearer:

- normalize and persist payment state
- mediate provider interactions
- expose payment-side events to workflows

The service implementation also makes money-handling rules visible:

- currency normalization is centralized
- currency precision rounding is explicit

Those choices reduce the chance that provider quirks leak into unrelated modules.

## 4. Operational Implications

- Provider swapping is easier because provider logic is isolated behind loaders and provider services.
- Payment flows can survive asynchronous webhook timing instead of assuming synchronous checkout success.
- Cart completion and order-side effects can be retried or coordinated separately from raw provider state changes.
- The payment collection becomes a useful anchoring concept for carts, orders, claims, and exchanges.

The tradeoff is extra coordination infrastructure:

- query graph reads to discover related entities
- locks to avoid concurrent completion races
- workflow branching instead of one synchronous route handler

## 5. Tovu Reconstruction Notes

### Why this exists

This deep dive matters because Tovu should keep provider integration and payment-domain state separate from broader checkout/order concerns.

### What Tovu should preserve

- a dedicated payment-domain module
- provider loading/registration as an explicit seam
- payment collections as a coordination anchor
- webhook-safe workflows for authorize/capture/refund paths

### What Tovu can simplify

- start with fewer payment-side entities if only basic capture/refund is needed
- avoid broad alias compatibility until multiple consumer surfaces need it
- keep the provider registry small until real adapter churn appears

### Possible Tovu seams

- `PaymentModulePort`
- `PaymentProviderRegistry`
- `PaymentCollectionPort`
- `PaymentWebhookWorkflowPort`

### Suggested priority

- `V1`: preserve provider isolation and workflow-mediated payment transitions
- `V2`: add richer claim/exchange/refund coordination only when order-lifecycle scope expands
