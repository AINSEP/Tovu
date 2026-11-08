import assert from 'node:assert/strict';
import test from 'node:test';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import type { SurfaceCardSignInSpec, SurfaceCardSignInState } from '@jini-ai/core/contracts/cards';
import type { AgentPluginCardsPort } from '../../service-ports.js';
import { waitAtAgentPluginSignInCardWithPorts } from '../../connect-sign-in-wait.js';
import { buildAgentPluginConnectCardWithPorts } from '../../connect-card-ui.js';

/** Distinct from UIResource: losing Resource at the wait callback fails this compile pin. */
interface TestResource { readonly kind: 'test-resource'; readonly identity: symbol }

test('a concrete non-UI resource flows through the generic card builder and wait callback unchanged', async () => {
  const resource: TestResource = { kind: 'test-resource', identity: Symbol('host card') };
  const rendered: TestResource[] = [];
  const specs: (SurfaceCardSignInSpec & SurfaceCardSignInState)[] = [];
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const cards: AgentPluginCardsPort<TestResource> = {
    defineSecretCardTool: () => { throw new Error('Not a secret-card test'); },
    buildSignInCard: spec => { specs.push(spec); return resource; },
    buildFormSurface: () => resource, buildOutcomeSurface: () => resource,
    waitAtSignInCard: async required => {
      assert.equal(required.surfaceExchanges, surfaceExchanges);
      assert.equal(required.toolId, 'other_connect');
      const built: TestResource = required.card({ state: 'waiting', signInUrl: 'https://example.test/sign-in', exchangeId: 'exchange' });
      rendered.push(built);
      return required.connect({ signal: required.ctx.signal, showSignIn: async () => {} });
    },
  };
  const result = await waitAtAgentPluginSignInCardWithPorts({ cards, surfaceExchanges,
    ctx: { executionId: 'e', principal: { id: 'p' }, run: { id: 'r' }, input: {}, signal: new AbortController().signal },
    pluginId: 'other-plugin', pluginDisplayName: 'Other Plugin', toolId: 'other_connect',
    buildCard: spec => buildAgentPluginConnectCardWithPorts({ spec, cards, identity: { uriNamespace: 'other-host/connect', toolId: 'other_connect', app: { appName: 'other-host-app', appVersion: '2' } } }),
    missingEmitterMessage: 'Other host has no channel.', skippedResult: () => ({ status: 'not-connected', reason: 'cancelled' }),
    connect: async () => ({ status: 'connected' }),
  });
  assert.deepEqual(result, { status: 'connected' });
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0], resource);
  assert.equal(specs[0]?.uri, 'ui://other-host/connect/other-plugin');
  assert.deepEqual(specs[0]?.app, { appName: 'other-host-app', appVersion: '2' });
  assert.equal(specs[0]?.toolId, 'other_connect');
});
