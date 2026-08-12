import { createHash } from "node:crypto";

import type { AuthorizeFn, ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import type { GatedMutationHooks, GatewayDeps } from "./gateway";
import { InMemoryTokenStore } from "./token";
import type { InstanceAuthorizeFn, PrincipalKind } from "./ports";

/**
 * @file Composes `core/gated-mutations`'s `plan()`/`confirm()`/`execute()` primitive into this
 * codebase's real and hermetic-test composition roots (`server/deps.ts`/`server/app.ts`) — the gap
 * every prior session of the spec-016-020 workstream disclosed but left open (Session 5: "a
 * token-store-backed primitive composed into ZERO composition roots in this codebase as of this
 * session, confirmed by direct grep").
 *
 * Purpose:
 * `buildGatewayDeps` builds the one shared `GatewayDeps` (clock/idGen/authorize/authorizeInstance/
 * tokens) every ceremony needs. `buildOwnerOnlyInstanceAuthorize` is the minimal binding for
 * `authorizeInstance` — every RBAC table (`principals`/`roles`/`policies`/...) is
 * `workspace_id NOT NULL` (`db/schema.ts`), so an instance-wide ceremony (one whose blast radius
 * crosses every workspace in `content.db`, e.g. a whole-database migration) cannot be authorized
 * through the ordinary workspace-scoped `authorize()` without either denying every principal or
 * letting a single workspace's admin approve a cross-tenant operation; this closes that gap by
 * granting instance scope to exactly the seeded owner principal, mirroring how `setting_values_global`
 * sits alongside `setting_values_workspace` as a genuinely separate surface rather than an overloaded
 * scope value. `resolveActorClassIdentity` and `buildConfirmOnlyHooks` are the two pieces every
 * ceremony's hooks reuse verbatim. The three per-ceremony `buildXHooks` factories that used to live
 * alongside these in this file's predecessor (`server/gated-mutations-composition.ts`) — taxonomy
 * `mergeTerm`, database `migrate-forward`, recovery `restore` — moved to their owning domains
 * (`features/taxonomy/gated-hooks.ts`, `features/database/gated-hooks.ts`,
 * `features/recovery/gated-hooks.ts` respectively), each importing `planHashOf` and
 * `resolveActorClassIdentity` from here. That split closes the back-edge those three domains'
 * `tool-registrations.ts` files previously had into `server/` for a domain-specific hook builder —
 * this file is the one quarter of the old composition root that is genuinely generic (no
 * domain-specific type or logic), so it lives in `core/gated-mutations` itself rather than in
 * `server/`. Each route still constructs its ceremony's hooks fresh per request (hooks close over
 * request-scoped identifiers like `fromTermId`/`intoTermId` or `restorePointId`, which are only
 * known once a request arrives).
 *
 * TokenStorePort decision (disclosed, not guessed): `core/gated-mutations/token.ts`'s own doc
 * comment states a durable SQLite-backed token store "is not required by this test slice (tokens
 * are short-lived, in-process confirmation state)". ADR-041 §5 corroborates: tokens are single-use,
 * ~10 minute TTL, minted and redeemed within one server process's lifetime — a mid-ceremony process
 * restart failing an in-flight `confirm()`->`execute()` round-trip is an accepted, low-blast-radius
 * edge case (the caller re-plans/re-confirms), not a correctness gap. `InMemoryTokenStore` is
 * therefore the right choice for a single-process server; no `[CIC_DEVIATION]` from ADR-041 §5 is
 * being taken, since the ADR does not pin a specific `TokenStorePort` implementation.
 *
 * Architectural role:
 * `core/gated-mutations`'s own composition helper — generic across every ceremony, holding no
 * domain-specific type or logic (this is why it is safe for `core/gated-mutations` to own it
 * directly rather than a server-side composition root). `server/deps.ts`/`server/app.ts` bind
 * `buildGatewayDeps` to `identity.authorize()`; each domain's `gated-hooks.ts` binds
 * `resolveActorClassIdentity`/`planHashOf` into its own ceremony-specific hooks. Note for future
 * packaging: this file uses `node:crypto` (`createHash`), which is acceptable for Tovu's `core`
 * today but would need a `HashPort`-style seam if `core/gated-mutations` is ever extracted into a
 * runtime-agnostic package.
 */

/** One process-lifetime `GatewayDeps` — constructed once per composition root (mirrors every
 * other singleton this codebase's `deps.ts`/`app.ts` already construct once, e.g. `formsRateLimiter`).
 * `authorizeInstance` is optional and additive (`GatewayDeps.authorizeInstance`'s own doc comment)
 * — a caller that omits it gets exactly the pre-existing three-field signature's behavior. */
export function buildGatewayDeps(params: {
  clock: ClockPort;
  idGen: IdGeneratorPort;
  authorize: AuthorizeFn;
  authorizeInstance?: InstanceAuthorizeFn;
}): GatewayDeps {
  return {
    clock: params.clock,
    idGen: params.idGen,
    authorize: params.authorize,
    authorizeInstance: params.authorizeInstance,
    tokens: new InMemoryTokenStore(),
  };
}

/**
 * The minimal `InstanceAuthorizeFn` binding: grants every permission to exactly the seeded owner
 * principal, denies everyone else — the RBAC-table equivalent of `authorize()`'s own
 * `owner_wildcard` precedent (`@jini-ai/cms/identity/authorize.ts`), reused here rather than
 * inventing new vocabulary. Disclosed simplification, same shape as `resolveActorClassIdentity`'s
 * disclosure below: `db/schema.ts`'s RBAC tables (`principals`/`roles`/`policies`/...) are all
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
 * shape Evidence=`db/schema.ts` RBAC tables (all `workspace_id NOT NULL`), this file.
 *
 * @complexity O(1): one promise await, one equality check.
 * @overallScore 100
 */
export function buildOwnerOnlyInstanceAuthorize(params: { ownerPrincipalId: Promise<string> }): InstanceAuthorizeFn {
  return async ({ principalId }) => {
    const ownerPrincipalId = await params.ownerPrincipalId;
    if (principalId !== ownerPrincipalId) {
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
 * file. Every route wired this pass authenticates as a `kind='user'` principal (session-cookie
 * auth, `getAuthedPrincipal`), so this simplification is inert for the traffic this dispatch
 * actually serves; flagged rather than silently narrowed for whoever wires agent/api_key traffic
 * through these ceremonies next.
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
