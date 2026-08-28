import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startFakeComposio, type FakeComposioServer } from "../../../development/e2e/fake-composio-server.js";
import { InMemoryComposioConfigRepo } from "../../platform/connectors/composio-config-store.memory.js";
import { composioUserIdFor, createComposioConnectors } from "../../platform/connectors/composio-service.js";
import { InMemoryConnectorCredentialRepo } from "../../platform/connectors/connector-credential-store.memory.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createRouteDeps } from "../app.js";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth.js";
import { createConnectorsModule } from "../modules/connectors.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated } from "./helpers/http-test-server.js";

/**
 * @file The full Composio OAuth round trip, server-side: connect → redirect → public callback →
 * sealed credentials → disconnect.
 *
 * Driven against `development/e2e/fake-composio-server.ts` rather than Composio itself, because no
 * project key exists in this environment. Everything on TOVU's side is real — real Express, real
 * session auth, real `ComposioConnectorProvider`, real HTTP to the fake, real AES-GCM sealing, real
 * repos. What is NOT proven here is Composio's own edge; see the fake's file header.
 *
 * The assertions that matter most are the negative ones: the callback is reachable WITHOUT a
 * session (that is the whole reason it exists), but a missing, replayed, or wrong-connector `state`
 * is refused, and credentials are never returned to any caller.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/connectors`;
const CALLBACK = "/api/connectors/composio/callback";
const DUMMY_KEY = "comp_OAUTH_DUMMY_NOT_A_REAL_KEY_4242";

interface Harness {
  baseUrl: string;
  cookie: string;
  fake: FakeComposioServer;
  credentialRepo: InMemoryConnectorCredentialRepo;
  deps: RouteDeps;
}

async function boot(t: import("node:test").TestContext, options: { failAccountLookup?: boolean } = {}): Promise<Harness> {
  const fake = await startFakeComposio({
    expectedUserId: composioUserIdFor(WORKSPACE_ID),
    ...(options.failAccountLookup === undefined ? {} : { failAccountLookup: options.failAccountLookup }),
  });
  t.after(() => fake.close());

  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const configRepo = new InMemoryComposioConfigRepo();
  const credentialRepo = new InMemoryConnectorCredentialRepo();
  const clock = { nowIso: () => new Date().toISOString() };

  const composioConnectors = createComposioConnectors({
    workspaceId: WORKSPACE_ID,
    repo: configRepo,
    credentialRepo,
    sealer,
    keyring,
    clock,
    baseUrl: fake.url,
  });

  const deps: RouteDeps = {
    ...createRouteDeps(),
    composioConfigRepo: configRepo,
    composioConnectors,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createConnectorsModule(deps).registerRoutes?.(app);

  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // A configured project key is a precondition for every connect path.
  const saved = await fetch(`${baseUrl}${BASE}/config`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ apiKey: DUMMY_KEY }),
  });
  assert.equal(saved.status, 200);

  return { baseUrl, cookie, fake, credentialRepo, deps };
}

/** Starts an authorization and returns the `state` Composio would have been handed. */
async function beginConnect(h: Harness): Promise<{ redirectUrl: string; state: string }> {
  const res = await fetch(`${h.baseUrl}${BASE}/github/connect`, {
    method: "POST",
    headers: { cookie: h.cookie },
  });
  assert.equal(res.status, 200, `connect failed: ${await res.clone().text()}`);
  const body = (await res.json()) as { auth?: { kind: string; redirectUrl?: string } };
  assert.equal(body.auth?.kind, "redirect_required");

  const callbackUrl = h.fake.lastCallbackUrl;
  assert.ok(callbackUrl, "the provider must register a callback URL");
  const state = new URL(callbackUrl).searchParams.get("state");
  assert.ok(state, "the provider must append an OAuth state to the callback URL");
  const redirectUrl = body.auth?.redirectUrl;
  assert.ok(redirectUrl, "a redirect_required result must carry a redirect URL");
  return { redirectUrl, state };
}

