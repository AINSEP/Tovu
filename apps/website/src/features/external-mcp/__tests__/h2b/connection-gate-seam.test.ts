/**
 * EXTRACT-S5 H2b: the connection gate split in place behind host ports. Proves the exact order
 * (read → activation → preset bypass of roster grants only → roster refusal / access hint → shared
 * auth → legacy reauth → roster current-grants verdict), that activation failure denies, that a row
 * read failure is operator-logged with only generic model text, that ONE reauth factory serves the gate
 * and the sign-in service, that onConnected runs once after durable success and its failure never fails
 * sign-in, and that a second host's vocabulary fully replaces Tovu's.
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import { createTovuOAuthGuard } from "#src/platform/oauth/endpoint-safety";
import type { OAuthProviderDescriptor } from "#src/platform/oauth/index";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryExternalMcpServerRepo } from "../../external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../../external-mcp-store.js";
import {
  createDeviceAuthorizationStore, createExternalMcpConnectionGate, createExternalMcpOAuthService, createExternalMcpReauthRequiredError,
  createHostedMcpConnectionGate, ExternalMcpReauthRequiredError, tovuConnectionGateVocabulary, tovuRegistrationIdentity,
  type HostedMcpConnectionGatePorts,
} from "../../external-mcp-oauth.js";

const WS = "11111111-1111-4111-8111-111111111111" as never;
const SERVER = "docs";
const clock = { nowMs: () => Date.parse("2026-09-27T12:00:00.000Z"), nowIso: () => "2026-09-27T12:00:00.000Z" };
const CANARY = "/var/lib/canary/db.sqlite sk-CANARY-77 https://canary.invalid/x";
const TOVU_WORDS = ["plugins_set_enabled", "agent-plugin", "Settings → External MCP", "EXTERNAL_MCP", "[external-mcp]", "tovu"];

async function fixture(input: { plugin?: string; enabled?: boolean } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await saveExternalMcpServer({ repo, sealer, keyring, clock } as never, {
    workspaceId: WS, serverId: SERVER, label: "Docs", transport: "streamable_http", authMode: "oauth", enabled: input.enabled ?? true,
    command: "", url: "https://mcp.example.com/mcp", args: "", allowedToolNames: "search", writeAllowedToolNames: "", principalId: "operator-1",
    oauth: { providerId: "test-provider", grant: "authorization_code", clientId: "client-1" },
    ...(input.plugin ? { provisionedByPluginId: input.plugin } : {}),
  } as never);
  const row = await repo.findByServerId({ workspaceId: WS, serverId: SERVER });
  assert.ok(row);
  const roster = { remoteName: "search", origin: { kind: "roster", admissionRevision: hosted.externalMcpAdmissionRevision(row) } } as never;
  return { repo, keyring, sealer, row, roster };
}

/** A second host: different permissions, tool ids, paths and identity; every port call is recorded in order. */
function secondHost(base: { repo: HostedMcpConnectionGatePorts["repo"] }, overrides: Partial<HostedMcpConnectionGatePorts> = {}) {
  const calls: string[] = [];
  const ports: HostedMcpConnectionGatePorts = {
    workspaceId: WS,
    repo: { findByServerId: async input => { calls.push("read"); return base.repo.findByServerId(input); } },
    isPluginEnabled: async () => { calls.push("activation"); return true; },
    assertSharedAuthorized: async () => { calls.push("shared"); return false; },
    reauthRequired: input => { calls.push("reauth"); return Object.assign(new Error(`relink ${input.serverId} at /admin/links`), { code: "LINK_EXPIRED" }); },
    revoked: input => { calls.push(`revoked:${input.reason}`); return new Error(`blocked ${input.reason}`); },
    recovery: {
      accessHint: input => `ask an admin to run grant_access(${input.pluginId}) for ${input.serverId}`,
      pluginOff: input => `enable extension ${input.pluginId} via extensions_toggle`,
    },
    logUnreadableRow: () => { calls.push("log"); },
    ...overrides,
  };
  return { ports, calls };
}

function assertNoTovuWords(text: string): void {
  for (const word of TOVU_WORDS) assert.ok(!text.includes(word), `second-host text carried '${word}': ${text}`);
}

