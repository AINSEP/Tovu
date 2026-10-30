import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryExternalMcpServerRepo } from "../../external-mcp-store.memory.js";
import { readEnabledExternalMcpConfigs, saveExternalMcpServer } from "../../external-mcp-store.js";
import { openExternalMcpOAuthPayload } from "../../external-mcp-store.js";
import type { SurfaceEmission } from "@jini-ai/core";
import type { ExternalMcpToolDeps } from "../../deps.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { buildExternalMcpRegistrations, contributeExternalMcpTools } from "../../tool-registrations.js";
import { externalMcpAgentToolCatalog } from "../../agent-tools.js";
import { buildExternalMcpSaveFormFields, mergeExternalMcpSavePrefill } from "../../save-form.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


for (const transport of ["streamable_http", "stdio"]) test(`static ${transport} token has a human-only secret field`, () => {
  const fields = buildExternalMcpSaveFormFields({ id: "hosted", transport, authMode: "static_env", accessTokenEnvName: "API_TOKEN" }, true);
  const token = fields.find(f => f.name === "accessToken");
  assert.deepEqual(token, { kind: "string", name: "accessToken", label: "Access token", secret: true, allowBlank: true, hint: "Leave blank to keep the stored token." });
  assert.equal(fields.some(f => f.name === "accessTokenEnvName"), transport === "stdio");
  assert.equal(JSON.stringify(externalMcpAgentToolCatalog.find(t => t.name === "external_mcp_save")!.inputSchema).includes('"accessToken"'), false);
});

test("hosted static token entered through the form is sealed, used as bearer auth and kept on a blank update", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const deps = { workspaceId: "ws-n04-token", authorize: async () => ({ allowed: true, reason: "matched" }), clock: { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z"), nowIso: () => "2026-10-01T00:00:00.000Z" }, externalMcpServerRepo: repo, siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring };
  const regs = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces });
  const secret = "n04-human-secret";
  for (const accessToken of [secret, ""]) {
    let surface: unknown;
    const pending = invokeFixtureHandler(regs.find(r => r.descriptor.id === "external_mcp_save")!, { executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: { id: "hosted", transport: "streamable_http", authMode: "static_env", url: "https://hosted.example/mcp" }, signal: new AbortController().signal, emitSurface: async (s: unknown) => { surface = s; } } as never);
    await new Promise(resolve => setImmediate(resolve));
    const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
    assert.equal(html.includes(secret), false);
    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    assert.notEqual(match, null);
    surfaces.deliver({ exchangeId: match![1]!, principalId: "owner", params: { id: "hosted", transport: "streamable_http", authMode: "static_env", url: "https://hosted.example/mcp", accessToken } }, { toolId: "external_mcp_save" });
    const result = await pending;
    assert.deepEqual(Object.keys(result as object).sort(), ["connection", "message", "saved", "server"]);
    assert.equal((result as { saved: boolean }).saved, true);
    assert.equal(JSON.stringify(result).includes(secret), false);
    const resolved = await readEnabledExternalMcpConfigs({ repo, sealer }, deps.workspaceId);
    assert.deepEqual(resolved.failures, []);
    assert.deepEqual(resolved.configs[0]!.target, { kind: "streamable_http", url: "https://hosted.example/mcp", headers: { authorization: `Bearer ${secret}` } });
  }
});

for (const authMode of ["none", "oauth"]) test(`${authMode} auth never asks for a static token`, () => {
  const fields = buildExternalMcpSaveFormFields({ id: "srv", transport: "streamable_http", authMode }, false);
  assert.equal(fields.some(field => field.name === "accessToken" || field.name === "accessTokenEnvName"), false);
});

test("an omitted auth mode uses the store's static-token default and a new token field has no prefill", () => {
  const fields = buildExternalMcpSaveFormFields({ id: "srv", transport: "streamable_http" }, false);
  assert.deepEqual(fields.find(field => field.name === "accessToken"), { kind: "string", name: "accessToken", label: "Access token", secret: true, allowBlank: true, hint: "Enter the API key or bearer token for this server." });
});

