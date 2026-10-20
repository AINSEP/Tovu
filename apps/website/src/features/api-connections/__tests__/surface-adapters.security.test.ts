/**
 * @file Phase-A security pins for the G6d adapters behind plugin admin surfaces: the connections
 * port by connection id (foreign ids, plugins, workspaces and a missing admin refused alike),
 * declared start parameters only, callback fields once and only for the owner plugin, revocation
 * outcomes verbatim, the per-request registry of host-issued sign-in links, plugin state isolation
 * and caps, read-only state for tools, public config that never yields a secret, and the
 * form-delivery API-origin allowlist. Phase-B pins: the plugin's attempt id is the service's own
 * random id (never the OAuth state), every ref operation names the port's workspace, one pending
 * desktop listener per connection (cancel-previous), and no staged-switch label after its expiry.
 * The fake provider ("acme-office", a fixture) is a local
 * server; every other host throws.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";
import type { AgentPluginStateReader } from "@jini-ai/agent-plugins/lifecycle/tools";
import { startLoopbackAuthorizationReceiver, type OAuthHttpPorts } from "@jini-ai/oauth";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { createIssuedSignInCollector } from "../../agent-plugins/admin-surfaces/issued-sign-ins.js";
import { createAdminSurfacePublicConfig, PUBLIC_CONFIG_REFUSED_MESSAGE } from "../../agent-plugins/admin-surfaces/public-config.js";
import { createAgentPluginToolCapabilities, createFrozenConnectionAccounts } from "../../agent-plugins/executable-tools/host-capabilities.js";
import { parseApiConnectionsFile } from "../contribution.js";
import { createOAuthFormDeliveryConnectionPort } from "../form-delivery-connection.js";
import { createApiConnectionHost } from "../host.js";
import { PLUGIN_STATE_MAX_KEYS, PLUGIN_STATE_UNAVAILABLE_MESSAGE } from "../plugin-state.js";
import { createSurfaceConnections, type IssuedSignIn } from "../surface-connections.js";
import { runApiConnectionConnect } from "../connect.js";
import { registerApiConnectionOAuthCallbackRoute } from "../../../server/inbound/public-http/routes/api-connections/oauth-callback.js";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "acme-office");
const PLUGIN = "acme-office";
const WORKSPACE = "ws-1";
const accessToken = "acme-access-" + "q".repeat(24);
const issued = new Map<string, string>();
const ADA = { id: "acct-1", name: "Ada" };
/** The fake provider's mutable answers; a test that changes one restores it in `finally`. */
const provider = { revokeStatus: 200, account: ADA };
let providerServer: Server;
let siteServer: Server;
let providerOrigin = "";
let siteOrigin = "";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

function toLocal(raw: string): string {
  const url = new URL(raw);
  if (url.hostname !== "auth.acme.test" && url.hostname !== "api.acme.test") throw new Error(`unexpected outbound host ${url.hostname}`);
  return `${providerOrigin}${url.pathname}${url.search}`;
}

const oauthHttp: OAuthHttpPorts = { guard: { assertSafeUrl: ({ raw }) => new URL(raw) }, fetchFn: ({ url }, init) => fetch(toLocal(String(url)), init) };
const pluginHttp = { fetch: ({ url }: { url: string }, init: RequestInit = {}) => fetch(toLocal(url), init) };

before(async () => {
  providerServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/me") return void res.end(JSON.stringify(provider.account));
      if (req.url === "/revoke") { res.statusCode = provider.revokeStatus; return void res.end("{}"); }
      const form = new URLSearchParams(body);
      const challenge = issued.get(form.get("code") ?? "");
      issued.delete(form.get("code") ?? "");
      const verified = challenge !== undefined && createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === challenge;
      res.statusCode = verified ? 200 : 400;
      res.end(JSON.stringify(verified ? { access_token: accessToken, refresh_token: "acme-refresh-" + "r".repeat(24), token_type: "Bearer", expires_in: 3600, scope: "acme.files" } : { error: "invalid_grant" }));
    });
  });
  providerOrigin = await listen(providerServer);
  siteServer = createServer();
  siteOrigin = await listen(siteServer);
});
after(async () => {
  await new Promise((resolve) => providerServer.close(resolve));
  await new Promise((resolve) => siteServer.close(resolve));
});