test("roster call: read → activation → roster check → shared → legacy reauth → current-grants verdict", async () => {
  const f = await fixture({ plugin: "ext-a" });
  await f.repo.upsert({ ...f.row, oauthStatus: "connected" }); // an unconnected OAuth row is itself a roster refusal
  const { ports, calls } = secondHost(f);
  const row = await f.repo.findByServerId({ workspaceId: WS, serverId: SERVER });
  const call = { remoteName: "search", declaredAnnotations: { readOnlyHint: true }, requiresWriteGrant: false, origin: { kind: "roster", admissionRevision: hosted.externalMcpAdmissionRevision(row!) } } as never;
  assert.equal(await createHostedMcpConnectionGate(ports)(SERVER, call), "current-grants-checked");
  assert.deepEqual(calls, ["read", "activation", "shared"]);
});

test("preset call bypasses ONLY the roster grant check: shared and legacy reauth still run, no verdict", async () => {
  const f = await fixture();
  await f.repo.upsert({ ...f.row, oauthStatus: "needs_reauth" });
  const { ports, calls } = secondHost(f);
  const preset = { remoteName: "not-granted", origin: { kind: "preset" } } as never;
  await assert.rejects(createHostedMcpConnectionGate(ports)(SERVER, preset), /relink docs at \/admin\/links/);
  assert.deepEqual(calls, ["read", "shared", "reauth"]);
  const ok = secondHost(f, { assertSharedAuthorized: async () => true });
  assert.equal(await createHostedMcpConnectionGate(ok.ports)(SERVER, preset), undefined);
});

test("roster refusal throws the host's revocation error; an active plugin row gets the host's access hint first", async () => {
  const f = await fixture();
  const { ports, calls } = secondHost(f);
  const removed = { remoteName: "search", origin: { kind: "roster", admissionRevision: "stale" } } as never;
  await assert.rejects(createHostedMcpConnectionGate(ports)("other", removed), /blocked removed/);
  assert.deepEqual(calls, ["read", "revoked:removed"]);

  const p = await fixture({ plugin: "ext-b", enabled: false });
  const host = secondHost(p);
  const error = await createHostedMcpConnectionGate(host.ports)(SERVER, p.roster).then(() => null, (e: unknown) => e);
  assert.ok(error instanceof ToolInputError);
  assert.equal(error.message, "ask an admin to run grant_access(ext-b) for docs");
  assert.deepEqual(host.calls, ["read", "activation"]);
  assertNoTovuWords(error.message);
});

test("activation lookup failure denies before any roster or shared check", async () => {
  const f = await fixture({ plugin: "ext-c" });
  const { ports, calls } = secondHost(f, { isPluginEnabled: async () => { throw new Error(CANARY); } });
  const error = await createHostedMcpConnectionGate(ports)(SERVER, f.roster).then(() => null, (e: unknown) => e);
  assert.ok(error instanceof ToolInputError);
  assert.equal(error.message, "enable extension ext-c via extensions_toggle");
  assert.deepEqual(calls, ["read"]); // the override records nothing; no roster, shared or reauth step ran
});

test("row lookup failure: operator log gets the detail, the model gets only the generic unverifiable refusal", async () => {
  const logged: unknown[] = [];
  const { ports } = secondHost({ repo: { findByServerId: async () => { throw new Error(CANARY); } } },
    { logUnreadableRow: input => { logged.push(input.error); } });
  await assert.rejects(createHostedMcpConnectionGate(ports)(SERVER, { remoteName: "search" } as never), /^Error: blocked unverifiable$/);
  assert.equal((logged[0] as Error).message, CANARY);

  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message: string) => { warnings.push(message); };
  try {
    const tovu = createExternalMcpConnectionGate({ workspaceId: WS, repo: { findByServerId: async () => { throw new Error(CANARY); } }, isPluginEnabled: async () => true });
    const error = await tovu(SERVER, { remoteName: "search" } as never).then(() => null, (e: unknown) => e as Error);
    assert.ok(error && !error.message.includes(CANARY) && /EXTERNAL_MCP_CONNECTION_REVOKED/.test(String((error as { code?: string }).code)));
  } finally { console.warn = original; }
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]!.startsWith(`[external-mcp] '${SERVER}': federated tool call refused`) && warnings[0]!.includes(CANARY));
});