test("stdio token env-name hints preserve stored names unless explicitly changed", () => {
  const existing = { accessTokenEnvName: "STORED_TOKEN", args: [], allowedToolNames: [], writeAllowedToolNames: [], oauth: { scopes: [] } } as never;
  assert.equal(mergeExternalMcpSavePrefill({ id: "srv", transport: "stdio" }, existing).accessTokenEnvName, "STORED_TOKEN");
  assert.equal(mergeExternalMcpSavePrefill({ id: "srv", transport: "stdio", accessTokenEnvName: "NEW_TOKEN" }, existing).accessTokenEnvName, "NEW_TOKEN");
});

for (const [env, message] of [
  ["n04-invalid-human-secret", "line 1 of the environment block is not `NAME=VALUE` — correct it in the connection form"],
  ["9n04-invalid-human-secret=value", "line 1 of the environment block has an invalid variable name (letters, digits and underscore, not starting with a digit)"],
]) test(`an invalid human credential block never echoes the submitted secret to the model: ${env.includes("=") ? "name" : "line"}`, async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const deps = { workspaceId: "ws-n04-invalid", authorize: async () => ({ allowed: true, reason: "matched" }), clock: { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z"), nowIso: () => "2026-10-01T00:00:00.000Z" }, externalMcpServerRepo: repo, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring };
  const save = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces }).find(r => r.descriptor.id === "external_mcp_save")!;
  let surface: unknown;
  const pending = invokeFixtureHandler(save, { executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: { id: "local", transport: "stdio", command: "node", authMode: "static_env" }, signal: new AbortController().signal, emitSurface: async (s: unknown) => { surface = s; } } as never);
  await new Promise(resolve => setImmediate(resolve));
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.notEqual(match, null);
  surfaces.deliver({ exchangeId: match![1]!, principalId: "owner", params: { id: "local", transport: "stdio", command: "node", authMode: "static_env", env } }, { toolId: "external_mcp_save" });
  assert.deepEqual(await pending, { saved: false, cancelled: false, reason: "invalid", message, field: "env" });
  assert.deepEqual(await repo.listByWorkspaceId(deps.workspaceId), []);
});

/** Supplies the fixture emitter through the canonical handler options, including headless calls. */
function invokeFixtureHandler(
  registration: import("@jini-ai/core").ToolRegistration,
  context: import("@jini-ai/core").ToolExecutionContext & { emitSurface?: import("@jini-ai/core").SurfaceEmitter },
) {
  const { emitSurface, ...required } = context;
  return registration.handler(required, emitSurface ? { emitSurface } : {});
}

test('a rejected saved static token returns a secure update-card diagnostic', async () => {
  const repo = new InMemoryExternalMcpServerRepo(); const keyring = new InMemoryKeyring(); const sealer = new AesGcmSecretSealer(keyring);
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const deps = { workspaceId: 'ws-static-recovery', authorize: async () => ({ allowed: true, reason: 'matched' }),
    clock: { nowMs: () => Date.parse('2026-10-07T00:00:00Z'), nowIso: () => '2026-10-07T00:00:00Z' },
    externalMcpServerRepo: repo, siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring,
    externalMcpProbe: async () => ({ ok: false, body: { code: 'MCP_AUTH_REJECTED' } }),
  };
  const registrations = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces });
  let surface: unknown;
  const save = invokeFixtureHandler(registrations.find(registration => registration.descriptor.id === 'external_mcp_save')!, {
    executionId: 'save', principal: { id: 'owner' }, run: { id: 'run' }, input: { id: 'hosted', transport: 'streamable_http', authMode: 'static_env', url: 'https://hosted.example/mcp' }, signal: new AbortController().signal,
    emitSurface: async value => { surface = value; },
  });
  await new Promise(resolve => setImmediate(resolve));
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(/__exchangeId"\s*:\s*"([^"]+)"/); assert.ok(match);
  surfaces.deliver({ exchangeId: match[1]!, principalId: 'owner', params: { id: 'hosted', transport: 'streamable_http', authMode: 'static_env', url: 'https://hosted.example/mcp', accessToken: 'private-test-token' } }, { toolId: 'external_mcp_save' });
  await save;
  const result = await invokeFixtureHandler(registrations.find(registration => registration.descriptor.id === 'external_mcp_test_connection')!, {
    executionId: 'probe', principal: { id: 'owner' }, run: { id: 'run' }, input: { id: 'hosted' }, signal: new AbortController().signal,
  }) as { credentialSetup: unknown };
  assert.deepEqual(result.credentialSetup, {
    setupToolId: 'external_mcp_save', remedyToolId: 'external_mcp_save', prefill: { id: 'hosted' },
    hint: 'A missing or rejected credential may be fixed by saving it through the secure card.',
  });
});

