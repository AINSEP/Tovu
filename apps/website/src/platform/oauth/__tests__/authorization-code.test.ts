import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { beginAuthorizationCode, completeAuthorizationCode } from "@jini-ai/oauth";
import { tovuOAuthMessages } from "../endpoint-safety.js";
import { createPendingAuthorizationStore } from "@jini-ai/oauth";
import type { OAuthProviderDescriptor } from "../ports.js";
import {
  createTestOAuthPorts,
  assertOAuthRejects,
  createFetchDouble,
  createTestClock,
  TEST_CLIENT,
  TEST_PROVIDER,
} from "./helpers.js";

/**
 * @file The authorization-code + PKCE grant.
 *
 * Four properties are load-bearing and each has a test that fails if it regresses:
 * PKCE actually reaches the token endpoint; `state` is validated before anything else happens; a
 * provider that is slow or unreachable fails fast and is NOT retried; and a callback carrying an
 * `error` is treated as terminal rather than as a blip.

 *
 * Design history from the retired Tovu authorization-code module. The implementation now lives in
 * Jini/packages/oauth/src/authorization-code.ts; these assertions retain its security argument.
 * @file The authorization-code grant with PKCE (RFC 6749 §4.1 + RFC 7636) — the primary path.
 *
 * Two functions, deliberately split across the browser round trip they straddle:
 * {@link beginAuthorizationCode} talks to no THIRD PARTY (nothing has been asked of the provider yet
 * — the operator's browser does the asking), and {@link completeAuthorizationCode} performs exactly
 * one bounded POST. `beginAuthorizationCode` is `async` because recording the pending authorization
 * (`deps.pending.put`) now goes through a `Promise`-returning port — see
 * `pending-authorizations.ts`'s header for why that port is async even for its in-memory
 * implementation — but it is still the ONLY thing this function awaits: no network call, no
 * unbounded wait, nothing that can hang. Connect-time provider downtime surfaces at
 * {@link completeAuthorizationCode} rather than here, exactly as before.
 *
 * ## What arrives at `complete` is untrusted
 *
 * Every argument to {@link completeAuthorizationCode} comes off a redirect issued by a third party
 * into a PUBLIC route that no session cookie can reach (a `SameSite=Strict` cookie does not survive
 * a cross-site top-level navigation). So they are validated as hostile input before anything else happens:
 * bounded lengths, expected charsets, and the `state` redeemed through a single-use, owner-bound
 * store. An `error` parameter is honored — a provider saying "the user declined" must not be
 * retried as if it were a network blip.
 * RFC 6749 puts no length on `code`, but every real one is far below this. The cap exists so a
 *  multi-megabyte query parameter is refused before it is put in a form body.
 * `state` here is always this module's own 24-byte base64url mint (32 chars). The range tolerates
 *  a provider that round-trips it with padding rather than assuming an exact length.
 * RFC 6749 §5.2 / §4.1.2.1 error codes are short lowercase tokens.
 * The binding key the callback must present. See `PendingAuthorization.ownerKey`.
 * Absolute; must be registered with the provider and is replayed verbatim on the exchange.
 * Falls back to the descriptor's defaults when omitted.
 * Extra authorization-request parameters a provider requires (`audience`, `prompt`, …). Reserved
 *  OAuth parameter names are refused rather than silently overwritten.
 * Where the operator's browser is sent. Safe to render as a link; contains no secret.
 * When this pending authorization stops being redeemable.
 * Parameters this module owns. An `extraAuthorizationParams` entry colliding with one of these
 *  would silently change the grant's security properties, so it is refused instead.
 * Merges caller-supplied extra authorization parameters into `authorizationUrl`, refusing any that
 *  collide with one Tovu owns. Split out of {@link beginAuthorizationCode} purely to keep that
 *  function's own branch count under the repo's complexity ceiling — same reserved-name check, same
 *  order, mutates the same URL.
 * Mints PKCE + `state`, records the pending authorization, and builds the URL to send the browser to.
 *
 * Contacts no THIRD PARTY: at this point the provider has not been asked anything, so there is
 * nothing on the network to time out or fail slowly. `deps.pending.put` is the one `await` in this
 * function, and it is a local persistence write (in-memory or `content.db`, never a network call) —
 * see this function's own `@file` doc for why the port is `Promise`-returning at all. That is why
 * connect-time provider downtime surfaces at {@link completeAuthorizationCode} rather than here.
 *
 * @throws {OAuthError} `OAUTH_UNSUPPORTED_GRANT`, `OAUTH_UNSAFE_ENDPOINT`, or
 *   `OAUTH_INVALID_REQUEST` for a reserved extra parameter or an unusable redirect URI.
 * @complexity O(1) plus the store's bounded prune.
 * Validated with the same rule as the provider's own endpoints: this is where the provider will
 * send the operator's browser back with a `code`, so an http:// or internal-address redirect
 * target is the same class of mistake.
 * Recorded even when PKCE is off so the stored shape is uniform; `complete` sends it only when
 * the descriptor says the provider uses PKCE.
 * Exactly the callback's query parameters this module reads, already narrowed to strings by the
 *  route. Anything else on the query string is ignored rather than rejected — providers append
 *  their own bookkeeping parameters and refusing them would break real handshakes.
 * Validates the callback and exchanges the code for tokens.
 *
 * The `state` is redeemed FIRST, before the `code` is even looked at. That ordering is deliberate:
 * redemption is what consumes the single-use entry, so a caller replaying a callback burns the
 * state on the first attempt regardless of what else is wrong with the request.
 *
 * @throws {OAuthError} `OAUTH_INVALID_STATE` (unknown, expired, replayed, or wrong owner),
 *   `OAUTH_ACCESS_DENIED` / `OAUTH_PROVIDER_REJECTED` (the provider reported a failure),
 *   `OAUTH_INVALID_REQUEST` (malformed `code`), or anything {@link requestOAuthToken} raises.
 *   All terminal — the caller must not retry; see `errors.ts`.
 * @complexity O(1) plus one bounded outbound request.
 * The state was minted against a different provider descriptor. Treat exactly as an unknown
 * state: the caller must not learn that a valid state exists for something else.
 * Re-validated after the store round trip rather than trusted: a verifier that was tampered
 * with must fail here, not at a provider that will answer with a less useful error.
 * Length and charset gates on the two attacker-controlled strings, applied before either is used.
 *  @throws {OAuthError} `OAUTH_INVALID_STATE` / `OAUTH_INVALID_REQUEST`.
 * Maps an RFC 6749 §4.1.2.1 redirect-borne `error` onto the taxonomy. An unrecognized or
 *  oddly-shaped value becomes a generic rejection rather than being echoed anywhere.
 */

