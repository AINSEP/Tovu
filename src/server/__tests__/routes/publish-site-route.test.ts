import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";
import { buildStaticPublishRegistrations } from "../../../features/deployments/publish-agent-tools";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "../../../core/tool-surface-exchanges";

/**
 * @file Admin Deployment panel → publish-to-GitHub-Pages/Vercel — `POST`/`GET /api/admin/v1/
 * workspaces/:workspaceId/system/publish`. Same bare-principal-vs-owner + workspace-id-404 shape as
 * `export-site-route.test.ts`, whose header this file's own module-level setup mirrors closely.
 *
 * `RouteDeps.publishOutputRootDir` is pointed at a throwaway temp directory for this whole file
 * (via {@link testRouteDeps} below — the adapter's own knob, `static-publish/adapter.ts`'s
 * `publishOutputDir`) so the underlying export never writes into the checked-out repo. This suite
 * deliberately never sets `GITHUB_TOKEN`/`VERCEL_TOKEN` — per the brief, these tests must not hit
 * real GitHub or Vercel, and an absent token is exactly what makes that true structurally:
 * `publishStaticSite` returns `NO_CREDENTIALS_CONFIGURED` before ever constructing a real
 * `DeployTarget`, so the "success" trigger+poll test below reaches a genuine, fully-exercised
 * terminal state (auth, body validation, the run slot, a REAL export against the hermetic fixture)
 * without any external network call.
 *
 * `currentRun` (the route module's own process-local run slot, independent of `export-site.ts`'s)
 * is shared mutable state across every test in this FILE — tests are ordered so each one's
 * precondition holds given only this file's own prior tests, same discipline
 * `export-site-route.test.ts` already established.
 */

const publishOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-route-test-"));
delete process.env.GITHUB_TOKEN;
delete process.env.VERCEL_TOKEN;

const PUBLISH_PATH = "system/publish";

/** The hermetic fixture, with `publishOutputRootDir` redirected off the checked-out repo —
 *  `publishStaticSite` reads this `RouteDeps` field instead of `process.env.TOVU_PUBLISH_DIR`
 *  (adapter.ts no longer reads env vars at all). Defaults to this file's own shared throwaway temp
 *  dir; the two "concurrent trigger" tests below pass their OWN per-test dir instead, since they
 *  need a directory that outlives only that one test. */
function testRouteDeps(publishOutputRootDir: string = publishOutputDir): RouteDeps {
  return { ...createRouteDeps(), publishOutputRootDir };
}

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
  const deps: RouteDeps = { ...testRouteDeps() };
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
  const deps: RouteDeps = { ...testRouteDeps() };
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
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "idle", startedAtIso: null, finishedAtIso: null, target: null });
});

test("publish-site: a malformed trigger body 400s and never starts a run", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const missingProjectName = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "vercel" }),
  });
  assert.equal(missingProjectName.status, 400);

  // "netlify"/"cloudflare-pages" are now real, supported targets (2026-08-15, all four Jini
  // targets) — a genuinely unrecognized target string is what this sub-case needs to exercise.
  const badTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "aws-amplify", projectName: "demo" }),
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