/** The real exchange and sealed store, with host timers controlled as in credential-copy-tool.test. */
function cardFixture(repo = new InMemoryExternalMcpServerRepo()) {
  const clock = createFakeClock({ startIso: "2026-10-16T00:00:00.000Z" });
  const timers = new Set<() => void>();
  let id = 0;
  const surfaces = createSurfaceExchangeStore({ clock, idGenerator: { newId: () => `card-${++id}` }, defaultChannel: "mcp-ui",
    scheduler: { schedule: ({ callback }) => { timers.add(callback); return () => { timers.delete(callback); }; } },
  });
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const deps: ExternalMcpToolDeps = { workspaceId: "ws-card-branches", authorize: async () => ({ allowed: true, reason: "matched" }), clock,
    externalMcpServerRepo: repo, siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring };
  const emissions: SurfaceEmission[] = [];
  const controller = new AbortController();
  function call(toolId: string, input: unknown) {
    const registration = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces }).find(r => r.descriptor.id === toolId)!;
    return registration.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input, signal: controller.signal });
  }
  async function open(input: Record<string, unknown>) {
    let didEmit!: (surface: SurfaceEmission) => void;
    const emitted = new Promise<SurfaceEmission>(resolve => { didEmit = resolve; });
    const registration = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces }).find(r => r.descriptor.id === "external_mcp_save")!;
    const pending = registration.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input, signal: controller.signal }, {
      emitSurface: async surface => { emissions.push(surface); didEmit(surface); },
    });
    // A preparation rejection must fail immediately, not leave the test waiting for an emission.
    const surface = await Promise.race([emitted, pending.then(() => { throw new Error("save finished without a form"); })]);
    const html = (surface.payload as { resource: { resource: { text: string } } }).resource.resource.text;
    const match = html.match(/__exchangeId"\s*:\s*"([^"]+)"/);
    assert.ok(match);
    return { pending, html, submit: (params: Record<string, unknown>) => {
      assert.deepEqual(surfaces.deliver({ exchangeId: match[1]!, principalId: "owner", params }, { toolId: "external_mcp_save" }), { ok: true });
    } };
  }
  return { repo, deps, clock, surfaces, emissions, controller, open, call, sealer,
    expire: () => { clock.advanceMs(6 * 60 * 1000); for (const callback of [...timers]) callback(); } };
}

for (const [name, probe, code, message] of [
  ["connected", async () => ({ ok: true, body: {} }), "connected", "Connected."],
  ["authentication", async () => ({ ok: false, body: { code: "MCP_AUTH_REJECTED" } }), "MCP_AUTH_REJECTED", "The server rejected this token."],
  ["timeout", async () => ({ ok: false, body: { code: "MCP_TIMEOUT" } }), "MCP_TIMEOUT", "The connection timed out."],
  ["other refusal", async () => ({ ok: false, body: { code: "CUSTOM_REFUSAL" } }), "CUSTOM_REFUSAL", "Could not reach the server."],
  ["missing code", async () => ({ ok: false, body: {} }), "MCP_SERVER_UNREACHABLE", "Could not reach the server."],
  ["thrown failure", async () => { throw new Error("private probe detail"); }, "MCP_SERVER_UNREACHABLE", "Could not reach the server."],
] as const) test(`a saved hosted connection reports ${name} and remains persisted`, async () => {
  const f = cardFixture();
  f.deps.externalMcpProbe = probe;
  const card = await f.open({ id: " HOSTED ", transport: "streamable_http", authMode: "none", url: "https://hosted.example/mcp" });
  card.submit({ url: "https://hosted.example/mcp" });
  const result = await card.pending as { saved: boolean; connection: string; message: string };
  assert.equal(result.saved, true);
  assert.equal(result.connection, code);
  assert.equal(result.message, message);
  const stored = await f.repo.findByServerId({ workspaceId: f.deps.workspaceId, serverId: "hosted" });
  assert.ok(stored);
  assert.equal(stored.url, "https://hosted.example/mcp");
  assert.equal(stored.enabled, true);
  assert.equal(f.emissions.length, 2);
  const outcome = (f.emissions[1]!.payload as { resource: { resource: { text: string } } }).resource.resource.text;
  assert.ok(outcome.includes(message));
  assert.doesNotMatch(JSON.stringify({ result, emissions: f.emissions }), /private probe detail/);
  assert.equal(f.surfaces.size(), 0);
});

