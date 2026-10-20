/**
 * @file Vertical-slice proof for plugin-declared API connections (one test), plus the phase-A
 * security pins: state/PKCE at the public callback, consume-once attempts, plugin+workspace scoped
 * access tokens, and no refresh token ever leaving the store. A fake provider plugin ("acme-office",
 * a fixture) talks to a local fake OAuth server; every other host throws.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";
import type { OAuthHttpPorts } from "@jini-ai/oauth";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { createCustomCredential, deleteCustomCredential, InMemoryCustomCredentialSetRepo, listCustomCredentials, updateCustomCredential } from "../../custom-credentials/index.js";
import { byoClientLabel } from "../byo-client.js";
import { InMemoryKeyring as TovuInMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer as TovuAesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { runApiConnectionConnect } from "../connect.js";
import { createOAuthFormDeliveryConnectionPort } from "../form-delivery-connection.js";
import { createApiConnectionHost } from "../host.js";
import { parseApiConnectionsFile } from "../contribution.js";
import { CONNECTION_HOOK_UNDECLARED_ORIGIN_MESSAGE } from "../hook-http.js";
import { registerApiConnectionOAuthCallbackRoute } from "../../../server/inbound/public-http/routes/api-connections/oauth-callback.js";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "acme-office");
const accessToken = "acme-access-" + "x".repeat(24);
const refreshToken = "acme-refresh-" + "y".repeat(24);
/** code -> PKCE challenge the fake provider issued it for. */
const issued = new Map<string, string>();
let tokenCalls = 0;
let revokeCalls = 0;
/** The last token-endpoint form the fake provider received (to see where a client secret went). */
let lastTokenForm = new URLSearchParams();
let provider: Server;
let callbackServer: Server;
let providerOrigin = "";
let siteOrigin = "";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** Only the fake provider's hosts resolve, to the local server; anything else is a test failure. */
function toLocal(raw: string): string {
  const url = new URL(raw);
  if (url.hostname !== "auth.acme.test" && url.hostname !== "api.acme.test") throw new Error(`unexpected outbound host ${url.hostname}`);
  return `${providerOrigin}${url.pathname}${url.search}`;
}

const oauthHttp: OAuthHttpPorts = {
  guard: { assertSafeUrl: ({ raw }) => new URL(raw) },
  fetchFn: ({ url }, init) => fetch(toLocal(String(url)), init),
};
const pluginHttp = { fetch: ({ url }: { url: string }, init: RequestInit = {}) => fetch(toLocal(url), init) };

before(async () => {
  provider = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.url === "/revoke") {
        revokeCalls += 1;
        res.writeHead(200);
        return res.end();
      }
      if (req.url === "/me") {
        res.writeHead(req.headers.authorization === `Bearer ${accessToken}` ? 200 : 401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ id: "acct-1", name: "Ada" }));
      }
      const form = new URLSearchParams(body);
      lastTokenForm = form;
      const challenge = issued.get(form.get("code") ?? "");
      tokenCalls += 1;
      const verified = challenge !== undefined && createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === challenge;
      issued.delete(form.get("code") ?? "");
      res.writeHead(verified ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify(verified
        ? { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" }
        : { error: "invalid_grant" }));
    });
  });
  providerOrigin = await listen(provider);
});
after(async () => {
  await new Promise((resolve) => provider.close(resolve));
  if (callbackServer) await new Promise((resolve) => callbackServer.close(resolve));
});

const hostedEnv = { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24) };

/** One site key for every host and the saved custom credentials (as in production: `deps.ts` passes the
 *  site's one keyring and sealer to both), so the Tovu keyring type serves both ports. */
const siteKeyring = new TovuInMemoryKeyring();
const siteSealer = new TovuAesGcmSecretSealer(siteKeyring);

