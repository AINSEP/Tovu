import assert from 'node:assert/strict';
import test from 'node:test';
import type { DomainEvent } from '@jini-ai/cms/core';

import { toEnqueueOnlyOutbox } from '../enqueue-only-outbox.js';
import { InMemoryEventBus, InMemoryOutbox } from '../memory-bus.js';
import { processOutbox } from '../outbox-worker.js';

// Author Checklist: reject enqueueing an ID-only event, draining through the daemon view,
// swallowing an enqueue rejection, or losing the event on retry. The real owner reads/delivers it.
// F1.2/F6.3: ID-only checks permit a dropped payload or a wrong workspace envelope.
test('the serving owner receives the complete event after an enqueue-only daemon drain', async () => {
  const inner = new InMemoryOutbox();
  const view = toEnqueueOnlyOutbox(inner);
  const bus = new InMemoryEventBus();
  const delivered: DomainEvent<unknown>[] = [];
  await bus.subscribe({ eventName: 'entry.updated', handler: async (event) => { delivered.push(event); } });
  await view.enqueue({
    id: 'event-42', name: 'entry.updated', occurredAt: '2026-10-01T00:00:00.000Z', workspaceId: 'workspace-a',
    actorId: 'operator-7', metadata: { correlationId: 'run-9' }, payload: { entryId: 'post-23', title: 'Updated title', version: 4 },
  });
  const clock = { nowMs: () => Date.parse('2026-10-01T01:00:00.000Z') };
  assert.equal(await processOutbox({ outbox: view, bus, clock }), 0);
  assert.deepEqual(delivered, []);
  assert.equal(await processOutbox({ outbox: inner, bus, clock }), 1);
  assert.deepEqual(delivered, [{
    id: 'event-42', name: 'entry.updated', occurredAt: '2026-10-01T00:00:00.000Z', workspaceId: 'workspace-a',
    actorId: 'operator-7', metadata: { correlationId: 'run-9' }, payload: { entryId: 'post-23', title: 'Updated title', version: 4 },
  }]);
  assert.equal(await processOutbox({ outbox: inner, bus, clock }), 0);
});

test('a backing enqueue error reaches the daemon and a retry uses the same full event', async (t) => {
  const inner = new InMemoryOutbox();
  const enqueue = inner.enqueue.bind(inner);
  const failure = new Error('content database is locked');
  let attempts = 0;
  t.mock.method(inner, 'enqueue', async (event: DomainEvent) => {
    if (++attempts === 1) throw failure;
    await enqueue(event);
  });
  const view = toEnqueueOnlyOutbox(inner);
  const event: DomainEvent = {
    id: 'retry-event', name: 'comment.created', occurredAt: '2026-10-01T00:00:00.000Z', workspaceId: 'workspace-b',
    payload: { commentId: 'comment-8', body: 'Preserved comment' },
  };
  await assert.rejects(view.enqueue(event), (error) => error === failure);
  assert.deepEqual(await inner.claimPending({ batchSize: 10, nowIso: '2026-10-01T00:00:00.000Z' }), []);
  await view.enqueue(event);
  const rows = await inner.claimPending({ batchSize: 10, nowIso: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(rows.map((row) => row.event), [{
    id: 'retry-event', name: 'comment.created', occurredAt: '2026-10-01T00:00:00.000Z', workspaceId: 'workspace-b',
    payload: { commentId: 'comment-8', body: 'Preserved comment' },
  }]);
  assert.equal(attempts, 2);
});
