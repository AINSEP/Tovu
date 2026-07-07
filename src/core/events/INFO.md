# core/events Overview

This module contains hybrid event flow infrastructure.

## Files

- `memory-bus.ts`: in-memory `EventBusPort` and `OutboxPort` adapters
- `outbox-worker.ts`: publishes claimed outbox rows to the event bus
- `index.ts`: public exports for event infrastructure

## Why this exists

Commands should be synchronous for correctness, while side effects should be async and reliable.
This module is the bridge for that pattern.
