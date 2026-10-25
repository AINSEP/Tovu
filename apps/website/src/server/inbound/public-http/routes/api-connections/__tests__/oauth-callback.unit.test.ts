/**
 * @file Phase-C unit tests for the public API-connection OAuth callback route: the rate limit is
 * checked first, a missing or oversized `state` never reaches the store, an attempt whose connection
 * is no longer declared is answered like an unknown one, and every failure maps by error CODE onto
 * the fixed page vocabulary (expired or superseded attempts, provider denial, anything else) with a
 * log line that carries only an error name and code. Every page is `no-store`. Real host over the
 * fake provider; the site and provider are 127.0.0.1 servers closed in `after`.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, test } from "node:test";

import express from "express";
import { ApiConnectionError } from "@jini-ai/integrations/api-connections";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";

import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { loadPluginContributionsFromSource, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import type { ApiConnectionHost } from "#src/features/api-connections/host";
import { createApiConnectionVault, createApiConnectionVaultRecordStore } from "#src/features/api-connections/vault-stores";
import { ACME_FIXTURE_ROOT, ACME_PLUGIN, ACME_WORKSPACE, connectHosted, startAcmeHarness, type AcmeHarness } from "#src/features/api-connections/__tests__/support/acme-harness";
import { API_CONNECTION_BINDING_COOKIE } from "#src/features/api-connections/browser-binding";
import { API_CONNECTION_CALLBACK_MESSAGE_TYPE, registerApiConnectionOAuthCallbackRoute } from "../oauth-callback.js";

let harness: AcmeHarness;
const servers: Server[] = [];
before(async () => { harness = await startAcmeHarness(); });
afterEach(() => harness.reset());
after(async () => {
  for (const server of servers) await new Promise((resolve) => server.close(resolve));
  await harness.close();
});

const allowAll: RateLimiter = { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) };
const reasonOf = (html: string): string | undefined => /"reason":"([a-z_]+)"/.exec(html)?.[1];

/** The route on its own 127.0.0.1 site, for a limiter or log the shared harness site does not use. */
async function ownSite(host: ApiConnectionHost, deps: { readonly callbackLimiter?: RateLimiter; readonly log?: (line: string) => void } = {}): Promise<string> {
  const app = express();
  registerApiConnectionOAuthCallbackRoute(app, { host, callbackLimiter: deps.callbackLimiter ?? allowAll, ...(deps.log ? { log: deps.log } : {}) });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** GET as the browser that started the sign-in (it carries the binding cookie), unless `headers` says otherwise. */
async function get(url: string | URL, headers: Readonly<Record<string, string>> = harness.cookieFor(url)) {
  const response = await fetch(url, { headers });
  return { status: response.status, cacheControl: response.headers.get("cache-control"), setCookie: response.headers.getSetCookie(), html: await response.text() };
}

const callbackAt = (origin: string, query: Record<string, string>) => `${origin}/api/agent-plugins/connections/oauth/callback?${new URLSearchParams(query)}`;

async function startHosted(host: ApiConnectionHost) {
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  return host.serviceFor({ connection: connection! }).start({ workspaceId: ACME_WORKSPACE, actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri: host.hostedCallbackUrl({ connection: connection! }) });
}

test("rate limit: an over-limit caller gets 429 before any state lookup or token exchange", async () => {
  const host = harness.makeHost();
  const keys: string[] = [];
  const origin = await ownSite(host, { callbackLimiter: { check: async ({ key }) => { keys.push(key); return { allowed: false, retryAfterSeconds: 30 }; } } });
  const start = await startHosted(host);
  const page = await get(callbackAt(origin, { state: new URL(start.authorizationUrl).searchParams.get("state")!, code: "c" }));
  assert.deepEqual({ status: page.status, cacheControl: page.cacheControl, reason: reasonOf(page.html) }, { status: 429, cacheControl: "no-store", reason: "rate_limited" });
  assert.equal(keys.length, 1);
  assert.equal(harness.provider.tokenCalls, 0);
});

test("state: a missing, empty or oversized state is refused as no_state without touching the store", async () => {
  harness.makeHost(); // mounts the route on the harness site
  const queries: readonly Record<string, string>[] = [{ code: "c" }, { code: "c", state: "" }, { code: "c", state: "s".repeat(513) }];
  for (const query of queries) {
    const page = await get(callbackAt(harness.siteOrigin, query));
    assert.deepEqual({ status: page.status, reason: reasonOf(page.html), cacheControl: page.cacheControl }, { status: 400, reason: "no_state", cacheControl: "no-store" }, JSON.stringify(query).slice(0, 40));
  }
  assert.equal(harness.provider.tokenCalls, 0);
});

// F6 fix wave (L12 Stryker: `>` vs `>=` on MAX_STATE_LENGTH survived): a 512-char state is NOT refused
// as no_state — it reaches the attempt lookup (an unknown state answers state_expired).
test("state: a state of exactly 512 chars passes the size gate and is looked up", async () => {
  harness.makeHost();
  const page = await get(callbackAt(harness.siteOrigin, { code: "c", state: "s".repeat(512) }));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.equal(harness.provider.tokenCalls, 0);
});

test("state: a repeated state parameter (not one string) is refused as no_state", async () => {
  const host = harness.makeHost();
  const start = await startHosted(host);
  const state = new URL(start.authorizationUrl).searchParams.get("state")!;
  const page = await get(`${harness.siteOrigin}/api/agent-plugins/connections/oauth/callback?state=${state}&state=${state}&code=c`);
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "no_state" });
  assert.equal(harness.provider.tokenCalls, 0);
});

