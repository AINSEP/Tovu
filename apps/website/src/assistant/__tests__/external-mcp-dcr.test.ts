import { createTovuOAuthGuard } from "#src/platform/oauth/endpoint-safety";
import assert from "node:assert/strict";
import test from "node:test";

import { createPendingAuthorizationStore, type OAuthFetch } from "../../platform/oauth/index.js";
import { startDiscoveryFixture, startLoopbackServer, sendJson } from "../../platform/oauth/__tests__/helpers.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "../external-mcp-oauth.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import {
  ExternalMcpValidationError,
  listExternalMcpServerViews,
  openExternalMcpOAuthPayload,
  resolveExternalMcpOAuthStatus,
  saveExternalMcpServer,
} from "../external-mcp-store.js";

/**
 * @file The wiring: an external-MCP connection that has no `client_id` — or, since, no `grant` —
 * because its authorization server offers no way for a human to obtain a client id, or no way to
 * know which sign-in method it even supports before asking. Both are resolved from what connecting
 * to the server itself reveals, rather than left to an operator's guess.
 *
 * This is the case the subsystem could not previously express at all. `saveExternalMcpServer`
 * required a provider identity, a client id AND a grant, which assumed an operator had already
 * visited a developer console and read its docs. A hosted MCP server that advertises a
 * `registration_endpoint`, `grant_types_supported`, and no console is the standard shape, and there
 * is no human path to a client id — or a confident answer about the grant — on one.
 *
 * The invariants worth the most here:
 * 1. **The client is minted ONCE.** A second connect must reuse the stored `client_id`, not register
 *    a second client on every retry — registrations are not garbage-collected server-side.
 * 2. **An operator-supplied client id or grant still wins.** Existing connections must not start
 *    self-registering, or have their sign-in method silently switched, behind their operator's back.
 * 3. **A volunteered `client_secret` is sealed and never surfaces in a read model.**
 * 4. **A grant is resolved ONCE and persisted**, exactly like the client id — a reconnect must not
 *    re-run discovery just to ask the server the same question again.
 */

const WORKSPACE = "workspace-dcr";
const SERVER = "remote-1";
const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/remote-1";

function makeClock(startIso = "2026-08-26T12:00:00.000Z") {
  let nowMs = Date.parse(startIso);
  return {
    nowMs: () => nowMs,
    nowIso: () => new Date(nowMs).toISOString(),
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

interface SaveOptions {
  readonly url: string;
  readonly oauth?: Record<string, string>;
  readonly transport?: string;
  readonly command?: string;
}

function makeStore() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = makeClock();
  return { repo, keyring, sealer, clock, deps: { repo, sealer, keyring, clock } };
}

async function save(store: ReturnType<typeof makeStore>, options: SaveOptions) {
  return saveExternalMcpServer(store.deps, {
    workspaceId: WORKSPACE,
    serverId: SERVER,
    label: "Remote One",
    transport: options.transport ?? "streamable_http",
    authMode: "oauth",
    enabled: true,
    command: options.command ?? "",
    url: options.url,
    args: "",
    allowedToolNames: "",
    oauth: { grant: "authorization_code", ...(options.oauth ?? {}) },
  });
}

/** Like {@link save}, but does not default `grant` — for tests about resolving it, where the whole
 *  point is that the operator left it blank. */
async function saveWithoutGrant(store: ReturnType<typeof makeStore>, options: SaveOptions) {
  return saveExternalMcpServer(store.deps, {
    workspaceId: WORKSPACE,
    serverId: SERVER,
    label: "Remote One",
    transport: options.transport ?? "streamable_http",
    authMode: "oauth",
    enabled: true,
    command: options.command ?? "",
    url: options.url,
    args: "",
    allowedToolNames: "",
    oauth: { ...(options.oauth ?? {}) },
  });
}

function makeService(store: ReturnType<typeof makeStore>, overrides: { readonly fetchFn?: OAuthFetch } = {}) {
  return createExternalMcpOAuthService({
    workspaceId: WORKSPACE,
    repo: store.repo,
    sealer: store.sealer,
    keyring: store.keyring,
    clock: store.clock,
    pending: createPendingAuthorizationStore({ clock: store.clock }),
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }),
      fetchFn: ({ url }, init) => (overrides.fetchFn ?? fetch)(url, init) },
  });
}

