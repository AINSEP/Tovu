import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../app.js";

/**
 * @file Route-level proof of SPEC-006 REQ-08 (API keys) — the three admin endpoints
 * `openapi/006-identity-and-authorization.yaml` documents, plus the Bearer credential path they
 * exist to enable. Mirrors `identity-crud-routes.test.ts`'s harness (`bootServer`/`loginAs`) and
 * dev-seed credentials (`admin`/`tovu-dev`, `deps.workspaceId === "workspace-local"`).
 *
 * What each block proves, in the order a real caller would hit them: mint a machine principal →
 * issue a key against it → authenticate a real gated mutation with that key → revoke → confirm the
 * key is dead. The three refusal blocks at the end are the ones that matter most: an unknown key,
 * an expired key, and — the escalation guard — a key that DOES hold `apikey.manage` and still
 * cannot mint, issue, or revoke, proving the refusal is about the credential type and not about a
 * missing permission.
 */

const WORKSPACE = "workspace-local";

async function bootServer(deps: ReturnType<typeof createRouteDeps>) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function loginAs(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { res, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

/** The seeded built-in policies, by their seed names (`identity/seed.ts`). */
async function builtinPolicyId(baseUrl: string, cookie: string, name: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/policies`, { headers: { cookie } });
  const body = (await res.json()) as { policies: Array<{ id: string; name: string }> };
  const policy = body.policies.find((row) => row.name === name);
  assert.ok(policy, `seed created the ${name} policy`);
  return policy.id;
}

async function mintPrincipal(baseUrl: string, cookie: string, displayName: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ displayName }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { principal: { id: string } };
  return body.principal.id;
}

interface IssueInput {
  principalId: string;
  label: string;
  policyIds: string[];
  expiresAt?: string;
}

async function issueKey(baseUrl: string, cookie: string, input: IssueInput) {
  const res = await fetch(`${baseUrl}/api/admin/v1/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as { apiKey?: { id: string; rawKey: string }; code?: string; error?: string };
  return { res, body };
}

/** `issueKey` for the happy path: asserts 201 and hands back the key itself, so the success tests
 *  below read `key.rawKey` rather than re-checking a status and unwrapping an optional each time. */
async function issuedKey(baseUrl: string, cookie: string, input: IssueInput) {
  const { res, body } = await issueKey(baseUrl, cookie, input);
  assert.equal(res.status, 201);
  const apiKey = body.apiKey;
  assert.ok(apiKey, "issue returned an apiKey");
  return apiKey;
}

/** Read a persisted key row, asserting it exists — the tests that call this just wrote it. */
async function storedKey(deps: ReturnType<typeof createRouteDeps>, id: string) {
  const stored = await deps.apiKeyRepo.findById({ workspaceId: WORKSPACE, id });
  assert.ok(stored, `key row ${id} was persisted`);
  return stored;
}

/** A logged-in principal holding no roles and no policies — the "authenticated but ungranted" case. */
async function loginBarePrincipal(deps: ReturnType<typeof createRouteDeps>, baseUrl: string) {
  await deps.identityReady;
  const principalId = "bare-principal-apikeys";
  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Bare",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username: "bare-apikeys",
    passwordHash: await deps.passwordHasher.hash("bare-p4ssw0rd!"),
  });
  const { cookie } = await loginAs(baseUrl, "bare-apikeys", "bare-p4ssw0rd!");
  return cookie;
}

test("APIKEY_PRINCIPAL_CREATE mints an active, grantless api_key principal", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const res = await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ displayName: "Tovu-Runner" }),
  });

  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    principal: { id: string; kind: string; status: string; workspaceId: string; displayName: string };
  };
  assert.equal(body.principal.kind, "api_key");
  assert.equal(body.principal.status, "active");
  assert.equal(body.principal.workspaceId, WORKSPACE);
  assert.equal(body.principal.displayName, "Tovu-Runner");

  // Grantless is the precondition ISSUE_API_KEY re-verifies — assert it directly, not by proxy.
  const roles = await deps.principalRoleRepo.listByPrincipalId({
    workspaceId: WORKSPACE,
    principalId: body.principal.id,
  });
  const policies = await deps.principalPolicyRepo.listByPrincipalId({
    workspaceId: WORKSPACE,
    principalId: body.principal.id,
  });
  assert.deepEqual([roles.length, policies.length], [0, 0]);
});

