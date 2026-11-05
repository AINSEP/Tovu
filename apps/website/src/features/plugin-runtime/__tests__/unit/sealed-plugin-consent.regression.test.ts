import assert from 'node:assert/strict';
import test from 'node:test';
import { createPluginSourcePolicy } from '@jini-ai/plugins/host';
import { answerCard, CAPABILITIES, context, harness, PLUGIN_ID } from '../fixtures/plugins-tool-harness.js';

const input = { family: 'site-runtime', pluginId: PLUGIN_ID, enabled: true } as const;

test('a locally sealed plugin with unchanged approved capabilities still needs a fresh owner card', async () => {
  const policy = createPluginSourcePolicy({ hosted: false, localInstallOptIn: false });
  assert.equal(policy.confirmEnable({ sealedHere: true, added: [] }), true);
  const h = harness({ confirmEnable: policy.confirmEnable, source: { readApproval: async () => CAPABILITIES } });
  await assert.rejects(h.tool('plugins_set_enabled').handler(context(input), {}), /PLUGINS_NO_CONFIRMATION_CHANNEL/);
  assert.equal(h.events.includes('save:true'), false);
  const { outcome } = await answerCard({ tool: h.tool('plugins_set_enabled'), surfaceExchanges: h.surfaceExchanges, input, decision: 'cancel' });
  assert.equal((await outcome as { changed: boolean }).changed, false);
  assert.equal(h.events.includes('save:true'), false);
});
