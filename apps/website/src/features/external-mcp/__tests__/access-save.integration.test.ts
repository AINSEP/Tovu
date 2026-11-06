import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import type { SurfaceEmission, ToolExecutionContext } from '@jini-ai/core';
import { buildExternalMcpRegistrations } from '../tool-registrations.js';
import { InMemoryExternalMcpServerRepo } from '../external-mcp-store.memory.js';
import { buildExternalMcpSaveForm } from '../save-form.js';
import type { ExternalMcpServerRecord } from '../contracts.js';
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
async function fixture() {
  const repo = new InMemoryExternalMcpServerRepo();
  const original = source(); await repo.upsert(original);
  const controller = new AbortController();
  let permission = true;
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'access-exchange' }, defaultChannel: 'mcp-ui' }),
    assertAccessApprover: async () => {} };
  const deps = { workspaceId: key.workspaceId, clock: { nowMs: () => Date.parse(now) }, externalMcpServerRepo: repo,
    authorize: async () => ({ allowed: permission, reason: permission ? 'matched' : 'revoked' }) } as unknown as ExternalMcpToolDeps;
  const handler = buildExternalMcpRegistrations(deps, surfaces).find(entry => entry.descriptor.id === 'external_mcp_save')!.handler;
  const emissions: SurfaceEmission[] = [];
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'person' }, run: { id: 'chat' }, signal: controller.signal,
    input: { id: key.serverId, enabled: true, allowedToolNames: 'read, write', writeAllowedToolNames: 'write' } };
  const invoke = () => handler(ctx, { emitSurface: async emission => { emissions.push(emission); } });
  const answer = (params: Record<string, unknown>, principalId = 'person') => surfaces.surfaceExchanges.deliver({ exchangeId: 'access-exchange', principalId, params }, { toolId: 'external_mcp_save' });
  return { repo, original, ctx, controller, emissions, invoke, answer, revoke: () => { permission = false; } };
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

test('credential setup discloses fixed grant lists without editable access fields', () => {
  const form = buildExternalMcpSaveForm({ save: { id: 'source', transport: 'streamable_http', authMode: 'static_env', allowedToolNames: 'read, write', writeAllowedToolNames: 'write' }, isUpdate: false });
  assert.ok(form.fields.some(field => field.name === 'accessToken'), 'credential entry stays available');
  assert.ok(form.fields.every(field => field.name !== 'allowedToolNames' && field.name !== 'writeAllowedToolNames'));
  const disclosure = JSON.stringify(form.details); assert.match(disclosure, /read, write/); assert.match(disclosure, /May write/);
});
