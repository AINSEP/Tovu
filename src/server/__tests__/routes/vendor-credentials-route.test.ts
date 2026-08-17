import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app";
import type { RouteDeps } from "../../routes/types";
import { bootAuthenticated } from "../helpers/http-test-server";

/**
 * @file Admin credential CRUD over the unified `vendor_credential_sets` table — `GET`/`POST`
 * `/api/admin/v1/workspaces/:workspaceId/system/vendor-credentials`, `PUT`/`DELETE .../:id`. Same
 * bare-principal-vs-owner + workspace-id-404 shape `publish-credentials-route.test.ts`/
 * `source-control-credentials-route.test.ts` each already establish for their own sibling routes —
 * this file's own module-level setup mirrors `publish-credentials-route.test.ts`'s.
 *
 * This is a THIN adapter over `vendor-credentials/store.ts` (already covered at the unit level by
 * `store.unit.test.ts`'s 27 cases and `dual-read.unit.test.ts`'s 7) — this file's job is proving the
 * HTTP boundary: auth gating, workspace-id scoping, request-body shaping, and the
 * store-error-to-status-code mapping (`sendStoreError` in `vendor-credentials.ts`). It deliberately
 * does not re-prove validation/uniqueness/default-slot logic the store's own suite already owns, and
 * has no verify-endpoint coverage — `vendor-credentials.ts` ships no `POST .../:id/verify` (see that
 * route file's own header for why).
 */

const CREDENTIALS_PATH = "system/vendor-credentials";

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-vendor-credentials";
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
    username: "bare-vendor-credentials",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-vendor-credentials", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("vendor-credentials: an unauthorized principal (no grants) gets 403 on every verb", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const list = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, { headers: { cookie } });
  assert.equal(list.status, 403);

  const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", connection: { vendorId: "vercel", token: "t" } }),
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

test("vendor-credentials: a mismatched workspaceId in the URL 404s on every verb", async (t) => {
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

test("vendor-credentials: GET starts with an empty list", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.credentials, []);
});

test("vendor-credentials: full CRUD round trip — create, list, update (label-only rename), delete", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Main Vercel", connection: { vendorId: "vercel", token: "vercel-secret-token" } }),
  });
  assert.equal(created.status, 201);
  const { credential } = await created.json();
  assert.equal(credential.vendorId, "vercel");
  assert.equal(credential.label, "Main Vercel");
  assert.equal(credential.configured, true);
  assert.equal(credential.isDefault, true); // first credential for its vendor auto-defaults
  // `tokenTail` is the ONE deliberate exception to "never a secret field" (owner's own design
  // decision — see `types.ts`'s `VendorCredentialSetRecord.tokenTail` doc) — assert it is present
  // AND that it is only the last 4 characters, never the full token.
  assert.equal(credential.tokenTail, "oken");
  assert.equal(JSON.stringify(credential).includes("vercel-secret-token"), false);
  assert.equal("token" in credential, false);
  assert.equal("sealed" in credential, false);

  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
  assert.equal(list.credentials[0].id, credential.id);

  // Update: label only, connection OMITTED — must not require a connection and must not disturb the
  // stored secret (store.unit.test.ts already proves the secret itself is untouched; this proves the
  // ROUTE forwards "omitted" as omitted, not as an empty-object connection).
  const updated = await fetch(`${base}/${credential.id}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Renamed Vercel" }),
  });
  assert.equal(updated.status, 200);
  const { credential: renamed } = await updated.json();
  assert.equal(renamed.label, "Renamed Vercel");
  assert.equal(renamed.id, credential.id);
  assert.equal(renamed.tokenTail, "oken"); // unchanged — no new connection was supplied

  const del = await fetch(`${base}/${credential.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 204);

  const listAfterDelete = await (await fetch(base, { headers: { cookie } })).json();
  assert.deepEqual(listAfterDelete.credentials, []);
});

test("vendor-credentials: DELETE on a never-existed id is idempotent (204, not 404)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/no-such-id`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 204);
});

test("vendor-credentials: PUT on a non-existent id 404s with NOT_FOUND", async (t) => {
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

test("vendor-credentials: POST with an invalid connection shape 400s with VALIDATION", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const blankLabel = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "   ", connection: { vendorId: "vercel", token: "t" } }),
  });
  assert.equal(blankLabel.status, 400);
  assert.equal((await blankLabel.json()).error, "VALIDATION");

  const cloudflareMissingAccountId = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "cf", connection: { vendorId: "cloudflare", token: "t" } }),
  });
  assert.equal(cloudflareMissingAccountId.status, 400);

  // bitbucket authenticates the (token, username) PAIR — missing username must be rejected the
  // same way the store's own unit suite already proves, just re-checked at the HTTP boundary here.
  const bitbucketMissingUsername = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "bb", connection: { vendorId: "bitbucket", token: "t" } }),
  });
  assert.equal(bitbucketMissingUsername.status, 400);

  const unknownVendor = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", connection: { vendorId: "not-a-real-vendor", token: "t" } }),
  });
  assert.equal(unknownVendor.status, 400);
});

test("vendor-credentials: a duplicate (vendorId, label) 409s with DUPLICATE_LABEL and never creates a second row", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  const first = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Primary", connection: { vendorId: "netlify", token: "first-token" } }),
  });
  assert.equal(first.status, 201);

  const duplicate = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Primary", connection: { vendorId: "netlify", token: "second-token" } }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "DUPLICATE_LABEL");

  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
});
