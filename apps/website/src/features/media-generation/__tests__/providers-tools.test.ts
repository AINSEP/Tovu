/** t10: human credential setup; real exchange/store/sealer, no HTTP listener or provider API. */
import { credentialSaveFixtureInput, credentialSaveFixtureRegistrations } from "../../../__tests__/support/credential-save.js";
import { credentialSaveCatalog, credentialSaveDerivedRisk } from "../../custom-credentials/credential-save-tool.js";
/** t10: human credential setup; real exchange/store/sealer, no HTTP listener or provider API. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError, type SurfaceEmission, type SurfaceEmitter, type ToolExecutionContext } from '@jini-ai/core';

/** Context overrides a call may pass; `emitSurface` travels as a handler option, not on the context. */
type CallExtra = Partial<ToolExecutionContext> & { emitSurface?: SurfaceEmitter };
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryMediaProviderCredentialRepo } from '../../media/provider-credential-store.memory.js';
import { resolveMediaProviderCredential, saveMediaProviderCredentials } from '../../media/provider-credential-store.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { buildMediaGenerationRegistrations, type MediaGenerationToolDeps } from '../tool-registrations.js';
import { saveMediaCredential, buildMediaProviderRegistrations, mediaProvidersAgentToolCatalog, mediaProvidersDerivedRisk } from '../providers-tools.js';
import { isMcpUiToolCallAllowed, isMcpUiToolCallPermitted } from '../../../assistant/mcp-ui-tool-calls.js';
import type { Express, Request, Response } from 'express';
import { registerMcpUiToolCallsRoute, MCP_UI_TOOL_CALLS_PATH } from '../../../assistant/mcp-ui-tool-calls-route.js';
import { RUN_PRINCIPAL_HEADER } from "../../../assistant/daemon-access.js";
import { SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import type { ToolExecutor } from '@jini-ai/daemon';
import { createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const SECRET = 't10-media-secret-unique-731';
test('t10 media credential form submit and cancel pass both MCP-UI callback gates', () => {
  assert.equal(isMcpUiToolCallAllowed('credential_save'), true);
  assert.equal(isMcpUiToolCallPermitted('credential_save', true), true);
  assert.equal(isMcpUiToolCallPermitted('credential_save', false), false, 'secrets must only answer a parked exchange, never enter a fresh audited tool call');
  assert.equal(isMcpUiToolCallAllowed('media_list_providers'), false);
});

test('t10 media callback delivers a human key only to its parked call, rejects wrong principals and replay', async () => {
  const f = fixture(); const { pending, emitted } = await form(f);
  let handler!: (req: Request, res: Response) => Promise<void>;
  // Invoke the registered production handler directly: no HTTP listener or transport mock.
  registerMcpUiToolCallsRoute({ post: (path: string, callback: typeof handler) => {
    assert.equal(path, MCP_UI_TOOL_CALLS_PATH); handler = callback;
  } } as unknown as Express, {
    surfaceExchanges: f.surfaces,
    toolExecutor: { execute: async () => assert.fail('human secrets must never enter a fresh tool execution') } as unknown as ToolExecutor,
  });
  async function callback(principal: string, params: Record<string, unknown>) {
    let status = 200; let body: unknown;
    const response = { status: (value: number) => { status = value; return response; }, json: (value: unknown) => { body = value; return response; } };
    await handler({ body: { toolName: 'credential_save', params }, get: (header: string) => {
      assert.equal(header, RUN_PRINCIPAL_HEADER); return principal;
    } } as unknown as Request, response as unknown as Response);
    return { status, body };
  }
  assert.deepEqual(await callback('person', { apiKey: SECRET }), { status: 403, body: {
    error: "'credential_save' is not an MCP-UI-redeemable tool", code: 'TOOL_NOT_ALLOWLISTED',
  } });
  const params = { [SURFACE_EXCHANGE_ID_PARAM]: 'exchange-t10', apiKey: SECRET };
  assert.deepEqual(await callback('intruder', params), { status: 409, body: {
    error: 'that dialog is no longer waiting for an answer', code: 'SURFACE_NOT_PENDING', reason: 'binding-mismatch',
  } });
  assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []);
  assert.deepEqual(await callback('person', params), { status: 202, body: { delivered: true } });
  const result = await pending;
  assert.deepEqual(result, { saved: true, provider: 'openai', configured: true, tokenHint: { length: 27, last4: '-731' }, connection: 'not_tested', message: '…-731, 27 chars. Saved, not tested.' });
  assertNoSecret(result); assertNoSecret(emitted);
  assert.deepEqual(await resolveMediaProviderCredential({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'openai' }),
    { apiKey: SECRET, baseUrl: null, model: null });
  assert.deepEqual(await callback('person', params), { status: 409, body: {
    error: 'that dialog is no longer waiting for an answer', code: 'SURFACE_NOT_PENDING', reason: 'unknown-or-closed',
  } });
  assert.equal(f.surfaces.size(), 0);
});
function fixture(allowed = true, exchangeOptions: NonNullable<Parameters<typeof createSurfaceExchangeStore>[1]> = {}) {
  const repo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const auth: unknown[] = [];
  const deps = { workspaceId: 'ws-t10', mediaProviderCredentialRepo: repo, siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring, clock: { nowMs: () => Date.parse('2026-10-01T00:00:00.000Z'), nowIso: () => '2026-10-01T00:00:00.000Z' },
    authorize: async (input: unknown) => { auth.push(input); return { allowed, reason: allowed ? 'matched' : 'insufficient_permission' }; } };
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'exchange-t10' }, defaultChannel: "mcp-ui" }, { ...exchangeOptions });
  const registrations = credentialSaveFixtureRegistrations({ registrations: buildMediaProviderRegistrations(deps, { surfaceExchanges: surfaces }), adapters: { mediaProvider: (ctx, optional = {}) => saveMediaCredential({ ctx, deps, surfaces: { surfaceExchanges: surfaces } }, optional) } });
  function tool(id: string) { const found = registrations.find(r => r.descriptor.id === id); assert.ok(found, `expected '${id}' to be wired`); return found; }
  function call(id: string, input: unknown, extra: CallExtra = {}) {
    return invokeFixtureHandler(tool(id), { executionId: 'exec', principal: { id: 'person' }, run: { id: 'run' }, input: id === 'credential_save' ? credentialSaveFixtureInput({ input, kind: 'media-provider' }) : input,
      signal: new AbortController().signal, ...extra });
  }
  const writeDeps = { repo, sealer, keyring, clock: deps.clock };
  return { deps, repo, sealer, auth, surfaces, tool, call, writeDeps };
}
async function form(f: ReturnType<typeof fixture>, extra: CallExtra = {}) {
  const emitted: SurfaceEmission[] = [];
  let raised!: () => void;
  const ready = new Promise<void>(resolve => { raised = resolve; });
  const pending = f.call('credential_save', { provider: 'openai', reason: 'Generate a cover' }, {
    emitSurface: async s => { emitted.push(s); raised(); }, ...extra });
  await Promise.race([ready, pending.then(() => assert.fail('call returned without a form'))]);
  return { pending, emitted, html: (emitted[0]!.payload as { resource: { resource: { text: string } } }).resource.resource.text };
}
function submit(f: ReturnType<typeof fixture>, params: Record<string, unknown>) {
  assert.deepEqual(f.surfaces.deliver({ exchangeId: 'exchange-t10', principalId: 'person', params }, { toolId: 'credential_save' }), { ok: true });
}
function assertNoSecret(value: unknown) { assert.equal(JSON.stringify(value).includes(SECRET), false, 'model/surface output contains submitted secret'); }

