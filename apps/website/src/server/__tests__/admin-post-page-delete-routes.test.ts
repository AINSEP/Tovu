import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import type { RouteDeps } from "../routes/types.js";
import { extractRouteHandler, createCapturingResponse } from "./helpers/http-test-server.js";

/**
 * @file The human-facing half of the delete feature: `DELETE /posts/:postId` and
 * `DELETE /pages/:pageId`, exercised through a real HTTP server against the real composition root
 * — the same harness `packet-one-routes.test.ts` uses, no mocking of the route stack.
 *
 * These are the routes the `content_post_delete` agent-tool mirrors, so what is certified here is
 * that a human clicking Delete and an agent's human-confirmed delete reach identical domain code.
 */

const WS = "workspace-local";

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const server = createServer(createApp());
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

  return { baseUrl, cookie };
}

/** Same as {@link startServer}, but also hands back the real `RouteDeps` the app was built from --
 *  needed by the coverage-gap tests below that monkey-patch `authorize`/`changeSets.insert` to
 *  force the `pages/delete.ts` route's ForbiddenError/rollback/500 branches, which no fixture data
 *  alone can reach. */
async function startServerWithDeps(t: { after: (fn: () => Promise<void>) => void }): Promise<{ baseUrl: string; cookie: string; deps: RouteDeps }> {
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

  return { baseUrl, cookie, deps };
}

async function createRow(
  baseUrl: string,
  cookie: string,
  surface: "posts" | "pages",
  body: Record<string, unknown>
): Promise<{ id: string }> {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  // Read the body ONCE — `assert`'s message argument is evaluated eagerly, so `await
  // response.text()` inline would consume the stream before `response.json()` could.
  const raw = await response.text();
  assert.equal(response.status, 201, `creating a ${surface} fixture failed: ${raw}`);
  return { id: (JSON.parse(raw) as { post: { id: string } }).post.id };
}

test("POST post: reusing an Idempotency-Key returns DUPLICATE_COMMAND", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const request = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "Idempotency-Key": "post-create-idempotency-retry",
    },
    body: JSON.stringify({ title: "Idempotent post" }),
  };

  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, request);
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.ok(body.changeSetId);
});

test("POST page: reusing an Idempotency-Key returns DUPLICATE_COMMAND", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const request = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "Idempotency-Key": "page-create-idempotency-retry",
    },
    body: JSON.stringify({ title: "Idempotent page" }),
  };

  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages`, request);
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.ok(body.changeSetId);
});

test("DELETE post: trashes the row, which then 404s and vanishes from the list", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "posts", { title: "Doomed Post", status: "published" });

  const deleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { method: "DELETE", headers: { cookie } });
  const deletedRaw = await deleted.text();
  assert.equal(deleted.status, 200, deletedRaw);
  const body = JSON.parse(deletedRaw) as { post: { id: string; version: number } };
  assert.equal(body.post.id, id);
  assert.equal(body.post.version, 2, "a trash advances the version");

  const fetched = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { headers: { cookie } });
  assert.equal(fetched.status, 404, "a trashed post must 404 on read");

  const listed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, { headers: { cookie } });
  const { posts } = (await listed.json()) as { posts: Array<{ id: string }> };
  assert.equal(posts.some((p) => p.id === id), false, "a trashed post must not appear in the admin list");
});

test("DELETE post: a trashed PUBLISHED post disappears from the public content route too", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "posts", { title: "Public Post", slug: "public-post", status: "published" });

  const before = await fetch(`${baseUrl}/api/content/v1/workspaces/${WS}/posts/public-post`);
  assert.equal(before.status, 200, "sanity: the fixture is publicly visible before the delete");

  await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { method: "DELETE", headers: { cookie } });

  const after = await fetch(`${baseUrl}/api/content/v1/workspaces/${WS}/posts/public-post`);
  assert.equal(after.status, 404, "a trashed post must leave the public site immediately");
});

test("DELETE post: deleting twice 404s the second time (a trashed row is not-found)", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "posts", { title: "Twice" });

  assert.equal((await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { method: "DELETE", headers: { cookie } })).status, 200);
  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(second.status, 404);
  assert.equal(((await second.json()) as { code: string }).code, "ENTRY_NOT_FOUND");
});

test("DELETE post: an unknown id 404s, and an unknown workspace 404s", async (t) => {
  const { baseUrl, cookie } = await startServer(t);

  const unknownId = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/no-such-post`, { method: "DELETE", headers: { cookie } });
  assert.equal(unknownId.status, 404);

  const unknownWs = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-a-workspace/posts/post-home`, { method: "DELETE", headers: { cookie } });
  assert.equal(unknownWs.status, 404);
});

test("DELETE post: requires an admin session", async (t) => {
  const { baseUrl } = await startServer(t);
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/post-home`, { method: "DELETE" });
  assert.equal(response.status === 401 || response.status === 403, true, `expected an auth rejection, got ${response.status}`);
});

