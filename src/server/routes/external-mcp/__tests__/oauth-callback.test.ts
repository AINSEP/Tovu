import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { ExternalMcpValidationError, type ExternalMcpOAuthService } from "#src/assistant/index";
import { OAuthError } from "#src/platform/oauth/index";
import type { RateLimiter, RateLimitResult } from "#src/contracts/core/rate-limit/rate-limit";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { registerExternalMcpOAuthCallbackRoute, type ExternalMcpOAuthCallbackRouteDeps } from "../oauth-callback.js";

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

/** A `RateLimiter` double that always answers the same fixed result — this suite only needs to
 *  choose "the limiter allows" vs. "the limiter is already tripped", never real window counting. */
function fixedRateLimiter(result: RateLimitResult): RateLimiter {
  return { check: () => result };
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
    tokenResolver: { resolveAccessToken: notUsedByThisRoute },
  };
}

function buildApp(deps: ExternalMcpOAuthCallbackRouteDeps): express.Express {
  const app = express();
  registerExternalMcpOAuthCallbackRoute(app, deps);
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

test("state_expired: OAUTH_INVALID_STATE from the service — covers unknown, expired and replayed alike", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new OAuthError("OAUTH_INVALID_STATE", "the authorization request could not be matched — it may have expired or already been used", {
        operatorAction: "Start the connection again from Settings → External MCP.",
      });
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=stale-state&code=c`);
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /no longer valid/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "state_expired" });
});

test("provider_denied: OAUTH_ACCESS_DENIED — the operator declined, or the provider denied the grant", async (t) => {
  const deps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new OAuthError("OAUTH_ACCESS_DENIED", "authorization was declined", {
        operatorAction: "Approve the request on the provider's consent screen, then connect again.",
        providerErrorCode: "access_denied",
      });
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const baseUrl = await startTestServer(buildApp(deps), t);

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&error=access_denied`);
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

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`);
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.match(html, /Couldn’t finish connecting/);
  assert.match(html, /connection could not be found/);
  assert.deepEqual(extractPostMessagePayload(html), { type: "tovu:external-mcp-connected", reason: "server_unknown" });
});

test("exchange_failed: every other OAuthError code — and every non-OAuth error — falls back to the generic reason", async (t) => {
  const rejectedDeps: ExternalMcpOAuthCallbackRouteDeps = {
    oauth: fakeOAuthService(async () => {
      throw new OAuthError("OAUTH_PROVIDER_REJECTED", "the authorization server refused the authorization request", {
        operatorAction: "Check this provider's client id, scopes and redirect URI, then try connecting again.",
        providerErrorCode: "invalid_scope",
      });
    }),
    callbackLimiter: fixedRateLimiter({ allowed: true }),
  };
  const rejectedBaseUrl = await startTestServer(buildApp(rejectedDeps), t);
  const rejectedResponse = await fetch(`${rejectedBaseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`);
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
  const thrownResponse = await fetch(`${thrownBaseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`);
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

  const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`);
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
      error: new OAuthError("OAUTH_ACCESS_DENIED", "authorization was declined", {
        operatorAction: "Approve the request on the provider's consent screen, then connect again.",
        providerErrorCode: PROVIDER_SECRET_MARKER,
      }),
    },
    {
      name: "provider-rejected with the marker in both message and providerErrorCode",
      error: new OAuthError("OAUTH_PROVIDER_REJECTED", `the authorization server refused: ${PROVIDER_SECRET_MARKER}`, {
        operatorAction: "Check this provider's client id, scopes and redirect URI, then try connecting again.",
        providerErrorCode: PROVIDER_SECRET_MARKER,
      }),
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

    const response = await fetch(`${baseUrl}/api/mcp-servers/oauth/callback/${SERVER_ID}?state=s&code=c`);
    const html = await response.text();

    assert.equal(response.status, 400, name);
    assert.ok(!html.includes(PROVIDER_SECRET_MARKER), `${name}: the marker must never appear in the response`);
  }
});
