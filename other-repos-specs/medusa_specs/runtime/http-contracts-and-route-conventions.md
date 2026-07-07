# HTTP Contracts And Route Conventions

## 1. Summary of the Subsystem

The existing `http-surfaces.md` file maps Medusa's high-level trust zones. This deeper note focuses on the contract style inside those zones.

Visible source anchors:

- `packages/medusa/src/api/admin/price-lists/`
- `packages/medusa/src/api/admin/promotions/`
- `packages/medusa/src/api/admin/inventory-items/`
- `packages/medusa/src/api/admin/tax-regions/`
- `packages/medusa/src/api/admin/workflows-executions/`
- `packages/medusa/src/api/store/carts/[id]/promotions/route.ts`
- `packages/medusa/src/api/store/carts/[id]/taxes/route.ts`

Across these folders, Medusa's route handlers are consistently thin. Validation, query shaping, and business coordination are split out instead of being collapsed into controller methods.

## 2. Route-Folder Contract Pattern

Many Medusa API folders repeat the same file roles:

- `route.ts`
- `validators.ts`
- `query-config.ts`
- optional `middlewares.ts`
- optional `helpers.ts`
- sometimes route-local query helpers

That pattern implies a transport contract with explicit layers:

- transport entrypoint
- request validation and filter parsing
- default response field selection
- workflow or query dispatch
- response refetch and serialization

This is more disciplined than a plain route-per-file convention. The file split expresses how Medusa wants HTTP concerns separated.

## 3. Common Handler Shape

Representative admin routes show a repeatable lifecycle:

- `GET` list routes build a remote query from `req.filterableFields`, pagination, and `req.queryConfig.fields`
- `GET` detail routes fetch one entity through helper refetch functions, `remoteQuery`, or `query.graph`
- `POST` create and update routes usually run a named core workflow and then refetch the entity
- `DELETE` routes usually run a delete workflow and return a tombstone payload like `{ id, object, deleted: true }`

Examples:

- `admin/price-lists/route.ts`
- `admin/promotions/route.ts`
- `admin/inventory-items/route.ts`
- `admin/tax-regions/route.ts`

This keeps route logic transport-thin and pushes business coordination down into reusable workflows.

## 4. Validation And Query Shaping

The validator files show that Medusa's HTTP contract is strongly typed and filter-aware rather than permissive:

- list params usually start from `createFindParams`
- detail/select params usually start from `createSelectParams`
- operators are whitelisted through helper builders such as `createOperatorMap`
- domain-specific refinements enforce higher-level policy

Examples of policy encoded in validators:

- promotions: buy-get shape constraints and "automatic promotions cannot have a usage limit"
- tax regions: top-level regions require a provider unless they are provinces under a parent
- inventory levels: stock mutations enforce non-negative quantities
- price lists: list status, schedule, and rule fields are structurally constrained

The query-config files are equally important. They define:

- default fields
- list vs retrieve mode
- entity identity
- relation expansion allowed by default

That means response shape is not an accidental byproduct of ORM loading. It is an explicit route contract.

## 5. Remote Query And Workflow Bias

The route files make two architectural preferences very visible:

- reads are often remote-query driven
- writes are often workflow driven

In practice that means:

- list and retrieve routes compose data through remote query or graph query
- create, update, delete, and action routes usually trigger workflows from `@medusajs/core-flows`

Store routes follow the same posture even when they are much narrower. For example:

- cart promotions are added, replaced, or removed by running `updateCartPromotionsWorkflowId`
- cart tax recalculation runs `updateTaxLinesWorkflow`

So Medusa's HTTP surface is not a CRUD shell over module services. It is a transport layer above query composition and orchestrated business actions.

## 6. Workflow-Execution HTTP Surface

The workflow-execution admin routes are a particularly strong signal that Medusa exposes orchestration as an operator-facing contract, not just as an internal library.

Those routes allow operators or async integrations to:

- list workflow executions
- trigger a workflow by ID
- report async step success
- report async step failure

The success and failure routes accept `transaction_id`, `step_id`, action type, and optional compensation input wrapped in `StepResponse`. That is unusually explicit compared with most commerce backends and makes Medusa's async orchestration model inspectable over HTTP.

## 7. Boundaries and Constraints

This route style does not mean Tovu should copy Medusa's exact folder layout.

The real lessons are:

- validation should be separate from transport glue
- default response shapes should be explicit
- reads and writes should be allowed to use different mechanisms
- workflow-backed actions should stay thin at the HTTP edge

The exact Medusa route tree is an implementation detail. The contract discipline is the portable part.

## 8. Tovu Reconstruction Notes

### Why this exists

This matters because Tovu will need clean public and operator APIs for commerce, and section 14 of `tovu-architecture.md` explicitly pushes the project toward spec-first, test-first contract design.

### What Tovu should preserve

- explicit request validation and filter parsing
- query-shaping defaults per route family
- workflow-backed write paths for cross-module actions
- thin HTTP handlers with refetch-after-write semantics where useful

### What Tovu can simplify

- fewer route helper files if the same separation can be preserved another way
- a smaller query-shaping surface for the first commerce slice
- no public workflow-execution routes unless async provider coordination truly needs them

### Possible Tovu seams

- `OperatorApiContract`
- `PublicApiContract`
- `QueryExposureConfig`
- `WorkflowActionHttpAdapter`

### Suggested priority

- `V1`: explicit validators, explicit response fields, workflow-backed writes
- `V2`: operator-facing workflow execution inspection where reliability tooling needs it
