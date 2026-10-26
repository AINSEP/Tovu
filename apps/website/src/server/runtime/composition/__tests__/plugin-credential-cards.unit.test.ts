import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentPluginLayout } from '#src/features/agent-plugins/layout';
import { createPluginCredentialCardsLoader } from '../plugin-credential-cards.js';
import type { PluginCredentialCard } from '#src/features/custom-credentials/plugin-credential-card';

const mail = { providerId: 'mail', label: 'Mail', category: 'ops', baseUrl: 'https://mail.example.com', title: 'Mail' };
const manifest = { providerId: 'host', label: 'Host', category: 'hosting', baseUrl: 'https://host.example.com', title: 'Hosting' };

const declaredCard = { target: 'owner-key', label: 'Owner API key', ownedApiLabel: 'Owner API key', category: 'hosting', baseUrl: 'https://api.example.com', title: 'Connect owner', intro: 'Connect this service.', keyHint: 'Paste a scoped key.' };
const source = ({ pluginId, cards }: { pluginId: string; cards: readonly unknown[] }, _options = {}) => ({ pluginId, raw: JSON.stringify({ extensions: { tovu: { credentialCards: cards } } }) });

/** Fake only trusted discovery/I/O; exercise the supplied real parser, ownership gate and merge. */
async function loadDeclaredCards({ sources, mailCards = [] }: { sources: readonly { pluginId: string; raw: string }[]; mailCards?: readonly PluginCredentialCard[] }, _options = {}) {
  const refusals: string[] = [];
  const load = createPluginCredentialCardsLoader({ agentPluginLayout: {} as AgentPluginLayout, loadMailCards: async () => mailCards }, {
    readFile: async ({ plugin, filename }) => {
      assert.ok(['plugin.json', 'tovu-deploy-targets.json', 'tovu-source-control.json', 'tovu-mail-adapters.json'].includes(filename));
      return filename === 'plugin.json' ? sources.find(entry => entry.pluginId === plugin.pluginId)?.raw ?? '{}' : '{}';
    },
    onRefusal: message => refusals.push(message),
    loadContributions: async ({ definition }, options) => {
      assert.equal(definition.filename, 'plugin.json');
      assert.deepEqual(options, { requireActive: true, orderByPluginId: true });
      const items = [];
      const refusals: string[] = [];
      for (const { pluginId, raw } of sources) {
        const parsed = definition.parse({ raw });
        if (!parsed.ok) { refusals.push(parsed.reason); continue; }
        for (const descriptor of parsed.descriptors) {
          const loaded = await definition.load({ plugin: { pluginId, packageRoot: '/unused' }, descriptor, importModule: async () => assert.fail('data only') });
          if (typeof loaded === 'string') refusals.push(loaded); else items.push(loaded);
        }
      }
      return { items, refusals };
    },
  });
  return { cards: await load('workspace'), refusals };
}

test('a trusted plugin owns its declared API label; another plugin cannot borrow it', async () => {
  const result = await loadDeclaredCards({ sources: [
    source({ pluginId: 'owner', cards: [declaredCard] }),
    source({ pluginId: 'borrower', cards: [{ ...declaredCard, target: 'borrowed-key', ownedApiLabel: undefined }] }),
  ] });
  assert.deepEqual(result.cards.map(card => [card.providerId, card.pluginId, card.label]), [['owner-key', 'owner', 'Owner API key']]);
  assert.equal(result.refusals.length, 1);
  assert.match(result.refusals[0]!, /borrower.*destination is not owned/);
});

test('declaring an API label does not authorize another plugin saveTarget', async () => {
  const result = await loadDeclaredCards({ sources: [source({ pluginId: 'owner', cards: [{ ...declaredCard, saveTarget: 'victim' }] })] });
  assert.deepEqual(result.cards, []);
  assert.equal(result.refusals.length, 1);
  assert.match(result.refusals[0]!, /destination is not owned/);
});

const providerCard = { target: 'metrics', label: 'Metrics', category: 'ops', title: 'Connect metrics', intro: 'Send metrics.', keyHint: 'Paste the project key.', saveKind: 'provider-settings', saveTarget: 'metrics-provider' };
const linkedSource = ({ pluginId, providerPlugin, cards }: { pluginId: string; providerPlugin?: string; cards: readonly unknown[] }, _options = {}) =>
  ({ pluginId, raw: JSON.stringify({ extensions: { tovu: { ...(providerPlugin ? { providerPlugin } : {}), credentialCards: cards } } }) });

