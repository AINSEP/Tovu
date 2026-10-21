import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { lastRouteHandler } from "#src/server/__tests__/helpers/last-route-handler";

/**
 * @file `POST /api/admin/v1/workspaces/:workspaceId/posts` (`routes/posts/create.ts`) — the error
 * envelope per thrown type and the defensive param/body fallbacks. Real composition root
 * (`createApp`/`createRouteDeps`), same harness `autosave.test.ts` uses.
 */

const WS = "workspace-local";
const PATH = "/api/admin/v1/workspaces/:workspaceId/posts";

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const create = (body: unknown, workspaceId = WS, extraHeaders: Record<string, string> = {}) =>
    fetch(`${baseUrl}/api/admin/v1/workspaces/${workspaceId}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...extraHeaders },
      body: JSON.stringify(body),
    });
  return { deps, create };
}

test("create post: a workspace mismatch in the URL 404s before anything is written", async (t) => {
  const { deps, create } = await startServer(t);
  const res = await create({ title: "Wrong workspace" }, "some-other-workspace");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
  const { posts } = { posts: await deps.postRepo.list({ workspaceId: WS }) };
  assert.equal(posts.some((p) => p.title === "Wrong workspace"), false);
});

test("create post: a caller denied content.write by the gateway gets 403 FORBIDDEN with the permission and reason", async (t) => {
  const { deps, create } = await startServer(t);
  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });
  const res = await create({ title: "Denied" });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.deepEqual(body.details, { permission: "content.write", reason: "test_denied" });
});

test("create post: a slug already taken is a 409 SLUG_CONFLICT", async (t) => {
  const { create } = await startServer(t);
  const first = await create({ title: "One", slug: "taken-slug" });
  assert.equal(first.status, 201);
  const second = await create({ title: "Two", slug: "taken-slug" });
  assert.equal(second.status, 409);
  assert.equal(((await second.json()) as { code: string }).code, "SLUG_CONFLICT");
});

test("create post: an unexpected repository failure is a generic 500 that leaks no internals", async (t) => {
  const { deps, create } = await startServer(t);
  deps.postRepo.save = async () => {
    throw new Error("disk full at /var/secret/path");
  };
  const res = await create({ title: "Boom" });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});

test("create post: a body without a title creates an \"Untitled\" draft (the route's `?? \"\"` default, then createPost's own), not a 400", async (t) => {
  const { create } = await startServer(t);
  const res = await create({});
  assert.equal(res.status, 201);
  assert.equal(((await res.json()) as { post: { title: string } }).post.title, "Untitled");
});

test("create post: an invalid field (a non-string author) is a 400 VALIDATION_ERROR", async (t) => {
  const { create } = await startServer(t);
  const res = await create({ title: "Bad byline", author: 42 });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "author must be a string or null", code: "VALIDATION_ERROR" });
});

test("create post: replaying an Idempotency-Key is a 409 DUPLICATE_COMMAND naming the original change set", async (t) => {
  const { create } = await startServer(t);
  const headers = { "Idempotency-Key": "create-once" };
  const first = await create({ title: "Once" }, WS, headers);
  assert.equal(first.status, 201);
  const replay = await create({ title: "Once" }, WS, headers);
  assert.equal(replay.status, 409);
  const body = (await replay.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.equal(typeof body.changeSetId, "string");
  assert.ok(body.changeSetId.length > 0);
});

/** Express guarantees a matched `:workspaceId` and body-parser always assigns `req.body`, so the
 *  `?? ""` / `req.body?.` fallbacks are only reachable via a hand-built `req` (see
 *  `helpers/last-route-handler.ts`). */
test("create post (direct invoke): a missing :workspaceId 404s; a body-less request creates an \"Untitled\" draft", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const app = createApp(deps);
  const owner = await deps.userRepo.findByUsername({ workspaceId: WS, username: "admin" });
  assert.ok(owner);
  const principal = await deps.principalRepo.findById({ workspaceId: WS, id: owner.principalId });
  assert.ok(principal);
  const handler = lastRouteHandler(app, "post", PATH);

  const noWorkspace = createCapturingResponse();
  await handler({ params: {}, get: () => undefined }, noWorkspace.res);
  assert.equal(noWorkspace.capture.statusCode, 404);
  assert.deepEqual(noWorkspace.capture.jsonBody, { error: "workspace was not found" });

  const noBody = createCapturingResponse();
  noBody.res.locals.principal = principal;
  await handler({ params: { workspaceId: WS }, get: () => undefined }, noBody.res);
  assert.equal(noBody.capture.statusCode, 201);
  const created = noBody.capture.jsonBody as { post: { title: string; status: string } };
  assert.equal(created.post.title, "Untitled");
  assert.equal(created.post.status, "draft");
});
