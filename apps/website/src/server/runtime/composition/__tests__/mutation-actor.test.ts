import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { executeCommand } from '@jini-ai/cms/core';
import type { AttributedDomainEvent, DomainEvent } from '@jini-ai/core/contracts/events';
import { eachDialect } from '../../../../platform/db/kernel/__tests__/dialect-matrix.js';
import { SqliteChangeSetRepo } from '../../../../platform/db/sqlite/change-set-repo.sqlite.js';
import { SqliteOutboxAdapter } from '../../../../platform/db/sqlite/outbox-repo.sqlite.js';
import type { ContentKernel } from '../../../../platform/db/content-kernel.js';
import { actorForMutation, WORKER_SYSTEM_ACTOR_ID } from '../mutation-actor.js';

/** P10-H2.T: the composition root stamps who a mutation is attributed to from the trusted origin of
 *  the call, never from the principal id's shape. The same owner editing in the admin and through the
 *  assistant must persist two different kinds, and the change set and its outbox event must agree. */
const TABLES = ['change_sets', 'change_set_items', 'outbox_events'];

function makeStores(kernel: ContentKernel) {
  return { kernel, changeSets: new SqliteChangeSetRepo({ store: kernel }), outbox: new SqliteOutboxAdapter({ store: kernel }) };
}

async function editAs(stores: ReturnType<typeof makeStores>, origin: 'admin' | 'assistant', id: string) {
  let next = 0;
  const deps = { clock: { nowMs: () => Date.parse('2026-11-25T00:00:00.000Z') }, idGen: { newId: () => `${id}-${next++}` },
    changeSets: stores.changeSets, outbox: stores.outbox };
  return executeCommand({
    deps,
    command: { workspaceId: 'workspace-1', actor: actorForMutation({ principalId: 'owner-1', origin }), summary: `${origin} edit` },
    mutation: { entityType: 'post', entityId: 'post-1', operation: 'update', captureInverse: async () => null, execute: async () => ({ ok: true }) },
  });
}

