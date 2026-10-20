/** @file Consent 1b: every tool, real confirmation exchange, stale cards and fail-closed writes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import { buildConsentRegistrations, consentDerivedRisk } from '../tool-registrations.js';
import { consentFixture } from './fixture.js';
import { nativeToolMetadata } from '#src/contracts/core/tool-metadata/index';

function tools({ t }: { t: import('node:test').TestContext }, _options = {}) {
  const f = consentFixture({ t });
  let exchangeCount = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++exchangeCount}` }, defaultChannel: 'mcp-ui' });
  const registrations = buildConsentRegistrations({ siteConsent: f.service }, { surfaceExchanges });
  const call = (name: string, input: unknown = {}, options: ToolExecutionOptions = {}) => {
    const tool = registrations.find(item => item.descriptor.id === name); assert.ok(tool);
    const ctx: ToolExecutionContext = { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input, signal: new AbortController().signal };
    return tool.handler(ctx, options);
  };
  const answer = (toolId: string, decision: 'confirm' | 'cancel' | 'typed' = 'confirm', before?: () => void | Promise<void>): ToolExecutionOptions => ({ emitSurface: async () => {
    await before?.();
    surfaceExchanges.deliver({ exchangeId: `exchange-${exchangeCount}`, principalId: 'owner', params: decision === 'typed' ? { __typedAnswer: 'yes' } : { decision } }, { toolId });
  } });
  return { ...f, registrations, call, answer, surfaceExchanges };
}

for (const name of ['consent_get_settings', 'consent_get_readiness', 'consent_explain_blocked']) test(`${name} is read-only, permission checked and rejects model approval fields`, async t => {
  const f = tools({ t });
  assert.ok(await f.call(name));
  assert.equal(f.registrations.find(item => item.descriptor.id === name)?.descriptor.readOnly, true);
  assert.equal(consentDerivedRisk.get(name), 'none');
  await assert.rejects(f.call(name, { confirm: true }));
  f.ports.store = undefined; await assert.rejects(f.call(name), /unavailable/);
  f.deny(); await assert.rejects(f.call(name), /not authorized/);
  assert.deepEqual(await f.store.read({}), { draft: null, published: null });
});

for (const name of ['consent_update_settings', 'consent_publish_settings']) test(`${name} refuses headless, cancelled, typed and revoked approvals without mutating published policy`, async t => {
  const f = tools({ t });
  const saved = name === 'consent_publish_settings' ? await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null }) : null;
  const input = saved ? { draftId: saved.revision.id, expectedPublishedId: null } : { config: f.config, expectedDraftId: null };
  assert.ok(nativeToolMetadata.redeemableIds.has(name));
  assert.equal(f.registrations.find(item => item.descriptor.id === name)?.descriptor.readOnly, false);
  await assert.rejects(f.call(name, input), /NO_CONFIRMATION_CHANNEL/);
  for (const decision of ['cancel', 'typed'] as const) await f.call(name, input, f.answer(name, decision));
  assert.equal((await f.store.read({})).published, null);
  await assert.rejects(f.call(name, { ...input, confirm: true }));
  await assert.rejects(f.call(name, input, f.answer(name, 'confirm', f.deny)), /not authorized/);
  assert.equal((await f.store.read({})).published, null);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('confirmed draft and publish use fixed values; a changed draft invalidates an open publish card', async t => {
  const f = tools({ t });
  await f.call('consent_update_settings', { config: f.config, expectedDraftId: null }, f.answer('consent_update_settings'));
  const first = (await f.store.read({})).draft!;
  await assert.rejects(f.call('consent_publish_settings', { draftId: first.id, expectedPublishedId: null }, f.answer('consent_publish_settings', 'confirm', async () => {
    await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, title: 'Changed during review' }, expectedDraftId: first.id });
  })), /changed|Reload/);
  assert.equal((await f.store.read({})).published, null);
  const latest = (await f.store.read({})).draft!;
  await f.call('consent_publish_settings', { draftId: latest.id, expectedPublishedId: null }, f.answer('consent_publish_settings'));
  assert.equal((await f.store.read({})).published?.config.title, 'Changed during review');
});


for (const name of ['consent_update_settings', 'consent_publish_settings']) test(`${name} does not acknowledge a failed durable write`, async t => {
  const f = tools({ t });
  const saved = name === 'consent_publish_settings' ? await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null }) : null;
  const input = saved ? { draftId: saved.revision.id, expectedPublishedId: null } : { config: f.config, expectedDraftId: null };
  await assert.rejects(f.call(name, input, f.answer(name, 'confirm', () => {
    f.ports.store = { ...f.store, saveDraft: async () => { throw new Error('write failed'); }, publish: async () => { throw new Error('write failed'); } };
  })), /write failed/);
  assert.equal((await f.store.read({})).published, null);
  if (!saved) assert.equal((await f.store.read({})).draft, null);
});