function makeHost(workspaceId = "ws-1", options: { readonly runtime?: "hosted" | "desktop"; readonly env?: Record<string, string>; readonly vaultRepo?: InMemoryVaultRepo; readonly publicOrigin?: () => string | undefined; readonly customCredentialRepo?: InMemoryCustomCredentialSetRepo; readonly packageRoot?: string } = {}) {
  const keyring = siteKeyring;
  const loadContributions: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "acme-office", packageRoot: options.packageRoot ?? fixtureRoot }, definition: input.definition });
  return createApiConnectionHost({
    workspaceId, loadContributions, vaultRepo: options.vaultRepo ?? new InMemoryVaultRepo({}), keyring, sealer: siteSealer,
    customCredentialRepo: options.customCredentialRepo ?? new InMemoryCustomCredentialSetRepo(),
    clock: { nowMs: () => Date.now() }, oauthHttp, pluginHttp, runtime: options.runtime ?? "hosted",
    // Read when a sign-in starts: `mountCallback` moves the site to a new port per test.
    env: options.env ?? { ...hostedEnv, get TOVU_API_CONNECTION_CALLBACK_ORIGINS() { return siteOrigin; } },
    publicOrigin: options.publicOrigin ?? (() => siteOrigin),
  });
}

async function mountCallback(host: ReturnType<typeof makeHost>, logs: string[]): Promise<void> {
  const app = express();
  registerApiConnectionOAuthCallbackRoute(app, { host, callbackLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, log: (line) => logs.push(line) });
  if (callbackServer) await new Promise((resolve) => callbackServer.close(resolve));
  callbackServer = createServer(app);
  siteOrigin = await listen(callbackServer);
}

/** The "browser": consent at the fake provider, which redirects back with a code bound to the PKCE challenge. */
function consentRedirect(authorizationUrl: string): string {
  const url = new URL(authorizationUrl);
  const code = randomBytes(12).toString("hex");
  issued.set(code, url.searchParams.get("code_challenge") ?? "");
  const back = new URL(url.searchParams.get("redirect_uri") ?? "");
  back.searchParams.set("code", code);
  back.searchParams.set("state", url.searchParams.get("state") ?? "");
  return back.href;
}

test("vertical slice: connect -> public callback -> plugin access token -> form-delivery credential", async () => {
  const host = makeHost();
  const logs: string[] = [];
  await mountCallback(host, logs);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  let callbackPage = "";
  const result = await runApiConnectionConnect({
    deps: { host }, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => {
      assert.equal(new URL(signInUrl).searchParams.get("code_challenge_method"), "S256");
      const response = await fetch(consentRedirect(signInUrl));
      callbackPage = await response.text();
      assert.equal(response.status, 200, logs.join("\n"));
      assert.equal(response.headers.get("cache-control"), "no-store");
    },
  });
  // H1: the result hands chat the opaque ref the plugin's tools take; nothing else.
  const { connectionRef } = result;
  assert.deepEqual(result, { status: "connected", connectionRef: deriveApiConnectionKey({ workspaceId: "ws-1", pluginId: "acme-office", connectionId: "account" }) });
  assert.ok(!callbackPage.includes(accessToken) && !callbackPage.includes(refreshToken));

  assert.equal(await host.accessTokensFor({ pluginId: "acme-office" }).getAccessToken({ connectionRef }), accessToken);
  const port = createOAuthFormDeliveryConnectionPort({ hostFor: () => host, adapterPluginId: async () => "acme-office" });
  // The push kit's host allowlist is the connection's declared API origin, never empty.
  const binding = { bindingId: "b1", adapterId: "row-append", connectionRef, enabled: true, config: { accountId: "acct-1" } };
  const { getAccessToken, ...credential } = (await port({ workspaceId: "ws-1", connectionRef, adapterId: "row-append" }, { binding }))!;
  assert.deepEqual(credential, { token: accessToken, baseUrl: "https://api.acme.test", additionalHosts: [] });
  assert.equal(typeof getAccessToken, "function");
});