test('an agent plugin that declares its provider plugin owns that provider settings card', async () => {
  const result = await loadDeclaredCards({ sources: [linkedSource({ pluginId: 'metrics', providerPlugin: 'metrics-provider', cards: [providerCard] })] });
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.cards.map(card => [card.providerId, card.pluginId, card.saveKind, card.saveTarget]), [['metrics', 'metrics', 'provider-settings', 'metrics-provider']]);
});

test('a provider settings card for a provider plugin the agent plugin does not declare is refused', async () => {
  for (const providerPlugin of [undefined, 'other-provider']) {
    const result = await loadDeclaredCards({ sources: [linkedSource({ pluginId: 'metrics', ...(providerPlugin ? { providerPlugin } : {}), cards: [providerCard] })] });
    assert.deepEqual(result.cards, []);
    assert.match(result.refusals[0]!, /destination is not owned/);
  }
});

test('duplicate API label claims refuse both plugins in either order and retain unrelated cards', async () => {
  const sources = [
    source({ pluginId: 'owner', cards: [declaredCard] }),
    source({ pluginId: 'other', cards: [{ ...declaredCard, target: 'other-key' }] }),
  ];
  for (const ordered of [sources, [...sources].reverse()]) {
    const result = await loadDeclaredCards({ sources: [...ordered, source({ pluginId: 'unrelated', cards: [{ ...declaredCard, target: 'unrelated-key', label: 'Separate key', ownedApiLabel: 'Separate key' }] })], mailCards: [mail] });
    assert.deepEqual(result.cards.map(card => card.providerId), ['mail', 'unrelated-key']);
    assert.equal(result.refusals.length, 2);
    for (const pluginId of ['owner', 'other']) assert.ok(result.refusals.some(message => message.includes(`'${pluginId}'`) && /duplicate.*API.*label.*Owner API key/.test(message)));
  }
});

test('an explicit label claim conflicts with another plugin implicit identity ownership', async () => {
  const result = await loadDeclaredCards({ sources: [
    source({ pluginId: 'owner', cards: [{ ...declaredCard, label: 'existing-owner', ownedApiLabel: 'existing-owner' }] }),
    source({ pluginId: 'existing-owner', cards: [{ ...declaredCard, target: 'existing-key', label: 'existing-owner', ownedApiLabel: undefined }] }),
  ] });
  assert.deepEqual(result.cards, []);
  assert.equal(result.refusals.length, 2);
  assert.ok(result.refusals.every(message => /duplicate.*API.*label.*existing-owner/.test(message)));
});

test('an explicit claim cannot take a mail plugin API label; both conflicting cards are refused', async () => {
  const result = await loadDeclaredCards({
    sources: [source({ pluginId: 'owner', cards: [declaredCard] })],
    mailCards: [{ ...mail, pluginId: 'mail-plugin', label: 'Owner API key' }],
  });
  assert.deepEqual(result.cards, []);
  assert.equal(result.refusals.length, 2);
  assert.ok(result.refusals.every(message => /duplicate.*API.*label.*Owner API key/.test(message)));
});

test('cards from one plugin may share its API row and domain display labels claim no API ownership', async () => {
  const result = await loadDeclaredCards({ sources: [
    source({ pluginId: 'owner', cards: [declaredCard, { ...declaredCard, target: 'owner-alias' }] }),
    source({ pluginId: 'domain', cards: [{ ...declaredCard, target: 'domain', saveKind: 'publish-host', ownedApiLabel: undefined }] }),
  ] });
  assert.deepEqual(result.cards.map(card => card.providerId), ['owner-key', 'owner-alias', 'domain']);
  assert.deepEqual(result.refusals, []);
});