test('t10 media registration risk, permissions and exact model input fields', () => {
  const f = fixture();
  for (const [id, permission, risk, keys, readOnly] of [
    ['media_list_providers', 'media.read', 'none', [], true],
    ['credential_save', 'resolved-per-kind', 'mutates-durable-state', ['baseUrl', 'category', 'kind', 'label', 'prefill', 'reason', 'target'], false],
  ] as const) {
    const entry = [...mediaProvidersAgentToolCatalog, ...credentialSaveCatalog].find(t => t.name === id); assert.ok(entry);
    assert.equal(entry.authorization.permission, permission); assert.equal(entry.sideEffects, risk);
    assert.equal((id === "credential_save" ? credentialSaveDerivedRisk : mediaProvidersDerivedRisk).get(id), risk); assert.equal(f.tool(id).descriptor.readOnly, readOnly);
    assert.deepEqual(Object.keys((entry.inputSchema as any).properties).sort(), [...keys]);
    assert.equal(entry.inputSchema!.additionalProperties, false);
  }
});

test('t10 media list contains exact safe keys, includes configured and unconfigured image/video providers', async () => {
  const f = fixture();
  await saveMediaProviderCredentials(f.writeDeps, { workspaceId: 'ws-t10', providers: { openai: { apiKey: SECRET } } });
  const result = await f.call('media_list_providers', {}) as { providers: Array<{ id: string; label: string; kinds: string[]; configured: boolean }> };
  assert.deepEqual(Object.keys(result), ['providers']); assert.ok(result.providers.length > 1);
  for (const provider of result.providers) {
    assert.deepEqual(Object.keys(provider).sort(), ['configured', 'id', 'integrated', 'kinds', 'label']);
    assert.ok(provider.kinds.length > 0); assert.ok(provider.kinds.every(k => k === 'image' || k === 'video'));
  }
  assert.equal(result.providers.find(p => p.id === 'openai')!.configured, true);
  assert.equal(result.providers.find(p => p.id === 'replicate')!.configured, false);
  assert.ok(result.providers.some(p => p.kinds.includes('video'))); assertNoSecret(result);
  assert.deepEqual(f.auth, [{ principalId: 'person', permission: 'media.read', workspaceId: 'ws-t10', entityType: 'media' }]);
});