test("connect returns a redirect and registers a callback carrying an OAuth state", async (t) => {
  const h = await boot(t);
  const { redirectUrl, state } = await beginConnect(h);

  assert.ok(redirectUrl.startsWith(h.fake.url), "the redirect should point at the provider");
  assert.ok(state.length >= 30, "state should be high-entropy, not a counter");

  // The callback URL Composio is handed must be the PUBLIC path, never one under /api/admin.
  const callbackUrl = h.fake.lastCallbackUrl ?? "";
  assert.ok(callbackUrl.includes(`${CALLBACK}/github`));
  assert.equal(callbackUrl.includes("/api/admin"), false);

  // Nothing is connected until the callback completes.
  const statuses = (await (await fetch(`${h.baseUrl}${BASE}/statuses`, { headers: { cookie: h.cookie } })).json()) as Record<
    string,
    { status: string }
  >;
  assert.equal(statuses.github?.status, "available");
});

test("the callback URL is built as https:// when a reverse proxy reports X-Forwarded-Proto: https, even though the test server itself only speaks http", async (t) => {
  // Regression test: `resolvePublicOrigin` used to build the callback origin from `req.protocol`
  // alone, which Express only derives from a forwarded header when `app.set('trust proxy', ...)`
  // is configured — and this app deliberately never sets that. Behind a TLS-terminating reverse
  // proxy, every callback URL would therefore be minted as `http://...` even though the real
  // public endpoint is `https://`: broken (nothing may be listening on plain HTTP externally) and
  // a downgrade of a URL meant to be HTTPS.
  const h = await boot(t);

  const res = await fetch(`${h.baseUrl}${BASE}/github/connect`, {
    method: "POST",
    headers: { cookie: h.cookie, "x-forwarded-proto": "https" },
  });
  assert.equal(res.status, 200, `connect failed: ${await res.clone().text()}`);

  const callbackUrl = h.fake.lastCallbackUrl ?? "";
  assert.ok(
    callbackUrl.startsWith("https://"),
    `expected an https callback URL honoring X-Forwarded-Proto, got: ${callbackUrl}`
  );
});

test("the callback URL stays http:// with no forwarded-proto header — no proxy means req.protocol is already correct", async (t) => {
  const h = await boot(t);
  await beginConnect(h);

  const callbackUrl = h.fake.lastCallbackUrl ?? "";
  assert.ok(callbackUrl.startsWith("http://"), `expected the unproxied default, got: ${callbackUrl}`);
});

test("connect is rate-limited per client IP — the 13th attempt within the window is rejected 429 before any outbound Composio call", async (t) => {
  // Regression test: `POST .../connect` triggers a real outbound call to Composio
  // (`ComposioConnectorProvider.connect`) on every hit and previously had no rate limit of its
  // own — only session auth, which bounds WHO can call it, not how often. A retry storm (a
  // double-clicked button, a buggy client retry loop, or a misbehaving script reusing a valid
  // session) could drive unbounded outbound load against the workspace's single shared Composio
  // project key, risking Composio rate-limiting or blocking that key — a self-inflicted denial of
  // service against every admin in the workspace. `CONNECTOR_CONNECT_PER_IP` closes that: 10
  // requests + 2 burst = 12 allowed per 60s window per client IP.
  const h = await boot(t);

  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${h.baseUrl}${BASE}/github/connect`, { method: "POST", headers: { cookie: h.cookie } });
    assert.equal(res.status, 200, `attempt ${i + 1} should reach Composio, not the limiter: ${await res.clone().text()}`);
  }

  const thirteenth = await fetch(`${h.baseUrl}${BASE}/github/connect`, { method: "POST", headers: { cookie: h.cookie } });
  assert.equal(thirteenth.status, 429);
  const body = (await thirteenth.json()) as { code: string; details: { retryAfterSeconds: number } };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
  assert.ok(Number.isInteger(body.details.retryAfterSeconds) && body.details.retryAfterSeconds > 0);
  assert.equal(thirteenth.headers.get("retry-after"), String(body.details.retryAfterSeconds));

  // The count the fake server actually received must match — the limiter has to run BEFORE the
  // outbound call, not just before the response, or the "self-DoS against Composio" it exists to
  // prevent would still happen even while the caller sees 429s.
  const linkRequests = h.fake.requests.filter((p) => p.includes("connected_accounts/link"));
  assert.equal(linkRequests.length, 12, "the 13th, rate-limited attempt must never reach Composio");
});

test("disconnect is rate-limited per client IP — the 13th attempt within the window is rejected 429", async (t) => {
  // Regression test: `POST .../disconnect` revokes the account at Composio (a real outbound call)
  // on every hit, same self-DoS shape `connect`'s own rate-limit test above covers, but this route
  // had no limiter of its own until now. Uses its own limiter instance (`CONNECTOR_OUTBOUND_PER_IP`
  // via `disconnectOutboundLimiter`), separate from `connect`'s budget, so this test's 12 allowed
  // attempts prove the two limiters don't share state.
  //
  // NOTE on what this test does NOT prove: unlike connect/list-refresh/preview/put-config,
  // `service.disconnect` short-circuits locally with NO outbound call whenever the connector has no
  // stored credential (`if (credentials === undefined) return;` — Jini's `composio.ts`). Since this
  // test never connects "github" first, none of the 12 "allowed" attempts make an outbound call
  // either, so a fake-server request-count assertion here would be vacuous (flat at 0 whether or
  // not the limiter worked). The status-code assertions below are the meaningful proof for this
  // route: the limiter check runs unconditionally, before that credential short-circuit.
  const h = await boot(t);

  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${h.baseUrl}${BASE}/github/disconnect`, { method: "POST", headers: { cookie: h.cookie } });
    assert.notEqual(res.status, 429, `attempt ${i + 1} should reach the route handler, not the limiter`);
  }

  const thirteenth = await fetch(`${h.baseUrl}${BASE}/github/disconnect`, { method: "POST", headers: { cookie: h.cookie } });
  assert.equal(thirteenth.status, 429);
  const body = (await thirteenth.json()) as { code: string };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
});

