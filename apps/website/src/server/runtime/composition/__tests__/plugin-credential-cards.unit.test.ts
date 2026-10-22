import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentPluginLayout } from '#src/features/agent-plugins/layout';
import { createPluginCredentialCardsLoader } from '../plugin-credential-cards.js';

const mail = { providerId: 'mail', label: 'Mail', category: 'ops', baseUrl: 'https://mail.example.com', title: 'Mail' };
const manifest = { providerId: 'host', label: 'Host', category: 'hosting', baseUrl: 'https://host.example.com', title: 'Hosting' };

test('composition merges mail and manifest cards through the active contribution owner on every lookup', async () => {
  const calls: unknown[] = [];
  const load = createPluginCredentialCardsLoader({ agentPluginLayout: {} as AgentPluginLayout, loadMailCards: async workspaceId => { calls.push(workspaceId); return [mail]; } }, {
    loadContributions: async (input, options) => { calls.push([input.workspaceId, input.definition.filename, options]); return { items: [manifest] as never, refusals: [] }; },
  });
  for (let i = 0; i < 2; i++) {
    const cards = await load('workspace');
    assert.equal(cards[0], mail);
    assert.equal(cards[1], manifest);
  }
  assert.deepEqual(calls, ['workspace', ['workspace', 'plugin.json', { requireActive: true, orderByPluginId: true }], 'workspace', ['workspace', 'plugin.json', { requireActive: true, orderByPluginId: true }]]);
});

test('a refused manifest does not remove working mail cards and its refusal is reported', async () => {
  const refusals: string[] = [];
  const load = createPluginCredentialCardsLoader({ agentPluginLayout: {} as AgentPluginLayout, loadMailCards: async () => [mail] }, {
    loadContributions: async () => ({ items: [], refusals: ['invalid package card'] }), onRefusal: refusal => { refusals.push(refusal); },
  });
  assert.deepEqual(await load('workspace'), [mail]);
  assert.deepEqual(refusals, ['invalid package card']);
});