test('t10 media form masks the key and submits through a bound exchange; save readback preserves other providers and metadata', async () => {
  const f = fixture();
  await saveMediaProviderCredentials(f.writeDeps, { workspaceId: 'ws-t10', providers: {
    openai: { apiKey: 'old-key', baseUrl: 'https://images.example.com', model: 'chosen-model' }, replicate: { apiKey: 'other-key' },
  } });
  const otherBefore = (await f.repo.listByWorkspaceId('ws-t10')).find(r => r.providerId === 'replicate');
  const { pending, emitted, html } = await form(f);
  assert.match(html, /Connect OpenAI/); assert.match(html, /name="apiKey"[^>]*type="password"|type="password"[^>]*name="apiKey"/);
  assert.match(html, /credential_save/); assert.match(html, /exchange-t10/); assertNoSecret(emitted);
  assert.deepEqual(f.surfaces.deliver({ exchangeId: 'exchange-t10', principalId: 'intruder', params: { apiKey: SECRET } }, { toolId: 'credential_save' }), { ok: false, reason: 'binding-mismatch' });
  submit(f, { apiKey: SECRET, provider: 'replicate' }); // provider identity is bound, not taken from the browser.
  assert.deepEqual(await pending, { saved: true, provider: 'openai', configured: true, tokenHint: { length: 27, last4: '-731' }, connection: 'not_tested', message: '…-731, 27 chars. Saved, not tested.' });
  assert.deepEqual(await resolveMediaProviderCredential({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'openai' }),
    { apiKey: SECRET, baseUrl: 'https://images.example.com', model: 'chosen-model' });
  assert.deepEqual((await f.repo.listByWorkspaceId('ws-t10')).find(r => r.providerId === 'replicate'), otherBefore);
  assert.equal(f.surfaces.size(), 0); assert.equal(emitted.length, 2); assertNoSecret(emitted);
});

test('t10 media decline has no writes and returns saved false', async () => {
  const f = fixture(); const { pending } = await form(f);
  submit(f, { [SURFACE_DISMISSED_PARAM]: true, apiKey: SECRET });
  assert.deepEqual(await pending, { saved: false, provider: 'openai', configured: false });
  assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []); assert.equal(f.surfaces.size(), 0);
});

