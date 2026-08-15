import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app";
import { readDockerfileSource, writeDockerfileSource } from "#src/features/deployments/dockerfile";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Admin Deployment panel → Dockerfile tab — `GET`/`PUT /api/admin/v1/workspaces/:workspaceId/
 * system/dockerfile`. Same shape as `deployment-overview-route.test.ts`; see that file's header.
 *
 * The "existing Dockerfile" case reads the SAME repo-root file the route itself reads
 * (`join(process.cwd(), "Dockerfile")`) and asserts the response matches it byte-for-byte — this
 * is deliberately coupled to whatever is really on disk (see `readDockerfileSource`'s own doc:
 * `process.cwd()` is the resolution root, same convention `mediaUploadsDir()` already uses), not a
 * fixture. If the real Dockerfile is ever removed, this test's own assertion adapts to that (see
 * the conditional below) rather than asserting a value that could go stale.
 *
 * The PUT success test writes to that SAME real repo-root file (there is nowhere else for it to
 * write — the route accepts no path input at all, by design). It captures the file's real
 * before-state via `readDockerfileSource()` and restores it in `t.after()`, which `node:test` runs
 * even if an assertion above it throws, so a failed run cannot leave the checkout's own Dockerfile
 * mutated.
 */

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-dockerfile-source";
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
    username: "bare-dockerfile-source",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-dockerfile-source", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("dockerfile-source: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    headers: { cookie },
  });
  assert.equal(res.status, 403);
});

test("dockerfile-source: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/dockerfile`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("dockerfile-source: the seeded owner gets 200 with the real repo-root Dockerfile's own bytes, or an honest absence", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  const dockerfilePath = join(process.cwd(), "Dockerfile");
  if (existsSync(dockerfilePath)) {
    assert.equal(body.exists, true);
    assert.equal(body.contents, readFileSync(dockerfilePath, "utf8"));
  } else {
    assert.deepEqual(body, { exists: false, contents: null });
  }
});

test("dockerfile-source: PUT — an unauthorized principal (no grants) gets 403 and never writes", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contents: "FROM node:20\n" }),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(readDockerfileSource(), before, "a 403 must never touch the file");
});

test("dockerfile-source: PUT — a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contents: "FROM node:20\n" }),
  });
  assert.equal(res.status, 404);
});

test("dockerfile-source: PUT — a body with no 'contents' string 400s and never writes", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contents: 42 }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(readDockerfileSource(), before, "a 400 must never touch the file");
});

test("dockerfile-source: PUT — the seeded owner can overwrite the Dockerfile, and a following GET reflects it", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const before = readDockerfileSource();
  t.after(() => {
    // Restores the checkout's real Dockerfile exactly, whether or not it existed beforehand — see
    // this file's header for why this write target cannot be a fixture path instead.
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const newContents = `# test-written ${Date.now()}\nFROM node:20-slim\n`;
  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contents: newContents }),
  });
  assert.equal(putRes.status, 200);
  const putBody = await putRes.json();
  assert.deepEqual(putBody, { exists: true, contents: newContents });

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, { headers: { cookie } });
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.deepEqual(getBody, { exists: true, contents: newContents }, "a GET right after a PUT must observe the write, not a cache");
});
