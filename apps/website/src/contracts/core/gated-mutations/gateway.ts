// Implementation: /Users/la/Programming/Jini/packages/core/src/gated-mutations/gateway.ts
/**
 * @file SPEC-016 C-001/C-002/C-003 — the plan() -> confirm() -> execute() gated-mutation gateway
 * (ADR-041 §5, Critical Internal Constraints U-001).
 *
 * Purpose:
 * The canonical Jini gateway is the ONLY entry point through which a "gated" mutation (one requiring an explicit human/api_key
 * confirmation step, separate from the caller's read-time permission check) may run. No other
 * export performs the mutation directly (architectural guard, `gateway.unit.test.ts`).
 *
 * Fixed check-sequence inside `execute()` (CIC U-001, behavior.spec.md §2.2) — order is binding,
 * not incidental, because two failure conditions can co-occur and only one may ever be reported:
 *   1. `authorize()` re-evaluated fresh (U-001-B1/ORD1) — never the confirm()-time result.
 *   2. token expiry/redemption-state check (U-001-ORD2) — TOKEN_EXPIRED / TOKEN_ALREADY_REDEEMED.
 *   3. actor-class redemption rule (REQ-13, U-001-B2/ORD3) — FORBIDDEN/ACTOR_CLASS_MISMATCH wins
 *      over a simultaneously-stale plan (AC-38).
 *   4. plan re-derivation / hash comparison (U-001-B3) — PLAN_STALE.
 *   5. atomic token redemption, then the domain mutation (INV-03 exactly-once) — which is handed
 *      step 4's verified plan, so the plan decision stays where this sequence puts it and cannot be
 *      retaken after redemption (see `GatedMutationHooks.executeMutation`).
 *
 * How it relates to the project:
 * `hooks.executeMutation()` is where a feature (e.g. `features/database`'s migrate-forward) opens
 * its own transaction and stamps the watermark (`platform/db/watermark-kernel.ts`) alongside its domain writes.
 *
 * Architectural role:
 * The canonical primitive depends only on Jini's kernel approval ports/token contracts — never
 * on `identity` or any feature (see `AuthorizeFn`'s doc comment in `./ports`).
 *
 * Tovu binds its token policy and existing storage ports; generic implementation and rationale
 * live in Jini/packages/core/src/gated-mutations/gateway.ts.
 *
 * Canonical hook and error contracts:
 *
 * Stable domain identifier, e.g. `"database.migrate"`.
 *
 * Permission `plan()` checks, e.g. `"{domain}.read"`.
 *
 * Permission `confirm()` and `execute()` check, e.g. `"{domain}.migrate"`.
 *
 * The workspace/site the mutation is scoped to. For `scopeKind: "workspace"` (the default),
 * passed as `authorize()`'s `workspaceId` — unchanged from before `scopeKind` existed. For
 * `scopeKind: "instance"`, `scopeId` is no longer fed to `authorize()` (an instance-wide
 * mutation has no single owning workspace); it is still recorded onto the minted
 * `ConfirmationTokenRecord` as an opaque audit label (e.g. `"instance"`).
 *
 * `"workspace"` (default when omitted — every ceremony wired before this field existed keeps
 * its exact prior behavior) authorizes `readPermission`/`mutatePermission` against `scopeId` via
 * `deps.authorize`, the ordinary workspace-scoped RBAC evaluator. `"instance"` is for a mutation
 * whose blast radius crosses every workspace in `content.db` at once (e.g. a whole-database
 * migration) — it authorizes via `deps.authorizeInstance` instead, so a grant scoped to one
 * workspace can never stand in for instance-wide authority. See `authorizeForHooks` below.
 *
 * Recomputes the plan; `execute()` compares its `planHash` against the redeemed token's.
 *
 * The actual domain mutation. Runs only after every gate in `execute()`'s check-sequence passes.
 *
 * `verified` is the plan step 4 just re-derived and hash-matched against the confirmed token —
 * i.e. the plan the operator actually approved. A mutation that needs to know WHAT to apply must
 * use this and must not call `computePlan()`/its own planner again: step 4 and any later
 * re-derivation are separated by the token redemption and by whatever the mutation itself does
 * first (publish-content captures a whole-workspace restore point there), and this gateway takes
 * no operation lock, so a second derivation can legitimately disagree with the verified one. That
 * gap is a confirm-then-apply integrity hole — the operator authorises one write set and receives
 * another — passing the verified plan down closes that integrity gap.
 *
 * A mutation with nothing to re-derive simply ignores the argument; a zero-parameter
 * implementation still satisfies this signature, so every hooks object written before this
 * parameter existed is unchanged.
 *
 * Resolves the identity `execute()`'s actor-class rule (REQ-13) compares the token's
 * `confirmerPrincipalId` against: the caller's own id for `kind='user'`; the agent's CURRENT
 * delegator for `kind='agent'`; the api_key's owning user for `kind='api_key'`. Re-resolved
 * fresh at `execute()` time (REQ-15) — never cached from `confirm()`-time.
 *
 * Backs `scopeKind: "instance"` hooks (see `GatedMutationHooks.scopeKind`). Optional and
 * additive — every `GatewayDeps` built before this field existed (`buildGatewayDeps`'s prior
 * signature) omits it and is unaffected, because no pre-existing hooks ever set
 * `scopeKind: "instance"`. Left unset, an instance-scoped mutation fails closed
 * (`authorizeForHooks` denies with `INSTANCE_AUTHORIZATION_NOT_CONFIGURED`) rather than the
 * gap this field closes: silently reusing `hooks.scopeId` as a workspace id.
 *
 * Thrown when `authorize()` denies, or a redeemed token's actor-class check fails (`reasonCode: "ACTOR_CLASS_MISMATCH"`).
 *
 * Thrown when `execute()`'s recomputed plan hash no longer matches the confirmed/redeemed token's plan hash (U-001-B3).
 *
 * Reserved for a caller identity that cannot be established at all (no `principalId`). No test in
 * this slice exercises this path — every caller in `gateway.unit.test.ts` supplies a
 * `principalId` — so no branch throws it yet; kept as part of the exported error surface the
 * seam design documents, for a future route-level caller to raise before reaching this gateway.
 */