test('t10 media both tools deny permission before reading or opening a form', async () => {
  const f = fixture(false); f.repo.listByWorkspaceId = async () => assert.fail('unauthorized read');
  for (const [id, permission, input] of [['media_list_providers', 'media.read', {}], ['credential_save', 'admin.integrations.manage', { provider: 'openai' }]] as const) {
    await assert.rejects(f.call(id, input, { emitSurface: async () => assert.fail('unauthorized form') }),
      { message: `principal 'person' is not authorized for '${permission}' (insufficient_permission)` });
  }
  assert.equal(f.surfaces.size(), 0);
});

test('t10 media rejects extra model fields and unsupported providers before a form', async () => {
  const f = fixture();
  await assert.rejects(f.call('credential_save', { provider: 'openai', apiKey: SECRET }),
    { message: 'media_propose_provider_credential accepts only provider and reason; enter the key in the human form.' });
  await assert.rejects(f.call('credential_save', { provider: 'not-a-provider' }),
    { message: 'Unknown media provider. Call media_list_providers for supported provider ids.' });
});

test('t10 media fails closed without a surface channel or after abort', async () => {
  const f = fixture();
  await assert.rejects(f.call('credential_save', { provider: 'openai' }),
    { message: 'media_propose_provider_credential requires an interactive form channel. Nothing was saved.' });
  const controller = new AbortController(); const { pending } = await form(f, { signal: controller.signal }); controller.abort();
  assert.deepEqual(await pending, { saved: false, provider: 'openai', configured: false });
  assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []); assert.equal(f.surfaces.size(), 0);
});

for (const key of ['', '   ', 42]) test(`t10 media malformed submitted key ${JSON.stringify(key)} saves nothing`, async () => {
  const f = fixture(); const { pending } = await form(f); submit(f, { apiKey: key });
  assert.deepEqual(await pending, { saved: false, provider: 'openai', configured: false, message: 'Enter a token. Spaces alone are not a token.' });
  assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []);
});

test('t10 media raw save errors containing the key never reach the model or outcome surface', async () => {
  const f = fixture(); f.repo.replaceWorkspace = async () => { throw new Error(`driver echoed ${SECRET}`); };
  const { pending, emitted } = await form(f); submit(f, { apiKey: SECRET });
  const result = await pending; assert.deepEqual(result, { saved: false, provider: 'openai', configured: false });
  assertNoSecret(result); assertNoSecret(emitted); assert.equal(f.surfaces.size(), 0);
});

test('t10 media expired form closes without saving', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(true, { idleTtlMs: 5 }); const { pending } = await form(f);
  t.mock.timers.tick(5);
  assert.deepEqual(await pending, { saved: false, provider: 'openai', configured: false });
  assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []); assert.equal(f.surfaces.size(), 0);
});

test('t10 media initial emission failure releases the exchange', async () => {
  const f = fixture();
  await assert.rejects(f.call('credential_save', { provider: 'openai' }, { emitSurface: async () => { throw new Error('surface unavailable'); } }), { message: 'surface unavailable' });
  assert.equal(f.surfaces.size(), 0); assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []);
});

test('t10 media failed outcome emission still returns the persisted safe result', async () => {
  const f = fixture(); let ready!: () => void;
  const raised = new Promise<void>(resolve => { ready = resolve; });
  let emissions = 0;
  const pending = f.call('credential_save', { provider: 'openai' }, { emitSurface: async () => {
    emissions += 1;
    if (emissions === 1) ready();
    else throw new Error('human closed the tab');
  } });
  await Promise.race([raised, pending.then(() => assert.fail('call returned without a form'))]);
  submit(f, { apiKey: SECRET });
  const result = await pending;
  assert.deepEqual(result, { saved: true, provider: 'openai', configured: true, tokenHint: { length: 27, last4: '-731' }, connection: 'not_tested', message: '…-731, 27 chars. Saved, not tested.' });
  assertNoSecret(result);
  assert.deepEqual(await resolveMediaProviderCredential({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'openai' }), { apiKey: SECRET, baseUrl: null, model: null });
  assert.equal(emissions, 2); assert.equal(f.surfaces.size(), 0);
});


