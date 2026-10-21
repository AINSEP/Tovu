import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySettingsRepo } from '../../settings/index.js';
import { ensureCommentsSettingDefinitions, setCommentsSettings, type SetCommentsSettingsDeps } from '../settings.js';
import type { CommentRepoPort, CommentIngressPolicy, CommentWriteService } from '@jini-ai/cms/comments';
import { createCommentsSelectionStore, ensureCommentsProviderDefinition, createCommentsCapability } from '../provider-selection.js';

async function fixture() {
  let nextId = 0; let allowed = true; let writes = 0;
  const settingsRepo = new InMemorySettingsRepo();
  const deps: SetCommentsSettingsDeps = { settingsRepo, clock: { nowIso: () => '2026-10-21T00:00:00.000Z' }, ids: { newId: () => `id-${++nextId}` },
    authorize: async () => ({ allowed, reason: allowed ? 'matched' : 'denied' }),
    principals: { findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) => ({ workspaceId, id, status: 'active' }) } as unknown as SetCommentsSettingsDeps['principals'],
  };
  await ensureCommentsSettingDefinitions(deps, { workspaceId: 's', systemPrincipalId: 'system' });
  await ensureCommentsProviderDefinition({ deps, systemPrincipalId: 'system' });
  const module = { commentRepo: { listModerationQueue: async () => ({ items: [{ id: 'held' }], nextCursor: null }) } as unknown as CommentRepoPort,
    ingressPolicy: { submit: async () => ({ ok: false, reason: 'entry-not-found' }) } as CommentIngressPolicy,
    writeService: { applyModeration: async () => { writes++; return { ok: true }; }, purge: async () => { writes++; return { ok: true }; } } as CommentWriteService };
  return { deps, module, deny: () => { allowed = false; }, writes: () => writes };
}

test('provider choice defaults to built-in, persists per site and CAS refuses a stale card without a revision write', async () => {
  const f = await fixture();
  const store = createCommentsSelectionStore(f.deps);
  assert.deepEqual(await store.read({ siteId: 's' }), { providerId: 'built-in', revision: 0 });
  assert.equal(await store.compareAndSet({ siteId: 's', providerId: null, expectedRevision: 0, actorPrincipalId: 'owner' }), true);
  const disabled = await store.read({ siteId: 's' });
  assert.equal(disabled.providerId, null); assert.ok(disabled.revision > 0);
  assert.deepEqual(await store.read({ siteId: 'other' }), { providerId: 'built-in', revision: 0 });
  const before = await f.deps.settingsRepo.maxRevisionSeq();
  await assert.rejects(store.compareAndSet({ siteId: 's', providerId: 'built-in', expectedRevision: 0, actorPrincipalId: 'owner' }), /changed/);
  assert.equal(await f.deps.settingsRepo.maxRevisionSeq(), before);
  assert.deepEqual(await createCommentsSelectionStore(f.deps, {}).read({ siteId: 's' }), disabled, 'restart preserves explicit disable');
  await ensureCommentsProviderDefinition({ deps: { ...f.deps, clock: { nowMs: () => 0 } }, systemPrincipalId: 'system' }, {});
  await store.compareAndSet({ siteId: 's', providerId: 'built-in', expectedRevision: disabled.revision, actorPrincipalId: 'owner' });
  assert.equal((await store.read({ siteId: 's' })).providerId, 'built-in');
  f.deny();
  await assert.rejects(store.compareAndSet({ siteId: 's', providerId: null, expectedRevision: (await store.read({ siteId: 's' })).revision, actorPrincipalId: 'owner' }), /not authorized/);
});

test('built-in runtime gates route/tool mutations for provider disable and settings disable while keeping stored reads', async () => {
  const f = await fixture();
  const args = { siteId: 's', module: f.module, commentsReady: Promise.resolve(), settingsReady: Promise.resolve(), settings: f.deps };
  const runtime = createCommentsCapability(args, {});
  const moderation = { workspaceId: 's', id: 'c', expectedVersion: 1, action: 'approve', toStatus: 'approved', actorPrincipalId: 'owner', note: null } as const;
  assert.deepEqual(await runtime.writeService.applyModeration(moderation), { ok: true });
  assert.deepEqual(await runtime.writeService.purge({ workspaceId: 's', id: 'c', actorPrincipalId: 'owner', note: null }), { ok: true });
  assert.equal(f.writes(), 2);
  await assert.rejects(runtime.writeService.applyModeration({ ...moderation, action: 'submit' }), /Unsupported/);
  await assert.rejects(runtime.writeService.applyModeration({ ...moderation, workspaceId: 'other' }), /site mismatch/);
  assert.equal(await runtime.providers.resolve({ siteId: 'other', providerId: 'built-in' }), undefined);
  await runtime.providers.select({ siteId: 's', providerId: null, expectedRevision: 0, actorPrincipalId: 'owner' });
  await assert.rejects(runtime.writeService.applyModeration(moderation), /No stored/);
  const purge = { workspaceId: 's', id: 'c', actorPrincipalId: 'owner', note: null };
  assert.deepEqual(await runtime.writeService.purge(purge), { ok: true }, 'erasure is not gated on the public provider');
  await assert.rejects(runtime.writeService.purge({ ...purge, workspaceId: 'other' }), /site mismatch/);
  assert.equal((await f.module.commentRepo.listModerationQueue({ workspaceId: 's', status: 'pending', limit: 20 })).items.length, 1);
  const current = await runtime.providers.active({ siteId: 's' });
  await runtime.providers.select({ siteId: 's', providerId: 'built-in', expectedRevision: current.revision, actorPrincipalId: 'owner' });
  await setCommentsSettings(f.deps, { workspaceId: 's', patch: { enabled: false }, callerPrincipalId: 'owner' });
  await assert.rejects(runtime.writeService.applyModeration(moderation), /disabled/);
  assert.equal(f.writes(), 3, 'two writes while enabled plus the ungated purge');
  createCommentsCapability(args);
});

