import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { dispatchHttpRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
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

test("createApp binds the same reporter to its middleware and owning app", async () => {
  const { reporter, records } = recordingComposedReporter();
  const deps = createRouteDeps();
  deps.postRepo.list = async () => { throw new Error("post store unavailable"); };
  const app = createApp(deps, { errorReporter: reporter });
  assert.equal(app.locals.failureReporter, reporter);
  delete app.locals.failureReporter;
  const response = await dispatchHttpRequest({ app, method: "GET", url: "/feed.xml" });
  assert.equal(response.status, 500, response.body);
  const reference = response.body.match(/Error ID: (ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4})$/)?.[1];
  assert.ok(reference, response.body);
  assert.equal(records.length, 1);
  assert.equal((records[0]![1] as { meta: { errorId: string } }).meta.errorId, reference);
});