test("security: a form-delivery credential stays on the job's frozen account, for the attempt and for every later request", async () => {
  const host = makeHost();
  await mountCallback(host, []);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const { connectionRef } = await runApiConnectionConnect({
    deps: { host }, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => { assert.equal((await fetch(consentRedirect(signInUrl))).status, 200); },
  });
  const port = createOAuthFormDeliveryConnectionPort({ hostFor: () => host, adapterPluginId: async () => "acme-office" });
  const target = { workspaceId: "ws-1", connectionRef, adapterId: "row-append" };
  const frozenOn = (accountId: string) => ({ binding: { bindingId: "b1", adapterId: "row-append", connectionRef, enabled: true, config: { accountId } } });
  // The attempt's first read is recorded in the delivery ledger, so it carries the delivery code (not retried).
  await assert.rejects(port(target, frozenOn("acct-someone-else")), { name: "FormDeliveryError", code: "authorization-required", retryable: false });

  const credential = await port(target, frozenOn("acct-1"));
  assert.equal(credential?.token, accessToken);
  assert.equal(await credential?.getAccessToken(), accessToken, "the first request uses the attempt's own read");
  assert.equal(await credential?.getAccessToken(), accessToken, "later requests read a fresh token");
  // A confirmed switch moves the same ref to another account: the frozen job must not follow it.
  const record = (await host.records.read({ key: connectionRef }))!;
  assert.ok(await host.records.compareAndSet({ key: connectionRef, expectedRevision: record.revision, record: { ...record, revision: record.revision + 1, account: { accountId: "acct-2", displayName: "Bob" } } }));
  await assert.rejects(credential!.getAccessToken(), { code: "account-changed" });
});

test("security: the callback refuses an unknown state without any token exchange and renders no request data", async () => {
  const host = makeHost();
  await mountCallback(host, []);
  const calls = tokenCalls;
  const response = await fetch(`${siteOrigin}/api/agent-plugins/connections/oauth/callback?state=forged-state&code=INJECTED-MARKER`);
  const page = await response.text();
  assert.equal(response.status, 400);
  assert.match(page, /no longer valid/);
  assert.ok(!page.includes("forged-state") && !page.includes("INJECTED-MARKER"));
  assert.equal(tokenCalls, calls);
});

test("security: a replayed callback state is refused; a wrong PKCE verifier never yields tokens", async () => {
  const host = makeHost();
  await mountCallback(host, []);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const service = host.serviceFor({ connection });
  const start = await service.start({ workspaceId: "ws-1", actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri: host.hostedCallbackUrl({ connection }) });
  const redirect = consentRedirect(start.authorizationUrl);
  const tampered = new URL(start.authorizationUrl);
  issued.set(new URL(redirect).searchParams.get("code")!, "not-the-challenge");
  assert.equal((await fetch(redirect)).status, 400, "a code whose PKCE challenge does not match is refused");
  assert.equal((await fetch(redirect)).status, 400, "the consumed state cannot be replayed");
  assert.equal((await host.statusOf({ connection })).status, "disconnected");
  assert.ok(tampered.searchParams.get("state"));
});

test("security: getAccessToken refuses another plugin's or another workspace's connectionRef with the same message", async () => {
  const host = makeHost();
  const foreignWorkspace = deriveApiConnectionKey({ workspaceId: "ws-2", pluginId: "acme-office", connectionId: "account" });
  const ownRef = deriveApiConnectionKey({ workspaceId: "ws-1", pluginId: "acme-office", connectionId: "account" });
  await assert.rejects(host.accessTokensFor({ pluginId: "acme-office" }).getAccessToken({ connectionRef: foreignWorkspace }), { code: "connection-not-found", message: /not available to this plugin/ });
  await assert.rejects(host.accessTokensFor({ pluginId: "other-plugin" }).getAccessToken({ connectionRef: ownRef }), { code: "connection-not-found", message: /not available to this plugin/ });
});

/** The fixture's connection with its web client's declared callback origins replaced (absent: none declared). */
async function withRedirectOrigins(host: ReturnType<typeof makeHost>, redirectOrigins: readonly string[] | undefined) {
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const { redirectOrigins: _declared, ...web } = connection!.clients.web!;
  return { ...connection!, clients: { ...connection!.clients, web: redirectOrigins === undefined ? web : { ...web, redirectOrigins } } };
}

