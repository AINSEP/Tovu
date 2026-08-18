import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, startTestServer } from "./helpers/http-test-server";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createAssistantSettingsModule } from "../modules/assistant-settings";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm";
import type { KeyringPort } from "../../webhooks/ports";
import type { RouteDeps } from "../routes/types";

/**
 * @file Route-level tests for the ADMIN's own BYOK execution-credential routes (GET/PUT/DELETE
 * `.../assistant/execution-credential`) — design: `ADS-memory/reports/analysis/2026-08-05-admin-
 * byok-keystore-design.md`, owner-approved. Mirrors `admin-assistant-site-credential-routes.test.ts`'s
 * shape for the sibling ADR-058 trio.
 *
 * What matters most beyond that sibling suite: this credential is scoped to `(workspaceId,
 * principalId)`, not `workspaceId` alone, so the property the owner explicitly required — "admin A
 * cannot read or overwrite admin B's credential in the same workspace" — gets its own real,
 * two-session test rather than being assumed from the schema.
 */

const WORKSPACE_ID = "workspace-local";
const CREDENTIAL_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/assistant/execution-credential`;

/** Always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

function buildTestApp(overrides: Partial<RouteDeps> = {}): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps(), ...overrides };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createAssistantSettingsModule(deps).registerRoutes?.(app);
  return { app, deps };
}

function get(baseUrl: string, path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { cookie } });
}
function put(baseUrl: string, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}
function del(baseUrl: string, path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: "DELETE", headers: { cookie } });
}

/** Logs in as a SECOND, freshly-created admin — no permission grants needed (these routes are
 *  self-scoped by session identity, not gated by `authorize()`). Mirrors
 *  `assistant-byok-routes.test.ts`'s `loginWithPermissions` shape, minus the policy/permission
 *  plumbing this suite has no use for. */
let adminCounter = 0;
async function loginAsSecondAdmin(deps: RouteDeps, baseUrl: string): Promise<{ cookie: string; principalId: string }> {
  await deps.identityReady;
  const suffix = `${++adminCounter}`;
  const principalId = `second-admin-${suffix}`;
  const username = `second-admin-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Second admin ${suffix}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("second-admin-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "second-admin-pw" }),
  });
  assert.equal(login.status, 200);
  return { cookie: login.headers.get("set-cookie")?.split(";")[0] ?? "", principalId };
}

test("all 3 routes require a session — an unauthenticated caller never reaches them", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await get(baseUrl, CREDENTIAL_PATH, "")).status, 401);
  assert.equal((await put(baseUrl, CREDENTIAL_PATH, "", {})).status, 401);
  assert.equal((await del(baseUrl, CREDENTIAL_PATH, "")).status, 401);
});

test("a workspace id that is not this site's is 404, on all 3 routes", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const otherPath = "/api/admin/v1/workspaces/some-other-workspace/assistant/execution-credential";

  assert.equal((await get(baseUrl, otherPath, cookie)).status, 404);
  assert.equal((await put(baseUrl, otherPath, cookie, {})).status, 404);
  assert.equal((await del(baseUrl, otherPath, cookie)).status, 404);
});

test("GET for an admin who has never configured a key returns isSet:false with no key material", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await get(baseUrl, CREDENTIAL_PATH, cookie);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(body.data.isSet, false);
  assert.equal(body.data.masked, null);
});

test("PUT with an apiKey sets it and the response never contains the plaintext key", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "sk-ant-LIVE-EXAMPLE-KEY-7777", protocol: "anthropic" });
  assert.equal(res.status, 200, await res.clone().text());
  const bodyText = await res.clone().text();
  assert.ok(!bodyText.includes("sk-ant-LIVE-EXAMPLE-KEY-7777"));

  const body = (await res.json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(body.data.isSet, true);
  assert.equal(body.data.masked, "••••7777");
});

test("PUT with an empty apiKey is a 400 validation error, and GET afterward still shows not-set", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "" });
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "EXECUTION_CREDENTIAL_VALIDATION_ERROR");

  const after = (await (await get(baseUrl, CREDENTIAL_PATH, cookie)).json()) as { data: { isSet: boolean } };
  assert.equal(after.data.isSet, false);
});

test("PUT with a non-string providerId (present but wrong type) is a 400, not a silent no-op", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { providerId: 12345 });
  assert.equal(res.status, 400);
});

