/**
 * @file Coverage for `desktop-auth.ts`.
 *
 * The security-relevant assertions here are the negative ones. `assertLoopbackAdminUrl` is the
 * client-side half of what stands between a boot token and the network, so it is tested against the
 * inputs that would defeat a naive check — a hostname that merely CONTAINS a loopback literal, a
 * userinfo prefix, a public address — not just one happy path and one obvious reject. The server
 * proves loopback independently at its own route; neither side trusts the other.
 *
 * `redeemBootSession` is exercised against a fake `net`: what a unit test can prove is that a
 * non-200 becomes `{ok:false}` instead of throwing (the caller falls through to the login form on
 * that branch) and that `useSessionCookies` is actually requested. The end-to-end proof is the
 * authenticated case in `development/e2e/desktop-shell.spec.ts`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import { assertLoopbackAdminUrl, sitePartition, redeemBootSession, hasActiveSessionCookie, hasValidSession, ensureSiteSession, endSiteSession } from "./desktop-auth.ts";
import type { AuthRequestOptions } from "./desktop-auth.ts";

// --------------------------------------------------------------------------
// assertLoopbackAdminUrl — the network guard
// --------------------------------------------------------------------------

test("accepts the loopback origins a spawned child actually binds", () => {
  for (const url of ["http://127.0.0.1:3001/admin/", "http://127.0.0.1:65535/", "http://[::1]:3001/admin/"]) {
    assert.doesNotThrow(() => assertLoopbackAdminUrl(url), `expected ${url} to be accepted`);
  }
});

test("refuses every non-loopback host, including ones that merely LOOK loopback", () => {
  const hostile = [
    "http://evil.example.com/admin/",
    // Contains the loopback literal as a substring — defeats a naive `includes()` check.
    "http://127.0.0.1.evil.example.com/admin/",
    "http://not-127.0.0.1/admin/",
    // Userinfo makes the real host the part AFTER the `@`.
    "http://127.0.0.1@evil.example.com/admin/",
    // A NAME, not an address: resolvable through /etc/hosts or DNS to anywhere.
    "http://localhost:3001/admin/",
    // Public addresses, including one on a private LAN.
    "http://10.0.0.5:3001/admin/",
    "http://192.168.1.10:3001/admin/",
    "http://0.0.0.0:3001/admin/",
  ];
  for (const url of hostile) {
    assert.throws(() => assertLoopbackAdminUrl(url), /desktop sign-in refused/, `expected ${url} to be refused`);
  }
});

test("refuses non-http schemes and unparseable input", () => {
  for (const url of ["https://127.0.0.1:3001/", "file:///etc/passwd", "ftp://127.0.0.1/", "not a url"]) {
    assert.throws(() => assertLoopbackAdminUrl(url), /desktop sign-in refused/, `expected ${url} to be refused`);
  }
});

// --------------------------------------------------------------------------
// sitePartition — one cookie jar per site
// --------------------------------------------------------------------------

test("every site dir gets its own partition, and the same dir always gets the same one", () => {
  const a = sitePartition("/sites/alpha");
  const b = sitePartition("/sites/beta");
  assert.notEqual(a, b);
  assert.equal(a, sitePartition("/sites/alpha"));
  // Path-equivalent spellings must not produce two jars for one site.
  assert.equal(a, sitePartition("/sites/./alpha"));
  assert.match(a, /^persist:tovu-site-[0-9a-f]{32}$/);
});

test("the partition name does not leak the operator's directory layout", () => {
  assert.equal(sitePartition("/Users/someone/Secret Client Work/site").includes("Secret"), false);
});

// --------------------------------------------------------------------------
// redeemBootSession
// --------------------------------------------------------------------------

/** A fake request: an EventEmitter wearing the one request method every caller uses. */
type FakeRequest = EventEmitter & { end: () => void };

/** A fake request that can also carry a body, as `redeemBootSession`'s does. */
type FakeBodyRequest = FakeRequest & { setHeader: () => void; write: (body: string) => void; body?: string };

/** A fake response: an EventEmitter with a status. */
type FakeResponse = EventEmitter & { statusCode: number };

/** One recorded `net.request` call, with the body its request was sent. */
type RecordedCall = AuthRequestOptions<unknown> & { body?: string };

/** Minimal Electron `net` stand-in that answers with `statusCode` and records the request. */
function fakeNet(statusCode: number) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    request(options: AuthRequestOptions<unknown>) {
      calls.push(options);
      const request = new EventEmitter() as FakeBodyRequest;
      request.setHeader = () => {};
      request.write = (body) => {
        request.body = body;
        calls[calls.length - 1]!.body = body;
      };
      request.end = () => {
        const response = new EventEmitter() as FakeResponse;
        response.statusCode = statusCode;
        request.emit("response", response);
        queueMicrotask(() => response.emit("end"));
      };
      return request;
    },
  };
}

