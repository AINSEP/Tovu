# Feature Spec: Admin Command Gateway — Auditable, Undoable Mutations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-001 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6 |
| feature_name | FEAT-001-admin-command-gateway |
| last_edited | 2026-07-07T04:15:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

---

## Overview

Every admin mutation in Tovu — whether a human hits save or an AI agent executes a chat-directed task — must run through one command gateway that records an auditable, revertible change set (ADR-008 v1). This feature implements the gateway, the change-set storage, the revert executor with a version guard, and wires the two existing admin mutations (post update, presentation active-theme) through it, plus admin endpoints to list and revert change sets.

---

## Problem Statement

**Current state:** Admin mutations (`updatePost`, `setActiveTheme`) write directly to repositories. Nothing records who changed what, when, or how to undo it. ADR-008 reserved the change-set vocabulary (`actorId`/`changeSetId` on the event envelope) but no implementation exists.

**Desired state:** All admin writes produce durable change-set rows with an inverse payload. An admin (or an AI agent's supervising user) can list recent changes and revert any applied change set whose entity has not since moved on.

**Why now:** The AI-controllable admin plane (AG-UI chat, MCP tools) is next on the roadmap. Retrofitting audit/undo after agents can already mutate content would be a breaking rewrite (ADR-008's stated risk). The write path must exist before the first agent tool call.

**Success signal:** A post edit made through the admin API can be reverted through the change-sets API, restoring prior title/slug/body/status, verified by integration tests; every mutation in the test suite leaves exactly one change-set row.

---

## User Journey

1. **Trigger:** An admin (or later, an AI agent acting for them) saves an edit to a post in the admin shell.
2. **Steps:**
   1. The route wraps the feature call in the command gateway with a summary and actor.
   2. The gateway captures the pre-mutation snapshot, executes the update, and records an auto-applied single-item change set.
   3. The admin opens change history and sees the entry: summary, actor, timestamp.
   4. The admin clicks Revert on that entry.
   5. The gateway checks the version guard, applies the inverse snapshot as a new write, and marks the change set reverted.
3. **Outcome:** The post shows its prior content; history shows the change set as `reverted`; the post's version has increased (never rolled back).
4. **Alternate paths:** If the post was edited again after the change set, revert is refused with a conflict error and the entry stays `applied`. If a retried save reuses an idempotency key, the duplicate is rejected with a reference to the original change set.

---

## Scope

**In scope:**
- `executeCommand` gateway in `src/core/commands/` (single mutation write path) — REQ-01, REQ-02, REQ-11, REQ-12
- Change-set + change-set-item records and an in-memory repository behind a port — REQ-02
- Idempotency-key rejection — REQ-03
- Wiring `PUT …/posts/:postId` and `PATCH …/presentation` through the gateway — REQ-04, REQ-05
- `version` field added to `PresentationSettingsRecord` — REQ-05
- Admin endpoints: list change sets, get change set with items, revert change set — REQ-06, REQ-07
- Version-guarded revert via an inverse-applier registry — REQ-07, REQ-08, REQ-10
- `change-set.applied` / `change-set.reverted` outbox events — REQ-09

**Out of scope:**
- Proposed / multi-item change sets, plans, and approval workflow (agent-plan feature)
- Admin review/undo UI (frontend shells)
- SQLite persistence (Phase 1 workspace extraction; port is shaped for it)
- Authentication, authorization, permission actions (separate feature; fixed local actor for now)
- Agent gateway, MCP/AG-UI/A2A adapters, Tiptap tools
- Revision tables (`beforeRevisionId`/`afterRevisionId` reserved but unused; inline inverse payloads only)
- Retention/pruning of old change sets
- Replay-style idempotency (see OQ-01)

---

## Requirements

- REQ-01: The command gateway executes a mutation only in this order: idempotency check, inverse capture, feature execution, change-set record. Each successful execution records exactly one change set with status `applied` containing exactly one item. The feature mutation, the change-set header, and the change-set item commit **atomically as one unit of work** (one transaction on the SQL adapter; the equivalent all-or-nothing commit on the memory adapter): if the change-set header or item fails to persist after the feature mutation has been applied, the entire unit — including the feature mutation — rolls back, leaving no persistent trace and propagating the error to the caller (INV-01, EC-08). Only outbox event enqueue sits outside this boundary (BR-04).
- REQ-02: A change-set record persists `id`, `workspaceId`, `actorId`, `status`, `summary`, optional `idempotencyKey`, optional `intentRef`, `createdAt`, `appliedAt`; its item persists `entityType`, `entityId`, `operation`, `inversePayload` (nullable), `entityVersionAtApply` (nullable), `position`.
- REQ-03: When a command carries an idempotency key already recorded for the same workspace, the gateway rejects it without executing the mutation, returning error `DUPLICATE_COMMAND` that carries the original change-set id.
- REQ-04: `PUT /api/admin/v1/workspaces/:workspaceId/posts/:postId` executes through the gateway, accepts an optional `Idempotency-Key` header, and returns the same success response shape as before this feature. The route records the change set with the summary `Update post {postId}` (the wired route supplies the non-empty summary the gateway requires).
- REQ-05: `PATCH /api/admin/v1/workspaces/:workspaceId/presentation` executes through the gateway with the summary `Set active theme {activeThemeId}`; the recorded change-set item uses `entityType "presentation-settings"` and `entityId` equal to the `workspaceId` (presentation settings are workspace-keyed — one row per workspace, no standalone id). `PresentationSettingsRecord` gains an integer `version` starting at 1 that increments by exactly 1 on every write; when this feature lands, any pre-existing presentation-settings row is backfilled to `version` 1.
- REQ-06: `GET /api/admin/v1/workspaces/:workspaceId/change-sets` returns the workspace's change sets ordered newest-first; `GET …/change-sets/:changeSetId` returns the record with its items; both are workspace-scoped.
- REQ-07: `POST …/change-sets/:changeSetId/revert` applies each item's inverse in descending `position` order via a registered inverse applier, then sets status `reverted` and stamps `revertedAt`.
- REQ-08: Revert is refused with error `REVERT_CONFLICT` when the target entity's current version does not equal the item's `entityVersionAtApply`; the change set remains `applied` and the entity is unmodified.
- REQ-09: The gateway enqueues a `change-set.applied` outbox event on execution and a `change-set.reverted` event on revert; both events carry `workspaceId`, `actorId`, and `changeSetId`.
- REQ-10: Revert of a change set containing any item with a null `inversePayload` is refused with error `REVERT_NOT_POSSIBLE`; status stays `applied`.
- REQ-11: When the wrapped feature execution throws, the gateway records no change set and enqueues no event; the error propagates unchanged to the caller.
- REQ-12: Until the identity feature lands, all commands record the fixed local actor id `user-local` with kind `user`.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a valid post edit, when it is saved through the gateway, then exactly one change set with status `applied` and exactly one item exists for it, and `appliedAt` equals `createdAt`.
- AC-02 (REQ-02) [P1]: Given a post edit through the gateway, when the recorded item is read, then it contains `entityType "post"`, the post id, operation `update`, an `inversePayload` holding the pre-edit `title`, `slug`, `bodyJson`, `status` — and, when the post carries plugin `ext` data, the pre-edit `ext` snapshot (SPEC-005 owns this reconciliation: the content-entry inverse pre-image captures `ext` alongside core fields so revert restores it, per SPEC-005 BR-08 / AC-17) — and `entityVersionAtApply` equal to the post's version after the edit.
- AC-03 (REQ-03) [P1]: Given a command executed with idempotency key K, when a second command with key K arrives in the same workspace, then no mutation occurs and the caller receives `DUPLICATE_COMMAND` carrying the first command's change-set id.
- AC-04 (REQ-03) [P2]: Given a command executed with idempotency key K in workspace A, when a command with key K arrives in workspace B, then it executes normally.
- AC-05 (REQ-04) [P1]: Given the seeded post, when `PUT …/posts/post-home` succeeds, then the HTTP response body shape equals the pre-feature contract (post fields, no change-set fields) and a change set was recorded whose `summary` is `Update post post-home`.
- AC-06 (REQ-04) [P1]: Given a `PUT …/posts/:postId` with header `Idempotency-Key: K` already used in the workspace, when the request is handled, then the response is HTTP 409 with `code "DUPLICATE_COMMAND"` and the post is unchanged.
- AC-07 (REQ-05) [P1]: Given the seeded presentation settings (backfilled to `version` 1), when the active theme is patched twice, then `version` is 2 then 3, and each patch recorded a change set with the prior `activeThemeId` in its inverse payload, a change-set item with `entityType "presentation-settings"` and `entityId` equal to the workspace id, and a `summary` of `Set active theme {activeThemeId}`.
- AC-08 (REQ-06) [P1]: Given three applied change sets in a workspace, when `GET …/change-sets` is called, then all three return ordered newest-first and none from other workspaces appear.
- AC-09 (REQ-06) [P2]: Given an existing change set id, when `GET …/change-sets/:id` is called, then the response contains the header fields of REQ-02 and its items; an unknown id returns HTTP 404 `CHANGE_SET_NOT_FOUND`.
- AC-10 (REQ-07) [P1]: Given an applied change set for a post edit and no later edits, when revert is called, then the post's `title`, `slug`, `bodyJson`, `status` — and its plugin `ext` data, when present (SPEC-005 AC-17) — equal their pre-edit values, the `content.entry.beforeSave` hook does not fire during the restore (a revert re-applies the pre-image; it is not a genuine create/update, SPEC-005 BR-08), the post `version` increased by 1, and the change set is `reverted` with `revertedAt` set.
- AC-11 (REQ-08) [P1]: Given an applied change set for a post edit followed by another edit of the same post, when revert is called on the first change set, then the response is HTTP 409 `REVERT_CONFLICT`, the post is unchanged, and the change set stays `applied`.
- AC-12 (REQ-07) [P1]: Given a change set already `reverted`, when revert is called again, then the response is HTTP 409 `CHANGE_SET_INVALID_STATUS` and no entity changes.
- AC-13 (REQ-09) [P1]: Given a gateway execution and a revert, when the outbox is inspected, then it contains `change-set.applied` and `change-set.reverted` events each carrying `workspaceId`, `actorId "user-local"`, and the change-set id.
- AC-14 (REQ-10) [P1]: Given a change set whose single item has a null `inversePayload`, when revert is called, then the response is HTTP 422 `REVERT_NOT_POSSIBLE` and the change set stays `applied`.
- AC-15 (REQ-11) [P1]: Given a post edit that fails validation (empty title), when it is submitted through the gateway, then the caller receives the validation error, and no change set and no outbox event were created.
- AC-16 (REQ-12) [P1]: Given any successful command, when its change set is read, then `actorId` equals `user-local`.
- AC-17 (REQ-01) [P1]: Given a post edit whose feature mutation applies but whose change-set item persistence is made to fail (injected adapter error), when it is submitted through the gateway, then the caller receives the error, the post is unchanged (feature mutation rolled back), and no change set and no outbox event exist — proving the mutation and its record commit atomically (INV-01, EC-08).

---

## Invariants

- INV-01: A mutation through the gateway must always either complete with exactly one recorded change set or leave no persistent trace — never a mutation without a record, never a record without a mutation.
- INV-02: A change-set status must only ever transition `applied → reverted`; `reverted` is terminal. (`proposed`/`discarded` are reserved vocabulary, unreachable in this feature.)
- INV-03: Every domain event emitted by the gateway or revert executor must carry non-empty `workspaceId`, `actorId`, and `changeSetId`.
- INV-04: An entity's `version` must never decrease; revert must always write a new, higher version.
- INV-05: Revert must never partially apply: if any item's guard or applier resolution fails, no item's inverse may be applied.

---

## Edge Cases

- EC-01: What happens when revert is called on a change set that is already `reverted`?
  Expected behavior: HTTP 409 `CHANGE_SET_INVALID_STATUS`; no entity change; `revertedAt` unchanged.
- EC-02: What happens when revert is called with an unknown change-set id?
  Expected behavior: HTTP 404 `CHANGE_SET_NOT_FOUND`.
- EC-03: What happens when the entity referenced by a change-set item no longer exists at revert time?
  Expected behavior: revert fails with HTTP 409 `REVERT_CONFLICT` (guard cannot verify version); change set stays `applied`.
- EC-04: What happens when the wrapped feature call throws after inverse capture?
  Expected behavior: no change set recorded, no event enqueued, error propagates (AC-15).
- EC-05: What happens when `captureInverse` returns null (entity type without snapshot support)?
  Expected behavior: the change set records with null `inversePayload` and is not revertible (AC-14).
- EC-06: What happens when no inverse applier is registered for an item's `entityType`/`operation` at revert time?
  Expected behavior: HTTP 422 `REVERT_NOT_POSSIBLE`; change set stays `applied`; no partial application.
- EC-07: What happens when two concurrent requests supply the same new idempotency key?
  Expected behavior: with the current single-process in-memory adapter, requests are serialized by the event loop; the second receives `DUPLICATE_COMMAND`. Multi-process uniqueness is deferred to the SQLite adapter (unique index on `(workspaceId, idempotencyKey)`).

- EC-08: What happens when the feature mutation succeeds but persisting the change-set header or item then fails (e.g. a SQL adapter error)?
  Expected behavior: the whole unit of work rolls back (REQ-01, BR-04) — the feature mutation is undone, no change set and no outbox event exist, and the underlying error propagates to the caller. INV-01 holds: there is no mutation without a record.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `src/core/ports.ts` | `DomainEvent` envelope with `actorId`/`changeSetId`, `ClockPort`, `IdGeneratorPort`, `OutboxPort` | Type drift breaks event stamping | none — blocks feature |
| `src/features/post` | `updatePost`, `PostRepoPort`, `version` field | Contract change breaks inverse applier | none — blocks REQ-04 |
| `src/features/presentation` | `setActiveTheme`, `PresentationSettingsRepoPort` | Missing `version` field blocks guard | Add field in this feature (REQ-05) |
| `src/core/events` outbox | Reliable async delivery of change-set events | Events not delivered; audit projection stale | Change-set rows remain source of truth; events re-enqueueable |
| Express route layer (`server/routes`) | HTTP transport for new endpoints | none beyond existing app | none — existing infrastructure |

---

## Open Questions

- OQ-01: Should idempotency later replay the stored response instead of rejecting (better agent ergonomics)? — Owner: Leon Aburime — Resolve by: 2026-07-16 (agent-gateway feature kickoff)
- OQ-02: Retention/pruning policy for applied change sets (ADR-008 mentions per-workspace retention) — Owner: Leon Aburime — Resolve by: Phase 1 SQLite migration
- OQ-03: Source of real actor identity once auth lands (session principal vs delegated agent principal) — Owner: Leon Aburime — Resolve by: permissions feature spec

---

## Constitution Compliance

Note: `ADS-project-knowledge/governance/constitution.md` is not yet bootstrapped for this project; the toolkit default articles are applied. Flagged to Coordinator for post-spec bootstrap.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No suitable in-repo or approved library implements change-set semantics; core module is justified custom code on existing ports. |
| II — Test-First | COMPLIES | TDD Agent dispatched before Programmer; draft code written pre-pipeline will be reconciled against certified tests. |
| III — Simplicity Gate | COMPLIES | Every module (`command.ts`, `change-set.ts`, `revert.ts`, `repo.memory.ts`, routes) traces to REQ-01…REQ-12. |
| IV — Anti-Abstraction Gate | COMPLIES | `ChangeSetRepoPort` has two planned adapters (memory now, SQLite Phase 1) satisfying ADR-006 rule-of-two; no other new abstractions. |
| V — Integration-First Testing | COMPLIES | P1 ACs specified at HTTP route level where applicable (AC-05…AC-14). |
| VI — Security-by-Default | EXCEPTION | No authentication exists in the Tovu dev server yet; endpoints are local-dev only. Security Agent review still required; auth arrives with the permissions feature. Recorded in api.spec.md auth profiles. |
| VII — Spec Integrity | COMPLIES | All downstream stages must reference SPEC-001 v1.0.0 and its content hash. |
| VIII — Observability | COMPLIES | Error registry defines structured payloads; change-set events instrument the write path; correlation via `changeSetId`. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-project-knowledge/reports/pipeline/` folders — none existed)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has ordering and guard-precedence rules)
- [x] traceability.spec.md complete (marked "pending implementation")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield`: evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Follow `AGENTS.md` (repo root) conventions, mirrored in each module's `INFO.md`: parameter objects (required first, optional second defaulting to `{}`), `INFO.md` + `index.ts` per module, `__tests__/` and `__specs__/` folders.
- Keep `core/commands` provider-agnostic — depend only on `core/ports` contracts.

Ask before:
- Changing the response shape of the existing post-update or presentation-patch endpoints.
- Introducing any persistence beyond the in-memory adapter.

Never:
- Add domain logic to route handlers.
- Allow a mutation path that bypasses the gateway in `server/routes/admin/`.
