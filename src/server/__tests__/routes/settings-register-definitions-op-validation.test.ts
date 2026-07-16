import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server";

import express from "express";

import { createSqliteRouteDeps } from "../../deps";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../routes/admin/settings/register-definitions";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Regression coverage for the `/audit-work` ADR-042 finding "A-01" (unanimous
 * across Codex/Fable/agy, 2026-07-15): `NON_REGISTER_DEFINITION_OPS` was a plain
 * object literal, so `op` values that collide with `Object.prototype` members
 * (`constructor`, `toString`, ...) resolved to a truthy, callable value via prototype
 * lookup instead of falling through to the `unknown op` 400 branch. Fixed by making
 * the dispatch table `Object.create(null)`-based; this test pins the pre-fix
 * regression (`constructor` silently "applied" with 200; `toString` also "applied")
 * against the real SQLite-backed route.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createSqliteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  return { app, deps };
}

for (const op of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
  test(`SETTINGS_REGISTER_DEFINITIONS: op='${op}' (an Object.prototype member) is rejected as an unknown op, not dispatched`, async (t) => {
    const { app, deps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);

    const res = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          definitions: [{ op, ownerKind: "site", namespace: "site.testing", key: "demoKey" }],
        }),
      }
    );

    assert.equal(res.status, 400, `op='${op}' must be rejected 400, not silently dispatched`);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "VALIDATION_ERROR");
  });
}
