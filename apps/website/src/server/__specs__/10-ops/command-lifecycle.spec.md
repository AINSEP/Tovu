# Spec: Command Lifecycle Over HTTP

## Goal

Define what an HTTP mutation means at the server boundary: when a command is considered successful, when outbox work is triggered, and what the route owes the client before background work completes.

## Lifecycle Stages

For a mutation route, the server lifecycle is:

1. decode request
2. authorize request
3. invoke command
4. persist domain write
5. enqueue outbox or job side effects
6. perform any route-defined immediate follow-up work
7. serialize response

## Success Semantics

The default success rule is:

- authoritative success is based on the domain write being committed
- some route categories also owe additional transport behavior before the response is finalized

For the current workspace route, that immediate follow-up includes an outbox flush attempt after success.

## Outbox And Async Boundary

The server must distinguish:

- authoritative command success
- asynchronous side-effect delivery

The route may trigger delivery work, but the server must not blur these concepts into one undefined "it worked somehow" contract.

## Route Policy Categories

Each mutation route should declare which category it uses:

### Category A: Write Commit Only

Success is based on authoritative write completion only.

### Category B: Write Commit Plus Immediate Delivery Attempt

The route must:

- commit the authoritative write
- perform a bounded immediate delivery attempt or flush
- report the outcome of that attempt explicitly before the response is finalized

The success-class response for a Category B route must include a delivery outcome:

- `delivery.status = "delivered"` when commit and immediate delivery both succeed
- `delivery.status = "degraded"` when the write committed but the immediate delivery attempt failed

### Category C: Accepted Async Operation

The route returns an accepted or job-tracking response because the operation is intentionally asynchronous.

Category C routes use:

- HTTP `202`
- a job-tracking response or equivalent accepted-work envelope
- `delivery.status = "accepted"` or an equivalent job-state field when the route family uses the shared async contract

## Current Baseline

The current `POST /workspaces` route behaves like Category B:

- it calls the command
- then flushes the outbox
- then returns `201`

This is now explicit rather than accidental.

## Failure Rules

- If the command fails, the route must not present success.
- If the route promises an immediate delivery attempt, its behavior on delivery failure must be specified and testable.
- If the write is committed but the immediate delivery attempt fails, the route must not collapse that outcome into the same path as pre-commit command failure.
- Async follow-up must not silently mutate the success meaning of unrelated routes.

## Post-Commit Delivery Failure

For Category B routes:

- authoritative write success must be preserved
- delivery attempt outcome must be surfaced explicitly
- generic `500` mapping is not sufficient once the write has already committed

Allowed route-level patterns are:

- degraded success response that preserves the created/updated resource result
- accepted recovery response that preserves the authoritative result and shifts follow-up into async recovery

For the current workspace route, the target first-tranche pattern is degraded success:

- HTTP `201`
- created workspace ID preserved
- `delivery.status = "degraded"`
- machine-readable delivery degradation marker included in the response

## Acceptance Checks

- Every mutation route belongs to an explicit lifecycle category.
- Route tests can prove when a success response is allowed.
- Outbox or job triggering semantics are visible in the spec, not hidden in implementation glue.
- Post-commit delivery failure is distinguishable from command failure.
- Category B success responses expose `delivery.status` instead of silently hiding delivery outcome.

## Non-goals (current)

- Final worker retry or dead-letter internals
- Final event bus provider choice
