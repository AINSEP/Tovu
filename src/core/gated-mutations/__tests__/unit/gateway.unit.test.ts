import assert from "node:assert/strict";
import test from "node:test";

import {
  ForbiddenError,
  PlanStaleError,
  UnauthenticatedError,
  confirm,
  execute,
  plan,
} from "../../gateway";
import { InMemoryTokenStore, TokenAlreadyRedeemedError, TokenExpiredError, mintToken } from "../../token";
import type { AuthorizeFn, PrincipalKind } from "../../ports";

/**
 * @file SPEC-016 C-001/C-002/C-003 — the plan() -> confirm() -> execute() gated-mutation gateway.
 *
 * Assumed seam design (TDD-authored, consistent with implementation-outline.md's Contract Map,
 * Critical Internal Constraints U-001, and behavior.spec.md §2.2's fixed check-sequence):
 *
 * ```ts
 * export interface GatedMutationHooks<TDetails, TResult> {
 *   domain: string;
 *   readPermission: string;     // "{domain}.read"
 *   mutatePermission: string;   // "{domain}.{mutating-verb}"
 *   scopeId: string;
 *   computePlan(): Promise<{ planHash: string; details: TDetails }>;
 *   executeMutation(): Promise<TResult>;
 *   // Resolves the identity the actor-class rule (REQ-13) compares the token's
 *   // confirmerPrincipalId against: the caller's own id for kind='user'; the agent's CURRENT
 *   // delegator for kind='agent'; the api_key's owning user for kind='api_key'. Re-resolved fresh
 *   // at execute() time (REQ-15) — never cached from confirm()-time.
 *   resolveActorClassIdentity(params: { principalId: string; principalKind: PrincipalKind }): Promise<string | null>;
 * }
 *
 * export interface GatewayDeps {
 *   clock: ClockPort;
 *   idGen: IdGeneratorPort;
 *   authorize: AuthorizeFn;
 *   tokens: TokenStorePort; // from token.ts
 * }
 *
 * export async function plan(required: { deps: GatewayDeps; principalId: string;
 *   principalKind: PrincipalKind; hooks: GatedMutationHooks<any, any> }, optional?: {}): Promise<GatewayPlan>;
 *
 * export async function confirm(required: { deps: GatewayDeps; principalId: string;
 *   principalKind: PrincipalKind; hooks: GatedMutationHooks<any, any>; planId: string;
 *   planHash: string }, optional?: {}): Promise<ConfirmationTokenRecord>;
 *
 * export async function execute<TResult>(required: { deps: GatewayDeps; principalId: string;
 *   principalKind: PrincipalKind; hooks: GatedMutationHooks<any, TResult>;
 *   confirmationToken: string }, optional?: {}): Promise<TResult>;
 * ```
 *
 * Fixed check-sequence inside `execute()` (behavior.spec.md §2.2, CIC U-001):
 *   1. `authorize()` re-evaluated fresh (U-001-B1 / U-001-ORD1)
 *   2. token expiry/redemption-state check (U-001-ORD2)
 *   3. actor-class redemption rule, REQ-13 (U-001-B2 / U-001-ORD3)
 *   4. plan re-derivation / hash comparison (U-001-B3)
 *   5. domain mutation
 */

const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };
function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function alwaysAllow(): AuthorizeFn {
  return async () => ({ allowed: true, reason: "matched" });
}
function alwaysDeny(reason = "no_grant"): AuthorizeFn {
  return async () => ({ allowed: false, reason });
}

