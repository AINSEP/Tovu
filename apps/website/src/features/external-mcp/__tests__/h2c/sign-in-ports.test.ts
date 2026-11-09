/**
 * EXTRACT-S5 H2c: the hosted-MCP sign-in runs only on its injected `HostedMcpSignInPorts`.
 * - A second host with its own registration identity, links, paths, copy and FAKE flow operations signs in,
 *   and none of Tovu's vocabulary reaches its output.
 * - Tovu's binding (`tovuSignInPorts`) is the real implementations by identity, with the exact pre-H2c copy bytes.
 * - Provider canaries (token/secret/URL/path) never reach model-facing text.
 * - Canonical validation/unconfigured/reauth errors and real OAuth errors stay recognizable by the host's
 *   `isSignInRefusal`/`classifyError`, and an imitation OAuth error is not.
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import { formatAad } from "@jini-ai/platform/secrets";
import { isOAuthError, OAuthError, oauthFlowOperations } from "@jini-ai/oauth";
import type { OAuthFlowOperations, OAuthProviderDescriptor } from "@jini-ai/core/contracts/oauth";
import type { HostedMcpSignInPorts } from "@jini-ai/integrations/api-connections/hosted-mcp";
import { createTovuOAuthGuard, createTovuIssuerBoundDiscoveryPolicy, tovuOAuthMessages, withTovuOAuthCopy } from "#src/platform/oauth/endpoint-safety";
import { hostedMcpSignInLink } from "../../../api-connections/browser-binding.js";
import { classifyAgentPluginMcpError, isAgentPluginSignInRefusal } from "../../../agent-plugins/mcp-host-bindings.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryExternalMcpServerRepo } from "../../external-mcp-store.memory.js";
import { ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError, openExternalMcpOAuthPayload, saveExternalMcpServer, sealExternalMcpOAuthPayload } from "../../external-mcp-store.js";
import { resolveExternalMcpAuthMode, resolveExternalMcpOAuthStatus } from "../../../../contracts/core/external-mcp-auth.js";
import {
  createDeviceAuthorizationStore, createExternalMcpReauthRequiredError, createHostedMcpSignInService, ExternalMcpReauthRequiredError,
  tovuRegistrationIdentity, tovuSignInPorts,
} from "../../external-mcp-oauth.js";

const WS = "22222222-2222-4222-8222-222222222222" as never;
const SERVER = "docs";
const clock = { nowMs: () => Date.parse("2026-09-27T12:00:00.000Z"), nowIso: () => "2026-09-27T12:00:00.000Z" };
const CANARY = "/srv/secret/vault.db sk-CANARY-91 https://canary.invalid/leak?token=at-CANARY";
const TOVU_WORDS = ["Settings → External MCP", "Tovu", "tovu", "TOVU_PUBLIC_URL", "[external-mcp]", "/oauth/external-mcp", "this Mac"];
const provider: OAuthProviderDescriptor = { providerId: "acme-idp", label: "Acme IdP", supportedGrants: ["authorization_code"],
  authorizationEndpoint: "https://idp.acme.example/authorize", tokenEndpoint: "https://idp.acme.example/token", defaultScopes: [], usesPkce: true, clientAuth: "none" };
const BASELINE_OAUTH = "/home/user/s5/base/Tovu/apps/website/src/features/external-mcp/external-mcp-oauth.ts";
const BASELINE_SHARED = "/home/user/s5/base/Tovu/apps/website/src/features/external-mcp/external-mcp-shared-oauth.ts";

async function fixture() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveExternalMcpServer({ repo, sealer, keyring, clock } as never, {
    workspaceId: WS, serverId: SERVER, label: "Docs", transport: "streamable_http", authMode: "oauth", enabled: true,
    command: "", url: "https://mcp.acme.example/mcp", args: "", allowedToolNames: "search", writeAllowedToolNames: "", principalId: "operator-1",
    oauth: { providerId: "acme-idp", grant: "authorization_code", clientId: "client-1" },
  } as never);
  return { repo, keyring, sealer };
}

/** A second host: its own identity, link path, copy, AAD recorder and FAKE flow operations (no OAuth runtime, no network). */
function secondHost() {
  const calls: string[] = [];
  const seen: Record<string, unknown> = {};
  const messages = { providerUnavailable: "acme: provider down", providerRejected: "acme: provider said no" } as unknown as HostedMcpSignInPorts["oauthMessages"];
  const flow = {
    createOAuthProviderRegistry: () => ({ get: () => provider }),
    createTokenRefresher: () => ({ getAccessToken: async () => "unused" }),
    createSealedAuthorizationState: (args: unknown) => { calls.push("sealed-state"); seen.sealedState = args; return { stateless: true }; },
    beginAuthorizationCode: async (args: Record<string, unknown>, optional: Record<string, unknown>) => {
      calls.push("begin"); seen.begin = args; seen.beginOptional = optional;
      return { authorizationUrl: "https://idp.acme.example/authorize?state=s-1", expiresAt: "2026-09-27T12:10:00.000Z" };
    },
    completeAuthorizationCode: async (args: Record<string, unknown>) => {
      calls.push("complete"); seen.complete = args;
      return { accessToken: "at-1", refreshToken: "rt-1", tokenType: "Bearer", scopes: [], expiresAt: "2026-09-27T13:00:00.000Z" };
    },
  } as unknown as OAuthFlowOperations;
  const errors: HostedMcpSignInPorts["errors"] = {
    oauth: input => { calls.push(`oauth-error:${input.code}`); return Object.assign(new Error(`acme ${input.message}`), { code: input.code, operatorAction: input.operatorAction }); },
    isOAuthError: (error): error is never => false,
    validation: (message, field) => Object.assign(new Error(message), { field, kind: "acme-validation" }),
    isUnconfigured: () => false,
    reauthRequired: input => new Error(`relink ${input.serverId} at /admin/links`),
  };
  const ports: HostedMcpSignInPorts = {
    flow, errors,
    store: tovuSignInPorts.store,
    projections: tovuSignInPorts.projections,
    aad: { format: input => { calls.push("aad"); seen.aad = input; return `acme|${input.kind}|${input.version}|${input.parts.join("|")}`; } },
    signInLink: input => `/acme/connect/${input.serverId}?return=${encodeURIComponent(input.callbackUrl)}`,
    registrationIdentity: { softwareId: "acme-agent", clientName: record => `Acme:${record.serverId}`, sharedClientName: "Acme Shared" },
    oauthMessages: messages,
    discoveryPolicy: () => ({}) as never,
    withCopy: async ({ call }) => { calls.push("copy"); return call(); },
    copy: {
      actions: { noProvider: "acme: choose a provider at /admin/links", noClientId: "acme: add a client id at /admin/links", chooseGrant: "acme: choose a grant",
        noRegistration: "acme: add a client id", restartDevice: "acme: restart the device sign-in at /admin/links", restartShared: "acme: restart shared" },
      noSupportedGrant: ({ serverId }) => `acme: ${serverId} offers nothing we speak`,
      noPublicOrigin: ({ serverId }) => `acme: ${serverId} needs ACME_ORIGIN`,
      sharedLocalOnly: "acme: shared sign-in is not offered here", sharedUnavailable: "acme: unavailable", sharedOwnerOnly: "acme: owner only",
    },
    log: { postConnectFailed: input => { calls.push(`log:${input.serverId}`); seen.logged = input.error; } },
  };
  return { ports, calls, seen, messages };
}

