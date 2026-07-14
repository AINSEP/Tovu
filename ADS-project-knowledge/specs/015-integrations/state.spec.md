# State Contract Spec: integrations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-015`
- Feature: `FEAT-015-integrations`
- Version: `1.0.0`
- Content Hash: anchored in `feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

**As-built note:** this documents the real, tested state shapes in `src/integrations/types.ts` and their real in-memory-adapter behavior (`repo.memory.ts`) — the only persistence layer this pass ships. No SQLite/Drizzle schema exists yet (GAP-05 in `feature.spec.md`); the "durable table" language below describes the shape the ADR-036 §2 DDL sketch and the record types agree on, not a table that actually exists in `drizzle/`.

## Purpose
Defines persistent and derived state, legal transitions, selectors, and invariants for the `integrations` webhook subsystem, independent of implementation language.

## 1) State Shape (per workspace, as materialized by the in-memory repos)

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `subscriptions` | `array<WebhookSubscriptionRecord>` | no | `[]` | All subscriptions for the workspace, keyed `(workspaceId, id)` |
| `deliveries` | `array<WebhookDeliveryRecord>` | no | `[]` | All delivery attempt-groups, keyed `(workspaceId, id)` |
| `envelopes` | `map<deliveryId, WebhookEventEnvelope>` | no | `{}` | Non-port side-channel (`DeliveryEnvelopeStore`) carrying one delivery's outbound payload from Stage A to Stage B — flagged in `repo.memory.ts` as a stand-in seam, not the reviewed port surface (GAP-12) |

## 2) Entity Contracts (mirrors `src/integrations/types.ts` exactly)

```yaml
WebhookSubscriptionRecord:
  id: string (ULID)
  workspaceId: string (UUID)
  ownerPrincipalId: string (UUID)
  label: string
  targetUrl: string
  topics: array<string>
  secretVersion: integer
  previousSecretVersion: integer | null
  status: enum[active, paused, disabled]
  createdByPrincipalId: string (UUID)
  createdByPluginId: string | null
  createdAt: string (ISO-8601 date-time)
  updatedAt: string (ISO-8601 date-time)
  disabledAt: string (ISO-8601 date-time) | null

WebhookDeliveryRecord:
  id: string (ULID)
  workspaceId: string (UUID)
  subscriptionId: string (ULID)
  eventId: string (UUID)
  topic: string
  status: enum[pending, delivering, delivered, failed, dead, canceled]
  attempts: integer
  nextAttemptAt: string (ISO-8601 date-time)
  lastResponseStatus: integer | null
  lastError: string | null
  signedWithVersion: integer | null
  createdAt: string (ISO-8601 date-time)
  deliveredAt: string (ISO-8601 date-time) | null
  deadAt: string (ISO-8601 date-time) | null

WebhookEventEnvelope:
  deliveryId: string (ULID)
  eventId: string (UUID)
  topic: string
  workspaceId: string (UUID)
  occurredAt: string (ISO-8601 date-time)
  data: object (JSON-serializable only)
