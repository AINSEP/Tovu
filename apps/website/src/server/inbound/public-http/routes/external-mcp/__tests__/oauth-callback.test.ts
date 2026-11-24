import assert from "node:assert/strict";
import { get } from "node:http";
import test from "node:test";

import express from "express";

import { ExternalMcpValidationError } from "../../../../../../features/external-mcp/external-mcp-store.js";
import { type ExternalMcpOAuthService } from "../../../../../../features/external-mcp/contracts.js";
import { OAuthError } from "@jini-ai/oauth";
import { createRateLimiter, type RateLimiter, type RateLimitResult } from "#src/contracts/core/rate-limit/rate-limit";
import { extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerExternalMcpOAuthCallbackRoute, type ExternalMcpOAuthCallbackRouteDeps } from "#src/server/runtime/composition/public-oauth-callbacks";
import { clearedBrowserBindingCookie, EXTERNAL_MCP_BROWSER_BINDING } from "#src/features/api-connections/browser-binding";
import type { OAuthCallbackFailureReason } from "@jini-ai/core/contracts/site/oauth-callback-page";
import { EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE, renderOAuthCallbackPage } from "#src/server/inbound/public-http/routes/oauth/callback-page";

/**
 * @file Route-level tests for the closed OAuth-callback failure-reason vocabulary
 * (`rate_limited | no_state | state_expired | provider_denied | exchange_failed | server_unknown`).
 *
 * Isolated from `src/server/__tests__/admin-external-mcp-oauth-routes.test.ts` on purpose: that file
 * drives a REAL `ExternalMcpOAuthService` through a scripted token endpoint to prove the wire-level
 * properties only a real handshake can prove (a full connect → callback round trip, secrets never
 * crossing the wire). This file's job is narrower and different — proving each of the six reasons
 * renders its own copy and its own `postMessage` payload, and that NOTHING a thrown error carries
 * (an `OAuthError.message`, an `OAuthError.providerErrorCode`, an `ExternalMcpValidationError.message`)
 * ever reaches the response. A scripted `ExternalMcpOAuthService` fake reaches every branch directly,
 * without needing a real token endpoint per reason.
 *
 * Every failure reason renders the SAME heading the page has always used ("Couldn't finish
 * connecting") — see `callback-page.ts`'s `FAILURE_HEADING` doc for why, and note that this is also
 * what keeps `admin-external-mcp-oauth-routes.test.ts`'s two pre-existing `/Couldn't finish
 * connecting/` assertions (for its own no-state and invalid-state cases) passing unchanged. The
 * specific reason lives in the body copy and in the `postMessage` payload's `reason` field instead.
 */

const SERVER_ID = "higgs";
const BROWSER_BINDING = 'a'.repeat(43);
const BROWSER_HEADERS = { cookie: `__Secure-tovu_mcp_binding=${BROWSER_BINDING}` };

test('missing, malformed and duplicate browser proof stops before the OAuth service', async t => {
  let calls = 0;
  const baseUrl = await startTestServer(buildApp({ oauth: fakeOAuthService(async () => { calls++; }), callbackLimiter: fixedRateLimiter({ allowed: true }) }), t);
  for (const cookie of ['', '__Secure-tovu_mcp_binding=bad', `${BROWSER_HEADERS.cookie}; ${BROWSER_HEADERS.cookie}`]) {
    const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: { cookie } });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /same browser/);
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
  }
  assert.equal(calls, 0);
});

/** A `RateLimiter` double that always answers the same fixed result — this suite only needs to
 *  choose "the limiter allows" vs. "the limiter is already tripped", never real window counting. */
function fixedRateLimiter(result: RateLimitResult): RateLimiter {
  return { check: async ({ key: _key }) => result };
}

/** An `ExternalMcpOAuthService` double. Every method the callback route does not call throws if
 *  reached, so a test that accidentally exercises the wrong path fails loudly instead of silently
 *  returning a stub value. `completeAuthorizationCallback` is the one method this route calls. */
