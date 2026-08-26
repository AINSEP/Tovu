import assert from "node:assert/strict";
import test from "node:test";

import { createPendingAuthorizationStore } from "../../oauth/index.js";
import { startDiscoveryFixture, startLoopbackServer, sendJson } from "../../oauth/__tests__/helpers.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
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
 * @file The wiring: an external-MCP connection that has no `client_id` because its authorization
 * server offers no way for a human to obtain one, and self-registers instead.
 *
 * This is the case the subsystem could not previously express at all. `saveExternalMcpServer`
 * required both a provider identity and a client id, which assumed an operator had already visited a
 * developer console. A hosted MCP server that advertises a `registration_endpoint` and no console is
 * the standard shape, and there is no human path to a client id on one.
 *
 * The invariants worth the most here:
 * 1. **The client is minted ONCE.** A second connect must reuse the stored `client_id`, not register
 *    a second client on every retry — registrations are not garbage-collected server-side.
 * 2. **An operator-supplied client id still wins.** Existing connections must not start
 *    self-registering behind their operator's back.
 * 3. **A volunteered `client_secret` is sealed and never surfaces in a read model.**
 */

const WORKSPACE = "workspace-dcr";
const SERVER = "remote-1";
const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/remote-1";

function makeClock(startIso = "2026-08-26T12:00:00.000Z") {
  let nowMs = Date.parse(startIso);
  return {
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

function makeService(store: ReturnType<typeof makeStore>) {
  return createExternalMcpOAuthService({
    workspaceId: WORKSPACE,
    repo: store.repo,
    sealer: store.sealer,
    keyring: store.keyring,
    clock: store.clock,
    pending: createPendingAuthorizationStore({ clock: store.clock }),
    devices: createDeviceAuthorizationStore(),
  });
}

/** How many times the fixture's registration endpoint was hit. */
function registrationCalls(fixture: { requests: readonly { url: string }[] }): number {
  return fixture.requests.filter((request) => request.url.split("?")[0] === "/oauth2/register").length;
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
