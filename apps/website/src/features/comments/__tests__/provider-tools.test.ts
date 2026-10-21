import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/core/primitives';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import { InMemorySettingsRepo } from '../../settings/index.js';
import { buildCommentsRegistrations, commentsDerivedRisk, type CommentsToolDeps } from '../tool-registrations.js';
import { nativeToolMetadata } from '#src/contracts/core/tool-metadata/index';

function fixture() {
  let allowed = true; let providerId: string | null = 'built-in'; let revision = 0; let pending = 3; let writes = 0; let exchanges = 0;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++exchanges}` }, defaultChannel: 'mcp-ui' });
  const deps = { workspaceId: 's', authorize: async () => ({ allowed, reason: allowed ? 'matched' : 'denied' }),
    commentsReady: Promise.resolve(), commentsSettingsReady: Promise.resolve(), settingsRepo: new InMemorySettingsRepo(),
    commentRepo: { countByStatus: async () => pending },
    commentsProviders: { active: async () => ({ providerId, revision, adapter: providerId ? {} : undefined }),
      select: async (input: { providerId: string | null; expectedRevision: number }) => {
        if (input.expectedRevision !== revision) throw new Error('selection changed');
        providerId = input.providerId; revision++; writes++;
      } },
  } as unknown as CommentsToolDeps;
  const registrations = buildCommentsRegistrations(deps, { surfaceExchanges });
  const call = (id: string, input: unknown = {}, options: ToolExecutionOptions = {}) => {
    const tool = registrations.find(item => item.descriptor.id === id); assert.ok(tool);
    const ctx: ToolExecutionContext = { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input, signal: new AbortController().signal };
    return tool.handler(ctx, options);
  };
  const answer = (decision: 'confirm' | 'cancel' | 'typed', before?: () => void): ToolExecutionOptions => ({ emitSurface: async emission => {
    assert.match(JSON.stringify(emission), /Pending stored comments/);
    assert.match(JSON.stringify(emission), /3/);
    before?.();
    surfaceExchanges.deliver({ exchangeId: `exchange-${exchanges}`, principalId: 'owner', params: decision === 'typed' ? { __typedAnswer: 'yes' } : { decision } }, { toolId: 'comments_set_provider' });
  } });
  return { deps, registrations, call, answer, surfaceExchanges, deny: () => { allowed = false; },
    pending: () => { pending++; }, stale: () => { revision++; }, writes: () => writes };
}
const input = { providerId: null, expectedRevision: 0 };

test('provider tools preserve the eight tools, publish confirmation metadata and disclose pending count', async () => {
  const f = fixture();
  assert.equal(f.registrations.length, 10);
  assert.deepEqual(await f.call('comments_get_provider'), { providerId: 'built-in', revision: 0, ready: true, pendingCount: 3 });
  assert.equal(commentsDerivedRisk.get('comments_set_provider'), 'mutates-durable-state');
  assert.ok(nativeToolMetadata.redeemableIds.has('comments_set_provider'));
  await f.call('comments_set_provider', input, f.answer('confirm'));
  assert.equal(f.writes(), 1);
  assert.deepEqual(await f.call('comments_get_provider'), { providerId: null, revision: 1, ready: false, pendingCount: 3 });
  await f.call('comments_set_provider', { providerId: 'built-in', expectedRevision: 1 }, f.answer('confirm'));
  assert.equal(f.writes(), 2);
  assert.equal(f.surfaceExchanges.size(), 0);
});

test('provider switches require a real confirmation, known provider, current revision and rechecked authorization', async () => {
  const f = fixture();
  await assert.rejects(f.call('comments_set_provider', input), /NO_CONFIRMATION_CHANNEL/);
  for (const decision of ['cancel', 'typed'] as const) await f.call('comments_set_provider', input, f.answer(decision));
  for (const bad of [{ ...input, confirm: true }, { ...input, providerId: 'vendor' }, { ...input, expectedRevision: -1 }, { ...input, expectedRevision: .5 }, { ...input, expectedRevision: 5 }, { providerId: null }]) {
    await assert.rejects(f.call('comments_set_provider', bad, f.answer('confirm')));
  }
  await assert.rejects(f.call('comments_set_provider', input, f.answer('confirm', f.deny)), /not authorized/);
  assert.equal(f.writes(), 0);
  assert.equal(f.surfaceExchanges.size(), 0);
  await assert.rejects(f.call('comments_get_provider'), /not authorized/);
});

test('new pending comments, stale cards and unavailable provider services fail closed', async () => {
  for (const change of ['pending', 'stale'] as const) {
    const f = fixture();
    await assert.rejects(f.call('comments_set_provider', input, f.answer('confirm', f[change])), change === 'pending' ? /More comments arrived/ : /selection changed/);
    assert.equal(f.writes(), 0); assert.equal(f.surfaceExchanges.size(), 0);
  }
  const f = fixture(); f.deps.commentsProviders = undefined;
  await assert.rejects(f.call('comments_get_provider'), /unavailable/);
});
