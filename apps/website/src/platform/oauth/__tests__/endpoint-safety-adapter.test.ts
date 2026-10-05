import assert from "node:assert/strict";
import test from "node:test";
import { OAuthError } from "@jini-ai/oauth";
import type { HttpClientPort } from "@jini-ai/core/primitives";
import { createTovuOAuthGuard, createTovuOAuthHttpPorts, createTovuIssuerBoundDiscoveryPolicy, withTovuOAuthCopy } from "../endpoint-safety.js";

// F2.5/F3.6: a strict downstream port checks the whole request, not merely that send ran.
test("OAuth GET defaults and POST credentials reach the guarded port and return its exact response", async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const http: HttpClientPort = { async send(required, optional) {
    calls++;
    assert.deepEqual(optional, { redirect: "error" });
    assert.deepEqual(required, { request: calls === 1 ? {
      url: "https://auth.example/metadata?tenant=7", method: "GET", headers: {},
      idleTimeoutMs: 15000, maxResponseBytes: 65536,
    } : {
      url: "https://auth.example/token", method: "POST",
      headers: { authorization: "Bearer fixture", "content-type": "application/x-www-form-urlencoded" },
      idleTimeoutMs: 15000, maxResponseBytes: 65536, signal, body: "code=fixture%2Bcode",
    } });
    return { status: 201, headers: { "x-fixture": "response" }, bodyText: '{"token":"saved"}' };
  } };
  const ports = createTovuOAuthHttpPorts({ http });
  for (const response of [
    await ports.fetchFn({ url: new URL("https://auth.example/metadata?tenant=7") }),
    await ports.fetchFn({ url: "https://auth.example/token" }, {
      method: "POST", headers: new Headers({ Authorization: "Bearer fixture", "Content-Type": "application/x-www-form-urlencoded" }),
      body: "code=fixture%2Bcode", signal,
    }),
  ]) {
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("x-fixture"), "response");
    assert.equal(await response.text(), '{"token":"saved"}');
  }
  assert.equal(calls, 2);
});

for (const status of [204, 205, 304]) {
  // F6.2: passing even an empty string body to Response throws for these statuses.
  test(`OAuth preserves bodyless ${status} responses`, async () => {
    const http: HttpClientPort = { async send() { return { status, headers: { "x-empty": "yes" }, bodyText: "" }; } };
    const response = await createTovuOAuthHttpPorts({ http }).fetchFn({ url: "https://auth.example/token" });
    assert.equal(response.status, status);
    assert.equal(response.body, null);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("x-empty"), "yes");
  });
}

for (const [name, url, init, message] of [
  ["unsupported method", "https://auth.example/token", { method: "DELETE" }, "unsupported OAuth request method"],
  ["non-string body", "https://auth.example/token", { method: "POST", body: new URLSearchParams({ code: "fixture" }) }, "OAuth request body must be a string"],
  ["implicit Request credentials", new Request("https://auth.example/token"), {}, "OAuth URL must be an explicit URL"],
] as const) {
  // F4.4: all other fields are valid, and the exact diagnostic identifies the guard.
  test(`OAuth refuses ${name} before any outbound send`, async () => {
    let calls = 0;
    const http: HttpClientPort = { async send() { calls++; return { status: 200, headers: {}, bodyText: "{}" }; } };
    await assert.rejects(createTovuOAuthHttpPorts({ http }).fetchFn({ url }, init), { name: "TypeError", message });
    assert.equal(calls, 0);
  });
}

test("guarded send failures retain their identity and a later fetch succeeds", async () => {
  const failure = new Error("fixture unavailable");
  let calls = 0;
  const http: HttpClientPort = { async send() {
    if (++calls === 1) throw failure;
    return { status: 200, headers: {}, bodyText: "recovered" };
  } };
  const ports = createTovuOAuthHttpPorts({ http });
  await assert.rejects(ports.fetchFn({ url: "https://auth.example/token" }), (error) => error === failure);
  assert.equal(await (await ports.fetchFn({ url: "https://auth.example/token" })).text(), "recovered");
  assert.equal(calls, 2);
});

test("host copy preserves success and untouched errors, and retains retry metadata when adapting copy", async () => {
  const value = { token: "fixture" };
  assert.equal(await withTovuOAuthCopy({ call: async () => value }), value);
  for (const error of [new Error("native failure"), new OAuthError({ code: "OAUTH_INVALID_REQUEST", message: "invalid", operatorAction: "Unchanged action." })]) {
    await assert.rejects(withTovuOAuthCopy({ call: async () => { throw error; } }), (caught) => caught === error);
  }
  const cause = new Error("fixture upstream");
  const error = new OAuthError({ code: "OAUTH_RATE_LIMITED", message: "slow down", operatorAction: "Open the connection settings." }, {
    cause, providerErrorCode: "slow_down", retryAfterSeconds: 17,
  });
  await assert.rejects(withTovuOAuthCopy({ call: async () => { throw error; } }), (caught) => {
    assert.ok(caught instanceof OAuthError);
    assert.equal(caught.code, "OAUTH_RATE_LIMITED");
    assert.equal(caught.message, "slow down");
    assert.equal(caught.operatorAction, "Open Settings → External MCP.");
    assert.equal(caught.cause, cause);
    assert.equal(caught.providerErrorCode, "slow_down");
    assert.equal(caught.retryAfterSeconds, 17);
    return true;
  });
});

for (const key of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "device_authorization_endpoint"]) {
  test(`issuer policy rejects malformed and credential-bearing ${key} while permitting same-origin paths`, () => {
    const policy = createTovuIssuerBoundDiscoveryPolicy({ guard: createTovuOAuthGuard({}) });
    const issuer = "https://auth.example/tenant";
    policy.assertMetadata({ issuer, document: { issuer, [key]: "https://auth.example/tenant/oauth" } });
    policy.assertMetadata({ issuer, document: { [key]: null } });
    for (const [raw, message] of [
      [7, `OAuth metadata ${key} is not an absolute URL`],
      ["https://attacker.example/oauth", `OAuth metadata ${key} does not share the issuer's origin`],
      ["https://user:secret@auth.example/oauth", `OAuth metadata ${key} does not share the issuer's origin`],
    ] as const) {
      assert.throws(() => policy.assertMetadata({ issuer, document: { issuer, [key]: raw } }), {
        code: "OAUTH_UNSAFE_ENDPOINT", message,
        operatorAction: "Check the authorization server issuer and discovery endpoints before connecting.",
      });
    }
  });
}