function makeHooks(overrides: Partial<Record<string, unknown>> = {}) {
  let mutationRuns = 0;
  return {
    domain: "storage.migrate",
    readPermission: "storage.read",
    mutatePermission: "storage.migrate",
    scopeId: "workspace-1",
    async computePlan() {
      return { planHash: "sha256:" + "1".repeat(64), details: { preview: true } };
    },
    async executeMutation() {
      mutationRuns += 1;
      return { migrated: true };
    },
    async resolveActorClassIdentity({ principalId }: { principalId: string; principalKind: PrincipalKind }) {
      return principalId;
    },
    get mutationRuns() {
      return mutationRuns;
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    clock,
    idGen: counterIdGen(),
    authorize: alwaysAllow(),
    tokens: new InMemoryTokenStore(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C-001 plan() — AC-09, AC-10, AC-11
// ---------------------------------------------------------------------------

test("AC-10: plan() succeeds for a principal holding only {domain}.read and produces no state change", async () => {
  const hooks = makeHooks();
  const deps = makeDeps();

  const result = await plan({ deps, principalId: "u-1", principalKind: "user", hooks });

  assert.equal(result.domain, "storage.migrate");
  assert.ok(result.planId);
  assert.ok(result.planHash);
  assert.equal(hooks.mutationRuns, 0, "plan() must never invoke the domain mutation");
});

test("AC-11: plan() returns an identical planHash for user, agent, and api_key principal kinds holding the same permission", async () => {
  const hooks = makeHooks();
  const deps = makeDeps();

  const userPlan = await plan({ deps, principalId: "u-1", principalKind: "user", hooks });
  const agentPlan = await plan({ deps, principalId: "a-1", principalKind: "agent", hooks });
  const apiKeyPlan = await plan({ deps, principalId: "k-1", principalKind: "api_key", hooks });

  assert.equal(userPlan.planHash, agentPlan.planHash);
  assert.equal(userPlan.planHash, apiKeyPlan.planHash);
  // planId/details are explicitly NOT required to be identical (AC-11's own carve-out).
});

test("AC-09: plan() rejects when the caller lacks {domain}.read", async () => {
  const hooks = makeHooks();
  const deps = makeDeps({ authorize: alwaysDeny() });

  await assert.rejects(
    plan({ deps, principalId: "u-1", principalKind: "user", hooks }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError);
      return true;
    }
  );
});

test("architectural guard (AC-09): gateway.ts exposes no direct single-call mutation entry point beyond plan/confirm/execute", async () => {
  const gatewayModule = await import("../../gateway");
  const exportedNames = Object.keys(gatewayModule);
  const disallowed = exportedNames.filter(
    (name) => /mutate|migrate|run|apply/i.test(name) && !["plan", "confirm", "execute"].includes(name)
  );
  assert.deepEqual(disallowed, [], "no export beyond plan/confirm/execute may perform a gated mutation directly");
});

// ---------------------------------------------------------------------------
// C-002 confirm() — AC-12, AC-13, AC-14, INV-04
// ---------------------------------------------------------------------------

test("AC-12: an agent principal calling confirm() is rejected regardless of any permission it holds", async () => {
  const hooks = makeHooks();
  const deps = makeDeps({ authorize: alwaysAllow() }); // agent DOES hold permission — must still be rejected

  await assert.rejects(
    confirm({ deps, principalId: "agent-1", principalKind: "agent", hooks, planId: "p1", planHash: "sha256:" + "1".repeat(64) }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError);
      return true;
    }
  );
});

test("AC-13 / INV-04: a user lacking the gated mutation's permission calling confirm() is rejected and no token is minted", async () => {
  const hooks = makeHooks();
  const tokens = new InMemoryTokenStore();
  const deps = makeDeps({ authorize: alwaysDeny(), tokens });

  await assert.rejects(
    confirm({ deps, principalId: "u-1", principalKind: "user", hooks, planId: "p1", planHash: "sha256:" + "1".repeat(64) }),
    (err: unknown) => err instanceof ForbiddenError
  );

  assert.equal(await tokens.count(), 0, "INV-04: no token may exist for a principal that failed authorize() at mint time");
});

test("AC-14: an authorized user's confirm() mints a token with exactly a 600-second TTL bound to (planHash, scopeId, confirmerPrincipalId)", async () => {
  const hooks = makeHooks();
  const deps = makeDeps();
  const planHash = "sha256:" + "1".repeat(64);

  const token = await confirm({ deps, principalId: "u-1", principalKind: "user", hooks, planId: "p1", planHash });

  assert.equal(token.expiresAt, "2026-07-15T00:10:00.000Z");
  assert.equal(token.planHash, planHash);
  assert.equal(token.scopeId, "workspace-1");
  assert.equal(token.confirmerPrincipalId, "u-1");
});

// ---------------------------------------------------------------------------
// C-003 execute() — U-001 fixed check-sequence, INV-05, INV-08
// ---------------------------------------------------------------------------

async function mintValidToken(overrides: Partial<Record<string, unknown>> = {}) {
  const tokens = new InMemoryTokenStore();
  const record = mintToken({
    planId: "p1",
    planHash: "sha256:" + "1".repeat(64),
    scopeId: "workspace-1",
    confirmerPrincipalId: "u-1",
    now: NOW,
    ...overrides,
  });
  await tokens.save(record);
  return { tokens, record };
}

test("AC-15 / U-001-B1 / U-001-ORD1: authorize() is evaluated fresh before the token expiry/redemption-state check — an unauthorized caller with an independently-expired token sees FORBIDDEN, never TOKEN_EXPIRED", async () => {
  const { tokens, record } = await mintValidToken();
  const hooks = makeHooks();
  const deps = makeDeps({ authorize: alwaysDeny("revoked"), tokens });

  await assert.rejects(
    execute({
      deps,
      principalId: "u-1",
      principalKind: "user",
      hooks,
      confirmationToken: record.confirmationToken,
    }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError, "must be FORBIDDEN, never TOKEN_EXPIRED, when authorize() denies");
      assert.ok(!(err instanceof TokenExpiredError));
      return true;
    }
  );
});

test("U-001-ORD2: the token expiry/redemption-state check completes before the actor-class rule — an already-redeemed token from an actor-class-mismatched caller reports TOKEN_ALREADY_REDEEMED, not FORBIDDEN", async () => {
  const { tokens, record } = await mintValidToken({ confirmerPrincipalId: "u-1" });
  // Pre-redeem the token so the token-state check must fail first.
  await tokens.tryRedeem({ token: record.confirmationToken, now: NOW });

  const hooks = makeHooks({
    async resolveActorClassIdentity() {
      return "someone-else"; // would ALSO fail the actor-class rule if reached
    },
  });
  const deps = makeDeps({ tokens });

  await assert.rejects(
    execute({ deps, principalId: "u-2", principalKind: "user", hooks, confirmationToken: record.confirmationToken }),
    (err: unknown) => {
      assert.ok(err instanceof TokenAlreadyRedeemedError, "token-state failure must be reported before the actor-class rule runs");
      return true;
    }
  );
});

test("AC-18 / EC-08: a user redeeming a token minted by a different user is rejected with FORBIDDEN/ACTOR_CLASS_MISMATCH", async () => {
  const { tokens, record } = await mintValidToken({ confirmerPrincipalId: "u-1" });
  const hooks = makeHooks(); // default resolveActorClassIdentity returns the calling principalId itself
  const deps = makeDeps({ tokens });

  await assert.rejects(
    execute({ deps, principalId: "u-2", principalKind: "user", hooks, confirmationToken: record.confirmationToken }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError);
      assert.equal((err as ForbiddenError).reasonCode, "ACTOR_CLASS_MISMATCH");
      return true;
    }
  );
});