test("catalog refresh (?refresh=1) is rate-limited per client IP; the unrefreshed static catalog is not", async (t) => {
  // Regression test: `GET .../connectors?refresh=1` re-fetches from Composio (a real outbound
  // call, `provider.refreshCatalog` -> the fake's `/api/v3.1/toolkits`); the default static-catalog
  // path makes no outbound call and must stay unlimited even past the refresh limiter's window.
  const h = await boot(t);
  const before = h.fake.requests.length;

  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${h.baseUrl}${BASE}?refresh=1`, { headers: { cookie: h.cookie } });
    assert.notEqual(res.status, 429, `refresh attempt ${i + 1} should reach the route handler, not the limiter`);
  }
  const afterAllowed = h.fake.requests.length;
  // Not an exact-count assertion: a single refresh can fan out to more than one outbound request
  // (observed 2x — cache-clear plus re-fetch). The point is proving the limiter, not pinning that
  // ratio, so just confirm the allowed attempts actually reached Composio at all.
  assert.ok(afterAllowed > before, "the 12 allowed refresh attempts must actually reach Composio");

  const refreshBlocked = await fetch(`${h.baseUrl}${BASE}?refresh=1`, { headers: { cookie: h.cookie } });
  assert.equal(refreshBlocked.status, 429);
  assert.equal(((await refreshBlocked.json()) as { code: string }).code, "RATE_LIMIT_EXCEEDED");
  assert.equal(
    h.fake.requests.length,
    afterAllowed,
    "the 13th, rate-limited refresh attempt must never reach Composio"
  );

  // The static (no-refresh) path is a separate, unlimited code path — it must still work.
  const unrefreshed = await fetch(`${h.baseUrl}${BASE}`, { headers: { cookie: h.cookie } });
  assert.equal(unrefreshed.status, 200, "the static catalog path must never be rate-limited");
});

test("tool-preview hydration (?hydrateTools=1) is rate-limited per client IP; plain getConnector is not", async (t) => {
  // Regression test: `GET .../connectors/:id?hydrateTools=1` makes a paginated outbound Composio
  // call; plain `getConnector` (no hydrateTools) is a cheap local read and must stay unlimited.
  const h = await boot(t);
  const before = h.fake.requests.length;

  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${h.baseUrl}${BASE}/github?hydrateTools=1`, { headers: { cookie: h.cookie } });
    assert.notEqual(res.status, 429, `preview attempt ${i + 1} should reach the route handler, not the limiter`);
  }
  const afterAllowed = h.fake.requests.length;
  assert.ok(afterAllowed > before, "the 12 allowed preview attempts must actually reach Composio");

  const previewBlocked = await fetch(`${h.baseUrl}${BASE}/github?hydrateTools=1`, { headers: { cookie: h.cookie } });
  assert.equal(previewBlocked.status, 429);
  assert.equal(((await previewBlocked.json()) as { code: string }).code, "RATE_LIMIT_EXCEEDED");
  assert.equal(
    h.fake.requests.length,
    afterAllowed,
    "the 13th, rate-limited preview attempt must never reach Composio"
  );

  const plain = await fetch(`${h.baseUrl}${BASE}/github`, { headers: { cookie: h.cookie } });
  assert.equal(plain.status, 200, "the plain (non-hydrating) read path must never be rate-limited");
});

