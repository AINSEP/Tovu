# Server Spec Suite

These specs define the server module as Tovu's transport boundary and composition root.

They are intentionally **server-only**:

- `src/server/__specs__` owns HTTP/runtime/protocol behavior, composition rules, request contexts, response mapping, and route orchestration.
- `src/features/**/__specs__` owns transport-independent business rules and state transitions.
- `src/core/**/__specs__` owns framework/provider-agnostic contracts and event/outbox semantics.

This suite is meant to cover the server responsibilities Tovu will need to replace what WordPress and Directus currently do on the backend, without collapsing domain logic into the transport layer.

## Reading Order

1. `00-foundation/server-boundary.spec.md`
2. `00-foundation/app-bootstrap.spec.md`
3. `00-foundation/request-context.spec.md`
4. `00-foundation/error-mapping.spec.md`
5. `00-foundation/http-runtime.spec.md`
6. `10-ops/health.spec.md`
7. `10-ops/command-lifecycle.spec.md`
8. `20-workspaces/create-route.spec.md`
9. `20-workspaces/create-route-errors.spec.md`
10. `30-auth/auth-and-sessions.spec.md`
11. `30-auth/authorization.spec.md`
12. `40-content/content-api.spec.md`
13. `40-content/content-lifecycle.spec.md`
14. `50-media/media-api.spec.md`
15. `60-extensions/extensions-api.spec.md`
16. `70-settings-admin/settings-and-admin-signals.spec.md`
17. `80-platform/tenancy-and-jobs.spec.md`
18. `90-migration/import-export-and-migration.spec.md`
19. `90-migration/protocol-surfaces.spec.md`

## Tranche Guidance

If the team is implementing in phases, the highest-value first tranche is:

- `00-foundation/server-boundary.spec.md`
- `00-foundation/app-bootstrap.spec.md`
- `00-foundation/request-context.spec.md`
- `00-foundation/error-mapping.spec.md`
- `00-foundation/http-runtime.spec.md`
- `10-ops/health.spec.md`
- `10-ops/command-lifecycle.spec.md`
- `20-workspaces/create-route.spec.md`
- `20-workspaces/create-route-errors.spec.md`

The remaining files are future-facing server contracts that should shape the platform direction now, even if their implementations land later.

## Scope Boundary

If a rule changes business meaning, it belongs in `features/` or `core/`.

Examples that do **not** belong here:

- slug regexes
- uniqueness rules
- domain error class semantics
- outbox retry policy internals
- extension safety policy internals
- content validation rules

Examples that **do** belong here:

- route/method ownership
- request decoding
- content-type handling
- auth extraction
- permission callback timing
- HTTP status mapping
- response envelopes
- request correlation
- protocol adapter behavior
- composition-root wiring

## Current Baseline

Today the server module is still minimal:

- `app.ts` wires Express
- `GET /health` returns a basic liveness payload
- `POST /workspaces` invokes the workspace slice and flushes the outbox

These specs intentionally go beyond the current implementation. They define the target server boundary Tovu should grow into.