const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/higgs";

function makeFlow(providerOverrides: Partial<OAuthProviderDescriptor> = {}) {
  const clock = createTestClock();
  const pending = createPendingAuthorizationStore({ clock, randomBytesFn: ({ byteLength }) => randomBytes(byteLength) });
  const provider = { ...TEST_PROVIDER, ...providerOverrides };
  return { clock, pending, provider };
}

test("begin builds an authorization URL carrying response_type, client_id, redirect_uri, scope, state and the S256 challenge", async () => {
  const { pending, provider } = makeFlow();

  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );

  const url = new URL(started.authorizationUrl);
  assert.equal(url.origin + url.pathname, "https://auth.example.com/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "tovu-client");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), "images:generate");
  assert.equal(url.searchParams.get("state"), started.state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  // The URL is handed to a browser: it must not carry the verifier.
  assert.equal(url.searchParams.get("code_verifier"), null);
});

test("begin contacts no third party — a dead provider cannot make starting a connection hang", async (t) => {
  const { pending, provider } = makeFlow();
  const http = createFetchDouble([{ throws: new Error("network down") }]);
  t.mock.method(globalThis, "fetch", http.fetchFn);

  await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );

  assert.equal(http.callCount(), 0);
});

test("complete sends the matching code_verifier, the stored redirect_uri, and no client secret for a public client", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const challengeSent = new URL(started.authorizationUrl).searchParams.get("code_challenge");
  const http = createFetchDouble([{ json: { access_token: "at-1", refresh_token: "rt-1", token_type: "Bearer", expires_in: 3600, scope: "images:generate" } }]);

  const tokens = await completeAuthorizationCode(
    {
      provider,
      pending,
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      params: { state: started.state, code: "auth-code-1" },
    },
  );

  const request = http.requests[0];
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://auth.example.com/token");
  assert.equal(request.redirect, "error");
  assert.equal(request.body.get("grant_type"), "authorization_code");
  assert.equal(request.body.get("code"), "auth-code-1");
  assert.equal(request.body.get("redirect_uri"), REDIRECT_URI);
  assert.equal(request.body.get("client_id"), TEST_CLIENT.clientId);
  assert.equal(request.body.get("client_secret"), null);
  // The verifier that was sent must be the pre-image of the challenge the browser carried.
  const verifierSent = request.body.get("code_verifier") ?? "";
  assert.equal(createHash("sha256").update(verifierSent, "ascii").digest("base64url"), challengeSent);

  assert.deepEqual(tokens, {
    accessToken: "at-1",
    refreshToken: "rt-1",
    tokenType: "Bearer",
    scopes: ["images:generate"],
    expiresAt: "2026-08-25T13:00:00.000Z",
  });
});