test("key verification on PUT config is rate-limited per client IP; clearing a key is not", async (t) => {
  // Regression test: a non-null `apiKey` write verifies against Composio (a real outbound call,
  // `probeApiKey`) before persisting; `apiKey: null` (clear) makes no outbound call and must stay
  // unlimited, matching the existing "clearing works while Composio is down" invariant above.
  // NOTE: `boot()` itself already does one verifying PUT (the "configured project key" precondition
  // it sets up), consuming 1 of the 12 allowed slots — so only 11 more are available here, not 12.
  const h = await boot(t);
  const before = h.fake.requests.length;

  for (let i = 0; i < 11; i++) {
    const res = await fetch(`${h.baseUrl}${BASE}/config`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: h.cookie },
      body: JSON.stringify({ apiKey: DUMMY_KEY }),
    });
    assert.notEqual(res.status, 429, `verify attempt ${i + 1} should reach the route handler, not the limiter`);
  }
  const afterAllowed = h.fake.requests.length;
  assert.ok(afterAllowed > before, "the 11 allowed verify attempts must actually reach Composio");

  const blocked = await fetch(`${h.baseUrl}${BASE}/config`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: h.cookie },
    body: JSON.stringify({ apiKey: DUMMY_KEY }),
  });
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as { code: string }).code, "RATE_LIMIT_EXCEEDED");
  assert.equal(
    h.fake.requests.length,
    afterAllowed,
    "the 12th, rate-limited verify attempt must never reach Composio"
  );

  const cleared = await fetch(`${h.baseUrl}${BASE}/config`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: h.cookie },
    body: JSON.stringify({ apiKey: null }),
  });
  assert.equal(cleared.status, 200, "clearing a key must never be rate-limited");
});

test("the callback completes the handshake WITHOUT a session and seals the credentials", async (t) => {
  const h = await boot(t);
  const { state } = await beginConnect(h);

  // No cookie header at all — this is the entire reason the route is public.
  const callback = await fetch(`${h.baseUrl}${CALLBACK}/github?state=${encodeURIComponent(state)}&status=success&connectedAccountId=ca_fake_github_1`);
  assert.equal(callback.status, 200, `callback failed: ${await callback.clone().text()}`);

  const html = await callback.text();
  assert.match(html, /Connected/);
  assert.match(html, /jini:connector-connected/, "the popup must notify its opener");
  assert.equal(html.includes(state), false, "the state must not be echoed into the page");

  // The connector is now genuinely connected, with the account label the provider derived.
  const statuses = (await (await fetch(`${h.baseUrl}${BASE}/statuses`, { headers: { cookie: h.cookie } })).json()) as Record<
    string,
    { status: string; accountLabel?: string }
  >;
  assert.equal(statuses.github?.status, "connected");
  assert.equal(statuses.github?.accountLabel, "octocat@example.com");

  // And the credentials are on disk, sealed.
  const rows = await h.credentialRepo.listByWorkspaceId(WORKSPACE_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.connectorId, "github");
  assert.notEqual(rows[0]?.sealed, null);
  const serialized = JSON.stringify(rows[0]);
  assert.equal(serialized.includes("ca_fake_github_1"), false, "credentials must be ciphertext, not plaintext");
  assert.equal(serialized.includes("ac_fake_github_1"), false);
});

test("a replayed callback is refused — the state is single-use", async (t) => {
  const h = await boot(t);
  const { state } = await beginConnect(h);
  const url = `${h.baseUrl}${CALLBACK}/github?state=${encodeURIComponent(state)}&status=success&connectedAccountId=ca_fake_github_1`;

  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 400, "the second redemption of the same state must fail");
});

