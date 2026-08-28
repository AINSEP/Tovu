import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { AesGcmSecretSealer } from "../../../features/webhooks/secret-sealer.aesgcm.js";
import type { KeyringPort } from "../../../features/webhooks/index.js";
import { bootAuthenticated, loginAsOwner, startTestServer } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

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

/** Always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state.
 *  Same double `server/__tests__/admin-media-provider-routes.test.ts`'s own `BrokenKeyring` uses for
 *  the identical class of problem on a sibling secret store. */
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

  // `POST .../:id/verify` and `GET .../:id/repos` are separate routes from the four above (each with
  // its OWN `rejectUnlessAuthorized` call site, not a shared middleware) — found missing here by
  // `development/scripts/mutation-sweep.mjs`: neutralizing either call site's `if` still left every
  // test in this file green, meaning nothing actually proved these two routes reject an unauthorized
  // caller. `some-id` is enough — the auth check runs before any existence lookup on both routes.
  const verify = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/some-id/verify`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(verify.status, 403);

  const repos = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/some-id/repos`, { headers: { cookie } });
  assert.equal(repos.status, 403);
});

// -------------------------------------------------------------------------------------------------
// The two tests below close real gaps `development/scripts/mutation-sweep.mjs` found (2026-08-17):
// each is a mutant of a guard in `publish-credentials.ts` that SURVIVED the suite as it stood — the
// guard's absence changed nothing any existing test asserted. See
// `ADS-memory/reports/2026-08-17-mutation-sweep.md` for the full sweep output, including several
// OTHER survivors deliberately left unclosed there (documented, not silently dropped) — notably the
// sibling `(req.body ?? {})`/`(req.params.workspaceId ?? "")` fallbacks: empirically confirmed
// (`express.json()` defaults `req.body` to `{}` even with no content-type at all, checked directly
// against this repo's own Express version) to be dead code no real HTTP request can ever reach, not
// missing coverage — a test cannot kill a mutant on a line the real code path never runs through.
// -------------------------------------------------------------------------------------------------

test("publish-credentials: POST with no body at all still 400s with VALIDATION (pins real behavior; does NOT kill the (req.body ?? {}) mutant — see note above)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // No content-type, no body. `express.json()` (this repo's Express 4.21) defaults `req.body` to
  // `{}` regardless — confirmed directly, not assumed — so this pins real, already-correct behavior
  // (an empty POST is a validation error, not a crash) without being able to prove anything about
  // `publish-credentials.ts`'s own `(req.body ?? {})` fallback, which no real request can bypass.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; detail: string };
  assert.equal(body.error, "VALIDATION");
  assert.match(body.detail, /label/);
});

test("publish-credentials: a successful verify (status 'valid' with an accountLabel) persists that label to the row, not just the response", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;

  // A real GitHub `/user` 200 response, same field `extractGitHubLogin` (`static-publish/verify.ts`)
  // reads. Distinct from `stubVerificationFetch` (that helper only ever fixes the STATUS, always
  // failing the account-label branch this test targets) — this needs a genuine 200 + JSON body.
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(baseUrl)) return original(input, init);
    return new Response(JSON.stringify({ login: "octocat" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "github-secret-token" } }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const { verification } = await created.json();
  assert.equal(verification.status, "valid");
  assert.equal(verification.accountLabel, "octocat");

  // The response having the right `accountLabel` proves `computeVerificationResult`/
  // `extractGitHubLogin` work — it does NOT prove `verifyAfterSave`'s `if (result?.accountLabel !==
  // undefined)` guard actually called `healAccountLabel` to WRITE it. Read the row back through a
  // completely separate request to prove the write really happened, not just that the in-memory
  // response object carried the field.
  const list = await (await fetch(base, { headers: { cookie } })).json();
  assert.equal(list.credentials.length, 1);
  assert.equal(list.credentials[0].accountLabel, "octocat");
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
  //
  // Deliberately NO second `t.after` here (found live, 2026-08-17, while adding a later test in this
  // same file): `globalThis.fetch` at this point is already `stubVerificationFetch`'s OWN stub, not
  // the true native `fetch` — capturing it as `original` and restoring to it in a SECOND `t.after`
  // would run AFTER `stubVerificationFetch`'s own `t.after` (`t.after` callbacks run in registration
  // order — confirmed directly), re-stubbing `globalThis.fetch` right back to a stale, test-local
  // function for every test that runs afterward in this same process. `stubVerificationFetch`'s own
  // cleanup (registered above, at this test's own `stubVerificationFetch(t, baseUrl, 401)` call)
  // already fully restores the true native `fetch` once THIS test ends — nothing else to undo here.
  const passThroughFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(baseUrl)) return passThroughFetch(input, init);
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  const verified = await fetch(`${base}/${credential.id}/verify`, { method: "POST", headers: { cookie } });
  assert.equal(verified.status, 200);
  const { verification } = await verified.json();
  assert.equal(verification.status, "unreachable");
  assert.notEqual(verification.status, "invalid");
});

