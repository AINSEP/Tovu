/**
 * @file The ONE vertical-slice proof for the G6b wiring: `composeAgentPluginConnections` (what both
 * composition roots call) carries a fake provider plugin ("acme-office", a test fixture) from
 * `agent_plugin_connect`'s sign-in through the public callback to an executable tool call and an
 * admin-surface action, both answered with a token from the shared connection port. Plus the
 * security pins for that port. Only the fake provider's hosts resolve (to a local server); any other
 * host throws.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import type { HttpClientPort } from "@jini-ai/core/primitives";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { createAdminSurfaceActionDispatcher, defineAdminSurfaceContribution } from "@jini-ai/agent-plugins/admin-surfaces";
import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { registerAgentPluginExecutableTools } from "#src/features/agent-plugins/executable-tools/register";
import { ADMIN_SURFACES_FILENAME } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import { runApiConnectionConnect } from "#src/features/api-connections/connect";
import { registerApiConnectionOAuthCallbackRoute } from "#src/server/inbound/public-http/routes/api-connections/oauth-callback";
import type { AuthorizeFn } from "#src/contracts/core/commands/index";
import { composeAgentPluginConnections } from "../agent-plugin-connections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "../../../../features/api-connections/__tests__/fixtures/acme-office");
const WORKSPACE = "ws-1";
const PLUGIN = "acme-office";
const accessToken = "acme-access-" + "z".repeat(24);
const refreshToken = "acme-refresh-" + "w".repeat(24);
const issued = new Map<string, string>();
let provider: Server;
let site: Server;
let providerOrigin = "";
let siteOrigin = "";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** The site's outbound HTTP: the fake provider's two hosts go to the local server; anything else throws. */
const http: HttpClientPort = {
  async send({ request }) {
    const url = new URL(request.url);
    if (url.hostname !== "auth.acme.test" && url.hostname !== "api.acme.test") throw new Error(`unexpected outbound host ${url.hostname}`);
    const response = await fetch(`${providerOrigin}${url.pathname}${url.search}`, { method: request.method, headers: request.headers, ...(request.body === undefined ? {} : { body: request.body as string }) });
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), bodyText: await response.text() };
  },
};

before(async () => {
  provider = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/me") {
        res.statusCode = req.headers.authorization === `Bearer ${accessToken}` ? 200 : 401;
        return res.end(JSON.stringify({ id: "acct-1", name: "Ada" }));
      }
      const form = new URLSearchParams(body);
      const challenge = issued.get(form.get("code") ?? "");
      issued.delete(form.get("code") ?? "");
      const verified = challenge !== undefined && createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === challenge;
      res.statusCode = verified ? 200 : 400;
      res.end(JSON.stringify(verified ? { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" } : { error: "invalid_grant" }));
    });
  });
  providerOrigin = await listen(provider);
  process.env.TOVU_PUBLIC_URL = PUBLIC_URL;
  site = createServer();
  siteOrigin = await listen(site);
});
after(async () => {
  await new Promise((resolve) => provider.close(resolve));
  await new Promise((resolve) => site.close(resolve));
  if (previousPublicUrl === undefined) delete process.env.TOVU_PUBLIC_URL;
  else process.env.TOVU_PUBLIC_URL = previousPublicUrl;
});

const loadContributions: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: PLUGIN, packageRoot: fixtureRoot }, definition: input.definition });

/** The site's public address; the callback route reads it from the process env, as in production. */
const PUBLIC_URL = "https://site.acme-test.invalid";
const previousPublicUrl = process.env.TOVU_PUBLIC_URL;

async function compose(env: Record<string, string> = { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24), TOVU_PUBLIC_URL: PUBLIC_URL }) {
  const keyring = new InMemoryKeyring({ hkdfSalt: "agent-plugin-connections-slice" });
  const composition = composeAgentPluginConnections({
    workspaceId: WORKSPACE, loadContributions, vaultRepo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() }, http,
    env,
    derivedPublicOrigin: undefined,
  });
  return composition;
}

/** Serves the public callback for this composition (only) on the local "site". */
function mountCallback(composition: Awaited<ReturnType<typeof compose>>): void {
  const app = express();
  registerApiConnectionOAuthCallbackRoute(app, { host: composition.apiConnections.host, callbackLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, log: () => {} });
  site.removeAllListeners("request");
  site.on("request", app);
}

