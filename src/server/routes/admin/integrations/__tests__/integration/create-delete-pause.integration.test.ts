import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `POST/DELETE/PAUSE .../integrations/subscriptions` — boots the
 * REAL composed app (`createApp`/`createRouteDeps`, real in-memory adapters, real identity/RBAC
 * stack, real login) rather than a bare Express app with stubbed auth, matching this repo's
 * established integration-test pattern (see `src/server/routes/admin/plugins/__tests__/integration/
 * plugins-http.integration.test.ts`).
 *
 * `src/server/__tests__/admin-integrations-routes.test.ts` already covers this same domain
 * thoroughly at the UNIT tier (its filename doesn't match `*.integration.test.ts` or
 * `__tests__/integration/`, so it classifies as unit under this repo's tier convention even though
 * it also boots a real app + real login) — this file exists because the two-tier gate measures unit
 * and integration coverage from SEPARATE `node --test` runs (`test:cov:server:unit` only loads
 * files that AREN'T integration-tier), so that file's execution contributes nothing to this file's
 * measured tier. Deliberately not a byte-for-byte duplicate of that file's scenarios — trimmed to
 * the branches `create.ts`/`delete.ts`/`pause.ts` actually have, via `createApp()` (the real
 * composition root) instead of hand-assembling a standalone router.
 */

const WORKSPACE_ID = "workspace-local";
const SUBS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/integrations/subscriptions`;

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

/** Same technique as `admin-integrations-routes.test.ts`'s (unit-tier) identical helper — see its
 *  comment for why: `delete.ts`'s `String(req.params.workspaceId ?? "")` / `subscriptionId`
 *  fallbacks are unreachable through any real HTTP request (Express's own router guarantees both
 *  route segments are populated whenever this handler is dispatched to at all), so the only way to
 *  genuinely execute the `??` side is to reach into the REAL composed app's router stack and call
 *  the registered handler directly with a hand-built `req`. */
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

/** The `create.ts` path (`.../integrations/subscriptions`) is ALSO matched by a sibling `GET`
 *  "list subscriptions" route at the exact same path string (verified directly: `app._router.stack`
 *  has 2 layers there, one `methods:{get:true}`, one `methods:{post:true}`) -- matching by path
 *  alone silently grabbed whichever layer Express registered first (GET), not create's own POST
 *  handler, so the method must be part of the lookup. `delete.ts`/`pause.ts`'s paths are unique, but
 *  the method is required here regardless so a future added route at either path can't reintroduce
 *  this same silent-wrong-handler trap. */
function extractHandler(
  app: ReturnType<typeof createApp>,
  method: "get" | "post" | "delete",
  path: string
): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`${method.toUpperCase()} route '${path}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

function fakeRes(): { res: unknown; getStatus: () => number | undefined; getBody: () => unknown } {
  let statusCode: number | undefined;
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

test("create: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/integrations/subscriptions`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 404);
});

test("create: a principal with no grants is denied 403, real login stack", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 403);
});

test("create: missing label 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 400);
});

test("create: no topics 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook" }),
  });
  assert.equal(res.status, 400);
});

test("create: valid request succeeds (201)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 201);
});

test("create: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const deps = testDeps({
    webhookSubscriptionRepo: {
      ...base.webhookSubscriptionRepo,
      save: async () => {
        throw new Error("boom");
      },
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  assert.equal(res.status, 500);
});

test("create: missing targetUrl 400s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", topics: ["a"] }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "target_url '' is not a valid URL");
});

test("create: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app (Express itself can never leave a required :workspaceId segment unset) -- still 404s as a mismatch", async () => {
  const app = createApp(testDeps());
  const handler = extractHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions");
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: {}, body: { label: "x", targetUrl: "https://example.com/hook", topics: ["a"] } }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("delete: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/integrations/subscriptions/x`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("delete: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/whatever`, { method: "DELETE", headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
});

test("delete: unknown subscription id 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/missing`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 404);
});

test("delete: soft-deletes an existing subscription (200, status disabled)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { subscription: { status: string } };
  assert.equal(body.subscription.status, "disabled");
});

