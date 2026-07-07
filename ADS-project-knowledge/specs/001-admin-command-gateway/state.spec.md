# State Contract Spec: Admin Command Gateway — Auditable, Undoable Mutations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-001`
- Feature: `FEAT-001-admin-command-gateway`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-02T20:45:00Z`

## Purpose
Defines the durable change-set state, legal transitions, and invariants (ADR-008 v1 storage shape). This is backend durable state, not frontend store state.

## 1) State Shape (durable rows)

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `changeSets` | `array<ChangeSetRecord>` | no | `[]` | One row per executed or reverted command |
| `changeSetItems` | `array<ChangeSetItemRecord>` | no | `[]` | One row per entity mutation inside a change set |

## 2) Entity Contracts

```yaml
ChangeSetRecord:
  id: string (uuid)
  workspaceId: string             # required — structural scoping (ADR-007)
  actorId: string                 # "user-local" until identity feature (REQ-12)
  status: enum[proposed, applied, reverted, discarded]   # v1 emits only applied|reverted
  summary: string                 # human-readable, non-empty
  idempotencyKey: string|null     # unique per (workspaceId, idempotencyKey) when present
  intentRef: string|null          # chat message / plan step reference (reserved)
  createdAt: string (date-time)
  appliedAt: string (date-time)|null    # == createdAt for auto-applied v1 change sets
  revertedAt: string (date-time)|null

ChangeSetItemRecord:
  id: string (uuid)
  changeSetId: string (uuid)
  entityType: string              # applier-registry key, e.g. "post", "presentation-settings"
  entityId: string
  operation: enum[create, update, delete, activate]
  beforeRevisionId: string|null   # reserved (revisions feature); always null in v1
  afterRevisionId: string|null    # reserved; always null in v1
  inversePayload: object|null     # snapshot sufficient to undo; null => not revertible
  entityVersionAtApply: integer|null   # entity version AFTER the mutation; guard input (REQ-08)
  position: integer               # apply order; revert walks descending

PresentationSettingsRecord:      # MODIFIED by this feature (REQ-05)
  workspaceId: string
  activeThemeId: string
  updatedAt: string (date-time)
  version: integer               # NEW — starts at 1, +1 per write
```

## 3) Action Catalog (state-changing operations)

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `EXECUTE_COMMAND` | envelope + mutation | idempotency key unused in workspace (when present) | insert 1 `ChangeSetRecord` (status `applied`) + 1 `ChangeSetItemRecord`; entity mutated by feature call | feature error ⇒ no rows inserted (REQ-11); duplicate key ⇒ no rows, no mutation (REQ-03) |
| `REVERT_CHANGE_SET` | workspaceId + changeSetId | status == `applied`; all items have applier + inversePayload; version guard passes per item | entity restored via inverse (new higher version); record status → `reverted`, `revertedAt` set | any precondition failure ⇒ zero entity writes, status unchanged (INV-05) |

## 4) Status Lifecycle

```
applied ──revert──▶ reverted (terminal)
proposed / discarded: reserved vocabulary (ADR-008 later phase) — no v1 transition reaches them
```

Illegal transitions (must be impossible or rejected): `reverted → *`, `applied → proposed`, any transition on a missing record.

## 5) Selector Contracts (repo port reads)

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `findById` | workspaceId, id | `{changeSet, items[]}` or null | null when unknown or other workspace |
| `findByIdempotencyKey` | workspaceId, key | `ChangeSetRecord` or null | null when unused |
| `listByWorkspace` | workspaceId | `ChangeSetRecord[]` newest-first | empty array |

## 6) Invariants (state-level)

- A `ChangeSetItemRecord` must always reference an existing `ChangeSetRecord` (`changeSetId` FK).
- `(workspaceId, idempotencyKey)` must be unique among records with a non-null key.
- `revertedAt` must be non-null iff `status == reverted`.
- `entityVersionAtApply` is immutable once written.
- Items of one change set have unique, contiguous `position` starting at 0.

## 7) Persistence Notes

- v1 adapter: in-memory (`InMemoryChangeSetRepo`), matching every existing Tovu repo.
- The port is shaped so the Phase 1 SQLite adapter is a drop-in: tables `change_sets`, `change_set_items` per ADR-008, with a unique index on `(workspaceId, idempotencyKey)` and FK `change_set_items.changeSetId → change_sets.id`.
- `inversePayload` stored as validated JSON text in SQLite, `jsonb` in Postgres (PROJECT_MEMORY portability rule).
