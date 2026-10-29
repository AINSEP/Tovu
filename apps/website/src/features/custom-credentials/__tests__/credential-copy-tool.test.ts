/** C3 / copyplan-REVIEW: principal-bound copy cards call C2, never handle secret values. */
import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceEmission } from '@jini-ai/core';
import { createFakeClock } from '#src/__tests__/support/fake-clock';
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from '@jini-ai/daemon/surface-exchanges';
import type { UIResource } from '@jini-ai/ui/mcp-ui/surfaces';
import { isMcpUiToolCallPermitted } from '../../../assistant/mcp-ui-tool-calls.js';
import { buildCredentialCopyRegistrations, CREDENTIAL_COPY_TOOL_ID, type CredentialCopyToolDeps } from '../credential-copy-tool.js';

function fixture() {
  const timers = new Set<() => void>();
  let nextId = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ clock: createFakeClock({ startIso: '2026-10-11T00:00:00Z' }),
    idGenerator: { newId: () => `copy-${++nextId}` }, defaultChannel: 'mcp-ui',
    scheduler: { schedule: ({ callback }) => { timers.add(callback); return () => { timers.delete(callback); }; } } });
  let allow = true;
  let instanceAllow = true;
  const calls: unknown[] = [];
  const permissions: string[] = [];
  const sources = [{ siteId: 'source', name: 'Source', keys: [
    { kind: 'vendor' as const, id: 'one', label: 'OpenAI', provider: 'openai', worksFor: [], last4: 'ABCD' },
    { kind: 'vendor' as const, id: 'two', label: 'DNS', provider: null, worksFor: [] },
  ] }];
  const deps: CredentialCopyToolDeps = { workspaceId: 'target', ownerPrincipalId: Promise.resolve('owner'),
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: allow, reason: 'matched' }; },
    gatedMutations: { gatewayDeps: { authorizeInstance: async () => ({ allowed: instanceAllow, reason: 'matched' }) } },
    localCredentialCopy: { localHost: true, list: async () => sources,
      copy: async input => { calls.push(input); return [
        { kind: 'vendor', id: 'one', status: 'copied', last4: 'ABCD', token: 'secret-canary', sealed: 'ciphertext-canary' },
        { kind: 'vendor', id: 'two', status: 'skipped', reasonCode: 'target-exists' },
      ]; } } };
  const tool = buildCredentialCopyRegistrations({ deps, surfaces: { surfaceExchanges } })[0]!;
  const emitted: SurfaceEmission[] = [];
  const controller = new AbortController();
  const run = (input: unknown = {}, principalId = 'owner', emit = true) => tool.handler({ executionId: 'exec',
    principal: { id: principalId }, run: { id: 'run' }, input, signal: controller.signal },
  emit ? { emitSurface: async emission => { emitted.push(emission); } } : {});
  const resource = () => (emitted.at(-1)!.payload as { resource: UIResource }).resource.resource;
  const answer = (params: Record<string, unknown>, principalId = 'owner') => surfaceExchanges.deliver({
    exchangeId: 'copy-1', principalId, params }, { toolId: CREDENTIAL_COPY_TOOL_ID, channel: 'mcp-ui' });
  return { deps, tool, sources, run, emitted, resource, answer, calls, permissions, surfaceExchanges, controller,
    deny: () => { allow = false; }, denyInstance: () => { instanceAllow = false; }, expire: () => { [...timers][0]!(); } };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function keys(f: ReturnType<typeof fixture>) {
  await turn();
  assert.deepEqual(f.answer({ sourceSiteId: 'source' }), { ok: true });
  await turn();
}

