import assert from "node:assert/strict";
import test from "node:test";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryExternalMcpServerRepo, readEnabledExternalMcpConfigs } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { buildExternalMcpRegistrations } from "../../tool-registrations.js";
import { externalMcpAgentToolCatalog } from "../../agent-tools.js";
import { buildExternalMcpSaveFormFields, mergeExternalMcpSavePrefill } from "../../save-form.js";

for (const transport of ["streamable_http", "stdio"]) test(`static ${transport} token has a human-only secret field`, () => {
  const fields = buildExternalMcpSaveFormFields({ id: "hosted", transport, authMode: "static_env", accessTokenEnvName: "API_TOKEN" }, true);
  const token = fields.find(f => f.name === "accessToken");
  assert.deepEqual(token, { kind: "string", name: "accessToken", label: "Access token", secret: true, hint: "Leave blank to keep the stored token." });
  assert.equal(fields.some(f => f.name === "accessTokenEnvName"), transport === "stdio");
  assert.equal(JSON.stringify(externalMcpAgentToolCatalog.find(t => t.name === "external_mcp_save")!.inputSchema).includes('"accessToken"'), false);
});

test("hosted static token entered through the form is sealed, used as bearer auth and kept on a blank update", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const surfaces = createSurfaceExchangeStore();
  const deps = { workspaceId: "ws-n04-token", authorize: async () => ({ allowed: true, reason: "matched" }), clock: { nowIso: () => "2026-10-01T00:00:00.000Z" }, externalMcpServerRepo: repo, siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring };
  const regs = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces });
  const secret = "n04-human-secret";
  for (const accessToken of [secret, ""]) {
    let surface: unknown;
    const pending = regs.find(r => r.descriptor.id === "external_mcp_save")!.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: { id: "hosted", transport: "streamable_http", authMode: "static_env", url: "https://hosted.example/mcp" }, signal: new AbortController().signal, emitSurface: async (s: unknown) => { surface = s; } } as never);
    await new Promise(resolve => setImmediate(resolve));
    const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
    assert.equal(html.includes(secret), false);
    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    assert.notEqual(match, null);
    surfaces.deliver({ exchangeId: match![1]!, toolId: "external_mcp_save", principalId: "owner", params: { id: "hosted", transport: "streamable_http", authMode: "static_env", url: "https://hosted.example/mcp", accessToken } });
    const result = await pending;
    assert.deepEqual(Object.keys(result as object).sort(), ["saved", "server"]);
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
  assert.deepEqual(fields.find(field => field.name === "accessToken"), { kind: "string", name: "accessToken", label: "Access token", secret: true, hint: "Enter the API key or bearer token for this server." });
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
  const surfaces = createSurfaceExchangeStore();
  const deps = { workspaceId: "ws-n04-invalid", authorize: async () => ({ allowed: true, reason: "matched" }), clock: { nowIso: () => "2026-10-01T00:00:00.000Z" }, externalMcpServerRepo: repo, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring };
  const save = buildExternalMcpRegistrations(deps, { surfaceExchanges: surfaces }).find(r => r.descriptor.id === "external_mcp_save")!;
  let surface: unknown;
  const pending = save.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: { id: "local", transport: "stdio", command: "node", authMode: "static_env" }, signal: new AbortController().signal, emitSurface: async (s: unknown) => { surface = s; } } as never);
  await new Promise(resolve => setImmediate(resolve));
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.notEqual(match, null);
  surfaces.deliver({ exchangeId: match![1]!, toolId: "external_mcp_save", principalId: "owner", params: { id: "local", transport: "stdio", command: "node", authMode: "static_env", env } });
  assert.deepEqual(await pending, { saved: false, cancelled: false, reason: "invalid", message, field: "env" });
  assert.deepEqual(await repo.listByWorkspaceId(deps.workspaceId), []);
});
