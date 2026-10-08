import { createHash } from "node:crypto";

import type { Clock as ClockPort, IdGenerator as IdGeneratorPort } from "@jini-ai/core/primitives";
import type { AuthorizeFn } from "@jini-ai/cms/core";
import type { GatedMutationHooks, GatewayDeps } from "./gateway.js";
import { InMemoryTokenStore } from "./token.js";
import type { TokenStorePort } from "./token.js";
import type { InstanceAuthorizeFn, PrincipalKind } from "./ports.js";

/**
 * @file Composes `core/gated-mutations`'s `plan()`/`confirm()`/`execute()` primitive into this
 * codebase's real and hermetic-test composition roots.
 *
 * Purpose:
 * `buildGatewayDeps` builds the one shared `GatewayDeps` (clock/idGen/authorize/authorizeInstance/
 * tokens) every ceremony needs. `buildOwnerOnlyInstanceAuthorize` is the minimal binding for
 * `authorizeInstance` — every RBAC table (`principals`/`roles`/`policies`/...) is
 * `workspace_id NOT NULL` (`db/schema.sqlite.ts`), so an instance-wide ceremony (one whose blast radius
 * crosses every workspace in `content.db`, e.g. a whole-database migration) cannot be authorized
 * through the ordinary workspace-scoped `authorize()` without either denying every principal or
 * letting a single workspace's admin approve a cross-tenant operation; this closes that gap by
 * granting instance scope to exactly the seeded owner principal, mirroring how `setting_values_global`
 * sits alongside `setting_values_workspace` as a genuinely separate surface rather than an overloaded
 * scope value. `resolveActorClassIdentity` and `buildConfirmOnlyHooks` are the two pieces every
 * ceremony's hooks reuse. Domain-specific hooks live in their owning taxonomy, database and
 * recovery modules, each importing these shared contracts. This keeps features from reaching
 * back into `server/` for domain logic. Hooks close over request identifiers, so routes construct
 * them per request.
 *
 * Production readiness requires durable confirmation tokens (SPEC-022). The real SQLite root
 * passes `SqliteTokenStore`; the hermetic in-memory root omits the override and keeps the
 * in-memory default because it is not a production composition.
 *
 * Architectural role:
 * `core/gated-mutations`'s own composition helper — generic across every ceremony, holding no
 * domain-specific type or logic (this is why it is safe for `core/gated-mutations` to own it
 * directly rather than a server-side composition root). `server/runtime/composition/deps.ts`/`server/runtime/composition/app.ts` bind
 * `buildGatewayDeps` to `identity.authorize()`; each domain's `gated-hooks.ts` binds
 * `resolveActorClassIdentity`/`planHashOf` into its own ceremony-specific hooks. Note for future
 * packaging: this file uses `node:crypto` (`createHash`), which is acceptable for Tovu's `core`
 * host adapter; the runtime-agnostic approval ceremony now lives in `@jini-ai/core/gated-mutations`.
 */

/** One process-lifetime `GatewayDeps` — constructed once per composition root (mirrors every
 * other singleton this codebase's `deps.ts`/`app.ts` already construct once, e.g. `formsRateLimiter`).
 * `authorizeInstance` is optional and additive (`GatewayDeps.authorizeInstance`'s own doc comment)
 * — a caller that omits it gets exactly the pre-existing three-field signature's behavior.
 * `tokens` defaults to `InMemoryTokenStore` (this function's pre-existing behavior, still correct
 * for `server/runtime/composition/app.ts`'s hermetic in-memory composition); pass a durable `TokenStorePort` — see this
 * file's own header — for a production composition root. */
export function buildGatewayDeps(params: {
  clock: ClockPort;
  idGen: IdGeneratorPort;
  authorize: AuthorizeFn;
  authorizeInstance?: InstanceAuthorizeFn;
  tokens?: TokenStorePort;
}, _optional: Record<string, never> = {}): GatewayDeps {
  return {
    clock: params.clock,
    idGen: params.idGen,
    authorize: params.authorize,
    authorizeInstance: params.authorizeInstance,
    tokens: params.tokens ?? new InMemoryTokenStore(),
  };
}

/**
 * The minimal `InstanceAuthorizeFn` binding: grants every permission to exactly the seeded owner
 * principal, denies everyone else — the RBAC-table equivalent of `authorize()`'s own
 * `owner_wildcard` precedent (`@jini-ai/user-management/server/authorize.ts`), reused here rather than
 * inventing new vocabulary. Disclosed simplification, same shape as `resolveActorClassIdentity`'s
 * disclosure below: `db/schema.sqlite.ts`'s RBAC tables (`principals`/`roles`/`policies`/...) are all
 * `workspace_id NOT NULL` — today's identity model has no dedicated instance-level policy/permission
 * table (unlike `setting_values_global`, which has no workspace column at all). `ownerPrincipalId`
 * (`identity/wiring.ts`'s `IdentityRouteDepsSlice`, SPEC-006 0.6.0's "seeded owner is never
 * disable-able") is the one principal this codebase already seeds once per composition-root
 * process/instance, making it the correct minimal instance-scope binding until a real
 * instance-level policy surface exists.
 * `[CIC_REQUESTED]` Unit=gated-mutations-instance-scope Trigger=an instance-scoped ceremony needing
 * more than one legitimate instance-level approver (e.g. multiple site operators) Property="a
 * workspace-scoped grant must never authorize an instance-wide mutation" MissingConstraint=a real
 * instance-level policy/permission table mirroring `setting_values_global`'s workspace-column-free
 * shape Evidence=`db/schema.sqlite.ts` RBAC tables (all `workspace_id NOT NULL`), this file.
 *
 * @complexity O(1): one promise await, one equality check.
 * @overallScore 100
 */