test("security: an attempt row naming another workspace is answered like an unknown state, with no exchange", async () => {
  const keyring = new InMemoryKeyring({ hkdfSalt: "callback-c3-foreign" });
  const vaultRepo = new InMemoryVaultRepo({});
  const clock = { nowMs: () => Date.now() };
  const logs: string[] = [];
  const host = harness.makeHost({ keyring, vaultRepo, clock, logs });
  const start = await startHosted(host);
  const state = new URL(start.authorizationUrl).searchParams.get("state")!;
  // A tampered row: the same state, re-sealed in this workspace's vault but naming another workspace.
  const vault = createApiConnectionVault({ repo: vaultRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock, workspaceId: ACME_WORKSPACE });
  const records = createApiConnectionVaultRecordStore({ vault, workspaceId: ACME_WORKSPACE, clock });
  const attempt = (await records.takeAttempt({ state }))!;
  await records.putAttempt({ attempt: { ...attempt, workspaceId: "ws-2" } });
  const page = await get(harness.consentRedirect(start.authorizationUrl));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.equal(harness.provider.tokenCalls, 0);
  // Routed away before any sign-in completion runs: nothing consumed it and nothing failed to log.
  assert.equal((await records.peekAttempt({ state }))?.workspaceId, "ws-2");
  assert.deepEqual(logs, []);
});

test("state: an attempt whose connection is no longer declared is answered like an unknown state, with no exchange", async () => {
  let declared = true;
  const loader: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot: ACME_FIXTURE_ROOT }, definition: input.definition });
  const host = harness.makeHost({ loadContributions: async (input, options) => (declared ? loader(input, options) : { items: [], refusals: [] }) });
  const start = await startHosted(host);
  declared = false;
  const page = await get(harness.consentRedirect(start.authorizationUrl));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.equal(harness.provider.tokenCalls, 0);
});

test("failures: an attempt that expired before its callback renders state_expired (invalid-attempt)", async () => {
  let now = Date.now();
  const logs: string[] = [];
  const host = harness.makeHost({ clock: { nowMs: () => now }, logs });
  const start = await startHosted(host);
  now = Date.parse(start.expiresAt) + 1_000;
  const page = await get(harness.consentRedirect(start.authorizationUrl));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.deepEqual(logs, ["api-connection oauth callback failed: ApiConnectionError invalid-attempt"]);
});

test("failures: an older attempt a newer completed sign-in superseded renders state_expired", async () => {
  const logs: string[] = [];
  const host = harness.makeHost({ logs });
  const older = await startHosted(host);
  const newer = await startHosted(host);
  assert.equal(await harness.consent(newer.authorizationUrl), 200);
  const page = await get(harness.consentRedirect(older.authorizationUrl));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.deepEqual(logs, ["api-connection oauth callback failed: ApiConnectionError attempt-superseded"]);
});