test("the submitted stdio token and env reach runtime while optional non-string fields use safe defaults", async () => {
  const f = cardFixture();
  f.deps.externalMcpProbe = async () => assert.fail("saving stdio must not launch or probe the command");
  const card = await f.open({ id: "local", transport: "stdio", command: "node", label: 42, args: false, authMode: "static_env", accessTokenEnvName: "SERVICE_TOKEN" });
  card.submit({ command: "node", label: 42, args: false, allowedToolNames: 42, writeAllowedToolNames: null, env: "EXTRA_TOKEN=env-secret", accessToken: "human-static-token", accessTokenEnvName: "SERVICE_TOKEN" });
  const result = await card.pending as { saved: boolean; connection: string; message: string };
  assert.equal(result.saved, true);
  assert.equal(result.connection, "not_tested");
  assert.match(result.message, /Saved, not tested\./);
  assert.match(result.message, /…oken, 18 chars/);
  assert.match(result.message, /EXTRA_TOKEN/);
  const resolved = await readEnabledExternalMcpConfigs({ repo: f.repo, sealer: f.sealer }, f.deps.workspaceId);
  assert.deepEqual(resolved.failures, []);
  assert.equal(resolved.configs.length, 1);
  assert.deepEqual(resolved.configs[0]!.target, { kind: "stdio", command: "node", args: [], env: { EXTRA_TOKEN: "env-secret", SERVICE_TOKEN: "human-static-token" } });
  assert.deepEqual(resolved.configs[0]!.allowedToolNames, []);
  assert.deepEqual(resolved.configs[0]!.writeAllowedToolNames, []);
  assert.doesNotMatch(JSON.stringify({ result, emissions: f.emissions }), /human-static-token|env-secret/);
});

test("OAuth form fields retain manual endpoints, scopes, client identity and the sealed client secret", async () => {
  const f = cardFixture();
  const card = await f.open({ id: "oauth-local", transport: "stdio", authMode: "oauth", command: "node",
    oauthProviderId: "manual-provider", oauthGrant: "device_code", oauthClientId: "client", oauthScopes: "read write", oauthTokenEnvName: "OAUTH_TOKEN",
    oauthAuthorizationEndpoint: "https://auth.example/authorize", oauthTokenEndpoint: "https://auth.example/token", oauthDeviceAuthorizationEndpoint: "https://auth.example/device" });
  card.submit({ command: "node", args: "server.mjs", label: "OAuth local", allowedToolNames: "read,write", writeAllowedToolNames: "write",
    oauthProviderId: "manual-provider", oauthGrant: "device_code", oauthClientId: "client", oauthClientSecret: "human-client-secret", oauthScopes: "read write", oauthTokenEnvName: "OAUTH_TOKEN",
    oauthAuthorizationEndpoint: "https://auth.example/authorize", oauthTokenEndpoint: "https://auth.example/token", oauthDeviceAuthorizationEndpoint: "https://auth.example/device" });
  const result = await card.pending as { saved: boolean; connection: string };
  assert.equal(result.saved, true);
  assert.equal(result.connection, "not_tested");
  const record = await f.repo.findByServerId({ workspaceId: f.deps.workspaceId, serverId: "oauth-local" });
  assert.ok(record);
  assert.equal(record.oauthProviderId, "manual-provider");
  assert.equal(record.oauthGrant, "device_code");
  assert.equal(record.oauthClientId, "client");
  assert.equal(record.oauthTokenEnvName, "OAUTH_TOKEN");
  assert.deepEqual(JSON.parse(record.oauthScopesJson!), ["read", "write"]);
  assert.deepEqual(JSON.parse(record.oauthEndpointsJson!), { authorizationEndpoint: "https://auth.example/authorize", tokenEndpoint: "https://auth.example/token", deviceAuthorizationEndpoint: "https://auth.example/device" });
  assert.equal((await openExternalMcpOAuthPayload(f.sealer, record)).clientSecret, "human-client-secret");
  assert.doesNotMatch(JSON.stringify({ result, emissions: f.emissions }), /human-client-secret/);
});

