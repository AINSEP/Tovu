import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerPublishContentPeerTransportRoutes } from "../../admin-http/routes/publish-content/peer-transport.js";
import { registerPublishBackstopRoutes } from "../../admin-http/routes/publish-content/backstop.js";

const BASE = "/api/admin/v1/workspaces/ws/publish-content";
const cases = [
  { path: `${BASE}/peers/PRIVATE_PEER/push/execute`, message: "The publishing push result could not be confirmed." },
  { path: `${BASE}/backstop`, message: "This send could not complete." },
  { path: `${BASE}/runs/PRIVATE_RUN/undo-backstop`, message: "This send could not be undone." },
];

for (const row of cases) {
  test(`${row.path}: the final failure explains publishing uncertainty before another mutation`, async t => {
    t.mock.method(console, "error", () => {});
    const app = express();
    app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
    const deps = { workspaceId: "ws", authorize: async () => { throw new Error("PRIVATE_BACKEND password=SECRET_CANARY"); } } as never;
    registerPublishContentPeerTransportRoutes(app, deps);
    registerPublishBackstopRoutes(app, deps);
    const response = await dispatchJsonRequest(app, "POST", row.path, { bundleId: "b", confirmationToken: "c" });
    assert.equal(response.status, 500);
    const body = response.body as any;
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.equal(body.details.failure.message, row.message);
    assert.match(body.details.failure.action, /Content may already have changed/);
    assert.match(body.details.failure.action, /Check publishing and import history before/);
    assert.equal(body.details.failure.errorId, body.errorId);
    assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
    for (const canary of ["PRIVATE_PEER", "PRIVATE_RUN", "PRIVATE_BACKEND", "SECRET_CANARY"])
      assert.equal(JSON.stringify(body).includes(canary), false);
  });
}

test("publishing mapper sends anonymous failures without a details envelope", async t => {
  t.mock.method(console, "error", () => {});
  const app = express();
  registerPublishContentPeerTransportRoutes(app, { workspaceId: "ws" } as never);
  const response = await dispatchJsonRequest(app, "POST", cases[0].path, {});
  assert.equal(response.status, 500);
  const body = response.body as any;
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.details, undefined);
  assert.match(body.error, new RegExp(body.errorId));
  assert.equal(JSON.stringify(body).includes("PRIVATE_PEER"), false);
});
