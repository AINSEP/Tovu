import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app.js";

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