import { randomUUID } from "node:crypto";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort } from "@jini-ai/core/primitives";
import {
  authorizeForHooks as authorizeApproval,
  plan as planApproval,
  confirm as confirmApproval,
  execute as executeApproval,
  type GatewayDeps as ApprovalDeps,
  type GatedMutationHooks,
  type GatewayPlan,
} from "@jini-ai/core/gated-mutations";
import type { AuthorizeFn, InstanceAuthorizeFn, PrincipalKind } from "./ports.js";
import { adaptTokenStore, type ConfirmationTokenRecord, type TokenStorePort } from "./token.js";

export { ForbiddenError, PlanStaleError, UnauthenticatedError } from "@jini-ai/core/gated-mutations";
export type { GatedMutationHooks, GatewayPlan } from "@jini-ai/core/gated-mutations";

export interface GatewayDeps {
  clock: ClockPort;
  idGen: IdGeneratorPort;
  authorize: AuthorizeFn;
  authorizeInstance?: InstanceAuthorizeFn;
  tokens: TokenStorePort;
}

/** O(1), preserving Tovu's token vocabulary, TTL, authorization and atomic storage. */
function approvalDeps(deps: GatewayDeps): ApprovalDeps {
  return {
    clock: deps.clock,
    idGen: deps.idGen,
    authorize: (required, optional) => deps.authorize({ ...required, ...optional }),
    ...(deps.authorizeInstance ? { authorizeInstance: deps.authorizeInstance } : {}),
    tokens: adaptTokenStore({ store: deps.tokens }),
    generateToken: () => `ctok_${randomUUID()}`,
    ttlSeconds: 600,
  };
}

/**
 * Routes a single authorize check to the workspace-scoped evaluator (`deps.authorize`, the
 * default/unchanged path) or the instance-scoped one (`deps.authorizeInstance`) depending on
 * `hooks.scopeKind`. Factored out to one place rather than inlined at each of `plan()`/
 * `confirm()`/`execute()`'s three call sites, so the branch — and its fail-closed rule — exists
 * exactly once; this changes only WHICH evaluator backs a check, never the fixed check-sequence
 * documented in this file's header.
 *
 * Exported (not just used internally) so a route's own pre-lock authorization pre-check — the
 * AUD-001 pattern in `server/routes/admin/{recovery/restore,database/migrate-forward}.ts`, which
 * authorizes before `core/operation-lock.ts`'s `acquireOperationLock` runs, strictly outside this
 * gateway's own `plan()`/`confirm()`/`execute()` — can route through the exact same scope decision
 * as the gateway itself. A route that instead hardcoded `deps.authorize(hooks.scopeId)` for that
 * pre-check would silently stay workspace-scoped for an instance-scoped ceremony: a caller denied
 * deeper inside `execute()`'s own `authorizeForHooks` call would still pass the shallow pre-check
 * first, briefly acquire the operation lock, and only then be rejected — reopening the exact race
 * AUD-001 closed, just one layer up. One function backing both call sites is what keeps that from
 * drifting out of sync.
 *
 * Fail-closed by construction: an `"instance"`-scoped hook with no `deps.authorizeInstance` bound
 * denies (`INSTANCE_AUTHORIZATION_NOT_CONFIGURED`) rather than falling back to
 * `deps.authorize(hooks.scopeId)` — that fallback is exactly the authorization-bypass gap this
 * scope exists to close (see `InstanceAuthorizeFn`'s doc comment in `./ports`).
 *
 * @complexity O(1) plus one downstream `authorize`/`authorizeInstance` call.
 * @overallScore 100
 */