/** Connects the fixture's connection through `agent_plugin_connect`'s hosted path and the public callback. */
async function connectHosted(composition: Awaited<ReturnType<typeof compose>>) {
  mountCallback(composition);
  const [connection] = await composition.apiConnections.host.listConnections({ pluginId: PLUGIN });
  return runApiConnectionConnect({
    deps: composition.apiConnections, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => { assert.equal((await fetch(consentRedirect(signInUrl))).status, 200); },
  });
}

/** The "browser": consent at the fake provider, which redirects back with a code bound to the PKCE challenge. */
function consentRedirect(authorizationUrl: string): string {
  const url = new URL(authorizationUrl);
  const code = randomBytes(12).toString("hex");
  issued.set(code, url.searchParams.get("code_challenge") ?? "");
  const back = new URL(url.searchParams.get("redirect_uri") ?? "");
  back.searchParams.set("code", code);
  back.searchParams.set("state", url.searchParams.get("state") ?? "");
  // The public address is not real; the "browser" reaches this test's local site for it.
  return back.origin === PUBLIC_URL ? `${siteOrigin}${back.pathname}${back.search}` : back.href;
}

const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
const connectionRef = deriveApiConnectionKey({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionId: "account" });

test("vertical slice: connect -> public callback -> executable tool call -> admin-surface action, all through the composition", async () => {
  const composition = await compose();
  assert.deepEqual(await connectHosted(composition), { status: "connected" });

  const registry = createToolRegistry({});
  const { refusals } = await registerAgentPluginExecutableTools({
    registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true,
    applyApproval: ({ registration }) => registration,
  });
  assert.deepEqual(refusals, []);
  const toolResult = await createToolExecutor({ registry }).execute({ toolId: "p_acme_office__whoami", principal: { id: "admin-1" }, run: { id: "run-1" }, input: { connectionRef } });
  assert.equal(toolResult.status, "completed", String(toolResult.error));
  assert.deepEqual(toolResult.output, { name: "Ada" });

  const context = { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account" };
  assert.equal(await composition.adminSurfaceHost.bootstrapData({ context }), null, "opening the surface loads its handlers");
  const [surface] = (await loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) })).items;
  const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface!.descriptor, handlers: composition.adminSurfaceHost.handlersFor({ pluginId: PLUGIN, surfaceId: "account" }) });
  const answer = await dispatcher.dispatch({ action: "whoami", payload: { connectionRef }, context });
  assert.deepEqual(answer, { ok: true, result: { name: "Ada" } });
  assert.ok(!JSON.stringify([toolResult.output, answer]).includes(accessToken), "no token in any answer");
});

test("security: the shared connection port refuses another workspace's target and reads no account for it", async () => {
  const composition = await compose();
  assert.deepEqual(await connectHosted(composition), { status: "connected" });
  const { connections } = composition.agentPluginTools;
  assert.equal((await connections.readAccount({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionRef }))?.displayName, "Ada");
  await assert.rejects(connections.getAccessToken({ workspaceId: "ws-2", pluginId: PLUGIN, connectionRef }), { code: "connection-not-found", message: /not available to this plugin/ });
  assert.equal(await connections.readAccount({ workspaceId: "ws-2", pluginId: PLUGIN, connectionRef }), null);
  assert.equal(await connections.readAccount({ workspaceId: WORKSPACE, pluginId: "other-plugin", connectionRef }), null);
});

test("security: desktop admits only its plaintext loopback redirect, and completes the sign-in itself", async () => {
  const composition = await compose({ ELECTRON_RUN_AS_NODE: "1", TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client" });
  const { host } = composition.apiConnections;
  assert.equal(host.runtime, "desktop");
  const [connection] = await host.listConnections({ pluginId: PLUGIN });
  let redirectUri = "";
  const connected = await runApiConnectionConnect({
    deps: composition.apiConnections, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => {
      redirectUri = new URL(signInUrl).searchParams.get("redirect_uri") ?? "";
      await fetch(consentRedirect(signInUrl));
    },
  });
  assert.deepEqual(connected, { status: "connected" });
  assert.match(redirectUri, /^http:\/\/127\.0\.0\.1:\d+\//);
  const hosted = await compose({ TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24) });
  const service = hosted.apiConnections.host.serviceFor({ connection, redirectUri });
  await assert.rejects(service.start({ workspaceId: WORKSPACE, actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri }), { message: /must use https/ });
});
