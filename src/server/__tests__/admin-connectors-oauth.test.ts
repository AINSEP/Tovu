import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startFakeComposio, type FakeComposioServer } from "../../../development/e2e/fake-composio-server";
import { InMemoryComposioConfigRepo } from "../../connectors/composio-config-store.memory";
import { composioUserIdFor, createComposioConnectors } from "../../connectors/composio-service";
import { InMemoryConnectorCredentialRepo } from "../../connectors/connector-credential-store.memory";
import { InMemoryKeyring } from "../../integrations/keyring.memory";
import { AesGcmSecretSealer } from "../../integrations/secret-sealer.aesgcm";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createConnectorsModule } from "../modules/connectors";
import type { RouteDeps } from "../routes/types";
import { bootAuthenticated } from "./helpers/http-test-server";

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
