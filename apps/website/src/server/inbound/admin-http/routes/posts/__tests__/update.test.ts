import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type express from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Coverage-gap fill for `posts/update.ts` — `sendPostUpdateError`'s five named-error
 * branches plus its default 500, the id-vs-slug resolution path, and the compensating rollback,
 * none of which `packet-one-routes.test.ts`'s single happy-path PUT (by id, no errors, no
 * idempotency replay) reaches. Mirrors `admin-post-page-delete-routes.test.ts`'s real-HTTP,
 * real-composition-root harness — same seeded workspace (`workspace-local`), same
 * `startServerWithDeps` pattern for the two branches ordinary fixture data cannot reach
 * (ForbiddenError, and the change-set-insert-failure rollback).
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

/** Same as {@link startServer}, but also hands back the real `RouteDeps` — needed by the tests
 *  below that monkey-patch `authorize`/`changeSets.insert`/`postRepo` to force branches no fixture
 *  data alone can reach (mirrors `admin-post-page-delete-routes.test.ts`'s identical helper). */
async function startServerWithDeps(t: { after: (fn: () => Promise<void>) => void }): Promise<{ baseUrl: string; cookie: string; deps: RouteDeps; app: express.Express }> {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const server = createServer(app);
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

  return { baseUrl, cookie, deps, app };
}

/** Express's own (internal, untyped) per-route layer shape -- reaching in to call the real
 *  registered handler directly, past `rejectOversizedJsonBody` (the middleware mounted ahead of
 *  it on this exact route), the same technique `forms-submit.ts`'s own `?? {}`-fallback test uses
 *  for its own two-handler route. Filters by method as well as path -- `get-by-id.ts` and
 *  `delete.ts` register GET/DELETE on this exact same path string, as separate `route` layers
 *  each holding only their own method's handler, so path alone is ambiguous (matches
 *  `extractRouteHandler`'s own `helpers/http-test-server.ts` doc/implementation). */
interface ExpressHandlerLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: unknown, res: unknown) => unknown }[] };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}
function extractLastHandler(app: express.Express, method: "get" | "put" | "post" | "delete", path: string): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`extractLastHandler: no ${method.toUpperCase()} route registered for path "${path}"`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function capturingResponse(): { res: { status(code: number): unknown; json(body: unknown): unknown }; statusCode: () => number | undefined; jsonBody: () => unknown } {
  let statusCode: number | undefined;
  let jsonBody: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
  };
  return { res, statusCode: () => statusCode, jsonBody: () => jsonBody };
}

async function createPost(baseUrl: string, cookie: string, body: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  assert.equal(res.status, 201, `creating a post fixture failed: ${raw}`);
  const parsed = JSON.parse(raw) as { post: { id: string; slug: string } };
  return { id: parsed.post.id, slug: parsed.post.slug };
}

const VALID_BODY_JSON = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] };

test("PUT posts/:postId resolves the URL param via slug, not just id (the 2026-08-10 slug-URL feature)", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { slug } = await createPost(baseUrl, cookie, { title: "Slug Target", slug: "slug-target" });
  assert.equal(slug, "slug-target");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${slug}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Renamed via slug URL", slug: "slug-target", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw) as { post: { title: string } };
  assert.equal(body.post.title, "Renamed via slug URL");
});

test("PUT posts/:postId 404s for a wrong workspace id", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Workspace Check" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/posts/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "X", slug: "x", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 404);
});