test("AC-19 / EC-07: an agent redeeming a token whose confirmerPrincipalId is not its current delegatedBy is rejected", async () => {
  const { tokens, record } = await mintValidToken({ confirmerPrincipalId: "u-1" });
  const hooks = makeHooks({
    async resolveActorClassIdentity() {
      return "u-999"; // agent's real current delegator — does not match the token's confirmer
    },
  });
  const deps = makeDeps({ tokens });

  await assert.rejects(
    execute({ deps, principalId: "agent-1", principalKind: "agent", hooks, confirmationToken: record.confirmationToken }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError);
      assert.equal((err as ForbiddenError).reasonCode, "ACTOR_CLASS_MISMATCH");
      return true;
    }
  );
});

test("AC-20: an agent redeeming a token whose confirmerPrincipalId equals its current delegatedBy succeeds", async () => {
  const { tokens, record } = await mintValidToken({ confirmerPrincipalId: "u-1" });
  const hooks = makeHooks({
    async resolveActorClassIdentity() {
      return "u-1"; // matches the token's confirmer
    },
  });
  const deps = makeDeps({ tokens });

  const result = await execute({ deps, principalId: "agent-1", principalKind: "agent", hooks, confirmationToken: record.confirmationToken });
  assert.deepEqual(result, { migrated: true });
  assert.equal(hooks.mutationRuns, 1);
});

