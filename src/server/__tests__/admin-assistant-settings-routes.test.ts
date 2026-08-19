import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../app.js";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth.js";
import { createAssistantSettingsModule } from "../modules/assistant-settings.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level tests for the admin AI Assistant settings surface — the GET/PUT pair backing the
 * public assistant's master switch.
 *
 * Real auth throughout (`createRouteDeps()`'s real `authorize()` + identity repos, a real login
 * before any request), mirroring `admin-widgets-routes.test.ts`/`admin-menus-routes.test.ts`. The
 * domain rules (default off, fail-closed read, workspace scoping) are certified without HTTP in
 * `assistant/__tests__/public-assistant-settings.test.ts`; what these tests own is the wiring:
 * status codes, the `{ data }` envelope, the permission gate, and the workspace-mismatch 404.
 */

const WORKSPACE_ID = "workspace-local";
const SETTINGS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/settings`;

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createAssistantSettingsModule(deps).registerRoutes?.(app);
  return { app, deps };
}

/** Registers a principal holding ONLY `permissions`, then logs in as them — the same technique
 * `admin-widgets-routes.test.ts`'s `loginWithPermissions` uses, narrowed to what this suite needs. */
let grantCounter = 0;
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-assistant-${suffix}`;
  const policyId = `grant-policy-assistant-${suffix}`;
  const username = `grant-assistant-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ") || "(none)"}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function get(baseUrl: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${SETTINGS_PATH}`, { headers: { cookie } });
}

function put(baseUrl: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${SETTINGS_PATH}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

test("GET returns the public assistant switch, OFF on a freshly booted site", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await get(baseUrl, cookie);
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { data: { publicEnabled: false } });
});

test("PUT turns the switch on, and a follow-up GET reads it back — the write is durable, not echoed", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const write = await put(baseUrl, cookie, { publicEnabled: true });
  assert.equal(write.status, 200, await write.clone().text());
  assert.deepEqual(await write.json(), { data: { publicEnabled: true } });

  const read = await get(baseUrl, cookie);
  assert.deepEqual(await read.json(), { data: { publicEnabled: true } });
});

test("PUT turns the switch back off — the incident path an operator actually needs", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, cookie, { publicEnabled: true });
  const off = await put(baseUrl, cookie, { publicEnabled: false });
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), { data: { publicEnabled: false } });
  assert.deepEqual(await (await get(baseUrl, cookie)).json(), { data: { publicEnabled: false } });
});

test("PUT with an empty body leaves the setting alone rather than resetting it", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, cookie, { publicEnabled: true });
  const noop = await put(baseUrl, cookie, {});
  assert.equal(noop.status, 200);
  assert.deepEqual(await noop.json(), { data: { publicEnabled: true } });
});

test("PUT rejects a non-boolean publicEnabled with 400 and a typed code", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, cookie, { publicEnabled: "yes" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "ASSISTANT_SETTINGS_VALIDATION_ERROR");
  assert.match(body.error, /publicEnabled must be a boolean/);

  assert.deepEqual(await (await get(baseUrl, cookie)).json(), { data: { publicEnabled: false } }, "a rejected write must change nothing");
});

test("both routes require a session — an unauthenticated caller never reaches them", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await get(baseUrl, "")).status, 401);
  assert.equal((await put(baseUrl, "", { publicEnabled: true })).status, 401);
});

test("both routes require admin.assistant.manage — a signed-in principal without it gets 403", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  // `content.write` is a real, unrelated grant: this proves the gate checks the specific permission
  // rather than merely "is authenticated with something".
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.write"]);

  for (const res of [await get(baseUrl, cookie), await put(baseUrl, cookie, { publicEnabled: true })]) {
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "admin.assistant.manage");
  }
});

test("a principal holding only admin.assistant.manage can both read and flip the switch", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["admin.assistant.manage"]);

  assert.equal((await get(baseUrl, cookie)).status, 200);

  // The write chokepoint's own scope-derived check would demand `settings.workspace.write` here if
  // the route's `requiredPermissionOverride` were missing — this is the regression guard for the
  // masked-500 defect SEO's identical settings route already hit once.
  const write = await put(baseUrl, cookie, { publicEnabled: true });
  assert.equal(write.status, 200, await write.clone().text());
  assert.deepEqual(await write.json(), { data: { publicEnabled: true } });
});

test("a workspace id that is not this site's is 404, on both verbs", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherPath = "/api/admin/v1/workspaces/some-other-workspace/assistant/settings";

  assert.equal((await fetch(`${baseUrl}${otherPath}`, { headers: { cookie } })).status, 404);
  assert.equal(
    (
      await fetch(`${baseUrl}${otherPath}`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ publicEnabled: true }),
      })
    ).status,
    404,
  );
});