/**
 * Live-found (2026-08-16): a saved row from a HEALTHY prior boot (`TOVU_INTEGRATIONS_ROOT_KEY` set),
 * hit by `POST .../:id/verify` on a NEW boot that never had the key — exactly the trigger an e2e run
 * reproduced. Before this fix, that request killed the WHOLE server process, not just itself: this
 * route had no try/catch at all, Express 4 does not catch an async handler's own rejection, and
 * nothing in `src/` was catching it at the process level either.
 *
 * Two apps sharing ONE repo simulate "the row already exists, THIS process just has no root key" —
 * app1 (a normal, working sealer) creates and saves the row; app2 (a `BrokenKeyring`) is a second,
 * independent server instance pointed at the SAME `publishCredentialSetRepo`, standing in for a
 * later, differently-configured boot. This is deliberately not "swap the sealer mid-request" — a
 * single request cannot both succeed at sealing and fail at opening with the same key, so two
 * separate app instances are the only way to reproduce the real shape of the bug.
 *
 * Asserting `503 SECRET_STORE_UNCONFIGURED` alone would still pass even if the SERVER PROCESS itself
 * had died in a way this harness happened to mask (e.g. a crash the test's own `fetch` reported as a
 * network error rather than distinguishing it from a real response). The load-bearing assertion is
 * the one after: a second, unrelated request against the SAME live server, issued right after the
 * failing one — a dead process cannot answer this; it would `ECONNREFUSED`/reject, not return 200.
 */
test("publish-credentials: a root key missing at verify time (present at save time) 503s with SECRET_STORE_UNCONFIGURED, and the server survives to answer the next request", async (t) => {
  // App 1: a normal, working sealer — saves the credential the way a healthy prior boot would have.
  const deps1 = createRouteDeps();
  const app1 = createApp(deps1);
  const { baseUrl: baseUrl1, cookie: cookie1 } = await bootAuthenticated(app1, t);
  const base1 = `${baseUrl1}/api/admin/v1/workspaces/${deps1.workspaceId}/${CREDENTIALS_PATH}`;

  // Two LIVE servers on two different ports in this one test — `stubVerificationFetch` only passes
  // through requests to the ONE `baseUrl` it is given, which would silently swallow every request to
  // app2 (a different port) too, including its own login, answering them with a fake status instead
  // of ever reaching app2's real server. Inlined here instead: both base URLs pass through untouched
  // (app2's own `baseUrl` is filled in below, once it exists — this override is only exercised by the
  // OUTBOUND provider-verification call before that point, which is exactly what needs faking then);
  // only the actual outbound provider-verification call gets faked.
  let baseUrl2 = "";
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(baseUrl1) || (baseUrl2 !== "" && url.startsWith(baseUrl2))) return original(input, init);
    return new Response("", { status: 401 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  const created = await fetch(base1, {
    method: "POST",
    headers: { cookie: cookie1, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "github-secret-token" } }),
  });
  assert.equal(created.status, 201);
  const { credential } = await created.json();

  // App 2: a SEPARATE server instance sharing the SAME repo (so it can see the row app1 just saved)
  // but a keyring that always throws — the current process, not the one that saved the row.
  const brokenKeyring = new BrokenKeyring();
  const deps2: RouteDeps = {
    ...createRouteDeps(),
    publishCredentialSetRepo: deps1.publishCredentialSetRepo,
    siteAssistantSecretKeyring: brokenKeyring,
    siteAssistantSecretSealer: new AesGcmSecretSealer(brokenKeyring),
  };
  assert.equal(deps2.workspaceId, deps1.workspaceId, "sanity: both deps use the same seeded workspace id, so the shared row is reachable under the same URL");
  const app2 = createApp(deps2);
  // Not `bootAuthenticated` (it bundles server-start + login into one call, returning `baseUrl` only
  // AFTER login already happened) — `baseUrl2` must be known and unblocking the fetch override above
  // BEFORE app2's own login request goes out, or that request gets swallowed by the override too.
  baseUrl2 = await startTestServer(app2, t);
  const cookie2 = await loginAsOwner(baseUrl2);
  const base2 = `${baseUrl2}/api/admin/v1/workspaces/${deps2.workspaceId}/${CREDENTIALS_PATH}`;

  // Bounded, not a bare `fetch`: an unguarded decrypt failure does not necessarily produce a fast,
  // clean crash — reproduced directly while writing this test, an unguarded async handler that
  // rejects with nothing calling `res.json()`/`res.status()` leaves the client's request hanging with
  // no response at all, not a quick error. A regression here must fail this test in seconds, never
  // hang the whole suite indefinitely.
  const verify = await fetch(`${base2}/${credential.id}/verify`, { method: "POST", headers: { cookie: cookie2 }, signal: AbortSignal.timeout(5000) });
  assert.equal(verify.status, 503);
  const verifyBody = await verify.json();
  assert.equal(verifyBody.error, "SECRET_STORE_UNCONFIGURED");

  // Proof of survival, not just a status code (see this test's own doc comment above).
  const stillAlive = await fetch(base2, { headers: { cookie: cookie2 } });
  assert.equal(stillAlive.status, 200, "the server must still be answering an unrelated GET on the SAME instance right after the failing verify call");
  const list = await stillAlive.json();
  assert.equal(list.credentials.length, 1, "and it must still see the row it had before the failing call — the failure must not have corrupted anything else");
});

