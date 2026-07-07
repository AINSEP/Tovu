# Spec: Core Contracts

## Problem statement

Tovu needs a stable dependency-inversion seam so feature logic can remain independent from
HTTP frameworks, storage adapters, queue providers, and host-specific SDKs.

## Scope

This spec covers the shared runtime contracts in `src/core/ports.ts`.

Current contract families:

- JSON primitives used by feature payloads
- domain events
- event bus delivery
- reliable outbox persistence
- clock abstraction
- ID generation

## Non-goals

- Defining concrete provider adapters
- Defining HTTP request/response payload shapes
- Encoding feature-specific business rules

## Required invariants

- Core contracts are framework-agnostic and provider-agnostic.
- Feature code may depend on these contracts, but core contracts may not depend on feature modules.
- Any adapter may be replaced if it satisfies the same behavioral contract.
- Public contracts must be deterministic enough for test doubles and contract tests.

## Contract expectations

### JSON value contracts

- Feature payloads may use JSON-safe values and objects.
- Feature logic must not depend on framework-specific serialization helpers.

### Domain events

- Events carry a stable `name`, immutable `occurredAt`, and JSON-safe `payload`.
- Events may optionally carry aggregate and workspace identity when available.

### Event bus port

- A bus implementation can publish one or many events.
- A bus implementation can register async subscribers by event name.
- Subscription APIs must support unsubscribe behavior.

### Outbox port

- Command handlers enqueue events for later delivery.
- Workers claim pending rows in batches.
- Delivery completion and failure are tracked explicitly.
- Failure handling must preserve retryability through `markFailed`.

### Clock and ID ports

- Time and ID generation must be swappable and testable.
- Feature tests must be able to supply deterministic implementations.

## Acceptance checks

- A feature can be tested entirely with in-memory implementations of these contracts.
- Replacing an adapter does not require feature code changes.
- Core contracts do not import Express, Next.js, Vue, database SDKs, or provider clients.
- Event and outbox contracts are sufficient to support the hybrid synchronous-write plus async-side-effect flow.