/** How many times the fixture's registration endpoint was hit. */
function registrationCalls(fixture: { requests: readonly { url: string }[] }): number {
  return fixture.requests.filter((request) => request.url.split("?")[0] === "/oauth2/register").length;
}

/** Answers ONE url with a scripted JSON response and forwards everything else — including the
 *  discovery fixture's own real requests — to the real network. `device_authorization_endpoint` has
 *  no route on {@link startDiscoveryFixture}'s loopback server, so a device-grant test that wants
 *  REAL RFC 8414 discovery (to prove the grant was actually resolved from what the server advertised,
 *  not hardcoded) needs exactly one endpoint stubbed rather than the whole fetch. */
function stubOneEndpoint(url: string, json: unknown): OAuthFetch {
  return (async (input, init) => {
    if (String(input).split("?")[0] === url) {
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    }
    return fetch(input, init);
  }) as OAuthFetch;
}

// ---------------------------------------------------------------------------
// Saving a connection that has no client id yet
// ---------------------------------------------------------------------------

test("a remote OAuth connection can be saved with no provider id, no endpoints and no client id", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    const view = await save(store, { url: fixture.resourceUrl });
    assert.equal(view.oauth.clientId, null);
    assert.equal(view.oauth.providerId, null);
    assert.equal(view.oauth.status, "disconnected");
  } finally {
    await fixture.close();
  }
});

test("a STDIO OAuth connection still requires a client id — it has no URL to discover from", async () => {
  const store = makeStore();
  await assert.rejects(
    () =>
      saveExternalMcpServer(store.deps, {
        workspaceId: WORKSPACE,
        serverId: "stdio-1",
        transport: "stdio",
        authMode: "oauth",
        enabled: true,
        command: "npx",
        args: "-y some-mcp",
        allowedToolNames: "",
        oauth: { grant: "authorization_code", providerId: "example-oidc", tokenEnvName: "SOME_TOKEN" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpValidationError);
      assert.equal(error.message, "an OAuth connection needs a client id");
      assert.equal(error.field, "oauth.clientId");
      return true;
    },
  );
});

test("a STDIO OAuth connection still requires a provider identity", async () => {
  const store = makeStore();
  await assert.rejects(
    () =>
      saveExternalMcpServer(store.deps, {
        workspaceId: WORKSPACE,
        serverId: "stdio-2",
        transport: "stdio",
        authMode: "oauth",
        enabled: true,
        command: "npx",
        args: "-y some-mcp",
        allowedToolNames: "",
        oauth: { grant: "authorization_code", clientId: "typed-by-hand", tokenEnvName: "SOME_TOKEN" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpValidationError);
      assert.equal(error.message, "an OAuth connection needs either a registered provider id or its own token endpoint");
      assert.equal(error.field, "oauth.providerId");
      return true;
    },
  );
});

test("a remote OAuth connection can be saved with no sign-in method — it is resolved at connect time", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    const view = await saveWithoutGrant(store, { url: fixture.resourceUrl });
    assert.equal(view.oauth.grant, null);
  } finally {
    await fixture.close();
  }
});

test("a STDIO OAuth connection still requires a sign-in method — it has no URL to discover from", async () => {
  const store = makeStore();
  await assert.rejects(
    () =>
      saveExternalMcpServer(store.deps, {
        workspaceId: WORKSPACE,
        serverId: "stdio-3",
        transport: "stdio",
        authMode: "oauth",
        enabled: true,
        command: "npx",
        args: "-y some-mcp",
        allowedToolNames: "",
        oauth: { providerId: "example-oidc", clientId: "typed-by-hand", tokenEnvName: "SOME_TOKEN" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpValidationError);
      assert.equal(error.message, "an OAuth connection needs a sign-in method");
      assert.equal(error.field, "oauth.grant");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Connecting mints a client
// ---------------------------------------------------------------------------

test("connecting a client-id-less connection discovers the authorization server and self-registers", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.equal(started.kind, "redirect_required");
    assert.ok(started.kind === "redirect_required");
    const authorizationUrl = new URL(started.authorizationUrl);
    assert.equal(`${authorizationUrl.origin}${authorizationUrl.pathname}`, `${fixture.origin}/oauth2/authorize`);
    assert.equal(authorizationUrl.searchParams.get("client_id"), "minted-client-id");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), REDIRECT_URI);
    assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(registrationCalls(fixture), 1);
  } finally {
    await fixture.close();
  }
});

test("the registration request carries the connection's own callback URL as its redirect_uri", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    const registration = fixture.requests.find((request) => request.url.split("?")[0] === "/oauth2/register");
    assert.ok(registration, "expected a registration request");
    const body = JSON.parse(registration.body) as Record<string, unknown>;
    assert.deepEqual(body.redirect_uris, [REDIRECT_URI]);
    assert.equal(body.token_endpoint_auth_method, "none");
    assert.deepEqual(body.grant_types, ["authorization_code", "refresh_token"]);
  } finally {
    await fixture.close();
  }
});

