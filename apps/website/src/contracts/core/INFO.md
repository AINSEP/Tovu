# core Overview

Core contains stable contracts and cross-cutting primitives that features depend on.

## Current files

- `ports.ts`: dependency inversion contracts (event bus, outbox, clock, id generation)
- `events/`: event infrastructure adapters and outbox worker

Core should remain framework/provider-agnostic.

## Wiring

- `runtime-mode.ts` resolves the host signal from `TOVU_RUNTIME_MODE`; the `RuntimeMode` type it returns is owned by `@jini-ai/core/contracts/site/core-runtime-mode` (K4-seam-9), and every type importer reads it from there. No re-export from this folder.
