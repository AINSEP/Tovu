import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { chooseApiConnectionDestination } from '../../connect-destination.js';

function fixture() {
  let id = 0;
  const timers = new Set<() => void>();
  const exchanges = createSurfaceExchangeStore({ clock: { nowMs: () => 0, nowIso: () => '2026-11-05T00:00:00Z' },
    idGenerator: { newId: () => `destination-${++id}` }, defaultChannel: 'mcp-ui',
    scheduler: { schedule: ({ callback }) => { timers.add(callback); return () => { timers.delete(callback); }; } } });
  const ctx = { executionId: 'execution', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal };
  return { required: { surfaces: { surfaceExchanges: exchanges }, ctx, pluginDisplayName: 'Office', available: true }, timers,
    deliver: (params: Record<string, unknown>, principalId = 'owner') => exchanges.deliver({ exchangeId: `destination-${id}`, principalId, params }, { toolId: 'agent_plugin_connect', channel: 'mcp-ui' }) };
}

test('local-only hosts retain their existing sign-in without a choice card', async () => {
  const f = fixture();
  assert.equal(await chooseApiConnectionDestination({ ...f.required, available: false }), 'site');
});

test('shared destination comes only from a principal-bound human answer and cannot be replayed', async () => {
  const f = fixture();
  const selected = await chooseApiConnectionDestination(f.required, { emitSurface: async emission => {
    assert.match(JSON.stringify(emission), /Save this connection on this Mac/);
    assert.equal(f.deliver({ destination: 'shared' }, 'other-person').ok, false);
    assert.equal(f.deliver({ destination: 'shared' }).ok, true);
  } });
  assert.equal(selected, 'shared');
  assert.equal(f.deliver({ destination: 'shared' }).ok, false);
});

for (const params of [{ destination: 'shared', siteId: 'other-site' }, { destination: 'shared', credentialId: 'guessed' }, { destination: 'unknown' }, { destination: ['shared'] }]) {
  test(`unoffered or forged destination answer ${JSON.stringify(params)} is refused`, async () => {
    const f = fixture();
    await assert.rejects(chooseApiConnectionDestination(f.required, { emitSurface: async () => { f.deliver(params); } }), /Choose where to save/);
  });
}

test('cancel and expiry start no authorization', async () => {
  for (const expired of [false, true]) {
    const f = fixture();
    const selected = await chooseApiConnectionDestination(f.required, { emitSurface: async () => {
      if (expired) [...f.timers][0]!(); else f.deliver({ __dismissed: true });
    } });
    assert.equal(selected, null);
  }
});
