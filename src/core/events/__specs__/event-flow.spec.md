# Spec: Hybrid Event Flow

## Problem statement

Tovu needs synchronous command correctness without coupling command handlers to immediate side
effect delivery. Writes must succeed or fail deterministically, while follow-up effects remain
reliable and retryable.

## Scope

This spec covers the outbox-driven event flow implemented in `src/core/events/`.

## Flow contract

1. A command handler writes domain state first.
2. The same command path enqueues a domain event in the outbox.
3. A worker claims pending outbox rows.
4. The worker publishes claimed rows to the event bus.
5. Successful deliveries are marked delivered.
6. Failed deliveries are marked failed for retry.

## Required rules

- Commands write domain data first.
- Commands enqueue outbox events in same unit of work.
- Worker claims pending outbox rows and publishes to bus.
- Successful deliveries are marked delivered.
- Failed deliveries are retried via `markFailed`.

## Failure expectations

- A publish failure must not crash the command that already committed its write.
- A failed delivery must retain enough information for retry behavior.
- A successful publish must not leave the row in `pending` or `processing`.

## Non-goals

- Exactly-once delivery guarantees
- Broker-specific features
- Distributed transaction coordination across external systems

## Acceptance checks

- A claimed pending row is published once during the current worker pass.
- A successful publish increments delivered work and marks the row delivered.
- A failed publish records failure state through the outbox port.
- Feature slices can rely on the outbox contract without importing worker or bus implementations directly.