test("APIKEY_PRINCIPAL_CREATE refuses a blank displayName and any kind other than api_key", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const headers = { "content-type": "application/json", cookie };

  const blank = await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST",
    headers,
    body: JSON.stringify({ displayName: "   " }),
  });
  assert.equal(blank.status, 400);
  assert.equal(((await blank.json()) as { code: string }).code, "VALIDATION_ERROR");

  // 'user' would otherwise be a second creation path for a privileged kind.
  const wrongKind = await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST",
    headers,
    body: JSON.stringify({ displayName: "Sneaky", kind: "user" }),
  });
  assert.equal(wrongKind.status, 400);
  assert.equal(((await wrongKind.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("APIKEY_ISSUE returns the raw key once and persists only a hash of it", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, cookie, "Runner");
  const editorPolicyId = await builtinPolicyId(baseUrl, cookie, "editor-builtin-policy");

  const { id, rawKey } = await issuedKey(baseUrl, cookie, {
    principalId,
    label: "runner-key",
    policyIds: [editorPolicyId],
  });
  assert.match(rawKey, /^tovu_ak_[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);

  // INV-05: the stored row must contain neither the raw key nor its secret half.
  const stored = await storedKey(deps, id);
  const secret = rawKey.split(".")[1];
  assert.ok(!stored.keyHash.includes(secret), "keyHash does not embed the secret");
  assert.ok(!JSON.stringify(stored).includes(secret), "no field on the row embeds the secret");
  assert.equal(stored.prefix, rawKey.split(".")[0]);

  // The snapshot is frozen and 1:1 with the key (F-054-01).
  const snapshotId = stored.issuedPolicyId;
  assert.ok(snapshotId, "the key records its issuance snapshot");
  const snapshot = await deps.policyRepo.findById({ workspaceId: WORKSPACE, id: snapshotId });
  assert.equal(snapshot?.isFrozen, true);
});

test("a request authenticates with Authorization: Bearer <raw-key> and performs a gated mutation", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, cookie, "Runner");
  const editorPolicyId = await builtinPolicyId(baseUrl, cookie, "editor-builtin-policy");
  const key = await issuedKey(baseUrl, cookie, {
    principalId,
    label: "runner-key",
    policyIds: [editorPolicyId],
  });
  const bearer = { authorization: `Bearer ${key.rawKey}` };

  // AUTH_ME resolves the key to its bound principal and its snapshotted permissions.
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer });
  assert.equal(me.status, 200);
  const meBody = (await me.json()) as { user: { id: string }; effectivePermissions: string[] };
  assert.equal(meBody.user.id, principalId);
  assert.ok(meBody.effectivePermissions.includes("content.write"));
  assert.ok(!meBody.effectivePermissions.includes("*"), "a key snapshot never carries the wildcard");

  // The real point: an existing authorize()-gated route works unchanged for this principal.
  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/posts`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ title: "Written by an API key" }),
  });
  assert.equal(created.status, 201);

  // `ApiKey <raw-key>` (the spelling api.spec §2 uses) is accepted too.
  const viaApiKeyScheme = await fetch(`${baseUrl}/api/admin/v1/auth/me`, {
    headers: { authorization: `ApiKey ${key.rawKey}` },
  });
  assert.equal(viaApiKeyScheme.status, 200);
});

test("APIKEY_REVOKE is 204 and the revoked key is rejected on the very next request", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, cookie, "Runner");
  const editorPolicyId = await builtinPolicyId(baseUrl, cookie, "editor-builtin-policy");
  const key = await issuedKey(baseUrl, cookie, {
    principalId,
    label: "runner-key",
    policyIds: [editorPolicyId],
  });
  const bearer = { authorization: `Bearer ${key.rawKey}` };

  assert.equal((await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer })).status, 200);

  const revoked = await fetch(`${baseUrl}/api/admin/v1/api-keys/${key.id}/revoke`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(revoked.status, 204);
  assert.equal(await revoked.text(), "");

  assert.equal((await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer })).status, 401);
  const afterRevoke = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/posts`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ title: "Should never be written" }),
  });
  assert.equal(afterRevoke.status, 401);

  // The issuance snapshot is emptied, so the bound principal is left holding nothing.
  const stored = await storedKey(deps, key.id);
  assert.ok(stored.issuedPolicyId, "the key records its issuance snapshot");
  const snapshotRows = await deps.policyPermissionRepo.listByPolicyId({
    workspaceId: WORKSPACE,
    policyId: stored.issuedPolicyId,
  });
  assert.equal(snapshotRows.length, 0);

  // Idempotent: revoking again is still a 204, not a 409.
  const again = await fetch(`${baseUrl}/api/admin/v1/api-keys/${key.id}/revoke`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(again.status, 204);
});

