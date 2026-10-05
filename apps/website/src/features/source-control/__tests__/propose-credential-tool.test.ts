/** t10: real human exchange and credential persistence; fake only the provider network boundary. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceEmission, SurfaceEmitter, ToolExecutionContext } from '@jini-ai/core';

/** Context fields a test call may override, plus the surface channel the handler receives separately. */
type CallExtra = Partial<ToolExecutionContext> & { emitSurface?: SurfaceEmitter };
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from '../../../contracts/core/tool-surface-exchanges.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { InMemorySourceControlCredentialSetRepo } from '../repo.memory.js';
import { listSourceControlCredentials, resolveDefaultForSourceControl } from '../store.js';
import { buildSourceControlRegistrations, sourceControlAgentToolCatalog, sourceControlDerivedRisk } from '../tool-registrations.js';
import { githubFromSource } from './fixtures/github-from-source.js';
import { isMcpUiToolCallAllowed, isMcpUiToolCallPermitted } from '../../../assistant/mcp-ui-tool-calls.js';
import type { Express, Request, Response } from 'express';
import { registerMcpUiToolCallsRoute, MCP_UI_TOOL_CALLS_PATH } from '../../../assistant/mcp-ui-tool-calls-route.js';
import { RUN_PRINCIPAL_HEADER } from '../../../assistant/run-ownership.js';
import { SURFACE_EXCHANGE_ID_PARAM } from '../../../contracts/core/tool-surface-exchanges.js';
import type { ToolExecutor } from '@jini-ai/daemon';
import { proposeSourceControlCredential, type SourceControlCredentialSetupDeps } from '../credential-setup.js';
import type { LoadedSourceControlProvider, LoadSourceControlProviders, SourceControlProviderDescriptor } from '../provider-registry.js';
import type { SourceControlProviderModule } from '../provider-module.js';

const ID = 'source_control_propose_credential';
const SECRET = 't10-source-secret-unique-982';
test('t10 source credential form submit and cancel pass both MCP-UI callback gates', () => {
  assert.equal(isMcpUiToolCallAllowed(ID), true);
  assert.equal(isMcpUiToolCallPermitted(ID, true), true);
  assert.equal(isMcpUiToolCallPermitted(ID, false), false, 'secrets must only answer a parked exchange, never enter a fresh audited tool call');
  assert.equal(isMcpUiToolCallAllowed('source_control_get_capabilities'), false);
});