function makeHost(runtime: "hosted" | "desktop" = "hosted", clock: { nowMs: () => number } = { nowMs: () => Date.now() }) {
  const keyring = new InMemoryKeyring({ hkdfSalt: "surface-adapters-security" });
  const loadContributions: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: PLUGIN, packageRoot: fixtureRoot }, definition: input.definition });
  const host = createApiConnectionHost({
    workspaceId: WORKSPACE, loadContributions, vaultRepo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }),
    clock, oauthHttp, pluginHttp, runtime,
    env: { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24), TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client" },
    publicOrigin: () => siteOrigin,
  });
  const app = express();
  registerApiConnectionOAuthCallbackRoute(app, { host, callbackLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, log: () => {} });
  siteServer.removeAllListeners("request");
  siteServer.on("request", app);
  return host;
}

/** The "browser": consent at the fake provider, back to the callback with a PKCE-bound code and any extra fields. */
async function consent(authorizationUrl: string, extra: Readonly<Record<string, string>> = {}): Promise<number> {
  const url = new URL(authorizationUrl);
  const code = randomBytes(12).toString("hex");
  issued.set(code, url.searchParams.get("code_challenge") ?? "");
  const back = new URL(url.searchParams.get("redirect_uri") ?? "");
  for (const [name, value] of Object.entries({ ...extra, code, state: url.searchParams.get("state") ?? "" })) back.searchParams.set(name, value);
  return (await fetch(back)).status;
}

const portFor = (host: ReturnType<typeof makeHost>, scope: { pluginId?: string; workspaceId?: string; principalId?: string | undefined } = {}) =>
  createSurfaceConnections({ host, pluginId: scope.pluginId ?? PLUGIN, workspaceId: scope.workspaceId ?? WORKSPACE, principalId: "principalId" in scope ? scope.principalId : "admin-1" });

async function connected(host: ReturnType<typeof makeHost>) {
  const port = portFor(host);
  assert.equal(await consent((await port.begin({ connectionId: "account", action: "connect" })).authorizationUrl), 200);
  return port;
}

const NOT_AVAILABLE = { code: "connection-not-found", message: /not available to this plugin here/ };

test("connections: an undeclared id, another plugin, another workspace and a call without an admin all get the same refusal", async () => {
  const host = makeHost();
  await connected(host);
  await assert.rejects(portFor(host).status({ connectionId: "other" }), NOT_AVAILABLE);
  await assert.rejects(portFor(host, { pluginId: "other-plugin" }).getAccessToken({ connectionId: "account" }), NOT_AVAILABLE);
  await assert.rejects(portFor(host, { workspaceId: "ws-2" }).getAccessToken({ connectionId: "account" }), NOT_AVAILABLE);
  await assert.rejects(portFor(host, { workspaceId: "ws-2" }).begin({ connectionId: "account", action: "connect" }), NOT_AVAILABLE, "never a sign-in in this workspace for another");
  await assert.rejects(portFor(host, { principalId: undefined }).begin({ connectionId: "account", action: "connect" }), NOT_AVAILABLE);
  assert.equal(await portFor(host).getAccessToken({ connectionId: "account" }), accessToken, "the owner still gets its own token");
});

test("connections: a start parameter the connection does not declare is refused before any sign-in starts", async () => {
  const host = makeHost();
  await assert.rejects(portFor(host).begin({ connectionId: "account", action: "connect" }, { startParams: { redirect_uri: "https://evil.example" } }),
    { code: "request-invalid", message: /start parameter 'redirect_uri' is not declared/ });
  const begun = await portFor(host).begin({ connectionId: "account", action: "connect" }, { startParams: { pick_mode: "one" } });
  assert.equal(new URL(begun.authorizationUrl).searchParams.get("pick_mode"), "one");
});