test("an unknown, malformed, or expired key is rejected 401", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, cookie, "Runner");
  const editorPolicyId = await builtinPolicyId(baseUrl, cookie, "editor-builtin-policy");

  // Well-formed but never issued; well-formed prefix with a wrong secret; and outright garbage.
  const live = await issuedKey(baseUrl, cookie, {
    principalId,
    label: "runner-key",
    policyIds: [editorPolicyId],
  });
  const realPrefix = live.rawKey.split(".")[0];
  const candidates = [
    "tovu_ak_000000000000.QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWY",
    `${realPrefix}.QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWY`,
    "garbage",
    "Bearer",
    "",
  ];
  for (const candidate of candidates) {
    const res = await fetch(`${baseUrl}/api/admin/v1/auth/me`, {
      headers: { authorization: `Bearer ${candidate}` },
    });
    assert.equal(res.status, 401, `rejected: ${JSON.stringify(candidate)}`);
  }

  // An expiry already in the past is rejected even though the key is neither unknown nor revoked.
  const expiredPrincipalId = await mintPrincipal(baseUrl, cookie, "Expired runner");
  const expired = await issuedKey(baseUrl, cookie, {
    principalId: expiredPrincipalId,
    label: "expired-key",
    policyIds: [editorPolicyId],
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const expiredRes = await fetch(`${baseUrl}/api/admin/v1/auth/me`, {
    headers: { authorization: `Bearer ${expired.rawKey}` },
  });
  assert.equal(expiredRes.status, 401);
});

test("an api_key-authenticated caller cannot mint, issue, or revoke — even holding apikey.manage", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, cookie, "Escalation probe");
  // The admin built-in policy carries `apikey.manage` (identity/seed.ts), so the key below holds
  // the exact permission these three routes gate on. Any refusal is therefore about the CREDENTIAL
  // TYPE, not about a missing grant — which is the whole point of this test.
  const adminPolicyId = await builtinPolicyId(baseUrl, cookie, "admin-builtin-policy");
  const probeKey = await issuedKey(baseUrl, cookie, {
    principalId,
    label: "escalation-probe",
    policyIds: [adminPolicyId],
  });
  const bearer = { authorization: `Bearer ${probeKey.rawKey}` };

  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer });
  const meBody = (await me.json()) as { effectivePermissions: string[] };
  assert.ok(meBody.effectivePermissions.includes("apikey.manage"), "the key really does hold apikey.manage");

  const attempts = [
    { url: `${baseUrl}/api/admin/v1/api-keys/principals`, body: { displayName: "Successor" } },
    { url: `${baseUrl}/api/admin/v1/api-keys`, body: { principalId, label: "successor", policyIds: [adminPolicyId] } },
    { url: `${baseUrl}/api/admin/v1/api-keys/${probeKey.id}/revoke`, body: {} },
  ];
  for (const attempt of attempts) {
    const res = await fetch(attempt.url, {
      method: "POST",
      headers: { ...bearer, "content-type": "application/json" },
      body: JSON.stringify(attempt.body),
    });
    assert.equal(res.status, 403, `refused: ${attempt.url}`);
    const refusal = (await res.json()) as { code: string; details: { reason: string } };
    assert.equal(refusal.code, "FORBIDDEN");
    assert.equal(refusal.details.reason, "credential_kind_not_permitted");
  }

  // And the key it tried to revoke is still live — the 403 was a refusal, not a partial apply.
  assert.equal((await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: bearer })).status, 200);
});

test("all three routes are 401 without a credential and 403 for an authenticated caller lacking apikey.manage", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const bareCookie = await loginBarePrincipal(deps, baseUrl);
  const routes = [
    "/api/admin/v1/api-keys/principals",
    "/api/admin/v1/api-keys",
    "/api/admin/v1/api-keys/some-id/revoke",
  ];

  for (const route of routes) {
    const anonymous = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(anonymous.status, 401, `401 without a credential: ${route}`);

    const ungranted = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: "{}",
    });
    assert.equal(ungranted.status, 403, `403 without apikey.manage: ${route}`);
    assert.equal(((await ungranted.json()) as { code: string }).code, "FORBIDDEN");
  }
});

