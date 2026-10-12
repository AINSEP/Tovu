import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest, type IncomingMessage } from "node:http";
import express from "express";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { resolveLocalOwnerSignIn } from "../runtime/boot/local-owner-signin.js";
import { mintBootSessionToken } from "../../features/identity/boot-session-token.js";
import { extractRouteHandler, loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";

/** devsignin: real sessions in two independent site stores; no password or schema changes. */
const dev = { NODE_ENV: "development", TOVU_DEV_OWNER_SIGNIN: "1", TOVU_HOST: "127.0.0.1", TOVU_DEV_SUPERVISOR_PID: "42" };
function site(env: Record<string, string | undefined> = dev, { deps = createRouteDeps() } = {}) {
  const app = express(); app.use(express.json());
  const localOwnerSignIn = resolveLocalOwnerSignIn({ env }, { pathExists: () => false });
  registerAuthRoutes(app, deps, { localOwnerSignIn });
  app.use("/api/admin", requireAdminSession(deps, { localOwnerSignIn }));
  app.get("/api/admin/protected", (_req, res) => res.json({ ok: true }));
  return { app, deps };
}
const bootstrap = (base: string, cookie?: string, capability?: string) => fetch(`${base}/api/admin/v1/auth/local-boot-session`, {
  method: "POST", headers: { origin: base, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", ...(cookie ? { cookie } : {}), ...(capability ? { "x-tovu-desktop-owner-signin": capability } : {}) },
});

test("devsignin: switching A → B → A creates ordinary site sessions and tolerates the other site's cookie", async (t) => {
  const a = site(), b = site();
  const aUrl = await startTestServer(a.app, t), bUrl = await startTestServer(b.app, t);
  const first = await bootstrap(aUrl);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { user: { id: await a.deps.ownerPrincipalId } });
  assert.equal(first.headers.get("cache-control"), "no-store");
  const aCookie = first.headers.get("set-cookie")!.split(";")[0];
  assert.equal(/HttpOnly/.test(first.headers.get("set-cookie")!), true, "cookie requires HttpOnly");
  assert.equal(/Secure/.test(first.headers.get("set-cookie")!), true, "cookie requires Secure");
  assert.equal(/SameSite=Strict/.test(first.headers.get("set-cookie")!), true, "cookie requires SameSite=Strict");
  assert.equal((await fetch(`${aUrl}/api/admin/protected`, { headers: { cookie: aCookie } })).status, 200);
  assert.equal((await fetch(`${bUrl}/api/admin/protected`, { headers: { cookie: aCookie } })).status, 401);
  const second = await bootstrap(bUrl, aCookie);
  assert.equal(second.status, 200);
  const bCookie = second.headers.get("set-cookie")!.split(";")[0];
  assert.notEqual(aCookie.split("=")[0], bCookie.split("=")[0], "local browser cookies must be scoped to each API port");
  const jar = `${aCookie}; ${bCookie}`;
  // A browser sends both names to either port. Each server must read its own session.
  assert.equal((await fetch(`${aUrl}/api/admin/protected`, { headers: { cookie: jar } })).status, 200);
  assert.equal((await fetch(`${bUrl}/api/admin/protected`, { headers: { cookie: jar } })).status, 200);
  const third = await bootstrap(aUrl, bCookie);
  assert.equal(third.status, 200);
  const current = third.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await fetch(`${aUrl}/api/admin/protected`, { headers: { cookie: current } })).status, 200);
  // A refresh keeps a valid session and does not create another cookie/session row.
  const refresh = await bootstrap(aUrl, current);
  assert.equal(refresh.status, 200);
  assert.equal(refresh.headers.has("set-cookie"), false);
});

test("devsignin: an existing non-owner session is retained without promotion", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const cookie = await loginAsBarePrincipal(deps, base, { username: "local-editor" });
  const me = await fetch(`${base}/api/admin/v1/auth/me`, { headers: { cookie } });
  const before = await me.json();
  const res = await bootstrap(base, cookie);
  assert.equal(res.status, 200);
  assert.equal((await res.json() as { user: { id: string } }).user.id, before.user.id);
  assert.notEqual(before.user.id, await deps.ownerPrincipalId);
  assert.equal(res.headers.has("set-cookie"), false);
});