test("failures: the person declining at the provider renders provider_denied, and nothing is exchanged", async () => {
  const logs: string[] = [];
  const host = harness.makeHost({ logs });
  const start = await startHosted(host);
  const page = await get(callbackAt(harness.siteOrigin, { state: new URL(start.authorizationUrl).searchParams.get("state")!, error: "access_denied", error_description: "<script>provider text</script>" }));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "provider_denied" });
  assert.ok(!page.html.includes("provider text"), "no provider text reaches the page");
  assert.equal(harness.provider.tokenCalls, 0);
  assert.deepEqual(logs, ["api-connection oauth callback failed: ApiConnectionError access-denied"]);
});

test("failures: a fault that is not an API-connection error renders exchange_failed and logs its name only", async () => {
  const logs: string[] = [];
  let failNext: unknown;
  const loader: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot: ACME_FIXTURE_ROOT }, definition: input.definition });
  const host = harness.makeHost({ logs, loadContributions: async (input, options) => {
    const fault = failNext;
    failNext = undefined;
    if (fault !== undefined) throw fault;
    return loader(input, options);
  } });
  const cases: readonly [unknown, string][] = [
    [new Error("disk text that must not be logged"), "Error unknown"],
    [Object.assign(new TypeError("typed fault"), { code: 7 }), "TypeError unknown"],
    [Object.assign(new Error("coded fault"), { code: "EIO" }), "Error EIO"],
    ["a thrown string", "unknown"],
  ];
  for (const [fault, label] of cases) {
    const start = await startHosted(host);
    failNext = fault;
    const page = await get(harness.consentRedirect(start.authorizationUrl));
    assert.deepEqual({ status: page.status, reason: reasonOf(page.html), cacheControl: page.cacheControl }, { status: 400, reason: "exchange_failed", cacheControl: "no-store" }, label);
    assert.equal(logs.at(-1), `api-connection oauth callback failed: ${label}`);
  }
  assert.ok(logs.every((line) => !line.includes("must not be logged") && !line.includes("thrown string")));
});

test("success: the page is the fixed no-store success page with the API-connection message type", async () => {
  const host = harness.makeHost();
  const start = await startHosted(host);
  const page = await get(harness.consentRedirect(start.authorizationUrl));
  assert.equal(page.status, 200);
  assert.equal(page.cacheControl, "no-store");
  assert.equal(reasonOf(page.html), undefined);
  assert.ok(page.html.includes(JSON.stringify(API_CONNECTION_CALLBACK_MESSAGE_TYPE)));
});

test("log: without an injected log the failure goes to console.error by name and code; a callback on another address than the attempt's is refused", async (t) => {
  const host = harness.makeHost();
  const origin = await ownSite(host);
  const lines: unknown[] = [];
  const original = console.error;
  console.error = (line: unknown) => { lines.push(line); };
  t.after(() => { console.error = original; });
  // The attempt recorded the harness site's callback URL; this site answers on another port.
  const start = await startHosted(host);
  const back = harness.consentRedirect(start.authorizationUrl);
  const page = await get(callbackAt(origin, Object.fromEntries(back.searchParams)));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.deepEqual(lines, ["api-connection oauth callback failed: ApiConnectionError invalid-attempt"]);
  assert.equal(harness.provider.tokenCalls, 0, "no code is exchanged for a mismatched callback URL");
});

// ---- Browser binding (G15 F1): the callback completes only in the browser that started the sign-in.

const CLEARED = `${API_CONNECTION_BINDING_COOKIE}=; Max-Age=0; Path=/api/agent-plugins/connections/oauth/callback; HttpOnly; Secure; SameSite=Lax`;

test("security (F1): a callback whose browser carries no binding cookie is refused as state_expired and installs nothing", async () => {
  const logs: string[] = [];
  const host = harness.makeHost({ logs });
  const start = await startHosted(host);
  const page = await get(harness.consentRedirect(start.authorizationUrl), {});
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.equal(harness.provider.tokenCalls, 0, "no code is exchanged without the binding");
  assert.deepEqual(logs, ["api-connection oauth callback failed: ApiConnectionError invalid-attempt"]);
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  assert.equal((await host.statusOf({ connection: connection! })).status, "disconnected");
});