// -------------------------------------------------------------------------------------------------
// GET .../:id/repos — the GitHub repo-list endpoint backing `source-control-ui`'s owner/repo picker
// (replacing the free-text fields `development/e2e/live-publish-e2e.spec.ts` guards against). The
// two tests below cover what is real TODAY: the 404/400 gating this route owns outright, both
// resolved before `listGitHubReposByCredentialId` is ever called. The actual repo-listing behavior
// (200 with a real/faked repo list) is NOT tested here yet — `publish-credentials.ts`'s own doc
// comment on `listGitHubReposByCredentialId` explains why: it is a TEMPORARY STUB pending
// `routedeps-vendor`'s real probe function in `src/features/deployments/static-publish/**`. The third
// test below proves that stub's unconditional throw is still safely GUARDED (a fast 500, never a
// hang) — the same RED-first shape every other handler in this file follows — which is the one thing
// that must hold even before real GitHub-listing logic exists. Replace that third test with a real
// success/invalid/unreachable-status assertion once the stub is swapped for the real import.
// -------------------------------------------------------------------------------------------------

test("publish-credentials: GET .../:id/repos 404s for a never-existed id", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/no-such-id/repos`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "NOT_FOUND");
});

test("publish-credentials: GET .../:id/repos 400s for a saved credential whose provider isn't github-pages", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;
  stubVerificationFetch(t, baseUrl, 401); // save-time verify; contents irrelevant to this test

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "vc", connection: { providerId: "vercel", token: "vercel-token" } }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const { credential } = await created.json();
  assert.equal(credential.providerId, "vercel");

  // Rejected on `describeCredential`'s own read model, before any decrypt/probe — so this must
  // resolve immediately even with no stub for the (never-reached) GitHub call.
  const res = await fetch(`${base}/${credential.id}/repos`, { headers: { cookie }, signal: AbortSignal.timeout(3000) });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "UNSUPPORTED_PROVIDER");
  assert.match(body.error, /github-pages/);
  assert.match(body.error, /vercel/);
});

test("publish-credentials: GET .../:id/repos on a real github-pages credential responds 500 (not a hang) — proves the handler's guard is real, ahead of the real probe landing", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;
  stubVerificationFetch(t, baseUrl, 401); // save-time verify; contents irrelevant to this test

  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "github-secret-token" } }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const { credential } = await created.json();

  // `listGitHubReposByCredentialId` (the TEMPORARY STUB in `publish-credentials.ts`) throws
  // unconditionally today. Bounded, not a bare `fetch`, for the same reason every other guard test in
  // this suite bounds its request: an unguarded async handler that rejects with nothing calling
  // `res.json()`/`res.status()` leaves the client hanging with no response at all, never a fast error.
  const res = await fetch(`${base}/${credential.id}/repos`, { headers: { cookie }, signal: AbortSignal.timeout(3000) });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "INTERNAL_ERROR");
});