function fakeOAuthService(completeAuthorizationCallback: ExternalMcpOAuthService["completeAuthorizationCallback"]): ExternalMcpOAuthService {
  const notUsedByThisRoute = (): never => {
    throw new Error("not used by the callback route");
  };
  return {
    beginConnect: notUsedByThisRoute,
    completeAuthorizationCallback,
    pollDeviceAuthorization: notUsedByThisRoute,
    disconnect: notUsedByThisRoute,
    reportAuthFailure: notUsedByThisRoute,
    tokenResolver: { resolveAccessToken: notUsedByThisRoute },
  };
}

function buildApp(deps: ExternalMcpOAuthCallbackRouteDeps): express.Express {
  const app = express();
  registerExternalMcpOAuthCallbackRoute({ app, deps });
  return app;
}

/** Extracts the JSON `postMessage` payload embedded in the rendered page's script. */
function extractPostMessagePayload(html: string): unknown {
  const match = /window\.opener\.postMessage\((\{.*?\}), window\.location\.origin\)/.exec(html);
  assert.ok(match, "expected a window.opener.postMessage(...) call in the rendered page");
  return JSON.parse(match[1]);
}

test("rate_limited: the limiter's own 429, before the service is ever called", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(() => {
      throw new Error("must not be reached — the rate limiter should stop the request first");
    }),
    callbackLimiter: fixedRateLimiter({ allowed: false, retryAfterSeconds: 30 }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s`);
  const html = await response.text();

  assert.equal(response.status, 429);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /Too many attempts/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "rate_limited" });
});

test("no_state: an empty state is refused before the service is ever called", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(() => {
      throw new Error("must not be reached — an empty state should be refused first");
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}`);
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /wasn’t reached from a connection Tovu started/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "no_state" });
});

test("state_expired: OAUTH_INVALID_STATE from the service — covers tampered, expired and wrongly-bound state", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new OAuthError({ code: "OAUTH_INVALID_STATE", message: "the authorization request could not be matched — it may have expired or already been used", operatorAction: "Start the connection again from Settings → External MCP." });
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=stale-state&code=c`, { headers: BROWSER_HEADERS });
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /no longer valid/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "state_expired" });
});

test("provider_denied: OAUTH_ACCESS_DENIED — the operator declined, or the provider denied the grant", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new OAuthError({ code: "OAUTH_ACCESS_DENIED", message: "authorization was declined", operatorAction: "Approve the request on the provider's consent screen, then connect again." }, { providerErrorCode: "access_denied" });
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&error=access_denied`, { headers: BROWSER_HEADERS });
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /declined on the provider’s side/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "provider_denied" });
});

test("server_unknown: ExternalMcpValidationError — the serverId in the URL names no configured connection", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new ExternalMcpValidationError(`no external MCP server is configured as '${SERVER_ID}'`, "id");
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: BROWSER_HEADERS });
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /connection could not be found/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "server_unknown" });
});

test("exchange_failed: every other OAuthError code — and every non-OAuth error — falls back to the generic reason", async (t) => {
  const rejectedDeps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new OAuthError({ code: "OAUTH_PROVIDER_REJECTED", message: "the authorization server refused the authorization request", operatorAction: "Check this provider's client id, scopes and redirect URI, then try connecting again." }, { providerErrorCode: "invalid_scope" });
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const rejectedBaseUrl = await startTestServer(buildApp(rejectedDeps), t);
  const rejectedResponse = await fetch(`${rejectedBaseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: BROWSER_HEADERS });
  const rejectedHtml = await rejectedResponse.text();

  assert.equal(rejectedResponse.status, 400);
  assert.deepEqual(extractPostMessagePayload(rejectedHtml), { type: "tovu:external-mcp-connected", reason: "exchange_failed" });

  const thrownDeps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new Error("unexpected: token endpoint connection reset");
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const thrownBaseUrl = await startTestServer(buildApp(thrownDeps), t);
  const thrownResponse = await fetch(`${thrownBaseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: BROWSER_HEADERS });
  const thrownHtml = await thrownResponse.text();

  assert.equal(thrownResponse.status, 400);
  assert.deepEqual(extractPostMessagePayload(thrownHtml), { type: "tovu:external-mcp-connected", reason: "exchange_failed" });
});