test('copy card shows custom keys alongside vendor keys and their publish hosts; only selected IDs are copied', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.list = async () => [{ siteId: 'source', name: 'Source', keys: [
    { kind: 'vendor', id: 'vercel-key', label: 'Production access', provider: null, worksFor: ['vercel'], publishHosts: ['vercel'] },
    { kind: 'vendor', id: 'dns-key', label: 'name.com', provider: null, worksFor: [], publishHosts: [] },
    { kind: 'vendor', id: 'github-key', label: 'GitHub Pages token', provider: 'github', worksFor: ['github'], publishHosts: ['github-pages'] },
  ] }];
  const pending = f.run();
  await keys(f);
  for (const id of ['vercel-key', 'dns-key', 'github-key']) assert.match(f.resource().text, new RegExp(`name="ids" value="${id}"`));
  assert.match(f.resource().text, /Production access · vendor · Works for: vercel · Publish: vercel/);
  assert.match(f.resource().text, /name.com · vendor · Works for: none · No static publish host/);
  assert.match(f.resource().text, /GitHub Pages token · github · Works for: github · Publish: github-pages/);
  assert.doesNotMatch(f.resource().text, /name="ids"[^>]* checked/);
  f.answer({ ids: ['vercel-key', 'dns-key', 'github-key'], overwrite: false });
  await pending;
  assert.deepEqual(f.calls, [{ sourceSiteId: 'source', ids: ['vercel-key', 'dns-key', 'github-key'], overwrite: false, actorId: 'owner' }]);
});

test('C3: one tool, exchange-only metadata, no direct model selection', async () => {
  const f = fixture();
  assert.equal(f.tool.descriptor.id, CREDENTIAL_COPY_TOOL_ID);
  assert.equal(isMcpUiToolCallPermitted(CREDENTIAL_COPY_TOOL_ID, true), true);
  assert.equal(isMcpUiToolCallPermitted(CREDENTIAL_COPY_TOOL_ID, false), false);
  for (const input of [{ sourceSiteId: 'source', ids: ['one'], overwrite: true }, { token: 'secret-canary' }, []]) {
    await assert.rejects(f.run(input), /human card/);
  }
  await assert.rejects(f.run({}, 'owner', false), /interactive/);
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.deepEqual(f.calls, []);
});

test('C3: source, unchecked keys/overwrite, masked outcomes replace one card; C2 receives exact selection', async () => {
  const f = fixture(); const pending = f.run(); await turn();
  const uri = f.resource().uri;
  assert.match(f.resource().text, /<select[^>]+name="sourceSiteId"/);
  assert.match(f.resource().text, /flex-direction:row/);
  assert.deepEqual(f.answer({ sourceSiteId: 'source' }, 'other'), { ok: false, reason: 'binding-mismatch' });
  await keys(f);
  assert.equal(f.resource().uri, uri);
  assert.match(f.resource().text, /OpenAI · openai · …ABCD/);
  assert.doesNotMatch(f.resource().text, /name="overwrite"[^>]* checked/);
  assert.match(f.resource().text, /justify-content:flex-end/);
  f.answer({ ids: ['one', 'two'], overwrite: false });
  const result = await pending;
  assert.deepEqual(f.calls, [{ sourceSiteId: 'source', ids: ['one', 'two'], overwrite: false, actorId: 'owner' }]);
  assert.deepEqual(result, { results: [{ kind: 'vendor', id: 'one', status: 'copied', last4: 'ABCD' },
    { kind: 'vendor', id: 'two', status: 'skipped', reasonCode: 'target-exists' }] });
  assert.equal(f.resource().uri, uri);
  assert.match(f.resource().text, /copied ✓ …ABCD/);
  assert.match(f.resource().text, /skipped — already there/);
  assert.doesNotMatch(JSON.stringify({ result, emitted: f.emitted }), /secret-canary|ciphertext-canary/);
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.ok(f.permissions.length >= 3 && f.permissions.every(permission => permission === 'system.write'));
});

test('C3: forged source and mixed valid/forged keys fail the entire selection', async () => {
  const source = fixture(); const first = source.run(); await turn(); source.answer({ sourceSiteId: '../source' });
  assert.equal((await first as { reasonCode: string }).reasonCode, 'invalid-selection');
  for (const params of [{ ids: ['one', 'forged'], overwrite: false }, { ids: ['one', 'one'], overwrite: false },
    { ids: [], overwrite: false }, { ids: Array.from({ length: 101 }, () => 'one'), overwrite: false },
    { ids: ['one'], overwrite: 'true' }, { ids: ['one'], overwrite: false, sourceSiteId: 'other' }]) {
    const f = fixture(); const pending = f.run(); await keys(f); f.answer(params);
    assert.equal((await pending as { reasonCode: string }).reasonCode, 'invalid-selection');
    assert.deepEqual(f.calls, []);
  }
});

