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

/**
 * Installs a fast, deterministic `globalThis.fetch` stub for the duration of one test — every
 * successful `POST`/`PUT` on this route now triggers a best-effort provider-verification call
 * (`publish-credentials.ts`'s `verifyAfterSave`, `static-publish/verify.ts`), and this file's own
 * tests must never depend on reaching a real GitHub/Vercel/Netlify/Cloudflare/S3 endpoint — same
 * "every test replaces `globalThis.fetch` with a recording fake" discipline
 * `s3-compatible-target.unit.test.ts` already documents for the identical class of problem.
 *
 * Discriminates by URL rather than replacing `fetch` unconditionally: this SAME global `fetch` is
 * also what every test in this file uses to call its own local `baseUrl` test server, so a stub that
 * intercepted every call would break the test's own HTTP requests, not just the outbound
 * verification call it exists to fake. Anything targeting `baseUrl` passes through to the real
 * `fetch` untouched; anything else (the provider-verification call) gets the fixed status below.
 *
 * `t.after` restores the original regardless of pass/fail, so a stub never leaks into a later test.
 */
function stubVerificationFetch(t: { after(fn: () => void): void }, baseUrl: string, status = 401): void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(baseUrl)) return original(input, init);
    return new Response("", { status });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
}

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
  stubVerificationFetch(t, baseUrl);

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "Main Vercel", connection: { providerId: "vercel", token: "vercel-secret-token" } }),
  });
  assert.equal(created.status, 201);
  const { credential, verification } = await created.json();
  assert.equal(credential.providerId, "vercel");
  assert.equal(credential.label, "Main Vercel");
  assert.equal(credential.configured, true);
  assert.equal(credential.isDefault, true); // first credential for its provider auto-defaults
  // The route's read model NEVER carries a token/ciphertext field — assert defensively that the
  // secret never leaked onto the wire even via an accidental spread.
  assert.equal(JSON.stringify(credential).includes("vercel-secret-token"), false);
  assert.equal("token" in credential, false);
  assert.equal("sealed" in credential, false);
  // The route verified the just-saved connection best-effort (2026-08-16) — `stubVerificationFetch`
  // fakes Vercel's own answer as a 401, so this must read as "invalid" (the provider affirmatively
  // rejected it), never "valid" and never conflated with "unreachable" (a network problem).
  assert.equal(verification.status, "invalid");
  assert.match(verification.message, /rejected/i);
  assert.equal(JSON.stringify(verification).includes("vercel-secret-token"), false);

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
  const { credential: renamed, verification: renameVerification } = await updated.json();
  assert.equal(renamed.label, "Renamed Vercel");
  assert.equal(renamed.id, credential.id);
  // A label-only rename touches no connection — must NOT re-verify (no new network call to fake a
  // result for, and no reason to repeat the one already recorded above).
  assert.equal(renameVerification, undefined);

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
  stubVerificationFetch(t, baseUrl);

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
  stubVerificationFetch(t, baseUrl);

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

test("publish-credentials: POST .../:id/verify 404s for a never-existed id", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/no-such-id/verify`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "NOT_FOUND");
});

test("publish-credentials: POST .../:id/verify re-checks an existing connection on demand and reports an honest result, never the credential", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;
  stubVerificationFetch(t, baseUrl, 401);

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "github-secret-token" } }),
  });
  const { credential } = await created.json();

  // On-demand re-check, independent of the save-time one — a human clicking "Verify" later, e.g.
  // after fixing the token in their GitHub account without changing what Tovu has stored.
  const verified = await fetch(`${base}/${credential.id}/verify`, { method: "POST", headers: { cookie } });
  assert.equal(verified.status, 200);
  const { verification } = await verified.json();
  assert.equal(verification.status, "invalid");
  assert.match(verification.message, /GitHub rejected this credential.*HTTP 401/);
  assert.equal(typeof verification.checkedAt, "string");
  assert.equal(JSON.stringify(verification).includes("github-secret-token"), false);
});

test("publish-credentials: a network failure during POST .../:id/verify reports 'unreachable', never 'invalid' — a flaky network must not read as a bad credential", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;
  stubVerificationFetch(t, baseUrl, 401); // save-time check: some status, contents irrelevant here

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "github-secret-token" } }),
  });
  const { credential } = await created.json();

  // Swap the stub for one that throws (DNS failure / connection reset) instead of answering, same
  // "pass local calls through, fake the outbound provider call" URL discrimination as
  // `stubVerificationFetch`, but this time the outbound call fails at the transport layer entirely.
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(baseUrl)) return original(input, init);
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  const verified = await fetch(`${base}/${credential.id}/verify`, { method: "POST", headers: { cookie } });
  assert.equal(verified.status, 200);
  const { verification } = await verified.json();
  assert.equal(verification.status, "unreachable");
  assert.notEqual(verification.status, "invalid");
});