test("expires_in becomes an absolute expiresAt computed from the injected clock", async () => {
  const { clock, pending, provider } = makeFlow();
  clock.setIso("2030-01-01T00:00:00.000Z");
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at", expires_in: 60 } }]);

  const tokens = await completeAuthorizationCode(
    {
      provider,
      pending,
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      params: { state: started.state, code: "c" },
    },
  );

  assert.equal(tokens.expiresAt, "2030-01-01T00:01:00.000Z");
});

test("a provider that omits expires_in yields a null expiry rather than a fabricated one", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const tokens = await completeAuthorizationCode(
    {
      provider,
      pending,
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      params: { state: started.state, code: "c" },
    },
  );

  assert.equal(tokens.expiresAt, null);
  assert.equal(tokens.refreshToken, null);
});

test("a replayed callback is refused and never reaches the token endpoint a second time", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);
  const deps = { provider, pending, clock, fetchFn: http.fetchFn };
  const params = { state: started.state, code: "c" };

  await completeAuthorizationCode({ ...deps, ...createTestOAuthPorts(deps), ownerKey: "ws:higgs", client: TEST_CLIENT, params });
  await assertOAuthRejects(
    () => completeAuthorizationCode({ ...deps, ...createTestOAuthPorts(deps), ownerKey: "ws:higgs", client: TEST_CLIENT, params }),
    "OAUTH_INVALID_STATE",
  );

  assert.equal(http.callCount(), 1);
});

test("a state belonging to another connection is refused before any exchange", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:some-other-server",
          client: TEST_CLIENT,
          params: { state: started.state, code: "c" },
        },
      ),
    "OAUTH_INVALID_STATE",
  );
  assert.equal(http.callCount(), 0);
});

test("a missing state is refused without contacting the provider", async () => {
  const { clock, pending, provider } = makeFlow();
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: "", code: "c" },
        },
      ),
    "OAUTH_INVALID_STATE",
  );
  assert.equal(http.callCount(), 0);
});

test("an oversized authorization code is refused before it is put in a form body", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, code: "x".repeat(2049) },
        },
      ),
    "OAUTH_INVALID_REQUEST",
  );
  assert.equal(error.message, "the authorization code exceeded 2048 characters");
  assert.equal(http.callCount(), 0);
});

