/** Owner wcmp, 2026-10-09: comparison is development-only and admin-session gated. */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes } from "../inbound/admin-http/dev-auth.js";
import { registerSiteChatComparisonRoutes } from "../inbound/public-http/routes/site/chat-comparison.js";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";

function makeApp(production = false) {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  registerSiteChatComparisonRoutes({ app, deps }, { production });
  return { app, deps };
}
const paths = ["/__compare/site-chat", "/__compare/site-chat/react", "/__compare/site-chat/vanilla"];

test("wcmp: comparison and both frames are absent in production even for the owner", async t => {
  const { app } = makeApp(true);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  for (const path of paths) assert.equal((await fetch(baseUrl + path, { headers: { cookie } })).status, 404);
});

test("wcmp: anonymous callers cannot load comparison or either frame", async t => {
  const { app } = makeApp();
  const baseUrl = await startTestServer(app, t);
  for (const path of paths) assert.equal((await fetch(baseUrl + path)).status, 401);
});

test("wcmp: a signed-in user without assistant-admin permission cannot compare", async t => {
  const { app, deps } = makeApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);
  for (const path of paths) assert.equal((await fetch(baseUrl + path, { headers: { cookie } })).status, 403);
});

test("wcmp: owner gets isolated frames, common-send controls, and uncached eager widgets", async t => {
  const { app } = makeApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const page = await fetch(baseUrl + paths[0], { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "private, no-store");
  const html = await page.text();
  assert.match(html, /title="React widget"/);
  assert.match(html, /title="Lightweight widget"/);
  assert.match(html, /Send the same message to both/);
  assert.match(html, /375px/);
  for (const variant of ["react", "vanilla"]) {
    const response = await fetch(`${baseUrl}/__compare/site-chat/${variant}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const frame = await response.text();
    assert.match(frame, new RegExp(`data-chat-compare="${variant}"`));
    assert.match(frame, new RegExp(`/site-chat/site-assistant${variant === "vanilla" ? "-vanilla" : ""}\\.js`));
    assert.doesNotMatch(frame, /site-assistant-loader/);
  }
});
