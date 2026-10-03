import { OAuthError } from "@jini-ai/oauth";
import type { HttpClientPort, HttpRequest, RequestRedirect } from "@jini-ai/core/primitives";
import assert from "node:assert/strict";
import test from "node:test";

import { createTovuOAuthGuard, createTovuOAuthHttpPorts, withTovuOAuthCopy, assertSafeProviderEndpoint, assertSafeUserFacingUrl } from "../endpoint-safety.js";

test("safe URLs return normalized URLs and permit plaintext only on loopback", () => {
  assert.equal(assertSafeProviderEndpoint("  https://AUTH.example.com/token?q=7  ", "token endpoint").href,
    "https://auth.example.com/token?q=7");
  for (const raw of ["http://localhost:8080/token", "http://127.0.0.1:8080/token", "http://[::1]:8080/token"]) {
    assert.equal(assertSafeProviderEndpoint(raw, "token endpoint").href, raw);
    assert.equal(assertSafeUserFacingUrl(raw).href, raw);
  }
  assert.equal(assertSafeUserFacingUrl("https://auth.example.com/activate?code=ABC").href,
    "https://auth.example.com/activate?code=ABC");
});

// F4.4: HTTPS internal-address fixtures cannot fail the scheme guard instead.
for (const [raw, reason, action] of [
  ["/relative/token", "is not a valid absolute URL", "Check the OAuth endpoints configured for this provider."],
  ["http://auth.example.com/token", "must use https (http is permitted only for loopback)", "Use an https:// URL for this provider."],
  ["javascript:alert(1)", "must use https (http is permitted only for loopback)", "Use an https:// URL for this provider."],
  ["https://10.1.2.3/token", "resolves to an internal address, which is not allowed", "Point this provider at a publicly reachable authorization server."],
  ["https://169.254.169.254/token", "resolves to an internal address, which is not allowed", "Point this provider at a publicly reachable authorization server."],
  ["https://[fd00::1]/token", "resolves to an internal address, which is not allowed", "Point this provider at a publicly reachable authorization server."],
] as const) {
  test(`endpoint and displayed link refuse ${raw} with the correct subject and action`, () => {
    assert.throws(() => assertSafeProviderEndpoint(raw, "token endpoint"), {
      name: "OAuthError", code: "OAUTH_UNSAFE_ENDPOINT", message: `token endpoint: provider endpoint ${reason}`,
      operatorAction: action,
    });
    assert.throws(() => assertSafeUserFacingUrl(raw), {
      name: "OAuthError", code: "OAUTH_UNSAFE_ENDPOINT", message: `provider-supplied link ${reason}`,
      operatorAction: action,
    });
  });
}

for (const raw of ["https://user@auth.example.com/activate", "https://:password@auth.example.com/activate"]) {
  test(`userinfo is accepted for operator endpoints but refused in displayed links: ${raw}`, () => {
    assert.equal(assertSafeProviderEndpoint(raw, "token endpoint").href, raw);
    assert.throws(() => assertSafeUserFacingUrl(raw), {
      name: "OAuthError", code: "OAUTH_UNSAFE_ENDPOINT", message: "provider-supplied link embeds credentials in the URL",
      operatorAction: "This provider's device-authorization response is malformed — do not open the link.",
    });
  });
}

// REGRESSION: fails if createTovuOAuthGuard defaults allowLoopbackHttp to true.
test("production plaintext loopback OAuth requires an explicit exception", () => {
  assert.throws(() => createTovuOAuthGuard({}).assertSafeUrl({ raw: "http://127.0.0.1/token", label: "token endpoint" }), { code: "OAUTH_UNSAFE_ENDPOINT" });
});

// REGRESSION: fails if the adapter drops the redirect: error option or caller signal.
test("OAuth uses the guarded port with redirect refusal and bounded response policy", async () => {
  let sent: HttpRequest | undefined;
  let redirect: RequestRedirect | undefined;
  const http: HttpClientPort = { async send({ request }, options) {
    sent = request; redirect = options?.redirect;
    return { status: 200, headers: {}, bodyText: "{}", bodyTruncated: false };
  } };
  const signal = new AbortController().signal;
  const ports = createTovuOAuthHttpPorts({ http });
  await ports.fetchFn({ url: "https://auth.example.com/token" }, { method: "POST", body: "grant_type=refresh_token", signal });
  assert.equal(redirect, "error");
  assert.ok(sent);
  assert.equal(sent.signal, signal);
  assert.equal(sent.idleTimeoutMs, 15_000);
  assert.equal(sent.maxResponseBytes, 64 * 1024);
  assert.equal(sent.body, "grant_type=refresh_token");
});

// REGRESSION: fails if bodyTruncated is ignored by createTovuOAuthHttpPorts.
test("OAuth rejects clipped guarded responses", async () => {
  const http: HttpClientPort = { async send() {
    return { status: 200, headers: {}, bodyText: "{}", bodyTruncated: true };
  } };
  await assert.rejects(() => createTovuOAuthHttpPorts({ http }).fetchFn({ url: "https://auth.example.com/token" }), { code: "OAUTH_MALFORMED_RESPONSE" });
});

// REGRESSION: fails if withTovuOAuthCopy passes neutral connection-settings copy through.
test("host error copy preserves Settings wording and provider error metadata", async () => {
  const error = new OAuthError({ code: "OAUTH_INVALID_GRANT", message: "dead grant", operatorAction: "Reconnect this server in the connection settings." }, { providerErrorCode: "invalid_grant" });
  await assert.rejects(() => withTovuOAuthCopy({ call: async () => { throw error; } }), {
    code: "OAUTH_INVALID_GRANT", message: "dead grant", operatorAction: "Reconnect this server in Settings → External MCP.", providerErrorCode: "invalid_grant",
  });
});

// REGRESSION: fails if withTovuOAuthCopy returns Jini's unreachable wrapper for a clipped response.
test("guarded clipping retains its malformed-response code through a fetch wrapper", async () => {
  const clipped = new OAuthError({ code: "OAUTH_MALFORMED_RESPONSE", message: "clipped", operatorAction: "Check response size." });
  const wrapped = new OAuthError({ code: "OAUTH_PROVIDER_UNREACHABLE", message: "unreachable", operatorAction: "Try again." }, { cause: clipped });
  await assert.rejects(() => withTovuOAuthCopy({ call: async () => { throw wrapped; } }), (error) => error === clipped);
});