test("ok: true carries no reason at all — there is nothing to react to on success", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      /* completes without throwing */
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: BROWSER_HEADERS });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Connected/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected" });
});

test("no provider response text, in any form, ever reaches the response — the security-critical property", async (t) => {
  const PROVIDER_SECRET_MARKER = "PROVIDER_LEAKED_INTERNAL_TENANT_acme-secret-9f31";
  const cases: ReadonlyArray<{ readonly name: string; readonly error: unknown }> = [
    {
      name: "provider-denied with a providerErrorCode carrying the marker",
      error: new OAuthError({ code: "OAUTH_ACCESS_DENIED", message: "authorization was declined", operatorAction: "Approve the request on the provider's consent screen, then connect again." }, { providerErrorCode: PROVIDER_SECRET_MARKER }),
    },
    {
      name: "provider-rejected with the marker in both message and providerErrorCode",
      error: new OAuthError({ code: "OAUTH_PROVIDER_REJECTED", message: `the authorization server refused: ${PROVIDER_SECRET_MARKER}`, operatorAction: "Check this provider's client id, scopes and redirect URI, then try connecting again." }, { providerErrorCode: PROVIDER_SECRET_MARKER }),
    },
    {
      name: "an unexpected error whose own message carries the marker",
      error: new Error(`connection reset while talking to token endpoint: ${PROVIDER_SECRET_MARKER}`),
    },
    {
      name: "a validation error naming the marker",
      error: new ExternalMcpValidationError(`no external MCP server is configured as '${PROVIDER_SECRET_MARKER}'`, "id"),
    },
  ];

  for (const { name, error } of cases) {
    const deps: ExternalMcpOAuthCallbackRouteDeps = {
      oauth: fakeOAuthService(async () => {
        throw error;
      }),
      callbackLimiter: fixedRateLimiter({ allowed: true }),
    };
    const baseUrl = await startTestServer(buildApp(deps), t);

    const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: BROWSER_HEADERS });
    const html = await response.text();

    assert.equal(response.status, 400, name);
    assert.ok(!html.includes(PROVIDER_SECRET_MARKER), `${name}: the marker must never appear in the response`);
  }
});

test("callback forwards the exact server, callback URI and normalized query fields", async (t) => {
  const calls: unknown[] = [];
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async (input) => { calls.push(input); }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);
  const cases = [
    { query: "state=s&code=c&error=denied&ignored=extra", status: 200, params: { state: "s", code: "c", error: "denied" } },
    { query: "state=s&code=&error=", status: 200, params: { state: "s" } },
    { query: "state=s&code=c1&code=c2&error=e1&error=e2", status: 200, params: { state: "s" } },
    { query: "state=s1&state=s2&code=c", status: 400 },
    { query: "state=&code=c", status: 400 },
  ];
  for (const scenario of cases) {
    const before = calls.length;
    const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?${scenario.query}`, { headers: BROWSER_HEADERS });
    assert.equal(response.status, scenario.status, scenario.query);
    assert.deepEqual(calls.slice(before), scenario.params ? [{ serverId: SERVER_ID,
      redirectUri: `${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}`, params: scenario.params, browserBinding: BROWSER_BINDING }] : []);
  }
});

test("callback URI includes the trusted public origin but excludes provider query parameters", async (t) => {
  const previous = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://public.example.com";
  t.after(() => {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  });
  const calls: unknown[] = [];
  const baseUrl = await startTestServer(buildApp({
    oauth: fakeOAuthService(async input => { calls.push(input); }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  }), t);
  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c&ignored=x`, { headers: BROWSER_HEADERS });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ serverId: SERVER_ID,
    redirectUri: `https://public.example.com/api/mcp-servers/oauth/callback/${SERVER_ID}`, params: { state: "s", code: "c" }, browserBinding: BROWSER_BINDING }]);
});