test("AC-16 / AC-17 / U-001-B3: a recomputed plan hash mismatch rejects with PLAN_STALE before any mutation runs", async () => {
  const { tokens, record } = await mintValidToken({ planHash: "sha256:" + "1".repeat(64) });
  const hooks = makeHooks({
    async computePlan() {
      return { planHash: "sha256:" + "2".repeat(64), details: {} }; // drifted since plan()/confirm()
    },
  });
  const deps = makeDeps({ tokens });

  await assert.rejects(
    execute({ deps, principalId: "u-1", principalKind: "user", hooks, confirmationToken: record.confirmationToken }),
    (err: unknown) => {
      assert.ok(err instanceof PlanStaleError);
      return true;
    }
  );
  assert.equal(hooks.mutationRuns, 0, "PLAN_STALE must reject before any durable mutation is applied");
});

test("AC-38 / U-001-B2 / U-001-ORD3: actor-class mismatch AND a stale plan together report FORBIDDEN, never PLAN_STALE", async () => {
  const { tokens, record } = await mintValidToken({ confirmerPrincipalId: "u-1", planHash: "sha256:" + "1".repeat(64) });
  const hooks = makeHooks({
    async computePlan() {
      return { planHash: "sha256:" + "9".repeat(64), details: {} }; // ALSO stale
    },
  });
  const deps = makeDeps({ tokens });

  await assert.rejects(
    // u-2 never confirmed this token (actor-class mismatch) AND the plan has independently drifted
    execute({ deps, principalId: "u-2", principalKind: "user", hooks, confirmationToken: record.confirmationToken }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError, "actor-class rule must win — never PLAN_STALE — when both conditions hold");
      assert.ok(!(err instanceof PlanStaleError));
      assert.equal((err as ForbiddenError).reasonCode, "ACTOR_CLASS_MISMATCH");
      return true;
    }
  );
});

test("REQ-11 / AC-35: execute() with a confirmationToken string never minted by this contract returns TOKEN_EXPIRED, indistinguishable from a genuinely expired token", async () => {
  const hooks = makeHooks();
  const deps = makeDeps();

  await assert.rejects(
    execute({ deps, principalId: "u-1", principalKind: "user", hooks, confirmationToken: "never-issued-garbage" }),
    (err: unknown) => {
      assert.ok(err instanceof TokenExpiredError);
      return true;
    }
  );
});

test("AC-22 / REQ-15: execute() re-evaluates authorize() fresh, reflecting a delegator permission change since confirm()-time, never a cached confirm-time result", async () => {
  const { tokens, record } = await mintValidToken({ confirmerPrincipalId: "u-1" });
  let authorizeCallCount = 0;
  const hooks = makeHooks({
    async resolveActorClassIdentity() {
      return "u-1";
    },
  });
  const deps = makeDeps({
    tokens,
    authorize: (async () => {
      authorizeCallCount += 1;
      // Simulate a delegator whose grant collapsed since confirm()-time: deny on this fresh call.
      return { allowed: false, reason: "delegator_revoked" };
    }) as AuthorizeFn,
  });

  await assert.rejects(
    execute({ deps, principalId: "u-1", principalKind: "user", hooks, confirmationToken: record.confirmationToken }),
    (err: unknown) => err instanceof ForbiddenError
  );
  assert.equal(authorizeCallCount, 1, "authorize() must be called fresh at execute() time, not skipped/cached from confirm()");
});

test("execute() succeeds exactly once for a valid token satisfying every check, and stamps a single mutation run (INV-03 exactly-once)", async () => {
  const { tokens, record } = await mintValidToken();
  const hooks = makeHooks();
  const deps = makeDeps({ tokens });

  const result = await execute({ deps, principalId: "u-1", principalKind: "user", hooks, confirmationToken: record.confirmationToken });

  assert.deepEqual(result, { migrated: true });
  assert.equal(hooks.mutationRuns, 1);
});