const REDEEM_INPUT = {
  session: { id: "fake" },
  adminUrl: "http://127.0.0.1:3001/admin/",
  bootToken: "tok-abc",
};

test("a 200 redemption reports success", async () => {
  assert.deepEqual(await redeemBootSession({ ...REDEEM_INPUT, net: fakeNet(200) }), { ok: true, status: 200 });
});

test("a 401 RESOLVES as not-ok rather than throwing — the caller falls through to the login form", async () => {
  const result = await redeemBootSession({ ...REDEEM_INPUT, net: fakeNet(401) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("a 403 (non-loopback, refused at the route) also resolves rather than throwing", async () => {
  const result = await redeemBootSession({ ...REDEEM_INPUT, net: fakeNet(403) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("posts the token to the boot-session route, with useSessionCookies", async () => {
  // Without `useSessionCookies` Chromium never STORES the cookie, and the whole mechanism becomes a
  // silent no-op while every other signal still looks healthy.
  const net = fakeNet(200);
  await redeemBootSession({ ...REDEEM_INPUT, net });
  assert.equal(net.calls[0]!.useSessionCookies, true);
  assert.equal(net.calls[0]!.session, REDEEM_INPUT.session);
  assert.equal(net.calls[0]!.url, "http://127.0.0.1:3001/api/admin/v1/auth/boot-session");
  assert.equal(net.calls[0]!.method, "POST");
  assert.deepEqual(JSON.parse(net.calls[0]!.body!), { token: "tok-abc" });
});

test("refuses to put the token on the wire for a non-loopback admin url", async () => {
  const net = fakeNet(200);
  await assert.rejects(
    () => redeemBootSession({ ...REDEEM_INPUT, adminUrl: "http://evil.example.com/admin/", net }),
    /desktop sign-in refused/,
  );
  assert.deepEqual(net.calls, [], "no request may be made at all");
});

// --------------------------------------------------------------------------
// hasActiveSessionCookie — the reuse-on-launch check
// --------------------------------------------------------------------------

/** Minimal Electron `Session` stand-in exposing only what `hasActiveSessionCookie` reads. */
function fakeSession(cookies: unknown[]) {
  const calls: { name: string }[] = [];
  return {
    calls,
    cookies: {
      get(filter: { name: string }) {
        calls.push(filter);
        return Promise.resolve(cookies);
      },
    },
  };
}

test("reports no active session when the partition's cookie jar is empty", async () => {
  const fake = fakeSession([]);
  assert.equal(await hasActiveSessionCookie({ session: fake }), false);
});

test("reports an active session when the partition already carries a tovu_session cookie", async () => {
  const fake = fakeSession([{ name: "tovu_session", value: "opaque" }]);
  assert.equal(await hasActiveSessionCookie({ session: fake }), true);
});

test("looks the cookie up by NAME only — a port-scoped filter would never match a reused partition", async () => {
  const fake = fakeSession([]);
  await hasActiveSessionCookie({ session: fake });
  assert.deepEqual(fake.calls, [{ name: "tovu_session" }]);
});

// --------------------------------------------------------------------------
// endSiteSession
// --------------------------------------------------------------------------

const LOGOUT_INPUT = {
  session: { id: "fake" },
  adminUrl: "http://127.0.0.1:3001/admin/",
};

test("a 200 logout reports success", async () => {
  assert.deepEqual(await endSiteSession({ ...LOGOUT_INPUT, net: fakeNet(200) }), { ok: true, status: 200 });
});

test("a non-200 logout RESOLVES as not-ok rather than throwing", async () => {
  const result = await endSiteSession({ ...LOGOUT_INPUT, net: fakeNet(500) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
});

test("posts to the logout route, with useSessionCookies, so the revoke reaches THIS site's cookie", async () => {
  const net = fakeNet(200);
  await endSiteSession({ ...LOGOUT_INPUT, net });
  assert.equal(net.calls[0]!.useSessionCookies, true);
  assert.equal(net.calls[0]!.session, LOGOUT_INPUT.session);
  assert.equal(net.calls[0]!.url, "http://127.0.0.1:3001/api/admin/v1/auth/logout");
  assert.equal(net.calls[0]!.method, "POST");
});

test("refuses to call logout for a non-loopback admin url", async () => {
  const net = fakeNet(200);
  await assert.rejects(
    () => endSiteSession({ ...LOGOUT_INPUT, adminUrl: "http://evil.example.com/admin/", net }),
    /desktop sign-in refused/,
  );
  assert.deepEqual(net.calls, [], "no request may be made at all");
});

// --------------------------------------------------------------------------
// hasValidSession — DS-01: presence is not validity
// --------------------------------------------------------------------------

/** One session cookie, in the shape `session.cookies.get` returns — reuses this file's own
 *  `fakeSession` rather than adding a second helper of the same name. */
const ONE_COOKIE = [{ name: "tovu_session", value: "opaque" }];

const PROBE_INPUT = { adminUrl: "http://127.0.0.1:3001/admin/" };

test("hasValidSession is false for a cookie the server no longer honours — the whole of DS-01", async () => {
  // `hasActiveSessionCookie` answered `cookies.length > 0`. `main.js` then set
  // `emitBootToken: !alreadyAuthenticated` and skipped `authenticateSiteSession`, so a cookie whose
  // server-side row is gone (a restore-point rollback, a stale-session cleanup, any server-side
  // revoke the desktop did not perform itself) produced a 401 admin with NO boot token minted and
  // no password to fall back on.
  const net = fakeNet(401);
  assert.equal(await hasValidSession({ ...PROBE_INPUT, session: fakeSession(ONE_COOKIE), net }), false);
  assert.equal(net.calls[0]!.url, "http://127.0.0.1:3001/api/admin/v1/auth/me");
  assert.equal(net.calls[0]!.useSessionCookies, true, "without this the probe asks as an anonymous caller and ALWAYS reports 401");
  assert.equal(net.calls[0]!.method, "GET");
});

test("hasValidSession is true only when the server itself confirms the session", async () => {
  assert.equal(await hasValidSession({ ...PROBE_INPUT, session: fakeSession(ONE_COOKIE), net: fakeNet(200) }), true);
});

test("hasValidSession asks the server nothing when there is no cookie to ask about", async () => {
  // The cheap negative. A brand-new partition has no cookie, and a request that can only ever
  // answer 401 is a round trip on the critical path of every first site open.
  const net = fakeNet(200);
  assert.equal(await hasValidSession({ ...PROBE_INPUT, session: fakeSession([]), net }), false);
  assert.deepEqual(net.calls, []);
});

test("hasValidSession treats an unreachable server as not-authenticated rather than throwing", async () => {
  // Same fail-open contract as every other branch in this file: a transport error must mean "mint a
  // token and try", never a rejected promise that takes the site open down with it.
  const net = { request: () => { const r = new EventEmitter() as FakeRequest; r.end = () => queueMicrotask(() => r.emit("error", new Error("ECONNREFUSED"))); return r; } };
  assert.equal(await hasValidSession({ ...PROBE_INPUT, session: fakeSession(ONE_COOKIE), net }), false);
});

test("hasValidSession refuses a non-loopback origin, exactly like the other two callers", async () => {
  await assert.rejects(
    () => hasValidSession({ adminUrl: "http://evil.example.com/admin/", session: fakeSession(ONE_COOKIE), net: fakeNet(200) }),
    /desktop sign-in refused/,
  );
});

// --------------------------------------------------------------------------
// ensureSiteSession — the decision main.js used to make inline
// --------------------------------------------------------------------------

function recordingRedeem(answer = true) {
  const calls: number[] = [];
  return { calls, redeem: async () => { calls.push(1); return answer; } };
}

test("ensureSiteSession redeems NOTHING when the server confirms the existing session", async () => {
  // The 713-live-rows property, preserved. Always EMITTING a boot token is cheap and inert; always
  // REDEEMING one is what piled up a 30-day session per launch. Only this branch protects that.
  const { calls, redeem } = recordingRedeem();
  const result = await ensureSiteSession({ ...PROBE_INPUT, session: fakeSession(ONE_COOKIE), net: fakeNet(200), redeem });
  assert.deepEqual(result, { authenticated: true, redeemed: false });
  assert.deepEqual(calls, []);
});

test("ensureSiteSession redeems when the cookie is stale — the recovery DS-01 had none of", async () => {
  const { calls, redeem } = recordingRedeem();
  const result = await ensureSiteSession({ ...PROBE_INPUT, session: fakeSession(ONE_COOKIE), net: fakeNet(401), redeem });
  assert.deepEqual(result, { authenticated: true, redeemed: true });
  assert.deepEqual(calls, [1], "exactly one redeem, not a retry loop");
});

test("ensureSiteSession redeems for a brand-new partition with no cookie at all", async () => {
  const { calls, redeem } = recordingRedeem();
  await ensureSiteSession({ ...PROBE_INPUT, session: fakeSession([]), net: fakeNet(200), redeem });
  assert.deepEqual(calls, [1]);
});

test("ensureSiteSession reports a failed redeem honestly rather than claiming a session", async () => {
  // Fail-open to the login form is the contract; fail-open to a LIE about being signed in is not.
  const { redeem } = recordingRedeem(false);
  const result = await ensureSiteSession({ ...PROBE_INPUT, session: fakeSession([]), net: fakeNet(401), redeem });
  assert.deepEqual(result, { authenticated: false, redeemed: true });
});