test("callback IP budgets stay independent after another client exhausts its allowance", async (t) => {
  let exchanges = 0;
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => { exchanges++; }),
    callbackLimiter: createRateLimiter({
      profile: { max: 2, burst: 0, windowSeconds: 60 },
      clock: { nowMs: () => Date.parse("2026-01-01T00:00:00.000Z") },
    }),
  };
  const app = buildApp(deps);
  // The test's loopback peer is explicitly trusted so Express resolves each forwarded IP.
  app.set("trust proxy", "loopback");
  const baseUrl = await startTestServer(app, t);
  for (const ip of ["203.0.113.1", "203.0.113.2"]) {
    for (const expectedStatus of [400, 400, 429]) {
      const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}`, {
        headers: { "x-forwarded-for": ip },
      });
      assert.equal(response.status, expectedStatus, `${ip} must receive its own two-request budget`);
      const html = await response.text();
      assert.deepEqual(extractPostMessagePayload(html), {
        type: "tovu:external-mcp-connected",
        reason: expectedStatus === 429 ? "rate_limited" : "no_state",
      });
    }
  }
  assert.equal(exchanges, 0, "no state means no outbound exchange, even below the limit");
});

test("route-param guard: a handler reached without a :serverId param forwards an empty server id instead of the string \"undefined\"", async (t) => {
  const seen: Array<{ serverId: string; redirectUri: string }> = [];
  const routed = buildApp({
    oauth: fakeOAuthService(async (input) => {
      seen.push({ serverId: input.serverId, redirectUri: input.redirectUri });
      throw new ExternalMcpValidationError("no such server", "id");
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  });
  const handler = extractRouteHandler(routed, "get", "/api/mcp-servers/oauth/callback/:serverId");
  const bare = express();
  bare.get("/no-param", handler as express.RequestHandler);
  const errors = t.mock.method(console, "error", () => {});
  const baseUrl = await startTestServer(bare, t);
  const response = await fetch(`${baseUrl}/no-param?state=s&code=c`, { headers: BROWSER_HEADERS });

  assert.equal(response.status, 400);
  assert.deepEqual(extractPostMessagePayload(await response.text()), { type: "tovu:external-mcp-connected", reason: "server_unknown" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.serverId, "");
  assert.match(seen[0]!.redirectUri, /\/api\/mcp-servers\/oauth\/callback\/$/);
  assert.equal(errors.mock.callCount(), 1);
});

test("a non-Error rejection is logged by its string form and still renders the generic exchange_failed page", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw "socket hang up";
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const errors = t.mock.method(console, "error", () => {});
  const baseUrl = await startTestServer(buildApp(deps), t);
  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`, { headers: BROWSER_HEADERS });

  assert.equal(response.status, 400);
  assert.deepEqual(extractPostMessagePayload(await response.text()), { type: "tovu:external-mcp-connected", reason: "exchange_failed" });
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [["external-mcp oauth callback failed: socket hang up"]]);
});

// ---- Wire parity with the hand-written route this registrar replaced (Tovu `6fdb2cf25f^1`,
// `inbound/public-http/routes/external-mcp/oauth-callback.ts`). That route wrote every page with
// Express `res.send`, so each answer carried a weak ETag (and answered a matching If-None-Match with
// 304). `legacyPage` below is its writer, copied as it stood; the mounted Jini route must answer the
// same status, headers and body.

/** The legacy writer: headers set up front, the binding cookie appended once read, then `res.send`. */
function legacyPage({ status, reason, cleared }: { status: number; reason?: OAuthCallbackFailureReason; cleared: boolean }): express.Express {
  const app = express();
  app.get(`/api/mcp-servers/oauth/callback/:serverId`, (_req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (cleared) res.append('Set-Cookie', clearedBrowserBindingCookie({}, EXTERNAL_MCP_BROWSER_BINDING));
    res.status(status).type("html").send(renderOAuthCallbackPage(reason ? { ok: false, reason, messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE } : { ok: true, messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE }));
  });
  return app;
}

/** Status, body and every header but the per-response `Date`, by name. */
async function wire(response: Response): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers = Object.fromEntries([...response.headers].filter(([name]) => name !== "date"));
  return { status: response.status, headers, body: await response.text() };
}