test("security (pin): hosted sign-in is refused when this site has no public origin", async () => {
  const host = makeHost("ws-1", { publicOrigin: () => undefined });
  const connection = await withRedirectOrigins(host, [siteOrigin]);
  assert.throws(() => host.hostedCallbackUrl({ connection }), { code: "descriptor-invalid", message: /cannot sign in from this site's address/ });
});

test("security (pin): hosted sign-in is refused from an origin the connection's web client did not register", async () => {
  const host = makeHost("ws-1", { env: hostedEnv });
  const connection = await withRedirectOrigins(host, ["https://other.example"]);
  assert.throws(() => host.hostedCallbackUrl({ connection }), { code: "descriptor-invalid", message: /cannot sign in from this site's address/ });
});

test("security (pin): a registered origin gets the fixed public callback path", async () => {
  const host = makeHost("ws-1", { env: hostedEnv });
  const connection = await withRedirectOrigins(host, [siteOrigin]);
  assert.equal(host.hostedCallbackUrl({ connection }), `${siteOrigin}/api/agent-plugins/connections/oauth/callback`);
});

test("security: hosted sign-in fails closed when no callback origin is declared or configured", async () => {
  const host = makeHost("ws-1", { env: hostedEnv });
  const connection = await withRedirectOrigins(host, undefined);
  assert.throws(() => host.hostedCallbackUrl({ connection }), {
    code: "descriptor-invalid", message: /no registered sign-in return address is configured.*TOVU_API_CONNECTION_CALLBACK_ORIGINS/,
  });
});

test("security: the configured callback-origin list admits only the origins it names", async () => {
  const connectionOf = (host: ReturnType<typeof makeHost>) => withRedirectOrigins(host, undefined);
  const listed = makeHost("ws-1", { env: { ...hostedEnv, TOVU_API_CONNECTION_CALLBACK_ORIGINS: ` https://other.example , ${siteOrigin}/ ` } });
  assert.equal(listed.hostedCallbackUrl({ connection: await connectionOf(listed) }), `${siteOrigin}/api/agent-plugins/connections/oauth/callback`);
  const elsewhere = makeHost("ws-1", { env: { ...hostedEnv, TOVU_API_CONNECTION_CALLBACK_ORIGINS: "https://other.example,not a url" } });
  const unlisted = await connectionOf(elsewhere);
  assert.throws(() => elsewhere.hostedCallbackUrl({ connection: unlisted }), { code: "descriptor-invalid", message: /cannot sign in from this site's address/ });
});

test("security: an attempt is consumed once even when two callbacks race on the same state", async () => {
  const host = makeHost();
  await mountCallback(host, []);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const start = await host.serviceFor({ connection }).start({ workspaceId: "ws-1", actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri: host.hostedCallbackUrl({ connection }) });
  const state = new URL(start.authorizationUrl).searchParams.get("state")!;
  const [first, second] = await Promise.all([host.records.takeAttempt({ state }), host.records.takeAttempt({ state })]);
  assert.equal([first, second].filter((attempt) => attempt !== null).length, 1);
  assert.equal(await host.records.peekAttempt({ state }), null);
});

test("security: two open sign-in attempts for one connection and two connections' records never collide on a vault label", async () => {
  const vaultRepo = new InMemoryVaultRepo({});
  const host = makeHost("ws-1", { vaultRepo });
  await mountCallback(host, []);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const begin = () => host.serviceFor({ connection }).start({ workspaceId: "ws-1", actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri: host.hostedCallbackUrl({ connection }) });
  const [first, second] = [await begin(), await begin()];
  const states = [first, second].map((start) => new URL(start.authorizationUrl).searchParams.get("state")!);
  assert.notEqual(states[0], states[1]);
  for (const state of states) assert.ok(await host.records.peekAttempt({ state }), "both attempts stay open");
  const record = (key: string) => ({ key, workspaceId: "ws-1", pluginId: "acme-office", connectionId: key, status: "disconnected" as const, revision: 0,
    generation: 0, account: null, grantedScopes: [], staged: null, updatedAt: new Date().toISOString() });
  assert.equal(await host.records.compareAndSet({ key: "conn-a", expectedRevision: 0, record: record("conn-a") }), true);
  assert.equal(await host.records.compareAndSet({ key: "conn-b", expectedRevision: 0, record: record("conn-b") }), true);
  const labels = (await vaultRepo.list({ workspaceId: "ws-1", kind: "api-connection", ownerKey: "tovu", principalId: null })).map((row) => row.label);
  for (const state of states) assert.ok(labels.every((label) => !label.includes(state)), "a listed label never carries the callback state");
});

test("security: a desktop public client's provider-issued secret reaches only the token endpoint", async () => {
  const secret = "d".repeat(28);
  const logs: string[] = [];
  const vaultRepo = new InMemoryVaultRepo({});
  const host = makeHost("ws-1", { runtime: "desktop", vaultRepo, env: { TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client", TOVU_ACME_OAUTH_DESKTOP_CLIENT_SECRET: secret } });
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  let signInUrl = "";
  const result = await runApiConnectionConnect({
    deps: { host }, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async (input) => {
      signInUrl = input.signInUrl;
      const response = await fetch(consentRedirect(input.signInUrl));
      logs.push(await response.text());
    },
  });
  assert.equal(result.status, "connected");
  assert.equal(lastTokenForm.get("client_secret"), secret, "sent as client_secret_post to the token endpoint");
  assert.equal(new URL(signInUrl).searchParams.get("prompt"), "consent", "the public client's fixed parameters apply");
  assert.ok(!signInUrl.includes(secret), "never in the browser's authorization URL");
  assert.ok(logs.every((line) => !line.includes(secret)), "never on the loopback page");
  const rows = await vaultRepo.list({ workspaceId: "ws-1", kind: "api-connection", ownerKey: "tovu", principalId: null });
  assert.ok(rows.length > 0);
  assert.ok(!JSON.stringify(rows).includes(secret), "never stored in a vault row (sealed or not)");
});

test("security: a hosted (confidential) client without its server-held secret is refused before any sign-in starts", async () => {
  const host = makeHost("ws-1", { env: { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client" } });
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const calls = tokenCalls;
  assert.throws(() => host.serviceFor({ connection }), { code: "descriptor-invalid", message: /client secret is not configured/ });
  assert.equal(tokenCalls, calls);
});

test("callback: a switch to the account already connected is refused with copy that says to reconnect instead", async () => {
  const host = makeHost();
  await mountCallback(host, []);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const service = host.serviceFor({ connection });
  const begin = (intent: "connect" | "switch-account") => service.start({ workspaceId: "ws-1", actorId: "admin-1", intent, scopeSetIds: [], redirectUri: host.hostedCallbackUrl({ connection }) });
  assert.equal((await fetch(consentRedirect((await begin("connect")).authorizationUrl))).status, 200);
  const response = await fetch(consentRedirect((await begin("switch-account")).authorizationUrl));
  assert.equal(response.status, 400);
  assert.match(await response.text(), /already connected to Tovu, so there is nothing to switch\. Close this window and use Reconnect in Tovu instead\./);
  assert.equal((await host.statusOf({ connection })).status, "connected", "the live connection is untouched");
});

/** Desktop sign-in through the loopback receiver; the fake consent redirects straight back. */
async function connectDesktop(host: ReturnType<typeof makeHost>) {
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  return runApiConnectionConnect({
    deps: { host }, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => { await (await fetch(consentRedirect(signInUrl))).text(); },
  });
}

const desktopEnv = { TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client", TOVU_ACME_OAUTH_DESKTOP_CLIENT_SECRET: "d".repeat(28) };

test("characterization: a connected account reads as connected through host.records, statusOf and readAccount", async () => {
  const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv });
  const { connectionRef } = await connectDesktop(host);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  assert.equal((await host.records.read({ key: connectionRef }))?.status, "connected");
  assert.equal((await host.statusOf({ connection })).status, "connected");
  assert.deepEqual(await host.toolConnections.readAccount({ workspaceId: "ws-1", pluginId: "acme-office", connectionRef }), { accountId: "acct-1", displayName: "Ada" });
});

test("characterization: a connection's hooks reach its declared API origin (account) and its token endpoint's origin (revocation)", async () => {
  const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv });
  const { connectionRef } = await connectDesktop(host);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const revokes = revokeCalls;
  const outcome = await host.serviceFor({ connection }).disconnect({ connectionRef, workspaceId: "ws-1" });
  assert.equal(outcome.remoteRevocation, "confirmed");
  assert.ok(revokeCalls > revokes);
});

test("security: a connection's hooks get HTTP limited to its declared API origins and its token endpoint's origin", async (t) => {
  // A copy of the fixture whose hooks hand the test the HTTP capability the host gave them.
  const root = mkdtempSync(path.join(tmpdir(), "acme-hook-http-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixtureRoot, root, { recursive: true });
  writeFileSync(path.join(root, "lib", "connection.mjs"),
    "export default { createHooks({ http }) { globalThis.__acmeHookHttp = http; return { async resolveScopes() { return []; }, async readAccount() { return { accountId: 'a', displayName: 'A' }; }, async revoke() {} }; } };\n");
  const sent: string[] = [];
  const spyHttp = { fetch: async ({ url }: { url: string }) => { sent.push(url); return new Response("ok"); } };
  const keyring = new InMemoryKeyring({ hkdfSalt: "hook-http" });
  const host = createApiConnectionHost({
    workspaceId: "ws-1", loadContributions: (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "acme-office", packageRoot: root }, definition: input.definition }),
    vaultRepo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }), clock: { nowMs: () => Date.now() },
    customCredentialRepo: new InMemoryCustomCredentialSetRepo(), oauthHttp, pluginHttp: spyHttp, runtime: "desktop", env: desktopEnv, publicOrigin: () => undefined,
  });
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  await host.requestedScopes({ connection, scopeSetIds: [] });
  const hookHttp = (globalThis as { __acmeHookHttp?: typeof spyHttp }).__acmeHookHttp!;
  t.after(() => { delete (globalThis as { __acmeHookHttp?: unknown }).__acmeHookHttp; });
  assert.equal((await hookHttp.fetch({ url: "https://api.acme.test/me" })).status, 200, "a declared API origin");
  assert.equal((await hookHttp.fetch({ url: "https://auth.acme.test/revoke" })).status, 200, "the token endpoint's origin (revocation)");
  for (const url of ["https://evil.test/steal", "https://api.acme.test.evil.test/me", "http://api.acme.test/me", "https://auth.acme.test:8443/revoke", "not a url"]) {
    await assert.rejects(hookHttp.fetch({ url }), { message: CONNECTION_HOOK_UNDECLARED_ORIGIN_MESSAGE }, url);
  }
  assert.deepEqual(sent, ["https://api.acme.test/me", "https://auth.acme.test/revoke"], "a refused URL is never sent");
});

const byoClientId = "byo-client-1234.example";
const byoSecret = () => "b".repeat(20) + "-secret";
let credentialIds = 0;

/** Saves a BYO client the way an admin does (Access Tokens "Add custom provider" or the chat card). */
async function saveByoClient(repo: InMemoryCustomCredentialSetRepo, input: { readonly workspaceId?: string; readonly label?: string; readonly baseUrl?: string; readonly clientId?: string | null; readonly secret?: string } = {}) {
  return createCustomCredential({ repo, sealer: siteSealer, keyring: siteKeyring, clock: { nowMs: () => Date.now() }, idGen: { newId: () => `00000000-0000-4000-8000-${String(++credentialIds).padStart(12, "0")}` } }, {
    workspaceId: input.workspaceId ?? "ws-1", label: input.label ?? byoClientLabel({ pluginId: "acme-office", connectionId: "account" }), category: "general",
    baseUrl: input.baseUrl ?? "https://auth.acme.test/token", connection: { token: input.secret ?? byoSecret(), ...(input.clientId === null ? {} : { username: input.clientId ?? byoClientId }) },
  });
}

/** A fixture copy whose connection declaration is edited by `edit` (removed after the test). */
function fixtureCopy(t: { after(fn: () => void): void }, edit: (declaration: Record<string, unknown>) => void): string {
  const root = mkdtempSync(path.join(tmpdir(), "acme-byo-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixtureRoot, root, { recursive: true });
  const file = path.join(root, "tovu-connections.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { connections: Record<string, unknown>[] };
  edit(parsed.connections[0]!);
  writeFileSync(file, JSON.stringify(parsed));
  return root;
}

test("security: a saved BYO client replaces the Tovu-owned client for its own connection; its secret reaches only the token endpoint", async () => {
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  await saveByoClient(customCredentialRepo);
  const vaultRepo = new InMemoryVaultRepo({});
  const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo, vaultRepo });
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  let signInUrl = "";
  const result = await runApiConnectionConnect({
    deps: { host }, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async (input) => { signInUrl = input.signInUrl; await (await fetch(consentRedirect(input.signInUrl))).text(); },
  });
  assert.equal(result.status, "connected");
  assert.equal(new URL(signInUrl).searchParams.get("client_id"), byoClientId, "the browser signs in to the admin's own client");
  assert.equal(lastTokenForm.get("client_id"), byoClientId);
  assert.equal(lastTokenForm.get("client_secret"), byoSecret(), "the BYO secret is sent to the token endpoint only");
  assert.ok(!signInUrl.includes(byoSecret()), "never in the authorization URL");
  const status = await host.statusOf({ connection });
  const rows = await vaultRepo.list({ workspaceId: "ws-1", kind: "api-connection", ownerKey: "tovu", principalId: null });
  for (const [what, value] of Object.entries({ connection, result, status, rows, listed: await host.listConnections({}) })) {
    assert.ok(!JSON.stringify(value).includes(byoSecret()), `the BYO secret is not in ${what}`);
  }
});

test("security: a BYO client is used only for its own workspace and connection, and only when the connection allows one", async (t) => {
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  await saveByoClient(customCredentialRepo, { workspaceId: "ws-2" });
  await saveByoClient(customCredentialRepo, { label: byoClientLabel({ pluginId: "acme-office", connectionId: "other" }) });
  await saveByoClient(customCredentialRepo, { label: byoClientLabel({ pluginId: "other-plugin", connectionId: "account" }) });
  assert.equal((await connectDesktop(makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo }))).status, "connected");
  assert.equal(lastTokenForm.get("client_id"), "acme-desktop-client", "another workspace's, connection's or plugin's BYO client is ignored");
  await saveByoClient(customCredentialRepo);
  const packageRoot = fixtureCopy(t, (declaration) => { delete declaration.byoClient; });
  assert.equal((await connectDesktop(makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo, packageRoot }))).status, "connected");
  assert.equal(lastTokenForm.get("client_id"), "acme-desktop-client", "a connection that does not allow BYO keeps the Tovu-owned client");
});

test("security: switching the OAuth client makes a connected account reconnect-required, honestly, until it reconnects", async () => {
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo });
  const { connectionRef } = await connectDesktop(host);
  const [connection] = await host.listConnections({ pluginId: "acme-office" });
  const target = { workspaceId: "ws-1", pluginId: "acme-office", connectionRef };
  const saved = await saveByoClient(customCredentialRepo);
  await assert.rejects(host.accessTokensFor({ pluginId: "acme-office" }).getAccessToken({ connectionRef }), { code: "reconnect-required", message: /sign-in client changed.*Reconnect/ });
  assert.equal((await host.records.read({ key: connectionRef }))?.status, "reconnect-required");
  assert.equal((await host.statusOf({ connection })).status, "reconnect-required");
  assert.equal(await host.toolConnections.readAccount(target), null);
  await deleteCustomCredential({ repo: customCredentialRepo }, { workspaceId: "ws-1", id: saved.id });
  assert.equal((await host.statusOf({ connection })).status, "reconnect-required", "removing the BYO client returns to the Tovu-owned one only after a reconnect");
  assert.equal((await connectDesktop(host)).status, "connected");
  assert.equal(await host.accessTokensFor({ pluginId: "acme-office" }).getAccessToken({ connectionRef }), accessToken);
});

test("security: a client switch is detected on status reads alone (no token read), durably", async () => {
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo });
  const { connectionRef } = await connectDesktop(host);
  await saveByoClient(customCredentialRepo);
  assert.equal((await host.records.read({ key: connectionRef }))?.status, "reconnect-required");
  await deleteCustomCredential({ repo: customCredentialRepo }, { workspaceId: "ws-1", id: (await listCustomCredentials({ repo: customCredentialRepo }, { workspaceId: "ws-1" }))[0]!.id });
  assert.equal((await host.records.read({ key: connectionRef }))?.status, "reconnect-required", "the downgrade was written, not just shown");
});

