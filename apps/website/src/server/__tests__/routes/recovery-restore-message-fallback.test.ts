import assert from "node:assert/strict";
import test, { mock } from "node:test";
import express from "express";

import type { RouteDeps } from "../../routes/types.js";
import { dispatchJsonRequest } from "../helpers/in-process-http.js";

// Wire replacement for the deleted `sendRecoveryError` unit test (the ceremony error mapping moved into
// the Jini restore spec): `RecoveryErrorPayload.message` is optional by contract, but every producer
// reachable through the real bindings sets one, so the orchestrator is stubbed to hand the mounted
// route a contract-valid, message-less payload — its code becomes the error text.
mock.module("@jini-ai/db/recovery/recovery-orchestrator", {
  namedExports: {
    planRestore: async () => ({ ok: false, error: { code: "PLAN_STALE" } }),
    confirmRestore: async () => ({ ok: false, error: { code: "PLAN_STALE" } }),
    executeRestore: async () => ({ ok: false, error: { code: "PLAN_STALE" } }),
  },
});
const { registerAdminRecoveryRestoreRoutes } = await import("../../runtime/composition/modules/recovery-restore.js");

test("recovery restore: a contract-valid error payload with no message falls back to its code as the error text", async () => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminRecoveryRestoreRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }) } as unknown as RouteDeps });
  const response = await dispatchJsonRequest(app, "POST", "/api/admin/v1/recovery/restore/plan", { restorePointId: "rp-1" });
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: "PLAN_STALE", code: "PLAN_STALE" });
});
