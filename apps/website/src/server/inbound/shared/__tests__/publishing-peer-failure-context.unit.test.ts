import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerPublishContentPeerRoutes } from "../../admin-http/routes/publish-content/peers.js";

const BASE = "/api/admin/v1/workspaces/ws/publish-content/peers";
const CANARY = "SECRET_CANARY_PEER_CONTEXT";
const cases = [
  { method: "GET", path: BASE, message: "The publishing destinations could not be loaded.",
    action: "Try loading them again. If it still fails, copy details and report this problem.",
    anonymousAction: "Try loading them again. If it still fails, Report this error ID.", step: "Load publishing destinations" },
  { method: "POST", path: BASE, message: "The publishing destination operation could not be completed.",
    action: "Check the result before repeating this operation. Copy details and report this problem.",
    anonymousAction: "Check the result before repeating this operation. Report this error ID.", step: "publishing destination operation" },
  { method: "PATCH", path: `${BASE}/PRIVATE_PEER`, message: "The publishing destination save could not be completed.",
    action: "Check whether your changes were saved before repeating the save. Copy details and report this problem.",
    anonymousAction: "Check whether your changes were saved before repeating the save. Report this error ID.", step: "Save publishing destination" },
  { method: "DELETE", path: `${BASE}/PRIVATE_PEER`, message: "The publishing destination removal could not be confirmed.",
    action: "Check the list before repeating the removal. Copy details and report this problem.",
    anonymousAction: "Check the list before repeating the removal. Report this error ID.", step: "Remove publishing destination" },
];

for (const row of cases) {
  for (const authenticated of [true, false]) {
    test(`${row.method} peers: ${authenticated ? "authenticated" : "anonymous"} failure uses safe request context`, async t => {
      t.mock.method(console, "error", () => {});
      const app = express();
      app.use(express.json());
      app.use((_req, res, next) => {
        if (authenticated) res.locals.principal = { id: "owner" };
        next();
      });
      registerPublishContentPeerRoutes(app, { workspaceId: "ws", authorize: async () => {
        throw new Error(`PRIVATE_BACKEND password=${CANARY}`);
      } } as never);
      const baseUrl = await startTestServer(app, t);
      const body = ["POST", "PATCH"].includes(row.method) ? JSON.stringify({ label: "Live", apiKey: CANARY }) : undefined;
      const response = await fetch(`${baseUrl}${row.path}?token=${CANARY}`, {
        method: row.method, headers: { "content-type": "application/json" }, body,
      });
      assert.equal(response.status, 500);
      const failureBody = await response.json() as any;
      assert.equal(failureBody.code, "INTERNAL_ERROR");
      assert.match(failureBody.errorId, /^[0-9a-f-]{36}$/);
      const action = authenticated ? row.action : row.anonymousAction;
      assert.equal(failureBody.error, `${row.message} ${action} (error ${failureBody.errorId})`);
      if (authenticated) {
        const failure = failureBody.details.failure;
        assert.equal(failure.message, row.message);
        assert.equal(failure.action, row.action);
        assert.equal(failure.step, row.step);
        assert.equal(failure.errorId, failureBody.errorId);
        assert.equal(failure.cause, "The error ID identifies the server report.");
      } else {
        assert.deepEqual(Object.keys(failureBody).sort(), ["code", "error", "errorId"]);
      }
      for (const secret of [CANARY, "PRIVATE_PEER", "PRIVATE_BACKEND"])
        assert.equal(JSON.stringify(failureBody).includes(secret), false);
    });
  }
}