test("a callback with no state, or a state minted for another connector, is refused", async (t) => {
  const h = await boot(t);
  const { state } = await beginConnect(h);

  assert.equal((await fetch(`${h.baseUrl}${CALLBACK}/github`)).status, 400);
  assert.equal((await fetch(`${h.baseUrl}${CALLBACK}/github?state=not-a-real-state`)).status, 400);

  // The state is bound to `github`; redeeming it against `notion` must not connect anything.
  assert.equal(
    (await fetch(`${h.baseUrl}${CALLBACK}/notion?state=${encodeURIComponent(state)}&status=success&connectedAccountId=ca_fake_github_1`)).status,
    400
  );
  const statuses = (await (await fetch(`${h.baseUrl}${BASE}/statuses`, { headers: { cookie: h.cookie } })).json()) as Record<
    string,
    { status: string }
  >;
  assert.equal(statuses.notion?.status, "available");
});

test("a callback reporting a non-success status never stores credentials", async (t) => {
  const h = await boot(t);
  const { state } = await beginConnect(h);

  const res = await fetch(`${h.baseUrl}${CALLBACK}/github?state=${encodeURIComponent(state)}&status=failed`);
  assert.equal(res.status, 400);
  assert.equal((await h.credentialRepo.listByWorkspaceId(WORKSPACE_ID)).length, 0);
});

test("a provider-side account lookup failure fails the callback closed", async (t) => {
  const h = await boot(t, { failAccountLookup: true });
  const { state } = await beginConnect(h);

  const res = await fetch(`${h.baseUrl}${CALLBACK}/github?state=${encodeURIComponent(state)}&status=success&connectedAccountId=ca_fake_github_1`);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Couldn/);
  assert.equal((await h.credentialRepo.listByWorkspaceId(WORKSPACE_ID)).length, 0);
});

test("disconnect revokes at the provider and deletes the sealed row", async (t) => {
  const h = await boot(t);
  const { state } = await beginConnect(h);
  await fetch(`${h.baseUrl}${CALLBACK}/github?state=${encodeURIComponent(state)}&status=success&connectedAccountId=ca_fake_github_1`);
  assert.equal((await h.credentialRepo.listByWorkspaceId(WORKSPACE_ID)).length, 1);

  const res = await fetch(`${h.baseUrl}${BASE}/github/disconnect`, { method: "POST", headers: { cookie: h.cookie } });
  assert.equal(res.status, 200, `disconnect failed: ${await res.clone().text()}`);

  assert.deepEqual(h.fake.deletedAccountIds, ["ca_fake_github_1"], "the remote account must be revoked too");
  assert.equal(
    (await h.credentialRepo.listByWorkspaceId(WORKSPACE_ID)).length,
    0,
    "the sealed row must be gone once the route has responded — the flush is awaited"
  );
});

test("connected credentials survive a restart, and never reach any API response", async (t) => {
  const h = await boot(t);
  const { state } = await beginConnect(h);
  await fetch(`${h.baseUrl}${CALLBACK}/github?state=${encodeURIComponent(state)}&status=success&connectedAccountId=ca_fake_github_1`);

  // A fresh service over the SAME repos, sealer, and keyring is what a restart looks like: the
  // process-local caches are gone, the durable state and the master secret are not. Handing it a
  // DIFFERENT keyring would test key rotation, which is a separate question.
  const restarted = createComposioConnectors({
    workspaceId: WORKSPACE_ID,
    repo: h.deps.composioConfigRepo,
    credentialRepo: h.credentialRepo,
    sealer: h.deps.siteAssistantSecretSealer,
    keyring: h.deps.siteAssistantSecretKeyring,
    clock: h.deps.clock,
    baseUrl: h.fake.url,
  });
  await restarted.refresh();

  assert.equal(
    restarted.service.listConnectorStatuses().github?.status,
    "connected",
    "a restart must not silently drop the connection — this is what the durable table is for"
  );

  // No admin response anywhere carries credential material.
  const detail = await (await fetch(`${h.baseUrl}${BASE}/github`, { headers: { cookie: h.cookie } })).text();
  assert.equal(detail.includes("ca_fake_github_1"), false);
});

test("every mutating route still requires a session; only the callback is public", async (t) => {
  const h = await boot(t);

  for (const path of ["/github/connect", "/github/disconnect", "/github/cancel"]) {
    const res = await fetch(`${h.baseUrl}${BASE}${path}`, { method: "POST" });
    assert.equal(res.status, 401, `${path} must reject an unauthenticated caller`);
  }
});
