# Workflow Compensation And Rollback

## 1. Summary of the Subsystem

Medusa's workflow layer does not treat rollback as an implicit database side effect. Compensation is explicit in workflow definitions, step responses, and workflow-engine state.

Visible source anchors:

- `packages/core/orchestration/src/workflow/local-workflow.ts`
- `packages/core/orchestration/src/workflow/workflow-manager.ts`
- `packages/modules/workflow-engine-inmemory/src/services/workflow-orchestrator.ts`
- `packages/modules/workflow-engine-redis/src/services/workflow-orchestrator.ts`
- `packages/core/core-flows/src/common/steps/create-entities.ts`
- `packages/core/core-flows/src/common/steps/delete-entities.ts`
- `packages/core/core-flows/src/fulfillment/steps/set-shipping-options-prices.ts`
- `packages/medusa/src/api/admin/workflows-executions/`

This is one of Medusa's clearest architectural choices: long-running or cross-module operations are reversible because steps carry their own compensation data and handlers.

## 2. Key Primitives / Contracts

The workflow manager stores handlers as:

- `invoke`
- optional `compensate`

That pairing exists in both `WorkflowDefinition` and the built handler map. When the orchestrator executes a step, the payload passed into the handler includes:

- `payload`
- `invoke`
- `compensate`
- transaction metadata
- transaction and step references

`StepResponse` is the other core primitive. It carries:

- the forward result
- the compensation payload needed if the step must be reverted later

The common generic steps make the pattern easy to see:

- `create-entities` records created IDs and a `compensateMethod`
- `delete-entities` records deleted IDs and a `compensateMethod`
- more specialized steps often store previous state so an update can be rolled back

The shipping-option pricing step is a good concrete example:

- it reads the current linked price-set state before changing it
- it updates the pricing module
- on rollback it restores the prior prices from saved rollback data

That is not transactional magic. It is explicit state capture plus explicit reversal logic.

## 3. Engine-Level Behavior

The engine modules make rollback a durable execution concern rather than only an in-process callback:

- workflow orchestrators work with `invoke` and `compensate` actions
- parent workflow steps can be notified of child workflow failure or success through idempotency keys
- finished executions distinguish states such as `done`, `failed`, and `reverted`

The workflow-execution admin routes expose this surface directly:

- list workflow executions
- run a workflow by `workflow_id`
- register async step success
- register async step failure

The step success and failure routes are particularly revealing. They accept:

- `transaction_id`
- `step_id`
- the action type, defaulting to invoke
- a `StepResponse`, including optional compensation input

That means Medusa expects some steps to resolve asynchronously and still rejoin the compensation model later.

## 4. Boundaries and Constraints

Workflow rollback is not universal automatic undo.

The system only knows how to compensate when:

- the step definition includes a `compensate` handler
- the step recorded enough rollback data to reverse itself safely

So the real Medusa rule is:

- reversible work must be designed as reversible work

This keeps module ownership intact. A workflow coordinates rollbacks, but the actual reversal still happens by calling module methods or provider-aware logic.

## 5. Operational Implications

- Multi-step commerce flows can fail midstream without leaving every side effect permanently stuck.
- Async provider callbacks can report step completion or failure back into a running workflow.
- Admin operators can inspect workflow runs instead of treating orchestration as invisible background code.
- Compensation logic is portable across APIs because it lives in workflow steps, not in one route handler.

The tradeoff is design discipline:

- every important step needs rollback data
- every external side effect needs a clear reversal story
- irreversible work has to be isolated and acknowledged

## 6. Tovu Reconstruction Notes

### Why this exists

This matters directly for Tovu because section 13 of `tovu-architecture.md` already calls out `CommerceReliabilityPort` and `CheckoutHarness`. Medusa's workflow rollback model is one of the strongest open references for that reliability layer.

### What Tovu should preserve

- explicit `invoke` and `compensate` step structure
- rollback payloads captured at the step boundary
- durable workflow execution state
- operator visibility into failed and reverted flows

### What Tovu can simplify

- fewer engine backends at first
- fewer async callback routes until external providers actually need them
- a narrower step vocabulary for the first commerce slice

### Possible Tovu seams

- `WorkflowCompensationPort`
- `WorkflowExecutionLedger`
- `StepRollbackData`
- `ProcessFailureInspector`

### Suggested priority

- `V1`: compensation-aware checkout and order workflows
- `V2`: broader async step callbacks and richer operator inspection