test('C3: owner, RBAC, instance and local capability are checked before discovery and after submit', async () => {
  const other = fixture(); await assert.rejects(other.run({}, 'admin'), /owner/);
  const remote = fixture(); remote.deps.localCredentialCopy!.localHost = false;
  await assert.rejects(remote.run(), /local/);
  for (const gate of ['deny', 'denyInstance', 'local'] as const) {
    const f = fixture(); const pending = f.run(); await keys(f);
    if (gate === 'local') f.deps.localCredentialCopy!.localHost = false; else f[gate]();
    f.answer({ ids: ['one'], overwrite: true });
    assert.equal((await pending as { reasonCode: string }).reasonCode, 'copy-refused');
    assert.deepEqual(f.calls, []);
    assert.equal(f.surfaceExchanges.size(), 0);
  }
});

test('C3: cancellation, expiry and abort during either step never copy', async () => {
  for (const atKeys of [false, true]) for (const ending of ['cancel', 'expire', 'abort'] as const) {
    const f = fixture(); const pending = f.run();
    if (atKeys) await keys(f); else await turn();
    if (ending === 'cancel') f.answer({ [SURFACE_DISMISSED_PARAM]: true });
    else if (ending === 'expire') f.expire(); else f.controller.abort();
    const result = await pending as { reasonCode: string };
    assert.equal(result.reasonCode, ending === 'cancel' ? 'cancelled' : ending === 'expire' ? 'expired' : 'abandoned');
    assert.deepEqual(f.calls, []);
    assert.equal(f.surfaceExchanges.size(), 0);
  }
});

test('C3: upgrade refusal uses the exact reviewed message, no legacy reader or copy', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.list = async () => [{ siteId: 'source', name: 'Source', keys: [], reasonCode: 'source-needs-upgrade',
    message: 'Start Source once in Tovu to upgrade it, then copy.' }];
  const pending = f.run(); await turn(); f.answer({ sourceSiteId: 'source' });
  assert.equal((await pending as { reasonCode: string }).reasonCode, 'source-needs-upgrade');
  assert.match(f.resource().text, /Start Source once in Tovu to upgrade it, then copy\./);
  assert.deepEqual(f.calls, []);
});

test('C3: C2 revision conflicts and missing keys stay safe; overwrite is explicit', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.copy = async input => { f.calls.push(input); return [
    { kind: 'vendor', id: 'one', status: 'failed', reasonCode: 'conflict' } ]; };
  const pending = f.run(); await keys(f); f.answer({ ids: ['one'], overwrite: true });
  assert.deepEqual(await pending, { results: [{ kind: 'vendor', id: 'one', status: 'failed', reasonCode: 'conflict' }] });
  assert.equal((f.calls[0] as { overwrite: boolean }).overwrite, true);
  for (const reasonCode of ['source-missing', undefined]) {
    const g = fixture(); g.deps.localCredentialCopy!.copy = async () => { throw Object.assign(new Error('secret-canary'), { reasonCode }); };
    const next = g.run(); await keys(g); g.answer({ ids: ['one'], overwrite: false });
    assert.equal((await next as { reasonCode: string }).reasonCode, reasonCode ?? 'copy-failed');
    assert.doesNotMatch(JSON.stringify(g.emitted), /secret-canary/);
  }
});

test('C3: abort before discovery, inventory exceptions and failed emission do not leak or leave an exchange', async () => {
  const aborted = fixture(); aborted.controller.abort();
  assert.deepEqual(await aborted.run(), { results: [], reasonCode: 'abandoned' });
  assert.equal(aborted.emitted.length, 0);
  const inventory = fixture(); inventory.deps.localCredentialCopy!.list = async () => { throw new Error('secret-canary'); };
  await assert.rejects(inventory.run(), error => error instanceof Error && !error.message.includes('secret-canary'));
  assert.equal(inventory.surfaceExchanges.size(), 0);
  const emission = fixture();
  await assert.rejects(emission.tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' },
    input: {}, signal: emission.controller.signal }, { emitSurface: async () => { throw new Error('disconnected'); } }), /disconnected/);
  assert.equal(emission.surfaceExchanges.size(), 0);
  assert.deepEqual(emission.calls, []);
});

