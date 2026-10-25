import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { beginOidcLogin, completeOidcLogin, memberLoginCallbackUrl, openLoginEmailContinuation, sealLoginEmailContinuation, type OidcLoginDeps } from "../oidc-login.js";
import { MemberLoginError } from "../types.js";
import { cryptoFixture, originFixture, provider } from "./fixtures.js";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const invalidLogin = (error: unknown) => error instanceof MemberLoginError && error.code === "LOGIN_INVALID" && !error.cause;

function fixture(overrides: Record<string, unknown> = {}, invalidSignature = false) {
  const crypto = cryptoFixture();
  const calls: string[] = [];
  const usedCodes = new Set<string>();
  let nonce = "";
  let enabled = true;
  let version = "preset-v1";
  let secret = "test-client-secret";
  const deps: OidcLoginDeps = { ...crypto, origin: originFixture(),
    resolveProvider: async () => enabled ? { ...provider, configurationVersion: version } : null,
    resolveClient: async () => ({ clientId: "test-client", clientSecret: secret, authMethod: "client_secret_post" }),
    httpPorts: {
      guard: { assertSafeUrl: ({ raw }) => new URL(raw) },
      fetchFn: async ({ url }, init) => {
        calls.push(String(url));
        if (String(url) === provider.jwksUri) return Response.json({ keys: [jwk] });
        assert.equal(String(url), provider.tokenEndpoint);
        assert.ok(init?.signal, "outbound requests must have a deadline signal");
        const params = new URLSearchParams(String(init?.body));
        const code = params.get("code")!;
        if (usedCodes.has(code)) return Response.json({ error: "invalid_grant" }, { status: 400 });
        usedCodes.add(code);
        assert.equal(params.get("client_id"), "test-client");
        assert.equal(params.get("client_secret"), secret);
        assert.ok(params.get("code_verifier"));
        const now = Math.floor(crypto.clock.nowMs() / 1000);
        const claims = { iss: provider.issuer, aud: "test-client", sub: "stable-subject", iat: now, exp: now + 300,
          nonce, email: "person@gmail.com", email_verified: true, ...overrides };
        const payload = `${encode({ alg: "RS256", kid: "test-key" })}.${encode(claims)}`;
        const signature = sign("RSA-SHA256", Buffer.from(payload), invalidSignature ? wrongPair.privateKey : pair.privateKey).toString("base64url");
        return Response.json({ access_token: "transient-access-token", token_type: "Bearer", id_token: `${payload}.${signature}` });
      },
    },
  };
  const input = { workspaceId: "ws", providerId: "google" };
  return { ...crypto, deps, calls, input,
    disable: () => { enabled = false; }, rotate: () => { version = "preset-v2"; }, rotateSecret: () => { secret = "new-client-secret"; },
    async start(connectMemberId?: string) {
      const started = await beginOidcLogin({ deps, input: { ...input, connectMemberId } });
      const url = new URL(started.authorizationUrl);
      nonce = url.searchParams.get("nonce")!;
      return { ...started, params: { state: url.searchParams.get("state")!, code: "single-use-code" } };
    },
  };
}

