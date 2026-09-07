/**
 * @file Coverage for `desktop-auth.cjs`.
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

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const {
  assertLoopbackAdminUrl,
  sitePartition,
  redeemBootSession,
  hasActiveSessionCookie,
  endSiteSession,
} = require("./desktop-auth.cjs");

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

/** Minimal Electron `net` stand-in that answers with `statusCode` and records the request. */
function fakeNet(statusCode) {
  const calls = [];
  return {
    calls,
    request(options) {
      calls.push(options);
      const request = new EventEmitter();
      request.setHeader = () => {};
      request.write = (body) => {
        request.body = body;
        calls[calls.length - 1].body = body;
      };
      request.end = () => {
        const response = new EventEmitter();
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
  assert.equal(net.calls[0].useSessionCookies, true);
  assert.equal(net.calls[0].session, REDEEM_INPUT.session);
  assert.equal(net.calls[0].url, "http://127.0.0.1:3001/api/admin/v1/auth/boot-session");
  assert.equal(net.calls[0].method, "POST");
  assert.deepEqual(JSON.parse(net.calls[0].body), { token: "tok-abc" });
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
function fakeSession(cookies) {
  const calls = [];
  return {
    calls,
    cookies: {
      get(filter) {
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
  assert.equal(net.calls[0].useSessionCookies, true);
  assert.equal(net.calls[0].session, LOGOUT_INPUT.session);
  assert.equal(net.calls[0].url, "http://127.0.0.1:3001/api/admin/v1/auth/logout");
  assert.equal(net.calls[0].method, "POST");
});

test("refuses to call logout for a non-loopback admin url", async () => {
  const net = fakeNet(200);
  await assert.rejects(
    () => endSiteSession({ ...LOGOUT_INPUT, adminUrl: "http://evil.example.com/admin/", net }),
    /desktop sign-in refused/,
  );
  assert.deepEqual(net.calls, [], "no request may be made at all");
});
