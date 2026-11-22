import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { dispatchHttpRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createApp, createRouteDeps } from "../app.js";

/**
 * @file Characterization pin (design 02, step 0): precedence between what `createApp` mounts, observed
 * over HTTP. The route-table pin fixes the order; this fixes what that order MEANS to a request, so
 * moving a mount to another file cannot silently let the site catch-all, the body parsers or the
 * closing handlers change who answers.
 */

test("an admin API path is answered by the admin session gate, never swallowed by the site catch-all", async () => {
  const app = createApp(createRouteDeps());
  const unknown = await dispatchHttpRequest({ app, method: "GET", url: "/api/admin/v1/no-such-surface" });
  assert.equal(unknown.status, 401, unknown.body);
  assert.doesNotMatch(String(unknown.headers["content-type"]), /text\/html/);
  const real = await dispatchHttpRequest({ app, method: "GET", url: "/api/admin/v1/workspaces/any/posts" });
  assert.equal(real.status, 401, real.body);
});

test("the site catch-all still serves a visitor page for a public path", async () => {
  const response = await dispatchHttpRequest({ app: createApp(createRouteDeps()), method: "GET", url: "/" });
  assert.equal(response.status, 200, response.body);
  assert.match(String(response.headers["content-type"]), /text\/html/);
});

test("public security headers are set before any route answers", async () => {
  const app = createApp(createRouteDeps());
  const page = await dispatchHttpRequest({ app, method: "GET", url: "/" });
  assert.equal(page.headers["x-content-type-options"], "nosniff");
  assert.ok(page.headers["referrer-policy"], "Referrer-Policy is set");
});

test("an oversized public JSON body is answered by the closing handler as JSON 413, not Express's HTML page", async (t) => {
  const baseUrl = await startTestServer(createApp(createRouteDeps()), t);
  const response = await fetch(`${baseUrl}/api/site/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filler: "x".repeat(300 * 1024) }),
  });
  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" });
});

type LocalsLayer = { regexp: RegExp; handle: (req: unknown, res: { locals: Record<string, unknown> }, next: () => void) => void };

test("the admin failure tracker is exposed to every /api/admin handler through res.locals", async () => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  let seen: unknown;
  const original = deps.tracker;
  // The gate's error mappers read res.locals.adminFailureTracker; a 401 never reaches them, so probe the middleware directly.
  const stack = (app as unknown as { _router: { stack: LocalsLayer[] } })._router.stack;
  const layer = stack.find((entry) => entry.regexp.source.startsWith("^\\/api\\/admin") && entry.handle.name === "");
  assert.ok(layer, "the /api/admin locals middleware is registered");
  const res = { locals: {} as Record<string, unknown> };
  layer.handle({}, res, () => { seen = res.locals.adminFailureTracker; });
  assert.equal(seen, original);
});
