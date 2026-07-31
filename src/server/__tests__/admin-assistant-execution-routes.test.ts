import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, startTestServer } from "./helpers/http-test-server";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createAssistantExecutionModule } from "../modules/assistant-execution";
import type { RouteDeps } from "../routes/types";

/**
 * @file Route-level tests for the admin "Execution mode" tab's 3 probe routes (Local CLI detect,
 * BYOK connection test, BYOK model discovery).
 *
 * Real auth throughout, mirroring `admin-assistant-settings-routes.test.ts`. `detect-agents` calls
 * the real `@jini-ai/agent-runtime` `detectAgents()` — a local PATH probe with no network access, so
 * exercising it for real is safe and fast. `test-connection`/`list-models`'s SUCCESS paths make a
 * real outbound HTTP request, which this suite deliberately does not exercise (no live external
 * dependency in a scoped test run); what it certifies instead is the wiring these routes actually
 * own: auth gating, workspace-mismatch 404, request validation, and — for a base URL that resolves
 * to a blocked private address — the real, no-network SSRF-guard rejection path, proving the
 * request actually reaches `@jini-ai/agent-runtime`'s real functions rather than a stub.
 */

const WORKSPACE_ID = "workspace-local";
const DETECT_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/detect-agents`;
const TEST_CONNECTION_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/test-connection`;
const LIST_MODELS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution/models`;

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createAssistantExecutionModule(deps).registerRoutes?.(app);
  return { app, deps };
}

/** Mirrors `admin-assistant-settings-routes.test.ts`'s identical helper. */
let grantCounter = 0;
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-exec-${suffix}`;
  const policyId = `grant-policy-exec-${suffix}`;
  const username = `grant-exec-${suffix}`;

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

function post(baseUrl: string, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

test("all 3 routes require a session — an unauthenticated caller never reaches them", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await post(baseUrl, DETECT_PATH, "", {})).status, 401);
  assert.equal((await post(baseUrl, TEST_CONNECTION_PATH, "", {})).status, 401);
  assert.equal((await post(baseUrl, LIST_MODELS_PATH, "", {})).status, 401);
});

test("all 3 routes require admin.assistant.manage — a signed-in principal without it gets 403", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["content.write"]);

  for (const res of [
    await post(baseUrl, DETECT_PATH, cookie, {}),
    await post(baseUrl, TEST_CONNECTION_PATH, cookie, {}),
    await post(baseUrl, LIST_MODELS_PATH, cookie, {}),
  ]) {
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "admin.assistant.manage");
  }
});

test("a workspace id that is not this site's is 404, on all 3 routes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherBase = "/api/admin/v1/workspaces/some-other-workspace/assistant/execution";

  assert.equal((await post(baseUrl, `${otherBase}/detect-agents`, cookie, {})).status, 404);
  assert.equal((await post(baseUrl, `${otherBase}/test-connection`, cookie, {})).status, 404);
  assert.equal((await post(baseUrl, `${otherBase}/models`, cookie, {})).status, 404);
});

test("detect-agents returns a data array (real, no-network local-CLI probe)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, DETECT_PATH, cookie, {});
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { data: unknown[] };
  assert.ok(Array.isArray(body.data));
});

test("test-connection rejects an unsupported protocol with 400 before any network access", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, {
    protocol: "ollama",
    baseUrl: "https://example.com",
    apiKey: "k",
    model: "m",
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "VALIDATION_ERROR");
});

test("test-connection rejects a missing baseUrl/model with 400", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, { protocol: "anthropic", apiKey: "k" });
  assert.equal(res.status, 400);
});

test("test-connection surfaces the real SSRF guard as ok:false for an internal base url, proving real delegation", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, TEST_CONNECTION_PATH, cookie, {
    protocol: "anthropic",
    baseUrl: "http://10.0.0.5",
    apiKey: "k",
    model: "claude-sonnet-4-5",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; message: string };
  assert.equal(body.ok, false);
  assert.match(body.message, /forbidden|internal/i);
});

test("list-models rejects an unsupported protocol with 400 before any network access", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, { protocol: "bedrock", baseUrl: "https://example.com", apiKey: "k" });
  assert.equal(res.status, 400);
});

test("list-models surfaces the real SSRF guard as ok:false for an internal base url", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, LIST_MODELS_PATH, cookie, {
    protocol: "openai",
    baseUrl: "http://10.0.0.5",
    apiKey: "k",
  });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as { ok: boolean; models: string[] };
  assert.equal(body.ok, false);
  assert.deepEqual(body.models, []);
});
