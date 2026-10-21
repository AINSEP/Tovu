import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { PostAutosaveSnapshot } from "#src/features/post/index";
import type { RouteDeps } from "#src/server/routes/types";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";

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

async function createSeedPost(baseUrl: string, cookie: string): Promise<{ id: string; slug: string; version: number }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Autosave fixture" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { post: { id: string; slug: string; version: number } };
  return { id: body.post.id, slug: body.post.slug, version: body.post.version };
}

function autosaveUrl(baseUrl: string, postId: string): string {
  return `${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${postId}/autosave`;
}

test("PUT autosave at the current version applies; GET returns it; DELETE clears it back to null", async (t) => {
  const { baseUrl, cookie, deps } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const savedAt = deps.clock.nowIso();
  deps.clock.nowIso = () => savedAt;
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  const identity = await me.json() as { user: { id: string } };

  const put = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      bodyFormat: "doc",
      title: "Recovered title",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      slug: "recovered-slug",
      baseVersion: post.version,
    }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { applied: true });

  const get = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  assert.equal(get.status, 200);
  const { autosave } = (await get.json()) as { autosave: PostAutosaveSnapshot | null };
  assert.ok(autosave);
  assert.deepEqual(autosave.bodyJson, { type: "doc", content: [{ type: "paragraph" }] });
  assert.equal(autosave.baseVersion, post.version);
  assert.deepEqual(autosave, {
    bodyFormat: "doc", title: "Recovered title", slug: "recovered-slug",
    bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
    baseVersion: post.version, savedAt, savedByPrincipalId: identity.user.id,
  });

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
      title: "Autosave fixture",
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
    body: JSON.stringify({ bodyFormat: "doc", title: "Autosave fixture", slug: "autosave-fixture", baseVersion: post.version }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
});

// ---------------------------------------------------------------------------
// Characterization coverage for `parseAutosaveBody`'s individual branches, added 2026-09-16 ahead
// of splitting it into `parseAutosaveCommonFields` + `parseAutosaveContent` (source-complexity-drift
// ceiling). Each pins one branch's exact current status/body across the refactor. The bodyFormat
// "html" path in particular had NO test at all before this — every existing test above only
// exercises "doc".
// ---------------------------------------------------------------------------

test("PUT autosave with bodyFormat 'html' and a bodyHtml payload applies; GET returns the html back", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const put = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      bodyFormat: "html",
      title: "Autosave fixture",
      bodyHtml: "<p>hello</p>",
      slug: "autosave-fixture",
      baseVersion: post.version,
    }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { applied: true });

  const get = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  const { autosave } = (await get.json()) as { autosave: { bodyHtml: unknown; bodyFormat: string } | null };
  assert.ok(autosave);
  assert.equal(autosave.bodyFormat, "html");
  assert.equal(autosave.bodyHtml, "<p>hello</p>");
});

test("PUT autosave rejects a body with no bodyHtml for bodyFormat 'html' as 400 VALIDATION_ERROR", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "html", title: "Autosave fixture", slug: "autosave-fixture", baseVersion: post.version }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
});

test("PUT autosave rejects an unrecognized bodyFormat value as 400 VALIDATION_ERROR", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      bodyFormat: "markdown",
      title: "Autosave fixture",
      bodyJson: {},
      slug: "autosave-fixture",
      baseVersion: post.version,
    }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
});

test("PUT autosave rejects a missing slug as 400 VALIDATION_ERROR", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", title: "Autosave fixture", bodyJson: {}, baseVersion: post.version }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
});

test("PUT autosave rejects a non-string title as 400 VALIDATION_ERROR", async (t) => {
  const { baseUrl, cookie, deps } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", title: 42, bodyJson: {}, slug: post.slug, baseVersion: post.version }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
  assert.equal(await deps.postRepo.readAutosave({ workspaceId: WS, id: post.id }), null);
});

test("PUT autosave rejects a non-finite baseVersion as 400 VALIDATION_ERROR", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  const res = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", title: "Autosave fixture", bodyJson: {}, slug: "autosave-fixture", baseVersion: "not-a-number" }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
});

