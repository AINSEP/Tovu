import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Admin Deployment panel → publish-to-GitHub-Pages/Vercel — `POST`/`GET /api/admin/v1/
 * workspaces/:workspaceId/system/publish`. Same bare-principal-vs-owner + workspace-id-404 shape as
 * `export-site-route.test.ts`, whose header this file's own module-level setup mirrors closely.
 *
 * `TOVU_PUBLISH_DIR` is pointed at a throwaway temp directory for this whole file (the adapter's own
 * knob, `static-publish/adapter.ts`'s `publishOutputDir`) so the underlying export never writes into
 * the checked-out repo. This suite deliberately never sets `GITHUB_TOKEN`/`VERCEL_TOKEN` — per the
 * brief, these tests must not hit real GitHub or Vercel, and an absent token is exactly what makes
 * that true structurally: `publishStaticSite` returns `NO_CREDENTIALS_CONFIGURED` before ever
 * constructing a real `DeployTarget`, so the "success" trigger+poll test below reaches a genuine,
 * fully-exercised terminal state (auth, body validation, the run slot, a REAL export against the
 * hermetic fixture) without any external network call.
 *
 * `currentRun` (the route module's own process-local run slot, independent of `export-site.ts`'s)
 * is shared mutable state across every test in this FILE — tests are ordered so each one's
 * precondition holds given only this file's own prior tests, same discipline
 * `export-site-route.test.ts` already established.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-route-test-"));
process.env.TOVU_PUBLISH_DIR = publishOutputDir;
delete process.env.GITHUB_TOKEN;
delete process.env.VERCEL_TOKEN;

const PUBLISH_PATH = "system/publish";

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-publish-site";
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
    username: "bare-publish-site",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-publish-site", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("publish-site: an unauthorized principal (no grants) gets 403 on both the trigger and the status poll", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 403);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
  assert.equal(status.status, 403);
});

test("publish-site: a mismatched workspaceId in the URL 404s on both routes", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 404);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${PUBLISH_PATH}`, { headers: { cookie } });
  assert.equal(status.status, 404);
});

test("publish-site: the status poll starts idle before any trigger has run in this process", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "idle", startedAtIso: null, finishedAtIso: null, target: null });
});

test("publish-site: a malformed trigger body 400s and never starts a run", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const missingProjectName = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "vercel" }),
  });
  assert.equal(missingProjectName.status, 400);

  const badTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "netlify", projectName: "demo" }),
  });
  assert.equal(badTarget.status, 400);

  const missingRepoForPages = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "github-pages", owner: "octo", projectName: "demo" }),
  });
  assert.equal(missingRepoForPages.status, 400);

  // Valid shape, but an invalid VALUE (an owner containing a space) — this is
  // `validateStaticPublishConfig`'s job, exercised through the route, not re-implemented by it.
  const invalidOwnerValue = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "github-pages", owner: "not valid!!", repo: "demo", projectName: "demo" }),
  });
  assert.equal(invalidOwnerValue.status, 400);

  const idle = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
  assert.equal((await idle.json()).status, "idle");
});

test("publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CREDENTIALS_CONFIGURED result, never touching a real GitHub/Vercel API", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  t.after(() => rmSync(publishOutputDir, { recursive: true, force: true }));

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "github-pages", owner: "octo", repo: "demo-repo", projectName: "demo" }),
  });
  assert.equal(trigger.status, 202);
  const triggerBody = await trigger.json();
  assert.equal(triggerBody.status, "running");
  assert.equal(triggerBody.target, "github-pages");
  assert.equal(triggerBody.finishedAtIso, null);

  let finalStatusBody: { status: string; [key: string]: unknown } = { status: "running" };
  for (let attempt = 0; attempt < 200 && finalStatusBody.status === "running"; attempt++) {
    await delay(20);
    const poll = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
    assert.equal(poll.status, 200);
    finalStatusBody = await poll.json();
  }

  assert.equal(finalStatusBody.status, "errored", `publish did not settle in time: ${JSON.stringify(finalStatusBody)}`);
  assert.ok(finalStatusBody.finishedAtIso, "a settled run must carry a finish timestamp");
  const result = finalStatusBody.result as { ok: boolean; code?: string; message?: string };
  assert.equal(result.ok, false);
  assert.equal(result.code, "NO_CREDENTIALS_CONFIGURED");
  assert.match(result.message ?? "", /GITHUB_TOKEN/);
  // The whole polled body, serialized, must never carry anything token-shaped — this run never had
  // a token to leak, and this assertion is the proof of that, not an assumption.
  assert.doesNotMatch(JSON.stringify(finalStatusBody), /Bearer |ghp_|["']token["']?\s*:\s*["'][^"']{4,}/i);
});

test("publish-site: a concurrent second trigger while one is genuinely in flight gets 409 — proven via a real export's own duration, with GitHub/Vercel's API itself intercepted so no real network call ever leaves this process", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const runOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-race-test-"));
  const previousPublishDir = process.env.TOVU_PUBLISH_DIR;
  const previousVercelToken = process.env.VERCEL_TOKEN;
  process.env.TOVU_PUBLISH_DIR = runOutputDir;
  // A non-empty value is all `createEnvPublishCredentialSource` requires — Jini's own adapter never
  // validates a token's shape client-side, and this exact value never leaves this process (the only
  // fetch call that would ever send it, to api.vercel.com, is intercepted below and never dispatched
  // over a real socket).
  process.env.VERCEL_TOKEN = "fake-token-for-concurrency-test-only";

  // Intercepts ONLY calls to Vercel's real API host — every other fetch (this test's own calls to
  // `baseUrl`, and the real export's own real HTTP calls to its in-process `127.0.0.1` listener,
  // see `site-exporter.ts`) passes through to the real, original `fetch` unchanged. This is what
  // lets this test observe a REAL export's own duration (the same width `export-site-route.test.ts`
  // relies on for its own concurrency test) as the race window, while still never letting a byte
  // reach the actual public internet.
  const realFetch = globalThis.fetch;
  let vercelCallCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.vercel.com/")) {
      vercelCallCount += 1;
      return new Response(JSON.stringify({ error: { message: "intercepted — no real Vercel call was made" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
    process.env.VERCEL_TOKEN = previousVercelToken;
    process.env.TOVU_PUBLISH_DIR = previousPublishDir;
    rmSync(runOutputDir, { recursive: true, force: true });
  });

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "vercel", projectName: "demo" }),
  });
  assert.equal(trigger.status, 202);
  const triggerBody = await trigger.json();
  assert.equal(triggerBody.status, "running");

  // Fired immediately, no delay — a real export against the hermetic fixture is still mid-flight
  // (multiple real HTTP round trips against the in-process listener; the Vercel token check has
  // already passed at this point, so unlike this file's OTHER trigger test, this one does not
  // short-circuit before the slow phase even starts). Must observe "already running", never
  // silently queue or silently drop the second request.
  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "vercel", projectName: "demo" }),
  });
  assert.equal(second.status, 409);

  let finalStatusBody: { status: string; [key: string]: unknown } = { status: "running" };
  for (let attempt = 0; attempt < 200 && finalStatusBody.status === "running"; attempt++) {
    await delay(20);
    const poll = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
    finalStatusBody = await poll.json();
  }
  assert.equal(finalStatusBody.status, "errored", `publish did not settle in time: ${JSON.stringify(finalStatusBody)}`);
  const result = finalStatusBody.result as { ok: boolean; code?: string };
  assert.equal(result.ok, false);
  assert.equal(result.code, "PROVIDER_ERROR");
  assert.equal(vercelCallCount, 1, "exactly one publish reached the (intercepted) Vercel API — the second trigger was refused before ever getting there");
});

/**
 * `GET .../system/publish/preview` — the admin UI's read-only counterpart to
 * `deployment_preview_static_publish` (see `publish-site.ts`'s header). Same auth/workspace-404
 * shape as every other route in this file; the behavior worth pinning here is specific to a preview:
 * it never starts a run (no `currentRun` mutation, unlike every test above), the base path is
 * derived exactly as `computeBasePath` documents, and a resolved credential's boolean crosses the
 * response while the token string itself never does — proven the same way the earlier
 * NO_CREDENTIALS_CONFIGURED test proves it for the trigger route.
 */
test("publish-site preview: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=vercel`, { headers: { cookie } });
  assert.equal(res.status, 403);
});

