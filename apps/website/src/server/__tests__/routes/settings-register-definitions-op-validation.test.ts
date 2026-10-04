import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminSettingsSetRoute } from "../../inbound/admin-http/routes/settings/set.js";
import { registerAdminSettingsGetEffectiveRoute } from "../../inbound/admin-http/routes/settings/get-effective.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../inbound/admin-http/routes/settings/register-definitions.js";
import type { RouteDeps } from "../../routes/types.js";

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
async function buildTestApp(): Promise<{ app: express.Express; deps: RouteDeps }> {
  const deps = await createSiteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsGetEffectiveRoute(app, deps);
  return { app, deps };
}

for (const op of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
  test(`SETTINGS_REGISTER_DEFINITIONS: op='${op}' (an Object.prototype member) is rejected as an unknown op, not dispatched`, async (t) => {
    const { app, deps } = await buildTestApp();
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


for (const op of ["rename", "retype", "deprecate", "tombstone"] as const) {
  test(`SETTINGS_REGISTER_DEFINITIONS: ${op} persists its definition transition and retains the stored value`, async (t) => {
    const { app, deps } = await buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings`;
    const namespace = "site.lifecycle";
    const headers = { "content-type": "application/json", cookie };
    const post = (item: object) => fetch(`${base}/definitions`, { method: "POST", headers, body: JSON.stringify({ definitions: [item] }) });
    const registered = await post({ ownerKind: "site", namespace, key: op, schemaJson: { type: "string" }, defaultJson: "initial default", scopes: 2 });
    assert.equal(registered.status, 200, await registered.text());
    const original = await deps.settingsRepo.findActiveDefinition({ namespace, key: op, workspaceId: deps.workspaceId });
    assert.ok(original);
    const seeded = await fetch(`${base}/value`, { method: "PUT", headers, body: JSON.stringify({ namespace, key: op, scope: "workspace", valueJson: "saved override" }) });
    assert.equal(seeded.status, 200, await seeded.text());
    const applied = await post({ op, ownerKind: "site", namespace, key: op,
      ...(op === "rename" ? { newNamespace: namespace, newKey: "renamed" } : {}),
      ...(op === "retype" ? { schemaJson: { type: "string", nullable: true }, defaultJson: "new default", coercionJson: { tag: "identity" } } : {}),
    });
    assert.equal(applied.status, 200, await applied.clone().text());
    assert.deepEqual((await applied.json()).applied, [{ key: `${namespace}.${op}`, op, status: "applied" }]);
    const stored = await deps.settingsRepo.findDefinitionBySettingId({ settingId: original.settingId });
    assert.ok(stored);
    assert.equal(stored.status, op === "deprecate" ? "deprecated" : op === "tombstone" ? "tombstone" : "active");
    assert.equal(stored.key, op === "rename" ? "renamed" : op);
    assert.equal(stored.version, op === "retype" ? 2 : 1);
    if (op === "rename") {
      const alias = await deps.settingsRepo.findActiveDefinition({ namespace, key: op, workspaceId: deps.workspaceId });
      assert.equal(alias?.status, "alias");
      assert.equal(alias?.aliasOfNamespace, namespace);
      assert.equal(alias?.aliasOfKey, "renamed");
    }
    if (op === "retype") {
      assert.deepEqual(stored.schema, { type: "string", nullable: true });
      assert.equal(stored.defaultValue, "new default");
      assert.equal(stored.coercionTag, "identity");
    }
    assert.equal((await deps.settingsRepo.getWorkspaceValue({ workspaceId: deps.workspaceId, settingId: original.settingId }))?.valueJson, "saved override");
    if (op === "rename" || op === "retype") {
      const effective = await fetch(`${base}/effective?namespace=${namespace}`, { headers: { cookie } });
      assert.equal(effective.status, 200);
      assert.equal((await effective.json()).data.find((row: { key: string }) => row.key === stored.key)?.value, "saved override");
    }
  });
}
