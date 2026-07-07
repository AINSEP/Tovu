# Spec: Server Boundary

## Goal

Define exactly what `src/server` owns and what it must delegate.

This spec exists to prevent the transport layer from becoming an accidental monolith while still giving Tovu a server surface rich enough to replace WordPress- and Directus-class backend responsibilities over time.

## Server Owns

`src/server` owns:

- HTTP and protocol entry points
- composition-root wiring
- request parsing and normalization
- auth extraction
- permission callback invocation
- tenant/workspace context assembly
- status-code and error-envelope mapping
- response serialization
- request correlation and transport logs
- route-local orchestration such as post-success outbox flushes

## Server Does Not Own

`src/server` does not own:

- business validation rules
- domain state transitions
- repository semantics
- event retry policy internals
- extension safety policy internals
- content schema semantics

Those belong in `src/features` or `src/core`.

## Dependency Direction

- `src/server` may depend on `src/core` and `src/features`.
- `src/features` and `src/core` may not depend on `src/server`.
- Framework/runtime-specific objects must terminate at the server adapter boundary.

## Route Ownership Rule

If a requirement changes the meaning of a command or aggregate state, it is not a server-only rule.

If a requirement changes:

- how a request is decoded
- how a permission gate is invoked
- how a response is shaped
- when a route returns `201` versus `409`

it belongs in the server spec set.

## Expansion Rule

As the system grows, new server specs should be added by surface area and context, not by dumping all behavior into one generic server document.

Good examples:

- auth and sessions
- content API
- media API
- extension API
- migration/protocol surfaces

## Acceptance Checks

- A feature can be reused outside HTTP because the business logic lives outside `src/server`.
- The server can evolve from Express to another adapter without changing feature code.
- Server route tests can validate HTTP behavior without restating business invariants.

## Non-goals (current)

- Defining domain rules for every future capability module
- Final package extraction strategy
