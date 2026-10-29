import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_WRITE_REASON } from "#src/contracts/headless/index";
import { ASSISTANT_PERMANENT_DELETES_WRITE_REASON } from "#src/contracts/headless/index";
import { registerAdminSettingsClearRoute } from "../clear.js";
import { registerAdminSettingsGetEffectiveRoute } from "../get-effective.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../register-definitions.js";

/**
 * @file Request-shape guards of the settings JSON routes (`mountSettingsJsonRoute` in `shared.ts`
 * and the handlers it mounts) that the route suites under `server/__tests__/routes/` never send:
 * an effective read without its required `namespace`, a definitions batch whose `definitions` is
 * not an array (or whose body is absent), a definition batch that tries to rewrite the code-owned
 * `site.assistant` namespace, and a platform-owned (non-site) definition registration. The last
 * two tests drive the real handler directly for the one case Express routing can never produce
 * (a request with no `:workspaceId` param / no body at all), the same narrow technique
 * `redirects-auth.test.ts` documents for its import route.
 */

const DEFINITIONS_PATH = "/api/admin/v1/workspaces/:workspaceId/settings/definitions";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminSettingsGetEffectiveRoute(app, deps);
  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
  return { app, deps };
}

async function definitionsIn(deps: RouteDeps, workspaceId: string | null, namespace: string) {
  return (await deps.settingsRepo.listActiveDefinitions({ workspaceId })).filter((d) => d.namespace === namespace);
}

async function ownerPrincipalId(deps: RouteDeps): Promise<string> {
  await deps.identityReady;
  const owner = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(owner);
  return owner.principalId;
}

test("GET settings/effective without a namespace query param is a 400 VALIDATION_ERROR", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/effective`, { headers: { cookie } });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "'namespace' query param is required", code: "VALIDATION_ERROR" });
});

test("POST settings/definitions with a non-array 'definitions' is a 400 VALIDATION_ERROR", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ definitions: { key: "not-a-list" } }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "'definitions' must be an array", code: "VALIDATION_ERROR" });
});

test("POST settings/definitions refuses to rewrite the code-owned site.assistant namespace before any item writes", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.settingsReady;
  const before = await definitionsIn(deps, deps.workspaceId, "site.testing");
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ definitions: [
      { ownerKind: "site", namespace: "site.testing", key: "harmless", schemaJson: { type: "string" }, defaultJson: "x", scopes: 2 },
      { ownerKind: "site", namespace: "site.assistant", key: "enabled", schemaJson: { type: "boolean" }, defaultJson: true, scopes: 2 },
    ] }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "Visitor assistant definitions are code-owned. Save a usable provider key and a model, then enable the assistant in AI Assistant.",
    code: "ASSISTANT_SETTINGS_VALIDATION_ERROR",
  });
  // The fence runs before ANY item in the batch is applied, so the harmless sibling did not land either.
  assert.deepEqual(await definitionsIn(deps, deps.workspaceId, "site.testing"), before);
});

test("POST settings/definitions registers a platform-owned (theme) definition in the platform partition, not this workspace's", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ definitions: [
      { ownerKind: "theme", namespace: "theme.coverage", key: "accent", schemaJson: { type: "string" }, defaultJson: "teal", scopes: 2 },
    ] }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const platform = await definitionsIn(deps, null, "theme.coverage");
  assert.deepEqual(platform.map((d) => [d.key, d.workspaceId, d.ownerKind, d.defaultValue]), [["accent", null, "theme", "teal"]]);
  assert.deepEqual(await definitionsIn(deps, deps.workspaceId, "theme.coverage"), []);
});

test("settings JSON route: a request without a :workspaceId param is a 404, forced via a direct handler call", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "post", DEFINITIONS_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, query: {}, body: { definitions: [] } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
});

test("POST settings/definitions with no body at all is a 400, forced via a direct handler call (express.json() always sets one)", async () => {
  const { app, deps } = buildTestApp();
  const handler = extractRouteHandler(app, "post", DEFINITIONS_PATH);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: await ownerPrincipalId(deps) };
  await handler({ params: { workspaceId: deps.workspaceId }, query: {}, body: undefined }, res);
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: "'definitions' must be an array", code: "VALIDATION_ERROR" } });
});

test("DELETE settings/value refuses a generic clear of the owner-only Full CLI namespace (403) before reaching the write", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: "enabled", scope: "workspace" }),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: `${ASSISTANT_SUBAGENTS_WRITE_REASON} ${ASSISTANT_PERMANENT_DELETES_WRITE_REASON}`,
    code: "FORBIDDEN",
  });
});
