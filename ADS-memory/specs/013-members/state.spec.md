# State Contract Spec: Members (As-Built)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-013`
- Feature: `FEAT-013-members`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

## Purpose
Defines the domain record shapes and transitions the `members` library manages today, and states
plainly what persistence layer actually backs them. Unlike ADR-030 §6's described "dedicated core
tables under the ADR-022 §4 chokepoint discipline," **no database table exists for any of these
records** — every repo port has exactly one adapter, and it is in-memory
(`src/members/repo.memory.ts`). `feature.spec.md` REQ-18 documents this gap.

## 1) State Shape (in-memory only — no persistent table exists)
| Record | Key | Nullable Cols | Initial | Description |
|---|---|---|---|---|
| `MemberRecord` | `(workspaceId, id)` | `name`, `emailVerifiedAt`, `note`, `fields` | empty array | The member account/profile |
| `MemberTierRecord` | `(workspaceId, id)` | `description`, `welcomePagePath`, `monthlyPriceCents`, `yearlyPriceCents`, `currency` | empty array | Membership tier registry row |
| `MemberSubscriptionRecord` | `(workspaceId, id)` | `externalRef`, `currentPeriodEnd`, `canceledAt` | empty array | A member's entitlement join to a tier |
| `MemberSessionRecord` | `(workspaceId, id)`, looked up by `tokenHash` | `revokedAt`, `lastSeenAt`, `userAgent`, `ip` | empty array | A member sign-in session, distinct from the operator session |
| `MagicLinkTokenRecord` | `(workspaceId, id)`, looked up by `tokenHash` | `consumedAt` | empty array | A single-use passwordless sign-in credential |

## 2) Entity Contracts
```yaml
MemberRecord:
  id: string (ULID)                 # principal id; disable-only, never removed
  workspaceId: string
  email: string                     # unique per workspace by convention; not DB-enforced (no DB)
  name: string|null
  emailVerifiedAt: string (date-time)|null
  status: enum[pending, active, disabled]
  note: string|null                 # operator-only; never serialized to the admin API (api.spec.md)
  fields: object|null               # namespaced ext bag, unused by any current caller
  createdAt: string (date-time)
  updatedAt: string (date-time)
  version: integer                  # optimistic-concurrency counter, incremented on every save

MemberTierRecord:
  id: string (ULID)
  workspaceId: string
  name: string
  slug: string                      # unique per workspace by convention; not DB-enforced
  type: enum[free, paid]
  status: enum[active, archived]
  description: string|null
  welcomePagePath: string|null
  visibleInPortal: boolean
  monthlyPriceCents: integer|null   # billing seam, never populated by any code path in v1
  yearlyPriceCents: integer|null
  currency: string|null
  createdAt: string (date-time)
  updatedAt: string (date-time)
  version: integer

MemberSubscriptionRecord:
  id: string (ULID)
  workspaceId: string
  memberId: string
  tierId: string
  status: enum[active, canceled, expired, comped]
  source: enum[signup, comp, billing]   # only 'comp' is ever produced by code in v1
  externalRef: string|null
  startedAt: string (date-time)
  currentPeriodEnd: string (date-time)|null
  canceledAt: string (date-time)|null
  createdAt: string (date-time)
  updatedAt: string (date-time)
  version: integer

MemberSessionRecord:
  id: string (ULID)
  workspaceId: string
  memberId: string
  tokenHash: string                  # SHA-256 hex digest; raw token never stored
  createdAt: string (date-time)
  expiresAt: string (date-time)      # createdAt + 30 days, an unpinned default (behavior.spec.md)
  revokedAt: string (date-time)|null
  lastSeenAt: string (date-time)|null
  userAgent: string|null
  ip: string|null

MagicLinkTokenRecord:
  id: string (ULID)
  workspaceId: string
  memberId: string                   # non-optional; see behavior.spec.md §1 for the upsert-on-request resolution
  tokenHash: string                  # SHA-256 hex digest; raw token never stored
  purpose: enum[signin, signup, email_change]   # only 'signin' is ever produced by code in v1
  createdAt: string (date-time)
  expiresAt: string (date-time)      # createdAt + 15 minutes
  consumedAt: string (date-time)|null
```

