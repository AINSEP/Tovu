import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import { ToolInputError, type SurfaceEmission, type ToolExecutionContext } from '@jini-ai/core';
import { buildExternalMcpRegistrations } from '../tool-registrations.js';
import { InMemoryExternalMcpServerRepo } from '../external-mcp-store.memory.js';
import { buildExternalMcpSaveForm, mergeExternalMcpSavePrefill } from '../save-form.js';
import { externalMcpAccessSnapshot } from '../external-mcp-store.js';
import type { ExternalMcpServerRecord, ExternalMcpServerView } from '../contracts.js';
import type { ExternalMcpToolDeps } from '../deps.js';

const now = '2026-11-06T04:00:00.000Z';
const key = { workspaceId: 'access-save-site', serverId: 'source' };
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function source(): ExternalMcpServerRecord {
  return { ...key, label: 'Source', provisionedByPluginId: null, transport: 'streamable_http', authMode: 'none', enabled: false,
    command: null, url: 'https://example.test/mcp?token=synthetic-test-secret', args: null, allowedToolNames: '["read"]', writeAllowedToolNames: '[]',
    writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: null, sealedEnv: null,
    oauthProviderId: null, oauthGrant: null, oauthClientId: null, oauthEndpointsJson: null, oauthScopesJson: null,
    oauthStatus: null, oauthExpiresAt: null, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null,
    sealedOAuth: null, aadVersion: 1, oauthAadVersion: 1, createdAt: now, updatedAt: now };
}
async function fixture({ knownNames = ['read', 'write'], configuration = false, stdio = false }: { knownNames?: readonly string[] | null; configuration?: boolean; stdio?: boolean } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const original = { ...source(), ...(configuration ? { url: 'https://example.test/mcp', args: '[]' } : {}),
    ...(stdio ? { transport: 'stdio' as const, url: null, command: 'npx', args: '["-y","server a"]' } : {}) }; await repo.upsert(original);
  const controller = new AbortController();
  let permission = true;
  let approver = true;
  let checks = 0;
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'access-exchange' }, defaultChannel: 'mcp-ui' }),
    assertAccessApprover: async () => { checks += 1; if (!approver) throw new ToolInputError({ message: 'Signed-in access approver revoked' }); } };
  const deps = { workspaceId: key.workspaceId, clock: { nowMs: () => Date.parse(now) }, externalMcpServerRepo: repo,
    externalMcpKnownToolNames: ({ admissionRevision }: { admissionRevision: string }) => admissionRevision === externalMcpAccessSnapshot({ record: original }).admissionRevision ? knownNames : null,
    authorize: async () => ({ allowed: permission, reason: permission ? 'matched' : 'revoked' }) } as unknown as ExternalMcpToolDeps;
  const handler = buildExternalMcpRegistrations(deps, surfaces).find(entry => entry.descriptor.id === 'external_mcp_save')!.handler;
  const emissions: SurfaceEmission[] = [];
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'person' }, run: { id: 'chat' }, signal: controller.signal,
    input: { id: key.serverId, enabled: true, allowedToolNames: 'read, write', writeAllowedToolNames: 'write' } };
  if (configuration) Object.assign(ctx.input as Record<string, unknown>, { transport: stdio ? 'stdio' : 'streamable_http', label: 'Updated source' });
  const invoke = () => handler(ctx, { emitSurface: async emission => { emissions.push(emission); } });
  const answer = (params: Record<string, unknown>, principalId = 'person') => surfaces.surfaceExchanges.deliver({ exchangeId: 'access-exchange', principalId, params }, { toolId: 'external_mcp_save' });
  return { repo, original, ctx, controller, emissions, invoke, answer, revoke: () => { permission = false; }, revokeApprover: () => { approver = false; }, forgetCatalog: () => { knownNames = null; }, checks: () => checks, surfaces };
}

test('existing MCP access uses one fixed card and only the approved proposal is applied', async t => {
  const f = await fixture(); t.after(() => f.controller.abort());
  const pending = f.invoke(); await turn();
  assert.equal(f.emissions.length, 1);
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
  const html = JSON.stringify(f.emissions[0]);
  assert.match(html, /read/); assert.match(html, /write/);
  assert.match(html, /Source/); assert.match(html, /https:\/\/example\.test\/mcp/);
  assert.doesNotMatch(html, /synthetic-test-secret/);
  assert.doesNotMatch(html, /name=\\?"(?:allowedToolNames|writeAllowedToolNames)\\?"/);
  assert.deepEqual(f.answer({ decision: 'confirm' }, 'other-person'), { ok: false, reason: 'binding-mismatch' });
  (f.ctx.input as Record<string, unknown>).allowedToolNames = 'unreviewed';
  assert.deepEqual(f.answer({ decision: 'confirm', enabled: false, allowedToolNames: 'forged' }), { ok: true });
  const result = await pending as { saved: boolean }; assert.equal(result.saved, true);
  const saved = await f.repo.findByServerId(key);
  assert.equal(saved!.enabled, true); assert.equal(saved!.allowedToolNames, '["read","write"]');
  assert.equal(saved!.writeAllowedToolNames, '["write"]'); assert.equal(saved!.url, f.original.url);
  assert.deepEqual(f.answer({ decision: 'confirm' }), { ok: false, reason: 'unknown-or-closed' });
});