async function signInService(makeOnConnected: (repo: InMemoryExternalMcpServerRepo) => (serverId: string) => Promise<void>) {
  const f = await fixture();
  const onConnected = makeOnConnected(f.repo);
  const provider: OAuthProviderDescriptor = { providerId: "test-provider", label: "Test", supportedGrants: ["authorization_code"],
    authorizationEndpoint: "https://auth.example.com/authorize", tokenEndpoint: "https://auth.example.com/token", defaultScopes: [], usesPkce: true, clientAuth: "none" };
  const service = createExternalMcpOAuthService({ workspaceId: WS, repo: f.repo, sealer: f.sealer, keyring: f.keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: async () => new Response(JSON.stringify({ token_type: "Bearer",
      access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } }) },
    lookupProvider: () => provider, onConnected } as never);
  const redirectUri = "https://host.example.com/callback/docs";
  const started = await service.beginConnect({ serverId: SERVER, redirectUri });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state") ?? "";
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri, params: { state, code: "auth-code" } });
  return { f, service };
}

test("onConnected runs exactly once after the durable token write; its failure does not fail sign-in", async () => {
  const seen: string[] = [];
  await signInService(repo => async serverId => {
    const row = await repo.findByServerId({ workspaceId: WS, serverId });
    seen.push(`${serverId}:${row?.oauthStatus}`);
  });
  assert.deepEqual(seen, [`${SERVER}:connected`]);

  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message: string) => { warnings.push(message); };
  let calls = 0;
  try {
    const { f: g } = await signInService(() => async () => { calls += 1; throw new Error(CANARY); });
    assert.equal((await g.repo.findByServerId({ workspaceId: WS, serverId: SERVER }))?.oauthStatus, "connected");
  } finally { console.warn = original; }
  assert.equal(calls, 1);
  assert.equal(warnings.length, 1);
});

test("ONE reauth factory: the Tovu gate and the sign-in service throw the same class, code and retryability", async () => {
  assert.equal(tovuConnectionGateVocabulary.reauthRequired({ serverId: "x" }).constructor, ExternalMcpReauthRequiredError);
  const f = await fixture();
  await f.repo.upsert({ ...f.row, oauthStatus: "needs_reauth" });
  const gate = createExternalMcpConnectionGate({ workspaceId: WS, repo: f.repo, isPluginEnabled: async () => true });
  const fromGate = await gate(SERVER, { remoteName: "search", origin: { kind: "preset" } } as never).then(() => null, (e: unknown) => e);
  const { service } = await signInService(() => async () => undefined);
  const fromSignIn = await service.reportAuthFailure(SERVER, new Error(CANARY)).then(() => null, (e: unknown) => e);
  for (const error of [fromGate, fromSignIn, createExternalMcpReauthRequiredError({ serverId: SERVER })]) {
    assert.ok(error instanceof ExternalMcpReauthRequiredError);
    assert.deepEqual([error.code, error.retryable], ["EXTERNAL_MCP_REAUTH_REQUIRED", false]);
    assert.ok(!error.message.includes(CANARY));
  }
  const source = readFileSync(new URL("../../external-mcp-oauth.ts", import.meta.url), "utf8");
  assert.equal(source.match(/new ExternalMcpReauthRequiredError\(/g)?.length, 1, "only the canonical factory constructs the class");
});

test("registration identity is bound once with the stable Tovu values", () => {
  assert.equal(tovuRegistrationIdentity.softwareId, "tovu");
  assert.equal(tovuRegistrationIdentity.sharedClientName, "Tovu");
  assert.equal(tovuRegistrationIdentity.clientName({ label: "Docs", serverId: SERVER }), "Docs");
  assert.equal(tovuRegistrationIdentity.clientName({ label: null, serverId: SERVER }), SERVER);
});

test("a call built with no origin gets the full roster re-check (unverifiable), never the preset bypass", async () => {
  const f = await fixture();
  await f.repo.upsert({ ...f.row, oauthStatus: "connected" });
  const { ports, calls } = secondHost(f);
  await assert.rejects(createHostedMcpConnectionGate(ports)(SERVER, { remoteName: "search", declaredAnnotations: { readOnlyHint: true } } as never), /blocked unverifiable/);
  assert.deepEqual(calls, ["read", "revoked:unverifiable"]);
});
