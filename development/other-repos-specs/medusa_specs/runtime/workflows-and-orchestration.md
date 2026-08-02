# Workflows And Orchestration

## 1. Summary of the Subsystem

Medusa treats workflows as a first-class coordination layer.

The visible architecture is split across:

- `packages/core/workflows-sdk`
- `packages/core/orchestration`
- `packages/core/core-flows`
- `packages/modules/workflow-engine-inmemory`
- `packages/modules/workflow-engine-redis`

This suggests a clear separation:

- workflows define multi-step business coordination
- orchestration provides workflow and transaction machinery
- workflow-engine modules provide execution storage/runtime backends
- domain modules remain the owners of the actual business records

## 2. Key Primitives / Contracts

Visible workflow vocabulary includes:

- workflows
- steps
- transactions
- joiner
- workflow execution records
- orchestration storage

The `core-flows` package exposes domain-oriented workflow families for:

- auth
- cart
- customer
- draft-order
- file
- fulfillment
- inventory
- line-item
- notification
- order
- payment
- payment-collection
- price-list
- pricing
- product
- promotion
- rbac
- region
- reservation
- sales-channel
- settings
- shipping-options
- shipping-profile
- stock-location
- store
- tax
- translation
- user

Workflow executions are persisted through swappable engine modules:

- in-memory
- Redis-backed

## 3. Boundaries and Constraints

- Workflows coordinate work across modules; they do not erase module ownership.
- Execution state is separated from workflow definitions.
- The execution backend is swappable.
- `core-flows` sits above individual modules and below the assembled app, which makes it a reusable business-process layer.

This is a strong indication that Medusa sees cross-domain operations as orchestrated processes rather than direct service chaining scattered across route handlers.

## 4. Operational Implications

- Multi-step commerce behavior can be standardized and reused across APIs, jobs, or plugins.
- Execution persistence makes long-running or recoverable flows possible.
- Workflow visibility reaches the admin surface through workflow execution routes and screens.
- The architecture supports richer rollback and step tracking than route-local imperative logic would.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because Tovu will need safe multi-step operations in areas like publishing, extension changes, migrations, recovery, and commerce flows.

### What Tovu should preserve

- workflows as explicit business-process artifacts
- a separation between domain modules and orchestration logic
- pluggable workflow execution backends
- admin/operator visibility into workflow execution state

### What Tovu can simplify

- fewer workflow abstractions if Tovu only needs a narrower process model at first
- start with a smaller workflow vocabulary before adding full engine sophistication
- avoid encoding every CRUD action as a workflow if ordinary module transactions are sufficient

### Possible Tovu seams

- `WorkflowDefinitionPort`
- `WorkflowExecutionStorePort`
- `OrchestrationEnginePort`
- `ProcessRunInspector`

### Suggested priority

- `V1`: explicit workflow layer for cross-module critical paths
- `V2`: durable execution backends and admin inspection tooling