test("devsignin: password login supersedes local owner bootstrap and logout clears that port's cookie", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const local = await bootstrap(base);
  const ownerCookie = local.headers.get("set-cookie")!.split(";")[0];
  const localName = ownerCookie.split("=")[0];
  // Register the editor through the existing identity fixture, then log in from the owner's tab.
  await loginAsBarePrincipal(deps, base, { username: "editor-password", password: "editor-password-value" });
  const login = await fetch(`${base}/api/admin/v1/auth/login`, { method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ username: "editor-password", password: "editor-password-value" }),
  });
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.startsWith(`${localName}=;`) && cookie.includes("Expires=")));
  const editorCookie = cookies.find((cookie) => cookie.startsWith("tovu_session="))!.split(";")[0];
  const me = await fetch(`${base}/api/admin/v1/auth/me`, { headers: { cookie: editorCookie } });
  assert.equal((await me.json()).user.username, "editor-password");
  // Deleting the browser cookie must also invalidate a captured copy of the old owner bearer.
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: ownerCookie } })).status, 401);
  const out = await fetch(`${base}/api/admin/v1/auth/logout`, { method: "POST", headers: { cookie: ownerCookie } });
  assert.equal(out.status, 200);
  assert.ok(out.headers.getSetCookie().some((cookie) => cookie.startsWith(`${localName}=;`)));
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: ownerCookie } })).status, 401);
});

test("fxdev: logout revokes both session names, while other tabs' sessions survive", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const local = await bootstrap(base);
  const localCookie = local.headers.get("set-cookie")!.split(";")[0];
  const ordinary = await loginAsBarePrincipal(deps, base, { username: "logout-editor" });
  const unrelated = await loginAsBarePrincipal(deps, base, { username: "other-tab" });
  const out = await fetch(`${base}/api/admin/v1/auth/logout`, { method: "POST", headers: { cookie: `${localCookie}; ${ordinary}` } });
  assert.equal(out.status, 200);
  for (const cookie of [localCookie, ordinary]) {
    assert.ok(out.headers.getSetCookie().some((cleared) => cleared.startsWith(`${cookie.split("=")[0]}=;`)));
    assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie } })).status, 401);
  }
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: unrelated } })).status, 200);
});

test("fxdev: password login revokes both superseded cookies and keeps the new session", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const local = await bootstrap(base);
  const localCookie = local.headers.get("set-cookie")!.split(";")[0];
  const ordinary = await loginAsBarePrincipal(deps, base, { username: "relogin-editor", password: "editor-value" });
  const login = await fetch(`${base}/api/admin/v1/auth/login`, { method: "POST",
    headers: { "content-type": "application/json", cookie: `${localCookie}; ${ordinary}` },
    body: JSON.stringify({ username: "relogin-editor", password: "editor-value" }),
  });
  assert.equal(login.status, 200);
  const newCookie = login.headers.getSetCookie().find((cookie) => cookie.startsWith("tovu_session="))!.split(";")[0];
  for (const cookie of [localCookie, ordinary]) {
    assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie } })).status, 401);
  }
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: newCookie } })).status, 200);
});

test("fxdev: failed password login retains existing sessions", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const local = await bootstrap(base);
  const localCookie = local.headers.get("set-cookie")!.split(";")[0];
  const ordinary = await loginAsBarePrincipal(deps, base, { username: "failed-login-editor" });
  const login = await fetch(`${base}/api/admin/v1/auth/login`, { method: "POST",
    headers: { "content-type": "application/json", cookie: `${localCookie}; ${ordinary}` },
    body: JSON.stringify({ username: "failed-login-editor", password: "wrong-password" }),
  });
  assert.equal(login.status, 401);
  assert.equal(login.headers.has("set-cookie"), false);
  for (const cookie of [localCookie, ordinary]) {
    assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie } })).status, 200);
  }
});