test("PUT/GET/DELETE autosave 403 a principal without content.write, matching pages/update-html.ts's own FORBIDDEN shape", async (t) => {
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

  const snapshot = {
    bodyFormat: "doc", title: "Parked draft", bodyJson: { type: "doc", content: [] },
    slug: "parked-draft", baseVersion: post.version,
  };
  const seed = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(snapshot),
  });
  assert.equal(seed.status, 200);
  const before = await deps.postRepo.readAutosave({ workspaceId: WS, id: post.id });
  assert.ok(before);

  const realAuthorize = (deps as RouteDeps).authorize;
  (deps as RouteDeps).authorize = async (params) =>
    params.permission === "content.write" ? { allowed: false, reason: "forced denial for this test" } : realAuthorize(params);

  for (const method of ["PUT", "GET", "DELETE"]) {
    const res = await fetch(autosaveUrl(baseUrl, post.id), {
      method,
      headers: { "content-type": "application/json", cookie },
      ...(method === "PUT" ? { body: JSON.stringify({ ...snapshot, title: "Unauthorized overwrite" }) } : {}),
    });
    assert.equal(res.status, 403, method);
    const body = (await res.json()) as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "content.write");
    assert.deepEqual(await deps.postRepo.readAutosave({ workspaceId: WS, id: post.id }), before, method);
  }
});

