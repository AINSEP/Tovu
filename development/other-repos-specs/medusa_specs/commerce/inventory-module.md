# Inventory Module

## 1. Summary of the Subsystem

Medusa's `inventory` module owns stock records, per-location levels, and reservation accounting. It is not the catalog owner and it is not the fulfillment owner.

Visible source anchors:

- `packages/modules/inventory/src/`
- `packages/core/core-flows/src/inventory/`
- `packages/core/core-flows/src/reservation/`
- `packages/medusa/src/api/admin/inventory-items/`
- `packages/medusa/src/api/admin/products/*inventory-items*`

The module exists to answer a specific question cleanly: how much stock exists, where, and how much of it is already reserved by in-flight commerce activity.

## 2. Key Primitives / Contracts

The visible model family is:

- `InventoryItem`
- `InventoryLevel`
- `ReservationItem`

The model split is important:

- `InventoryItem` stores stockable-item facts such as SKU, dimensions, customs fields, and shipping requirement.
- `InventoryLevel` stores per-location stock, reserved quantity, incoming quantity, and computed available quantity.
- `ReservationItem` stores claims on inventory for line items or other external references.

The service implementation shows several strong invariants:

- `reserved_quantity` cannot be set directly through ordinary update inputs
- reservations are the official path for changing reserved stock
- inventory level existence is validated before reservation or update work proceeds
- stock checks reject over-allocation unless backorder is explicitly allowed

Reservation handling is the core behavior:

- creating reservations validates stock, creates reservation records, and increments `reserved_quantity`
- deleting or restoring reservations adjusts inventory levels back down or back up
- reservation updates recompute the delta instead of trusting callers to mutate level state correctly

The service surface also exposes broader stock operations such as:

- create and update inventory items
- create and update inventory levels
- adjust inventory quantities
- retrieve available quantity
- confirm inventory availability

The joiner config gives the module a query identity through aliases like:

- `inventory_items`
- `inventory_item`
- `inventory`
- `reservations`

That suggests Medusa expects inventory to be queried from multiple neighboring domains without losing module ownership.

## 3. Boundaries and Constraints

Inventory does not own:

- product and variant merchandising
- shipping-option definition
- order state transitions
- raw product-to-stock links as embedded catalog fields

That separation is visible in the admin routes:

- inventory items have their own admin surface
- product-variant routes link variants to inventory items instead of collapsing both into one table

Storefront surfaces also tell a story by omission. The store API does not expose raw inventory management endpoints. Inventory is mostly an internal operator and workflow concern, surfaced outward only through stock-aware cart or checkout behavior.

## 4. Operational Implications

- Multi-location stock stays explicit instead of being flattened into one available number.
- Reservation records give Medusa a durable way to protect inventory during cart, order, and fulfillment transitions.
- Backorder behavior is opt-in per reservation path rather than implicit overselling.
- Admin operators can manage stock items independently from product editing.

The tradeoff is more moving parts:

- stock items must be linked to variants
- location levels must stay synchronized
- reservation lifecycle needs workflow discipline

This is still the right split for commerce. Inventory is operational state, not catalog metadata.

## 5. Tovu Reconstruction Notes

### Why this exists

This matters because Tovu should not attach stock counts directly to content or product records if it wants safe commerce flows.

### What Tovu should preserve

- separate inventory items from catalog variants
- location-level stock state
- reservation records as the official reserved-stock mechanism
- inventory confirmation before fulfillment-sensitive steps

### What Tovu can simplify

- one stock-location model at first if multi-location is not yet needed
- a smaller customs/dimensions surface for the first pass
- fewer admin batch routes initially

### Possible Tovu seams

- `InventoryModulePort`
- `InventoryReservationPort`
- `StockLocationLevelPort`
- `AvailabilityCheckPort`

### Suggested priority

- `V1`: inventory items, location levels, reservations, and availability checks
- `V2`: richer batch admin operations and deeper fulfillment coordination