test("DELETE page: trashes a page and removes it from the pages list", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "pages", { title: "Doomed Page" });

  const deleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(deleted.status, 200, `delete failed with ${deleted.status}`);

  const listed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages`, { headers: { cookie } });
  const { posts } = (await listed.json()) as { posts: Array<{ id: string }> };
  assert.equal(posts.some((p) => p.id === id), false);
});

test("DELETE page: a kind:'post' id 404s through the /pages surface (kind guard, indistinguishable from not-found)", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "posts", { title: "A Post, Not A Page" });

  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { code: string }).code, "ENTRY_NOT_FOUND");

  // And the post itself must be untouched by the refused call.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { headers: { cookie } });
  assert.equal(stillThere.status, 200, "the refused pages-surface delete must not have trashed the post");
});

test("DELETE post: the delete is REVERSIBLE — reverting its change set restores the row", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "posts", { title: "Recoverable", slug: "recoverable", status: "published" });

  await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { method: "DELETE", headers: { cookie } });
  assert.equal((await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { headers: { cookie } })).status, 404);

  // Find the change set the delete recorded.
  const listed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets`, { headers: { cookie } });
  const listedRaw = await listed.text();
  assert.equal(listed.status, 200, listedRaw);
  const { changeSets } = JSON.parse(listedRaw) as { changeSets: Array<{ id: string; summary: string }> };
  const deleteChangeSet = changeSets.find((c) => c.summary === `Delete post ${id}`);
  assert.ok(deleteChangeSet, `no change set recorded the delete; saw ${JSON.stringify(changeSets.map((c) => c.summary))}`);

  const reverted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/${deleteChangeSet.id}/revert`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
  });
  assert.equal(reverted.status, 200, `revert failed with ${reverted.status}`);

  // The whole point of choosing a SOFT delete: the row comes back, intact.
  const restored = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { headers: { cookie } });
  const restoredRaw = await restored.text();
  assert.equal(restored.status, 200, `reverting the delete change set must restore the post; got ${restoredRaw}`);
  const payload = JSON.parse(restoredRaw) as { post: { title: string; slug: string; status: string } };
  assert.equal(payload.post.title, "Recoverable", "the restore must be lossless");
  assert.equal(payload.post.slug, "recoverable");
  assert.equal(payload.post.status, "published");
});

test("DELETE page: a workspace id that is not this site's is 404, before any command runs", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "pages", { title: "Wrong Workspace Target" });

  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-a-workspace/pages/${id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "workspace was not found");

  // And the page itself must be untouched.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { headers: { cookie } });
  assert.equal(stillThere.status, 200, "a mismatched-workspace delete must not have trashed the page");
});

test("DELETE page: reusing an Idempotency-Key on the delete route itself returns DUPLICATE_COMMAND", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createRow(baseUrl, cookie, "pages", { title: "Delete Twice Same Key" });

  const request = { method: "DELETE" as const, headers: { cookie, "Idempotency-Key": "page-delete-idempotency-retry" } };
  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, request);
  assert.equal(first.status, 200, await first.text());

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.ok(body.changeSetId);
});

test("DELETE page: denies 403 FORBIDDEN when authorize() rejects content.write", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const { id } = await createRow(baseUrl, cookie, "pages", { title: "Forbidden Target" });

  const originalAuthorize = deps.authorize;
  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });
  try {
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { method: "DELETE", headers: { cookie } });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { code: string; details: { permission: string; reason: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.deepEqual(body.details, { permission: "content.write", reason: "test_denied" });
  } finally {
    deps.authorize = originalAuthorize;
  }

  // The refused call must not have trashed the page.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { headers: { cookie } });
  assert.equal(stillThere.status, 200);
});

test("DELETE page: a change-set record failure AFTER the mutation applied is rolled back (the page is NOT left trashed) and surfaces as a 500", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const { id } = await createRow(baseUrl, cookie, "pages", { title: "Rollback Target", status: "published" });

  const originalInsert = deps.changeSets.insert.bind(deps.changeSets);
  deps.changeSets.insert = async () => {
    throw new Error("simulated change-set persistence failure");
  };
  try {
    const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { method: "DELETE", headers: { cookie } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal error" });
  } finally {
    deps.changeSets.insert = originalInsert;
  }

  // INV-01 (no mutation without a record): the compensating rollback must have restored the page,
  // not left it trashed with no audit trail.
  const afterRollback = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}`, { headers: { cookie } });
  assert.equal(afterRollback.status, 200, "a failed change-set record must roll the delete back, not leave the page trashed");
  const restored = (await afterRollback.json()) as { post: { status: string } };
  assert.equal(restored.post.status, "published", "the rollback must restore the exact pre-delete row");
});

test("DELETE page: req.params.pageId is always populated by Express for a matched route (defensive ?? \"\" fallback is unreachable through real HTTP)", async () => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  await deps.identityReady;
  // `getAuthedPrincipal` normally runs behind `requireAdminSession`, which `extractRouteHandler`
  // bypasses -- stand in with the REAL seeded owner principal (not a made-up id) so `authorize()`
  // actually grants `content.write` and the handler proceeds past auth into the command, the same
  // way it would for a real authenticated request.
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "delete", "/api/admin/v1/workspaces/:workspaceId/pages/:pageId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  // A hand-built req that violates Express's own routing contract on purpose (see
  // `extractRouteHandler`'s doc) -- `params.pageId` omitted -- so the `?? ""` fallback actually
  // executes, resolving to an id no page has -- `deletePost`'s ordinary not-found 404.
  await handler({ params: { workspaceId: WS }, get: () => undefined }, res);

  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code: string }).code, "ENTRY_NOT_FOUND");
});

test("DELETE page: req.params.workspaceId is likewise always populated by Express (its own ?? \"\" fallback is equally unreachable through real HTTP)", async () => {
  const app = createApp();
  const handler = extractRouteHandler(app, "delete", "/api/admin/v1/workspaces/:workspaceId/pages/:pageId");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {}, get: () => undefined }, res);

  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