test("workspace mismatch in the URL 404s before any autosave read/write", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  for (const method of ["GET", "PUT", "DELETE"]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/posts/${post.id}/autosave`, {
      method, headers: { "content-type": "application/json", cookie },
      ...(method === "PUT" ? { body: JSON.stringify({ bodyFormat: "doc", title: "Wrong workspace", bodyJson: {}, slug: post.slug, baseVersion: post.version }) } : {}),
    });
    assert.equal(res.status, 404, method);
  }
});

test("the URL segment resolves by SLUG, not just id — the admin's own Posts list links to /admin/posts/{slug}", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);

  // PUT through the SLUG-shaped URL a real operator's browser would actually hit.
  const put = await fetch(autosaveUrl(baseUrl, post.slug), {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      bodyFormat: "doc",
      title: "Autosave fixture",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      slug: post.slug,
      baseVersion: post.version,
    }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { applied: true });

  // Reading back through the ID-shaped URL must see the SAME row's draft — proving both URL shapes
  // resolve to one real id, not two independent (and for the slug one, always-empty) targets.
  const getById = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  const { autosave } = (await getById.json()) as { autosave: { bodyJson: unknown } | null };
  assert.ok(autosave);
  assert.deepEqual(autosave.bodyJson, { type: "doc", content: [{ type: "paragraph" }] });

  const del = await fetch(autosaveUrl(baseUrl, post.slug), { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 200);
  const getAfterDelete = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
  assert.deepEqual(await getAfterDelete.json(), { autosave: null });
});

test("TW2 byline parsing preserves absent, null, trimmed and boolean fields and rejects invalid shapes", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createSeedPost(baseUrl, cookie);
  const cases: { fields: Record<string, unknown>; expected: Record<string, unknown> }[] = [
    { fields: {}, expected: {} },
    { fields: { author: null }, expected: { author: null } },
    { fields: { author: "  Ada  ", showAuthor: true }, expected: { author: "Ada", showAuthor: true } },
    { fields: { author: "   ", showAuthor: false }, expected: { author: null, showAuthor: false } },
    { fields: { showAuthor: false }, expected: { showAuthor: false } },
  ];
  for (const { fields, expected } of cases) {
    const response = await fetch(autosaveUrl(baseUrl, post.id), {
      method: "PUT", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ bodyFormat: "doc", bodyJson: {}, title: "Draft", slug: post.slug, baseVersion: post.version, ...fields }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { applied: true });
    const read = await fetch(autosaveUrl(baseUrl, post.id), { headers: { cookie } });
    const { autosave } = await read.json() as { autosave: PostAutosaveSnapshot };
    const byline = Object.fromEntries(Object.entries(autosave).filter(([key]) => key === "author" || key === "showAuthor"));
    assert.deepEqual(byline, expected);
  }
  for (const fields of [{ author: 42 }, { author: {} }, { showAuthor: null }, { showAuthor: "true" }, { author: 42, showAuthor: false }]) {
    const response = await fetch(autosaveUrl(baseUrl, post.id), {
      method: "PUT", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ bodyFormat: "doc", bodyJson: {}, title: "Draft", slug: post.slug, baseVersion: post.version, ...fields }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid autosave body", code: "VALIDATION_ERROR" });
  }
  const response = await fetch(autosaveUrl(baseUrl, post.id), {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", bodyJson: {}, title: "Draft", slug: post.slug, baseVersion: post.version, author: "a".repeat(201) }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "author must be at most 200 characters", code: "VALIDATION_ERROR" });
});

test("an unknown post id/slug falls back to the raw URL segment: PUT reports applied:false, GET null, DELETE ok — never a 404 or 500", async (t) => {
  const { baseUrl, cookie, deps } = await startServer(t);
  const url = autosaveUrl(baseUrl, "no-such-post");

  const put = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bodyFormat: "doc", title: "Ghost", bodyJson: { type: "doc" }, slug: "ghost", baseVersion: 1 }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { applied: false });

  const get = await fetch(url, { headers: { cookie } });
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { autosave: null });

  const del = await fetch(url, { method: "DELETE", headers: { cookie } });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { ok: true });
  assert.equal(await deps.postRepo.readAutosave({ workspaceId: WS, id: "no-such-post" }), null);
});

/** The route's own handler (not `rejectOversizedJsonBody`, which precedes it on PUT) — the LAST
 *  layer of the registered route, pulled straight off Express's router stack the same way
 *  `extractRouteHandler` (`helpers/http-test-server.ts`) does for single-handler routes. */
function lastRouteHandler(app: unknown, method: "get" | "put" | "delete", path: string): (req: unknown, res: unknown) => Promise<unknown> {
  const stack = (app as { _router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: unknown, res: unknown) => Promise<unknown> }> } }> } })._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer?.route, `no ${method} route for ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/** Express guarantees matched `:workspaceId`/`:postId` segments and body-parser always assigns
 *  `req.body`, so each handler's `?? ""`/`?? {}` fallback is only reachable via a hand-built `req`
 *  that deliberately violates those contracts (extractRouteHandler's own doc). */
test("direct invoke: missing params and a missing body fall back safely (404 workspace, 400 body, raw-param no-op reads/clears)", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const app = createApp(deps);
  const path = "/api/admin/v1/workspaces/:workspaceId/posts/:postId/autosave";
  const owner = await deps.userRepo.findByUsername({ workspaceId: WS, username: "admin" });
  assert.ok(owner);
  const principal = await deps.principalRepo.findById({ workspaceId: WS, id: owner.principalId });
  assert.ok(principal);
  const invoke = async (method: "get" | "put" | "delete", req: unknown) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = principal;
    await lastRouteHandler(app, method, path)(req, res);
    return capture;
  };

  for (const method of ["get", "put", "delete"] as const) {
    const capture = await invoke(method, { params: {} });
    assert.equal(capture.statusCode, 404, method);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" }, method);
  }

  const noBody = await invoke("put", { params: { workspaceId: WS } });
  assert.equal(noBody.statusCode, 400);
  assert.deepEqual(noBody.jsonBody, { error: "invalid autosave body", code: "VALIDATION_ERROR" });

  const noPostIdPut = await invoke("put", {
    params: { workspaceId: WS },
    body: { bodyFormat: "html", title: "t", bodyHtml: "<p>x</p>", slug: "s", baseVersion: 1 },
  });
  assert.deepEqual(noPostIdPut.jsonBody, { applied: false });
  assert.deepEqual((await invoke("get", { params: { workspaceId: WS } })).jsonBody, { autosave: null });
  assert.deepEqual((await invoke("delete", { params: { workspaceId: WS } })).jsonBody, { ok: true });
});
