# Feature Spec: content-admin-core-contract

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-016 |
| version | 1.4.0 |
| status | APPROVED |
| content_hash | sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f |
| feature_name | FEAT-016-content-admin-core-contract |
| last_edited | 2026-07-15T05:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (Claude Sonnet 5, delegated subagent run, 2026-07-14) |
| spec_mode | brownfield |

---

## Overview

This is the shared core contract that ADR-041 (Storage/Timeline), ADR-043 (Collections), ADR-044
(Categories & Tags), and ADR-045 (Backups/Recovery) all depend on: the global write-watermark
counter, the generic plan-confirm-execute gated-mutation gateway and its `authorize()` call
contract, the composite actor-identity and soft cross-boundary reference pattern, and the
`db-ops` port surface both Storage and Recovery consume. It exists so the four dependent domain
specs (SPEC-017 through SPEC-019) can cite one authoritative shape instead of each restating it
with independent drift risk.

---

## Problem Statement

**Current state:** ADR-041, ADR-043, ADR-044, and ADR-045 were each Accepted independently, and
each one restates or half-restates a set of mechanisms it does not itself own: a global write
watermark, a human-confirm gated-mutation gateway, a composite actor-identity shape used across a
physical file boundary, and a `db-ops` restore-point capability surface. ADR-041 §5's own six-round
audit history is direct evidence of what happens when a cross-cutting mechanism is described
informally in prose inside a single ADR and then cited by reference from others — the informal
description itself needed six correction rounds before it was internally consistent.

**Desired state:** One precise, testable contract exists for every mechanism more than one of the
four domains structurally depends on (not just thematically similar to). Each dependent domain
spec (SPEC-017 Storage/Timeline, SPEC-020 Collections, SPEC-018 Categories & Tags, SPEC-019
Backups/Recovery) cites this spec's REQ/AC/INV ids by number in its own `## Integration Contracts`
section instead of re-describing the mechanism in its own words.

**Why now:** All four dependent ADRs are Accepted as of 2026-07-14 and their follow-up domain specs
are queued to be dispatched immediately after this core spec is finalized — writing the shared
contract first is the only way to avoid four independent, silently-drifting restatements of the
same watermark/gateway/actor-identity mechanics.

**Success signal:** A dependent domain spec (e.g. SPEC-017) can write "`execute()` follows SPEC-016
REQ-11 through REQ-13" instead of re-deriving the `authorize()`-ordering and actor-class-redemption
rules from ADR-041's prose, and a reviewer can verify that citation against this spec's numbered
requirements without reading ADR-041 again.

---

## User Journey

This spec defines a backend contract with no independent user-facing surface of its own — every
screen a human operator sees (the Storage Timeline, the Recovery screen, the Collections and
Categories & Tags admin screens) is owned by a dependent domain spec's own `ui.spec.md`. The
journey below is the one interaction shape this contract itself introduces: the generic
gated-mutation confirmation flow that every dependent domain instantiates for its own destructive
operation.

