# ADR-008: Change Sets — Vocabulary in v1, Full Propose/Preview/Apply/Revert Later

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W6)

## Context

If AI agents mutate sites, the differentiator is reviewable, reversible change:
propose → preview diff → apply → revert. The same primitive unifies AI approval
flows, theme preview, update preflight (UF-01), and migration guardrails
(UF-13); ADR-001's plan/execute semantics for commerce is the same idea. The
question was how to store it: frontend state manager? temporary rows? The
answer is neither — durable first-class rows in the site's own database.
Retrofitting this vocabulary onto events/revisions later would be a breaking
rewrite, so the *vocabulary* must land with the first persistent schema even
though the full workflow ships later.

## Decision

**v1 (now — vocabulary and storage shape):**

1. `DomainEvent` carries required `workspaceId` (ADR-007) and reserved optional
   `actorId` (user or agent principal) and `changeSetId` fields — implemented
   in `tovu/src/core/ports.ts` 2026-07-01.
2. Revisions are addressable by id, and content is never modeled as "one
   mutable row" — every mutation can reference the revision it superseded.
3. The SQLite schema (Phase 1) includes the tables even before any UI:
   - `change_sets`: `id`, `workspaceId`, `actorId`, `status`
     (`proposed | applied | reverted | discarded`), `summary`, `createdAt`,
     `appliedAt`, `revertedAt`
   - `change_set_items`: `id`, `changeSetId`, `entityType`, `entityId`,
     `operation` (`create | update | delete | activate | …`),
     `beforeRevisionId` / `afterRevisionId` (or an inline inverse payload for
     non-revisioned entities), `position`
4. Direct mutations (human hits save) are recorded as an auto-applied
   single-item change set — one write path, not two.

**Later (the workflow):** preview rendering of proposed-but-unapplied change
sets, approval UI in admin, revert executor (walks items in reverse applying
inverses), agent-facing propose/apply API with capability gating
(`changeSet.apply` as a distinct capability from `changeSet.propose`).

Not a frontend state manager (that's per-session, not durable, invisible to
other actors) and not temp entries (revert must work days later); the same
SQLite database that owns content owns its change history.

## Consequences

- Every mutation write path goes through one function that stamps
  `actorId`/`changeSetId` — worth it: audit trail by construction.
- Inverse capture requires discipline: an entity type is either revisioned
  (before/after revision ids) or must define an inverse payload before it can
  participate in change sets. Entities with neither cannot be mutated by
  agents — that is a feature, not a bug.
- Storage growth is bounded by retention policy per workspace (prune applied
  change sets older than N days; never prune the revisions themselves).