test("publish-site preview: netlify and cloudflare-pages are accepted targets (2026-08-15, all four Jini targets) — never 400 for a bare target with no other fields", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  for (const target of ["netlify", "cloudflare-pages"]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=${target}`, { headers: { cookie } });
    assert.equal(res.status, 200, `${target} preview must not 400`);
    const body = await res.json();
    assert.equal(body.valid, true);
    assert.equal(body.basePath, null, `${target} must never carry a base path`);
    // No credential source is configured in this test's env — this proves the route ACCEPTS the
    // target and reports honestly, not that it fabricates a configured credential.
    assert.equal(body.credentialsConfigured, false);
  }
});

test("publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CREDENTIALS_CONFIGURED result, never touching a real GitHub/Vercel API", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
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
  // Its own dedicated temp dir (never this file's shared `publishOutputDir`), so a real export
  // triggered here can't collide on-disk with any other test's own real export — set directly on
  // `deps.publishOutputRootDir` below (via `testRouteDeps(runOutputDir)`), never through
  // `process.env.TOVU_PUBLISH_DIR` (adapter.ts no longer reads env vars at all — the OLD version of
  // this test mutated that env var mid-test, which only worked because `publishOutputDir` used to
  // re-read `process.env` at call time deep inside `publishStaticSite`; now the value is resolved
  // once when `deps` is built, so it must be set BEFORE `createApp(deps)`, not after).
  const runOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-race-test-"));
  const deps: RouteDeps = { ...testRouteDeps(runOutputDir) };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const previousVercelToken = process.env.VERCEL_TOKEN;
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

test("publish-site: a concurrent call through the ASSISTANT TOOL while the HTTP route's own publish is in flight is refused, not raced — the two callers share one guard (Terra audit finding #1, 2026-08-16)", async (t) => {
  // Before the fix, `deployment_execute_static_publish` (`publish-agent-tools.ts`) called
  // `publishStaticSite` directly with nothing to check at all — this route's own `currentRun` slot
  // was private to this file, so a human triggering a publish via the admin UI and an agent's
  // confirmed `deployment_execute_static_publish` call in the SAME running server (the BYOK in-process
  // execution mode) could both start a real publish at once. This test drives BOTH entry points
  // against the SAME `deps` object a single server process would actually share, and proves the
  // second one — regardless of which caller goes second — is refused before it ever reaches a real
  // provider call, not merely delayed or silently raced.
  //
  // Its own dedicated temp dir (never this file's shared `publishOutputDir`), set directly on
  // `deps.publishOutputRootDir` via `testRouteDeps(runOutputDir)` — see the sibling "concurrent
  // second trigger" test above for why this can no longer be a mid-test `process.env.TOVU_PUBLISH_DIR`
  // mutation (adapter.ts no longer reads env vars at all; the value is resolved once when `deps` is
  // built, so it must be set BEFORE `createApp(deps)`).
  const runOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-publish-cross-path-test-"));
  const deps: RouteDeps = { ...testRouteDeps(runOutputDir) };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const previousVercelToken = process.env.VERCEL_TOKEN;
  process.env.VERCEL_TOKEN = "fake-token-for-cross-path-test-only";

  // Same interception technique as the sibling "concurrent second trigger" test above — only calls to
  // Vercel's real API host are faked; the real export's own real in-process HTTP calls pass through.
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
    rmSync(runOutputDir, { recursive: true, force: true });
  });

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ target: "vercel", projectName: "demo" }),
  });
  assert.equal(trigger.status, 202);
  assert.equal((await trigger.json()).status, "running");

  // Fired immediately, no delay — the HTTP route's own real export against the hermetic fixture is
  // still mid-flight (same real-export-duration race window the sibling test above relies on). Drives
  // the assistant tool's registrations directly against `toolDeps` — a spread of the SAME `deps`
  // object the app above is using, with only `authorize` overridden (this test is about the shared
  // run-slot guard, not permission wiring, which `publish-agent-tools.unit.test.ts` already certifies
  // on its own). `getPublishRunSnapshot`/`startPublishRun`/`runPublishAndAwait` all read/write ONE
  // module-scope slot in `static-publish/publish-run.ts` regardless of which `deps` object a caller
  // passes in, so this still exercises the real shared state a single server process would have.
  const toolDeps = { ...deps, authorize: async () => ({ allowed: true, reason: "matched" }) };
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = new Map(buildStaticPublishRegistrations(toolDeps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
  const executeTool = registrations.get("deployment_execute_static_publish");
  assert.ok(executeTool, "expected 'deployment_execute_static_publish' to be wired");

  const emitted: { payload: { resource: { resource: { text: string } } } }[] = [];
  const pending = executeTool.handler({
    executionId: "exec-cross-path",
    principal: { id: "principal-cross-path" },
    run: { id: "run-cross-path" },
    input: { target: "vercel", projectName: "demo-from-tool" },
    signal: new AbortController().signal,
    emitSurface: async (s) => void emitted.push(s as { payload: { resource: { resource: { text: string } } } }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const html = emitted[0]!.payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  const exchangeId = match[1]!;

  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: "deployment_execute_static_publish", principalId: "principal-cross-path", params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { published: boolean; cancelled: boolean; reason?: string; message?: string };
  assert.equal(result.published, false);
  assert.equal(result.cancelled, false);
  assert.equal(
    result.reason,
    "already-running",
    `expected the tool call to be refused while the HTTP route's own publish was still in flight, got: ${JSON.stringify(result)}`
  );

  let finalStatusBody: { status: string; [key: string]: unknown } = { status: "running" };
  for (let attempt = 0; attempt < 200 && finalStatusBody.status === "running"; attempt++) {
    await delay(20);
    const poll = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}`, { headers: { cookie } });
    finalStatusBody = await poll.json();
  }
  assert.equal(finalStatusBody.status, "errored", `HTTP route's own publish did not settle in time: ${JSON.stringify(finalStatusBody)}`);
  assert.equal(vercelCallCount, 1, "exactly one publish (the HTTP route's own) reached the intercepted Vercel API — the tool's own call never got there");
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
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=vercel`, { headers: { cookie } });
  assert.equal(res.status, 403);
});

test("publish-site preview: a mismatched workspaceId 404s", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${PUBLISH_PATH}/preview?target=vercel`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("publish-site preview: a missing/unrecognized target, and a github-pages preview missing repo, both 400", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const noTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview`, { headers: { cookie } });
  assert.equal(noTarget.status, 400);

  // Same "netlify is now a real target" note as the trigger route's own equivalent case above.
  const badTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=aws-amplify`, { headers: { cookie } });
  assert.equal(badTarget.status, 400);

  const missingRepo = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${PUBLISH_PATH}/preview?target=github-pages&owner=octo`, { headers: { cookie } });
  assert.equal(missingRepo.status, 400);
});

test("publish-site preview: github-pages reports the derived base path and, with no GITHUB_TOKEN configured, credentialsConfigured false — never starting a run", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
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
  const deps: RouteDeps = { ...testRouteDeps() };
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
  const deps: RouteDeps = { ...testRouteDeps() };
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