test("the minted client id is PERSISTED — a second connect registers nothing", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
    await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.equal(registrationCalls(fixture), 1);
    const [view] = await listExternalMcpServerViews(store.deps, WORKSPACE);
    assert.equal(view?.oauth.clientId, "minted-client-id");
  } finally {
    await fixture.close();
  }
});

test("the discovered endpoints are persisted on the row, so a reconnect needs no discovery at all", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    const endpoints = JSON.parse(record?.oauthEndpointsJson ?? "{}") as Record<string, string>;
    assert.equal(endpoints.authorizationEndpoint, `${fixture.origin}/oauth2/authorize`);
    assert.equal(endpoints.tokenEndpoint, `${fixture.origin}/oauth2/token`);
  } finally {
    await fixture.close();
  }
});

test("scopes the resource advertises are adopted when the operator named none", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
    assert.ok(started.kind === "redirect_required");
    // `offline_access` is the one that decides whether this connection can ever refresh, so an
    // empty operator scope list must not silently drop it.
    assert.equal(new URL(started.authorizationUrl).searchParams.get("scope"), "openid email offline_access");
  } finally {
    await fixture.close();
  }
});

test("scopes the operator DID name win over the discovered ones", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl, oauth: { scopes: "email" } });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
    assert.ok(started.kind === "redirect_required");
    assert.equal(new URL(started.authorizationUrl).searchParams.get("scope"), "email");
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// Connecting resolves a grant — the same discovery, extended to the sign-in method
// ---------------------------------------------------------------------------

test("connecting a connection with no sign-in method resolves authorization_code from what the server advertises", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await saveWithoutGrant(store, { url: fixture.resourceUrl });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.ok(started.kind === "redirect_required");
    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthGrant, "authorization_code");
  } finally {
    await fixture.close();
  }
});

test("connecting falls back to device_code when that is the only grant the server offers", async () => {
  const metadata: Record<string, unknown> = {
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  };
  const fixture = await startDiscoveryFixture({ metadata });
  // The endpoint must share the issuer's origin (`createTovuIssuerBoundDiscoveryPolicy` rejects a
  // cross-origin one), and that origin is only known once the fixture is listening. The fixture
  // builds its metadata document per request from this same object, so setting it now is what the
  // discovery request below will see.
  const deviceAuthorizationEndpoint = new URL("/device", fixture.resourceUrl).toString();
  metadata.device_authorization_endpoint = deviceAuthorizationEndpoint;
  const store = makeStore();
  try {
    await saveWithoutGrant(store, { url: fixture.resourceUrl });
    // Discovery and registration run against the REAL loopback fixture, so the grant is genuinely
    // resolved from what it advertised; only the device-authorization POST itself is stubbed, since
    // `startDiscoveryFixture` has no route for it.
    const service = makeService(store, {
      fetchFn: stubOneEndpoint(deviceAuthorizationEndpoint, {
        device_code: "device-secret",
        user_code: "WDJB-MJHT",
        verification_uri: "https://device.example.com/activate",
        expires_in: 900,
        interval: 5,
      }),
    });

    const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.equal(started.kind, "device_code");
    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthGrant, "device_code");
  } finally {
    await fixture.close();
  }
});

test("a resolved grant is PERSISTED — a second connect does not re-discover it", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await saveWithoutGrant(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
    const requestsAfterFirstConnect = fixture.requests.length;

    await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.equal(fixture.requests.length, requestsAfterFirstConnect);
    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthGrant, "authorization_code");
  } finally {
    await fixture.close();
  }
});

