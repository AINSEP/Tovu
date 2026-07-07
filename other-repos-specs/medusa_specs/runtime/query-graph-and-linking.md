# Query Graph And Linking

## 1. Summary of the Subsystem

Medusa makes separate modules feel like one platform through query-graph and link infrastructure, not through one giant shared ORM model.

Visible source anchors:

- `packages/core/modules-sdk/src/remote-query/remote-query.ts`
- `packages/core/modules-sdk/src/link.ts`
- `packages/modules/link-modules/src/`
- `packages/core/orchestration/src/joiner/`
- widespread `useQueryGraphStep` / `useRemoteQueryStep` usage in `packages/core/core-flows/src/**`

This subsystem is the glue between module ownership and system-wide reads/writes.

## 2. Key Primitives / Contracts

Several layers are visible in the source:

- module-local `__joinerConfig` declarations
- `RemoteQuery`, which aggregates queryable module configs
- `RemoteJoiner`, which executes cross-module join plans
- `Link`, which manages relationship maps and cascade behavior
- generated link modules in `packages/modules/link-modules`

`RemoteQuery` shows how Medusa assembles the read side:

- it scans loaded queryable modules
- it collects each module's joiner config
- it constructs a `RemoteJoiner`
- it translates expand trees into `select`, `relations`, and `args`

The implementation makes the read-path behavior concrete:

- fetches are batched
- `MAX_BATCH_SIZE` is `4000`
- `MAX_CONCURRENT_REQUESTS` is `10`

This is not an incidental helper. It is platform infrastructure for multi-module reads.

The `Link` class shows how Medusa assembles the relationship/write side:

- it loads queryable, non-readonly link-capable modules
- it builds relationship maps keyed by service and linkable fields
- it resolves generated link modules for relationship pairs
- it supports soft-delete and restore cascades across related records

`packages/modules/link-modules/src/services/link-module-service.ts` exposes the runtime write surface:

- `retrieve`
- `list`
- `listAndCount`
- `create`
- `dismiss`

Those write operations emit attach/detach-style events, which means links are treated as domain-relevant platform actions, not only join-table mechanics.

The link module layer also distinguishes:

- writable links such as `product-variant-price-set` or `order-fulfillment`
- readonly links such as `order-product`, `cart-region`, `store-currency`, and `product-translation`

That distinction is important. Medusa is modeling both:

- authoritative attachable relationships
- derived or protected read-only associations

## 3. Boundaries and Constraints

This subsystem exists because Medusa refuses to solve modularity by cheating.

It does not:

- collapse all commerce state into one schema
- let every module reach directly into every other module's tables
- hide cross-module relationships as implicit ORM knowledge

Instead it makes composition explicit:

- modules publish joiner configs
- link modules represent cross-domain attachments
- query graph infrastructure stitches module-owned data together at read time
- workflows call query steps when they need composed state

Visible workflow usage confirms this is central, not edge-case behavior:

- payment processing queries payment, payment-session, cart-payment-collection, and order-cart relations
- order creation queries variants with calculated prices and inventory confirmation fields
- many order, product, pricing, and fulfillment flows use remote/query graph steps as normal building blocks

## 4. Operational Implications

- System-wide reads stay possible without destroying module ownership.
- Relationship lifecycle becomes explicit and testable.
- Link-aware cascade behavior can be centralized instead of reimplemented per module.
- Workflows can reason over composed data without each workflow inventing bespoke join logic.

The cost is real:

- higher platform complexity
- more infrastructure code to understand
- stronger need for consistent joiner-config discipline
- more opportunity for query-shape and relationship drift if the platform rules are weak

But this is the mechanism that lets Medusa be both modular and usable.

## 5. Tovu Reconstruction Notes

### Why this exists

This deep dive matters because Tovu will eventually face the same pressure: separate domain ownership without regressing into either a mega-schema or brittle cross-module hacks.

### What Tovu should preserve

- explicit relationship metadata between modules
- a system-level read-composition layer above module storage
- distinct writable vs read-only relationship types
- workflow access to composed query surfaces

### What Tovu can simplify

- begin with a smaller relationship registry than Medusa's
- avoid a full generic remote-joiner engine until Tovu has enough module pressure to justify it
- keep cascade behavior narrow and explicit before generalizing it

### Possible Tovu seams

- `CrossModuleQueryPort`
- `RelationshipRegistry`
- `LinkLifecyclePort`
- `ReadModelComposer`

### Suggested priority

- `V1`: explicit relationship registry plus a narrow composed-read layer
- `V2`: generalized link services and richer cascade/query planning once multiple bounded modules exist