test('an unregistered store still defaults safely, and native-clock writes persist through the ledger', async () => {
  const f = await fixture();
  const deps = { ...f.deps, settingsRepo: new InMemorySettingsRepo(), clock: { nowMs: () => 0 } };
  assert.deepEqual(await createCommentsSelectionStore(deps).read({ siteId: 's' }), { providerId: 'built-in', revision: 0 });
  await ensureCommentsProviderDefinition({ deps, systemPrincipalId: 'system' });
  await createCommentsSelectionStore(deps).compareAndSet({ siteId: 's', providerId: 'built-in', expectedRevision: 0, actorPrincipalId: 'owner' });
  assert.equal((await createCommentsSelectionStore(deps).read({ siteId: 's' })).providerId, 'built-in');
});

test('boot guard: a stored provider that is not registered reads as built-in without rewriting the row', async () => {
  const f = await fixture();
  const store = createCommentsSelectionStore(f.deps);
  await store.compareAndSet({ siteId: 's', providerId: 'vendor-gone', expectedRevision: 0, actorPrincipalId: 'owner' });
  const raw = await store.read({ siteId: 's' });
  assert.equal(raw.providerId, 'vendor-gone');
  const runtime = createCommentsCapability({ siteId: 's', module: f.module, commentsReady: Promise.resolve(), settingsReady: Promise.resolve(), settings: f.deps });
  const active = await runtime.providers.active({ siteId: 's' });
  assert.deepEqual([active.providerId, active.revision, active.adapter?.kind], ['built-in', raw.revision, 'stored']);
  assert.equal((await store.read({ siteId: 's' })).providerId, 'vendor-gone', 'the guard never writes');
  await runtime.providers.select({ siteId: 's', providerId: null, expectedRevision: raw.revision, actorPrincipalId: 'owner' });
  assert.equal((await runtime.providers.active({ siteId: 's' })).providerId, null, 'an explicit disable is not overridden');
});

test('a stored value that is not a provider id string (cleared or malformed row) reads as built-in, keeping its revision', async () => {
  const f = await fixture();
  for (const row of [{ state: 'set', valueJson: 7, seq: 4 }, { state: 'unset', valueJson: null, seq: 5 }]) {
    const settingsRepo = Object.assign(Object.create(f.deps.settingsRepo), { getWorkspaceValue: async () => row });
    assert.deepEqual(await createCommentsSelectionStore({ ...f.deps, settingsRepo }).read({ siteId: 's' }), { providerId: 'built-in', revision: row.seq });
  }
});

// The in-memory ledger refuses an overlapping transaction outright, so this pins "one winner" only; the
// Postgres interleaving (both read N, then queue on the advisory lock) is LOCAL-RUN NEEDED.
test('two confirmations of the same revision: exactly one commits', async () => {
  const f = await fixture();
  const store = createCommentsSelectionStore(f.deps);
  const outcomes = await Promise.allSettled([null, 'built-in'].map(providerId =>
    store.compareAndSet({ siteId: 's', providerId, expectedRevision: 0, actorPrincipalId: 'owner' })));
  assert.deepEqual(outcomes.map(outcome => outcome.status).sort(), ['fulfilled', 'rejected']);
  assert.ok((await store.read({ siteId: 's' })).revision > 0);
});

test('the guard compares at the value save: a revision that moved after the transaction opened is refused', async () => {
  const f = await fixture();
  const store = createCommentsSelectionStore(f.deps);
  const repo = f.deps.settingsRepo;
  const original = repo.appendRevision.bind(repo);
  let raced = false;
  // A competing writer lands between appendRevision and the value save (what the ledger lock now orders).
  repo.appendRevision = (async (...args: Parameters<typeof original>) => {
    const result = await original(...args);
    if (!raced) { raced = true; await createCommentsSelectionStore({ ...f.deps, settingsRepo: Object.assign(Object.create(repo), {
      transaction: (run: () => Promise<unknown>) => run() }) }).compareAndSet({ siteId: 's', providerId: null, expectedRevision: 0, actorPrincipalId: 'other' }); }
    return result;
  }) as typeof repo.appendRevision;
  await assert.rejects(store.compareAndSet({ siteId: 's', providerId: 'built-in', expectedRevision: 0, actorPrincipalId: 'owner' }), /changed/);
  // (A check at transaction open, the previous design, saw revision 0 here and saved the stale value.)
});