test("begin uses S256, fixed callback, nonce and identity-only scopes; complete returns no tokens", async () => {
  const f = fixture();
  const started = await f.start();
  const url = new URL(started.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("redirect_uri"), "https://site.example/api/members/v1/workspaces/ws/oidc/google/callback");
  assert.ok(url.searchParams.get("nonce"));
  assert.ok(!url.href.includes(started.browserBinding));
  const result = await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
  assert.deepEqual(result.identity, { providerId: "google", issuer: provider.issuer, subject: "stable-subject", email: "person@gmail.com", emailAuthoritative: true });
  assert.ok(!JSON.stringify(result).includes("transient-access-token"));
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
});
for (const binding of ["", "wrong", Buffer.alloc(32, 1).toString("base64url")]) {
  test(`missing/wrong browser binding refuses forwarded authorization URL (${binding.length}) before exchange`, async () => {
    const f = fixture();
    const started = await f.start();
    await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started, browserBinding: binding } }), invalidLogin);
    assert.deepEqual(f.calls, []);
  });
}
test("tampered or expired state refuses before token exchange", async () => {
  const f = fixture();
  const started = await f.start();
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started, params: { ...started.params, state: `${started.params.state}x` } } }), invalidLogin);
  f.clock.advanceMs(600001);
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
  assert.deepEqual(f.calls, []);
});
for (const claims of [{ iss: "https://attacker.example" }, { aud: "other-client" }, { nonce: "other-nonce" },
  { exp: 1 }, { iat: 9999999999 }, { email_verified: false }, { email_verified: "true" }, { email_verified: undefined }, { sub: "" }]) {
  test(`invalid claim rejected: ${Object.keys(claims)[0]}=${String(Object.values(claims)[0])}`, async () => {
    const f = fixture(claims);
    const started = await f.start();
    await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
  });
}
test("invalid signature is rejected against the pinned JWKS", async () => {
  const f = fixture({}, true);
  const started = await f.start();
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
});
for (const change of ["disable", "rotate", "rotateSecret"] as const) {
  test(`${change} after start rejects the old redirect before exchange`, async () => {
    const f = fixture();
    const started = await f.start();
    f[change]();
    await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
    assert.deepEqual(f.calls, []);
  });
}
test("signed-in connect is bound to that member on completion", async () => {
  const f = fixture();
  const started = await f.start("member-1");
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started, connectMemberId: "member-2" } }), invalidLogin);
  const result = await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started, connectMemberId: "member-1" } });
  assert.equal(result.connectMemberId, "member-1");
});
for (const [email, hd, authoritative] of [["user@gmail.com", undefined, true], ["user@googlemail.com", undefined, true],
  ["user@business.example", "business.example", true], ["user@custom.example", undefined, false], ["user@alias.example", "primary.example", true],
  ["user@custom.example", "", false]] as const) {
  test(`email authority ${email}, hd=${hd}`, async () => {
    const f = fixture({ email, hd });
    const started = await f.start();
    const result = await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
    assert.equal(result.identity.emailAuthoritative, authoritative);
  });
}
test("callback uses configured base path and URL escaping", async () => {
  const origin = { ...originFixture(), canonicalOrigin: async () => ({ scheme: "http" as const, host: "localhost", port: 3000,
    basePath: "/nested", verifiedAt: "2026-10-24T12:00:00Z", source: "dev-capability" as const }) };
  assert.equal(await memberLoginCallbackUrl({ origin, workspaceId: "ws space", providerId: "test" }),
    "http://localhost:3000/nested/api/members/v1/workspaces/ws%20space/oidc/test/callback");
});

test("custom-domain continuation retains only verified input and requires the same browser", async () => {
  const f = fixture({ email: "person@custom.example" });
  const started = await f.start();
  const input = { ...f.input, browserBinding: started.browserBinding };
  const login = await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
  const continuation = await sealLoginEmailContinuation({ deps: f.deps, input, login });
  assert.ok(!continuation.includes("person@custom.example"));
  assert.deepEqual(await openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation } }), login);
  await assert.rejects(openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation, browserBinding: Buffer.alloc(32, 4).toString("base64url") } }), invalidLogin);
  await assert.rejects(openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation: `${continuation}x` } }), invalidLogin);
  f.clock.advanceMs(600001);
  await assert.rejects(openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation } }), invalidLogin);
});
test("disabling the provider invalidates an emailed-code continuation", async () => {
  const f = fixture({ email: "person@custom.example" });
  const started = await f.start();
  const input = { ...f.input, browserBinding: started.browserBinding };
  const login = await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
  const continuation = await sealLoginEmailContinuation({ deps: f.deps, input, login });
  f.disable();
  await assert.rejects(openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation } }), invalidLogin);
});

// --- F6 fix wave (L7 Stryker survivors in oidc-login.ts): every limit at its edge, refusal code asserted. ---
const unavailableLogin = (error: unknown) => error instanceof MemberLoginError && error.code === "LOGIN_UNAVAILABLE" && !error.cause;
const at = (local: number) => `${"a".repeat(local)}@gmail.com`;

for (const [email, accepted] of [
  [at(310), true], [at(311), false], ["  Person@GMAIL.com ", true], ["a\tb@gmail.com", false], ["a b@gmail.com", false],
  ["@gmail.com", false], ["a@@gmail.com", false], ["a@b@gmail.com", false], ["a@gmail", false], ["a@.com", false], ["a@gmail.", false], ["a@g.c", true],
] as const) {
  test(`verified email ${JSON.stringify(email.length > 40 ? `${email.length} chars` : email)} is ${accepted ? "accepted" : "refused"}`, async () => {
    const f = fixture({ email });
    const started = await f.start();
    const outcome = completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
    if (accepted) assert.equal((await outcome).identity.email, email.trim().toLowerCase());
    else await assert.rejects(outcome, invalidLogin);
  });
}