test('t10 source callback delivers a human token only to its parked call, rejects wrong principals and replay', async () => {
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
    await handler({ body: { toolName: ID, params }, get: (header: string) => {
      assert.equal(header, RUN_PRINCIPAL_HEADER); return principal;
    } } as unknown as Request, response as unknown as Response);
    return { status, body };
  }
  assert.deepEqual(await callback('person', { label: 'Human label', token: SECRET }), { status: 403, body: {
    error: "'source_control_propose_credential' is not an MCP-UI-redeemable tool", code: 'TOOL_NOT_ALLOWLISTED',
  } });
  const params = { [SURFACE_EXCHANGE_ID_PARAM]: 'source-exchange-t10', label: 'Human label', token: SECRET };
  assert.deepEqual(await callback('intruder', params), { status: 409, body: {
    error: 'that dialog is no longer waiting for an answer', code: 'SURFACE_NOT_PENDING', reason: 'binding-mismatch',
  } });
  assert.deepEqual(await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' }), []);
  assert.deepEqual(await callback('person', params), { status: 202, body: { delivered: true } });
  const result = await pending;
  assert.deepEqual(result, { saved: true, credentialId: 'credential-t10', provider: 'github', label: 'Human label' });
  assertNoSecret(result); assertNoSecret(emitted);
  assert.equal((await resolveDefaultForSourceControl({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'github' }))?.connection.token, SECRET);
  assert.deepEqual(await callback('person', params), { status: 409, body: {
    error: 'that dialog is no longer waiting for an answer', code: 'SURFACE_NOT_PENDING', reason: 'unknown-or-closed',
  } });
  assert.equal(f.surfaces.size(), 0);
});
function fixture(allowed = true, exchangeOptions: Parameters<typeof createSurfaceExchangeStore>[0] = {}) {
  const repo = new InMemorySourceControlCredentialSetRepo(); const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring); const auth: unknown[] = [];
  const deps = { workspaceId: 'ws-t10', sourceControlCredentialSetRepo: repo, siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring, clock: { nowMs: () => Date.parse('2026-10-01T00:00:00.000Z'), nowIso: () => '2026-10-01T00:00:00.000Z' }, idGen: { newId: () => 'credential-t10' },
    sourceControlExportRootDir: '/unused', exportSiteBound: async () => assert.fail('setup must not export'),
    loadSourceControlProviders: githubFromSource,
    fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://api.github.com/user');
      assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${SECRET}`);
      return new Response(JSON.stringify({ login: 't10-owner' }), { status: 200 });
    }) as typeof fetch,
    authorize: async (input: unknown) => { auth.push(input); return { allowed, reason: allowed ? 'matched' : 'insufficient_permission' }; } };
  const surfaces = createSurfaceExchangeStore({ ...exchangeOptions, newExchangeId: () => 'source-exchange-t10' });
  const registrations = buildSourceControlRegistrations(deps, { surfaceExchanges: surfaces });
  function tool() { const found = registrations.find(r => r.descriptor.id === ID); assert.ok(found, `expected '${ID}' to be wired`); return found; }
  function call(input: unknown, extra: CallExtra = {}) { return invokeFixtureHandler(tool(), { executionId: 'exec', principal: { id: 'person' }, run: { id: 'run' }, input, signal: new AbortController().signal, ...extra }); }
  return { repo, sealer, deps, surfaces, call, auth, tool };
}
async function form(f: ReturnType<typeof fixture>, extra: CallExtra = {}) {
  const emitted: SurfaceEmission[] = []; let raised!: () => void;
  const ready = new Promise<void>(resolve => { raised = resolve; });
  const pending = f.call({ provider: 'github', label: 'My backup connection' }, { emitSurface: async s => { emitted.push(s); raised(); }, ...extra });
  await Promise.race([ready, pending.then(() => assert.fail('call returned without a form'))]);
  return { pending, emitted, html: (emitted[0]!.payload as { resource: { resource: { text: string } } }).resource.resource.text };
}
function submit(f: ReturnType<typeof fixture>, params: Record<string, unknown>) {
  assert.deepEqual(f.surfaces.deliver({ exchangeId: 'source-exchange-t10', toolId: ID, principalId: 'person', params }), { ok: true });
}
function assertNoSecret(value: unknown) { assert.equal(JSON.stringify(value).includes(SECRET), false, 'model/surface output contains submitted secret'); }

test('t10 source registration uses credential write permission, durable risk and exact non-secret model fields', () => {
  const f = fixture(); const entry = sourceControlAgentToolCatalog.find(t => t.name === ID); assert.ok(entry, 'source credential catalog entry exists');
  assert.equal(entry.authorization.permission, 'source-control.credentials.write'); assert.equal(entry.sideEffects, 'mutates-durable-state');
  assert.equal(sourceControlDerivedRisk.get(ID), 'mutates-durable-state'); assert.equal(f.tool().descriptor.readOnly, false);
  assert.deepEqual(Object.keys((entry.inputSchema as any).properties).sort(), ['label', 'provider']);
  assert.equal(entry.inputSchema!.additionalProperties, false);
});

test('t10 source form uses the provider declared masked field; submit saves a usable default and returns exact safe keys', async () => {
  const f = fixture(); const { pending, emitted, html } = await form(f);
  assert.match(html, /Connect GitHub/); assert.match(html, /My backup connection/);
  assert.match(html, /name="token"[^>]*type="password"|type="password"[^>]*name="token"/);
  assert.match(html, /source_control_propose_credential/); assert.match(html, /source-exchange-t10/); assertNoSecret(emitted);
  assert.deepEqual(f.surfaces.deliver({ exchangeId: 'source-exchange-t10', toolId: ID, principalId: 'intruder', params: { token: SECRET } }), { ok: false, reason: 'binding-mismatch' });
  submit(f, { label: 'Human chosen label', token: SECRET, providerId: 'gitlab' });
  const result = await pending;
  assert.deepEqual(result, { saved: true, credentialId: 'credential-t10', provider: 'github', label: 'Human chosen label' });
  assertNoSecret(result); assertNoSecret(emitted);
  const stored = await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' });
  assert.equal(stored.length, 1); assert.equal(stored[0]!.label, 'Human chosen label'); assert.equal(stored[0]!.isDefault, true); assert.equal(stored[0]!.accountLabel, 't10-owner');
  const resolved = await resolveDefaultForSourceControl({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'github' });
  assert.ok(resolved); assert.equal(resolved.connection.token, SECRET); assert.equal(resolved.connection.providerId, 'github');
  assert.equal(f.surfaces.size(), 0); assert.equal(emitted.length, 2);
  assert.deepEqual(f.auth, [{ principalId: 'person', permission: 'source-control.credentials.write', workspaceId: 'ws-t10', entityType: 'source-control' }]);
});

test('t10 source cancellation returns saved false with no credential', async () => {
  const f = fixture(); const { pending } = await form(f); submit(f, { [SURFACE_DISMISSED_PARAM]: true, token: SECRET });
  assert.deepEqual(await pending, { saved: false, credentialId: null, provider: 'github', label: 'My backup connection' });
  assert.deepEqual(await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' }), []); assert.equal(f.surfaces.size(), 0);
});

test('t10 source permission denied opens no surface and does not read credentials', async () => {
  const f = fixture(false); f.repo.listByProvider = async () => assert.fail('unauthorized store access');
  f.deps.loadSourceControlProviders = async () => assert.fail('unauthorized provider lookup');
  await assert.rejects(f.call({ provider: 'github' }, { emitSurface: async () => assert.fail('unauthorized form') }),
    { message: "principal 'person' is not authorized for 'source-control.credentials.write' (insufficient_permission)" });
  assert.equal(f.surfaces.size(), 0);
});

test('t10 source failed outcome emission still returns the persisted safe result', async () => {
  const f = fixture(); let ready!: () => void;
  const raised = new Promise<void>(resolve => { ready = resolve; });
  let emissions = 0;
  const pending = f.call({ provider: 'github' }, { emitSurface: async () => {
    emissions += 1;
    if (emissions === 1) ready();
    else throw new Error('human closed the tab');
  } });
  await Promise.race([raised, pending.then(() => assert.fail('call returned without a form'))]);
  submit(f, { label: 'Saved despite closed tab', token: SECRET });
  const result = await pending;
  assert.deepEqual(result, { saved: true, credentialId: 'credential-t10', provider: 'github', label: 'Saved despite closed tab' });
  assertNoSecret(result);
  const resolved = await resolveDefaultForSourceControl({ repo: f.repo, sealer: f.sealer }, { workspaceId: 'ws-t10', providerId: 'github' });
  assert.equal(resolved?.connection.token, SECRET);
  assert.equal(emissions, 2); assert.equal(f.surfaces.size(), 0);
});

test('t10 source rejects unexpected model fields and unavailable hosts with exact actionable refusals', async () => {
  const f = fixture();
  await assert.rejects(f.call({ provider: 'github', token: SECRET }),
    { message: 'source_control_propose_credential accepts only provider and label; enter secrets in the human form.' });
  await assert.rejects(f.call({ provider: 'unknown' }),
    { message: 'No enabled source control provider declares this credential form. Call source_control_get_capabilities for available hosts.' });
});

test('t10 source missing channel and abort fail closed', async () => {
  const f = fixture();
  await assert.rejects(f.call({ provider: 'github' }), { message: 'source_control_propose_credential requires an interactive form channel. Nothing was saved.' });
  const controller = new AbortController(); const { pending } = await form(f, { signal: controller.signal }); controller.abort();
  assert.deepEqual(await pending, { saved: false, credentialId: null, provider: 'github', label: 'My backup connection' });
  assert.deepEqual(await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' }), []); assert.equal(f.surfaces.size(), 0);
});

for (const token of ['', 42]) test(`t10 source malformed submitted token ${JSON.stringify(token)} saves nothing`, async () => {
  const f = fixture(); const { pending } = await form(f); submit(f, { label: 'New connection', token });
  assert.deepEqual(await pending, { saved: false, credentialId: null, provider: 'github', label: 'My backup connection' });
  assert.deepEqual(await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' }), []);
});

test('t10 source raw save errors containing the secret never reach model or surface', async () => {
  const f = fixture(); f.repo.insert = async () => { throw new Error(`db echoed ${SECRET}`); };
  const { pending, emitted } = await form(f); submit(f, { label: 'New connection', token: SECRET });
  const result = await pending;
  assert.deepEqual(result, { saved: false, credentialId: null, provider: 'github', label: 'My backup connection' });
  assertNoSecret(result); assertNoSecret(emitted); assert.equal(f.surfaces.size(), 0);
});

test('t10 source commit without a credential names the setup tool', async () => {
  const f = fixture();
  const registration = buildSourceControlRegistrations(f.deps, { surfaceExchanges: f.surfaces }).find(r => r.descriptor.id === 'source_control_execute_commit'); assert.ok(registration);
  assert.deepEqual(await invokeFixtureHandler(registration, { executionId: 'exec', principal: { id: 'person' }, run: { id: 'run' },
    input: { provider: 'github', owner: 't10-owner', repo: 'site', commitMessage: 'Backup' }, signal: new AbortController().signal }),
    { committed: false, reason: 'no-credential', message: 'No GitHub source control credential is configured for this workspace. Call source_control_propose_credential to open a human credential form before committing.' });
});

test('t10 source expired form closes without saving', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(true, { idleTtlMs: 5 }); const { pending } = await form(f); t.mock.timers.tick(5);
  assert.deepEqual(await pending, { saved: false, credentialId: null, provider: 'github', label: 'My backup connection' });
  assert.deepEqual(await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' }), []); assert.equal(f.surfaces.size(), 0);
});

test('t10 source initial emission failure releases the exchange', async () => {
  const f = fixture();
  await assert.rejects(f.call({ provider: 'github' }, { emitSurface: async () => { throw new Error('surface unavailable'); } }), { message: 'surface unavailable' });
  assert.equal(f.surfaces.size(), 0); assert.deepEqual(await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' }), []);
});

/** Supplies the fixture emitter through the canonical handler options, including headless calls. */
function invokeFixtureHandler(
  registration: import("@jini-ai/core").ToolRegistration,
  context: import("@jini-ai/core").ToolExecutionContext & { emitSurface?: import("@jini-ai/core").SurfaceEmitter },
) {
  const { emitSurface, ...required } = context;
  return registration.handler(required, emitSurface ? { emitSurface } : {});
}

/** A hand-written registry serving one host whose form has no help text and a non-secret field, and
 *  whose module learns the account label without any network call. */
function bitbucketRegistry(onLoad: () => void = () => {}): LoadSourceControlProviders {
  const descriptor: SourceControlProviderDescriptor = { id: 'bitbucket', label: 'Bitbucket', apiOrigin: 'https://api.bitbucket.org', module: './module.mjs',
    credential: { tokenField: 'token', fields: [{ name: 'token', label: 'App password', required: true, secret: true }, { name: 'username', label: 'Username', required: true }] } };
  const module = { create: () => ({ readAccountLabel: async () => 'bb-owner' }) } as unknown as SourceControlProviderModule;
  const loaded: LoadedSourceControlProvider = { descriptor, pluginId: 'bitbucket-plugin', module };
  return async () => { onLoad(); return { list: () => [loaded], get: id => (id === 'bitbucket' ? loaded : undefined), refusals: [] }; };
}
function directDeps(f: ReturnType<typeof fixture>, load: LoadSourceControlProviders): SourceControlCredentialSetupDeps {
  const { fetchFn: _unused, ...rest } = f.deps;
  return { ...rest, loadSourceControlProviders: load };
}
function directCall(f: ReturnType<typeof fixture>, deps: SourceControlCredentialSetupDeps, input: unknown, extra: Partial<ToolExecutionContext> = {}, emitSurface?: (s: SurfaceEmission) => Promise<void>) {
  return proposeSourceControlCredential({ ctx: { executionId: 'exec', principal: { id: 'person' }, run: { id: 'run' }, input, signal: new AbortController().signal, ...extra }, deps, surfaces: { surfaceExchanges: f.surfaces } }, emitSurface ? { emitSurface } : {});
}

test('t10 source label over 200 characters is refused before any permission check or provider load', async () => {
  const f = fixture(); const deps = directDeps(f, async () => assert.fail('no provider lookup for an invalid label'));
  await assert.rejects(directCall(f, deps, { provider: 'github', label: 'x'.repeat(201) }), { message: 'Credential label must be at most 200 characters.' });
  assert.deepEqual(f.auth, []);
});

test('t10 source pre-aborted call returns declined without loading providers or opening a form', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  const deps = directDeps(f, async () => assert.fail('aborted call must not load providers'));
  assert.deepEqual(await directCall(f, deps, { provider: 'github' }, { signal: controller.signal }, async () => assert.fail('aborted call must not open a form')),
    { saved: false, credentialId: null, provider: 'github', label: 'default' });
  assert.equal(f.surfaces.size(), 0);
});

test('t10 source call aborted while providers load returns declined and opens no form', async () => {
  const f = fixture(); const controller = new AbortController();
  const deps = directDeps(f, bitbucketRegistry(() => controller.abort()));
  assert.deepEqual(await directCall(f, deps, { provider: 'bitbucket', label: 'Team' }, { signal: controller.signal }, async () => assert.fail('aborted call must not open a form')),
    { saved: false, credentialId: null, provider: 'bitbucket', label: 'Team' });
  assert.equal(f.surfaces.size(), 0);
});

test('t10 source form without provider help shows the default hint, renders non-secret fields as text, saves with no injected fetch', async () => {
  const f = fixture(); const emitted: SurfaceEmission[] = []; let raised!: () => void;
  const ready = new Promise<void>(resolve => { raised = resolve; });
  const pending = directCall(f, directDeps(f, bitbucketRegistry()), { provider: 'bitbucket' }, {}, async s => { emitted.push(s); raised(); });
  await ready;
  const html = (emitted[0]!.payload as { resource: { resource: { text: string } } }).resource.resource.text;
  assert.match(html, /Type the secret here\. The assistant never sees it\./);
  assert.match(html, /name="token"[^>]*type="password"|type="password"[^>]*name="token"/);
  assert.doesNotMatch(html, /name="username"[^>]*type="password"|type="password"[^>]*name="username"/);
  assert.match(html, /name="username"/);
  submit(f, { label: 'Team', token: SECRET, username: 'bb-user' });
  assert.deepEqual(await pending, { saved: true, credentialId: 'credential-t10', provider: 'bitbucket', label: 'Team' });
  const stored = await listSourceControlCredentials({ repo: f.repo }, { workspaceId: 'ws-t10' });
  assert.equal(stored[0]!.accountLabel, 'bb-owner');
});