test("an operator who typed endpoints and a client id but left the sign-in method blank still gets it resolved, without re-registering", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await saveWithoutGrant(store, {
      url: fixture.resourceUrl,
      oauth: {
        clientId: "operator-typed-client",
        authorizationEndpoint: `${fixture.origin}/oauth2/authorize`,
        tokenEndpoint: `${fixture.origin}/oauth2/token`,
      },
    });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.ok(started.kind === "redirect_required");
    assert.equal(registrationCalls(fixture), 0);
    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthGrant, "authorization_code");
  } finally {
    await fixture.close();
  }
});

test("a connection whose authorization server advertises no grant Tovu supports fails with an actionable error", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { grant_types_supported: ["client_credentials"] } });
  const store = makeStore();
  try {
    await saveWithoutGrant(store, { url: fixture.resourceUrl });
    await assert.rejects(
      () => makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(
          error.message,
          `the authorization server for external MCP server '${SERVER}' advertises no grant Tovu supports (it offers: client_credentials)`,
        );
        return true;
      },
    );
    // No client was registered for a connection that was never going to be reachable anyway.
    assert.equal(registrationCalls(fixture), 0);
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// An operator who supplied a client id keeps using theirs
// ---------------------------------------------------------------------------

test("an operator-supplied client id is used verbatim and nothing is ever registered", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, {
      url: fixture.resourceUrl,
      oauth: {
        clientId: "operator-typed-client",
        authorizationEndpoint: `${fixture.origin}/oauth2/authorize`,
        tokenEndpoint: `${fixture.origin}/oauth2/token`,
      },
    });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.ok(started.kind === "redirect_required");
    assert.equal(new URL(started.authorizationUrl).searchParams.get("client_id"), "operator-typed-client");
    assert.equal(registrationCalls(fixture), 0);
    // Endpoints were typed, so nothing needed discovering either.
    assert.equal(fixture.requests.length, 0);
  } finally {
    await fixture.close();
  }
});

test("an operator-supplied client id with no endpoints discovers them but still registers nothing", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl, oauth: { clientId: "operator-typed-client" } });
    const started = await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.ok(started.kind === "redirect_required");
    assert.equal(new URL(started.authorizationUrl).searchParams.get("client_id"), "operator-typed-client");
    assert.equal(registrationCalls(fixture), 0);
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// A volunteered client secret
// ---------------------------------------------------------------------------

test("a client secret the server volunteers is sealed and never appears in a read model", async () => {
  const fixture = await startDiscoveryFixture({
    registration: { json: { client_id: "minted-client-id", client_secret: "server-issued-secret", token_endpoint_auth_method: "client_secret_post" } },
  });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(record);
    const payload = await openExternalMcpOAuthPayload(store.sealer, record);
    assert.equal(payload.clientSecret, "server-issued-secret");

    const views = await listExternalMcpServerViews(store.deps, WORKSPACE);
    assert.ok(!JSON.stringify(views).includes("server-issued-secret"), "the client secret must never reach a read model");
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// Failure paths
// ---------------------------------------------------------------------------

test("a server that advertises no registration endpoint fails with an actionable error, not a crash", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { registration_endpoint: null } });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await assert.rejects(
      () => makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(
          error.message,
          `external MCP server '${SERVER}' has no OAuth client id and its authorization server offers no dynamic client registration`,
        );
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("a failed registration leaves the row with no client id, so a retry is a clean retry", async () => {
  const fixture = await startDiscoveryFixture({ registration: { status: 400, json: { error: "invalid_client_metadata" } } });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await assert.rejects(() => makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI }));

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(record);
    assert.equal(record.oauthClientId, null);
    // Nothing moved the row toward `pending` either — a failed registration is not a started
    // authorization, and a row parked in `pending` would report an attempt that never began.
    assert.equal(resolveExternalMcpOAuthStatus(record), "disconnected");
  } finally {
    await fixture.close();
  }
});

test("a connection whose MCP server publishes nothing at all reports that it must be configured by hand", async () => {
  const bare = await startLoopbackServer((_req, res) => sendJson(res, 404, { detail: "Not Found" }));
  const store = makeStore();
  try {
    await save(store, { url: `${bare.origin}/mcp` });
    await assert.rejects(
      () => makeService(store).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `no OAuth authorization server metadata could be discovered for ${new URL(bare.origin).host}`);
        return true;
      },
    );
  } finally {
    await bare.close();
  }
});

