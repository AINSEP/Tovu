# core Overview

Core contains stable contracts and cross-cutting primitives that features depend on.

## Current files

- `ports.ts`: dependency inversion contracts (event bus, outbox, clock, id generation)
- `events/`: event infrastructure adapters and outbox worker

Core should remain framework/provider-agnostic.