test("callback fields: only the declared ones are kept, only the owner plugin can take them, and only once", async () => {
  const host = makeHost();
  const port = await connected(host);
  const begun = await port.begin({ connectionId: "account", action: "reconnect" }, { startParams: { pick_mode: "one" } });
  assert.equal(await consent(begun.authorizationUrl, { picked_ids: "T1", undeclared_field: "x" }), 200);
  assert.equal(host.callbackInbox.take({ workspaceId: WORKSPACE, pluginId: "other-plugin", connectionId: "account", attemptId: begun.attemptId }), null);
  await assert.rejects(portFor(host, { pluginId: "other-plugin" }).takeCallbackFields({ connectionId: "account", attemptId: begun.attemptId }), NOT_AVAILABLE);
  assert.deepEqual(await port.takeCallbackFields({ connectionId: "account", attemptId: begun.attemptId }), { picked_ids: "T1" });
  assert.equal(await port.takeCallbackFields({ connectionId: "account", attemptId: begun.attemptId }), null);
  assert.ok(!begun.attemptId.includes(new URL(begun.authorizationUrl).searchParams.get("state")!), "the attempt id is not the state");
});

test("desktop: the loopback sign-in deposits the declared callback fields for the owner plugin only", async () => {
  const host = makeHost("desktop");
  const port = portFor(host);
  const begun = await port.begin({ connectionId: "account", action: "connect" }, { startParams: { pick_mode: "one" } });
  assert.match(new URL(begun.authorizationUrl).searchParams.get("redirect_uri")!, /^http:\/\/127\.0\.0\.1:\d+\//);
  assert.equal(await consent(begun.authorizationUrl, { picked_ids: "T9" }), 200);
  let fields: Readonly<Record<string, string>> | null = null;
  for (let tries = 0; fields === null && tries < 100; tries += 1) {
    fields = await port.takeCallbackFields({ connectionId: "account", attemptId: begun.attemptId });
    if (fields === null) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(fields, { picked_ids: "T9" });
  assert.equal(await port.getAccessToken({ connectionId: "account" }), accessToken, "the loopback completion connected the account");
});

test("disconnect: revocation is reported verbatim, never 'confirmed' unless the provider confirmed", async () => {
  const host = makeHost();
  const port = await connected(host);
  provider.revokeStatus = 503;
  const pending = await port.disconnect({ connectionId: "account" });
  assert.deepEqual([pending.status, pending.revocation], ["revocation-pending", "pending"]);
  await assert.rejects(port.getAccessToken({ connectionId: "account" }), { code: "revocation-pending" });
  provider.revokeStatus = 200;
  const retried = await port.disconnect({ connectionId: "account" });
  assert.deepEqual([retried.status, retried.revocation], ["disconnected", "confirmed"]);
});

test("issued sign-ins: only links recorded inside a collection, only https, and concurrent collections never mix", async () => {
  const signIns = createIssuedSignInCollector();
  const link = (name: string) => ({ authorizationUrl: `https://auth.acme.test/authorize?state=${name}`, expiresAt: "2026-10-20T10:10:00.000Z" });
  signIns.record(link("outside"));
  const [first, second] = await Promise.all([
    signIns.collect({ run: async () => { await new Promise((resolve) => setImmediate(resolve)); signIns.record(link("a")); signIns.record({ authorizationUrl: "http://auth.acme.test/x", expiresAt: "x" }); return 1; } }),
    signIns.collect({ run: async () => { signIns.record(link("b")); return 2; } }),
  ]);
  assert.deepEqual(first, { value: 1, signIns: [link("a")] });
  assert.deepEqual(second, { value: 2, signIns: [link("b")] });
});

test("plugin state: another plugin or workspace never sees a value; malformed keys and oversized values are refused", async () => {
  const host = makeHost();
  const own = host.pluginState.forPlugin({ workspaceId: WORKSPACE, pluginId: PLUGIN });
  await own.set({ key: "selection", value: { tableId: "T1" } });
  assert.deepEqual(await own.get({ key: "selection" }), { tableId: "T1" });
  assert.equal(await host.pluginState.readerFor({ workspaceId: WORKSPACE, pluginId: "other-plugin" }).get({ key: "selection" }), null);
  await assert.rejects(host.pluginState.readerFor({ workspaceId: "ws-2", pluginId: PLUGIN }).get({ key: "selection" }), { message: PLUGIN_STATE_UNAVAILABLE_MESSAGE });
  await assert.rejects(host.pluginState.forPlugin({ workspaceId: WORKSPACE, pluginId: "acme-office:selection" }).get({ key: "x" }), { message: PLUGIN_STATE_UNAVAILABLE_MESSAGE });
  await assert.rejects(own.set({ key: "../escape", value: 1 }), { message: /setting key must be/ });
  await assert.rejects(own.set({ key: "big", value: "x".repeat(16 * 1024) }), { message: /at most 16384 bytes/ });
  await own.delete({ key: "selection" });
  assert.equal(await own.get({ key: "selection" }), null);
});

test("plugin state: a plugin's key count is capped; existing keys still update at the cap", async () => {
  const host = makeHost();
  const own = host.pluginState.forPlugin({ workspaceId: WORKSPACE, pluginId: PLUGIN });
  for (let index = 0; index < PLUGIN_STATE_MAX_KEYS; index += 1) await own.set({ key: `k${index}`, value: index });
  await assert.rejects(own.set({ key: "one-more", value: 1 }), { message: new RegExp(`at most ${PLUGIN_STATE_MAX_KEYS} settings`) });
  await own.set({ key: "k0", value: "updated" });
  assert.equal(await own.get({ key: "k0" }), "updated");
  await host.pluginState.forPlugin({ workspaceId: WORKSPACE, pluginId: "other-plugin" }).set({ key: "k0", value: 1 });
});

test("tools: plugin state is read-only and scoped to the calling plugin and workspace, whatever the store exposes", async () => {
  const scopes: unknown[] = [];
  const writable: AgentPluginStateReader & { set(): Promise<void> } = { get: async () => "value", set: async () => { throw new Error("tools must not write"); } };
  const port = createAgentPluginToolCapabilities({
    connections: { readAccount: async () => null, getAccessToken: async () => accessToken }, http: { send: async () => { throw new Error("no network"); } },
    limiter: { check: async () => ({ allowed: true }) }, frozen: createFrozenConnectionAccounts(),
    state: (scope) => { scopes.push(scope); return writable; },
  });
  const { state } = port({ pluginId: PLUGIN, workspaceId: WORKSPACE });
  assert.deepEqual(Object.keys(state), ["get"]);
  assert.equal(await state.get({ key: "selection" }), "value");
  assert.deepEqual(scopes, [{ workspaceId: WORKSPACE, pluginId: PLUGIN }]);
});

test("public config: only TOVU_…_APP_ID/_CLIENT_ID/_BROWSER_KEY/_PUBLIC_KEY names without secret words are read; unset reads null", async () => {
  const config = createAdminSurfacePublicConfig({ env: {
    TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24), TOVU_SESSION_KEY: "k", TOVU_SITE_KEY: "k", TOVU_S3_ACCESS_KEY_ID: "k", DATABASE_URL: "postgres://u:p@h/db",
    TOVU_SESSION_SIGNING_APP_ID: "k", TOVU_ACME_CHOOSER_APP_ID: " app-1 ",
  } });
  for (const name of ["TOVU_ACME_OAUTH_WEB_CLIENT_SECRET", "TOVU_SESSION_KEY", "TOVU_SITE_KEY", "TOVU_S3_ACCESS_KEY_ID", "DATABASE_URL", "TOVU_SESSION_SIGNING_APP_ID", "lowercase_name"]) {
    await assert.rejects(config.get({ name }), { message: PUBLIC_CONFIG_REFUSED_MESSAGE }, name);
  }
  assert.equal(await config.get({ name: "TOVU_ACME_CHOOSER_APP_ID" }), "app-1");
  assert.equal(await config.get({ name: "TOVU_ACME_UNSET_APP_ID" }), null);
});

test("form delivery: the credential allows only the connection's declared https API origins; an http origin refuses the declaration", async () => {
  const host = makeHost();
  await connected(host);
  const connectionRef = deriveApiConnectionKey({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionId: "account" });
  const port = createOAuthFormDeliveryConnectionPort({ hostFor: () => host, adapterPluginId: async () => PLUGIN });
  assert.deepEqual(await port({ workspaceId: WORKSPACE, connectionRef, adapterId: "acme-office-rows" }), { token: accessToken, baseUrl: "https://api.acme.test", additionalHosts: [] });
  const declaration = (apiOrigins: unknown) => JSON.stringify({ schemaVersion: 1, connections: [{ id: "account", module: "lib/connection.mjs", clients: {}, apiOrigins }] });
  assert.deepEqual(parseApiConnectionsFile({ raw: declaration(["http://api.acme.test"]) }), { ok: false, reason: "connections[0].apiOrigins must be at most 8 https:// origins" });
  assert.deepEqual(parseApiConnectionsFile({ raw: declaration(["https://api.acme.test/path"]) }), { ok: false, reason: "connections[0].apiOrigins must be at most 8 https:// origins" });
});

/** Signs in as `account` at the fake provider for one action (the provider answers Ada otherwise). */
async function consentAs(account: { id: string; name: string }, authorizationUrl: string, extra: Readonly<Record<string, string>> = {}): Promise<number> {
  provider.account = account;
  try { return await consent(authorizationUrl, extra); } finally { provider.account = ADA; }
}

for (const runtime of ["hosted", "desktop"] as const) {
  test(`attempt id (${runtime}): the plugin gets the service's random attempt id, never the OAuth state or a digest of it`, async () => {
    const host = makeHost(runtime);
    const reported: IssuedSignIn[] = [];
    const port = createSurfaceConnections({ host, pluginId: PLUGIN, workspaceId: WORKSPACE, principalId: "admin-1", onSignInIssued: (signIn) => reported.push(signIn) });
    const begun = await port.begin({ connectionId: "account", action: "connect" }, { startParams: { pick_mode: "one" } });
    const state = new URL(begun.authorizationUrl).searchParams.get("state")!;
    assert.deepEqual(Object.keys(begun).sort(), ["attemptId", "authorizationUrl", "expiresAt"]);
    assert.notEqual(begun.attemptId, state);
    assert.notEqual(begun.attemptId, createHash("sha256").update(state).digest("base64url"), "not the earlier state digest either");
    const { authorizationUrl: _url, ...reportedRest } = reported[0]!;
    assert.ok(!JSON.stringify(reportedRest).includes(state), "only the authorization URL itself carries the state");
    assert.equal(await consent(begun.authorizationUrl, { picked_ids: "T2" }), 200);
    let fields: Readonly<Record<string, string>> | null = null;
    for (let tries = 0; fields === null && tries < 100; tries += 1) {
      fields = await port.takeCallbackFields({ connectionId: "account", attemptId: begun.attemptId });
      if (fields === null) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(fields, { picked_ids: "T2" }, "the fields wait under the attempt id the plugin was given, without state or code");
  });
}

test("workspace: every connection-ref operation names the port's workspace (connect, confirm, cancel, disconnect)", async () => {
  const base = makeHost();
  const seen: [string, string][] = [];
  const recording: typeof base = {
    ...base,
    serviceFor: (input) => {
      const service = base.serviceFor(input);
      return {
        ...service,
        getStatus: (args) => { seen.push(["getStatus", args.workspaceId]); return service.getStatus(args); },
        confirmSwitchAccount: (args) => { seen.push(["confirmSwitchAccount", args.workspaceId]); return service.confirmSwitchAccount(args); },
        cancelSwitchAccount: (args) => { seen.push(["cancelSwitchAccount", args.workspaceId]); return service.cancelSwitchAccount(args); },
        disconnect: (args) => { seen.push(["disconnect", args.workspaceId]); return service.disconnect(args); },
      };
    },
  };
  const [connection] = await base.listConnections({ pluginId: PLUGIN });
  const connected = await runApiConnectionConnect({
    deps: { host: recording }, connection: connection!, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => { assert.equal(await consent(signInUrl), 200); },
  });
  assert.equal(connected.status, "connected");
  const port = createSurfaceConnections({ host: recording, pluginId: PLUGIN, workspaceId: WORKSPACE, principalId: "admin-1" });
  assert.equal(await consentAs({ id: "acct-2", name: "Bob" }, (await port.begin({ connectionId: "account", action: "switch" })).authorizationUrl), 200);
  assert.equal((await port.confirmSwitch({ connectionId: "account" })).accountLabel, "Bob");
  assert.equal(await consentAs({ id: "acct-3", name: "Cy" }, (await port.begin({ connectionId: "account", action: "switch" })).authorizationUrl), 200);
  assert.equal((await port.cancelSwitch({ connectionId: "account" })).accountLabel, "Bob");
  assert.equal((await port.disconnect({ connectionId: "account" })).revocation, "confirmed");
  assert.deepEqual([...new Set(seen.map(([op]) => op))], ["getStatus", "confirmSwitchAccount", "cancelSwitchAccount", "disconnect"]);
  assert.deepEqual(seen.filter(([, workspaceId]) => workspaceId !== WORKSPACE), []);
});

test("desktop: a new sign-in closes the previous pending loopback listener (cancel-previous); the newer one completes", async () => {
  const host = makeHost("desktop");
  // The real receiver, observed: probing a listener over HTTP would itself consume and close it.
  const listeners: AbortSignal[] = [];
  const startLoopback: typeof startLoopbackAuthorizationReceiver = (required, optional = {}) => {
    if (optional.signal) listeners.push(optional.signal);
    return startLoopbackAuthorizationReceiver(required, optional);
  };
  const port = createSurfaceConnections({ host, pluginId: PLUGIN, workspaceId: WORKSPACE, principalId: "admin-1", startLoopback });
  await port.begin({ connectionId: "account", action: "connect" });
  assert.equal(listeners[0]!.aborted, false);
  const second = await port.begin({ connectionId: "account", action: "connect" });
  assert.deepEqual(listeners.map((signal) => signal.aborted), [true, false], "only the newer listener is still open");
  assert.equal(await consent(second.authorizationUrl), 200);
  let token: string | null = null;
  for (let tries = 0; token === null && tries < 100; tries += 1) {
    token = await port.getAccessToken({ connectionId: "account" }).catch(() => null);
    if (token === null) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(token, accessToken);
});

test("status: a staged switch's account label disappears once the switch expired, in status and in action results", async () => {
  let now = Date.now();
  const host = makeHost("hosted", { nowMs: () => now });
  const port = await connected(host);
  assert.equal(await consentAs({ id: "acct-2", name: "Bob" }, (await port.begin({ connectionId: "account", action: "switch" })).authorizationUrl), 200);
  assert.equal((await port.status({ connectionId: "account" })).pendingSwitchAccountLabel, "Bob");
  now += 10 * 60 * 1000 + 1;
  assert.equal((await port.status({ connectionId: "account" })).pendingSwitchAccountLabel, null);
  provider.revokeStatus = 503;
  try {
    assert.equal((await port.cancelSwitch({ connectionId: "account" })).pendingSwitchAccountLabel, null);
    const key = deriveApiConnectionKey({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionId: "account" });
    assert.notEqual((await host.records.read({ key }))?.staged ?? null, null, "the unrevoked staged switch is kept for a retry; only its label is gone");
  } finally { provider.revokeStatus = 200; }
});