for (const decision of ['cancel', 'abort', 'stale', 'revoked'] as const) test(`${decision} performs no MCP access write`, async t => {
  const f = await fixture(); t.after(() => f.controller.abort());
  const pending = f.invoke(); await turn();
  let expected = f.original;
  if (decision === 'stale') { expected = { ...expected, allowedToolNames: '["other"]' }; await f.repo.upsert(expected); }
  if (decision === 'revoked') f.revoke();
  if (decision === 'abort') f.controller.abort(); else f.answer({ decision: decision === 'cancel' ? 'cancel' : 'confirm' });
  if (decision === 'stale' || decision === 'revoked') await assert.rejects(pending, /changed|authorized|revoked/i);
  else { const result = await pending as { saved: boolean }; assert.equal(result.saved, false); }
  assert.deepEqual(await f.repo.findByServerId(key), expected);
});


for (const knownNames of [null, ['read']] as const) test(`${knownNames === null ? 'missing' : 'incomplete'} frozen catalog refuses new names before a card or write`, async t => {
  const f = await fixture({ knownNames }); t.after(() => f.controller.abort());
  const pending = f.invoke(); void pending.catch(() => {}); await turn();
  if (f.emissions.length > 0) f.controller.abort();
  await assert.rejects(pending, /known|catalog|list|discover/i);
  assert.equal(f.emissions.length, 0);
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
});

test('enabling saved unknown names is widening and requires a verified catalog', async t => {
  const f = await fixture({ knownNames: null }); t.after(() => f.controller.abort());
  Object.assign(f.ctx.input as Record<string, unknown>, { enabled: true, allowedToolNames: 'read', writeAllowedToolNames: '' });
  const pending = f.invoke(); void pending.catch(() => {}); await turn();
  if (f.emissions.length > 0) f.controller.abort();
  await assert.rejects(pending, /known|catalog|list|discover/i);
  assert.equal(f.emissions.length, 0);
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
});

test('grant removals and disabling remain available without a cached catalog', async t => {
  const f = await fixture({ knownNames: null }); t.after(() => f.controller.abort());
  Object.assign(f.ctx.input as Record<string, unknown>, { enabled: false, allowedToolNames: '', writeAllowedToolNames: '' });
  const pending = f.invoke(); await turn();
  assert.equal(f.emissions.length, 1); f.answer({ decision: 'confirm' });
  assert.equal((await pending as { saved: boolean }).saved, true);
  assert.deepEqual((await f.repo.findByServerId(key))!.allowedToolNames, '[]');
});

test('credential setup discloses fixed grant lists without editable access fields', () => {
  const form = buildExternalMcpSaveForm({ save: { id: 'source', transport: 'streamable_http', authMode: 'static_env', allowedToolNames: 'read, write', writeAllowedToolNames: 'write' }, isUpdate: false });
  assert.ok(form.fields.some(field => field.name === 'accessToken'), 'credential entry stays available');
  assert.ok(form.fields.every(field => field.name !== 'allowedToolNames' && field.name !== 'writeAllowedToolNames'));
  const disclosure = JSON.stringify(form.details); assert.match(disclosure, /read, write/); assert.match(disclosure, /May write/);
});

for (const reason of ['catalog', 'approver'] as const) test(`configuration details still require current ${reason} before a card`, async t => {
  const f = await fixture({ configuration: true, knownNames: reason === 'catalog' ? null : ['read', 'write'] });
  t.after(() => f.controller.abort());
  if (reason === 'approver') f.revokeApprover();
  const pending = f.invoke(); void pending.catch(() => {}); await turn();
  if (f.emissions.length > 0) f.controller.abort();
  await assert.rejects(pending, /verified|approver|signed-in/i);
  assert.equal(f.emissions.length, 0);
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
});