test("APIKEY_ISSUE refuses a wildcard source policy, a non-api_key target, and a non-grantless target", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, cookie, "Runner");
  const editorPolicyId = await builtinPolicyId(baseUrl, cookie, "editor-builtin-policy");
  const ownerPolicyId = await builtinPolicyId(baseUrl, cookie, "owner-builtin-policy");

  // AC-26: a snapshot may never carry `*`, even when the issuer holds it.
  const wildcard = await issueKey(baseUrl, cookie, {
    principalId,
    label: "wildcard",
    policyIds: [ownerPolicyId],
  });
  assert.equal(wildcard.res.status, 400);
  assert.equal(wildcard.body.code, "VALIDATION_ERROR");

  // AC-23: binding to a human principal would let the key inherit that principal's grants.
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  const ownerPrincipalId = ((await me.json()) as { user: { id: string } }).user.id;
  const humanTarget = await issueKey(baseUrl, cookie, {
    principalId: ownerPrincipalId,
    label: "human-target",
    policyIds: [editorPolicyId],
  });
  assert.equal(humanTarget.res.status, 400);
  assert.equal(humanTarget.body.code, "VALIDATION_ERROR");

  // 404, not 400, for a target that simply does not exist.
  const missing = await issueKey(baseUrl, cookie, {
    principalId: "no-such-principal",
    label: "missing",
    policyIds: [editorPolicyId],
  });
  assert.equal(missing.res.status, 404);

  // AC-25: the first issuance makes the principal non-grantless, so a second is refused.
  const first = await issueKey(baseUrl, cookie, { principalId, label: "first", policyIds: [editorPolicyId] });
  assert.equal(first.res.status, 201);
  const second = await issueKey(baseUrl, cookie, { principalId, label: "second", policyIds: [editorPolicyId] });
  assert.equal(second.res.status, 400);
  assert.equal(second.body.code, "VALIDATION_ERROR");
});

test("INV-07: an issuer cannot snapshot a permission it does not hold unconstrained", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie: ownerCookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const principalId = await mintPrincipal(baseUrl, ownerCookie, "Clamped runner");
  const editorPolicyId = await builtinPolicyId(baseUrl, ownerCookie, "editor-builtin-policy");

  // An issuer holding apikey.manage but NOT content.* — it may issue keys, but may not delegate
  // authority it does not itself hold (INV-07).
  await deps.identityReady;
  const issuerPrincipalId = "clamped-issuer-principal";
  await deps.principalRepo.save({
    id: issuerPrincipalId,
    workspaceId: WORKSPACE,
    kind: "user",
    displayName: "Clamped issuer",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: issuerPrincipalId,
    workspaceId: WORKSPACE,
    username: "clamped-issuer",
    passwordHash: await deps.passwordHasher.hash("clamped-p4ssw0rd!"),
  });
  const narrowPolicyId = "clamped-issuer-policy";
  await deps.policyRepo.save({
    id: narrowPolicyId,
    workspaceId: WORKSPACE,
    name: "clamped-issuer-policy",
    isBuiltin: false,
    isFrozen: false,
  });
  await deps.policyPermissionRepo.save({
    id: "clamped-issuer-permission",
    workspaceId: WORKSPACE,
    policyId: narrowPolicyId,
    permission: "apikey.manage",
    resourceType: null,
    constraintJson: null,
  });
  await deps.principalPolicyRepo.save({
    id: "clamped-issuer-attachment",
    workspaceId: WORKSPACE,
    principalId: issuerPrincipalId,
    policyId: narrowPolicyId,
  });

  const { cookie } = await loginAs(baseUrl, "clamped-issuer", "clamped-p4ssw0rd!");
  const { res, body } = await issueKey(baseUrl, cookie, {
    principalId,
    label: "over-privileged",
    policyIds: [editorPolicyId],
  });
  assert.equal(res.status, 403);
  assert.equal(body.code, "GRANT_EXCEEDS_ISSUER");

  // No partial write: the refused issuance left the target grantless.
  const grants = await deps.principalPolicyRepo.listByPrincipalId({ workspaceId: WORKSPACE, principalId });
  assert.equal(grants.length, 0);
});