test("fxdev: failed superseded-session revocation refuses password login without setting cookies", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const local = await bootstrap(base);
  const localCookie = local.headers.get("set-cookie")!.split(";")[0];
  await loginAsBarePrincipal(deps, base, { username: "revoke-failure", password: "editor-value" });
  // Inject failure at the real repository port; no module mock or credential data in the error.
  deps.sessionRepo.revoke = async () => { throw new Error("session storage unavailable"); };
  const login = await fetch(`${base}/api/admin/v1/auth/login`, { method: "POST",
    headers: { "content-type": "application/json", cookie: localCookie },
    body: JSON.stringify({ username: "revoke-failure", password: "editor-value" }),
  });
  assert.equal(login.status, 500);
  assert.deepEqual(await login.json(), { error: "internal error" });
  assert.equal(login.headers.has("set-cookie"), false);
});

test("fxdev: desktop exchange revokes both superseded sessions before setting its ordinary cookie", async (t) => {
  const { app, deps } = site(); const base = await startTestServer(app, t);
  const local = await bootstrap(base);
  const localCookie = local.headers.get("set-cookie")!.split(";")[0];
  const ordinary = await loginAsBarePrincipal(deps, base, { username: "desktop-editor" });
  const token = mintBootSessionToken();
  const res = await fetch(`${base}/api/admin/v1/auth/boot-session`, { method: "POST",
    headers: { "content-type": "application/json", cookie: `${localCookie}; ${ordinary}` },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 200);
  for (const cookie of [localCookie, ordinary]) {
    assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie } })).status, 401);
  }
  const newCookie = res.headers.getSetCookie().find((cookie) => cookie.startsWith("tovu_session="))!.split(";")[0];
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: newCookie } })).status, 200);
});

test("fxdev: disabled local sign-in ignores a valid planted local cookie on every auth surface", async (t) => {
  const enabled = site(); const enabledBase = await startTestServer(enabled.app, t);
  const local = await bootstrap(enabledBase);
  const localValue = local.headers.get("set-cookie")!.split(";")[0].split("=")[1];
  for (const override of [{ NODE_ENV: "production" }, { TOVU_DEV_OWNER_SIGNIN: "0" }]) {
    const disabled = site({ ...dev, ...override }, { deps: enabled.deps });
    const base = await startTestServer(disabled.app, t);
    const planted = `tovu_session_local_${new URL(base).port}=${localValue}`;
    const ordinary = await loginAsBarePrincipal(disabled.deps, base, { username: `disabled-${override.NODE_ENV ?? "flag"}` });
    for (const path of ["/api/admin/v1/auth/me", "/api/admin/v1/auth/me/password-status", "/api/admin/protected"]) {
      assert.equal((await fetch(`${base}${path}`, { headers: { cookie: planted } })).status, 401);
      assert.equal((await fetch(`${base}${path}`, { headers: { cookie: `${planted}; ${ordinary}` } })).status, 200);
    }
    const me = await fetch(`${base}/api/admin/v1/auth/me`, { headers: { cookie: `${planted}; ${ordinary}` } });
    assert.notEqual((await me.json()).user.id, await disabled.deps.ownerPrincipalId);
  }
});

