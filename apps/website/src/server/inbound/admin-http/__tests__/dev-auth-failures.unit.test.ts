import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express, { type Request } from "express";
import { createCapturingResponse, extractRouteHandler } from "../../../__tests__/helpers/http-test-server.js";
import { createRouteDeps } from "../../../runtime/composition/app.js";
import { redeemOwnerBootSession, registerAuthRoutes } from "../dev-auth.js";

const privateFact = "private identity table owner_482 unavailable; password=AUTH_SECRET_CANARY";

for (const fault of ["identity", "session", "logout"] as const) {
  test(`${fault} failure gives an anonymous-safe explanation and correlated report`, async t => {
    const deps = createRouteDeps();
    await deps.identityReady;
    const failure = new Error(privateFact);
    const failing = { ...deps };
    if (fault === "identity") Object.defineProperty(failing, "identityReady", { get: () => Promise.reject(failure) });
    if (fault === "session") t.mock.method(deps.sessionRepo, "save", async () => { throw failure; });
    if (fault === "logout") {
      t.mock.method(deps.sessionRepo, "findByTokenHash", async () => ({ id: "existing-session", revokedAt: null }));
      t.mock.method(deps.sessionRepo, "revoke", async () => { throw failure; });
    }
    const logs = t.mock.method(console, "error", () => {});
    const app = express();
    registerAuthRoutes(app, failing);
    const { res, capture } = createCapturingResponse();
    const tracked: Array<{ error: Error; options: unknown }> = [];
    res.locals.adminFailureTracker = { error: ({ error }: { error: Error }, options: unknown) => tracked.push({ error, options }) };
    const cookies: string[] = [];
    res.cookie = (name: string) => { cookies.push(name); return res; };
    res.clearCookie = (name: string) => { cookies.push(name); return res; };
    // The injected session lookup makes this bearer reach revoke without starting HTTP.
    const req = { body: { username: "admin", password: "tovu-dev" }, ip: "127.0.0.1",
      headers: { cookie: fault === "logout" ? "tovu_session=old-token" : "" },
      socket: { localPort: 408 }, get: () => undefined } as unknown as Request;
    await extractRouteHandler(app, "post", `/api/admin/v1/auth/${fault === "logout" ? "logout" : "login"}`)(req, res);
    assert.equal(capture.statusCode, 500);
    const body = capture.jsonBody as { code: string; error: string; errorId: string; details: { failure: { copyText: string; errorId: string; action: string } } };
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.match(body.error, fault === "logout" ? /Sign-out could not finish/ : /Sign-in could not finish/);
    assert.match(body.details.failure.action, /Try.*again/);
    assert.equal(body.errorId, body.details.failure.errorId);
    assert.ok(body.details.failure.copyText.includes(body.errorId));
    assert.doesNotMatch(JSON.stringify(body), /AUTH_SECRET_CANARY|owner_482|private identity|tovu-dev/);
    assert.equal(logs.mock.callCount(), 1);
    assert.equal((logs.mock.calls[0].arguments[1] as { errorId: string }).errorId, body.errorId);
    assert.equal(tracked.length, 1);
    assert.ok(JSON.stringify(tracked[0].options).includes(body.errorId));
    assert.doesNotMatch(tracked[0].error.message, /AUTH_SECRET_CANARY/);
    assert.deepEqual(cookies, [], "no cookie is issued or cleared after a failed session operation");
  });
}

test("boot owner and verification refusals disclose equivalent explanations and no backend facts", async t => {
  const deps = createRouteDeps();
  await deps.identityReady;
  t.mock.method(console, "error", () => {});
  const principal = deps.principalRepo.findById.bind(deps.principalRepo);
  let missingOwner = true;
  t.mock.method(deps.principalRepo, "findById", async input => missingOwner ? null : principal(input));
  t.mock.method(deps.sessionRepo, "findByTokenHash", async () => null);
  const bodies: Array<{ error: string; errorId: string; details: { failure: Record<string, string> } }> = [];
  for (const missing of [true, false]) {
    missingOwner = missing;
    const { res, capture } = createCapturingResponse();
    res.req = { headers: {}, socket: { localPort: 408 } } as Request;
    res.cookie = () => { assert.fail("refused boot must not set cookies"); };
    assert.equal(await redeemOwnerBootSession({ deps, res, token: "BOOT_SECRET_CANARY" }, { redeem: () => true }), null);
    assert.equal(capture.statusCode, 500);
    bodies.push(capture.jsonBody as typeof bodies[number]);
  }
  for (const field of ["message", "action", "step", "cause"]) {
    assert.equal(bodies[0].details.failure[field], bodies[1].details.failure[field]);
  }
  assert.match(bodies[0].details.failure.message, /Sign-in could not finish/);
  assert.doesNotMatch(JSON.stringify(bodies), /BOOT_SECRET_CANARY|principal|mint|validat|owner_482/);
});