test("a callback carrying error=access_denied is terminal, not retryable", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, error: "access_denied" },
        },
      ),
    "OAUTH_ACCESS_DENIED",
  );
  assert.equal(error.retryable, false);
  assert.equal(error.message, "authorization was declined");
  assert.equal(http.callCount(), 0);
});

test("an unreachable token endpoint fails fast and is NOT retried", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ throws: Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }) }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, code: "c" },
        },
      ),
    "OAUTH_PROVIDER_UNREACHABLE",
  );

  assert.equal(error.retryable, false);
  assert.equal(error.message, "could not reach the authorization server at auth.example.com");
  assert.equal(
    error.operatorAction,
    "Check network access to this provider, then try connecting again. Nothing was retried automatically.",
  );
  // The whole point: exactly one attempt.
  assert.equal(http.callCount(), 1);
});

test("a stalled exchange is aborted by the configured deadline without retrying", { timeout: 2000 }, async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  let attempts = 0;
  let signal: AbortSignal | undefined;
  // AbortSignal.timeout uses an unref'ed timer; keep the process alive until the assertion settles.
  const keepAlive = setTimeout(() => {}, 2000);
  try {
    const error = await assertOAuthRejects(
      () => completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: async (_url, init) => {
        attempts += 1;
        assert.ok(init?.signal instanceof AbortSignal);
        signal = init.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
        });
      } }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, code: "c" },
        },
        { timeoutMs: 20 },
      ),
      "OAUTH_PROVIDER_UNREACHABLE",
    );
    assert.equal(signal?.aborted, true);
    assert.equal((error.cause as Error).name, "TimeoutError");
    assert.equal(attempts, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("a provider error body never leaks its description into the message", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([
    { status: 400, json: { error: "invalid_client", error_description: "client 8f3a for tenant acme-internal is not authorized" } },
  ]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, code: "c" },
        },
      ),
    "OAUTH_PROVIDER_REJECTED",
  );

  assert.equal(error.message, "the authorization server refused the request (HTTP 400, invalid_client)");
  assert.equal(error.providerErrorCode, "invalid_client");
  assert.ok(!error.message.includes("acme-internal"));
});

test("a token endpoint that answers with something other than JSON is a malformed response, not a token", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ text: "<html>login</html>" }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, code: "c" },
        },
      ),
    "OAUTH_MALFORMED_RESPONSE",
  );
  assert.equal(error.message, "the authorization server did not return a JSON object");
});

test("an oversized token response is refused rather than buffered", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ text: `{"access_token":"${"a".repeat(70_000)}"}` }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        {
          provider,
          pending,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          ownerKey: "ws:higgs",
          client: TEST_CLIENT,
          params: { state: started.state, code: "c" },
        },
      ),
    "OAUTH_MALFORMED_RESPONSE",
  );
  assert.equal(error.message, "the authorization server's response exceeded 65536 bytes");
});

test("an http:// redirect URI is refused at begin, so a plaintext code leg can never be started", async () => {
  const { pending, provider } = makeFlow();

  const error = await assertOAuthRejects(
    () => beginAuthorizationCode(
      {
        provider,
        pending,
        ...createTestOAuthPorts({}),
        randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: ["http://tovu.example.com/cb"] },
        ownerKey: "ws:higgs",
        client: TEST_CLIENT,
        redirectUri: "http://tovu.example.com/cb",
      },
    ),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "redirect URI: provider endpoint must use https (http is permitted only for loopback)");
});

test("a redirect URI pointing at internal address space is refused", async () => {
  const { pending, provider } = makeFlow();

  await assertOAuthRejects(
    () => beginAuthorizationCode(
      {
        provider,
        pending,
        ...createTestOAuthPorts({}),
        randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: ["https://169.254.169.254/cb"] },
        ownerKey: "ws:higgs",
        client: TEST_CLIENT,
        redirectUri: "https://169.254.169.254/cb",
      },
    ),
    "OAUTH_UNSAFE_ENDPOINT",
  );
});