```

**No secret column exists on `WebhookSubscriptionRecord`** — `secretVersion`/`previousSecretVersion` name a generation only; the material is derived at sign time (never persisted), per the type's own doc comment.

## 3) Action Catalog (state transitions, as implemented by `subscriptions.ts` / `delivery.ts`)

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `CREATE_SUBSCRIPTION` | `CreateSubscriptionInput` | label non-blank after trim; targetUrl is `https://` and passes `isAllowedTarget`; topics non-empty after normalize | Inserts a new row: `status: 'active'`, `secretVersion: 1`, `previousSecretVersion: null` | Throws `WebhookSubscriptionValidationError`; no row inserted |
| `UPDATE_SUBSCRIPTION` | `UpdateSubscriptionInput` | subscription exists; same label/targetUrl/topics validation as create | Overwrites `label`/`targetUrl`/`topics`; bumps `updatedAt`; does NOT touch `status`/`secretVersion`/`previousSecretVersion` | Throws `WebhookSubscriptionNotFoundError` (unknown id) or `WebhookSubscriptionValidationError` (bad input); no row changed |
| `PAUSE_SUBSCRIPTION` (paused=true, default) | `PauseSubscriptionInput` | subscription exists and is not `disabled` | `status → paused`; `updatedAt` bumped | Throws `WebhookSubscriptionNotFoundError` or `WebhookSubscriptionValidationError` (already disabled) |
| `RESUME_SUBSCRIPTION` (paused=false) | `PauseSubscriptionInput` | subscription exists and is not `disabled` | `status → active`; `updatedAt` bumped | Same as pause |
| `DELETE_SUBSCRIPTION` (soft) | `DeleteSubscriptionInput` | subscription exists | `status → disabled`; `disabledAt` and `updatedAt` stamped; row is NEVER removed | Throws `WebhookSubscriptionNotFoundError`; no change |
| `ENQUEUE_DELIVERY` | `WebhookSourceEvent` | none (called per delivered event) | For each matching active subscription without an existing `(eventId, subscriptionId)` delivery: inserts a new `pending` delivery row (`attempts: 0`, `nextAttemptAt: now`) + saves its envelope | Never throws for a duplicate — silently skips (idempotent) |
| `CLAIM_PENDING` | `{ batchSize, nowIso }` | rows exist with `status: 'pending'` and `nextAttemptAt <= nowIso` | Selected rows: `status → delivering`; `attempts += 1` | Returns `[]` if nothing due; never throws |
| `MARK_DELIVERED` | `{ responseStatus, deliveredAtIso }` | row exists | `status → delivered`; `lastResponseStatus` set; `deliveredAt` stamped; `lastError → null` | Silently no-ops if row not found (in-memory adapter) |
| `MARK_FAILED (nextStatus='failed')` | `{ error, responseStatus, nextAttemptAt }` | row exists | `status → pending` (immediately reclaimable once `nextAttemptAt` passes); `lastError`/`lastResponseStatus`/`nextAttemptAt` set | Silently no-ops if row not found |
| `MARK_FAILED (nextStatus='dead')` | `{ error, responseStatus, deadAtIso }` | row exists; `attempts >= maxAttempts` (caller-decided) | `status → dead` (terminal); `deadAt` stamped; `lastError`/`lastResponseStatus` set | Silently no-ops if row not found |

## 4) Selector Contracts (repo query methods, as implemented)

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `listByWorkspace` | `{ workspaceId }` | `array<WebhookSubscriptionRecord>` | Empty array when no subscriptions exist |
| `findById` (subscription) | `{ workspaceId, id }` | `WebhookSubscriptionRecord \| null` | `null` when not found |
| `findMatching` | `{ workspaceId, topic }` | `array<WebhookSubscriptionRecord>` (active only) | Empty array when no active subscription's topics match; ALWAYS empty for a subscription with `topics: []` (fail-closed, never "matches everything") |
| `findById` (delivery) | `{ workspaceId, id }` | `WebhookDeliveryRecord \| null` | `null` when not found |
| `listBySubscription` | `{ workspaceId, subscriptionId, limit }` | `array<WebhookDeliveryRecord>` | Empty array when none exist; no ordering guarantee — callers (routes, `isAlreadyEnqueued`) impose their own order/predicate |
| `claimPending` | `{ batchSize, nowIso }` | `array<WebhookDeliveryRecord>` (copies) | Empty array when nothing is due; sorted by `nextAttemptAt` ascending, capped at `batchSize` |

## 5) State Invariants

- [x] A subscription's `status` is one of exactly `active`, `paused`, `disabled` — never any other string (enum-typed).
- [x] `disabled` is terminal: once a subscription reaches `disabled`, no action in this pass transitions it back to `active`/`paused` (`pauseSubscription`/`deleteSubscription` both guard against this; `updateSubscription` does not check status at all — see `feature.spec.md` EC-02).
- [x] A delivery's `attempts` count only increases (incremented at claim time) and never resets, even across `failed → pending → delivering` cycles.
- [x] `deadAt` is set if and only if `status === 'dead'`.
- [x] `deliveredAt` is set if and only if `status === 'delivered'` (in the in-memory adapter; `markFailed` never sets it).
- [x] `findMatching`'s result set is always a subset of `listByWorkspace`'s result set for the same workspace, further restricted to `status === 'active'` rows whose topics match.

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior, sourced from the real code, not invented.
- [x] Selectors are deterministic (no randomness) and side-effect free, except `claimPending`, which is documented as a claim (a state-mutating "selector" by design — mirrors `OutboxPort`'s own claim/mark shape).
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md` exactly (verified: `status`, `topics`, `secretVersion`/`previousSecretVersion`, delivery `status` enum all match the response DTOs field-for-field).
