/**
 * @file Shared phase-C test harness for the API-connection adapters: a local fake OAuth provider
 * for the "acme-office" fixture plugin (token endpoint with PKCE check, `/me`, `/revoke`), a host
 * builder over the real Jini service and Tovu vault stores, a fixture-copy helper and the
 * "browser" consent step. Every outbound URL that is not the fake provider's host throws, so no
 * test can reach a real network. Callers close the harness in `after`.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import type { OAuthHttpPorts, startLoopbackAuthorizationReceiver } from "@jini-ai/oauth";
import type { Clock } from "@jini-ai/core/primitives";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../../agent-plugins/lifecycle.js";
import { InMemoryCustomCredentialSetRepo } from "../../../custom-credentials/index.js";
import { createApiConnectionHost, type ApiConnectionHost, type ApiConnectionRuntime } from "../../host.js";
import type { PluginHttp } from "../../hook-http.js";
import { registerApiConnectionOAuthCallbackRoute } from "../../../../server/inbound/public-http/routes/api-connections/oauth-callback.js";
import { trackStartingBrowser, type StartingBrowser } from "./starting-browser.js";

export const ACME_FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "acme-office");
export const ACME_PLUGIN = "acme-office";
export const ACME_WORKSPACE = "ws-1";

/** The fake provider's answers; a test that changes one restores it with `reset()`. */
export interface FakeProviderState {
  tokenStatus: number | undefined;
  tokenBody: Record<string, unknown> | undefined;
  revokeStatus: number;
  account: { id: string; name: string };
  tokenCalls: number;
  revokeCalls: number;
  /** The last token-endpoint form received (to see which client, and whether a secret, was sent). */
  lastTokenForm: URLSearchParams;
}

export interface AcmeHostOptions {
  readonly workspaceId?: string;
  readonly runtime?: ApiConnectionRuntime;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly clock?: Clock;
  readonly vaultRepo?: InMemoryVaultRepo;
  readonly customCredentialRepo?: InMemoryCustomCredentialSetRepo;
  readonly packageRoot?: string;
  readonly publicOrigin?: () => string | undefined;
  readonly startLoopback?: typeof startLoopbackAuthorizationReceiver;
  readonly loadContributions?: LoadPluginContributions;
  readonly pluginHttp?: PluginHttp;
  /** Share one site key with stores a test builds itself (another "process" over the same vault). */
  readonly keyring?: InMemoryKeyring;
  /** Lines the mounted callback route logs. */
  readonly logs?: string[];
}

export interface AcmeHarness {
  readonly providerOrigin: string;
  readonly siteOrigin: string;
  readonly provider: FakeProviderState;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly oauthHttp: OAuthHttpPorts;
  readonly pluginHttp: PluginHttp;
  /** Env every runtime's client resolves in (web id + secret, desktop id, the site as callback origin). */
  readonly env: Readonly<Record<string, string>>;
  /** A host over the fixture plugin; also mounts the public callback route on the site server. */
  makeHost(options?: AcmeHostOptions): ApiConnectionHost;
  /**
   * The "browser": consents at the fake provider and follows the redirect; returns the callback status.
   * By default it is the browser that started the sign-in (it carries the binding cookie); pass
   * `browser.cookie` to be another browser (`''` carries none).
   */
  consent(authorizationUrl: string, extra?: Readonly<Record<string, string>>, browser?: { readonly cookie?: string }): Promise<number>;
  /** The redirect the provider would send (code bound to the PKCE challenge), without following it. A host sign-in link is resolved first. */
  consentRedirect(authorizationUrl: string, extra?: Readonly<Record<string, string>>): URL;
  /** The provider URL a sign-in link of the latest host leads to (a hosted link is the host's own). */
  providerUrl(link: string): string;
  /** The `Cookie` header the starting browser of the latest host sends with a URL carrying `state`. */
  cookieFor(url: string | URL): Readonly<Record<string, string>>;
  reset(): void;
  close(): Promise<void>;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

/** A copy of the fixture plugin whose first connection declaration `edit` changes; removed after the test. */
export function acmeFixtureCopy(t: { after(fn: () => void): void }, edit: (declaration: Record<string, unknown>) => void, files: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "acme-c3-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(ACME_FIXTURE_ROOT, root, { recursive: true });
  const file = path.join(root, "tovu-connections.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { connections: Record<string, unknown>[] };
  edit(parsed.connections[0]!);
  writeFileSync(file, JSON.stringify(parsed));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, name), content);
  return root;
}

const fresh = (): FakeProviderState => ({ tokenStatus: undefined, tokenBody: undefined, revokeStatus: 200, account: { id: "acct-1", name: "Ada" }, tokenCalls: 0, revokeCalls: 0, lastTokenForm: new URLSearchParams() });

