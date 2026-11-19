import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { PostNotFoundError } from "#src/features/post/post";
import { registerContentPostGetRoute } from "../get-by-slug.js";

for (const absent of [false, true]) test(`post read preserves ${absent ? "404 absence" : "one private correlated incident"}`, async t => {
  const logs = t.mock.method(console, "error", () => {});
  const reports: unknown[] = [];
  const cause = absent ? new PostNotFoundError("post 'missing' was not found") : new Error("post context password=POST_CANARY");
  const deps = portFake<RouteDeps>({ workspaceId: "ws", postRepo: { findBySlug: async () => { throw cause; } }, presentationRepo: { findByWorkspaceId: () => new Promise(() => {}) } });
  const app = express();
  app.use((_req, res, next) => { res.locals.adminFailureTracker = { error: (...args: unknown[]) => reports.push(args) }; next(); });
  registerContentPostGetRoute({ app, deps });
  const base = await startTestServer(app, t);
  const res = await fetch(`${base}/api/content/v1/workspaces/ws/posts/missing`);
  const body = await res.json();
  assert.equal(res.status, absent ? 404 : 500);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(logs.mock.calls.length, absent ? 0 : 1);
  assert.equal(reports.length, absent ? 0 : 1);
  if (absent) assert.deepEqual(body, { error: cause.message });
  else { assert.ok(body.errorId); assert.ok(JSON.stringify(reports).includes(body.errorId)); }
  assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(logs.mock.calls) + JSON.stringify(reports), /POST_CANARY/);
});