/** The rejection of a call that must fail (fails the test when it resolves). */
async function rejection<E>(pending: Promise<unknown>): Promise<E> {
  try { await pending; } catch (error) { return error as E; }
  return assert.fail("expected the call to be refused");
}

function noTovuWords(text: string): void {
  for (const word of TOVU_WORDS) assert.ok(!text.includes(word), `second-host output carries Tovu vocabulary "${word}": ${text}`);
}

test("a second host signs in through its own ports and fake flow operations; no Tovu vocabulary in its output", async () => {
  const f = await fixture();
  const host = secondHost();
  const connected: string[] = [];
  const service = createHostedMcpSignInService({ workspaceId: WS, repo: f.repo, sealer: f.sealer, keyring: f.keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}) } as never, lookupProvider: () => provider, ports: host.ports,
    onConnected: async serverId => { connected.push(`${serverId}:${(await f.repo.findByServerId({ workspaceId: WS, serverId }))?.oauthStatus}`); } });
  const redirectUri = "https://agent.acme.example/hooks/oauth/docs";

  const started = await service.beginConnect({ serverId: SERVER, redirectUri });
  assert.equal(started.kind === "redirect_required" && started.authorizationUrl, "https://idp.acme.example/authorize?state=s-1");
  const begin = host.seen.begin as { options: { softwareId: string; clientDisplayName: string; redirectUris: string[] }; ownerKey: string; redirectUri: string };
  assert.deepEqual(begin.options, { clientDisplayName: "Acme:docs", softwareId: "acme-agent", redirectUris: [redirectUri] });
  assert.equal(begin.ownerKey, `${WS}:${SERVER}`);
  assert.equal((host.seen.beginOptional as { messages: unknown }).messages, host.messages);
  // The persisted AAD format is the neutral protocol input: kind/version/parts unchanged.
  assert.deepEqual(host.seen.aad, { kind: "oauth-redirect-state", version: "v1", parts: [JSON.stringify([WS, SERVER])] });

  const hostedStart = await service.beginConnect({ serverId: SERVER, redirectUri, delivery: "hosted" });
  assert.equal(hostedStart.kind === "redirect_required" && hostedStart.authorizationUrl, `/acme/connect/docs?return=${encodeURIComponent(redirectUri)}`);

  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri, params: { state: "s-1", code: "code-1" } });
  assert.deepEqual(connected, [`${SERVER}:connected`]);
  const row = await f.repo.findByServerId({ workspaceId: WS, serverId: SERVER });
  assert.equal(row?.oauthStatus, "connected");
  const payload = await tovuSignInPorts.store.openPayload(f.sealer, row as never);
  assert.equal(payload.tokens?.accessToken, "at-1");

  const noOrigin = await rejection<Error & { field?: string; kind?: string }>(service.beginConnect({ serverId: SERVER }));
  assert.equal(noOrigin.message, "acme: docs needs ACME_ORIGIN");
  assert.equal(noOrigin.field, "redirectUri");
  assert.equal(noOrigin.kind, "acme-validation");

  const noDevice = await rejection<Error & { operatorAction?: string }>(service.pollDeviceAuthorization({ serverId: SERVER }));
  assert.equal(noDevice.operatorAction, "acme: restart the device sign-in at /admin/links");
  assert.ok(host.calls.includes("oauth-error:OAUTH_INVALID_STATE"));

  const sharedRefusal = await rejection<Error>(service.beginConnect({ serverId: SERVER, destination: "shared" }));
  assert.equal(sharedRefusal.message, "acme: shared sign-in is not offered here");

  for (const text of [JSON.stringify(started), JSON.stringify(hostedStart), noOrigin.message, noDevice.message, String(noDevice.operatorAction), sharedRefusal.message]) noTovuWords(text);
});

