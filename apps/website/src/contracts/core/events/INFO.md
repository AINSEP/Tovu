# core/events Overview

This module contains hybrid event flow infrastructure.

## Files

- `outbox-worker.ts`: `processOutbox`, the site's drain: binds the site retry table
  (`outbox-retry-policies.ts`) to `@jini-ai/infra/events/domain-outbox`'s `processDomainOutbox`
- `outbox-drainer.ts`: the background drainer for the site-serving process
- `outbox-retry-policies.ts`: the site's per-event retry table

The in-memory `EventBusPort`/`OutboxPort` adapters live in `@jini-ai/infra/events/memory-bus`; the
domain-port translation, enqueue-only view and backoff live in `@jini-ai/infra/events/domain-outbox`;
the worker's constants live in `@jini-ai/infra/events/outbox`. Import them from there directly.

## Why this exists

Commands should be synchronous for correctness, while side effects should be async and reliable.
This module is the bridge for that pattern.
