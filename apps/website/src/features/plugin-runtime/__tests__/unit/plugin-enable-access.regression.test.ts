import assert from 'node:assert/strict';
import test from 'node:test';
import { answerCard, harness } from '../fixtures/plugins-tool-harness.js';

const input = { family: 'agent-plugin', pluginId: 'higgsfield', enabled: true } as const;
const details = [
  { label: 'External MCP source', value: 'media — https://mcp.example.test/mcp' },
  { label: 'Tools', value: 'models, generate' },
  { label: 'May write', value: 'generate' },
];

test('one enable card lists source, tools and writes before applying the approved grant', async () => {
  const grants: unknown[] = [];
  const h = harness({ confirmEnable: () => true, agentHost: {
    previewEnableAccess: async () => ({ key: 'revision-1', details }),
    provisionMcp: async (_input, options) => { grants.push(options); },
  } });
  const { html, outcome } = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'confirm' });
  for (const detail of details) assert.ok(html.includes(detail.value));
  assert.equal((await outcome as { changed: boolean }).changed, true);
  assert.deepEqual(grants, [{ approvedEnable: true }]);
});

test('cancel never grants and changed source configuration requires another approval', async () => {
  let revision = 0;
  const h = harness({ confirmEnable: () => true, agentHost: {
    previewEnableAccess: async () => ({ key: String(++revision), details }),
  } });
  const cancelled = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'cancel' });
  assert.equal((await cancelled.outcome as { changed: boolean }).changed, false);
  const stale = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'confirm' });
  await assert.rejects(stale.outcome, /PLUGINS_STALE_APPROVAL/);
  assert.equal(h.events.some(event => /^(setEnabled|provisionMcp):/.test(event)), false);
});