test('bundled Fly and Meilisearch declarations survive real parsing and ownership with saved labels unchanged', async () => {
  const { readFile } = await import('node:fs/promises');
  const root = new URL('../../../../../../../content/agent-plugins/', import.meta.url);
  const sources = await Promise.all(['fly', 'meilisearch'].map(async pluginId => ({ pluginId, raw: await readFile(new URL(`${pluginId}/plugin.json`, root), 'utf8') })));
  const result = await loadDeclaredCards({ sources });
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.cards.map(card => [card.providerId, card.pluginId, card.label, card.ownedApiLabel]), [
    ['fly', 'fly', 'fly.io', 'fly.io'],
    ['meilisearch', 'meilisearch', 'Tovu Search — Meilisearch', 'Tovu Search — Meilisearch'],
  ]);
  assert.deepEqual(result.cards[0]!.additionalHosts, ['https://api.machines.dev']);
  assert.deepEqual(result.cards[1]!.fields?.map(field => [field.name, field.required]), [['baseUrl', true]]);
});

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

test('a broken manifest loader retains mail cards and reports the fallback', async () => {
  const refusals: string[] = [];
  const load = createPluginCredentialCardsLoader({ agentPluginLayout: {} as AgentPluginLayout, loadMailCards: async () => [mail] }, {
    loadContributions: async () => { throw new Error('EIO'); }, onRefusal: message => refusals.push(message),
  });
  assert.deepEqual(await load('workspace'), [mail]);
  assert.match(refusals[0]!, /default/);
});

test('trusted contribution materialization tags ownership and refuses cross-plugin identities', async () => {
  const refusals: string[] = [];
  const declarations = [
    { ...manifest, saveKind: 'publish-host' as const, saveTarget: 'victim' },
    { ...manifest, providerId: 'owner', saveKind: 'api' as const, label: 'victim' },
    { ...manifest, providerId: 'owner', saveKind: 'api' as const, label: 'owner' },
    { ...manifest, providerId: 'own-dns', saveKind: 'publish-host' as const },
  ];
  const load = createPluginCredentialCardsLoader({ agentPluginLayout: {} as AgentPluginLayout, loadMailCards: async () => [] }, {
    readFile: async ({ filename }) => filename === 'tovu-deploy-targets.json' ? JSON.stringify({ schemaVersion: 1, targets: [{ id: 'own-dns', label: 'DNS', module: 'dns.mjs', config: [] }] }) : '{}',
    loadContributions: async ({ definition }) => {
      const items = [];
      for (const descriptor of declarations) {
        const loaded = await definition.load({ plugin: { pluginId: 'owner', packageRoot: '/unused' }, descriptor: descriptor as never, importModule: async () => assert.fail('data only') });
        if (typeof loaded === 'string') refusals.push(loaded); else items.push(loaded);
      }
      return { items, refusals: [] };
    },
  });
  const cards = await load('workspace');
  assert.deepEqual(cards.map(card => [card.providerId, card.pluginId]), [['owner', 'owner'], ['own-dns', 'owner']]);
  assert.equal(refusals.length, 2);
});

test('probe declarations survive real parsing and trusted card materialization', async () => {
  const probeUrl = 'https://api.example.com/user';
  const result = await loadDeclaredCards({ sources: [source({ pluginId: 'owner', cards: [{ ...declaredCard, probeUrl }] })] });
  assert.deepEqual(result.refusals, []);
  assert.equal(result.cards[0]?.probeUrl, probeUrl);
});

for (const probeUrl of ['https://other.example.com/user', 'http://api.example.com/user', 'https://user:password@api.example.com/user', 'https://@api.example.com/user', '/user']) {
  test(`unsafe probe declaration is refused: ${probeUrl}`, async () => {
    const result = await loadDeclaredCards({ sources: [source({ pluginId: 'owner', cards: [{ ...declaredCard, probeUrl }] })] });
    assert.deepEqual(result.cards, []);
    assert.equal(result.refusals.length, 1);
  });
}

test('a fixed probe requires an API card and a fixed declared base origin', async () => {
  for (const card of [
    { ...declaredCard, baseUrl: undefined, fields: [{ name: 'baseUrl', label: 'URL', required: true }] },
    { ...declaredCard, ownedApiLabel: undefined, saveKind: 'source-control' },
  ]) {
    const result = await loadDeclaredCards({ sources: [source({ pluginId: 'owner', cards: [{ ...card, probeUrl: 'https://api.example.com/user' }] })] });
    assert.deepEqual(result.cards, []);
    assert.equal(result.refusals.length, 1);
  }
});