for (const [label, claims, accepted] of [
  ["a 255-char subject", { sub: "s".repeat(255) }, true], ["a 256-char subject", { sub: "s".repeat(256) }, false],
] as const) {
  test(`subject limit: ${label} is ${accepted ? "accepted" : "refused"}`, async () => {
    const f = fixture(claims);
    const started = await f.start();
    const outcome = completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
    if (accepted) assert.equal((await outcome).identity.subject, claims.sub);
    else await assert.rejects(outcome, invalidLogin);
  });
}

test("a browser binding that is not exactly 32 random bytes refuses to start (LOGIN_UNAVAILABLE)", async () => {
  const f = fixture();
  const real = f.deps.randomBytesFn;
  let first = true;
  const deps: OidcLoginDeps = { ...f.deps, randomBytesFn: (input: { byteLength: number }) => {
    if (first) { first = false; return real({ byteLength: 31 }); }
    return real(input);
  } };
  await assert.rejects(beginOidcLogin({ deps, input: f.input }), unavailableLogin);
});

test("sealing an emailed-code continuation refuses a login that does not match the request, or is stale", async () => {
  const f = fixture({ email: "person@custom.example" });
  const started = await f.start();
  const input = { ...f.input, browserBinding: started.browserBinding };
  const login = await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } });
  for (const bad of [
    { ...login, identity: { ...login.identity, providerId: "other" } },
    { ...login, identity: { ...login.identity, issuer: "https://attacker.example" } },
    { ...login, connectMemberId: "member-9" },
    { ...login, startedAt: "not-a-date" },
  ]) {
    await assert.rejects(sealLoginEmailContinuation({ deps: f.deps, input, login: bad }), invalidLogin, JSON.stringify(bad));
  }
  f.clock.advanceMs(Date.parse(login.startedAt) + 599_999 - f.clock.nowMs());
  const continuation = await sealLoginEmailContinuation({ deps: f.deps, input, login });
  assert.deepEqual(await openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation } }), login);
  f.clock.advanceMs(1);
  await assert.rejects(sealLoginEmailContinuation({ deps: f.deps, input, login }), invalidLogin);
  await assert.rejects(openLoginEmailContinuation({ deps: f.deps, input: { ...input, continuation } }), invalidLogin);
});

test("a verified claim whose email is not a string is refused", async () => {
  const f = fixture({ email: 7 });
  const started = await f.start();
  await assert.rejects(completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } }), invalidLogin);
});

for (const [label, change] of [
  ["a resolved provider with another id", { provider: { id: "github" } }],
  ["a client whose auth method differs from the provider's", { client: { authMethod: "client_secret_basic" } }],
  ["a client without an id", { client: { clientId: "" } }],
  ["a client without a secret", { client: { clientSecret: "" } }],
] as const) {
  test(`starting a login refuses ${label} (LOGIN_UNAVAILABLE)`, async () => {
    const f = fixture();
    const resolvedProvider = await f.deps.resolveProvider({ workspaceId: "ws", providerId: "google" });
    const resolvedClient = await f.deps.resolveClient({ workspaceId: "ws", provider: resolvedProvider! });
    const deps: OidcLoginDeps = { ...f.deps,
      resolveProvider: async () => ({ ...resolvedProvider!, ...("provider" in change ? change.provider : {}) }),
      resolveClient: async () => ({ ...resolvedClient, ...("client" in change ? change.client : {}) } as typeof resolvedClient) };
    await assert.rejects(beginOidcLogin({ deps, input: f.input }), (error: unknown) => error instanceof MemberLoginError && error.code === "LOGIN_UNAVAILABLE");
  });
}

test("a provider with no authoritative-domain list still decides authority from the hosted-domain claim", async () => {
  for (const [hd, authoritative] of [["business.example", true], [undefined, false]] as const) {
    const f = fixture({ email: "user@gmail.com", hd });
    const started = await f.start();
    const deps: OidcLoginDeps = { ...f.deps, resolveProvider: async () => ({ ...provider, authoritativeEmailDomains: undefined }) };
    const result = await completeOidcLogin({ deps, input: { ...f.input, ...started } });
    assert.equal(result.identity.emailAuthoritative, authoritative, String(hd));
  }
});

test("a whitespace-only hosted-domain claim grants no mailbox authority", async () => {
  const f = fixture({ email: "user@custom.example", hd: "   " });
  const started = await f.start();
  assert.equal((await completeOidcLogin({ deps: f.deps, input: { ...f.input, ...started } })).identity.emailAuthoritative, false);
});