test("wire parity: every answer is the hand-written route's res.send answer (weak ETag, length, type, no-store, no-referrer, cleared cookie) byte for byte", async (t) => {
  const denied = new OAuthError({ code: "OAUTH_ACCESS_DENIED", message: "authorization was declined", operatorAction: "Approve the request on the provider's consent screen, then connect again." }, { providerErrorCode: "access_denied" });
  const cases: readonly { label: string; deps: ExternalMcpOAuthCallbackRouteDeps; query: string; headers: Record<string, string>; legacy: { status: number; reason?: OAuthCallbackFailureReason; cleared: boolean } }[] = [
    { label: "rate_limited", deps: { oauth: fakeOAuthService(async () => {}), callbackLimiter: fixedRateLimiter({ allowed: false, retryAfterSeconds: 30 }) }, query: "?state=s&code=c", headers: BROWSER_HEADERS, legacy: { status: 429, reason: "rate_limited", cleared: false } },
    { label: "no_state", deps: { oauth: fakeOAuthService(async () => {}), callbackLimiter: fixedRateLimiter({ allowed: true }) }, query: "?code=c", headers: BROWSER_HEADERS, legacy: { status: 400, reason: "no_state", cleared: false } },
    { label: "browser_mismatch", deps: { oauth: fakeOAuthService(async () => {}), callbackLimiter: fixedRateLimiter({ allowed: true }) }, query: "?state=s&code=c", headers: {}, legacy: { status: 400, reason: "browser_mismatch", cleared: true } },
    { label: "provider_denied", deps: { oauth: fakeOAuthService(async () => { throw denied; }), callbackLimiter: fixedRateLimiter({ allowed: true }) }, query: "?state=s&code=c", headers: BROWSER_HEADERS, legacy: { status: 400, reason: "provider_denied", cleared: true } },
    { label: "success", deps: { oauth: fakeOAuthService(async () => {}), callbackLimiter: fixedRateLimiter({ allowed: true }) }, query: "?state=s&code=c", headers: BROWSER_HEADERS, legacy: { status: 200, cleared: true } },
  ];
  const errors = t.mock.method(console, "error", () => {});
  for (const { label, deps, query, headers, legacy } of cases) {
    const path = `/api/mcp-servers/oauth/callback/${SERVER_ID}${query}`;
    const mounted = await wire(await fetch(`${await startTestServer(buildApp(deps), t)}${path}`, { headers }));
    const handWritten = await wire(await fetch(`${await startTestServer(legacyPage(legacy), t)}${path}`, { headers }));
    assert.match(mounted.headers.etag ?? "", /^W\/"/, `${label}: res.send's weak ETag`);
    assert.deepEqual(mounted, handWritten, label);
  }
  // The one failure above logged as the hand-written route logged it: label, then the full message.
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [["external-mcp oauth callback failed: authorization was declined"]]);
});

test("wire parity: a repeat success request carrying the page's ETag is answered 304 with no body, as res.send answered it", async (t) => {
  const baseUrl = await startTestServer(buildApp({ oauth: fakeOAuthService(async () => {}), callbackLimiter: fixedRateLimiter({ allowed: true }) }), t);
  const url = `${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`;
  const first = await fetch(url, { headers: BROWSER_HEADERS });
  const etag = first.headers.get("etag") ?? "";
  assert.equal(first.status, 200);
  // Raw `node:http`, not `fetch`: fetch adds `Cache-Control: no-cache` to a conditional request, which Express (rightly) never answers 304.
  const again = await new Promise<{ status: number | undefined; etag: string | undefined; body: string }>((resolve, reject) => {
    get(url, { headers: { ...BROWSER_HEADERS, "if-none-match": etag } }, (response) => {
      let body = "";
      response.setEncoding("utf8").on("data", (chunk: string) => { body += chunk; }).on("end", () => resolve({ status: response.statusCode, etag: response.headers.etag, body }));
    }).on("error", reject);
  });
  assert.deepEqual(again, { status: 304, etag, body: "" });
});