test('t10 media generation missing key names the human setup tool in its refusal', async () => {
  const f = fixture();
  const deps = { ...f.deps, env: {}, generateMedia: async () => assert.fail('missing credential must not call a vendor') } as unknown as MediaGenerationToolDeps;
  const registration = buildMediaGenerationRegistrations(deps).find(r => r.descriptor.id === 'media_generate_asset'); assert.ok(registration);
  const result = await invokeFixtureHandler(registration, { executionId: 'exec', principal: { id: 'person' }, run: { id: 'run' },
    input: { prompt: 'Cover image', model: 'gpt-image-2' }, signal: new AbortController().signal }) as { generated: boolean; credentialSetup: unknown };
  assert.equal(result.generated, false);
  assert.deepEqual(result.credentialSetup, {
    setupToolId: 'credential_save', remedyToolId: 'credential_save', prefill: { kind: 'media-provider', target: 'openai' },
    hint: 'A missing or rejected credential may be fixed by saving it through the secure card.',
  });
});

test('t10 media saving while a different provider rotates preserves the latest ciphertext and current metadata', async () => {
  const f = fixture(); const { pending } = await form(f);
  await saveMediaProviderCredentials(f.writeDeps, { workspaceId: 'ws-t10', providers: {
    openai: { apiKey: 'previous-key', baseUrl: 'https://new-images.example.com', model: 'latest-model' }, replicate: { apiKey: 'concurrent-key' },
  } });
  const otherBefore = (await f.repo.listByWorkspaceId('ws-t10')).find(r => r.providerId === 'replicate');
  submit(f, { apiKey: SECRET });
  assert.deepEqual(await pending, { saved: true, provider: 'openai', configured: true, tokenHint: { length: 27, last4: '-731' }, connection: 'not_tested', message: '…-731, 27 chars. Saved, not tested.' });
  assert.deepEqual((await f.repo.listByWorkspaceId('ws-t10')).find(r => r.providerId === 'replicate'), otherBefore);
  assert.deepEqual(await resolveMediaProviderCredential({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'openai' }),
    { apiKey: SECRET, baseUrl: 'https://new-images.example.com', model: 'latest-model' });
});

/** Supplies the fixture emitter through the canonical handler options, including headless calls. */
function invokeFixtureHandler(
  registration: import("@jini-ai/core").ToolRegistration,
  context: import("@jini-ai/core").ToolExecutionContext & { emitSurface?: import("@jini-ai/core").SurfaceEmitter },
) {
  const { emitSurface, ...required } = context;
  return registration.handler(required, emitSurface ? { emitSurface } : {});
}

test('an unimplemented media provider stays in the catalog and its save outcome names the limitation', async () => {
  const f = fixture(); const emitted: SurfaceEmission[] = [];
  let resolve!: () => void; const ready = new Promise<void>(done => { resolve = done; });
  const pending = f.call('credential_save', { provider: 'replicate' }, { emitSurface: async surface => { emitted.push(surface); resolve(); } });
  await ready; submit(f, { apiKey: SECRET });
  const result = await pending as { saved: boolean; message: string };
  assert.equal(result.saved, true);
  assert.equal(result.message, '…-731, 27 chars. Saved, not tested. Generation is not available yet for this provider.');
  const providers = await f.call('media_list_providers', {}) as { providers: Array<{ id: string; integrated: boolean }> };
  assert.equal(providers.providers.find(provider => provider.id === 'replicate')!.integrated, false);
  assert.equal(emitted.length, 2); assertNoSecret(result);
});

// Abort while sealing is pending must not commit a credential after the run ends.
test('t10 media abort during sealing writes nothing', async () => {
  const f = fixture();
  const controller = new AbortController();
  const seal = f.sealer.seal.bind(f.sealer);
  f.sealer.seal = async input => {
    const sealed = await seal(input);
    controller.abort();
    return sealed;
  };
  const { pending, emitted } = await form(f, { signal: controller.signal });
  submit(f, { apiKey: SECRET });
  assert.deepEqual(await pending, { saved: false, provider: 'openai', configured: false });
  assert.deepEqual(await f.repo.listByWorkspaceId('ws-t10'), []);
  assert.equal(emitted.length, 1);
  assert.equal(f.surfaces.size(), 0);
  assertNoSecret(emitted);
});
