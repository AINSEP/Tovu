# Shopify Webhooks and Events

## Summary

Shopify emits 150+ webhook events covering the entire lifecycle of every major entity. These are the platform's way of saying "something happened" so apps can react. The webhook topic list is effectively a map of every state change Shopify considers significant.

## Event Categories and Counts

| Domain | Approximate count | Examples |
|--------|------------------|----------|
| Products | 8+ | create, update, delete, variants in/out of stock, publications |
| Orders | 12+ | create, update, delete, cancel, paid, fulfilled, partially fulfilled, edited, risk changed |
| Customers | 15+ | create, update, delete, disable, enable, merge, tags, segments, consent, payment methods |
| Fulfillment | 20+ | orders cancelled/placed/moved/split/merged/rescheduled, holds, progress, routing |
| Inventory | 15+ | items create/update/delete, levels connect/disconnect, shipments, transfers |
| Collections | 6+ | create, update, delete, publications |
| Checkout | 3 | create, update, delete |
| Cart | 2 | create, update |
| Themes | 4 | create, update, delete, publish |
| Apps | 5 | uninstalled, scopes update, subscriptions, purchases |
| Metafields/Metaobjects | 6 | definitions create/update/delete, metaobjects create/update/delete |
| Subscriptions | 10+ | billing attempts, contracts, billing cycles |
| Companies (B2B) | 10+ | companies, contacts, locations, roles |
| Others | 20+ | domains, locales, locations, markets, disputes, discounts, segments, shop, tax, payments |

## Key Patterns

### CRUD consistency
Most entities follow `{entity}_CREATE`, `{entity}_UPDATE`, `{entity}_DELETE`. This is predictable and composable.

### Lifecycle events beyond CRUD
Orders go beyond create/update/delete: `PAID`, `FULFILLED`, `PARTIALLY_FULFILLED`, `CANCELLED`, `EDITED`. These represent meaningful business state transitions, not just data changes.

### Segment membership events
`CUSTOMER_JOINED_SEGMENT` / `CUSTOMER_LEFT_SEGMENT` — events for computed group membership changes. This is reactive segmentation.

### Publication events
Separate from CRUD: `PRODUCT_PUBLICATIONS_CREATE/DELETE/UPDATE`, `COLLECTION_PUBLICATIONS_CREATE/DELETE/UPDATE`. Publishing to a channel is a distinct lifecycle event from creating the entity.

### Audit events
`AUDIT_EVENTS_ADMIN_API_ACTIVITY` — triggers for every auditable admin API request. This is an observability/compliance surface.

## Boundaries and Constraints

- Webhook payloads include the entity data at the time of the event.
- Apps subscribe to specific topics — no wildcard "give me everything."
- Mandatory webhooks exist for privacy compliance (customer data requests, shop redact).
- Webhooks are delivered asynchronously with retry logic.

## Tovu Reconstruction Notes

### Why this exists
Shopify's webhook system is how the platform communicates state changes to its ecosystem. Every app that needs to react to "a product was updated" or "an order was placed" subscribes to the relevant webhook. It's the async integration backbone.

### What Tovu should preserve
- **Domain events for every meaningful state change**: Tovu already has an outbox + event bus pattern in `src/core/events/`. The Shopify webhook list is a reference for what events a mature platform considers important.
- **CRUD + lifecycle events**: don't just emit "post.updated" — emit "post.published", "post.unpublished", "post.archived" as distinct events.
- **Publication as a separate event**: creating content and publishing it to a channel are different operations with different events.
- **Predictable naming**: `{entity}.{action}` pattern, consistent across all domains.

### What Tovu can simplify
- Tovu doesn't need 150+ event types initially. Start with the content domain: `post.created`, `post.updated`, `post.deleted`, `post.published`, `post.unpublished`, `workspace.created`, `workspace.updated`.
- Tovu doesn't need webhook HTTP delivery initially — internal event bus subscribers are enough. External webhook delivery can be added later.
- Commerce-specific events (fulfillment, inventory, subscriptions, B2B) are irrelevant.

### Possible Tovu seams
- `src/core/events/` already has the outbox worker and event bus. The missing piece is a defined catalog of event names.
- A `src/core/events/catalog.ts` could define all known event types as string constants.
- Publication events should be distinct from CRUD events in Tovu's catalog.

### Suggested priority
Low — Tovu already has the infrastructure (`DomainEvent`, `EventBusPort`, `OutboxPort`). What's missing is a richer event catalog, which naturally grows as features are built.
