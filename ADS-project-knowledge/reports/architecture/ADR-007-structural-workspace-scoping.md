# ADR-007: `workspaceId` Is Required in Every Event, Repo Port, Job, and Cache Key

- Status: ACCEPTED (implemented in code 2026-07-01)
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W7; drift found by coordinator review)

## Context

Tovu is multisite-native: workspaces are the tenancy primitive (WordPress
multisite as a first-class concept, plus the desktop multi-install manager
later). Tenancy is the classic thing that cannot be retrofitted — one unscoped
query path is a cross-tenant data leak. The code had already drifted:
`PostRepoPort.findById(id)` / `findBySlug(slug)` took no `workspaceId`, and
`DomainEvent.workspaceId` was optional, with route-level string comparisons
compensating.

## Decision

1. **Every repo port method that reads or mutates tenant data requires
   `workspaceId` in its required-parameters object.** Records carry it; lookups
   filter by it. Route-level checks are defense in depth, not the mechanism.
2. **`DomainEvent.workspaceId` is required.** A platform-level (workspace-less)
   event class must be a deliberate future decision, not an omitted field.
3. The same rule extends as each subsystem lands: scheduled jobs, cache keys
   (`ws:{id}:…` prefix), search index partitions, storage key prefixes,
   capability checks, and change sets (ADR-008) all carry the workspace.
4. Contract tests for every repo/adapter must include a cross-workspace
   isolation case (same id/slug in two workspaces; reads must not leak).

Implemented today in `tovu/src`: `PostRepoPort.findById({ workspaceId, id })`,
`findBySlug({ workspaceId, slug })`, scoped `InMemoryPostRepo`, required
`DomainEvent.workspaceId`, and the outbox now persists the full event envelope
(it previously dropped `workspaceId`/`aggregateId`/`metadata` and re-fabricated
`occurredAt` at delivery).

## Consequences

- Slightly noisier signatures everywhere — accepted; the type system now makes
  cross-tenant access unrepresentable rather than merely discouraged.
- Single-workspace installs pass their one workspace id explicitly; no implicit
  "default workspace" global in domain code (composition root may own that
  convenience).