## 3) Action Catalog
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `REQUEST_SIGN_IN_LINK` | `{workspaceId, email, redirectPath?}` | none (any syntactically valid email) | upsert `pending` `MemberRecord` if absent; insert `MagicLinkTokenRecord`; send mail | reject `MemberValidationError` on bad email format only; disabled/unregistered emails silently no-op |
| `COMPLETE_SIGN_IN` | `{workspaceId, token, userAgent?, ip?}` | token exists, unconsumed, unexpired; member not disabled | consume token; promote `pending→active` + set `emailVerifiedAt`; insert `MemberSessionRecord` | reject `MemberAuthError` (invalid/used/expired/disabled); reject `MemberNotFoundError` (defensive, should not occur) |
| `UPDATE_PROFILE` | `{workspaceId, memberId, name?, note?}` | member exists | update `name`/`note`, bump `version` | reject `MemberNotFoundError`; reject `MemberValidationError` (blank name) |
| `DISABLE_MEMBER` | `{workspaceId, memberId}` | member exists | set `status='disabled'`; revoke all live sessions | reject `MemberNotFoundError`; idempotent no-op if already disabled |
| `COMP_SUBSCRIPTION` | `{workspaceId, memberId, tierId}` | member + active tier exist; no existing active/comped sub to that tier | insert `MemberSubscriptionRecord {status:'comped', source:'comp'}` | reject `MemberNotFoundError` (member/tier); reject `MemberValidationError` (archived tier); reject `MemberConflictError` (duplicate) |
| `SET_SUBSCRIPTION_STATUS` | `{workspaceId, subscriptionId, status, externalRef?}` | subscription exists; `status` in the valid enum | update `status`/`externalRef`; set `canceledAt` iff `status='canceled'` | reject `MemberNotFoundError`; reject `MemberValidationError` (bad status) |

## 4) Selector Contracts
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `MemberRepoPort.list` | `{workspaceId, afterId?, limit?}` | keyset page of `MemberRecord[]`, id-ordered | empty array when no members; page capped at 100 by the in-memory adapter regardless of a larger `limit` |
| `MemberSubscriptionRepoPort.listActiveByMember` | `{workspaceId, memberId, nowIso}` | `MemberSubscriptionRecord[]` with `status ∈ {active,comped}` and (`currentPeriodEnd` absent or in the future) | empty array when no active entitlement |
| `MemberSessionRepoPort.findByTokenHash` | `{workspaceId, tokenHash}` | `MemberSessionRecord|null` | `null` on no match; validity (`revokedAt`/`expiresAt`) is NOT checked here — the caller (`DefaultMemberAccessResolver`) decides validity |
| `MagicLinkTokenRepoPort.findByTokenHash` | `{workspaceId, tokenHash}` | `MagicLinkTokenRecord|null` | `null` on no match |

## 5) State Invariants
- [x] A `MemberRecord` is never physically removed from the in-memory store; `disableMember` only
      ever mutates `status` (INV-01).
- [x] `MagicLinkTokenRecord.consumedAt`, once set, is never cleared (INV-02); `InMemoryMagicLinkTokenRepo.consume`
      throws a plain `Error` (not a domain error) if asked to consume an already-consumed or
      missing token — defense-in-depth below the write-service's own check.
- [x] `MemberSessionRecord.tokenHash` / `MagicLinkTokenRecord.tokenHash` are always a SHA-256 hex
      digest, never the raw bearer value (INV-03).
- [x] `listActiveByMember` never returns a subscription whose `currentPeriodEnd` has passed, even if
      `status` was not yet transitioned to `expired` (EC-07 in `feature.spec.md`).

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `errors.spec.md`.
- [x] The absence of a persistent table is stated explicitly, not implied by omission.
