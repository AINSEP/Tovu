import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Admin Access Tokens page's "Add custom provider" CRUD — `GET`/`POST`
 * `/api/admin/v1/workspaces/:workspaceId/system/custom/credentials`, `PUT`/`DELETE .../:id`.
 * Mirrors `source-control-credentials-route.test.ts`'s shape and header note: this is a THIN
 * adapter over `features/custom-credentials/store.ts`, so this file's job is proving the HTTP
 * boundary — auth gating on this feature's OWN `custom-credentials.write` permission, workspace-id
 * scoping, request-body shaping, and the store-error-to-status-code mapping.
 */

const CREDENTIALS_PATH = "system/custom/credentials";

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-custom-credentials";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-custom-credentials",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-custom-credentials", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("custom-credentials: an unauthorized principal (no grants) gets 403 on every verb", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const list = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, { headers: { cookie } });
  assert.equal(list.status, 403);

  const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", category: "general", baseUrl: "https://api.example.com", connection: { token: "t" } }),
  });
  assert.equal(create.status, 403);

  const update = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/some-id`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "y" }),
  });
  assert.equal(update.status, 403);

  const del = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/some-id`, { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 403);
});

test("custom-credentials: a mismatched workspaceId in the URL 404s on every verb", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const wrongWorkspacePath = `${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${CREDENTIALS_PATH}`;

  assert.equal((await fetch(wrongWorkspacePath, { headers: { cookie } })).status, 404);
  assert.equal(
    (await fetch(wrongWorkspacePath, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" })).status,
    404
  );
  assert.equal((await fetch(`${wrongWorkspacePath}/some-id`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: "{}" })).status, 404);
  assert.equal((await fetch(`${wrongWorkspacePath}/some-id`, { method: "DELETE", headers: { cookie } })).status, 404);
});

test("custom-credentials: GET starts with an empty list", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.credentials, []);
});

test("custom-credentials: full CRUD round trip — create, list, update (blank connection keeps the secret), delete", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "name.com", category: "general", baseUrl: "https://api.name.com", connection: { token: "sk_secret_token" } }),
  });
  assert.equal(created.status, 201);
  const { credential } = await created.json();
  assert.equal(credential.label, "name.com");
  assert.equal(credential.category, "general");
  assert.equal(credential.baseUrl, "https://api.name.com");
  assert.equal(credential.configured, true);
  assert.equal("isDefault" in credential, false); // custom rows have no default concept
  // The route's read model NEVER carries a token/username/ciphertext field — assert defensively
  // that the secret never leaked onto the wire even via an accidental spread.
  assert.equal(JSON.stringify(credential).includes("sk_secret_token"), false);
  assert.equal("token" in credential, false);
  assert.equal("sealed" in credential, false);

  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
  assert.equal(list.credentials[0].id, credential.id);

  // Update: label only, connection OMITTED — must not require a token and must not disturb the
  // stored secret.
  const updated = await fetch(`${base}/${credential.id}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "renamed" }),
  });
  assert.equal(updated.status, 200);
  const { credential: renamed } = await updated.json();
  assert.equal(renamed.label, "renamed");
  assert.equal(renamed.id, credential.id);
  assert.equal(renamed.baseUrl, "https://api.name.com"); // untouched by the label-only PUT

  const del = await fetch(`${base}/${credential.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 204);

  const listAfterDelete = await (await fetch(base, { headers: { cookie } })).json();
  assert.deepEqual(listAfterDelete.credentials, []);
});

test("custom-credentials: DELETE on a never-existed id is idempotent (204, not 404)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/no-such-id`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 204);
});

test("custom-credentials: PUT on a non-existent id 404s with NOT_FOUND", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/no-such-id`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "y" }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "NOT_FOUND");
});

test("custom-credentials: POST validation — blank label, unknown category, and a non-http(s) base URL all 400 with VALIDATION", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const blankLabel = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "   ", category: "general", baseUrl: "https://api.example.com", connection: { token: "t" } }),
  });
  assert.equal(blankLabel.status, 400);
  assert.equal((await blankLabel.json()).error, "VALIDATION");

  const unknownCategory = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", category: "not-a-real-category", baseUrl: "https://api.example.com", connection: { token: "t" } }),
  });
  assert.equal(unknownCategory.status, 400);

  const badBaseUrl = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", category: "general", baseUrl: "javascript:alert(1)", connection: { token: "t" } }),
  });
  assert.equal(badBaseUrl.status, 400);

  const withUsername = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", category: "general", baseUrl: "https://api.example.com", connection: { token: "t", username: "leona" } }),
  });
  assert.equal(withUsername.status, 201);
});

test("custom-credentials: a duplicate label 409s with DUPLICATE_LABEL and never creates a second row — workspace-wide, no provider dimension", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const first = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "name.com", category: "general", baseUrl: "https://api.name.com", connection: { token: "token-a" } }),
  });
  assert.equal(first.status, 201);

  const second = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    // Different category/baseUrl — still the same (workspaceId, label), which is this table's
    // WHOLE uniqueness key (no provider dimension the way publish/source-control credentials have).
    body: JSON.stringify({ label: "name.com", category: "hosting", baseUrl: "https://api.name.com/v2", connection: { token: "token-b" } }),
  });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "DUPLICATE_LABEL");

  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
});
