/** C3 / copyplan-REVIEW: principal-bound copy cards call C2, never handle secret values. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceEmission } from '@jini-ai/core';
import { createFakeClock } from '#src/__tests__/support/fake-clock';
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from '@jini-ai/daemon/surface-exchanges';
import type { UIResource } from '@jini-ai/ui/mcp-ui/surfaces';
import { isMcpUiToolCallPermitted } from '../../../assistant/mcp-ui-tool-calls.js';
import { buildCredentialCopyRegistrations, CREDENTIAL_COPY_TOOL_ID, type CredentialCopyToolDeps } from '../credential-copy-tool.js';

function fixture() {
  const timers = new Set<() => void>();
  let nextId = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ clock: createFakeClock({ startIso: '2026-10-11T00:00:00Z' }),
    idGenerator: { newId: () => `copy-${++nextId}` }, defaultChannel: 'mcp-ui',
    scheduler: { schedule: ({ callback }) => { timers.add(callback); return () => { timers.delete(callback); }; } } });
  let allow = true;
  let instanceAllow = true;
  const calls: unknown[] = [];
  const permissions: string[] = [];
  const sources = [{ siteId: 'source', name: 'Source', keys: [
    { kind: 'vendor' as const, id: 'one', label: 'OpenAI', provider: 'openai', last4: 'ABCD' },
    { kind: 'custom' as const, id: 'two', label: 'DNS', provider: null },
  ] }];
  const deps: CredentialCopyToolDeps = { workspaceId: 'target', ownerPrincipalId: Promise.resolve('owner'),
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: allow, reason: 'matched' }; },
    gatedMutations: { gatewayDeps: { authorizeInstance: async () => ({ allowed: instanceAllow, reason: 'matched' }) } },
    localCredentialCopy: { localHost: true, list: async () => sources,
      copy: async input => { calls.push(input); return [
        { kind: 'vendor', id: 'one', status: 'copied', last4: 'ABCD', token: 'secret-canary', sealed: 'ciphertext-canary' },
        { kind: 'custom', id: 'two', status: 'skipped', reasonCode: 'target-exists' },
      ]; } } };
  const tool = buildCredentialCopyRegistrations({ deps, surfaces: { surfaceExchanges } })[0]!;
  const emitted: SurfaceEmission[] = [];
  const controller = new AbortController();
  const run = (input: unknown = {}, principalId = 'owner', emit = true) => tool.handler({ executionId: 'exec',
    principal: { id: principalId }, run: { id: 'run' }, input, signal: controller.signal },
  emit ? { emitSurface: async emission => { emitted.push(emission); } } : {});
  const resource = () => (emitted.at(-1)!.payload as { resource: UIResource }).resource.resource;
  const answer = (params: Record<string, unknown>, principalId = 'owner') => surfaceExchanges.deliver({
    exchangeId: 'copy-1', principalId, params }, { toolId: CREDENTIAL_COPY_TOOL_ID, channel: 'mcp-ui' });
  return { deps, tool, sources, run, emitted, resource, answer, calls, permissions, surfaceExchanges, controller,
    deny: () => { allow = false; }, denyInstance: () => { instanceAllow = false; }, expire: () => { [...timers][0]!(); } };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function keys(f: ReturnType<typeof fixture>) {
  await turn();
  assert.deepEqual(f.answer({ sourceSiteId: 'source' }), { ok: true });
  await turn();
}

test('C3: one tool, exchange-only metadata, no direct model selection', async () => {
  const f = fixture();
  assert.equal(f.tool.descriptor.id, CREDENTIAL_COPY_TOOL_ID);
  assert.equal(isMcpUiToolCallPermitted(CREDENTIAL_COPY_TOOL_ID, true), true);
  assert.equal(isMcpUiToolCallPermitted(CREDENTIAL_COPY_TOOL_ID, false), false);
  for (const input of [{ sourceSiteId: 'source', ids: ['one'], overwrite: true }, { token: 'secret-canary' }, []]) {
    await assert.rejects(f.run(input), /human card/);
  }
  await assert.rejects(f.run({}, 'owner', false), /interactive/);
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.deepEqual(f.calls, []);
});

test('C3: source, unchecked keys/overwrite, masked outcomes replace one card; C2 receives exact selection', async () => {
  const f = fixture(); const pending = f.run(); await turn();
  const uri = f.resource().uri;
  assert.match(f.resource().text, /<select[^>]+name="sourceSiteId"/);
  assert.match(f.resource().text, /flex-direction:row/);
  assert.deepEqual(f.answer({ sourceSiteId: 'source' }, 'other'), { ok: false, reason: 'binding-mismatch' });
  await keys(f);
  assert.equal(f.resource().uri, uri);
  assert.match(f.resource().text, /OpenAI · openai · …ABCD/);
  assert.doesNotMatch(f.resource().text, /name="overwrite"[^>]* checked/);
  assert.match(f.resource().text, /justify-content:flex-end/);
  f.answer({ ids: ['one', 'two'], overwrite: false });
  const result = await pending;
  assert.deepEqual(f.calls, [{ sourceSiteId: 'source', ids: ['one', 'two'], overwrite: false, actorId: 'owner' }]);
  assert.deepEqual(result, { results: [{ kind: 'vendor', id: 'one', status: 'copied', last4: 'ABCD' },
    { kind: 'custom', id: 'two', status: 'skipped', reasonCode: 'target-exists' }] });
  assert.equal(f.resource().uri, uri);
  assert.match(f.resource().text, /copied ✓ …ABCD/);
  assert.match(f.resource().text, /skipped — already there/);
  assert.doesNotMatch(JSON.stringify({ result, emitted: f.emitted }), /secret-canary|ciphertext-canary/);
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.ok(f.permissions.length >= 3 && f.permissions.every(permission => permission === 'system.write'));
});

test('C3: forged source and mixed valid/forged keys fail the entire selection', async () => {
  const source = fixture(); const first = source.run(); await turn(); source.answer({ sourceSiteId: '../source' });
  assert.equal((await first as { reasonCode: string }).reasonCode, 'invalid-selection');
  for (const params of [{ ids: ['one', 'forged'], overwrite: false }, { ids: ['one', 'one'], overwrite: false },
    { ids: [], overwrite: false }, { ids: Array.from({ length: 101 }, () => 'one'), overwrite: false },
    { ids: ['one'], overwrite: 'true' }, { ids: ['one'], overwrite: false, sourceSiteId: 'other' }]) {
    const f = fixture(); const pending = f.run(); await keys(f); f.answer(params);
    assert.equal((await pending as { reasonCode: string }).reasonCode, 'invalid-selection');
    assert.deepEqual(f.calls, []);
  }
});

test('C3: owner, RBAC, instance and local capability are checked before discovery and after submit', async () => {
  const other = fixture(); await assert.rejects(other.run({}, 'admin'), /owner/);
  const remote = fixture(); remote.deps.localCredentialCopy!.localHost = false;
  await assert.rejects(remote.run(), /local/);
  for (const gate of ['deny', 'denyInstance', 'local'] as const) {
    const f = fixture(); const pending = f.run(); await keys(f);
    if (gate === 'local') f.deps.localCredentialCopy!.localHost = false; else f[gate]();
    f.answer({ ids: ['one'], overwrite: true });
    assert.equal((await pending as { reasonCode: string }).reasonCode, 'copy-refused');
    assert.deepEqual(f.calls, []);
    assert.equal(f.surfaceExchanges.size(), 0);
  }
});

test('C3: cancellation, expiry and abort during either step never copy', async () => {
  for (const atKeys of [false, true]) for (const ending of ['cancel', 'expire', 'abort'] as const) {
    const f = fixture(); const pending = f.run();
    if (atKeys) await keys(f); else await turn();
    if (ending === 'cancel') f.answer({ [SURFACE_DISMISSED_PARAM]: true });
    else if (ending === 'expire') f.expire(); else f.controller.abort();
    const result = await pending as { reasonCode: string };
    assert.equal(result.reasonCode, ending === 'cancel' ? 'cancelled' : ending === 'expire' ? 'expired' : 'abandoned');
    assert.deepEqual(f.calls, []);
    assert.equal(f.surfaceExchanges.size(), 0);
  }
});

test('C3: upgrade refusal uses the exact reviewed message, no legacy reader or copy', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.list = async () => [{ siteId: 'source', name: 'Source', keys: [], reasonCode: 'source-needs-upgrade',
    message: 'Start Source once in Tovu to upgrade it, then copy.' }];
  const pending = f.run(); await turn(); f.answer({ sourceSiteId: 'source' });
  assert.equal((await pending as { reasonCode: string }).reasonCode, 'source-needs-upgrade');
  assert.match(f.resource().text, /Start Source once in Tovu to upgrade it, then copy\./);
  assert.deepEqual(f.calls, []);
});

test('C3: C2 revision conflicts and missing keys stay safe; overwrite is explicit', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.copy = async input => { f.calls.push(input); return [
    { kind: 'vendor', id: 'one', status: 'failed', reasonCode: 'conflict' } ]; };
  const pending = f.run(); await keys(f); f.answer({ ids: ['one'], overwrite: true });
  assert.deepEqual(await pending, { results: [{ kind: 'vendor', id: 'one', status: 'failed', reasonCode: 'conflict' }] });
  assert.equal((f.calls[0] as { overwrite: boolean }).overwrite, true);
  for (const reasonCode of ['source-missing', undefined]) {
    const g = fixture(); g.deps.localCredentialCopy!.copy = async () => { throw Object.assign(new Error('secret-canary'), { reasonCode }); };
    const next = g.run(); await keys(g); g.answer({ ids: ['one'], overwrite: false });
    assert.equal((await next as { reasonCode: string }).reasonCode, reasonCode ?? 'copy-failed');
    assert.doesNotMatch(JSON.stringify(g.emitted), /secret-canary/);
  }
});

test('C3: abort before discovery, inventory exceptions and failed emission do not leak or leave an exchange', async () => {
  const aborted = fixture(); aborted.controller.abort();
  assert.deepEqual(await aborted.run(), { results: [], reasonCode: 'abandoned' });
  assert.equal(aborted.emitted.length, 0);
  const inventory = fixture(); inventory.deps.localCredentialCopy!.list = async () => { throw new Error('secret-canary'); };
  await assert.rejects(inventory.run(), error => error instanceof Error && !error.message.includes('secret-canary'));
  assert.equal(inventory.surfaceExchanges.size(), 0);
  const emission = fixture();
  await assert.rejects(emission.tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' },
    input: {}, signal: emission.controller.signal }, { emitSurface: async () => { throw new Error('disconnected'); } }), /disconnected/);
  assert.equal(emission.surfaceExchanges.size(), 0);
  assert.deepEqual(emission.calls, []);
});