test("PUT posts/:postId 404 PostNotFoundError for an id/slug that resolves to nothing — the getAdminPostByIdOrSlug-miss fallback path", async (t) => {
  const { baseUrl, cookie } = await startServer(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/does-not-exist-anywhere`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "X", slug: "x", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /was not found/);
});

test("PUT posts/:postId 400 PostValidationError for a blank title", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Has A Title" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "   ", slug: "has-a-title", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /title is required/);
});

test("PUT posts/:postId 400 PostValidationError when 'title' is omitted from the body entirely (not just blank) — parsePostUpdateBody's own `body.title ?? \"\"` default", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id, slug } = await createPost(baseUrl, cookie, { title: "Has A Title Too" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    // 'title' key genuinely absent, not merely blank — distinct code path from the whitespace-title
    // test above (`body.title ?? ""` has to fall back to its default here).
    body: JSON.stringify({ slug, bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /title is required/);
});

test("PUT posts/:postId 400 for a malformed slug when 'slug' is omitted from the body entirely — parsePostUpdateBody's `body.slug ?? \"\"` default", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Has A Slug Too" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Has A Slug Too", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /slug must use lowercase/);
});

test("PUT posts/:postId 409 PostConflictError for a slug already taken by a different post", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  await createPost(baseUrl, cookie, { title: "Taken", slug: "taken-slug" });
  const { id: secondId } = await createPost(baseUrl, cookie, { title: "Other", slug: "other-slug" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${secondId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Other", slug: "taken-slug", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /already exists/);
});

test("PUT posts/:postId reusing an Idempotency-Key returns DUPLICATE_COMMAND", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id, slug } = await createPost(baseUrl, cookie, { title: "Idempotent Update Target" });

  const request = {
    method: "PUT" as const,
    headers: { "content-type": "application/json", cookie, "Idempotency-Key": "post-update-idempotency-retry" },
    body: JSON.stringify({ title: "Idempotent Update Target", slug, bodyJson: VALID_BODY_JSON, status: "draft" }),
  };
  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, request);
  assert.equal(first.status, 200, await first.text());

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.ok(body.changeSetId);
});

test("PUT posts/:postId denies 403 FORBIDDEN when authorize() rejects content.write", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const { id, slug } = await createPost(baseUrl, cookie, { title: "Forbidden Update Target" });

  const originalAuthorize = deps.authorize;
  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });
  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Should not apply", slug, bodyJson: VALID_BODY_JSON, status: "draft" }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.deepEqual(body.details, { permission: "content.write", reason: "test_denied" });
  } finally {
    deps.authorize = originalAuthorize;
  }

  // The refused call must not have applied.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, { headers: { cookie } });
  const stillThereBody = (await stillThere.json()) as { post: { title: string } };
  assert.equal(stillThereBody.post.title, "Forbidden Update Target");
});

test("PUT posts/:postId: a change-set record failure AFTER the mutation applied is rolled back (title/slug/ext restored exactly) and surfaces as a 500 (sendPostUpdateError's default branch)", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const { id, slug } = await createPost(baseUrl, cookie, { title: "Rollback Target", slug: "rollback-target" });

  // Seed a plugin `ext` namespace directly on the row, pre-edit — exercises captureInverse's
  // `priorPost.ext !== undefined` TRUE branch (every other test's post has no ext at all) and
  // proves the rollback restores it, not just the core fields.
  const before = await deps.postRepo.findById({ workspaceId: WS, id });
  assert.ok(before);
  await deps.postRepo.save({ ...before, ext: { "some-plugin": { note: "pre-edit value" } } });

  const originalInsert = deps.changeSets.insert.bind(deps.changeSets);
  deps.changeSets.insert = async () => {
    throw new Error("simulated change-set persistence failure");
  };
  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Should be rolled back", slug, bodyJson: VALID_BODY_JSON, status: "published" }),
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal error" });
  } finally {
    deps.changeSets.insert = originalInsert;
  }

  // INV-01 (no mutation without a record): the compensating rollback must have restored the post
  // to its exact pre-edit state, ext bag included — not left it on the failed edit's new title.
  const restored = await deps.postRepo.findById({ workspaceId: WS, id });
  assert.ok(restored);
  assert.equal(restored.title, "Rollback Target", "the rollback must restore the exact pre-edit title");
  assert.equal(restored.status, "draft", "the rollback must restore the exact pre-edit status");
  assert.deepEqual(restored.ext, { "some-plugin": { note: "pre-edit value" } }, "the rollback must restore the exact pre-edit ext bag");
});

/**
 * `req.params.workspaceId ?? ""` / `req.params.postId ?? ""` / `parsePostUpdateBody`'s own
 * `(rawBody ?? {})` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): Express
 * guarantees a matched `:param` is always populated, and real `body-parser` always assigns
 * `req.body`, so the right side of every `??` below is unreachable through any real HTTP request.
 * Restored 2026-09-03 after being wrongly deleted as "unreachable dead code" -- the repo's
 * established answer is to KEEP the guard and exercise it with a hand-built `req` that
 * deliberately violates those contracts.
 */