test("publish-site preview: a mismatched workspaceId 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${PUBLISH_PATH}/preview?target=vercel`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("publish-site preview: a missing/unrecognized target, and a github-pages preview missing repo, both 400", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const noTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview`, { headers: { cookie } });
  assert.equal(noTarget.status, 400);

  const badTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=netlify`, { headers: { cookie } });
  assert.equal(badTarget.status, 400);

  const missingRepo = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=github-pages&owner=octo`, { headers: { cookie } });
  assert.equal(missingRepo.status, 400);
});

test("publish-site preview: github-pages reports the derived base path and, with no GITHUB_TOKEN configured, credentialsConfigured false — never starting a run", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Captured rather than asserted as a literal "idle": by this point in the file, the earlier
  // "trigger starts a real run" test (above) has already flipped the shared `currentRun` slot to
  // "errored" and nothing resets it — same shared-mutable-state discipline this file's own header
  // documents. What this test actually needs to prove is that a preview never MUTATES that slot,
  // whatever its value; asserting a specific status here would just be re-asserting another test's
  // leftover state.
  const before = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
  const beforeBody = await before.json();

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=github-pages&owner=octo&repo=demo-repo`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, {
    target: "github-pages",
    valid: true,
    validationError: null,
    basePath: "/demo-repo",
    credentialsConfigured: false,
    credentialGuidance: "GITHUB_TOKEN is not set — publishing to github-pages requires a token with write access configured in the server environment",
    willInjectNojekyll: true,
  });

  // Never mutates `currentRun` — a preview is a pure read, so the run slot this file's other tests
  // share is untouched by calling it.
  const after = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
  assert.deepEqual(await after.json(), beforeBody);
});

test("publish-site preview: an invalid owner is reported as invalid with no base path, and vercel never carries one", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const invalidOwner = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=github-pages&owner=not%20valid!!&repo=demo`, { headers: { cookie } });
  assert.equal(invalidOwner.status, 200);
  const invalidBody = await invalidOwner.json();
  assert.equal(invalidBody.valid, false);
  assert.ok(invalidBody.validationError, "an invalid owner must report why");
  assert.equal(invalidBody.basePath, null);

  const vercel = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=vercel`, { headers: { cookie } });
  assert.equal(vercel.status, 200);
  const vercelBody = await vercel.json();
  assert.equal(vercelBody.valid, true);
  assert.equal(vercelBody.basePath, null);
  assert.equal(vercelBody.willInjectNojekyll, false);
});

test("publish-site preview: with a token configured, credentialsConfigured is true and the token itself never crosses the response", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "ghp_fake-token-for-preview-test-only";
  t.after(() => {
    process.env.GITHUB_TOKEN = previousToken;
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=github-pages&owner=octo&repo=demo-repo`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.credentialsConfigured, true);
  assert.equal(body.credentialGuidance, null);
  assert.doesNotMatch(JSON.stringify(body), /ghp_fake-token-for-preview-test-only/, "the resolved token must never appear in a preview response");
});
