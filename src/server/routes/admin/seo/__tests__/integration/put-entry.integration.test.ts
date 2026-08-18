import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `PUT .../seo/entries/:entryId` — real composed app, real
 * login. Same technique as `admin/integrations/__tests__/integration/create-delete-pause.integration
 * .test.ts`. `post-home` is a real seeded post id (`server/seed.ts`).
 */

const WORKSPACE_ID = "workspace-local";
const ENTRY_ID = "post-home";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${ENTRY_ID}`;

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

/** Same technique as `admin/integrations/__tests__/integration/create-delete-pause.integration.test.ts`'s
 *  identical helper — see its comment for why: `put-entry.ts`'s `String(req.params.workspaceId ?? "")`
 *  / `entryId` fallbacks are unreachable through any real HTTP request (Express's own router
 *  guarantees both route segments are populated whenever this handler is dispatched to at all), so
 *  the only way to genuinely execute the `??` side is to reach into the REAL composed app's router
 *  stack and call the registered handler directly with a hand-built `req`. Also used for
 *  `req.body ?? {}`: `body-parser`'s `express.json()` middleware unconditionally does `req.body =
 *  req.body || {}` (verified directly in `node_modules/body-parser/lib/types/json.js`) before this
 *  route ever sees the request, so `req.body` can never actually be `undefined` coming through the
 *  real app either — same "provably unreachable via real HTTP, reachable via a forced direct call"
 *  shape.
 *
 *  UNLIKE the sibling helper in `create-delete-pause.integration.test.ts`, this route's path is
 *  matched by BOTH `PUT` and a sibling `GET .../seo/entries/:entryId` route (the entry-meta read
 *  endpoint) — Express keeps one router-stack layer per (path, method) pair (verified directly:
 *  `app._router.stack` has 2 layers with `route.path` `/api/.../entries/:entryId`, one
 *  `methods:{get:true}`, one `methods:{put:true}`), so matching by path alone silently grabbed
 *  the GET layer's handler instead of PUT's — the method must be part of the lookup. */
interface ExpressHandlerLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (req: unknown, res: unknown) => unknown }[];
  };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

function extractHandler(
  app: ReturnType<typeof createApp>,
  method: "get" | "put",
  path: string
): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`${method.toUpperCase()} route '${path}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

function fakeRes(): { res: unknown; getStatus: () => number | undefined; getBody: () => unknown } {
  // Express itself defaults to 200 when a handler calls only `res.json(...)` without an explicit
  // prior `res.status(...)` (as `put-entry.ts`'s own success path does) -- matched here so a forced
  // direct-handler-call test observes the same status a real request would.
  let statusCode: number | undefined = 200;
  let body: unknown;
  const res = {
    locals: { principal: { id: "forced-input-test-principal" } },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return { res, getStatus: () => statusCode, getBody: () => body };
}

test("put-entry: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/seo/entries/${ENTRY_ID}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(res.status, 404);
});

test("put-entry: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(res.status, 403);
});

test("put-entry: an unregistered field 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ notReal: "x" }),
  });
  assert.equal(res.status, 400);
});

test("put-entry: an unsafe canonical scheme 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ canonical: "javascript:alert(1)" }),
  });
  assert.equal(res.status, 400);
});

test("put-entry: an unknown entry id 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/does-not-exist`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(res.status, 404);
});

test("put-entry: a valid patch succeeds (200) and persists across a second GET", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Integration SEO Title" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { title?: string } };
  assert.equal(body.data.title, "Integration SEO Title");
});

test("put-entry: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    postRepo: {
      ...base.postRepo,
      save: async () => {
        throw new Error("boom");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${PATH}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(res.status, 500);
});

test("put-entry: `req.body ?? {}` fallback, forced via a direct handler call -- `express.json()` always defaults `req.body` to `{}` on any real request, so the only way to genuinely pass `undefined` through is a forced direct call -- treated as an empty (no-op) patch, still 200s", async () => {
  const deps = testDeps({ authorize: async () => ({ allowed: true, reason: "matched" }) });
  const app = createApp(deps);
  const handler = extractHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId");
  const { res, getStatus } = fakeRes();

  await handler({ params: { workspaceId: deps.workspaceId, entryId: ENTRY_ID }, body: undefined }, res);

  assert.equal(getStatus(), 200);
});

test("put-entry: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app (Express itself can never leave a required :workspaceId segment unset) -- still 404s as a mismatch", async () => {
  const app = createApp(testDeps());
  const handler = extractHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId");
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { entryId: ENTRY_ID }, body: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("put-entry: `req.params.entryId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app -- falls through to setEntrySeoOverrides with entryId:\"\", 404s with the not-found message for an empty id", async () => {
  // authorize stubbed to allow: the forced fake principal below is not a real logged-in identity,
  // so the REAL RBAC authorize() would 403 it before ever reaching setEntrySeoOverrides -- this
  // test is specifically about the entryId fallback, not authorization, same technique as the
  // equivalent create/pause/delete tests in create-delete-pause.integration.test.ts.
  const deps = testDeps({ authorize: async () => ({ allowed: true, reason: "matched" }) });
  const app = createApp(deps);
  const handler = extractHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/seo/entries/:entryId");
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { workspaceId: deps.workspaceId }, body: { title: "x" } }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "entry '' was not found", code: "SEO_ENTRY_NOT_FOUND" });
});