for (const accessToken of [" ", 42]) test(`a ${typeof accessToken === "string" ? "whitespace" : "non-string"} form secret cannot create a connection`, async () => {
  const f = cardFixture();
  const card = await f.open({ id: "hosted", transport: "streamable_http", authMode: "static_env" });
  card.submit({ url: "https://hosted.example/mcp", accessToken });
  assert.deepEqual(await card.pending, { saved: false, cancelled: false, reason: "invalid", message: "Enter a token. Spaces alone are not a token." });
  assert.deepEqual(await f.repo.listByWorkspaceId(f.deps.workspaceId), []);
  assert.equal(f.surfaces.size(), 0);
});

test("an expired connection form returns the explicit expiry result and saves nothing", async () => {
  const f = cardFixture();
  const card = await f.open({ id: "hosted", transport: "streamable_http", authMode: "none" });
  f.expire();
  assert.deepEqual(await card.pending, { saved: false, cancelled: false, reason: "expired", note: "The user did not respond to the connection form before it expired. Nothing was saved." });
  assert.deepEqual(await f.repo.listByWorkspaceId(f.deps.workspaceId), []);
  assert.equal(f.emissions.length, 1);
  assert.equal(f.surfaces.size(), 0);
});

test("an enabled connection that fails resolution returns the resolver's actionable reason", async () => {
  const f = cardFixture();
  await saveExternalMcpServer({ repo: f.repo, sealer: f.sealer, keyring: f.deps.siteAssistantSecretKeyring, clock: f.clock }, {
    workspaceId: f.deps.workspaceId, principalId: "owner", serverId: "broken", transport: "streamable_http", authMode: "static_env", enabled: true,
    url: "https://hosted.example/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "", accessToken: "test-static-token",
  });
  f.deps.siteAssistantSecretSealer = new AesGcmSecretSealer(new InMemoryKeyring());
  assert.deepEqual(await f.call("external_mcp_test_connection", { id: "broken" }), { ok: false, reason: "its stored access token could not be decrypted — re-enter it in Settings → External MCP" });
});

test("a connection deleted during configuration resolution returns the fallback reason", async () => {
  class DisappearingRepo extends InMemoryExternalMcpServerRepo {
    armed = false;
    override async listByWorkspaceId(workspaceId: string) {
      if (this.armed) { this.armed = false; await this.deleteByServerId({ workspaceId, serverId: "gone" }); }
      return super.listByWorkspaceId(workspaceId);
    }
  }
  const repo = new DisappearingRepo();
  const f = cardFixture(repo);
  await saveExternalMcpServer({ repo, sealer: f.sealer, keyring: f.deps.siteAssistantSecretKeyring, clock: f.clock }, {
    workspaceId: f.deps.workspaceId, principalId: "owner", serverId: "gone", transport: "streamable_http", authMode: "none", enabled: true,
    url: "https://hosted.example/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "",
  });
  repo.armed = true;
  assert.deepEqual(await f.call("external_mcp_test_connection", { id: "gone" }), { ok: false, reason: "this server's connection could not be resolved" });
  assert.equal(await repo.findByServerId({ workspaceId: f.deps.workspaceId, serverId: "gone" }), null);
});

