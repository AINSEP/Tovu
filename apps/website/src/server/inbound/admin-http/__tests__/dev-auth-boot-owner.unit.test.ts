import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import type { PrincipalRecord } from "@jini-ai/user-management";

import { createCapturingResponse } from "../../../__tests__/helpers/http-test-server.js";
import { createRouteDeps } from "../../../runtime/composition/app.js";
import { currentCredential, redeemOwnerBootSession } from "../dev-auth.js";

function bootResponse({ cookie = "" }: { cookie?: string }, _options = {}) {
  const { res, capture } = createCapturingResponse();
  const cookies: Array<{ name: string; value: string; options: unknown }> = [];
  const cleared: string[] = [];
  res.req = { headers: { cookie }, socket: { localPort: 303 } } as Request;
  res.cookie = (name: string, value: string, options?: unknown) => {
    cookies.push({ name, value, options });
    return res;
  };
  res.clearCookie = (name: string) => { cleared.push(name); return res; };
  return { res, capture, cookies, cleared };
}

test("boot redemption rejects an invalid token before reading the boot owner or minting", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const find = t.mock.method(deps.principalRepo, "findById");
  const save = t.mock.method(deps.sessionRepo, "save");
  const response = bootResponse({});
  const token = {};
  const result = await redeemOwnerBootSession({ deps, res: response.res, token }, {
    redeem: presented => { assert.strictEqual(presented, token); return false; },
  });
  assert.equal(result, null);
  assert.deepEqual(response.capture, { statusCode: 401, jsonBody: { error: "invalid or spent boot token", code: "UNAUTHENTICATED" } });
  assert.equal(find.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
  assert.deepEqual(response.cookies, []);
});

for (const state of ["missing", "disabled", "member"] as const) {
  test(`boot redemption rejects a ${state} owner before minting a session`, async (t) => {
    const deps = createRouteDeps();
    await deps.identityReady;
    const principalId = await deps.ownerPrincipalId;
    const owner = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
    assert.ok(owner);
    const principals: Record<typeof state, PrincipalRecord | null> = {
      missing: null,
      disabled: { ...owner, status: "disabled" },
      member: { ...owner, kind: "member" },
    };
    t.mock.method(deps.principalRepo, "findById", async (input: { workspaceId: string; id: string }) => {
      assert.deepEqual(input, { workspaceId: deps.workspaceId, id: principalId });
      return principals[state];
    });
    const save = t.mock.method(deps.sessionRepo, "save");
    const response = bootResponse({});
    assert.equal(await redeemOwnerBootSession({ deps, res: response.res, token: undefined }, { redeem: () => true }), null);
    assert.deepEqual(response.capture, { statusCode: 500, jsonBody: { error: "internal error" } });
    assert.equal(save.mock.callCount(), 0);
    assert.deepEqual(response.cookies, []);
  });
}

test("boot redemption consumes proof before awaiting identity readiness and owner lookup", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const events: string[] = [];
  let ready!: () => void;
  const identityReady = new Promise<void>(resolve => { ready = resolve; });
  const findById = deps.principalRepo.findById.bind(deps.principalRepo);
  t.mock.method(deps.principalRepo, "findById", async (input: { workspaceId: string; id: string }) => {
    events.push("owner");
    return findById(input);
  });
  const response = bootResponse({});
  const pending = redeemOwnerBootSession({ deps: { ...deps, identityReady }, res: response.res, token: undefined }, {
    redeem: () => { events.push("redeem"); return true; }, cookieName: "tovu_session_local_303",
  });
  assert.deepEqual(events, ["redeem"]);
  ready();
  const principal = await pending;
  assert.equal(principal?.id, await deps.ownerPrincipalId);
  assert.deepEqual(events, ["redeem", "owner", "owner"]);
  assert.equal(response.cookies.length, 1);
});

for (const failure of ["identityReady", "ownerPrincipalId", "repository"] as const) {
  test(`boot redemption propagates ${failure} failure without minting or cookies`, async (t) => {
    const deps = createRouteDeps();
    await deps.identityReady;
    const error = new Error("identity store unavailable");
    const failing = { ...deps };
    if (failure === "repository") {
      t.mock.method(deps.principalRepo, "findById", async () => { throw error; });
    } else {
      // A lazy rejection keeps the failing promise observed by the production await.
      Object.defineProperty(failing, failure, { get: () => Promise.reject(error) });
    }
    const save = t.mock.method(deps.sessionRepo, "save");
    const response = bootResponse({});
    await assert.rejects(redeemOwnerBootSession({ deps: failing, res: response.res, token: undefined }, { redeem: () => true }), error);
    assert.equal(save.mock.callCount(), 0);
    assert.deepEqual(response.cookies, []);
  });
}

test("boot redemption refuses a minted session that Jini cannot validate before setting a cookie", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const save = t.mock.method(deps.sessionRepo, "save");
  t.mock.method(deps.sessionRepo, "findByTokenHash", async () => null);
  const response = bootResponse({});
  assert.equal(await redeemOwnerBootSession({ deps, res: response.res, token: undefined }, { redeem: () => true }), null);
  assert.equal(save.mock.callCount(), 1);
  assert.deepEqual(response.capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(response.cookies, []);
});

for (const cookieName of ["tovu_session", "tovu_session_local_303"]) {
  test(`boot redemption with ${cookieName} preserves its existing superseded-session policy`, async (t) => {
    const deps = createRouteDeps();
    await deps.identityReady;
    const previous = bootResponse({});
    await redeemOwnerBootSession({ deps, res: previous.res, token: undefined }, { redeem: () => true });
    const oldToken = previous.cookies[0].value;
    const cookie = `tovu_session=${oldToken}; tovu_session_local_303=${oldToken}`;
    const response = bootResponse({ cookie });
    const revoke = t.mock.method(deps.sessionRepo, "revoke");
    const owner = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: await deps.ownerPrincipalId });
    const principal = await redeemOwnerBootSession({ deps, res: response.res, token: undefined }, { redeem: () => true, cookieName });
    assert.deepEqual(principal, owner);
    assert.equal(response.cookies.length, 1);
    const issued = response.cookies[0];
    assert.equal(issued.name, cookieName);
    assert.equal(typeof issued.value, "string");
    assert.equal(issued.value.length, 64);
    assert.partialDeepStrictEqual(issued.options, { httpOnly: true, path: "/", sameSite: "strict", secure: true });
    const ordinary = cookieName === "tovu_session";
    assert.equal(revoke.mock.callCount(), ordinary ? 1 : 0);
    assert.deepEqual(response.cleared, ordinary ? ["tovu_session_local_303"] : []);
    const oldRequest = { headers: { cookie }, socket: { localPort: 303 } } as Request;
    assert.equal((await currentCredential(deps, oldRequest, { localOwnerSignIn: { enabled: true } }))?.principal.id ?? null,
      ordinary ? null : owner?.id);
    const newRequest = { headers: { cookie: `${cookieName}=${issued.value}` }, socket: { localPort: 303 } } as Request;
    assert.equal((await currentCredential(deps, newRequest, { localOwnerSignIn: { enabled: true } }))?.principal.id, principal?.id);
  });
}
