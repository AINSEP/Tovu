/** @file Consent 1b: every tool, real confirmation exchange, stale cards and fail-closed writes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import { buildConsentRegistrations, consentDerivedRisk, contributeConsentTools } from '../tool-registrations.js';
import { consentFixture } from './fixture.js';
import { nativeToolMetadata } from '#src/contracts/core/tool-metadata/index';
import { SITE_CONSENT_DEFAULT_CSS } from '../config.js';

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

test('with no consent service bound, every tool fails closed instead of using a permissive fallback', async t => {
  const f = tools({ t });
  const unbound = buildConsentRegistrations({}, { surfaceExchanges: f.surfaceExchanges });
  const inputs: Record<string, unknown> = { consent_update_settings: { config: f.config, expectedDraftId: null }, consent_publish_settings: { draftId: 'draft', expectedPublishedId: null } };
  for (const tool of unbound) {
    const ctx: ToolExecutionContext = { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input: inputs[tool.descriptor.id] ?? {}, signal: new AbortController().signal };
    await assert.rejects(tool.handler(ctx, {}), { message: 'The site consent service is unavailable. Nothing was changed.' }, tool.descriptor.id);
  }
  assert.equal(unbound.length, 5);
});

for (const name of ['consent_get_readiness', 'consent_explain_blocked']) test(`${name} accepts an omitted input and a string path, and refuses a non-string path`, async t => {
  const f = tools({ t });
  const tool = f.registrations.find(item => item.descriptor.id === name); assert.ok(tool);
  const omitted = await tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input: undefined, signal: new AbortController().signal }, {});
  assert.deepEqual(omitted, await f.call(name, {}));
  assert.ok(await f.call(name, { path: '/' }));
  await assert.rejects(f.call(name, { path: 42 }), { message: 'path must be a local page path.' });
});

test('consent_get_settings accepts an omitted input the same as an empty one', async t => {
  const f = tools({ t });
  const tool = f.registrations.find(item => item.descriptor.id === 'consent_get_settings'); assert.ok(tool);
  const omitted = await tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input: undefined, signal: new AbortController().signal }, {});
  assert.deepEqual(omitted, await f.call('consent_get_settings', {}));
});

test('consent_publish_settings refuses a missing or stale draft id before asking for approval', async t => {
  const f = tools({ t });
  await assert.rejects(f.call('consent_publish_settings', { draftId: null, expectedPublishedId: null }), { message: 'Reload the saved consent draft before publishing.' });
  await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await assert.rejects(f.call('consent_publish_settings', { draftId: 'not-the-draft', expectedPublishedId: null }), { message: 'Reload the saved consent draft before publishing.' });
  assert.equal(f.surfaceExchanges.size(), 0);
});

for (const enabled of [true, false]) test(`the publish approval card warns about the ${enabled ? 'new prompt' : 'disabled enforcement'} for an ${enabled ? 'enabled' : 'disabled'} policy`, async t => {
  const f = tools({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled }, expectedDraftId: null });
  const surfaces: unknown[] = [];
  const confirm = f.answer('consent_publish_settings');
  await f.call('consent_publish_settings', { draftId: saved.revision.id, expectedPublishedId: null }, { emitSurface: async (surface: unknown) => { surfaces.push(surface); await confirm.emitSurface?.(surface as never); } });
  const card = JSON.stringify(surfaces);
  const warning = enabled ? 'Visitors will be asked again for this policy revision.' : 'The banner and optional-content enforcement will be disabled. Optional scripts may run without a visitor choice.';
  assert.ok(card.includes(warning), card);
  assert.equal((await f.store.read({})).published?.config.enabled, enabled);
});

test('contributeConsentTools contributes the consent domain builder and its derived risk table', () => {
  const contribution = contributeConsentTools();
  assert.equal(contribution.domain, 'consent');
  assert.equal(contribution.build, buildConsentRegistrations);
  assert.equal(contribution.risk, consentDerivedRisk);
});

for (const toolId of ['consent_update_settings', 'consent_publish_settings']) test(`${toolId} shows structured configuration changes with unchanged CSS collapsed`, async t => {
  const f = tools({ t });
  const previous = { ...f.config, title: 'Previous banner title', customCss: SITE_CONSENT_DEFAULT_CSS };
  const saved = await f.service.saveDraft({ principalId: 'owner', config: previous, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const config = { ...previous, title: 'Updated banner title' };
  const draft = toolId === 'consent_publish_settings'
    ? await f.service.saveDraft({ principalId: 'owner', config, expectedDraftId: saved.revision.id }) : null;
  const input = draft ? { draftId: draft.revision.id, expectedPublishedId: saved.revision.id } : { config, expectedDraftId: saved.revision.id };
  let html = '';
  const answer = f.answer(toolId, 'cancel');
  await f.call(toolId, input, { emitSurface: async emission => {
    html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text;
    await answer.emitSurface!(emission);
  } });
  assert.match(html, /<dt>Title<\/dt>/);
  assert.match(html, /mcpui-detail-change[\s\S]*Before[\s\S]*Previous banner title[\s\S]*After[\s\S]*Updated banner title/);
  assert.match(html, /<details class="[^"]*mcpui-detail-unchanged"[\s\S]*Unchanged fields/);
  assert.match(html, /<dt>Privacy policy URL<\/dt>/);
  assert.match(html, /<dt>Custom CSS<\/dt><dd><details class="[^"]*mcpui-detail-code"/);
  assert.match(html, /View raw/);
  assert.equal((await f.store.read({})).published?.config.title, previous.title, 'cancel keeps the published configuration');
});

for (const toolId of ['consent_update_settings', 'consent_publish_settings']) test(`${toolId} warns about unsafe-eval on the human confirmation card`, async t => {
  const f = tools({ t });
  const config = { ...f.config, allowUnsafeEval: true };
  const draft = toolId === 'consent_publish_settings' ? await f.service.saveDraft({ principalId: 'admin', config, expectedDraftId: null }) : null;
  const input = draft ? { draftId: draft.revision.id, expectedPublishedId: null } : { config, expectedDraftId: null };
  let shown = '';
  const answer = f.answer(toolId);
  await f.call(toolId, input, { emitSurface: async surface => {
    shown += JSON.stringify(surface);
    await answer.emitSurface!(surface);
  } });
  assert.match(shown, /unsafe-eval/);
  assert.match(shown, /weakens script protection/);
  assert.match(shown, /Optional scripts still wait for consent/);
  assert.equal((await f.store.read({}))[draft ? 'published' : 'draft']?.config.allowUnsafeEval, true);
});
