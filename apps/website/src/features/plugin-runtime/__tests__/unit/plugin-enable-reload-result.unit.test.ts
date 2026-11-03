import assert from 'node:assert/strict';
import test from 'node:test';
import { answerCard, harness } from '../fixtures/plugins-tool-harness.js';

test('enabling an Agent Plugin tells the assistant that tool discovery refreshes without a restart', async () => {
  const h = harness({ confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges,
    input: { family: 'agent-plugin', pluginId: 'higgsfield', enabled: true }, decision: 'confirm' });
  const result = await outcome as { changed: boolean; restartRequired: boolean; note: string };
  assert.equal(result.changed, true);
  assert.equal(result.restartRequired, false);
  assert.ok(result.note.includes('Tool discovery refreshes without restarting'));
});
