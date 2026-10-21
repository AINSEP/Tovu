import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { getAuthedPrincipal, registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import { startAcmeHarness, ACME_PLUGIN } from "#src/features/api-connections/__tests__/support/acme-harness";
import { API_CONNECTION_BINDING_COOKIE, API_CONNECTION_OAUTH_CALLBACK_PATH, hostedSignInLink } from "#src/features/api-connections/browser-binding";
import { registerApiConnectionSignInRoute } from "../../connection-sign-in.js";
import { registerApiConnectionOAuthCallbackRoute } from "#src/server/inbound/public-http/routes/api-connections/oauth-callback";

/** Real session + start route + Jini completion: forwarding either link cannot bind a different
 * principal's browser. HTTP tests carry Secure cookies explicitly; browser enforcement is also
 * pinned by exact cookie attributes. Servers are closed by the shared test-server owner.
 */
test("F1: authenticated hosted start binds only its actor's browser; wrong browser and replay fail closed", async (t) => {
  const harness = await startAcmeHarness();
  t.after(() => harness.close());
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  app.use("/api/admin", (req, res, next) => {
    if (req.get("x-test-credential-kind") === "api_key") res.locals.authCredentialKind = "api_key";
    next();
  });
  app.get("/api/admin/test-principal", (_req, res) => { res.json({ id: getAuthedPrincipal(res).id }); });
  const { baseUrl, cookie: session } = await bootAuthenticated(app, t);
  const host = harness.makeHost({ workspaceId: deps.workspaceId, publicOrigin: () => baseUrl, env: { ...harness.env, TOVU_API_CONNECTION_CALLBACK_ORIGINS: baseUrl } });
  registerApiConnectionSignInRoute(app, { workspaceId: deps.workspaceId, host });
  registerApiConnectionOAuthCallbackRoute(app, { host, callbackLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, log: () => {} });
  const principal = await (await fetch(`${baseUrl}/api/admin/test-principal`, { headers: { cookie: session } })).json() as { id: string };
  const otherSession = await loginAsBarePrincipal(deps, baseUrl);
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  assert.ok(connection);
  const service = host.serviceFor({ connection });

  async function begin() {
    const callbackUrl = `${baseUrl}${API_CONNECTION_OAUTH_CALLBACK_PATH}`;
    const start = await service.start({ workspaceId: deps.workspaceId, actorId: principal.id, intent: "connect", scopeSetIds: [], redirectUri: callbackUrl });
    const handoffId = host.signInHandoffs.issue({ authorizationUrl: start.authorizationUrl, browserBinding: start.browserBinding, actorId: principal.id, expiresAt: start.expiresAt });
    return { start, link: hostedSignInLink({ callbackUrl, workspaceId: deps.workspaceId, handoffId }) };
  }
  const first = await begin();
  const anonymous = await fetch(first.link, { redirect: "manual" });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("set-cookie"), null);
  const apiKey = await fetch(first.link, { redirect: "manual", headers: { cookie: session, "x-test-credential-kind": "api_key" } });
  assert.equal(apiKey.status, 403);
  assert.equal(apiKey.headers.get("set-cookie"), null);
  const foreign = await fetch(first.link, { redirect: "manual", headers: { cookie: otherSession } });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.headers.get("set-cookie"), null);
  const burned = await fetch(first.link, { redirect: "manual", headers: { cookie: session } });
  assert.equal(burned.status, 400, "wrong-actor use consumes the handoff");

  const second = await begin();
  const handoffId = new URL(second.link).pathname.split("/").at(-1)!;
  const otherWorkspaceLink = hostedSignInLink({ callbackUrl: `${baseUrl}${API_CONNECTION_OAUTH_CALLBACK_PATH}`, workspaceId: `${deps.workspaceId}-other`, handoffId });
  const otherWorkspace = await fetch(otherWorkspaceLink, { redirect: "manual", headers: { cookie: session } });
  assert.equal(otherWorkspace.status, 400, "a handoff is only redeemable under the workspace that issued it");
  assert.equal(otherWorkspace.headers.get("set-cookie"), null);
  const opened = await fetch(second.link, { redirect: "manual", headers: { cookie: session } });
  assert.equal(opened.status, 302, "the wrong-workspace attempt never consumed the real handoff");
  assert.equal(opened.status, 302);
  assert.equal(opened.headers.get("location"), second.start.authorizationUrl);
  assert.equal(opened.headers.get("cache-control"), "no-store");
  assert.equal(opened.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(opened.headers.getSetCookie(), [`${API_CONNECTION_BINDING_COOKIE}=${second.start.browserBinding}; Max-Age=600; Path=${API_CONNECTION_OAUTH_CALLBACK_PATH}; HttpOnly; Secure; SameSite=Lax`]);
  assert.equal((await fetch(second.link, { redirect: "manual", headers: { cookie: session } })).status, 400);
  const callback = harness.consentRedirect(second.start.authorizationUrl);
  const noCookie = await fetch(callback);
  assert.equal(noCookie.status, 400);
  assert.match(await noCookie.text(), /state_expired/);
  const bindingCookie = opened.headers.getSetCookie()[0]!.split(";")[0]!;
  assert.equal((await fetch(callback, { headers: { cookie: bindingCookie } })).status, 400, "wrong-browser refusal burns the attempt");
  assert.equal(harness.provider.tokenCalls, 0);

  const third = await begin();
  const validStart = await fetch(third.link, { redirect: "manual", headers: { cookie: session } });
  const validCookie = validStart.headers.getSetCookie()[0]!.split(";")[0]!;
  const validCallback = harness.consentRedirect(third.start.authorizationUrl);
  const completed = await fetch(validCallback, { headers: { cookie: validCookie } });
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.headers.getSetCookie(), [`${API_CONNECTION_BINDING_COOKIE}=; Max-Age=0; Path=${API_CONNECTION_OAUTH_CALLBACK_PATH}; HttpOnly; Secure; SameSite=Lax`]);
  assert.equal((await fetch(validCallback, { headers: { cookie: validCookie } })).status, 400, "successful callback cannot replay");
  assert.equal(harness.provider.tokenCalls, 1);
  assert.equal((await service.getStatus({ workspaceId: deps.workspaceId, connectionRef: third.start.connectionRef })).status, "connected");

  const fourth = await begin();
  const differentBrowser = await fetch(harness.consentRedirect(fourth.start.authorizationUrl), { headers: { cookie: validCookie } });
  assert.equal(differentBrowser.status, 400, "another attempt's cookie cannot complete this sign-in");
  assert.deepEqual(differentBrowser.headers.getSetCookie(), completed.headers.getSetCookie(), "refusal clears the cookie too");
  assert.equal(harness.provider.tokenCalls, 1);
});