export function authorizeForHooks(deps: GatewayDeps, hooks: GatedMutationHooks<unknown, unknown>, required: { principalId: string; permission: string }): Promise<{ allowed: boolean; reason: string }> {
  return authorizeApproval({ ...required, deps: approvalDeps(deps), hooks });
}

/**
 * Checks `{domain}.read`, then returns a plan (its own `planId`, plus `hooks.computePlan()`'s
 * `planHash`/`details`). Never invokes `hooks.executeMutation()` — a plan is read-only by
 * construction (AC-10).
 *
 * @complexity O(1) plus one `authorize()` call and one `hooks.computePlan()` call.
 * @overallScore 100
 */
export function plan(required: { deps: GatewayDeps; principalId: string; principalKind: PrincipalKind; hooks: GatedMutationHooks<unknown, unknown> }, _optional: Record<string, never> = {}): Promise<GatewayPlan> {
  return planApproval({ ...required, deps: approvalDeps(required.deps) });
}

/**
 * Mints a confirmation token for a plan, after checking `{domain}.mutate}` and the confirm-time
 * actor-class rule: `kind='agent'` may never confirm, regardless of any permission it holds
 * (AC-12) — confirmation is a human/api_key act; an agent later *redeems* a token confirmed by
 * its delegator via `execute()`'s own actor-class check, it never mints one itself.
 *
 * @complexity O(1) plus one `authorize()` call and one token store write.
 * @overallScore 100
 */
export function confirm(required: { deps: GatewayDeps; principalId: string; principalKind: PrincipalKind; hooks: GatedMutationHooks<unknown, unknown>; planId: string; planHash: string }, _optional: Record<string, never> = {}): Promise<ConfirmationTokenRecord> {
  return confirmApproval({ ...required, deps: approvalDeps(required.deps) });
}

/**
 * Redeems a confirmation token and runs the domain mutation, following the fixed check-sequence
 * documented in this file's header (CIC U-001). Every rejection point returns a distinct,
 * specifically-typed error so callers/routes can map each to the right HTTP status/reason code.
 *
 * @complexity O(1) plus: one `authorize()` call, one token-store read, one
 * `resolveActorClassIdentity()` call, one `computePlan()` call, one atomic `tryRedeem`, and the
 * domain mutation itself.
 * @overallScore 100
 *
 * Ordering enforced by Jini:
 * 1. authorize() re-evaluated fresh — U-001-B1/ORD1. Never cached from confirm()-time (REQ-15).
 * 2. token expiry/redemption-state check — U-001-ORD2. Must complete before the actor-class
 * rule so an already-redeemed token from a mismatched caller reports TOKEN_ALREADY_REDEEMED,
 * not FORBIDDEN.
 * 3. actor-class redemption rule — U-001-B2/ORD3, REQ-13. Wins over a simultaneously-stale
 * plan (AC-38): checked before plan re-derivation.
 * 4. plan re-derivation / hash comparison — U-001-B3. `details` is kept, not discarded: it is
 * the plan the operator confirmed, and step 5 hands it to the mutation so the mutation never has
 * to (and never may) re-derive a second one of its own. See `executeMutation`'s doc comment.
 * 5. atomic redemption, then the domain mutation — INV-03 exactly-once. A concurrent execute()
 * racing on the same token loses here (TokenAlreadyRedeemedError) before ever reaching the
 * mutation, even if it passed every check above.
 */
export function execute<TResult>(required: { deps: GatewayDeps; principalId: string; principalKind: PrincipalKind; hooks: GatedMutationHooks<unknown, TResult>; confirmationToken: string }, _optional: Record<string, never> = {}): Promise<TResult> {
  return executeApproval({ ...required, deps: approvalDeps(required.deps) });
}
