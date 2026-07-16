# Orchestrator Contract Spec: content-admin-core-contract

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/orchestrator.spec.md`

- Spec ID: `SPEC-016`
- Feature: `FEAT-016-content-admin-core-contract`
- Version: `1.4.0`
- Content Hash: `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f`
- Last Edited: `2026-07-15T05:00:00Z`

## Purpose

Defines the generic gated-mutation gateway orchestrator every dependent domain instantiates
(SPEC-017's forward-migration ceremony, SPEC-019's restore ceremony). The orchestrator sequences
`plan()` → `confirm()` → `execute()`, owns the `authorize()` call ordering, and hands off to the
domain-specific business logic (the actual migration steps, the actual restore steps) that each
dependent spec's own orchestrator contract defines.

## 1) Orchestrator Identity
- Name: `GatedMutationGateway`
- Responsibility: sequence a destructive or high-blast-radius operation through a read-only plan,
  a human-only confirmation step that mints a short-lived single-use token, and a token-gated
  execute step — re-evaluating authorization fail-closed at both the confirm and execute steps.

## 2) Input Contract

| Input | Required | Type | Default | Validation/Bounds | Notes |
|---|---|---|---|---|---|
| `domain` | yes | `string` | none | must be a registered domain (e.g. `"storage.migrate"`, `"backup.restore"`) | Identifies which dependent spec's business logic this gateway invocation delegates to |
| `principalId` | yes | `string` | none | must resolve to a `principals` row | Resolved from the authenticated session/token, never a request body field |
| `principalKind` | yes | `enum[user, agent, api_key]` | none | n/a | Drives the `confirm()` kind restriction and the `execute()` actor-class rule |
| `planId` | conditional | `string (ulid)` | none | required for `confirm()` and implicitly for `execute()` via the token | n/a |
| `planHash` | conditional | `string` | none | `sha256:[0-9a-f]{64}`; required for `confirm()` | Bound into the minted token |
| `confirmationToken` | conditional | `string` | none | required for `execute()` | Opaque, single-use |

## 3) Output State Contract

| Field | Type | Nullability | Source | Notes |
|---|---|---|---|---|
| `plan` | `GatewayPlan` | nullable | derived (from `plan()`) | domain-specific `details` payload nested inside |
| `confirmationToken` | `ConfirmationToken` | nullable | derived (from `confirm()`) | never returned from `plan()` |
| `executionResult` | domain-defined | nullable | derived (from `execute()`) | shape owned by the dependent domain spec |
| `lastError` | `GatewayError` | nullable | derived | one of `PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`, `UNAUTHENTICATED`, `VALIDATION_ERROR`, `INTERNAL_ERROR` |
| `isGatedOperationInFlight` | `boolean` | non-null | derived | `true` from a successful `confirm()` until `execute()` resolves (success or terminal failure) |

## 4) Action Contracts

| Action | Inputs | Returns | Side Effects | Failure Codes |
|---|---|---|---|---|
| `plan` | `{domain, principalId, principalKind, ...domain params}` | `Result<GatewayPlan>` | none — read-only (REQ-09) | `UNAUTHENTICATED, FORBIDDEN, VALIDATION_ERROR` |
| `confirm` | `{domain, principalId, principalKind, planId, planHash}` | `Result<ConfirmationToken>` | mints a single-use token if `authorize()` passes (REQ-10) | `UNAUTHENTICATED, FORBIDDEN` (includes non-`user` principal kind) |
| `execute` | `{domain, principalId, principalKind, confirmationToken}` | `Result<domain-defined>` | runs the domain-specific mutation exactly once on success; stamps the composite actor identity onto every ledger/audit row it produces via `state.spec.md`'s `APPEND_ACTOR_REFERENCE` action (REQ-16) | `UNAUTHENTICATED, FORBIDDEN` (includes the actor-class redemption rejection, REQ-13), `PLAN_STALE, TOKEN_EXPIRED` (also returned for an unrecognized/forged token, REQ-11), `TOKEN_ALREADY_REDEEMED, INTERNAL_ERROR` |

## 5) Lifecycle Hooks

| Hook | Trigger | Ordering | Failure Behavior |
|---|---|---|---|
| `onBeforeConfirm` | before minting a token | evaluates `authorize()` for the mutating permission before any token is created (REQ-10) | if `authorize()` denies, no token is created and the call fails with `FORBIDDEN` |
| `onBeforeExecute` | before checking token validity | re-evaluates `authorize()` fresh, never cached (REQ-11), strictly before token-state checks | if `authorize()` denies, `execute()` fails with `FORBIDDEN` (`details.reasonCode: 'AUTHORIZE_DENIED'`) before any token/plan-staleness/actor-class check runs |
| `onActorClassCheck` | after the token expiry/redemption-state check, before plan re-derivation (REQ-13) | evaluates the actor-class redemption rule: `kind='user'` must match the token's minting user; `kind='agent'` must match its current `delegatedBy`; `kind='api_key'` must match the owning user | if the rule fails, `execute()` fails with `FORBIDDEN` (`details.reasonCode: 'ACTOR_CLASS_MISMATCH'`) before plan re-derivation runs — even if the recomputed plan would also be stale (EC-10, AC-38) |
| `onAfterPlanRecompute` | after re-deriving the plan from live state at execute time, following a passed actor-class check | before the domain-specific mutation runs | a hash mismatch against the token's bound `planHash` fails the call with `PLAN_STALE` (REQ-12) before any mutation |
| `onAfterExecuteSuccess` | after the domain-specific mutation commits | after the domain's own transaction (which itself calls the watermark-stamping function per REQ-02, if applicable) | non-fatal logging only at the gateway layer — the domain-specific transaction has already committed |

## 6) Invariants
- [x] `execute` never runs the domain-specific mutation before `authorize()` has been evaluated
      fresh at that call (INV-05).
- [x] `execute` never succeeds against a token that has already transitioned to `redeemed` or
      `expired` (INV-03).
- [x] `confirm` never succeeds for a `principalKind` other than `user` (REQ-10).
- [x] `isGatedOperationInFlight` is `false` immediately after either a successful `execute` or a
      terminal `execute` failure — it never remains `true` indefinitely.

## 7) Acceptance Checklist
- [x] Inputs/outputs/actions are fully documented.
- [x] Failure codes align with `errors.spec.md`.
- [x] Entity field names align with `state.spec.md`. (No `ui.spec.md` exists for this core
      contract — each dependent domain spec defines its own UI-facing orchestrator projection.)