test('C3: null and primitive model inputs are refused before inventory discovery', async () => {
  const f = fixture();
  let discoveries = 0;
  f.deps.localCredentialCopy!.list = async () => { discoveries++; return []; };
  for (const input of [null, false, 1, 'source']) await assert.rejects(f.run(input), /model input must be \{\}/);
  await assert.rejects(f.tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' },
    input: {}, signal: f.controller.signal }), /interactive card/);
  assert.equal(discoveries, 0);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('C3: an absent local capability refuses discovery', async () => {
  const f = fixture();
  const { localCredentialCopy: _localCredentialCopy, ...deps } = f.deps;
  const tool = buildCredentialCopyRegistrations({ deps, surfaces: { surfaceExchanges: f.surfaceExchanges } })[0]!;
  await assert.rejects(tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' },
    input: {}, signal: f.controller.signal }, { emitSurface: async emission => { f.emitted.push(emission); } }), /Copy keys on a local Tovu host/);
  assert.deepEqual(f.emitted, []);
  assert.deepEqual(f.calls, []);
});

test('C3: an installation without an instance authorizer still requires workspace admission', async () => {
  const f = fixture();
  delete f.deps.gatedMutations.gatewayDeps.authorizeInstance;
  const pending = f.run(); await keys(f);
  f.answer({ ids: ['two'], overwrite: false });
  await pending;
  assert.deepEqual(f.calls, [{ sourceSiteId: 'source', ids: ['two'], overwrite: false, actorId: 'owner' }]);
  assert.deepEqual(f.permissions, ['system.write', 'system.write', 'system.write']);
});