test("security: rotating the BYO secret under the same client id keeps the connection", async () => {
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  const saved = await saveByoClient(customCredentialRepo);
  const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo });
  const { connectionRef } = await connectDesktop(host);
  await updateCustomCredential({ repo: customCredentialRepo, sealer: siteSealer, keyring: siteKeyring, clock: { nowMs: () => Date.now() }, idGen: { newId: () => "unused" } },
    { workspaceId: "ws-1", id: saved.id, connection: { token: "r".repeat(30), username: byoClientId } });
  assert.equal(await host.accessTokensFor({ pluginId: "acme-office" }).getAccessToken({ connectionRef }), accessToken);
});

test("security: a BYO client whose base URL is not the token endpoint's origin, or that has no client id, is refused before any sign-in", async () => {
  const cases = [
    { input: { baseUrl: "https://elsewhere.example/token" }, message: /base URL must be on https:\/\/auth\.acme\.test/ },
    { input: { clientId: null }, message: /OAuth client ID as its username/ },
  ];
  for (const { input, message } of cases) {
    const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
    await saveByoClient(customCredentialRepo, input);
    const host = makeHost("ws-1", { runtime: "desktop", env: desktopEnv, customCredentialRepo });
    const [connection] = await host.listConnections({ pluginId: "acme-office" });
    const calls = tokenCalls;
    assert.throws(() => host.serviceFor({ connection }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "descriptor-invalid");
      assert.match(error.message, message);
      assert.ok(!error.message.includes(byoSecret()), "the refusal never carries the secret");
      return true;
    });
    assert.equal(tokenCalls, calls);
  }
});