test("fxdev: every proxy marker is refused through the real local boot route", async (t) => {
  const { app } = site(); const base = await startTestServer(app, t);
  for (const name of ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-prefix", "x-forwarded-custom", "x-real-ip", "via", "cf-connecting-ip", "true-client-ip", "x-original-host"]) {
    for (const value of ["127.0.0.1", ""]) {
      const res = await fetch(`${base}/api/admin/v1/auth/local-boot-session`, { method: "POST",
        headers: { origin: base, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", [name]: value },
      });
      assert.equal(res.status, 403, name);
      assert.deepEqual(await res.json(), { error: "local owner sign-in requires a same-origin loopback request", code: "FORBIDDEN" });
      assert.equal(res.headers.has("set-cookie"), false);
    }
  }
  assert.equal((await bootstrap(base)).status, 200);
});

test("fxdev: missing or non-same-origin fetch metadata refuses even with exact local Origin", async (t) => {
  const { app } = site(); const base = await startTestServer(app, t);
  // Native HTTP preserves absent/forged fetch-mode headers; fetch() supplies its own cors value.
  const send = ({ headers }: { headers: Record<string, string> }) => new Promise<IncomingMessage>((resolve, reject) => {
    const request = httpRequest(`${base}/api/admin/v1/auth/local-boot-session`, { method: "POST", headers }, (response) => {
      response.resume(); resolve(response);
    });
    request.on("error", reject); request.end();
  });
  for (const fetchSite of [undefined, "", "none", "same-site", "cross-site"]) {
    const res = await send({
      headers: { origin: base, "sec-fetch-mode": "cors", ...(fetchSite === undefined ? {} : { "sec-fetch-site": fetchSite }) },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["set-cookie"], undefined);
  }
  for (const fetchMode of [undefined, "navigate", "no-cors", "websocket", ""]) {
    const res = await send({
      headers: { origin: base, "sec-fetch-site": "same-origin", ...(fetchMode === undefined ? {} : { "sec-fetch-mode": fetchMode }) },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["set-cookie"], undefined);
  }
});

test("devsignin: production, deployed and LAN boots refuse bootstrap and keep me unauthenticated", async (t) => {
  for (const override of [{ NODE_ENV: "production" }, { TOVU_RUNTIME_MODE: "production" }, { FLY_APP_NAME: "live" }, { TOVU_HOST: "0.0.0.0" }, { TOVU_PUBLIC_URL: "https://example.com" }, { TOVU_DEV_OWNER_SIGNIN: "0" }]) {
    const { app } = site({ ...dev, ...override }); const base = await startTestServer(app, t);
    const res = await bootstrap(base);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "local owner sign-in is disabled", code: "NOT_FOUND" });
    assert.equal(res.headers.has("set-cookie"), false);
    assert.equal((await fetch(`${base}/api/admin/v1/auth/me`)).status, 401);
  }
});

test("devsignin: remote peer, remote Host and missing/cross origin refuse before touching identity", async (t) => {
  const { app, deps } = site();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/auth/local-boot-session");
  for (const request of [
    { peer: "203.0.113.1", host: "localhost:3000", origin: "http://localhost:3000" },
    { peer: "127.0.0.1", host: "evil.example:3000", origin: "http://evil.example:3000" },
    { peer: "127.0.0.1", host: "localhost:3000", origin: "http://evil.example" },
    { peer: "127.0.0.1", host: "localhost:3000", origin: undefined },
  ]) {
    let status = 200; let cookieSet = false; const bodies: unknown[] = [];
    const response = { status(code: number) { status = code; return response; }, json(body: unknown) { bodies.push(body); }, cookie() { cookieSet = true; } };
    await handler({ socket: { remoteAddress: request.peer }, headers: { host: request.host }, get(name: string) { return name === "origin" ? request.origin : name === "sec-fetch-mode" ? "cors" : "same-origin"; } }, response);
    assert.equal(status, 403); assert.equal(cookieSet, false);
    assert.deepEqual(bodies, [{ error: "local owner sign-in requires a same-origin loopback request", code: "FORBIDDEN" }]);
  }
  const base = await startTestServer(app, t);
  assert.equal((await bootstrap(base)).status, 200);
  assert.ok(await deps.ownerPrincipalId);
});

test("devsignin: simultaneous tabs do not spend the desktop boot token", async (t) => {
  const { app } = site(); const base = await startTestServer(app, t);
  const desktopToken = mintBootSessionToken();
  const tabs = await Promise.all([bootstrap(base), bootstrap(base)]);
  for (const res of tabs) assert.equal(res.status, 200);
  const redeem = () => fetch(`${base}/api/admin/v1/auth/boot-session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: desktopToken }) });
  assert.equal((await redeem()).status, 200);
  assert.equal((await redeem()).status, 401);
});

test("devsignin: a disabled owner cannot receive an automatic session", async (t) => {
  const { app, deps } = site();
  await deps.identityReady;
  const id = await deps.ownerPrincipalId;
  const owner = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id });
  assert.ok(owner);
  await deps.principalRepo.save({ ...owner, status: "disabled" });
  const base = await startTestServer(app, t);
  const res = await bootstrap(base);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
  assert.equal(res.headers.has("set-cookie"), false);
});

test("devsignin: failed identity readiness forwards an error instead of hanging or setting a cookie", async (t) => {
  const { app, deps } = site();
  await deps.identityReady;
  const failure = new Error("identity storage unavailable");
  deps.identityReady = Promise.reject(failure);
  deps.identityReady.catch(() => {});
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    assert.equal(error, failure);
    res.status(500).json({ error: "identity storage unavailable" });
  });
  const base = await startTestServer(app, t);
  const res = await bootstrap(base);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "identity storage unavailable" });
  assert.equal(res.headers.has("set-cookie"), false);
});


test("deskfx S1: desktop logout then reopening signs the owner in again without restart", async (t) => {
  const env = { TOVU_DESKTOP_OWNER_SIGNIN: "a".repeat(64), TOVU_DESKTOP_OWNER_PID: String(process.ppid), TOVU_HOST: "127.0.0.1" };
  const { app, deps } = site(env); const base = await startTestServer(app, t);
  const first = await bootstrap(base, undefined, env.TOVU_DESKTOP_OWNER_SIGNIN); assert.equal(first.status, 200);
  const oldCookie = first.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await fetch(`${base}/api/admin/v1/auth/logout`, { method: "POST", headers: { cookie: oldCookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: oldCookie } })).status, 401);
  const reopened = await bootstrap(base, undefined, env.TOVU_DESKTOP_OWNER_SIGNIN); assert.equal(reopened.status, 200);
  assert.equal((await reopened.json()).user.id, await deps.ownerPrincipalId);
  const newCookie = reopened.headers.get("set-cookie")!.split(";")[0]; assert.notEqual(newCookie, oldCookie);
  assert.equal((await fetch(`${base}/api/admin/protected`, { headers: { cookie: newCookie } })).status, 200);
  const proxied = await fetch(`${base}/api/admin/v1/auth/local-boot-session`, { method: "POST", headers: { origin: base, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", forwarded: "for=127.0.0.1", "x-tovu-desktop-owner-signin": env.TOVU_DESKTOP_OWNER_SIGNIN } });
  assert.equal(proxied.status, 403); assert.equal(proxied.headers.has("set-cookie"), false);
});


test("deskfx2 MUST-1: forged perfect headers need the desktop capability", async (t) => {
  const secret = "a".repeat(64);
  const env = { NODE_ENV: "production", TOVU_DESKTOP_OWNER_SIGNIN: secret, TOVU_DESKTOP_OWNER_PID: String(process.ppid), TOVU_HOST: "127.0.0.1" };
  const { app, deps } = site(env); const base = await startTestServer(app, t);
  for (const capability of [undefined, "b".repeat(64), "a".repeat(63), "a".repeat(65)]) {
    const result = await bootstrap(base, undefined, capability);
    assert.equal(result.status, 404); assert.equal(result.headers.has("set-cookie"), false);
  }
  const result = await bootstrap(base, undefined, secret);
  assert.equal(result.status, 200); assert.equal((await result.json()).user.id, await deps.ownerPrincipalId);
  assert.equal((await bootstrap(base)).status, 404, "a successful request never disables capability enforcement");
  const wrongParent = site({ ...env, TOVU_DESKTOP_OWNER_PID: "0" });
  const wrongBase = await startTestServer(wrongParent.app, t);
  assert.equal((await bootstrap(wrongBase, undefined, secret)).status, 404);
});