test("second host: an onConnected failure goes to the host log port and never fails sign-in", async () => {
  const f = await fixture();
  const host = secondHost();
  const failure = new Error("post-connect boom");
  let runs = 0;
  const service = createHostedMcpSignInService({ workspaceId: WS, repo: f.repo, sealer: f.sealer, keyring: f.keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}) } as never, lookupProvider: () => provider, ports: host.ports,
    onConnected: async () => { runs += 1; throw failure; } });
  const redirectUri = "https://agent.acme.example/hooks/oauth/docs";
  await service.beginConnect({ serverId: SERVER, redirectUri });
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri, params: { state: "s-1", code: "code-1" } });
  assert.equal(runs, 1);
  assert.equal(host.seen.logged, failure);
  assert.ok(host.calls.includes(`log:${SERVER}`));
});

test("Tovu's binding is its real implementations by identity, and its copy is the exact pre-H2c bytes", () => {
  const p = tovuSignInPorts;
  assert.equal(p.flow, oauthFlowOperations);
  assert.equal(p.errors.reauthRequired, createExternalMcpReauthRequiredError);
  assert.equal(p.store.openPayload, openExternalMcpOAuthPayload);
  assert.equal(p.store.sealPayload, sealExternalMcpOAuthPayload);
  assert.equal(p.projections.authMode, resolveExternalMcpAuthMode);
  assert.equal(p.projections.oauthStatus, resolveExternalMcpOAuthStatus);
  assert.equal(p.aad.format, formatAad);
  assert.equal(p.signInLink, hostedMcpSignInLink);
  assert.equal(p.registrationIdentity, tovuRegistrationIdentity);
  assert.equal(p.oauthMessages, tovuOAuthMessages);
  assert.equal(p.discoveryPolicy, createTovuIssuerBoundDiscoveryPolicy);
  assert.equal(p.withCopy, withTovuOAuthCopy);

  const baseline = readFileSync(BASELINE_OAUTH, "utf8") + readFileSync(BASELINE_SHARED, "utf8");
  for (const text of [...Object.values(p.copy.actions), p.copy.sharedLocalOnly, p.copy.sharedUnavailable, p.copy.sharedOwnerOnly]) {
    assert.ok(baseline.includes(text), `copy not byte-identical to the baseline: ${text}`);
  }
  assert.equal(p.copy.noSupportedGrant({ serverId: "x", offered: [] }), "the authorization server for external MCP server 'x' advertises no grant Tovu supports (it offers: none)");
  assert.ok(baseline.includes("advertises no grant Tovu supports (it offers: ${grantTypesSupported.join(\", \") || \"none\"})"));
  const origin = p.copy.noPublicOrigin({ serverId: "x" });
  assert.ok(origin.startsWith("external MCP server 'x' uses the authorization_code grant, which needs an absolute callback URL Tovu can be reached at"));
  assert.ok(origin.endsWith("which derives the origin from the browser's own request. Nothing was changed."));
  for (const fragment of ["TOVU_PUBLIC_URL is not set, and this execution context has no ", "https://your-site.example.com) and try again, or start this connection from Settings → External MCP, which derives "]) {
    assert.ok(baseline.includes(fragment) && origin.includes(fragment));
  }
});

