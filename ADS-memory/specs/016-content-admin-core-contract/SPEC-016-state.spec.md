# State Contract Spec: content-admin-core-contract

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-016`
- Feature: `FEAT-016-content-admin-core-contract`
- Version: `1.4.0`
- Content Hash: `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f`
- Last Edited: `2026-07-15T05:00:00Z`

## Purpose

Defines the durable state this core contract itself owns: the `storage_write_watermark` counter
and its sidecar mirror, and the confirmation-token lifecycle. This is backend/durable state, not
UI/orchestrator client state — each dependent domain spec owns its own UI-facing state contract.
This file also directly instantiates the composite actor-identity flavor of REQ-18's soft
cross-boundary reference rule (`ActorIdentityRef`/`APPEND_ACTOR_REFERENCE` below); the
polymorphic-content-reference flavor of the same rule has no concrete entity here because no
concrete polymorphic reference table exists in this contract's own schema — see REQ-18's note in
`feature.spec.md`.

## 1) State Shape

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `watermark.value` | `integer (64-bit signed; for a SQLite-backed site, matches SQLite's native INTEGER affinity per feature.spec.md REQ-01 — for a Postgres-backed site post-migrate-forward, stored as a BIGINT column, self-defined by this contract per feature.spec.md REQ-01, not owned by SPEC-017)` | no | `0` | Authoritative counter, stored in `content.db` (SQLite-backed) or its Postgres-backed `BIGINT`-column equivalent (both defined by this contract) |
| `watermark.lastStampedAt` | `string (date-time)` | yes | `null` | Timestamp of the most recent stamp |
| `mirror.value` | `integer` | no | `0` | Sidecar ops-journal mirror of `watermark.value` |
| `mirror.staleness` | `MirrorStaleness` | no | `'fresh'` | Whether the mirror is known-current or unrefreshable |
| `confirmationToken.status` | `TokenStatus` | no | n/a — created only on `confirm()` success | Lifecycle state of a minted token |
| `confirmationToken.expiresAt` | `string (date-time)` | no | `createdAt + 600 seconds (exact, no jitter)` | Fixed TTL per REQ-10 |
| `restorePoint.watermarkAtCapture` | `integer` | no | n/a — required at creation | REQ-06's required baseline column |

## 2) Entity Contracts
```yaml
MirrorStaleness: enum[fresh, unrefreshable]
  # 'unrefreshable' only when content.db could not be opened at the last boot reconciliation attempt (REQ-04/REQ-05)

TokenStatus: enum[minted, redeemed, expired]

ConfirmationToken:
  planHash: string          # sha256:<hex>
  scopeId: string            # domain-defined (e.g. siteId, workspaceId)
  confirmerPrincipalId: string
  status: TokenStatus
  createdAt: string (date-time)
  expiresAt: string (date-time)

WatermarkState:
  value: integer
  lastStampedAt: string (date-time) | null

MirrorState:
  value: integer
  staleness: MirrorStaleness
  lastReconciledAt: string (date-time) | null

ActorIdentityRef:
  actorWorkspaceId: string
  actorId: string
  delegatedByWorkspaceId: string | null   # populated only when the action was performed by a
                                            # delegated agent (kind='agent') or by an api_key
                                            # acting for its owning user (kind='api_key') — REQ-16
  delegatedById: string | null             # the agent's delegator, or the api_key's owning user
```

## 3) Action Catalog

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `STAMP_WATERMARK` | none (implicit — caller's own transaction) | caller holds an open `content.db` transaction | `watermark.value += 1`, `watermark.lastStampedAt = now` | rejected if called outside an open transaction (AC-02) |
| `RECONCILE_MIRROR` | none | boot, or a periodic tick | if `content.db` opens: `mirror.value = watermark.value`, `mirror.staleness = 'fresh'`; else `mirror.staleness = 'unrefreshable'` | never derives `mirror.value` from `storage_ledger` (REQ-04) |
| `MINT_TOKEN` | `{planId, planHash}` | caller is `kind='user'` and holds the gated mutation's permission (`authorize()` passes) | creates `ConfirmationToken` with `status='minted'` | rejected (no token created) if `authorize()` denies, or caller is not `kind='user'` |
| `REDEEM_TOKEN` | `{confirmationToken}` | `authorize()` passes fresh; token `status='minted'`; token unexpired; actor-class rule satisfied; recomputed plan hash matches | `confirmationToken.status = 'redeemed'` | `PLAN_STALE` / `TOKEN_EXPIRED` / `TOKEN_ALREADY_REDEEMED` / `FORBIDDEN` (with `details.reasonCode` set to `'AUTHORIZE_DENIED'` or `'ACTOR_CLASS_MISMATCH'` per which producer rejected it) per which precondition failed, evaluated in that order (behavior.spec.md §2.2); a `confirmationToken` string that does not resolve to any minted token record is treated identically to `TOKEN_EXPIRED` (REQ-11, AC-35) — never a distinct code, to avoid disclosing whether the string was ever issued |
| `EXPIRE_TOKEN` | none (time-driven) | `now > expiresAt` and `status='minted'` | `confirmationToken.status = 'expired'` | none — a subsequent redeem attempt on an expired token returns `TOKEN_EXPIRED` |
| `APPEND_ACTOR_REFERENCE` | `{actorWorkspaceId, actorId, delegatedByWorkspaceId?, delegatedById?}` | the writing chokepoint has independently validated the referenced principal's existence and workspace ownership via the core-mediated write path (REQ-18) | a new ledger/audit/revision row is appended carrying the composite `ActorIdentityRef` pair (REQ-16), populated only by the core-mediated write path at append time, never enforced by a database foreign key (REQ-17) | orphan-tolerant on read — a reference whose target was later deleted is filtered out of read results, never a read error (REQ-18, AC-25); swept by the next periodic or boot-time reconciliation sweep (REQ-18, AC-26) |

## 4) Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `getCurrentWatermark` | none | `{ value: integer, source: 'content.db' \| 'sidecar-mirror-stale' }` | returns the mirror's last-known value with `source='sidecar-mirror-stale'` when `content.db` cannot be opened, never throws |
| `isTokenRedeemable` | `ConfirmationToken` | `boolean` | `false` whenever `status !== 'minted'` or `now > expiresAt` |
| `isMirrorStale` | `MirrorState` | `boolean` | `true` when `staleness === 'unrefreshable'` |
| `computeDiscardedCount` | `(restorePoint, currentWatermark, coveredCategories)` | `{ counts: Record<string, integer \| 'unknown'>, partial: true }` | any category not in `coveredCategories` is omitted entirely, never defaulted to `0` |

## 5) State Invariants
- [x] `watermark.value` never decreases (INV-01).
- [x] `restorePoint.watermarkAtCapture` is never greater than the live `watermark.value` at the
      moment that restore point row was written (INV-02).
- [x] A `ConfirmationToken` never transitions from `redeemed` or `expired` back to `minted`
      (INV-03 — no un-redeeming).
- [x] `MINT_TOKEN` never succeeds for a principal that does not already hold the required
      permission at mint time (INV-04).
- [x] `mirror.staleness` is `'unrefreshable'` only immediately following a boot/reconciliation
      attempt where `content.db` failed to open — it is never set speculatively.

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `orchestrator.spec.md`. (No `ui.spec.md`
      exists for this core contract — see `spec-manifest.md`.)
