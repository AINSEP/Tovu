import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import type { SurfaceAskThenReport } from '@jini-ai/core';
import type { SurfaceCardSecretForm } from '@jini-ai/core/contracts/cards';
import {
  resolveAgentPluginCardIdentity, buildAgentPluginConnectCardWithPorts, buildAgentPluginAccessTokenFormWithPorts,
  type AgentPluginCardBuilders, type AgentPluginCredentialCardForms,
} from '../../portable/connect-card-ui.js';
import { chooseApiConnectionDestinationWithPorts } from '../../portable/connect-destination.js';
import { agentPluginCardHost, tovuAgentPluginCardIdentity } from '../../card-host-bindings.js';
import { buildAgentPluginAccessTokenForm } from '../../connect-card-ui.js';

/** Opaque, non-UI card type: any cast or UI assumption in the portable bodies fails this compile. */
interface OtherResource { readonly kind: 'other-resource'; readonly spec: unknown }
const otherCards: AgentPluginCardBuilders<OtherResource> = {
  defineSecretCardTool: () => { throw new Error('not used'); },
  buildSignInCard: spec => ({ kind: 'other-resource', spec }),
  buildFormSurface: spec => ({ kind: 'other-resource', spec }),
  buildOutcomeSurface: spec => ({ kind: 'other-resource', spec }),
};

test('R3: Tovu card identity resolves to the exact pre-seam bytes', () => {
  assert.deepEqual(resolveAgentPluginCardIdentity({ cardIdentity: tovuAgentPluginCardIdentity, toolId: 'agent_plugin_connect' }), {
    connect: { uriNamespace: 'tovu/agent-plugins-connect', toolId: 'agent_plugin_connect', app: { appName: 'tovu-agent-plugins-connect', appVersion: '1' } },
    token: { formApp: { appName: 'tovu-agent-plugins-access-token', appVersion: '1' }, outcomeApp: { appName: 'tovu-agent-plugins-access-token-outcome', appVersion: '1' } },
    destination: { uriNamespace: 'tovu/sign-in-destination', toolId: 'agent_plugin_connect' },
  });
  assert.equal(agentPluginCardHost.connect.uriNamespace, 'tovu/agent-plugins-connect');
});

test('R3: an alternate host namespace flows into the URI and app with an opaque resource', () => {
  const route = resolveAgentPluginCardIdentity({ cardIdentity: { uriNamespace: 'acme', appNames: { connect: 'acme-connect', tokenForm: 'acme-token', tokenOutcome: 'acme-token-outcome' } }, toolId: 'acme_connect' });
  const card: OtherResource = buildAgentPluginConnectCardWithPorts({ spec: { pluginId: 'p 1', pluginDisplayName: 'P', state: 'connected' }, cards: otherCards, identity: route.connect });
  const spec = card.spec as { uri: string; app: unknown; toolId: string };
  assert.equal(spec.uri, 'ui://acme/agent-plugins-connect/p%201');
  assert.deepEqual(spec.app, { appName: 'acme-connect', appVersion: '1' });
  assert.equal(spec.toolId, 'acme_connect');
  assert.equal(route.destination.uriNamespace, 'acme/sign-in-destination');
});

test('forms: the token form is built through the host credential forms port into its own form type', () => {
  interface OtherForm { readonly wrapped: SurfaceCardSecretForm; readonly card?: unknown }
  const forms: AgentPluginCredentialCardForms<OtherForm> = { apply: ({ card, form }) => ({ wrapped: form, card }) };
  const out: OtherForm = buildAgentPluginAccessTokenFormWithPorts({ app: { appName: 'acme-token', appVersion: '1' },
    messages: { description: ({ pluginDisplayName, helpUrl }) => `Acme checks ${pluginDisplayName} at ${helpUrl}` },
    spec: { credentials: forms, pluginDisplayName: 'Office', helpUrl: 'https://example.test/tokens' } });
  assert.equal(out.wrapped.description, 'Acme checks Office at https://example.test/tokens');
  assert.equal(out.wrapped.fields[0]?.name, 'token');
  assert.doesNotMatch(JSON.stringify(out), /Tovu/);
  const tovu = buildAgentPluginAccessTokenForm({ credentials: { apply: ({ form }) => form }, pluginDisplayName: 'Office', helpUrl: 'https://example.test/tokens' });
  assert.equal(tovu.description, 'Create a personal access token at https://example.test/tokens, then paste it below. Tovu checks it with Office and seals it the moment you submit. The assistant never sees it, and it is never written to the chat.');
  assert.deepEqual(tovu.app, { appName: 'tovu-agent-plugins-access-token', appVersion: '1' });
});

test('destination: host channel and copy are used, with an opaque resource', async () => {
  const exchanges = createSurfaceExchangeStore({ clock: { nowMs: () => 0 }, idGenerator: { newId: () => 'x1' }, defaultChannel: 'other',
    scheduler: { schedule: () => () => {} } });
  const seen: { channel?: string; resource?: OtherResource } = {};
  const askThenReport: SurfaceAskThenReport = async ({ confirmationEmission }) => {
    seen.channel = confirmationEmission.channel;
    seen.resource = (confirmationEmission.payload as { resource: OtherResource }).resource;
    return null as never;
  };
  const ctx = { executionId: 'e', principal: { id: 'owner' }, run: { id: 'r' }, input: {}, signal: new AbortController().signal };
  const chosen = await chooseApiConnectionDestinationWithPorts({ cards: otherCards, askThenReport, uriNamespace: 'acme/sign-in-destination', toolId: 'acme_connect',
    host: { channel: 'other-channel', messages: { description: 'Acme description', sharedOptionLabel: 'Share on Acme' } },
    surfaces: { surfaceExchanges: exchanges }, ctx, pluginDisplayName: 'Office', available: true }, { emitSurface: async () => {} });
  assert.equal(chosen, null);
  assert.equal(seen.channel, 'other-channel');
  const spec = seen.resource?.spec as { uri: string; description: string; fields: [{ options: { label: string }[] }] };
  assert.equal(spec.uri, 'ui://acme/sign-in-destination/x1');
  assert.equal(spec.description, 'Acme description');
  assert.equal(spec.fields[0].options[1]?.label, 'Share on Acme');
  assert.doesNotMatch(JSON.stringify(spec), /Mac|Tovu|mcp-ui/);
});

test('no portable A10 body imports Tovu code (value or type) or a non-core Jini package', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../portable');
  const files = readdirSync(dir).filter(name => name.endsWith('.ts'));
  assert.ok(files.length >= 3);
  for (const name of files) {
    const source = readFileSync(join(dir, name), 'utf8');
    for (const [, spec] of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const ok = /^@jini-ai\/core(\/|$)/.test(spec!) || /^@jini-ai\/agent-plugins(\/|$)/.test(spec!) || /^\.\/[^/]+\.js$/.test(spec!);
      assert.ok(ok, `${name} imports ${spec}`);
    }
    assert.doesNotMatch(source, /\bTovu\b|ui:\/\/tovu|'mcp-ui'/, name);
  }
});