test("security (F1): a callback carrying another sign-in's binding is refused as state_expired and installs nothing", async () => {
  const host = harness.makeHost();
  const victimStart = await startHosted(host);
  const otherStart = await startHosted(host);
  const page = await get(harness.consentRedirect(victimStart.authorizationUrl), { cookie: `${API_CONNECTION_BINDING_COOKIE}=${otherStart.browserBinding}` });
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "state_expired" });
  assert.equal(harness.provider.tokenCalls, 0);
});

test("security (F1): a malformed binding cookie counts as none (refused), never as a partial match", async () => {
  const host = harness.makeHost();
  const start = await startHosted(host);
  const page = await get(harness.consentRedirect(start.authorizationUrl), { cookie: `${API_CONNECTION_BINDING_COOKIE}=${start.browserBinding};x` });
  assert.equal(page.status, 200, "a well-formed binding among other cookies is read");
  const second = await startHosted(host);
  const refused = await get(harness.consentRedirect(second.authorizationUrl), { cookie: `${API_CONNECTION_BINDING_COOKIE}=${second.browserBinding}!` });
  assert.deepEqual({ status: refused.status, reason: reasonOf(refused.html) }, { status: 400, reason: "state_expired" });
});

test("security (F1): the starting browser's callback succeeds and the binding cookie is cleared, on success and on a refusal", async () => {
  const host = harness.makeHost();
  const start = await startHosted(host);
  const page = await get(harness.consentRedirect(start.authorizationUrl));
  assert.deepEqual({ status: page.status, setCookie: page.setCookie }, { status: 200, setCookie: [CLEARED] });
  const refused = await get(harness.consentRedirect((await startHosted(host)).authorizationUrl), {});
  assert.deepEqual({ status: refused.status, setCookie: refused.setCookie }, { status: 400, setCookie: [CLEARED] });
});

test("security (F1): a callback that never reaches a known attempt leaves the binding cookie alone (a stray request cannot cancel a sign-in)", async () => {
  harness.makeHost();
  const page = await get(callbackAt(harness.siteOrigin, { state: "unknown-state", code: "c" }), { cookie: `${API_CONNECTION_BINDING_COOKIE}=abc` });
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html), setCookie: page.setCookie }, { status: 400, reason: "state_expired", setCookie: [] });
});

test("failures: switching to the account that is already connected renders account_unchanged, not a retryable exchange failure", async () => {
  const logs: string[] = [];
  const host = harness.makeHost({ logs });
  const { connection } = await connectHosted(harness, host);
  const switching = await host.serviceFor({ connection }).start({ workspaceId: ACME_WORKSPACE, actorId: "admin-1", intent: "switch-account", scopeSetIds: [], redirectUri: host.hostedCallbackUrl({ connection }) });
  const page = await get(harness.consentRedirect(switching.authorizationUrl));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html), cacheControl: page.cacheControl }, { status: 400, reason: "account_unchanged", cacheControl: "no-store" });
  assert.deepEqual(logs, ["api-connection oauth callback failed: ApiConnectionError account-unchanged"]);
});

test("failures: an API-connection error with any other code still renders exchange_failed, logging only its code", async () => {
  const logs: string[] = [];
  let fail = false;
  const loader: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot: ACME_FIXTURE_ROOT }, definition: input.definition });
  const host = harness.makeHost({ logs, loadContributions: async (input, options) => {
    if (fail) { fail = false; throw new ApiConnectionError({ code: "configuration-invalid", message: "provider text that must not be logged" }); }
    return loader(input, options);
  } });
  const start = await startHosted(host);
  fail = true;
  const page = await get(harness.consentRedirect(start.authorizationUrl));
  assert.deepEqual({ status: page.status, reason: reasonOf(page.html) }, { status: 400, reason: "exchange_failed" });
  assert.deepEqual(logs, ["api-connection oauth callback failed: ApiConnectionError configuration-invalid"]);
});