for (const probe of [
  { ok: true, body: { tools: ["read"] } },
  { ok: false, body: { code: "MCP_TIMEOUT" } },
  { ok: false, body: { code: "MCP_AUTH_REJECTED" } },
]) test(`a ${probe.ok ? "successful" : probe.body.code} probe of an unauthenticated server returns its exact result`, async () => {
  const f = cardFixture();
  await saveExternalMcpServer({ repo: f.repo, sealer: f.sealer, keyring: f.deps.siteAssistantSecretKeyring, clock: f.clock }, {
    workspaceId: f.deps.workspaceId, principalId: "owner", serverId: "public", transport: "streamable_http", authMode: "none", enabled: true,
    url: "https://hosted.example/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "",
  });
  const contributor = contributeExternalMcpTools({ probe: async (deps, serverId) => {
    assert.equal(deps, f.deps);
    assert.equal(serverId, "public");
    return probe;
  } }, {});
  const registration = contributor.build(f.deps as never, { surfaceExchanges: f.surfaces }).find(r => r.descriptor.id === "external_mcp_test_connection")!;
  assert.deepEqual(await registration.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: { id: "public" }, signal: f.controller.signal }), probe);
});

test("the contributor without a live probe retains the configuration-only connection check", async () => {
  const f = cardFixture();
  const contributor = contributeExternalMcpTools({}, {});
  const registration = contributor.build(f.deps as never, { surfaceExchanges: f.surfaces }).find(r => r.descriptor.id === "external_mcp_test_connection")!;
  assert.deepEqual(await registration.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: { id: "missing" }, signal: f.controller.signal }), { ok: false, reason: "no external MCP server is configured as 'missing'" });
});

test("OAuth driver failures propagate unchanged rather than becoming input errors", async t => {
  const f = cardFixture();
  const previous = process.env.TOVU_PUBLIC_URL;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_PUBLIC_URL; else process.env.TOVU_PUBLIC_URL = previous; });
  delete process.env.TOVU_PUBLIC_URL;
  f.deps.derivedPublicOrigin = "";
  const failure = new Error("OAuth service unavailable");
  f.deps.externalMcpOAuth = { beginConnect: async () => { throw failure; } } as unknown as ExternalMcpToolDeps["externalMcpOAuth"];
  await assert.rejects(f.call("external_mcp_oauth_connect", { id: "hosted" }), error => error === failure);
  assert.deepEqual(await f.repo.listByWorkspaceId(f.deps.workspaceId), []);
});

test("omitting the model auth mode saves with the store's static-token default", async () => {
  const f = cardFixture();
  const card = await f.open({ id: "default-auth", transport: "streamable_http" });
  card.submit({ url: "https://hosted.example/mcp", accessToken: "default-static-token" });
  const result = await card.pending as { saved: boolean };
  assert.equal(result.saved, true);
  const stored = await f.repo.findByServerId({ workspaceId: f.deps.workspaceId, serverId: "default-auth" });
  assert.ok(stored);
  assert.equal(stored.authMode, "static_env");
  const resolved = await readEnabledExternalMcpConfigs({ repo: f.repo, sealer: f.sealer }, f.deps.workspaceId);
  assert.deepEqual(resolved.failures, []);
  assert.equal(resolved.configs.length, 1);
  assert.deepEqual(resolved.configs[0]!.target, { kind: "streamable_http", url: "https://hosted.example/mcp", headers: { authorization: "Bearer default-static-token" } });
});

test("a configuration check resolves an OAuth token through its injected service without disclosing it", async () => {
  const f = cardFixture();
  await saveExternalMcpServer({ repo: f.repo, sealer: f.sealer, keyring: f.deps.siteAssistantSecretKeyring, clock: f.clock }, {
    workspaceId: f.deps.workspaceId, principalId: "owner", serverId: "oauth", transport: "streamable_http", authMode: "oauth", enabled: true,
    url: "https://hosted.example/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "", oauth: { clientId: "client", grant: "authorization_code" },
  });
  const record = await f.repo.findByServerId({ workspaceId: f.deps.workspaceId, serverId: "oauth" });
  assert.ok(record);
  // Successful authorization persists this status before the resolver can use a token.
  await f.repo.upsert({ ...record, oauthStatus: "connected" });
  const resolutions: { serverId: string }[] = [];
  const oauth: Pick<NonNullable<ExternalMcpToolDeps["externalMcpOAuth"]>, "tokenResolver"> = { tokenResolver: {
    resolveAccessToken: async input => { resolutions.push(input); return "private-oauth-token"; },
  } };
  f.deps.externalMcpOAuth = oauth as NonNullable<ExternalMcpToolDeps["externalMcpOAuth"]>;
  const result = await f.call("external_mcp_test_connection", { id: "oauth" });
  assert.deepEqual(result, { ok: true });
  assert.doesNotMatch(JSON.stringify({ result, emissions: f.emissions }), /private-oauth-token/);
  assert.deepEqual(resolutions, [{ serverId: "oauth" }]);
});