export function buildOwnerOnlyInstanceAuthorize(params: { ownerPrincipalId: Promise<string> }): InstanceAuthorizeFn {
  return async ({ principalId }) => {
    const ownerPrincipalId = await params.ownerPrincipalId;
    if (typeof ownerPrincipalId !== "string" || ownerPrincipalId.length === 0 || principalId !== ownerPrincipalId) {
      return { allowed: false, reason: "not_instance_owner" };
    }
    return { allowed: true, reason: "owner_wildcard" };
  };
}

/** Deterministic plan-hash: sha256 over the plan's own JSON-stable `details` object. Recomputing
 * this from LIVE state (not a cached value) at both `plan()`-time and `execute()`-time is what
 * makes CIC U-001-B3's "plan re-derivation" check meaningful — a details object that changed
 * between confirm and execute produces a different hash, which `execute()` rejects as `PLAN_STALE`. */
export function planHashOf(details: unknown): string {
  return createHash("sha256").update(JSON.stringify(details)).digest("hex");
}

/**
 * `resolveActorClassIdentity` binding shared by all three ceremonies (SPEC-016 REQ-13/REQ-15).
 * Disclosed simplification: returns `principalId` unconditionally for every `principalKind`,
 * matching `core/gated-mutations/__tests__/unit/gateway.unit.test.ts`'s own reference
 * `resolveActorClassIdentity` default (`makeHooks()`'s `async ({ principalId }) => principalId`).
 * The full REQ-13 contract additionally requires resolving an `agent`'s CURRENT delegator and an
 * `api_key`'s owning user — this codebase has no composed port this file can reach that resolves
 * either (`identity`'s delegation/ownership lookups are not exposed through `RouteDeps` today).
 * `[CIC_REQUESTED]` Unit=gated-mutations-composition Trigger=agent/api_key ceremony confirmation
 * Property=REQ-13's actor-class rule Correctly narrows only `kind='user'` MissingConstraint=a
 * `resolveCurrentDelegator(agentId)`/`resolveApiKeyOwner(apiKeyId)` port Evidence=ADR-041 §5, this
 * file.
 *
 * Publish import reports its actual credential kind, so the api_key gap is reachable: REQ-13
 * needs the key's owning user, but this binding returns the key's principal id. For publish_key,
 * that identity is correct: a publishing installation has no delegator or owning user, and only
 * the installation that confirmed may redeem.
 */
export async function resolveActorClassIdentity(params: { principalId: string; principalKind: PrincipalKind }): Promise<string | null> {
  return params.principalId;
}

/**
 * Minimal `GatedMutationHooks` for the `confirm()` step only — `gateway.ts`'s `confirm()` never
 * calls `hooks.computePlan()`/`hooks.executeMutation()` (only `domain`/`mutatePermission`/
 * `scopeId`/`scopeKind`), so this shared factory avoids each of the 3 ceremony route files having
 * to rebuild a full domain-specific hooks object (with its request-scoped details) just to confirm
 * a token. The two throwing stubs are a deliberate tripwire: if `gateway.ts`'s `confirm()` contract
 * ever changes to invoke either method, this throws loudly instead of silently running the wrong
 * logic.
 *
 * `scopeKind` is optional and passed straight through (mirrors `GatedMutationHooks.scopeKind`'s
 * own default) — a caller building confirm-only hooks for an instance-scoped ceremony (`backup.
 * restore`, `database.migrate`, see those domains' `gated-hooks.ts`) must supply
 * `scopeKind: "instance"` here too, or `confirm()`'s own `mutatePermission` check would silently
 * stay workspace-scoped even though `plan()`/`execute()` (built from the real domain hooks
 * factory) are instance-scoped — an inconsistency within one ceremony, not just a gap between
 * ceremonies. This same shape (no real closures, auth-only) is also reused directly by a route's
 * own pre-lock authorization pre-check, see `gateway.ts`'s `authorizeForHooks` doc comment.
 */
export function buildConfirmOnlyHooks(params: {
  domain: string;
  readPermission: string;
  mutatePermission: string;
  scopeId: string;
  scopeKind?: "workspace" | "instance";
}): GatedMutationHooks<unknown, unknown> {
  return {
    ...params,
    computePlan: async () => {
      throw new Error("computePlan is not invoked by gateway.ts's confirm() — this hooks object is confirm-only");
    },
    executeMutation: async () => {
      throw new Error("executeMutation is not invoked by gateway.ts's confirm() — this hooks object is confirm-only");
    },
    resolveActorClassIdentity,
  };
}
