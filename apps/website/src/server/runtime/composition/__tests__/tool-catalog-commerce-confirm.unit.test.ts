/**
 * @file The composed `commerce` contributor in `tool-catalog-manifest.ts`: the catalog hands the commerce
 * runtime the route's own authorizer and an `askHuman` that renders `commerce_resolve_unknown`'s
 * verified-outcome card (order, payment, amount in the currency's major units, mode, outcome, reason,
 * the dashboard warning) through the shared human-confirm channel. The commerce runtime is a recording
 * fake; the confirm channel and card renderer are the production ones.
 */
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor, type ToolExecutionContext } from '@jini-ai/core';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/platform/system';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';

type AskHuman = (required: { ctx: ToolExecutionContext; description: unknown }, options?: { emitSurface?: (emission: { payload: unknown }) => Promise<void> }) => Promise<{ confirmed: boolean }>;

function commerceContributor() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find(item => item.domain === 'commerce');
  assert.ok(contributor, 'precondition: the catalog composes the commerce domain');
  return contributor;
}

test('the commerce runtime receives the route authorizer and an askHuman that shows the verified-outcome card, resolving with the human decision', async () => {
  const authorize = async () => ({ allowed: true, reason: 'owner' });
  const handed: { authorize: unknown; askHuman: AskHuman }[] = [];
  const commerce = { toolRegistrations: (required: { authorize: unknown; askHuman: AskHuman }) => { handed.push(required); return []; } };
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const registrations = commerceContributor().build({ workspaceId: 'shop', authorize, commerce } as never, surfaces as never);
  assert.deepEqual(registrations, []);
  assert.equal(handed.length, 1);
  assert.equal(handed[0]!.authorize, authorize);

  let html = '';
  let shown!: () => void;
  const visible = new Promise<void>((resolve) => { shown = resolve; });
  const ctx: ToolExecutionContext = { executionId: 'exec-c', principal: { id: 'owner' }, run: { id: 'run-c' }, input: {}, signal: new AbortController().signal };
  const decision = handed[0]!.askHuman({ ctx, description: { orderId: 'ord-7', paymentId: 'pay-3', amount: { currency: 'EUR', minorUnits: 1250 }, mode: 'test', outcome: 'succeeded', reason: 'Provider support confirmed' } }, {
    emitSurface: async (emission) => { html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text; shown(); },
  });
  await Promise.race([visible, decision]);

  const rows = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(rows, [['Order', 'ord-7'], ['Payment', 'pay-3'], ['Amount', 'EUR 12.50'], ['Mode', 'test'], ['Outcome', 'succeeded'], ['Verification reason', 'Provider support confirmed']]);
  assert.match(html, /Record this verified payment outcome\?/);
  assert.match(html, /Approve only after verifying this exact payment in the provider dashboard or with provider support\. A succeeded outcome can fulfill the order\./);
  assert.match(html, /Record verified outcome/);
  const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1] ?? '';
  assert.notEqual(exchangeId, '');
  surfaces.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { decision: 'confirm' } }, { toolId: 'commerce_resolve_unknown' });
  assert.equal((await decision).confirmed, true);
});

test('a site without a commerce runtime composes no commerce tools', () => {
  assert.deepEqual(commerceContributor().build({ workspaceId: 'plain', authorize: async () => ({ allowed: true, reason: 'owner' }) } as never, {} as never), []);
});
