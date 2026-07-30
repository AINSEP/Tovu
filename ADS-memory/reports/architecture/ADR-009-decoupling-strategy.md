# ADR-009: Hybrid Decoupling — Typed Module Calls (Sync), Outbox Events (Async), Hooks (Extension)

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session)

## Context

"Is an event bus the best way to decouple things?" An event bus is one tool,
not the architecture. Using events for everything creates hidden control flow
(you can't trace who handles what), makes request/response awkward (queries
over events are an anti-pattern), and turns type errors into runtime surprises.
Using direct imports for everything creates the coupling the modular monolith
exists to prevent.

## Decision

Four interaction types, four mechanisms — chosen by the *shape* of the
interaction, never by fashion:

1. **Synchronous commands/queries between modules → direct calls to the other
   module's public contract** (its exported functions/ports). In-process,
   typed, traceable. A module's public surface is its `index.ts`; boundary
   lint forbids deep imports.
2. **Asynchronous side effects → domain events via the outbox** (already
   built: `enqueue → claimPending → publish → markDelivered`). For "this
   happened, others may care": cache invalidation, search indexing, webhooks,
   notifications, AI memory updates. Reliable, replayable, crash-safe.
3. **Extension/customization → typed hook points** (filters/actions declared
   by an owner, ADR framework in `tovu-v1-design.md` §3). Synchronous and
   ordered, because extensions must be able to transform a value in-line
   (e.g. filter `page.head`). Events cannot do this.
4. **Multi-step operations needing rollback → compensation steps on top of the
   outbox** (Medusa-inspired, small): plugin install, theme activate, core
   update. Each step declares its compensator; failure walks back completed
   steps. Pairs with change sets (ADR-008) for data-level inverses.

Explicitly rejected for now: message brokers (Kafka/Rabbit/NATS) — the outbox
on SQLite is sufficient, portable, and crash-safe for a single-node install;
`EventBusPort` keeps a broker swappable if multi-node ever demands it (ADR-006
two-adapter rule: in-memory now, broker plausible later). Also rejected:
events-as-queries, and a mediator/command-bus layer over everything (adds
indirection without adding a boundary the packages don't already provide).

## Consequences

- Developers must pick the right lane; the rule of thumb goes in CONTRIBUTING:
  *need an answer now → call; telling the world → event; letting others change
  your behavior → hook; multi-step with rollback → workflow.*
- Event handlers must stay idempotent (outbox retries) — enforced by handler
  contract tests as the outbox gains persistence.
