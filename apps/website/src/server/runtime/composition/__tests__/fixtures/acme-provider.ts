/**
 * @file The fake "acme-office" provider and the composition the G6b vertical slice drives, shared
 * so other suites (e.g. `agent_plugin_connect`'s API-connection branch) run against the real
 * `composeAgentPluginConnections` instead of a hand-made host. Two local 127.0.0.1 servers: the
 * provider (token endpoint with PKCE check, `/me`, a table API) and the "site" serving the public
 * OAuth callback. Only the provider's two hosts resolve through `http`; any other host throws.
 * Call `startAcmeProvider` in `before` and `stopAcmeProvider` in `after`.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import type { HttpClientPort } from "@jini-ai/core/primitives";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { loadPluginContributionsFromSource, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { runApiConnectionConnect } from "#src/features/api-connections/connect";
import { registerApiConnectionOAuthCallbackRoute } from "#src/server/inbound/public-http/routes/api-connections/oauth-callback";
import type { AuthorizeFn } from "#src/contracts/core/commands/index";
import { composeAgentPluginConnections } from "../../agent-plugin-connections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "../../../../../features/api-connections/__tests__/fixtures/acme-office");
export const WORKSPACE = "ws-1";
export const PLUGIN = "acme-office";
export const accessToken = "acme-access-" + "z".repeat(24);
export const refreshToken = "acme-refresh-" + "w".repeat(24);
const issued = new Map<string, string>();
/** Every row the fake provider's table API accepted: table, idempotency header and JSON body. */
export const appended: { table: string; idempotencyKey: string | undefined; body: unknown }[] = [];
let provider: Server;
let site: Server;
export let providerOrigin = "";
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

/** The fake provider's token endpoint: a code it issued, redeemed once with the matching PKCE verifier. */
function answerTokenEndpoint(res: ServerResponse, body: string): void {
  const form = new URLSearchParams(body);
  const challenge = issued.get(form.get("code") ?? "");
  issued.delete(form.get("code") ?? "");
  const verified = challenge !== undefined && createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === challenge;
  res.statusCode = verified ? 200 : 400;
  res.end(JSON.stringify(verified ? { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" } : { error: "invalid_grant" }));
}

/** The fake provider's table API: `POST /tables/<table>/rows` with the issued bearer token appends one row. */
function answerTableApi(req: IncomingMessage, res: ServerResponse, body: string): void {
  // `GET /tables/<id>`: the table exists for the signed-in account (how a surface verifies a pick).
  if (req.method === "GET") {
    res.statusCode = req.headers.authorization === `Bearer ${accessToken}` && req.url === "/tables/T1" ? 200 : 404;
    return void res.end("{}");
  }
  const table = /^\/tables\/([^/]+)\/rows$/.exec(req.url ?? "")?.[1];
  const authorized = table !== undefined && req.headers.authorization === `Bearer ${accessToken}`;
  if (authorized) appended.push({ table: decodeURIComponent(table), idempotencyKey: req.headers["idempotency-key"] as string | undefined, body: JSON.parse(body) });
  res.statusCode = authorized ? 201 : 401;
  res.end("{}");
}

/** Starts the fake provider and the local "site" (call from `before`). */
export async function startAcmeProvider(): Promise<void> {
  provider = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/me") {
        res.statusCode = req.headers.authorization === `Bearer ${accessToken}` ? 200 : 401;
        return res.end(JSON.stringify({ id: "acct-1", name: "Ada" }));
      }
      if (req.url?.startsWith("/tables/")) return answerTableApi(req, res, body);
      answerTokenEndpoint(res, body);
    });
  });
  providerOrigin = await listen(provider);
  process.env.TOVU_PUBLIC_URL = PUBLIC_URL;
  site = createServer();
  siteOrigin = await listen(site);
}
/** Closes both servers and restores `TOVU_PUBLIC_URL` (call from `after`). */
export async function stopAcmeProvider(): Promise<void> {
  await new Promise((resolve) => provider.close(resolve));
  await new Promise((resolve) => site.close(resolve));
  if (previousPublicUrl === undefined) delete process.env.TOVU_PUBLIC_URL;
  else process.env.TOVU_PUBLIC_URL = previousPublicUrl;
}

export const loadContributions: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: PLUGIN, packageRoot: fixtureRoot }, definition: input.definition });

/** The site's public address; the callback route reads it from the process env, as in production. */
export const PUBLIC_URL = "https://site.acme-test.invalid";
const previousPublicUrl = process.env.TOVU_PUBLIC_URL;

export type AcmeComposition = Awaited<ReturnType<typeof compose>>;

export async function compose(env: Record<string, string> = { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24), TOVU_PUBLIC_URL: PUBLIC_URL, TOVU_API_CONNECTION_CALLBACK_ORIGINS: PUBLIC_URL }) {
  const keyring = new InMemoryKeyring({ hkdfSalt: "agent-plugin-connections-slice" });
  const vaultRepo = new InMemoryVaultRepo({});
  const composition = composeAgentPluginConnections({
    workspaceId: WORKSPACE, loadContributions, vaultRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }), customCredentialRepo: new InMemoryCustomCredentialSetRepo(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() }, http,
    env,
    derivedPublicOrigin: undefined,
  });
  return { ...composition, vaultRepo };
}

/** Serves the public callback for this composition (only) on the local "site". */
export function mountCallback(composition: AcmeComposition): void {
  const app = express();
  registerApiConnectionOAuthCallbackRoute(app, { host: composition.apiConnections.host, callbackLimiter: { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, log: () => {} });
  site.removeAllListeners("request");
  site.on("request", app);
}

/** Connects the fixture's connection through `agent_plugin_connect`'s hosted path and the public callback. */
export async function connectHosted(composition: AcmeComposition) {
  mountCallback(composition);
  const [connection] = await composition.apiConnections.host.listConnections({ pluginId: PLUGIN });
  return runApiConnectionConnect({
    deps: composition.apiConnections, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => { assert.equal((await fetch(consentRedirect(signInUrl))).status, 200); },
  });
}

/** The "browser": consent at the fake provider, which redirects back with a code bound to the PKCE challenge. */
export function consentRedirect(authorizationUrl: string, extraFields: Readonly<Record<string, string>> = {}): string {
  const url = new URL(authorizationUrl);
  const code = randomBytes(12).toString("hex");
  issued.set(code, url.searchParams.get("code_challenge") ?? "");
  const back = new URL(url.searchParams.get("redirect_uri") ?? "");
  back.searchParams.set("code", code);
  back.searchParams.set("state", url.searchParams.get("state") ?? "");
  for (const [name, value] of Object.entries(extraFields)) back.searchParams.set(name, value);
  // The public address is not real; the "browser" reaches this test's local site for it.
  return back.origin === PUBLIC_URL ? `${siteOrigin}${back.pathname}${back.search}` : back.href;
}

export const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
/** Connects and returns the opaque ref `agent_plugin_connect` hands the model (H1: never derived here). */
export async function connectForRef(composition: AcmeComposition): Promise<string> {
  const { status, connectionRef } = await connectHosted(composition);
  assert.equal(status, "connected");
  assert.equal(typeof connectionRef, "string");
  return connectionRef;
}