test("PUT omitting apiKey updates model without disturbing the previously-saved key", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "stable-key-0000" });
  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { model: "claude-opus-4-8" });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { isSet: boolean; masked: string; model: string } };
  assert.equal(body.data.isSet, true);
  assert.equal(body.data.masked, "••••0000");
  assert.equal(body.data.model, "claude-opus-4-8");
});

test("DELETE clears the key; a second DELETE on an already-cleared credential is a harmless 200", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "to-delete-1234" });
  const first = await del(baseUrl, CREDENTIAL_PATH, cookie);
  assert.equal(first.status, 200);
  assert.equal((await first.json() as { data: { isSet: boolean } }).data.isSet, false);

  const second = await del(baseUrl, CREDENTIAL_PATH, cookie);
  assert.equal(second.status, 200);
});

test("PUT with an apiKey fails closed with 503 SECRET_STORE_UNCONFIGURED when the master secret is unavailable", async (t) => {
  const brokenKeyring = new BrokenKeyring();
  const { app } = buildTestApp({
    siteAssistantSecretKeyring: brokenKeyring,
    siteAssistantSecretSealer: new AesGcmSecretSealer(brokenKeyring),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await put(baseUrl, CREDENTIAL_PATH, cookie, { apiKey: "would-be-a-real-key" });
  assert.equal(res.status, 503);
  assert.equal((await res.json() as { code: string }).code, "SECRET_STORE_UNCONFIGURED");

  const after = (await (await get(baseUrl, CREDENTIAL_PATH, cookie)).json()) as { data: { isSet: boolean } };
  assert.equal(after.data.isSet, false);
});

// ---------------------------------------------------------------------------
// Row-level isolation — the property the owner explicitly required
// ---------------------------------------------------------------------------

test("admin A cannot read admin B's credential — GET is scoped to the caller's own session, not the workspace", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: cookieA } = await bootAuthenticated(app, t);
  const { cookie: cookieB } = await loginAsSecondAdmin(deps, baseUrl);

  await put(baseUrl, CREDENTIAL_PATH, cookieA, { apiKey: "admin-a-only-key-1111", model: "claude-opus-4-8" });

  // Admin B's GET must show not-set — A's key must not be visible under B's session.
  const bViewsOwn = (await (await get(baseUrl, CREDENTIAL_PATH, cookieB)).json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(bViewsOwn.data.isSet, false);
  assert.equal(bViewsOwn.data.masked, null);

  // And A's own GET still shows A's key, unaffected by B's session ever existing.
  const aViewsOwn = (await (await get(baseUrl, CREDENTIAL_PATH, cookieA)).json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(aViewsOwn.data.isSet, true);
  assert.equal(aViewsOwn.data.masked, "••••1111");
});

test("admin B's PUT cannot overwrite admin A's credential — each session writes only its own row", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: cookieA } = await bootAuthenticated(app, t);
  const { cookie: cookieB } = await loginAsSecondAdmin(deps, baseUrl);

  await put(baseUrl, CREDENTIAL_PATH, cookieA, { apiKey: "admin-a-key-1111" });
  await put(baseUrl, CREDENTIAL_PATH, cookieB, { apiKey: "admin-b-key-2222" });

  const aView = (await (await get(baseUrl, CREDENTIAL_PATH, cookieA)).json()) as { data: { masked: string | null } };
  const bView = (await (await get(baseUrl, CREDENTIAL_PATH, cookieB)).json()) as { data: { masked: string | null } };
  assert.equal(aView.data.masked, "••••1111");
  assert.equal(bView.data.masked, "••••2222");
});

test("admin B's DELETE cannot clear admin A's credential", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: cookieA } = await bootAuthenticated(app, t);
  const { cookie: cookieB } = await loginAsSecondAdmin(deps, baseUrl);

  await put(baseUrl, CREDENTIAL_PATH, cookieA, { apiKey: "admin-a-key-1111" });
  await del(baseUrl, CREDENTIAL_PATH, cookieB); // B has no key — a no-op on B's own (unset) row

  const aView = (await (await get(baseUrl, CREDENTIAL_PATH, cookieA)).json()) as { data: { isSet: boolean; masked: string | null } };
  assert.equal(aView.data.isSet, true, "admin B deleting their own (never-set) key must not touch admin A's row");
  assert.equal(aView.data.masked, "••••1111");
});