test("security: a hosted BYO web client returns to this site's own address, and still fails closed without one", async () => {
  const customCredentialRepo = new InMemoryCustomCredentialSetRepo();
  await saveByoClient(customCredentialRepo);
  const hosted = makeHost("ws-1", { env: {}, customCredentialRepo, publicOrigin: () => "https://self-hosted.example" });
  const [connection] = await hosted.listConnections({ pluginId: "acme-office" });
  assert.equal(hosted.hostedCallbackUrl({ connection: connection! }), "https://self-hosted.example/api/agent-plugins/connections/oauth/callback", "no configured callback-origin list needed");
  const offline = makeHost("ws-1", { env: {}, customCredentialRepo, publicOrigin: () => undefined });
  const [withoutOrigin] = await offline.listConnections({ pluginId: "acme-office" });
  assert.throws(() => offline.hostedCallbackUrl({ connection: withoutOrigin! }), { code: "descriptor-invalid", message: /cannot sign in from this site's address/ });
});

test("security: a byoClient flag that is not true or false refuses the whole declaration (never read as allowed)", () => {
  const declaration = { id: "account", module: "lib/connection.mjs", clients: { web: { clientIdEnv: "TOVU_ACME_OAUTH_WEB_CLIENT_ID" } } };
  assert.deepEqual(parseApiConnectionsFile({ raw: JSON.stringify({ schemaVersion: 1, connections: [{ ...declaration, byoClient: "yes" }] }) }), { ok: false, reason: "connections[0].byoClient must be true or false" });
  const absent = parseApiConnectionsFile({ raw: JSON.stringify({ schemaVersion: 1, connections: [declaration] }) });
  assert.equal(absent.ok && absent.descriptors[0]!.byoClient, false);
  const declared = parseApiConnectionsFile({ raw: JSON.stringify({ schemaVersion: 1, connections: [{ ...declaration, byoClient: true }] }) });
  assert.ok(declared.ok && declared.descriptors[0]!.byoClient === true && !("byoClient" in declared.descriptors[0]!.descriptor), "never reaches Jini's descriptor");
});