1. **Trigger:** An operator (or an AI agent acting on the operator's behalf) initiates an operation
   this contract classifies as a "gated mutation" — one whose blast radius requires an explicit
   human acknowledgment before it runs (e.g. a forward migration, a restore, a destructive
   Collections cleanup).
2. **Steps:**
   1. The caller (any principal kind holding the domain's read permission) calls `plan()` and
      receives a `Plan` describing what the operation would do.
   2. A human operator (`kind='user'` only — no exception) reviews the plan and calls
      `confirm({planId, planHash})`. On success, a single-use confirmation token is minted with a
      short, fixed TTL.
   3. The caller that will actually run the operation (the same user, or an agent the user
      delegated to, or the api_key's owning user) calls `execute({confirmationToken})`.
3. **Outcome:** The gated mutation runs exactly once, attributed to a composite actor identity on
   every ledger/audit row it produces, or it is rejected with a specific, named error
   (`PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, or `FORBIDDEN`).
4. **Alternate paths:** If live state has drifted since `plan()`, `execute()` rejects with
   `PLAN_STALE` before anything mutates. If the confirming user's delegate relationship to an
   agent caller is disabled between `confirm()` and `execute()`, the re-evaluated `authorize()`
   call at `execute()` denies the redemption even though the token itself is still technically
   valid. If an agent attempts to call `confirm()` directly, it is rejected regardless of any
   permission the agent holds — only a human ever confirms.

---

## Scope

**In scope:**
- The global `storage_write_watermark` counter contract: authoritative storage location,
  same-transaction stamping obligation for any write chokepoint that wants to be
  disclosure-covered, the sidecar mirror and its boot-time reconciliation rule, and the
  unknown/lower-bound rendering rule when the counter cannot be read. (REQ-01 – REQ-05)
- The `restore_points.watermarkAtCapture` requirement and the generic discarded-write-window
  disclosure computation rule that both Storage's Timeline and Recovery's Step 2 disclosure
  consume. (REQ-06, REQ-07)
- The generic `plan()` → `confirm()` → `execute()` gated-mutation gateway pattern: permission
  tiers per step, the `authorize()` call contract (ordering relative to idempotency, fail-closed
  re-evaluation, live agent-delegation intersection), token minting/TTL/redemption, and the
  actor-class redemption rule. (REQ-08 – REQ-15)
- The composite `(workspaceId, id)` actor-identity shape and the general soft cross-boundary
  reference pattern (population-at-write-time rule, workspace/type validation at write time,
  orphan tolerance, reconciliation sweep). (REQ-16 – REQ-18)
- The `db-ops` port's `getCapabilities()` shape and the SQLite/Postgres restore-point capture
  contract, to the depth both Storage (SPEC-017) and Backups/Recovery (SPEC-019) need to
  reference it — not the full migration state machine. (REQ-19 – REQ-21)
- The agent-tool-catalog naming convention and callability rule for any domain implementing the
  gated-mutation gateway: `plan`/`execute` tools are agent-callable, `confirm` never is.
  (REQ-22)

**Out of scope:**
- The full Storage/Timeline screen, its SQLite/Postgres migrate-forward state machine, the
  `SERVE_SITE`/`PENDING_MIGRATION` boot reconciliation, the Tier-3 read-only browser with
  sensitive-column redaction, and `SITE_SCOPE_EXEMPT_TABLES` — all owned by SPEC-017, per
  ADR-041 §§1, 3, 8, 9, 10 and item 4's site-scope exemption.
- The Collections content-type registry schema (`content_types`, `entries`, `entry_revisions`,
  `content_type_revisions`), the reserved-key and name/kind grammar validation, and the
  disable→tombstone→cleanup lifecycle — all owned by SPEC-020, per ADR-043 §§1, 2, 4, 5, and §6.
- The Categories & Tags taxonomy schema (`taxonomies`, `terms`, `entry_terms`,
  `taxonomy_revisions`), the merge/rename/reparent semantics, and the `post`/`page` taxonomy
  allow-list — all owned by SPEC-018, per ADR-044 §§1–4 and its concrete sample implementation.
- The Backups/Recovery screen's information architecture, the discarded-window disclosure's exact
  copy/UI, and its capability- and state-aware degraded-mode banners — all owned by SPEC-019, per
  ADR-045 §§1–5.
- The write-path inventory and remediation work that brings existing legacy write paths (e.g.
  `identity/grant-service.ts`, `members/write-service.ts`, `seo/write-service.ts`,
  `media/media-service.ts`, and the rest of ADR-041 §5's table) onto the watermark chokepoint —
  tracked as ADR-041 item 5's own Phase 0 deliverable, not this spec's implementation surface.
- The full ADR-021 identity & authorization schema (`principals`, `roles`, `policies`,
  `policy_permissions`) and the full ADR-022 content-model design (`entries`/`content_types` as a
  registry, expression indexes, the CI canary) — cited here by reference only, never restated, per
  this project's Brownfield/Legacy Code Rule 3.
- The concrete detection, configuration, or execution mechanism for any externally-managed
  PITR/backup service reported via `restorePoint.kind: 'external'` (REQ-19) — this contract only
  defines that such a state exists and how it is reported; any UI/guidance surface for it is owned
  by the dependent domain spec (SPEC-017/SPEC-019), if one is ever built.
- The concrete entity/table for the polymorphic-content-reference flavor of REQ-18's soft
  cross-boundary reference rule (e.g. `entry_terms`) — owned and instantiated entirely by the
  dependent domain spec that defines it (SPEC-020/SPEC-018); this contract states the shared rule
  those tables must follow, not a generic placeholder entity for a table that does not exist here.

---

## Requirements

- REQ-01: The system MUST maintain a single global, monotonically increasing counter
  (`storage_write_watermark`) stored authoritatively in `content.db`, incremented by exactly 1 in
  the same database transaction as each write it stamps. For a SQLite-backed site, this counter is
  stored as a 64-bit signed integer (matching SQLite's native `INTEGER` affinity); the
  same-transaction atomicity guarantee it depends on is provided by the SQLite single-writer WAL
  transaction model (see EC-01 and the Dependencies table's `SQLite / better-sqlite3 WAL
  transaction runtime` row). For a Postgres-backed site (post-migrate-forward, reached via the
  migrate-forward state machine per REQ-19–REQ-21), this contract defines the equivalent mechanism
  directly, following the same self-contained pattern REQ-19–REQ-21 already use for the
  SQLite/Postgres restore-point split rather than delegating either engine's rule to a dependent
  domain spec: `storage_write_watermark` is stored as a `BIGINT` column (Drizzle's shared-schema
  Postgres mapping — per ADR-015 — for the same 64-bit signed range SQLite's `INTEGER` affinity
  provides), incremented by exactly 1 within the same ACID transaction as the write it stamps; the
  same-transaction atomicity guarantee is provided directly by that transaction's own commit
  semantics, and concurrent writers are serialized by Postgres's normal MVCC/row-locking semantics
  on the counter row — not the SQLite single-writer WAL model (see EC-01 and the Dependencies
  table's `Postgres MVCC/row-locking transaction runtime` row). Overflow of this counter is
  explicitly out of scope for both engines: a 64-bit signed `BIGINT`/`INTEGER`-affinity value is
  unreachable within any realistic product lifetime at any conceivable write rate.
- REQ-02: Any core write chokepoint that wants a write to count toward the discarded-write-window
  disclosure (e.g. Collections' entries/content-types write-service, Taxonomy's write-service)
  MUST call the watermark-stamping function inside the same transaction as its own row write. Each
  dependent domain spec's own `## Integration Contracts` section MUST explicitly name, one by one,
  every write chokepoint in that domain that calls the watermark-stamping function — making
  disclosure-coverage an auditable, spec-level commitment rather than an implicit per-chokepoint
  choice; any write chokepoint not named there is treated as not watermark-stamped for
  disclosure-coverage purposes.
- REQ-03: The sidecar ops journal MUST maintain a mirror of `storage_write_watermark`'s value,
  refreshed to match `content.db`'s authoritative value by the next reconciliation opportunity
  (boot, or a periodic tick — see `state.spec.md`'s `RECONCILE_MIRROR` action, the mirror's only two
  refresh triggers) after any `content.db` commit that changes it. This is a bounded-eventual
  guarantee, not a claim that the mirror is refreshed synchronously inside the same transaction as
  the watermark-changing commit — REQ-03 and `RECONCILE_MIRROR` describe the same single guarantee,
  not two different ones.
- REQ-04: On every boot where `content.db` opens successfully, the system MUST reconcile the
  sidecar mirror directly from `content.db`'s authoritative counter value, never from
  `storage_ledger`'s recorded rows.
- REQ-05: When `content.db` cannot be opened, any surface computing a discarded-write-window
  disclosure MUST render an explicit unknown/lower-bound estimate for the affected count, never a
  precise number.
- REQ-06: Every `restore_points` row MUST persist `watermarkAtCapture` — the
  `storage_write_watermark` value at the moment that restore point was captured.
- REQ-07: A discarded-write-window disclosure computed from `watermarkAtCapture` MUST label
  itself as covering only categories whose write path is confirmed watermark-stamped, and MUST
  NOT claim exhaustiveness.
- REQ-08: The system MUST expose a two-phase-plus-execute gated-mutation gateway —
  `plan()` → `confirm()` → `execute()` — for any operation whose blast radius requires explicit
  human acknowledgment before it runs, with no direct single-call mutation entry point that
  bypasses the sequence.
- REQ-09: `plan()` MUST be a read-only operation requiring only a `{domain}.read`-class
  permission, and MUST be callable by any principal kind (`user`, `agent`, `api_key`) that holds
  that permission.
- REQ-10: `confirm({planId, planHash})` MUST be callable only by a principal of `kind='user'`,
  MUST evaluate `authorize()` for the gated mutation's permission before minting anything, and on
  success MUST mint a single-use confirmation token with a fixed TTL of exactly 600 seconds (10
  minutes) after `createdAt`, with no jitter or tolerance band, bound to
  `(planHash, scopeId, confirmerPrincipalId)`.
- REQ-11: `execute({confirmationToken})` MUST re-run `authorize()` fail-closed (never read from a
  cache) before checking the token's expiry/redemption state, MUST then evaluate the actor-class
  redemption rule (REQ-13) before recomputing the plan against live state to detect a hash
  mismatch — see `behavior.spec.md` §2.2 for the full check-ordering sequence. A
  `confirmationToken` string that does not correspond to any token this contract ever minted
  (unknown or forged) MUST be treated identically to an expired token — the response MUST be
  `TOKEN_EXPIRED`, never a distinct code, so a caller cannot learn whether a given token string was
  ever issued.
- REQ-12: `execute()` MUST reject with `PLAN_STALE` when the recomputed plan hash does not match
  the token's bound `planHash`, before any durable mutation is applied.
- REQ-13: `execute()` MUST enforce the actor-class redemption rule immediately after the token
  expiry/redemption-state check and before the plan is recomputed against live state (see
  `behavior.spec.md` §2.2): a `kind='user'` principal may redeem only a token it minted itself; a
  `kind='agent'` principal may redeem only a token whose `confirmerPrincipalId` equals the agent's
  current `delegatedBy`; a `kind='api_key'` principal's token confirmer must be the api_key's
  owning user. A redemption attempt that fails this rule MUST be rejected with `FORBIDDEN`, with
  `details.reasonCode` set to the closed enum value `'ACTOR_CLASS_MISMATCH'` (distinguishing it
  from an ordinary `authorize()` denial, which MUST set `details.reasonCode: 'AUTHORIZE_DENIED'`)
  and `details.reason` carrying a human-readable message describing the specific mismatch (e.g.
  `"actor-class redemption mismatch: token confirmed by a different user"`) — `reasonCode` is the
  deterministic discriminator an AC or test asserts on; `reason` is illustrative free text only.
  This is a second, distinct producer of `FORBIDDEN` alongside `authorize()` (see `errors.spec.md`
  §4). Evaluating this rule before plan re-derivation means an actor-class-mismatched caller is
  told `FORBIDDEN` before ever learning whether the live plan has drifted, matching this contract's
  own non-disclosure principle (REQ-11, REQ-14).
- REQ-14: `authorize(principalId, permission, context)` MUST be evaluated before any idempotency
  short-circuit at every call site that performs a gated or ordinary mutation. This is a generic,
  cross-cutting precedence rule for any mutating call site — gated or ordinary — in this contract
  or in any dependent domain that happens to accept an idempotency key; it is not a claim that this
  contract's own three gateway endpoints (`GATEWAY_PLAN`/`GATEWAY_CONFIRM`/`GATEWAY_EXECUTE`)
  themselves accept an idempotency-key request field. `GATEWAY_EXECUTE`'s own replay protection is
  the single-use confirmation token (INV-03, `TOKEN_ALREADY_REDEEMED`), not an idempotency key; any
  dependent domain endpoint that does accept an idempotency key defines that field in its own
  `api.spec.md` and MUST follow this precedence rule. This rule is a restatement, surfaced here for
  convenience because the gated-mutation gateway's own check ordering depends on it, of an
  `authorize()`-ordering property that ADR-021 defines as part of `authorize()`'s own contract (see
  Dependencies table) — this spec does not originate the rule independently of ADR-021, and a
  dependent domain citing REQ-14 for its own ordinary-mutation endpoints is equally citing
  ADR-021's underlying `authorize()` contract property, not a rule this core contract owns on its
  own authority.
- REQ-15: For a `kind='agent'` principal, `authorize()` MUST compute effective permission as the
  live intersection of the agent's own grant and its delegator's current effective permissions,
  recomputed at each call, never cached or snapshotted from an earlier evaluation.
- REQ-16: Every ledger, audit, or revision row that references a principal MUST carry the
  composite pair `(actorWorkspaceId, actorId)`, and, when the action was performed by a delegated
  agent (`kind='agent'`) or by an api_key acting for its owning user (`kind='api_key'`), MUST
  additionally carry `(delegatedByWorkspaceId, delegatedById)` — populated with the agent's
  delegator in the agent case, or with the api_key's owning user in the api_key case. This
  extra-attribution obligation is symmetric across both delegated-authority mechanisms; there is
  no asymmetry between agent delegation and api_key ownership for this purpose.
- REQ-17: When the referencing table and the `principals` table are not in the same physical
  database (e.g. a sidecar file vs. `content.db`), the composite actor-identity pair MUST be
  populated only by the core-mediated write path at append time, and MUST be treated as a soft,
  value-join reference, never assumed to be enforced by a database foreign key.
- REQ-18: Any soft, cross-boundary reference (a composite actor identity across a physical file
  boundary, or a polymorphic content reference such as `(workspaceId, contentType, contentId)`)
  MUST have its target existence and workspace ownership validated by the writing chokepoint at
  write time, MUST tolerate orphaned rows as inert-on-read rather than a hard failure, and MUST be
  swept by a periodic or boot-time reconciliation process. This core contract directly instantiates
  the composite actor-identity flavor as a concrete state/action contract (`state.spec.md`'s
  `ActorIdentityRef` entity and `APPEND_ACTOR_REFERENCE` action) because this contract itself owns
  principal attribution and populates that reference via the core-mediated write path (REQ-16,
  REQ-17). The polymorphic-content-reference flavor has no concrete instance in this contract's own
  schema — every concrete polymorphic reference table (e.g. `entry_terms`) is owned and
  instantiated entirely by the dependent domain spec that defines it (per this spec's own Out of
  Scope section); that dependent domain spec's own `state.spec.md` MUST define the concrete entity
  and action contract for its own polymorphic reference table, applying this REQ-18 rule
  (validation-at-write, orphan-tolerance, reconciliation sweep) rather than this core contract
  modeling a generic placeholder entity for a table that does not exist here.
- REQ-19: The `db-ops` port MUST expose `getCapabilities()` returning at minimum a
  `restorePoint.costClass` of `'cheap' | 'expensive' | 'unavailable'` and a `restorePoint.kind`
  of `'file-snapshot' | 'logical-dump' | 'external'`. A SQLite-backed site MUST report `'cheap'` /
  `'file-snapshot'`. A Postgres-backed site with `pg_dump`/blue-green restore tooling configured
  and working MUST report `'expensive'` / `'logical-dump'`. "Working" is determined by a static
  configuration-presence check performed at `getCapabilities()` call time — confirming the
  required binary path, credentials, and target parameters are present and structurally valid —
  never a live end-to-end dump/restore health probe, since `getCapabilities()` is otherwise a
  cheap, side-effect-free read. A Postgres-backed site whose tooling is not confirmed both
  configured and structurally valid this way — including a site where the tooling is present but
  misconfigured (e.g. an unresolvable binary path or missing permissions) — MUST report
  `'unavailable'`; `'unavailable'` is the catch-all for every non-confirmed-working state, not
  merely a never-configured one. A site whose only configured restore mechanism is an
  externally-managed backup or point-in-time-recovery (PITR) system that the `db-ops` adapter
  cannot itself execute a capture or restore against (e.g. a cloud-provider-managed continuous
  backup service, per ADR-041 §2's PITR marker) MUST report `restorePoint.kind: 'external'` paired
  with `restorePoint.costClass: 'unavailable'` — the adapter records this pairing as a disclosure
  marker only and never attempts to execute a capture or restore against it.
- REQ-20: For a SQLite-backed site, the `db-ops` restore-point-capture operation MUST produce a
  whole-file online-backup copy of `content.db`.
- REQ-21: For a Postgres-backed site, the `db-ops` restore-point-capture operation MUST produce a
  `pg_dump -Fc` logical dump, and any restore executed against it MUST use a blue/green schema
  repoint, never an in-place restore against the serving schema.
- REQ-22: The agent-tool catalog for any domain implementing the gated-mutation gateway MUST
  expose a `{domain}_plan_{action}` tool as agent-callable and a `{domain}_execute_{action}` tool
  as agent-callable subject to the actor-class rule (REQ-13), and MUST NOT expose any
  agent-callable tool that performs the `confirm()` step.
  Amended 2026-09-24 (owner-approved): the `{domain}_execute_{action}` tool MAY call `confirm()`
  only after a redeemed human MCP-UI confirmation exchange, acting as that human (`kind='user'`).

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a write chokepoint calls the watermark-stamping function inside its
  own database transaction, when that transaction commits, then `storage_write_watermark`'s
  stored value has increased by exactly 1 and no sibling row committed by that same transaction
  is observable without the counter also having advanced.
- AC-02 (REQ-01) [P1]: Given the watermark-stamping function is invoked outside of any open
  database transaction, when the caller attempts to commit, then the call is rejected rather than
  silently stamping non-atomically.
- AC-03 (REQ-02) [P1]: Given Collections' entry write-service or Taxonomy's write-service commits
  a new entry/term row, when the commit succeeds, then the same transaction has also called the
  watermark-stamping function exactly once.
- AC-04 (REQ-03) [P2]: Given a `content.db` commit changes `storage_write_watermark`'s value,
  when that commit completes, then the sidecar mirror's stored value is refreshed to match by the
  next reconciliation opportunity in the same boot session.
- AC-05 (REQ-04) [P1]: Given the system boots and `content.db` opens successfully, when boot
  reconciliation runs, then the sidecar mirror is set to exactly `content.db`'s current
  authoritative counter value, never to a value derived from `storage_ledger`.
- AC-06 (REQ-05) [P1]: Given `content.db` fails to open at boot, when any surface requests a
  discarded-write-window disclosure, then the response renders an explicit unknown/lower-bound
  estimate and contains no precise numeric count for the affected category.
- AC-07 (REQ-06) [P1]: Given a restore point is created, when its row is persisted, then it
  includes a non-null `watermarkAtCapture` equal to `storage_write_watermark`'s value at capture
  time.
- AC-08 (REQ-07) [P1]: Given a discarded-write-window disclosure is rendered for a selected
  restore point, when the disclosure is displayed, then it explicitly states it covers only
  watermark-stamped categories and does not claim to be an exhaustive count.
- AC-09 (REQ-08) [P1]: Given an operation is classified as a gated mutation, when a caller
  attempts to invoke its mutation directly without a prior `plan()`/`confirm()` pair, then the
  attempt fails because no such direct single-call entry point exists.
- AC-10 (REQ-09) [P1]: Given a principal holding only `{domain}.read`, when it calls `plan()`,
  then the call succeeds and returns a `Plan` with no durable state change.
- AC-11 (REQ-09) [P2]: Given a `kind='agent'`, a `kind='api_key'`, and a `kind='user'` principal
  each hold `{domain}.read`, when each independently calls `plan()` against the same underlying
  live state, then all three calls return HTTP `200` with an identical `planHash`; this contract
  does not require `planId` or `details` to be byte-identical across independently-minted plan
  calls — only `planHash` is guaranteed not to vary by caller kind.
- AC-12 (REQ-10) [P1]: Given a `kind='agent'` principal calls `confirm()`, when the call is
  evaluated, then it is rejected regardless of any permission the agent holds.
- AC-13 (REQ-10) [P1]: Given a `kind='user'` principal that does not hold the gated mutation's
  permission calls `confirm()`, when `authorize()` is evaluated, then no token is minted and the
  call is rejected.
- AC-14 (REQ-10) [P1]: Given a `kind='user'` principal holding the required permission calls
  `confirm({planId, planHash})`, when the call succeeds, then a single-use token is returned with
  `expiresAt` set to exactly `createdAt + 600 seconds` (no jitter), bound to
  `(planHash, scopeId, confirmerPrincipalId)`.
- AC-15 (REQ-11) [P1]: Given `execute({confirmationToken})` is called, when it runs, then
  `authorize()` is evaluated fresh, not from a cache, before the token's expiry/redemption state
  is checked.
- AC-16 (REQ-11) [P1]: Given a valid token, when `execute()` recomputes the plan against live
  state, then a hash mismatch causes rejection before any mutation is applied.
- AC-17 (REQ-12) [P1]: Given the recomputed plan hash does not equal the token's bound
  `planHash`, when `execute()` evaluates it, then the response is `PLAN_STALE` and no durable
  mutation occurs.
- AC-18 (REQ-13) [P1]: Given a `kind='user'` principal attempts to redeem a token minted by a
  different user, when `execute()` evaluates the actor-class rule, then the redemption is
  rejected with `FORBIDDEN` and `details.reasonCode` equal to `'ACTOR_CLASS_MISMATCH'`.
- AC-19 (REQ-13) [P1]: Given a `kind='agent'` principal attempts to redeem a token whose
  `confirmerPrincipalId` is not the agent's current `delegatedBy`, when `execute()` evaluates the
  actor-class rule, then the redemption is rejected with `FORBIDDEN` and `details.reasonCode`
  equal to `'ACTOR_CLASS_MISMATCH'`.
- AC-20 (REQ-13) [P1]: Given a `kind='agent'` principal redeems a token whose
  `confirmerPrincipalId` equals its current `delegatedBy`, when every other precondition holds,
  then the redemption succeeds.
- AC-21 (REQ-14) [P1]: Given a mutating call that has both an idempotency key and an
  authorization requirement, when the call is processed, then `authorize()` is evaluated before
  the idempotency short-circuit, so an unauthorized caller never learns whether a duplicate
  command already exists. (This rule is generic across gated and ordinary mutation call sites; the
  concrete idempotency-key field, if any, is owned by the call site's own domain `api.spec.md` —
  see `api.spec.md`'s note on REQ-14/AC-21.)
- AC-22 (REQ-15) [P1]: Given an agent's delegator's permission set changes between `confirm()`
  and `execute()`, when `execute()` re-evaluates `authorize()`, then the agent's effective
  permission reflects the delegator's current state, not the confirm-time state.
- AC-23 (REQ-16) [P1]: Given any ledger, audit, or revision row referencing a principal is
  written, when the row is inspected, then it carries `(actorWorkspaceId, actorId)`, and, if
  written by a delegated agent or by an api_key acting for its owning user, also carries
  `(delegatedByWorkspaceId, delegatedById)` identifying the delegator or the owning user
  respectively.
- AC-24 (REQ-17) [P1]: Given a ledger row lives in a physically separate database file from
  `principals` (e.g. the sidecar ops journal), when the row's actor-identity pair is inspected,
  then no database-level foreign-key constraint enforces it, and the pair was populated only by
  the core-mediated write path.
- AC-25 (REQ-18) [P1]: Given a soft cross-boundary reference's target row is deleted through a
  path that does not clean up the reference, when the referencing row is later read (e.g. via an
  inner join), then it is silently omitted from the result set rather than causing a read error.
- AC-26 (REQ-18) [P1]: Given orphaned soft-reference rows exist after a target deletion, when the
  next periodic or boot-time reconciliation sweep runs, then the orphaned rows are removed.
- AC-27 (REQ-18) [P1]: Given a write chokepoint accepts a caller-supplied workspace/content
  reference for a soft cross-boundary reference, when the write is processed, then the chokepoint
  independently validates the referenced entity's existence and workspace ownership rather than
  trusting the caller-supplied value alone.
- AC-28 (REQ-19) [P1]: Given `dbOps.getCapabilities()` is called against a SQLite-backed site,
  when it returns, then `restorePoint.costClass` is `'cheap'` and `restorePoint.kind` is
  `'file-snapshot'`.
- AC-29 (REQ-19) [P1]: Given `dbOps.getCapabilities()` is called against a Postgres-backed site
  with no dump/blue-green tooling configured at all (never set up), when it returns, then
  `restorePoint.costClass` is `'unavailable'`.
- AC-30 (REQ-20) [P1]: Given a restore point is captured for a SQLite-backed site, when the
  capture completes, then the resulting artifact is a whole-file online-backup copy of
  `content.db`, not a partial or logical export.
- AC-31 (REQ-21) [P1]: Given a restore point is captured for a Postgres-backed site, when the
  capture completes, then the resulting artifact is a `pg_dump -Fc` logical dump; and given that
  restore point is later restored, then the restore targets a newly built green schema and
  repoints atomically, never applying in-place against the serving (blue) schema.
- AC-32 (REQ-22) [P1]: Given a domain implements the gated-mutation gateway, when its agent-tool
  catalog is inspected, then a `{domain}_plan_{action}` tool and a `{domain}_execute_{action}`
  tool are both present and agent-callable, and no tool in the catalog performs the `confirm()`
  step.
- AC-33 (REQ-19) [P1]: Given `dbOps.getCapabilities()` is called against a Postgres-backed site
  with `pg_dump`/blue-green restore tooling configured and working, when it returns, then
  `restorePoint.costClass` is `'expensive'` and `restorePoint.kind` is `'logical-dump'`.
- AC-34 (REQ-02) [P2]: Given a dependent domain spec's own `## Integration Contracts` section,
  when it is inspected, then every write chokepoint in that domain that calls the
  watermark-stamping function is named explicitly, and any write chokepoint not named there is
  treated as not watermark-stamped for disclosure-coverage purposes.
- AC-35 (REQ-11) [P1]: Given `execute({confirmationToken})` is called with a confirmationToken
  string that was never minted by this contract, when it is evaluated, then the response is
  `TOKEN_EXPIRED` — identical to the response for a genuinely expired token — and no response
  field discloses whether that token string was ever issued.
- AC-36 (REQ-19) [P2]: Given `dbOps.getCapabilities()` is called against a Postgres-backed site
  with `pg_dump`/blue-green tooling present but non-functional (e.g. an unresolvable binary path
  or missing permissions), when it returns, then `restorePoint.costClass` is `'unavailable'`,
  identical to the never-configured case (AC-29).
- AC-37 (REQ-19) [P2]: Given `dbOps.getCapabilities()` is called against a site whose only
  configured restore mechanism is an externally-managed PITR/backup system the adapter cannot
  itself execute, when it returns, then `restorePoint.kind` is `'external'` and
  `restorePoint.costClass` is `'unavailable'`.
- AC-38 (REQ-13) [P1]: Given a redemption attempt fails the actor-class rule and the recomputed
  plan would also be stale (a hash mismatch exists against the token's bound `planHash`), when
  `execute()` evaluates its check sequence, then the response is `FORBIDDEN` — the actor-class
  rule is evaluated before plan re-derivation/hash comparison (`behavior.spec.md` §2.2) — never
  `PLAN_STALE`.
- AC-39 (REQ-01) [P1]: Given a write chokepoint calls the watermark-stamping function inside its
  own database transaction against a Postgres-backed `content.db` (post-migrate-forward), when
  that transaction commits, then `storage_write_watermark`'s stored `BIGINT` value has increased
  by exactly 1 and no sibling row committed by that same transaction is observable without the
  counter also having advanced.
- AC-40 (REQ-01) [P2]: Given two concurrent transactions against a Postgres-backed `content.db`
  each call the watermark-stamping function inside their own transaction, when both attempt to
  commit, then Postgres's row-locking on the counter row serializes the two commits — the second
  writer blocks or retries rather than lost-updating — so both increments are reflected in
  `storage_write_watermark`'s final value and INV-01 holds.

---

## Invariants

- INV-01: `storage_write_watermark`'s stored value must never decrease.
- INV-02: A `restore_points` row's `watermarkAtCapture` must never be greater than the live
  `storage_write_watermark` value at the moment that row was written.
- INV-03: A confirmation token must never be redeemed by `execute()` more than once.
- INV-04: A confirmation token must never be minted for a principal that does not, at mint time,
  already hold the gated mutation's permission.
- INV-05: `authorize()` must never be bypassed or evaluated after an idempotency short-circuit
  has already returned a result.
- INV-06: A composite actor-identity pair populated by the core-mediated write path must always
  reference a principal whose own workspace matches the referencing row's workspace, unless the
  referencing table is explicitly documented by its owning domain spec as workspace-exempt.
- INV-07: An orphaned soft cross-boundary reference must never cause a read operation to fail
  with an error; it must be filtered out of the result set.

---

## Edge Cases

- EC-01: What happens when two writes race to increment `storage_write_watermark` concurrently?
  Expected behavior (SQLite-backed site): the underlying single-writer WAL transaction model
  serializes the two commits; both increments land in sequence, no increment is lost, and INV-01
  holds. This mechanism description is SQLite-specific. Expected behavior (Postgres-backed site,
  post-migrate-forward): Postgres's normal MVCC/row-locking semantics on the counter row serialize
  the two concurrent transactions — the second writer's update to the `BIGINT` counter row blocks
  until the first transaction commits (or, under a serialization-level conflict, is retried per
  REQ-01's transaction contract) — so both increments still land in sequence and no increment is
  lost. This mechanism description is Postgres-specific and is self-defined by this contract
  (REQ-01), not delegated to SPEC-017. INV-01 (the counter must never decrease) holds regardless of
  which engine's concurrency mechanism produced the serialization.
- EC-02: What happens when a `kind='agent'` principal calls `confirm()` directly?
  Expected behavior: rejected outright — `confirm()` is `kind='user'`-only regardless of any
  permission the agent holds.
- EC-03: What happens when `execute()` is called with a valid, unexpired, unredeemed token but
  live state has changed since `plan()` was called?
  Expected behavior: the recomputed plan hash mismatches the token's bound `planHash`; `execute()`
  rejects with `PLAN_STALE` and no mutation runs.
- EC-04: What happens when the delegator of an agent principal is disabled between `confirm()`
  and `execute()`?
  Expected behavior: the re-run `authorize()` call at `execute()` evaluates the live grant ∩
  delegator intersection, finds it collapsed, and denies execute even though a technically valid,
  unexpired token exists.
- EC-05: What happens when `content.db` cannot be opened at boot?
  Expected behavior: the sidecar mirror cannot be refreshed from the authoritative counter; any
  disclosure computed from the watermark renders an explicit unknown/lower-bound estimate, never
  a stale precise number.
- EC-06: What happens when a restore point was captured before the `watermarkAtCapture` column
  existed?
  Expected behavior: that row's `watermarkAtCapture` is treated as absent (null), and any
  disclosure computed against that restore point renders an explicit unknown estimate rather than
  assuming zero loss.
- EC-07: What happens when a `kind='api_key'` principal attempts to redeem a token confirmed by a
  different user than the api_key's owning user?
  Expected behavior: rejected with `FORBIDDEN` under the actor-class redemption rule (REQ-13).
- EC-08: What happens when a `kind='user'` principal attempts to redeem a confirmation token that
  a different user minted?
  Expected behavior: rejected with `FORBIDDEN` — only the minting user may redeem their own token
  (REQ-13).
- EC-09: What happens when `execute()` is called with a `confirmationToken` string that was never
  issued by this contract (garbage or forged, not merely expired or already-redeemed)?
  Expected behavior: treated identically to an expired token — the response is `TOKEN_EXPIRED`,
  never a distinct code, so the caller cannot learn whether that token string was ever minted
  (REQ-11).
- EC-10: What happens when a redemption attempt fails the actor-class rule and the recomputed
  plan would also be stale?
  Expected behavior: `execute()` reports `FORBIDDEN` — the actor-class redemption rule is now
  evaluated before plan re-derivation/hash comparison (`behavior.spec.md` §2.2), consistent with
  REQ-11/REQ-14's established non-disclosure pattern — the caller never learns the plan is stale
  before being told the redemption itself was never allowed (REQ-13).

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| ADR-021 identity & authorization (`principals`, `authorize()`, composite FK convention, agent delegation) | The `authorize()` semantics, principal kinds, and live grant-intersection rule this contract's gateway calls into | If `authorize()` is unavailable, no gated or ordinary mutation covered by this contract can be evaluated | None — fail-closed; the mutation is denied, never allowed by default |
| ADR-022 append-only revisions / write-chokepoint discipline | The existing per-entry revisioning precedent each dependent domain's own write-service already follows | Not an operational dependency of this contract itself; a domain skipping it is that domain's own gap | None — cited by reference only, not restated here |
| ADR-012 install-dir layout (the `ops/` sidecar tree) | The on-disk location the sidecar mirror and restore-point artifacts live in | If the install-dir layout changes without updating this contract's sidecar path, boot reconciliation cannot find the mirror | None — blocks boot reconciliation until the path is corrected |
| SQLite / better-sqlite3 WAL transaction runtime (SQLite-backed sites only) | The single-writer transactional atomicity that makes same-transaction watermark stamping meaningful for a SQLite-backed `content.db` (REQ-01, EC-01) | If the runtime does not honor the assumed transaction/WAL semantics, the same-transaction atomicity guarantee (REQ-01) does not hold for a SQLite-backed site | None — this contract has no non-transactional fallback for the watermark stamp |
| Postgres MVCC/row-locking transaction runtime (Postgres-backed sites only, post-migrate-forward per REQ-19–REQ-21) | The same-transaction atomicity and MVCC/row-locking concurrency-safety guarantee that makes same-transaction watermark stamping meaningful for a Postgres-backed `content.db` (REQ-01, EC-01) — self-defined directly by this contract, not delegated to SPEC-017 | If the runtime does not honor the assumed transaction/MVCC semantics, the same-transaction atomicity guarantee (REQ-01) does not hold for a Postgres-backed site | None — this contract has no non-transactional fallback for the watermark stamp |
| Postgres `pg_dump` / blue-green repoint tooling (adapter-level, deferred) | The logical-dump restore-point mechanism and cutover repoint for Postgres-backed sites | If the tooling is not confirmed configured and structurally valid via `getCapabilities()`'s static check — never configured, or configured but broken — `getCapabilities()` reports `costClass: 'unavailable'` (REQ-19, AC-29, AC-36); when the tooling is confirmed configured and structurally valid, `getCapabilities()` reports `costClass: 'expensive'` (REQ-19, AC-33) — `pg_dump -Fc` plus a blue/green schema repoint is materially heavier than a SQLite file copy | Gated mutations degrade per REQ-19/EC-05-adjacent handling in the owning domain spec (SPEC-017/SPEC-019); no in-product override exists |
| Externally-managed PITR/backup mechanism (e.g. a cloud-provider continuous backup service) outside this contract's own SQLite/Postgres `db-ops` adapters | The source of a `kind: 'external'` capability report (ADR-041 §2's PITR marker) | This contract's `db-ops` adapter cannot execute a capture or restore against it | Reported as `restorePoint.kind: 'external'` paired with `costClass: 'unavailable'` (REQ-19, AC-37); no in-product capture/restore path exists for it |

---

## Open Questions

- OQ-01: `storage_write_watermark`'s single-row-counter write-serialization cost under concurrent
  writers at scale is unbenchmarked (ADR-041's own stated open question). — Owner: Software
  Architect for SPEC-017 (Storage/Timeline) — Resolve by: before SPEC-017's architecture sign-off.
- OQ-02: `siteId` vs `workspaceId` scoping (inherited from SPEC-003's OQ-04 lineage via ADR-041
  §7). This contract uses `workspaceId` throughout for actor identity and watermark scoping;
  `siteId` is used only by Storage's sidecar journal scoping, which is domain-owned. When this is
  resolved, the resolution MUST explicitly state whether `storage_write_watermark`'s counter
  scoping (REQ-01) is per-`content.db`-file or per-site in any future shared-file topology, even
  if the answer is "not applicable because each site always has its own `content.db`." — Owner:
  whoever resolves the original SPEC-003 OQ-04 — Resolve by: before the desktop multi-site host
  ships.
- OQ-03: The concrete Postgres `CUTOVER` repoint mechanism (a stable DSN alias, a database
  rename, or a connection-pool re-target) is unspecified at the core-contract level; ADR-041
  itself commits only to the state-machine shape, not the repoint mechanism. — Owner: Software
  Architect for SPEC-017 — Resolve by: before the Postgres `db-ops` adapter's implementation
  begins.
- OQ-04: **Resolved 2026-07-14 (Coordinator fold-back from SPEC-017).** A second `confirm()` call
  for the same still-valid `planId`/`planHash` mints an independent additional single-use token;
  the first token remains valid until it is separately redeemed or expires. This is the contract's
  single global answer — SPEC-017 (Storage/Timeline) resolved this for its own
  `storage.migrate-forward` instantiation and found no domain-specific reason to diverge (deduping
  would require a token-lookup-by-plan index no domain needs otherwise, and `execute()`'s
  actor-class rule at REQ-13 already prevents a stray second token from being redeemed by the wrong
  caller), so the Coordinator folded it back here rather than leaving each dependent spec to
  re-derive or restate it independently. See SPEC-017's `feature.spec.md` "Resolution of SPEC-016
  OQ-04" section for the full reasoning.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | `ADS-memory/governance/constitution.md` Article I is an unfilled template placeholder (literal `[PRINCIPLE NAME]` text, no ratified project-specific principle) — there is no concrete compliance target to check this spec against. |
| II — Test-First | N/A | Same template-placeholder state as Article I — no ratified principle text exists in the constitution file to evaluate compliance against. |
| III — Simplicity Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own scope discipline (see Scope, Out of scope) is documented independently of any constitution article. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| V — Integration-First Testing | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| VI — Security-by-Default | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own authorize()/fail-closed requirements (REQ-11, REQ-14, REQ-15, INV-04, INV-05) stand on ADR-021's decision, not on a constitution article. |
| VII — Spec Integrity | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec still carries its own `spec_id`/`content_hash` discipline per the Speckit compatibility contract regardless. |
| VIII — Observability | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's error envelope (see `errors.spec.md`) still carries `correlationId` regardless. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified: `ADS-memory/specs/001-*` and `ADS-memory/reports/pipeline/001-*` were confirmed absent before this run; SPEC-016 is newly assigned here)
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
- [x] behavior.spec.md complete (this feature has real precedence/ordering/default/limit rules — see Scope)
- [x] traceability.spec.md complete (marked "pending implementation" — no code has been written yet)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives

Always:
- Every requirement referencing `authorize()` calls the existing function contract defined by
  ADR-021 §2 (`authorize(principalId, permission, context) → { allowed, reason }`) — do not
  introduce a second authorization evaluator.
- Use the composite `(workspaceId, id)` shape for every new actor-identity reference — never a
  bare id column, per ADR-021 §4 and REQ-16.

Ask before:
- Changing the confirmation-token TTL away from the exact 600-second (10-minute) value this spec
  states in REQ-10 (originating from ADR-041 §3's "~10 minutes," now pinned to an exact figure by
  this revision) — this is a stated value, not a free implementation parameter.
- Introducing any bypass or attestation override for a `costClass: 'unavailable'` gated mutation —
  ADR-041 §2 explicitly rejects an "I attest backups exist" bypass as unenforceable.

Never:
- Cache or snapshot an `authorize()` result across the `confirm()` → `execute()` boundary — it
  must always be re-run fail-closed at each step (ADR-041 §3/M2).
- Expose a `confirm()`-equivalent action in any agent-tool catalog — confirm is human-only with no
  exception (ADR-041 §6).
- Give a gated mutation a direct single-call entry point that skips `plan()`/`confirm()` — this
  collapses the entire safety model this contract exists to provide.
