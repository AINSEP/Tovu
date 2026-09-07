import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, extractRouteHandler, startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { mintBootSessionToken } from "../../features/identity/boot-session-token.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level tests for `POST /api/admin/v1/auth/boot-session` (desktop sign-in, see
 * `apps/desktop/src/desktop-auth.cjs`'s header for the client half). Before this file, the route was
 * exercised only indirectly: `boot-session-token.test.ts` covers the token STORE in isolation, and
 * `apps/desktop/src/desktop-auth.test.cjs` covers the desktop CLIENT against a fake `net`. Neither
 * proves the route itself — that a valid token actually mints an authenticating session, that a
 * spent/invalid one gets the exact documented 401 body, or that the loopback guard runs first.
 *
 * `boot-session-token.ts`'s own header used to claim the CLI's mint call and this route's redeem call
 * "have no dependency path between them". That is not true at the module level: `cli/commands/
 * serve.ts` builds the very `RouteDeps` bag `createApp(deps)` uses to register this route
 * (`registerAuthRoutes`) in the SAME function that calls `mintBootSessionToken()` — see that file's
 * corrected header. This suite is the real proof the route the composition root wires up actually
 * works end to end, which is what makes that correction safe to make.
 */

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  return { app, deps };
}

test("boot-session: a spent or invalid token gets the exact documented 401 body", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/boot-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "not-a-real-token" }),
  });

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid or spent boot token", code: "UNAUTHENTICATED" });
  assert.equal(res.headers.get("set-cookie"), null, "a rejected redemption must not set a cookie");
});

test("boot-session: a freshly minted token mints a real, authenticating session", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const ownerId = await deps.ownerPrincipalId;
  const token = mintBootSessionToken();

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/boot-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });

  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { user: { id: ownerId } });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert.match(cookie ?? "", /^tovu_session=\S+$/, "expected a real tovu_session cookie");

  // 2026-09-06: `mintSessionForPrincipal` now delegates to `@jini-ai/cms/identity`'s shared
  // `createSessionForPrincipal` minter instead of hand-rolling its own base64url token here --
  // closing the hash-drift/encoding-drift risk this route's own doc used to flag. The raw token
  // is now hex-encoded, the same shape `newRawToken()` produces for a password login.
  const rawToken = decodeURIComponent((cookie ?? "").split("=")[1] ?? "");
  assert.match(rawToken, /^[0-9a-f]{64}$/, "expected a 64-char lowercase hex raw token (shared minter's shape)");

  // The proof this is an ORDINARY session, not a bypass (see `dev-auth.ts`'s own doc): the cookie
  // this route set must authenticate exactly like a password login's would, through the same
  // `requireAdminSession` gate every other admin route sits behind.
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie: cookie as string } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { user: { id: string } }).user.id, ownerId);
});

test("boot-session: single-use survives the ROUTE, not just the token store — a replay gets the same 401", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const token = mintBootSessionToken();

  const first = await fetch(`${baseUrl}/api/admin/v1/auth/boot-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(first.status, 200);

  const replay = await fetch(`${baseUrl}/api/admin/v1/auth/boot-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(replay.status, 401);
  assert.deepEqual(await replay.json(), { error: "invalid or spent boot token", code: "UNAUTHENTICATED" });
});

test("boot-session: the loopback guard runs BEFORE the token is even looked at", async () => {
  // Unreachable through a real HTTP request in this test environment — `fetch` against `127.0.0.1`
  // always arrives as a loopback peer, so there is no way to make a REAL request that fails this
  // check. Same accepted exception `extractRouteHandler`'s own doc names: invoke the real, registered
  // handler directly with a hand-built non-loopback `req`, exactly as it documents as the one narrow
  // case where bypassing real HTTP is correct rather than a shortcut.
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/auth/boot-session");
  const token = mintBootSessionToken();

  const jsonCalls: unknown[] = [];
  let statusCode = 200;
  const fakeRes = {
    status(code: number) {
      statusCode = code;
      return fakeRes;
    },
    json(body: unknown) {
      jsonCalls.push(body);
      return fakeRes;
    },
  };
  const fakeReq = { socket: { remoteAddress: "203.0.113.5" }, body: { token } };

  await handler(fakeReq, fakeRes);

  assert.equal(statusCode, 403);
  assert.deepEqual(jsonCalls, [{ error: "boot-session is loopback-only", code: "FORBIDDEN" }]);
});

// Sanity-check that `bootAuthenticated`/a password login is completely unaffected by this route
// existing (SPEC-006's pre-existing login path) — cheap regression guard for the composition change
// `buildTestApp` mirrors from `admin-widgets-routes.test.ts`.
test("boot-session route coexisting with the login route changes nothing about ordinary login", async (t) => {
  const { app } = buildTestApp();
  const { cookie } = await bootAuthenticated(app, t);
  assert.match(cookie, /^tovu_session=\S+$/);
});
