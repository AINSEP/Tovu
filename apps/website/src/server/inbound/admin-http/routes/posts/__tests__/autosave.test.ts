import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file HTTP surface for standing-draft autosave (2026-09-06 dispatch) — PUT/GET/DELETE
 * `/api/admin/v1/workspaces/:workspaceId/posts/:postId/autosave`, registered kind-blind (see
 * `routes/posts/autosave.ts`'s own header). Real composition root (`createApp`/`createRouteDeps`),
 * same harness `posts/__tests__/update.test.ts` uses — no real `content.db` is touched (the
 * hermetic root opens its own throwaway store).
 */

const WS = "workspace-local";

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

  return { baseUrl, cookie, deps };
}

async function createSeedPost(baseUrl: string, cookie: string): Promise<{ id: string; version: number }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Autosave fixture" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { post: { id: string; version: number } };
  return { id: body.post.id, version: body.post.version };
}

function autosaveUrl(baseUrl: string, postId: string): string {
  return `${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${postId}/autosave`;
}

test("PUT autosave at the current version applies; GET returns it; DELETE clears it back to null", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const put = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      bodyFormat: "doc",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      slug: "autosave-fixture",
      baseVersion: post.version,
    }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { applied: true });

  const get = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  assert.equal(get.status, 200);
  const { autosave } = (await get.json()) as { autosave: { bodyJson: unknown; baseVersion: number } | null };
  assert.ok(autosave);
  assert.deepEqual(autosave.bodyJson, { type: "doc", content: [{ type: "paragraph" }] });
  assert.equal(autosave.baseVersion, post.version);

  const del = await fetch(autosaveUrl(baseUrl, post.id), { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { ok: true });

  const getAfterDelete = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  assert.deepEqual(await getAfterDelete.json(), { autosave: null });
});

test("a late PUT carrying a stale baseVersion (a real save landed first) reports applied:false and never overwrites the newer save's own concern", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  // A real Save (bumps `version`), simulating the exact ordering `PostRepoPort.writeAutosave`'s
  // doc names: the row's version moves out from under a caller still holding the old one.
  const realSave = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Autosave fixture",
      slug: "autosave-fixture",
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "real save" }] }] },
      status: "draft",
    }),
  });
  assert.equal(realSave.status, 200);

  // A late autosave tick, still carrying the id-load-time baseVersion, arrives after that save.
  const staleAutosave = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      bodyFormat: "doc",
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "STALE" }] }] },
      slug: "autosave-fixture",
      baseVersion: post.version,
    }),
  });
  assert.equal(staleAutosave.status, 200);
  assert.deepEqual(await staleAutosave.json(), { applied: false });

  const get = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  assert.deepEqual(await get.json(), { autosave: null });
});

test("PUT autosave rejects a body with no bodyJson for bodyFormat 'doc' as 400 VALIDATION_ERROR", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", slug: "autosave-fixture", baseVersion: post.version }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
});

test("PUT autosave 403s a principal without content.write, matching pages/update-html.ts's own FORBIDDEN shape", async (t) => {
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
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const post = await createSeedPost(baseUrl, cookie);

  const realAuthorize = (deps as RouteDeps).authorize;
  (deps as RouteDeps).authorize = async (params) =>
    params.permission === "content.write" ? { allowed: false, reason: "forced denial for this test" } : realAuthorize(params);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", bodyJson: {}, slug: "autosave-fixture", baseVersion: post.version }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("workspace mismatch in the URL 404s before any autosave read/write", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/posts/${post.id}/autosave`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});