test("real Tovu wiring: a provider token error with token/secret/URL/path canaries is a real OAuthError whose text carries none of them", async () => {
  const f = await fixture();
  const service = createHostedMcpSignInService({ workspaceId: WS, repo: f.repo, sealer: f.sealer, keyring: f.keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: async () => new Response(JSON.stringify({ error: "invalid_grant",
      error_description: CANARY, error_uri: "https://canary.invalid/leak?token=at-CANARY" }), { status: 400, headers: { "content-type": "application/json" } }) },
    lookupProvider: () => provider, ports: tovuSignInPorts });
  const redirectUri = "https://host.example.com/callback/docs";
  const started = await service.beginConnect({ serverId: SERVER, redirectUri });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state") ?? "";
  const error = await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri, params: { state, code: "auth-code" } }).catch((e: unknown) => e);
  assert.ok(error instanceof OAuthError, String(error));
  assert.equal(tovuSignInPorts.errors.isOAuthError(error), true);
  for (const text of [error.message, error.operatorAction]) for (const canary of ["sk-CANARY-91", "canary.invalid", "/srv/secret", "at-CANARY"]) assert.ok(!text.includes(canary), text);
});

test("real Tovu wiring: a provider error carrying token/secret/URL/path canaries never reaches the model-facing reauth text", async () => {
  const f = await fixture();
  const service = createHostedMcpSignInService({ workspaceId: WS, repo: f.repo, sealer: f.sealer, keyring: f.keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}) } as never, lookupProvider: () => provider, ports: tovuSignInPorts });
  const providerFailure = new Error(`401 from provider: ${CANARY}`);
  const thrown = await service.reportAuthFailure(SERVER, providerFailure).catch((e: unknown) => e as Error);
  assert.ok(thrown instanceof ExternalMcpReauthRequiredError);
  for (const canary of ["sk-CANARY-91", "canary.invalid", "/srv/secret", "at-CANARY"]) assert.ok(!thrown.message.includes(canary), thrown.message);
  assert.equal((await f.repo.findByServerId({ workspaceId: WS, serverId: SERVER }))?.oauthStatus, "needs_reauth");
});

test("error identity: canonical validation/unconfigured/reauth and real OAuth errors stay recognizable; an imitation is not", () => {
  const { errors } = tovuSignInPorts;
  const validation = errors.validation("bad field", "redirectUri");
  assert.ok(validation instanceof ExternalMcpValidationError && validation instanceof hosted.ExternalMcpValidationError);
  assert.equal(classifyAgentPluginMcpError({ error: validation }), "validation");
  assert.equal(isAgentPluginSignInRefusal({ error: validation }), true);

  const unconfigured = new hosted.ExternalMcpSecretStoreUnconfiguredError("x");
  assert.ok(unconfigured instanceof ExternalMcpSecretStoreUnconfiguredError);
  assert.equal(errors.isUnconfigured(unconfigured), true);
  assert.equal(errors.isUnconfigured(new Error("x")), false);
  assert.equal(classifyAgentPluginMcpError({ error: unconfigured }), "unconfigured");

  const real = errors.oauth({ code: "OAUTH_INVALID_STATE", message: "m", operatorAction: "a" });
  assert.ok(real instanceof OAuthError && isOAuthError({ value: real }));
  assert.equal(errors.isOAuthError(real), true);
  assert.equal(isAgentPluginSignInRefusal({ error: real }), true);
  const imitation = Object.assign(new Error("m"), { code: "OAUTH_INVALID_STATE", retryable: false, operatorAction: "a", providerErrorCode: undefined, retryAfterSeconds: undefined });
  assert.equal(errors.isOAuthError(imitation), false);
  assert.equal(isAgentPluginSignInRefusal({ error: imitation }), false);

  const reauth = errors.reauthRequired({ serverId: SERVER, label: "Docs" });
  assert.ok(reauth instanceof ExternalMcpReauthRequiredError);
  assert.equal((reauth as ExternalMcpReauthRequiredError).retryable, false);
});