test("a provider that does not declare the authorization-code grant refuses to start one", async () => {
  const { pending, provider } = makeFlow({ supportedGrants: ["device_code"] });

  const error = await assertOAuthRejects(
    () => beginAuthorizationCode(
      {
        provider,
        pending,
        ...createTestOAuthPorts({}),
        randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        ownerKey: "ws:higgs",
        client: TEST_CLIENT,
        redirectUri: REDIRECT_URI,
      },
    ),
    "OAUTH_UNSUPPORTED_GRANT",
  );
  assert.equal(error.message, "provider 'test-provider' does not support the authorization_code grant");
});

for (const parameter of ["response_type", "client_id", "redirect_uri", "scope", "state", "code_challenge", "code_challenge_method"]) {
  test(`an extra authorization parameter cannot overwrite ${parameter}`, async () => {
    const { pending, provider } = makeFlow();

    const error = await assertOAuthRejects(
      () =>
        beginAuthorizationCode(
          {
            provider,
            pending,
            ...createTestOAuthPorts({}),
            randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
            options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
            ownerKey: "ws:higgs",
            client: TEST_CLIENT,
            redirectUri: REDIRECT_URI,
          },
          { extraAuthorizationParams: { [parameter]: "attacker-chosen" }, messages: tovuOAuthMessages },
        ),
      "OAUTH_INVALID_REQUEST",
    );
    assert.equal(error.message, `'${parameter}' is set by Tovu and cannot be overridden for this provider`);
  });
}

test("a state minted for a different provider is refused before any exchange", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);
  await assertOAuthRejects(
    () => completeAuthorizationCode(
      {
        provider: { ...provider, providerId: "other-provider" },
        pending,
        clock,
        ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
        ownerKey: "ws:higgs",
        client: TEST_CLIENT,
        params: { state: started.state, code: "c" },
      },
    ),
    "OAUTH_INVALID_STATE",
  );
  assert.equal(http.callCount(), 0);
});

test("PKCE-disabled providers omit challenge and verifier and honor a scope override", async () => {
  const { clock, pending, provider } = makeFlow({ usesPkce: false });
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
    { scopes: ["custom:read", "custom:write"] },
  );
  const url = new URL(started.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge"), null);
  assert.equal(url.searchParams.get("code_challenge_method"), null);
  assert.equal(url.searchParams.get("scope"), "custom:read custom:write");
  const http = createFetchDouble([{ json: { access_token: "at" } }]);
  await completeAuthorizationCode(
    {
      provider,
      pending,
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      params: { state: started.state, code: "c" },
    },
  );
  assert.equal(http.requests[0].body.get("code_verifier"), null);
});

test("a callback with neither code nor error is refused without an exchange", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
  );
  const http = createFetchDouble([{ json: { access_token: "at" } }]);
  await assertOAuthRejects(
    () => completeAuthorizationCode(
      {
        provider,
        pending,
        clock,
        ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
        ownerKey: "ws:higgs",
        client: TEST_CLIENT,
        params: { state: started.state },
      },
    ),
    "OAUTH_INVALID_REQUEST",
  );
  assert.equal(http.callCount(), 0);
});

test("an extra authorization parameter the provider genuinely needs is carried through", async () => {
  const { pending, provider } = makeFlow();

  const started = await beginAuthorizationCode(
    {
      provider,
      pending,
      ...createTestOAuthPorts({}),
      randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      ownerKey: "ws:higgs",
      client: TEST_CLIENT,
      redirectUri: REDIRECT_URI,
    },
    { extraAuthorizationParams: { audience: "https://api.example.com" } },
  );

  assert.equal(new URL(started.authorizationUrl).searchParams.get("audience"), "https://api.example.com");
});