// ---------------------------------------------------------------------------
// A self-registered client that went stale
//
// A dynamically registered client is Tovu's own, and it can die out from under the row: the vendor
// drops it, or it was pinned to a callback URL that no longer exists (the desktop app's port changes
// on every restart). Reusing it forever leaves the row permanently unconnectable, so a reconnect must
// be able to mint a fresh one — while a client id an OPERATOR typed is never touched.
// ---------------------------------------------------------------------------

/** Begins a redirect connect and completes its callback against the fixture's token endpoint. */
async function connectThroughCallback(service: ReturnType<typeof makeService>, redirectUri = REDIRECT_URI): Promise<void> {
  const started = await service.beginConnect({ serverId: SERVER, redirectUri });
  assert.ok(started.kind === "redirect_required");
  const state = new URL(started.authorizationUrl).searchParams.get("state") ?? "";
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state, code: "auth-code" } });
}

const TOKEN_RESPONSE = { access_token: "access-1", token_type: "Bearer", expires_in: 3600, refresh_token: "refresh-1" };

async function authorizeClientId(service: ReturnType<typeof makeService>, redirectUri = REDIRECT_URI): Promise<string | null> {
  const started = await service.beginConnect({ serverId: SERVER, redirectUri });
  assert.ok(started.kind === "redirect_required");
  return new URL(started.authorizationUrl).searchParams.get("client_id");
}

test("disconnect forgets a SELF-REGISTERED client, so the next connect registers a fresh one", async () => {
  const fixture = await startDiscoveryFixture({ registrations: [{ client_id: "stale-client" }, { client_id: "fresh-client" }] });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    assert.equal(await authorizeClientId(service), "stale-client");

    await service.disconnect({ serverId: SERVER });
    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthClientId, null);

    assert.equal(await authorizeClientId(service), "fresh-client");
    assert.equal(registrationCalls(fixture), 2);
  } finally {
    await fixture.close();
  }
});

test("disconnect also drops the self-registered client's sealed secret", async () => {
  const fixture = await startDiscoveryFixture({ registrations: [{ client_id: "stale-client", client_secret: "stale-secret" }] });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    await authorizeClientId(service);
    await service.disconnect({ serverId: SERVER });

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(record);
    assert.equal((await openExternalMcpOAuthPayload(store.sealer, record)).clientSecret, undefined);
  } finally {
    await fixture.close();
  }
});

test("a connect whose callback URL differs from the one the client was registered with re-registers", async () => {
  const fixture = await startDiscoveryFixture({ registrations: [{ client_id: "old-port-client" }, { client_id: "new-port-client" }] });
  const store = makeStore();
  const movedRedirect = "http://127.0.0.1:51234/api/mcp-servers/oauth/callback/remote-1";
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    assert.equal(await authorizeClientId(service), "old-port-client");
    assert.equal(await authorizeClientId(service), "old-port-client", "the same callback URL must keep the client");

    assert.equal(await authorizeClientId(service, movedRedirect), "new-port-client");
    assert.equal(registrationCalls(fixture), 2);
    const last = fixture.requests.filter((request) => request.url.split("?")[0] === "/oauth2/register").at(-1);
    assert.deepEqual((JSON.parse(last?.body ?? "{}") as Record<string, unknown>).redirect_uris, [movedRedirect]);
  } finally {
    await fixture.close();
  }
});

test("a self-registered row written before the client was tracked re-registers once (the stuck-row self-heal)", async () => {
  const fixture = await startDiscoveryFixture({
    registrations: [
      { client_id: "legacy-client", client_secret: "legacy-secret" },
      { client_id: "fresh-client", client_secret: "fresh-secret" },
    ],
  });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    await authorizeClientId(service);
    // What an older build left behind: the discovered endpoints and the `clientAuth` only DCR ever
    // writes, and nothing recording which client was self-registered or for which callback.
    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(record);
    const endpoints = JSON.parse(record.oauthEndpointsJson ?? "{}") as Record<string, string>;
    await store.repo.upsert({
      ...record,
      oauthEndpointsJson: JSON.stringify({
        tokenEndpoint: endpoints.tokenEndpoint,
        authorizationEndpoint: endpoints.authorizationEndpoint,
        clientAuth: "none",
      }),
    });

    assert.equal(await authorizeClientId(service), "fresh-client");
    assert.equal(await authorizeClientId(service), "fresh-client", "healed once, then stable");
    assert.equal(registrationCalls(fixture), 2);
  } finally {
    await fixture.close();
  }
});

