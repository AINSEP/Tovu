import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Admin Deployment panel → Static Site tab's credential CRUD — `GET`/`POST`
 * `/api/admin/v1/workspaces/:workspaceId/system/publish/credentials`, `PUT`/`DELETE .../:id`. Same
 * bare-principal-vs-owner + workspace-id-404 shape as `publish-site-route.test.ts`, whose header this
 * file's own module-level setup mirrors.
 *
 * This is a THIN adapter over `publish-credentials/store.ts` (already covered at the unit level by
 * `store.unit.test.ts`'s 33 cases) — this file's job is proving the HTTP boundary: auth gating,
 * workspace-id scoping, request-body shaping, and the store-error-to-status-code mapping
 * (`sendStoreError` in `publish-credentials.ts`). It deliberately does not re-prove
 * validation/uniqueness/default-slot logic the store's own suite already owns.
 */

const CREDENTIALS_PATH = "system/publish/credentials";

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-publish-credentials";
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
    username: "bare-publish-credentials",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-publish-credentials", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("publish-credentials: an unauthorized principal (no grants) gets 403 on every verb", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const list = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, { headers: { cookie } });
  assert.equal(list.status, 403);

  const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", connection: { providerId: "vercel", token: "t" } }),
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

test("publish-credentials: a mismatched workspaceId in the URL 404s on every verb", async (t) => {
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

test("publish-credentials: GET starts with an empty list and the deps' own executionMode", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.credentials, []);
  assert.equal(body.executionMode, deps.publishExecutionMode);
});

test("publish-credentials: full CRUD round trip — create, list, update (blank connection keeps the secret), delete", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Main Vercel", connection: { providerId: "vercel", token: "vercel-secret-token" } }),
  });
  assert.equal(created.status, 201);
  const { credential } = await created.json();
  assert.equal(credential.providerId, "vercel");
  assert.equal(credential.label, "Main Vercel");
  assert.equal(credential.configured, true);
  assert.equal(credential.isDefault, true); // first credential for its provider auto-defaults
  // The route's read model NEVER carries a token/ciphertext field — assert defensively that the
  // secret never leaked onto the wire even via an accidental spread.
  assert.equal(JSON.stringify(credential).includes("vercel-secret-token"), false);
  assert.equal("token" in credential, false);
  assert.equal("sealed" in credential, false);

  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
  assert.equal(list.credentials[0].id, credential.id);

  // Update: label only, connection OMITTED — must not require a token and must not disturb the
  // stored secret (store.unit.test.ts already proves the secret itself is untouched; this proves
  // the ROUTE forwards "omitted" as omitted, not as an empty-string connection).
  const updated = await fetch(`${base}/${credential.id}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Renamed Vercel" }),
  });
  assert.equal(updated.status, 200);
  const { credential: renamed } = await updated.json();
  assert.equal(renamed.label, "Renamed Vercel");
  assert.equal(renamed.id, credential.id);

  const del = await fetch(`${base}/${credential.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 204);

  const listAfterDelete = await (await fetch(base, { headers: { cookie } })).json();
  assert.deepEqual(listAfterDelete.credentials, []);
});

test("publish-credentials: DELETE on a never-existed id is idempotent (204, not 404)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/no-such-id`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 204);
});

test("publish-credentials: PUT on a non-existent id 404s with NOT_FOUND", async (t) => {
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

test("publish-credentials: POST with an invalid connection shape 400s with VALIDATION, and github-pages needs only a token (no owner/repo)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const blankLabel = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "   ", connection: { providerId: "vercel", token: "t" } }),
  });
  assert.equal(blankLabel.status, 400);
  assert.equal((await blankLabel.json()).error, "VALIDATION");

  const cloudflareMissingAccountId = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "cf", connection: { providerId: "cloudflare-pages", token: "t" } }),
  });
  assert.equal(cloudflareMissingAccountId.status, 400);

  // github-pages is a bare token — owner/repo live on the publish TARGET config, not the credential
  // (see `publish-credentials/types.ts`'s `GitHubPagesConnectionInput` doc). Must succeed with no
  // owner/repo field at all.
  const githubPagesBareToken = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "gh-token" } }),
  });
  assert.equal(githubPagesBareToken.status, 201);
});

test("publish-credentials: a duplicate (provider, label) 409s with DUPLICATE_LABEL and never creates a second row", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const first = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Prod", connection: { providerId: "netlify", token: "token-a" } }),
  });
  assert.equal(first.status, 201);

  const second = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Prod", connection: { providerId: "netlify", token: "token-b" } }),
  });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "DUPLICATE_LABEL");

  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
});