// L155 pins, written against the old handler before separating save/probe decisions.
test("a submitted destination change is rejected before writing or probing", async () => {
  const f = cardFixture();
  f.deps.externalMcpProbe = async () => assert.fail("a rejected destination must not be probed");
  const card = await f.open({ id: "hosted", transport: "streamable_http", authMode: "none" });
  card.submit({ id: "other", url: "https://hosted.example/mcp" });
  assert.deepEqual(await card.pending, { saved: false, cancelled: false, reason: "invalid",
    message: "The server ID must match the connection form. Nothing was saved.", field: "id" });
  assert.deepEqual(await f.repo.listByWorkspaceId(f.deps.workspaceId), []);
  assert.equal(f.surfaces.size(), 0);
});

test("a hosted save without a probe binds routing and auth to preparation and reports not tested", async () => {
  const f = cardFixture();
  const card = await f.open({ id: "hosted", transport: "streamable_http", authMode: "none" });
  card.submit({ transport: "stdio", authMode: "oauth", url: "https://hosted.example/mcp", label: "Display", args: "",
    allowedToolNames: "read, write", writeAllowedToolNames: "write", accessTokenEnvName: "" });
  const result = await card.pending as { saved: boolean; connection: string; message: string };
  assert.equal(result.saved, true);
  assert.equal(result.connection, "not_tested");
  assert.equal(result.message, "Saved, not tested.");
  const record = await f.repo.findByServerId({ workspaceId: f.deps.workspaceId, serverId: "hosted" });
  assert.ok(record);
  assert.equal(record.transport, "streamable_http");
  assert.equal(record.authMode, "none");
  assert.equal(record.label, "Display");
  assert.equal(record.allowedToolNames, JSON.stringify(["read", "write"]));
  assert.equal(record.writeAllowedToolNames, JSON.stringify(["write"]));
  assert.equal(f.surfaces.size(), 0);
});

for (const code of ["MCP_TIMEOUT", "MCP_AUTH_REJECTED", undefined]) test(`a saved static connection preserves probe code ${String(code)} and offers setup only for rejected auth`, async () => {
  const f = cardFixture();
  await saveExternalMcpServer({ repo: f.repo, sealer: f.sealer, keyring: f.deps.siteAssistantSecretKeyring, clock: f.clock }, {
    workspaceId: f.deps.workspaceId, principalId: "owner", serverId: "static", transport: "streamable_http", authMode: "static_env", enabled: true,
    url: "https://hosted.example/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "", accessToken: "test-token",
  });
  const probe = { ok: code === undefined, body: { code } };
  f.deps.externalMcpProbe = async () => probe;
  const result = await f.call("external_mcp_test_connection", { id: "static" });
  if (code === "MCP_AUTH_REJECTED") {
    assert.deepEqual(result, { ...probe, credentialSetup: { setupToolId: "external_mcp_save", remedyToolId: "external_mcp_save",
      prefill: { id: "static" }, hint: "A missing or rejected credential may be fixed by saving it through the secure card." } });
  } else assert.equal(result, probe);
});

test("a disabled connection refuses before invoking an available probe", async () => {
  const f = cardFixture();
  await saveExternalMcpServer({ repo: f.repo, sealer: f.sealer, keyring: f.deps.siteAssistantSecretKeyring, clock: f.clock }, {
    workspaceId: f.deps.workspaceId, principalId: "owner", serverId: "disabled", transport: "streamable_http", authMode: "none", enabled: false,
    url: "https://hosted.example/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "",
  });
  f.deps.externalMcpProbe = async () => assert.fail("disabled connections must not be probed");
  assert.deepEqual(await f.call("external_mcp_test_connection", { id: "disabled" }), { ok: false, reason: "this server is disabled" });
});