for (const adapter of eachDialect({ tables: TABLES, make: kernel => makeStores(kernel as unknown as ContentKernel) })) {
  test(`[${adapter.name}] the same owner's admin edit and assistant edit persist different kinds and matching outbox actors`, async t => {
    const stores = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => (stores.kernel as unknown as { close(): Promise<void> }).close());
    const admin = await editAs(stores, 'admin', 'admin');
    const assistant = await editAs(stores, 'assistant', 'assistant');
    const rows = await stores.kernel.query<{ id: string; actor_id: string; actor_kind: string | null }>(sql`SELECT id, actor_id, actor_kind FROM change_sets ORDER BY id`);
    assert.deepEqual(rows.map(row => [row.id, row.actor_id, row.actor_kind]),
      [[admin.changeSetId, 'owner-1', 'user'], [assistant.changeSetId, 'owner-1', 'agent']]);
    const events = (await stores.kernel.query<{ event_json: string }>(sql`SELECT event_json FROM outbox_events`))
      .map(row => JSON.parse(row.event_json) as DomainEvent);
    const actorFor = (changeSetId: string) => events.find(event => event.changeSetId === changeSetId)?.actor;
    assert.deepEqual(actorFor(admin.changeSetId), { id: 'owner-1', kind: 'user' });
    assert.deepEqual(actorFor(assistant.changeSetId), { id: 'owner-1', kind: 'agent' });
    assert.deepEqual((await stores.changeSets.findById({ workspaceId: 'workspace-1', id: assistant.changeSetId }))?.changeSet.actor, { id: 'owner-1', kind: 'agent' });
  });

  test(`[${adapter.name}] a legacy change set with no recorded kind reads back as unknown, not guessed`, async t => {
    const stores = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => (stores.kernel as unknown as { close(): Promise<void> }).close());
    await stores.kernel.execute(sql`INSERT INTO change_sets (id, workspace_id, actor_id, status, summary, created_at)
      VALUES ('legacy-1', 'workspace-1', 'owner-1', 'applied', 'Before provenance', '2026-01-01T00:00:00.000Z')`);
    const legacy = (await stores.changeSets.findById({ workspaceId: 'workspace-1', id: 'legacy-1' }))?.changeSet;
    assert.equal(legacy?.actorId, 'owner-1');
    assert.equal(legacy && 'actor' in legacy, false, 'no fabricated actor kind');
  });

  test(`[${adapter.name}] a failed atomic insert leaves neither a stamped change set nor an outbox event`, async t => {
    const stores = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => (stores.kernel as unknown as { close(): Promise<void> }).close());
    const actor = actorForMutation({ principalId: 'owner-1', origin: 'assistant' });
    const event: AttributedDomainEvent = { id: 'event-1', name: 'change-set.applied', occurredAt: '2026-11-25T00:00:00.000Z', workspaceId: 'workspace-1',
      actorId: actor.id, actor, changeSetId: 'set-1', payload: {} };
    // Occupy the event id so the outbox row is the write that fails, after the header and items.
    await stores.outbox.enqueue(event);
    const record = { id: 'set-1', workspaceId: 'workspace-1', actorId: actor.id, actor, status: 'applied' as const, summary: 'assistant edit', createdAt: '2026-11-25T00:00:00.000Z' };
    await assert.rejects(stores.changeSets.insert({ record, items: [] }, { event }));
    assert.deepEqual(await stores.kernel.query(sql`SELECT id FROM change_sets`), []);
    assert.equal((await stores.kernel.query(sql`SELECT id FROM outbox_events`)).length, 1, 'only the pre-existing event remains');
  });

  test(`[${adapter.name}] the real SQL binding preserves the same actor after outbox preparation`, async t => {
    const stores = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => (stores.kernel as unknown as { close(): Promise<void> }).close());
    // The host preparation hook may enrich the envelope, but it must not re-attribute the write:
    // the stored event keeps the writer's actor, matching the change-set header it lands with.
    const changeSets = new SqliteChangeSetRepo({ store: stores.kernel }, {
      prepareOutboxEvent: ({ event }) => ({ ...event, actorId: 'hook-principal', actor: { id: 'hook-principal', kind: 'user' }, payload: { prepared: true } }),
    });
    const actor = actorForMutation({ principalId: 'owner-1', origin: 'assistant' });
    const event: AttributedDomainEvent = { id: 'event-prep', name: 'change-set.applied', occurredAt: '2026-11-25T00:00:00.000Z', workspaceId: 'workspace-1',
      actorId: actor.id, actor, changeSetId: 'set-prep', payload: {} };
    const record = { id: 'set-prep', workspaceId: 'workspace-1', actorId: actor.id, actor, status: 'applied' as const, summary: 'assistant edit', createdAt: '2026-11-25T00:00:00.000Z' };
    await changeSets.insert({ record, items: [] }, { event });
    const [stored] = (await stores.kernel.query<{ event_json: string }>(sql`SELECT event_json FROM outbox_events WHERE id = 'event-prep'`))
      .map(row => JSON.parse(row.event_json) as DomainEvent);
    assert.deepEqual(stored?.payload, { prepared: true }, 'the hook still prepares the envelope');
    assert.deepEqual([stored?.actorId, stored?.actor], ['owner-1', { id: 'owner-1', kind: 'agent' }]);
    const header = (await stores.changeSets.findById({ workspaceId: 'workspace-1', id: 'set-prep' }))?.changeSet;
    assert.deepEqual([header?.actorId, header?.actor], [stored?.actorId, stored?.actor], 'header and stored event agree');
  });
}

test('origins map to kinds from the trusted call site, never from the id', () => {
  assert.deepEqual(actorForMutation({ principalId: 'owner-1', origin: 'admin' }), { id: 'owner-1', kind: 'user' });
  assert.deepEqual(actorForMutation({ principalId: 'agent-looking-user', origin: 'admin' }), { id: 'agent-looking-user', kind: 'user' });
  // CLI and BYOK executors run the same assistant tool registrations, so both bind the assistant origin.
  assert.deepEqual(actorForMutation({ principalId: 'owner-1', origin: 'assistant' }), { id: 'owner-1', kind: 'agent' });
  assert.deepEqual(actorForMutation({ origin: 'worker' }), { id: WORKER_SYSTEM_ACTOR_ID, kind: 'system' });
});
