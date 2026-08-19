import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "../../app.js";
import { readDockerfileSource, writeDockerfileSource } from "#src/features/deployments/index";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

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
 *
 * ## 2026-08-15 — `If-Match`/`ETag` (Terra audit finding C5)
 *
 * Every PUT test that expects to reach the write now sends a real `If-Match` header, read from a
 * real preceding GET's `ETag` response header — never a hand-typed string standing in for one, so a
 * passing test proves the real header round-trip works, not just that SOME string satisfies a
 * comparison. The new tests below (missing `If-Match`, stale `If-Match`) prove the two failure
 * paths this pass adds; the lost-update test specifically reproduces the race the bug report
 * described — a second writer's real disk write landing between this test's GET and its PUT — not
 * just a mismatched header asserted in isolation.
 */
/** Matches ONLY this route's own content-hash ETag (`dockerfile.ts`'s `computeDockerfileEtag`): a
 *  quoted 64-hex-char sha256 digest, or the literal missing-file sentinel. Deliberately narrower
 *  than "any ETag header is present" — verified live (`node -e` against a bare Express app,
 *  2026-08-15) that Express itself auto-generates an UNRELATED weak ETag
 *  (`W/"7-n4nHQM60bXQYySSnisV5QdXpZSA"`-shaped) for any JSON response that doesn't set one first, so
 *  a looser check would pass on the PRE-FIX route too — which never sets this header at all — purely
 *  because Express's own default filled the gap. That would be a wrong-reason pass on every test
 *  below that reads this helper's return value back as `If-Match`. */
const DOCKERFILE_ETAG_SHAPE = /^("[0-9a-f]{64}"|W\/"missing")$/;

function getEtag(res: Response): string {
  const etag = res.headers.get("ETag");
  assert.ok(etag, "GET must set an ETag response header");
  assert.match(etag, DOCKERFILE_ETAG_SHAPE, "must be the Dockerfile route's OWN content-hash ETag, not Express's unrelated auto-generated one");
  return etag;
}

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

  // A real If-Match, read from a real preceding GET — so this 400 is unambiguously attributable to
  // the malformed BODY, not to the new missing-header path (covered by its own test below).
  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, { headers: { cookie } });
  const ifMatch = getEtag(getRes);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "If-Match": ifMatch },
    body: JSON.stringify({ contents: 42 }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /'contents'/, "the 400 must name the real failure (bad body), not the header");
  assert.deepEqual(readDockerfileSource(), before, "a 400 must never touch the file");
});

test("dockerfile-source: PUT — no 'If-Match' header at all is refused 400 and never writes (strict, not permissive — Terra C5)", async (t) => {
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
    body: JSON.stringify({ contents: "FROM node:20\n" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /If-Match/, "the 400 must name the missing header, not a generic failure");
  assert.deepEqual(readDockerfileSource(), before, "a 400 must never touch the file");
});

test("dockerfile-source: PUT — the seeded owner can overwrite the Dockerfile with a fresh If-Match, and a following GET reflects it (new ETag too)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const before = readDockerfileSource();
  t.after(() => {
    // Restores the checkout's real Dockerfile exactly, whether or not it existed beforehand — see
    // this file's header for why this write target cannot be a fixture path instead.
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  const preGetRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, { headers: { cookie } });
  const ifMatch = getEtag(preGetRes);

  const newContents = `# test-written ${Date.now()}\nFROM node:20-slim\n`;
  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "If-Match": ifMatch },
    body: JSON.stringify({ contents: newContents }),
  });
  assert.equal(putRes.status, 200);
  const putEtag = getEtag(putRes);
  assert.notEqual(putEtag, ifMatch, "a real content change must produce a different ETag");
  const putBody = await putRes.json();
  assert.deepEqual(putBody, { exists: true, contents: newContents }, "the body stays {exists, contents} — the etag travels only via the header");

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, { headers: { cookie } });
  assert.equal(getRes.status, 200);
  assert.equal(getEtag(getRes), putEtag, "the GET right after a PUT must report the SAME ETag the PUT itself just returned");
  const getBody = await getRes.json();
  assert.deepEqual(getBody, { exists: true, contents: newContents }, "a GET right after a PUT must observe the write, not a cache");
});

test("dockerfile-source: PUT — a stale If-Match is refused 412 with the CURRENT contents, and the lost update never happens (Terra C5 regression)", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const before = readDockerfileSource();
  t.after(() => {
    if (before.exists) writeDockerfileSource(before.contents!);
  });

  // Writer A (this test) reads first and gets a real etag for the contents at this moment.
  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, { headers: { cookie } });
  const staleIfMatch = getEtag(getRes);

  // Writer B — a SECOND, independent writer (e.g. the admin UI's own save, or the agent tool)
  // saves a real change to the SAME real file in between Writer A's read and its own write. This is
  // the actual race from the bug report, reproduced with a real second disk write, not a
  // hand-crafted mismatched header standing in for one.
  const concurrentContents = `# writer-B ${Date.now()}\nFROM node:22\n`;
  writeDockerfileSource(concurrentContents);

  // Writer A now tries to save ITS edit, still carrying the etag from before Writer B's write.
  const staleAttemptContents = `# writer-A (should be rejected) ${Date.now()}\nFROM node:18\n`;
  const putRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/dockerfile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json", "If-Match": staleIfMatch },
    body: JSON.stringify({ contents: staleAttemptContents }),
  });
  assert.equal(putRes.status, 412);
  const putBody = await putRes.json();
  assert.equal(putBody.code, "DOCKERFILE_CONFLICT");
  assert.deepEqual(putBody.current, { exists: true, contents: concurrentContents }, "the 412 body must carry what's ACTUALLY on disk, so the caller can reconcile");

  // The whole point: Writer A's stale write must never have landed. Writer B's contents survive.
  const after = readDockerfileSource();
  assert.equal(after.contents, concurrentContents, "a rejected stale write must not overwrite the concurrent writer's real save — this is the lost-update bug itself");
  assert.notEqual(after.contents, staleAttemptContents);
});
