import assert from 'node:assert/strict';
import test from 'node:test';
import { askAgentPluginChoice, ASK_CHOICE_TOOL_ID } from '../ask-choice-tool.js';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';

for (const action of ['use', 'skip', 'auto'] as const) test(`plugin ask-choice: checked matching options and ${action} round trip`, async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const result = await askAgentPluginChoice({ surfaces: { surfaceExchanges }, principalId: 'alice', signal: new AbortController().signal,
    matches: [{ id: 'synthetic', name: 'Synthetic', why: 'Provides holography' }], emitSurface: async emission => {
      if (emission.channel === 'user_message') {
        assert.equal(emission.payload.text, `Agent plugins: ${action === 'skip' ? 'Declined' : 'Synthetic'}`);
        return;
      }
      const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
      assert.match(html, /Synthetic/);
      assert.match(html, /Provides holography/);
      const checkbox = html.match(/<input\b[^>]*value="synthetic"[^>]*>/)?.[0];
      assert.ok(checkbox, 'the matching plugin must have its own checkbox');
      assert.match(checkbox, /\bchecked(?:\s|>|=)/);
      assert.match(html, />Use</);
      assert.match(html, />Skip</);
      assert.match(html, /Don(?:&#39;|')t ask again/);
      const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
      assert.ok(exchangeId);
      const wrongPrincipal = surfaceExchanges.deliver({ exchangeId, principalId: 'bob', params: { __choiceAction: 'auto', selections: ['synthetic'] } }, { toolId: ASK_CHOICE_TOOL_ID });
      assert.equal(wrongPrincipal.ok, false);
      const delivered = surfaceExchanges.deliver({ exchangeId, principalId: 'alice', params: action === 'skip' ? { __dismissed: true } : { __choiceAction: action, selections: ['synthetic'] } }, { toolId: ASK_CHOICE_TOOL_ID });
      assert.equal(delivered.ok, true);
    } });
  assert.deepEqual(result, { action, selected: action === 'skip' ? [] : ['synthetic'] });
});

test('plugin ask-choice rejects an unoffered selection even with the Auto action', async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const result = await askAgentPluginChoice({ surfaces: { surfaceExchanges }, principalId: 'alice', signal: new AbortController().signal,
    matches: [{ id: 'offered', name: 'Offered', why: 'Matches' }], emitSurface: async emission => {
      const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
      const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
      assert.ok(exchangeId);
      assert.equal(surfaceExchanges.deliver({ exchangeId, principalId: 'alice', params: { __choiceAction: 'auto', selections: ['offered', 'unoffered'] } }, { toolId: ASK_CHOICE_TOOL_ID }).ok, true);
    } });
  assert.deepEqual(result, { action: 'skip', selected: [] });
  assert.equal(surfaceExchanges.size(), 0);
});