test("a token endpoint that rejects the client as invalid_client makes the next connect re-register", async () => {
  const fixture = await startDiscoveryFixture({
    registrations: [{ client_id: "revoked-client" }, { client_id: "fresh-client" }],
    token: { status: 401, json: { error: "invalid_client" } },
  });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    await assert.rejects(() => connectThroughCallback(service));

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthClientId, null);
    assert.equal(await authorizeClientId(service), "fresh-client");
  } finally {
    await fixture.close();
  }
});

test("disconnect and a moved callback URL never touch a client id the OPERATOR typed", async () => {
  const fixture = await startDiscoveryFixture();
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl, oauth: { clientId: "operator-typed-client", clientSecret: "operator-secret" } });
    const service = makeService(store);
    await authorizeClientId(service);
    await service.disconnect({ serverId: SERVER });
    assert.equal(await authorizeClientId(service, "http://127.0.0.1:51234/cb"), "operator-typed-client");

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(record);
    assert.equal(record.oauthClientId, "operator-typed-client");
    assert.equal((await openExternalMcpOAuthPayload(store.sealer, record)).clientSecret, "operator-secret");
    assert.equal(registrationCalls(fixture), 0);
  } finally {
    await fixture.close();
  }
});

test("an operator who types a client id over a self-registered one keeps it through disconnect", async () => {
  const fixture = await startDiscoveryFixture({ registrations: [{ client_id: "minted-first", client_secret: "minted-secret" }] });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    const service = makeService(store);
    await authorizeClientId(service);
    await save(store, { url: fixture.resourceUrl, oauth: { clientId: "operator-typed-client" } });
    await service.disconnect({ serverId: SERVER });

    const record = await store.repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal(record?.oauthClientId, "operator-typed-client");
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// A volunteered secret with no echoed auth method
//
// Measured at Supabase: asked for a public client (`none`), it issues a `client_secret` anyway,
// does not echo `token_endpoint_auth_method`, and advertises only the two secret-bearing methods.
// Authenticating as `none` then fails every token request with "Required parameter: client_secret".
// ---------------------------------------------------------------------------

test("a secret issued with no echoed method authenticates with client_secret_basic when the server advertises it", async () => {
  const fixture = await startDiscoveryFixture({
    metadata: { token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] },
    registrations: [{ client_id: "confidential-client", client_secret: "issued-secret" }],
    token: { json: TOKEN_RESPONSE },
  });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await connectThroughCallback(makeService(store));

    const tokenRequest = fixture.requests.find((request) => request.url.split("?")[0] === "/oauth2/token");
    assert.ok(tokenRequest, "expected a token request");
    assert.equal(tokenRequest.headers.authorization, `Basic ${Buffer.from("confidential-client:issued-secret").toString("base64")}`);
    assert.equal(new URLSearchParams(tokenRequest.body).get("client_secret"), null);
  } finally {
    await fixture.close();
  }
});

test("a secret issued with no echoed method is POSTed when client_secret_post is the only secret method advertised", async () => {
  const fixture = await startDiscoveryFixture({
    metadata: { token_endpoint_auth_methods_supported: ["client_secret_post"] },
    registrations: [{ client_id: "confidential-client", client_secret: "issued-secret" }],
    token: { json: TOKEN_RESPONSE },
  });
  const store = makeStore();
  try {
    await save(store, { url: fixture.resourceUrl });
    await connectThroughCallback(makeService(store));

    const tokenRequest = fixture.requests.find((request) => request.url.split("?")[0] === "/oauth2/token");
    assert.ok(tokenRequest, "expected a token request");
    assert.equal(new URLSearchParams(tokenRequest.body).get("client_secret"), "issued-secret");
    assert.equal(tokenRequest.headers.authorization, undefined);
  } finally {
    await fixture.close();
  }
});