test('C3: cancellation during inventory discovery emits no card', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.list = async () => { f.controller.abort(); return f.sources; };
  assert.deepEqual(await f.run(), { results: [], reasonCode: 'abandoned' });
  assert.deepEqual(f.emitted, []);
  assert.deepEqual(f.calls, []);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('C3: cancellation while the exchange opens is observed before its first question', async () => {
  const f = fixture();
  const store = { ...f.surfaceExchanges, open: (required: Parameters<typeof f.surfaceExchanges.open>[0]) => {
    const exchange = f.surfaceExchanges.open(required);
    f.controller.abort();
    return exchange;
  } };
  const tool = buildCredentialCopyRegistrations({ deps: f.deps, surfaces: { surfaceExchanges: store } })[0]!;
  const result = await tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' },
    input: {}, signal: f.controller.signal }, { emitSurface: async emission => { f.emitted.push(emission); } });
  assert.deepEqual(result, { results: [], reasonCode: 'abandoned' });
  assert.deepEqual(f.emitted, []);
  assert.deepEqual(f.calls, []);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('C3: cancellation during the final permission check prevents a copy', async () => {
  const f = fixture();
  let admissions = 0;
  const deps = { ...f.deps, authorize: async () => {
    if (++admissions === 3) f.controller.abort();
    return { allowed: true, reason: 'matched' };
  } };
  const tool = buildCredentialCopyRegistrations({ deps, surfaces: { surfaceExchanges: f.surfaceExchanges } })[0]!;
  const pending = tool.handler({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' },
    input: {}, signal: f.controller.signal }, { emitSurface: async emission => { f.emitted.push(emission); } });
  await keys(f); f.answer({ ids: ['one'], overwrite: false });
  assert.deepEqual(await pending, { results: [], reasonCode: 'abandoned' });
  assert.equal(admissions, 3);
  assert.deepEqual(f.calls, []);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('C3: an extra source-card field refuses the entire selection', async () => {
  const f = fixture(); const pending = f.run(); await turn();
  f.answer({ sourceSiteId: 'source', overwrite: true });
  assert.deepEqual(await pending, { results: [], reasonCode: 'invalid-selection' });
  assert.deepEqual(f.calls, []);
  assert.match(f.resource().text, /Choose an available source and its keys/);
});

for (const ids of [undefined, 'one', [1]]) {
  test(`C3: malformed key IDs ${JSON.stringify(ids)} are refused without copying`, async () => {
    const f = fixture(); const pending = f.run(); await keys(f);
    f.answer({ ids, overwrite: false });
    assert.deepEqual(await pending, { results: [], reasonCode: 'invalid-selection' });
    assert.deepEqual(f.calls, []);
  });
}

for (const [reasonCode, message] of [
  ['source-busy', 'The source is busy. Try again.'],
  ['unrecognized-source-state', 'Copying keys failed. Try again.'],
] as const) {
  test(`C3: inventory refusal ${reasonCode} uses fixed safe copy`, async () => {
    const f = fixture();
    f.deps.localCredentialCopy!.list = async () => [{ siteId: 'source', name: 'Source', keys: [], reasonCode, message: 'secret-canary' }];
    const pending = f.run(); await turn(); f.answer({ sourceSiteId: 'source' });
    assert.deepEqual(await pending, { results: [], reasonCode });
    assert.ok(f.resource().text.includes(message));
    assert.doesNotMatch(f.resource().text, /secret-canary/);
    assert.deepEqual(f.calls, []);
  });
}

test('C3: a source that needs upgrading during copy shows the reviewed instruction', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.copy = async () => { throw Object.assign(new Error('secret-canary'), { reasonCode: 'source-needs-upgrade' }); };
  const pending = f.run(); await keys(f); f.answer({ ids: ['one'], overwrite: false });
  assert.deepEqual(await pending, { results: [], reasonCode: 'source-needs-upgrade' });
  assert.match(f.resource().text, /Start Source once in Tovu to upgrade it, then copy\./);
  assert.doesNotMatch(f.resource().text, /secret-canary/);
});

for (const failure of [null, 'secret-canary', new Error('secret-canary'), { reasonCode: 42 }, { reasonCode: 'unknown-code' }]) {
  test(`C3: unexpected copy failure ${String(failure)} is reduced to fixed failure text`, async () => {
    const f = fixture(); f.deps.localCredentialCopy!.copy = async () => { throw failure; };
    const pending = f.run(); await keys(f); f.answer({ ids: ['one'], overwrite: false });
    assert.deepEqual(await pending, { results: [], reasonCode: 'copy-failed' });
    assert.match(f.resource().text, /Copying keys failed\. Try again\./);
    assert.doesNotMatch(f.resource().text, /secret-canary|unknown-code/);
    assert.equal(f.surfaceExchanges.size(), 0);
  });
}

test('C3: mixed outcomes preserve safe summaries, truncate tails, and display missing metadata safely', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.copy = async () => [
    { kind: 'vendor', id: 'one', status: 'copied', last4: 'private-prefixABCD' },
    { kind: 'vendor', id: 'two', status: 'copied' },
    { kind: 'vendor', id: 'no-longer-listed', status: 'failed' },
  ];
  const pending = f.run(); await keys(f); f.answer({ ids: ['one', 'two'], overwrite: false });
  assert.deepEqual(await pending, { results: [
    { kind: 'vendor', id: 'one', status: 'copied', last4: 'ABCD' },
    { kind: 'vendor', id: 'two', status: 'copied' },
    { kind: 'vendor', id: 'no-longer-listed', status: 'failed' },
  ] });
  assert.match(f.resource().text, /not copied — copy-failed/);
  assert.match(f.resource().text, /data-state="partial"/);
  assert.match(f.resource().text, /DNS/);
  assert.doesNotMatch(JSON.stringify(f.emitted), /private-prefix/);
  assert.equal(f.surfaceExchanges.size(), 0);
});

for (const results of [[], [{ kind: 'vendor' as const, id: 'one', status: 'failed' as const, reasonCode: 'source-missing' as const }]]) {
  test(`copy outcome renders ${results.length ? 'failure without a copied row' : 'empty success'}`, async () => {
    const f = fixture();
    f.deps.localCredentialCopy!.copy = async () => results;
    const pending = f.run(); await keys(f); f.answer({ ids: ['one'], overwrite: false });
    assert.deepEqual(await pending, { results });
    // The shared outcome renderer maps failure/success to its DOM states failed/done.
    assert.match(f.resource().text, new RegExp(`data-state="${results.length ? 'failed' : 'done'}"`));
    assert.equal(f.surfaceExchanges.size(), 0);
  });
}

test('key picker preserves custom kind and empty publish-host labels', async () => {
  const f = fixture();
  f.deps.localCredentialCopy!.list = async () => [{ siteId: 'source', name: 'Source', keys: [
    { kind: 'custom', id: 'one', label: 'Custom', provider: null, worksFor: [], publishHosts: [] },
  ] }];
  const pending = f.run(); await keys(f);
  assert.match(f.resource().text, /Custom · custom · Works for: none · No static publish host/);
  f.answer({ [SURFACE_DISMISSED_PARAM]: true });
  assert.deepEqual(await pending, { results: [], reasonCode: 'cancelled' });
  assert.deepEqual(f.calls, []);
});