test("delete: an unexpected repo failure 500s", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  // Swap the repo AFTER creation so `findById` still sees the row (delegated through the SAME
  // original instance, preserving its internal `this`-bound state) but `save` (the delete's write)
  // fails — exercises delete.ts's generic catch without needing a second app/deps pair. Delegating
  // via arrow functions rather than extracting bare method references matters here: the original
  // repo's methods read `this`-bound internal state, which a bare `originalRepo.findById` reference
  // would lose the moment it is called off a different object.
  const originalRepo = deps.webhookSubscriptionRepo;
  deps.webhookSubscriptionRepo = {
    findById: (input) => originalRepo.findById(input),
    listByWorkspace: (input) => originalRepo.listByWorkspace(input),
    save: async () => {
      throw new Error("boom");
    },
  };

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(res.status, 500);
});

test("delete: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app (Express itself can never leave a required :workspaceId segment unset) -- still 404s as a mismatch", async () => {
  const app = createApp(testDeps());
  const handler = extractHandler(
    app,
    "delete",
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId"
  );
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { subscriptionId: "sub-1" } }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("delete: `req.params.subscriptionId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app -- falls through to deleteSubscription with id:\"\", 404s with the not-found message for an empty id", async () => {
  // authorize stubbed to allow: the forced fake principal below is not a real logged-in identity,
  // so the REAL RBAC authorize() would 403 it before ever reaching deleteSubscription -- this test
  // is specifically about the subscriptionId fallback, not authorization, so it stubs that gate the
  // same way admin-integrations-routes.test.ts's (unit-tier) identical test does.
  const deps = testDeps({ authorize: async () => ({ allowed: true, reason: "matched" }) });
  const app = createApp(deps);
  const handler = extractHandler(
    app,
    "delete",
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId"
  );
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { workspaceId: deps.workspaceId } }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "webhook subscription '' was not found" });
});

test("pause: mismatched workspaceId 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/integrations/subscriptions/x/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
});

test("pause: a principal with no grants is denied 403", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/whatever/pause`, {
    method: "POST",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);
});

test("pause: unknown subscription id 404s", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}${SUBS_PATH}/missing/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
});

test("pause: pauses (default) then resumes (paused:false), real toggling round trip", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  const paused = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(paused.status, 200);
  assert.equal(((await paused.json()) as { subscription: { status: string } }).subscription.status, "paused");

  const resumed = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ paused: false }),
  });
  assert.equal(resumed.status, 200);
  assert.equal(((await resumed.json()) as { subscription: { status: string } }).subscription.status, "active");
});

test("pause: pausing a disabled (deleted) subscription 400s (validation error)", async (t) => {
  const app = createApp(testDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}`, { method: "DELETE", headers: { cookie } });

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test("pause: an unexpected repo failure 500s", async (t) => {
  const deps = testDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const created = await fetch(`${baseUrl}${SUBS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "x", targetUrl: "https://example.com/hook", topics: ["a"] }),
  });
  const { subscription } = (await created.json()) as { subscription: { id: string } };

  // Same delegate-through-arrow-functions technique as the delete 500 test above — see its comment.
  const originalRepo = deps.webhookSubscriptionRepo;
  deps.webhookSubscriptionRepo = {
    findById: (input) => originalRepo.findById(input),
    listByWorkspace: (input) => originalRepo.listByWorkspace(input),
    save: async () => {
      throw new Error("boom");
    },
  };

  const res = await fetch(`${baseUrl}${SUBS_PATH}/${subscription.id}/pause`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 500);
});

test("pause: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app (Express itself can never leave a required :workspaceId segment unset) -- still 404s as a mismatch", async () => {
  const app = createApp(testDeps());
  const handler = extractHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause"
  );
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { subscriptionId: "sub-1" }, body: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("pause: `req.params.subscriptionId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app -- falls through to pauseSubscription with id:\"\", 404s with the not-found message for an empty id", async () => {
  // authorize stubbed to allow: the forced fake principal below is not a real logged-in identity,
  // so the REAL RBAC authorize() would 403 it before ever reaching pauseSubscription -- this test
  // is specifically about the subscriptionId fallback, not authorization, same technique as the
  // equivalent delete.ts test above.
  const deps = testDeps({ authorize: async () => ({ allowed: true, reason: "matched" }) });
  const app = createApp(deps);
  const handler = extractHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause"
  );
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { workspaceId: deps.workspaceId }, body: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "webhook subscription '' was not found" });
});
