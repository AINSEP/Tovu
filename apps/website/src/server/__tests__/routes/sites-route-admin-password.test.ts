import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "../../inbound/admin-http/routes/system/sites.js";
import { createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { assertSiteOwnerLogin } from "#src/platform/site-dir/__tests__/helpers/assert-site-owner-login";

const ROUTE = "/api/admin/v1/workspaces/:workspaceId/system/sites";

function routeDeps(base: string, overrides: Partial<AdminSitesDeps> = {}): AdminSitesDeps {
  return {
    workspaceId: "workspace-local",
    authorize: async () => ({ allowed: true, reason: "test" }),
    siteBinding: { dir: path.join(base, "sites", "serving"), name: "serving", dirOverridden: false, switcherCompatible: true },
    isSiteSwitcherEnabled: () => true,
    ...overrides,
  };
}

async function create(deps: AdminSitesDeps, body: unknown) {
  const app = express();
  registerAdminSitesRoutes(app, deps);
  const handler = extractRouteHandler(app, "post", ROUTE);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "authorized-owner" };
  await handler({ params: { workspaceId: deps.workspaceId }, body }, res);
  return capture;
}

test("REGRESSION: admin create route under an inherited deployment password creates a site that logs in with tovu-dev", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-route-owner-"));
  fs.mkdirSync(path.join(base, "sites"));
  const previous = process.env.TOVU_ADMIN_PASSWORD;
  const inherited = "route-inherited-deployment-password-fixture";
  process.env.TOVU_ADMIN_PASSWORD = inherited;
  try {
    for (const custom of [false, true]) {
      const name = custom ? "custom" : "default";
      const adminPassword = " chosen route 🔑 ";
      const capture = await create(routeDeps(base), custom ? { name, adminPassword } : { name });
      assert.equal(capture.statusCode, 201);
      assert.deepEqual(capture.jsonBody, {
        site: { name, dir: path.join(base, "sites", name), siteId: (capture.jsonBody as { site: { siteId: string } }).site.siteId },
        agentPluginTokens: { status: "none", pluginIds: [] },
      });
      const response = JSON.stringify(capture.jsonBody);
      assert.ok(!response.includes(inherited) && !response.includes(adminPassword));
      await assertSiteOwnerLogin({ dir: path.join(base, "sites", name), password: custom ? adminPassword : "tovu-dev", rejectedPassword: inherited });
    }
  } finally {
    if (previous === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous;
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("admin create route rejects malformed/password-policy input before creating and never echoes it", async () => {
  let creates = 0;
  const deps = routeDeps("/repo", { createSite: async ({ name }) => { creates += 1; return { name, dir: `/repo/sites/${name}`, siteId: "fake" }; } });
  for (const [adminPassword, error] of [
    [null, "Admin password must be a string."],
    [123, "Admin password must be a string."],
    ["", "Password is required."],
    ["private".repeat(100), "Password must be no more than 512 characters."],
  ] as const) {
    const capture = await create(deps, { name: "new-site", adminPassword });
    assert.equal(capture.statusCode, 400);
    assert.deepEqual(capture.jsonBody, { error, code: "VALIDATION_ERROR" });
  }
  assert.equal(creates, 0);
});