for (const reason of ['catalog', 'approver', 'permission', 'source'] as const) test(`configuration save rechecks ${reason} after the card`, async t => {
  const f = await fixture({ configuration: true }); t.after(() => f.controller.abort());
  const pending = f.invoke(); await turn();
  assert.equal(f.emissions.length, 1);
  let expected = f.original;
  if (reason === 'catalog') f.forgetCatalog();
  if (reason === 'approver') f.revokeApprover();
  if (reason === 'permission') f.revoke();
  if (reason === 'source') { expected = { ...expected, url: 'https://other.example.test/mcp' }; await f.repo.upsert(expected); }
  f.answer({ url: f.original.url, label: 'Updated source' });
  const result = await pending as { saved: boolean; message?: string };
  assert.equal(result.saved, false);
  assert.match(result.message ?? '', /changed|current|permission|verified|signed-in|approval/i);
  assert.deepEqual(await f.repo.findByServerId(key), expected);
});

test('configuration approval keeps an explicitly disabled source disabled', async t => {
  const f = await fixture({ configuration: true }); t.after(() => f.controller.abort());
  Object.assign(f.ctx.input as Record<string, unknown>, { enabled: false, allowedToolNames: '', writeAllowedToolNames: '' });
  const pending = f.invoke(); await turn();
  assert.equal(f.emissions.length, 1);
  assert.match(JSON.stringify(f.emissions[0]), /Disabled/);
  f.answer({ url: f.original.url, label: 'Updated source', enabled: true });
  assert.equal((await pending as { saved: boolean }).saved, true);
  assert.equal((await f.repo.findByServerId(key))!.enabled, false);
  assert.equal(f.checks(), 2);
});

test('a configuration card cannot transfer known grants to a different target', async t => {
  const f = await fixture({ configuration: true }); t.after(() => f.controller.abort());
  const pending = f.invoke(); await turn();
  assert.equal(f.emissions.length, 1);
  f.answer({ url: 'https://other.example.test/mcp', label: 'Updated source' });
  assert.equal((await pending as { saved: boolean }).saved, false);
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
});

test('a card cannot keep known grants when a stdio connection changes its arguments', async t => {
  const f = await fixture({ configuration: true, stdio: true }); t.after(() => f.controller.abort());
  const pending = f.invoke(); await turn();
  f.answer({ command: 'npx', args: '-y other-server', label: 'Updated source' });
  assert.equal((await pending as { saved: boolean }).saved, false);
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
});

test('the card shows stored stdio arguments so an unchanged save, such as a token rotation, keeps target and grants', async t => {
  const prefilled = mergeExternalMcpSavePrefill({ id: key.serverId, transport: 'stdio' }, { args: ['-y', 'server a'], allowedToolNames: [], writeAllowedToolNames: [], oauth: { scopes: [] } } as unknown as ExternalMcpServerView);
  assert.equal(prefilled.args, '-y "server a"');
  const f = await fixture({ configuration: true, stdio: true }); t.after(() => f.controller.abort());
  const pending = f.invoke(); await turn();
  f.answer({ command: 'npx', args: prefilled.args, label: 'Updated source' });
  assert.equal((await pending as { saved: boolean }).saved, true);
  const saved = await f.repo.findByServerId(key);
  assert.equal(saved!.args, f.original.args);
  assert.equal(saved!.allowedToolNames, '["read","write"]');
  assert.equal(saved!.writeAllowedToolNames, '["write"]');
});

test('a disabled source without a catalog points to its usable connection settings', async t => {
  const f = await fixture({ knownNames: null }); t.after(() => f.controller.abort());
  const pending = f.invoke();
  await assert.rejects(pending, error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Settings → External MCP/);
    assert.match(error.message, /enable|turn on/i);
    assert.doesNotMatch(error.message, /external_mcp_get_admissions|external_mcp_probe_connection/);
    return true;
  });
  assert.equal(f.emissions.length, 0);
});

for (const phase of ['prepare', 'save'] as const) test(`approver read failures are not described as permission loss during ${phase}`, async t => {
  const f = await fixture({ configuration: true }); t.after(() => f.controller.abort());
  const failure = new Error('synthetic approver repository failure');
  const failRead = async () => { throw failure; };
  if (phase === 'prepare') f.surfaces.assertAccessApprover = failRead;
  const pending = f.invoke();
  if (phase === 'prepare') await assert.rejects(pending, error => error === failure);
  else {
    await turn();
    assert.equal(f.emissions.length, 1);
    f.surfaces.assertAccessApprover = failRead;
    f.answer({ url: f.original.url, label: 'Updated source' });
    const result = await pending as { saved: boolean; message?: string };
    assert.equal(result.saved, false);
    assert.doesNotMatch(result.message ?? '', /permission|approval|signed-in|no longer current/i);
  }
  assert.deepEqual(await f.repo.findByServerId(key), f.original);
});