/** Starts the fake provider and an empty site server, both on 127.0.0.1 ephemeral ports. */
export async function startAcmeHarness(): Promise<AcmeHarness> {
  const accessToken = "acme-access-" + "c".repeat(24);
  const refreshToken = "acme-refresh-" + "d".repeat(24);
  const provider = fresh();
  const issued = new Map<string, string>();
  let providerOrigin = "";
  const providerServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/me") return void res.end(JSON.stringify(provider.account));
      if (req.url === "/revoke") { provider.revokeCalls += 1; res.statusCode = provider.revokeStatus; return void res.end("{}"); }
      provider.tokenCalls += 1;
      const form = new URLSearchParams(body);
      provider.lastTokenForm = form;
      if (form.get("grant_type") === "refresh_token") {
        res.statusCode = provider.tokenStatus ?? 200;
        return void res.end(JSON.stringify(provider.tokenBody ?? { access_token: accessToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" }));
      }
      const challenge = issued.get(form.get("code") ?? "");
      issued.delete(form.get("code") ?? "");
      const verified = challenge !== undefined && createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === challenge;
      res.statusCode = provider.tokenStatus ?? (verified ? 200 : 400);
      res.end(JSON.stringify(provider.tokenBody ?? (verified
        ? { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" }
        : { error: "invalid_grant" })));
    });
  });
  providerOrigin = await listen(providerServer);
  const siteServer = createServer();
  const siteOrigin = await listen(siteServer);

  const toLocal = (raw: string): string => {
    const url = new URL(raw);
    if (url.hostname !== "auth.acme.test" && url.hostname !== "api.acme.test") throw new Error(`unexpected outbound host ${url.hostname}`);
    return `${providerOrigin}${url.pathname}${url.search}`;
  };
  const oauthHttp: OAuthHttpPorts = { guard: { assertSafeUrl: ({ raw }) => new URL(raw) }, fetchFn: ({ url }, init) => fetch(toLocal(String(url)), init) };
  const pluginHttp: PluginHttp = { fetch: ({ url }, init = {}) => fetch(toLocal(url), init as RequestInit) };
  const env = {
    TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "w".repeat(24),
    TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client", TOVU_API_CONNECTION_CALLBACK_ORIGINS: siteOrigin,
  };

  let browser: StartingBrowser | undefined;
  function makeHost(options: AcmeHostOptions = {}): ApiConnectionHost {
    const keyring = options.keyring ?? new InMemoryKeyring({ hkdfSalt: "api-connections-c3" });
    const packageRoot = options.packageRoot ?? ACME_FIXTURE_ROOT;
    const loadContributions: LoadPluginContributions = options.loadContributions
      ?? ((input) => loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot }, definition: input.definition }));
    const host = createApiConnectionHost({
      workspaceId: options.workspaceId ?? ACME_WORKSPACE, loadContributions, vaultRepo: options.vaultRepo ?? new InMemoryVaultRepo({}), keyring,
      sealer: new AesGcmSecretSealer({ keyring }), customCredentialRepo: options.customCredentialRepo ?? new InMemoryCustomCredentialSetRepo(),
      clock: options.clock ?? { nowMs: () => Date.now() }, oauthHttp, pluginHttp: options.pluginHttp ?? pluginHttp,
      runtime: options.runtime ?? "hosted", env: options.env ?? env, publicOrigin: options.publicOrigin ?? (() => siteOrigin),
    }, options.startLoopback === undefined ? {} : { startLoopback: options.startLoopback });
    const app = express();
    const logs = options.logs;
    registerApiConnectionOAuthCallbackRoute(app, { host, callbackLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, log: (line) => { logs?.push(line); } });
    siteServer.removeAllListeners("request");
    siteServer.on("request", app);
    browser = trackStartingBrowser(host);
    return host;
  }

  const cookieFor = (url: string | URL): Readonly<Record<string, string>> => browser?.cookieFor(url) ?? {};

  function consentRedirect(authorizationUrl: string, extra: Readonly<Record<string, string>> = {}): URL {
    const url = new URL(browser?.providerUrl(authorizationUrl) ?? authorizationUrl);
    const code = randomBytes(12).toString("hex");
    issued.set(code, url.searchParams.get("code_challenge") ?? "");
    const back = new URL(url.searchParams.get("redirect_uri") ?? "");
    for (const [name, value] of Object.entries({ ...extra, code, state: url.searchParams.get("state") ?? "" })) back.searchParams.set(name, value);
    return back;
  }

  return {
    providerOrigin, siteOrigin, provider, accessToken, refreshToken, oauthHttp, pluginHttp, env, makeHost, consentRedirect, cookieFor,
    providerUrl: (link) => browser?.providerUrl(link) ?? link,
    async consent(authorizationUrl, extra = {}, other = {}) {
      const back = consentRedirect(authorizationUrl, extra);
      const response = await fetch(back, { headers: other.cookie === undefined ? cookieFor(back) : { cookie: other.cookie } });
      await response.text();
      return response.status;
    },
    reset() { Object.assign(provider, fresh()); },
    async close() {
      await new Promise((resolve) => providerServer.close(resolve));
      await new Promise((resolve) => siteServer.close(resolve));
    },
  };
}

/** Signs the fixture connection in through the hosted public callback; returns the connection and its ref. */
export async function connectHosted(harness: AcmeHarness, host: ApiConnectionHost, input: { readonly scopeSetIds?: readonly string[] } = {}) {
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  assert.ok(connection, "the fixture declares one connection");
  const start = await host.serviceFor({ connection }).start({ workspaceId: host.workspaceId, actorId: "admin-1", intent: "connect", scopeSetIds: [...(input.scopeSetIds ?? [])], redirectUri: host.hostedCallbackUrl({ connection }) });
  assert.equal(await harness.consent(start.authorizationUrl), 200);
  const { connectionRef } = await host.statusOf({ connection });
  return { connection, connectionRef };
}