test("PUT posts/:postId: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call", async (t) => {
  const { app } = await startServerWithDeps(t);
  const handler = extractLastHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/posts/:postId");
  const { res, statusCode, jsonBody } = capturingResponse();

  await handler({ params: {}, body: {} }, res);

  assert.equal(statusCode(), 404);
  assert.equal((jsonBody() as { error: string }).error, "workspace was not found");
});

test("PUT posts/:postId: `req.params.postId ?? \"\"` fallback, forced via a direct handler call past auth with a real seeded principal", async (t) => {
  const { deps, app } = await startServerWithDeps(t);
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractLastHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/posts/:postId");
  const { res, statusCode } = capturingResponse();
  (res as unknown as { locals: Record<string, unknown> }).locals = { principal: ownerPrincipal };

  await handler({ params: { workspaceId: WS }, body: { title: "X", slug: "x", bodyJson: VALID_BODY_JSON, status: "draft" }, get: () => undefined }, res);

  // An empty postId resolves nothing via getAdminPostByIdOrSlug, falls back to the raw "" param,
  // and the command gateway's own captureInverse finds no post -- the ordinary not-found path.
  assert.equal(statusCode(), 404);
});

test("PUT posts/:postId: `parsePostUpdateBody`'s `(rawBody ?? {})` fallback, forced via a direct handler call with req.body omitted entirely, against a real post", async (t) => {
  const { baseUrl, cookie, deps, app } = await startServerWithDeps(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Body Fallback Target" });

  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractLastHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/posts/:postId");
  const { res, statusCode, jsonBody } = capturingResponse();
  (res as unknown as { locals: Record<string, unknown> }).locals = { principal: ownerPrincipal };

  // No `body` key at all -> `(rawBody ?? {})` fallback; every parsed field then reads as omitted
  // (`body.title ?? ""`, etc.), which is a blank title -> PostValidationError, proof the fallback
  // produced a real object rather than throwing on a property access of `undefined`.
  await handler({ params: { workspaceId: WS, postId: id }, get: () => undefined }, res);

  assert.equal(statusCode(), 400);
  assert.match((jsonBody() as { error: string }).error, /title is required/);
});

/* ------------------------------------------------------------------------------------------------
 * Optimistic concurrency (2026-09-06) — `expectedVersion` wired through this route.
 *
 * `be45461e` added the guard to `updatePost` itself but left it inert: `parsePostUpdateBody` never
 * forwarded the field, so two operators editing the same post still silently clobbered each other.
 * These tests drive the real HTTP surface, so they fail if the route stops forwarding the value
 * even while the domain guard itself stays correct.
 * ---------------------------------------------------------------------------------------------- */

/** One PUT against this route, returning the parsed envelope alongside the status — the version
 *  tests all need to read `post.version` / `code` off the body, which the existing helpers above
 *  (shaped for status-only assertions) do not hand back. */
async function putPost(
  baseUrl: string,
  cookie: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  return { status: res.status, body: JSON.parse(raw) as Record<string, unknown> };
}

/** The current server-side row, read back through the real GET route — the only way to prove a
 *  rejected save left NOTHING behind rather than merely returning an error after writing. */
async function getPost(baseUrl: string, cookie: string, id: string): Promise<{ title: string; version: number }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${encodeURIComponent(id)}`, { headers: { cookie } });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  return (JSON.parse(raw) as { post: { title: string; version: number } }).post;
}

test("PUT posts/:postId 409 VERSION_CONFLICT: a second operator's save built on a superseded version is rejected, and does not land", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Shared Post", slug: "shared-post" });

  // Both operators loaded the row at this version.
  const loaded = await getPost(baseUrl, cookie, id);

  // Operator A saves first, from the shared basis. Asserted, not assumed: if this PUT did not
  // actually advance the row's version, the conflict assertion below would be meaningless.
  const first = await putPost(baseUrl, cookie, id, {
    title: "Operator A's document",
    slug: "shared-post",
    bodyJson: VALID_BODY_JSON,
    status: "draft",
    expectedVersion: loaded.version,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal((first.body.post as { version: number }).version, loaded.version + 1);

  // Operator B saves from the SAME, now-superseded basis. Before this wiring this PUT returned 200
  // and erased A's document.
  const second = await putPost(baseUrl, cookie, id, {
    title: "Operator B's document",
    slug: "shared-post",
    bodyJson: VALID_BODY_JSON,
    status: "draft",
    expectedVersion: loaded.version,
  });
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(second.body.code, "VERSION_CONFLICT");
  assert.equal(
    second.body.error,
    `post '${id}' was modified by another save (expected version ${loaded.version}, current version ${loaded.version + 1})`
  );
  assert.deepEqual(second.body.details, { expectedVersion: loaded.version, currentVersion: loaded.version + 1 });

  // The rejection is a rejection, not a report: A's document is still what is stored.
  const after = await getPost(baseUrl, cookie, id);
  assert.equal(after.title, "Operator A's document");
  assert.equal(after.version, loaded.version + 1);
});

test("PUT posts/:postId 409 slug-uniqueness keeps its ORIGINAL code-less shape — a client can tell the two 409s apart", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  await createPost(baseUrl, cookie, { title: "Occupied", slug: "occupied-slug" });
  const { id } = await createPost(baseUrl, cookie, { title: "Mover", slug: "mover-slug" });
  const loaded = await getPost(baseUrl, cookie, id);

  // A CURRENT expectedVersion, so the only thing wrong with this save is the slug — proof the two
  // 409 branches are ordered correctly and that adding the version branch did not reshape this one.
  const res = await putPost(baseUrl, cookie, id, {
    title: "Mover",
    slug: "occupied-slug",
    bodyJson: VALID_BODY_JSON,
    status: "draft",
    expectedVersion: loaded.version,
  });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.error, "slug 'occupied-slug' already exists");
  assert.equal(res.body.code, undefined, "a slug conflict must NOT carry VERSION_CONFLICT's code");
  assert.equal(res.body.details, undefined);
});

test("PUT posts/:postId 200 when expectedVersion matches — the value is forwarded, not merely accepted and dropped", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Fresh Basis", slug: "fresh-basis" });
  const loaded = await getPost(baseUrl, cookie, id);

  const res = await putPost(baseUrl, cookie, id, {
    title: "Fresh Basis Edited",
    slug: "fresh-basis",
    bodyJson: VALID_BODY_JSON,
    status: "draft",
    expectedVersion: loaded.version,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((res.body.post as { title: string }).title, "Fresh Basis Edited");

  // Re-sending the SAME expectedVersion now conflicts, which is what proves the 200 above went
  // through the guard rather than around it.
  const replay = await putPost(baseUrl, cookie, id, {
    title: "Replay",
    slug: "fresh-basis",
    bodyJson: VALID_BODY_JSON,
    status: "draft",
    expectedVersion: loaded.version,
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.code, "VERSION_CONFLICT");
});

test("PUT posts/:postId omitting expectedVersion entirely is still last-write-wins — the guard stays opt-in at the route too", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const { id } = await createPost(baseUrl, cookie, { title: "Unguarded", slug: "unguarded" });

  const first = await putPost(baseUrl, cookie, id, { title: "First", slug: "unguarded", bodyJson: VALID_BODY_JSON, status: "draft" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await putPost(baseUrl, cookie, id, { title: "Second", slug: "unguarded", bodyJson: VALID_BODY_JSON, status: "draft" });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal((await getPost(baseUrl, cookie, id)).title, "Second");
});

for (const [label, value] of [
  ["a numeric string", "1"],
  ["a fractional number", 1.5],
  ["a negative integer", -1],
  ["an explicit null", null],
  ["a boolean", true],
] as const) {
  test(`PUT posts/:postId 400 when expectedVersion is ${label} — never silently downgraded to an unguarded save`, async (t) => {
    const { baseUrl, cookie } = await startServer(t);
    const slug = `bad-version-${String(label).replace(/\s+/g, "-")}`;
    const { id } = await createPost(baseUrl, cookie, { title: "Bad Version Basis", slug });

    const res = await putPost(baseUrl, cookie, id, {
      title: "Should Not Land",
      slug,
      bodyJson: VALID_BODY_JSON,
      status: "draft",
      expectedVersion: value,
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.error, "'expectedVersion' must be a non-negative integer when present");

    // The whole point of the 400: a malformed basis must not be quietly treated as "no basis sent"
    // and written through anyway.
    assert.equal((await getPost(baseUrl, cookie, id)).title, "Bad Version Basis");
  });
}
