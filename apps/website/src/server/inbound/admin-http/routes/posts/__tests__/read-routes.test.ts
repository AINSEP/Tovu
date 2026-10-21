import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file The two admin post READ routes — `GET .../posts` (`routes/posts/list.ts`) and
 * `GET .../posts/:postId` (`routes/posts/get-by-id.ts`): workspace scoping, the generic 500 that
 * leaks no repository internals, and the defensive `req.params` fallbacks. Real composition root,
 * same harness `autosave.test.ts` uses.
 */

const WS = "workspace-local";
const LIST_PATH = "/api/admin/v1/workspaces/:workspaceId/posts";
const GET_PATH = "/api/admin/v1/workspaces/:workspaceId/posts/:postId";

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
  const get = (path: string) => fetch(`${baseUrl}${path}`, { headers: { cookie } });
  return { deps, get };
}

test("post read routes: a workspace that is not this site's 404s on both list and get-by-id", async (t) => {
  const { get } = await startServer(t);
  for (const path of ["/api/admin/v1/workspaces/other-ws/posts", "/api/admin/v1/workspaces/other-ws/posts/post-home"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: "workspace was not found" }, path);
  }
});

test("post read routes: a repository failure is a generic 500 on both routes, never the underlying message", async (t) => {
  const { deps, get } = await startServer(t);
  const boom = async () => {
    throw new Error("sqlite: database disk image is malformed");
  };
  deps.postRepo.list = boom;
  deps.postRepo.findBySlug = boom;

  const list = await get(`/api/admin/v1/workspaces/${WS}/posts`);
  assert.equal(list.status, 500);
  assert.deepEqual(await list.json(), { error: "internal error" });

  const one = await get(`/api/admin/v1/workspaces/${WS}/posts/post-home`);
  assert.equal(one.status, 500);
  assert.deepEqual(await one.json(), { error: "internal error" });
});

/** Express guarantees matched `:workspaceId`/`:postId` segments, so each `?? ""` fallback is only
 *  reachable through a hand-built `req` (extractRouteHandler's own doc). */
test("post read routes (direct invoke): missing :workspaceId 404s both routes; a missing :postId is an ordinary not-found", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const app = createApp(deps);
  const owner = await deps.userRepo.findByUsername({ workspaceId: WS, username: "admin" });
  assert.ok(owner);
  const principal = await deps.principalRepo.findById({ workspaceId: WS, id: owner.principalId });
  assert.ok(principal);

  for (const path of [LIST_PATH, GET_PATH]) {
    const { res, capture } = createCapturingResponse();
    await extractRouteHandler(app, "get", path)({ params: {} }, res);
    assert.equal(capture.statusCode, 404, path);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" }, path);
  }

  const { res, capture } = createCapturingResponse();
  res.locals.principal = principal;
  await extractRouteHandler(app, "get", GET_PATH)({ params: { workspaceId: WS } }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "post '' was not found" });
});
