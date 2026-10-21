/** Owner wcmp, 2026-10-09: comparison is development-only and admin-session gated. */
import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createApp, createRouteDeps } from "../runtime/composition/app.js";
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

test("wcmp: the composed app (no explicit production flag) admits the owner's session but refuses an admin API key", async t => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.equal((await fetch(baseUrl + paths[0], { headers: { cookie } })).status, 200);

  const principalRes = await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ displayName: "wcmp-key-probe" }),
  });
  assert.equal(principalRes.status, 201);
  const principal = ((await principalRes.json()) as { principal: { id: string } }).principal;
  const policies = (await (await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/policies`, { headers: { cookie } })).json()) as { policies: Array<{ id: string; name: string }> };
  const policy = policies.policies.find(row => row.name === "admin-builtin-policy");
  assert.ok(policy);
  const issueRes = await fetch(`${baseUrl}/api/admin/v1/api-keys`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ principalId: principal.id, label: "wcmp-key-probe", policyIds: [policy.id] }),
  });
  assert.equal(issueRes.status, 201);
  const { apiKey } = (await issueRes.json()) as { apiKey: { rawKey: string } };
  for (const path of paths) {
    const res = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${apiKey.rawKey}` } });
    assert.equal(res.status, 403, path);
    assert.equal(res.headers.get("cache-control"), "private, no-store", path);
  }
});

test("wcmp: a failing permission check is passed to the error handler, never treated as allowed", async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  registerSiteChatComparisonRoutes({ app, deps: { ...deps, authorize: async () => { throw new Error("policy store offline"); } } }, { production: false });
  const seen: string[] = [];
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { seen.push(error.message); res.sendStatus(503); });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  assert.equal((await fetch(baseUrl + paths[0], { headers: { cookie } })).status, 503);
  assert.deepEqual(seen, ["policy store offline"]);
});
