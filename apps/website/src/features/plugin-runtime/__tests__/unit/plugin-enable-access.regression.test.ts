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
    previewEnableAccess: async () => ({ key: 'revision-1', details, resources: [{ id: 'media', label: details[0]!.value, previous: { enabled: false, allow: [], write: [] }, proposed: { enabled: true, allow: ['models', 'generate'], write: ['generate'] }, revision: 'source-1' }] }),
    provisionMcp: async (_input, options) => { grants.push(options); },
  } });
  const { html, outcome } = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'confirm' });
  assert.ok(html.includes(details[0]!.value));
  assert.ok(html.includes('models')); assert.ok(html.includes('generate'));
  assert.ok(html.includes('source-1')); assert.ok(html.includes('owner-under-test'));
  assert.equal((await outcome as { changed: boolean }).changed, true);
  assert.deepEqual(grants, [{ approvedEnable: true, approvedEnableKey: 'revision-1' }]);
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
