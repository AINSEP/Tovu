import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { askAgentPluginChoice, ASK_CHOICE_TOOL_ID } from '../ask-choice-tool.js';

const match = { id: 'offered', name: 'Offered', why: 'Matches the request' };
function fixture() {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  return { surfaceExchanges, principalId: 'alice', workspaceId: 'site', conversationId: 'chat', preferenceRevisionSeq: 4, selected: [] as string[] };
}
function answer(f: ReturnType<typeof fixture>, emission: { payload: Readonly<Record<string, unknown>> }, params: Record<string, unknown>) {
  const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
  const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
  assert.ok(exchangeId);
  assert.equal(f.surfaceExchanges.deliver({ exchangeId, principalId: 'alice', params }, { toolId: ASK_CHOICE_TOOL_ID }).ok, true);
  return html;
}

test('automatic plugin access verifies the active person before disclosure and after one bound choice', async () => {
  const f = fixture();
  const events: string[] = [];
  const result = await askAgentPluginChoice({ ...f, surfaces: { surfaceExchanges: f.surfaceExchanges, assertAccessApprover: async input => {
    assert.deepEqual(input, { toolId: ASK_CHOICE_TOOL_ID, principalId: 'alice' }); events.push('verify');
  } }, matches: [match], signal: new AbortController().signal, emitSurface: async emission => {
    if (emission.channel === 'user_message') { events.push('receipt'); return; }
    events.push('card');
    const html = answer(f, emission, { __choiceAction: 'auto', selections: ['offered'] });
    assert.match(html, /Don't ask again|Don&#39;t ask again/);
    assert.match(html, /Auto/);
    assert.match(html, /this site/);
    assert.match(html, /data-mcpui-action="confirm" data-agent-private disabled/);
    assert.match(html, /data-mcpui-action="auto" data-agent-private disabled/);
    assert.match(html, /var DWELL_MS = 1500/);
    assert.match(html, /Access details/);
    assert.match(html, /core\.interface\.chatAgentPlugins/);
    assert.match(html, /&quot;revision&quot;: &quot;4&quot;/);
  } });
  assert.deepEqual(result, { action: 'auto', selected: ['offered'] });
  assert.deepEqual(events, ['verify', 'card', 'verify', 'receipt']);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('automatic plugin access refuses absent verification before opening a card', async () => {
  const f = fixture();
  await assert.rejects(askAgentPluginChoice({ ...f, surfaces: { surfaceExchanges: f.surfaceExchanges }, matches: [match], signal: new AbortController().signal,
    emitSurface: async emission => { if (emission.channel === 'mcp-ui') answer(f, emission, { __dismissed: true }); },
  }), /verify the person/);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('automatic plugin access refuses a revoked person after clicking without returning a grant', async () => {
  const f = fixture();
  let reads = 0;
  await assert.rejects(askAgentPluginChoice({ ...f, surfaces: { surfaceExchanges: f.surfaceExchanges, assertAccessApprover: async () => {
    if (++reads === 2) throw new Error('The signed-in person is no longer active');
  } }, matches: [match], signal: new AbortController().signal, emitSurface: async emission => {
    if (emission.channel === 'mcp-ui') answer(f, emission, { __choiceAction: 'auto', selections: ['offered'] });
  } }), /no longer active/);
  assert.equal(reads, 2);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('automatic plugin access enforces the common disclosure byte limit before showing a card', async () => {
  const f = fixture();
  await assert.rejects(askAgentPluginChoice({ ...f, surfaces: { surfaceExchanges: f.surfaceExchanges, assertAccessApprover: async () => {} },
    matches: [{ ...match, why: 'x'.repeat(128 * 1024) }], signal: new AbortController().signal,
    emitSurface: async emission => { if (emission.channel === 'mcp-ui') answer(f, emission, { __dismissed: true }); },
  }), /128 KiB/);
  assert.equal(f.surfaceExchanges.size(), 0);
});
