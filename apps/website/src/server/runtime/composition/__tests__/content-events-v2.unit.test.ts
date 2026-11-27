import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductEvent } from '@jini-ai/core/contracts/observability';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import { InMemoryEventBus } from '@jini-ai/infra/events/memory-bus';
import { registerContentAnalytics } from '../content-events.js';

test('committed content events cover create, save and publish for both post and page, without content properties', async () => {
  const bus = new InMemoryEventBus(), events: ProductEvent[] = [];
  const tracker = createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } });
  await registerContentAnalytics({ deps: { bus, tracker, workspaceId: 'workspace-1' } });
  for (const kind of ['post', 'page']) {
    for (const topic of ['content.created', 'content.saved', 'entry.published']) {
      await bus.publish({ id: `${kind}:${topic}`, name: topic, workspaceId: 'workspace-1', aggregateId: 'entry-1', occurredAt: '2026-10-26T00:00:00Z',
        payload: { contentType: kind, entryId: 'entry-1', actorId: 'owner-1', source: 'admin', title: 'Private title', body: 'Private content' } });
    }
  }
  assert.deepEqual(events.map(event => event.name), ['post_created', 'content_saved', 'post_published', 'page_created', 'content_saved', 'page_published']);
  assert.deepEqual(events[2], { name: 'post_published', userId: 'owner-1', properties: {
    eventId: 'post:entry.published', resourceKind: 'post', resourceId: 'entry-1', source: 'admin',
  } });
  assert.ok(events.every(event => Object.keys(event.properties!).sort().join(',') === 'eventId,resourceId,resourceKind,source'));
  await bus.publish({ id: 'other-site', name: 'content.created', workspaceId: 'workspace-other', occurredAt: '2026-10-26T00:00:00Z', payload: { contentType: 'post', entryId: 'entry-1' } });
  assert.equal(events.length, 6);
});

test('content events use aggregate and system attribution fallbacks without counting unrelated or unkeyed content', async () => {
  const bus = new InMemoryEventBus(), events: ProductEvent[] = [];
  const tracker = createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } });
  await registerContentAnalytics({ deps: { bus, tracker, workspaceId: 'newsroom' } });
  const base = { workspaceId: 'newsroom', occurredAt: '2026-11-08T12:00:00.000Z' };
  await bus.publish({ ...base, id: 'first', name: 'content.created', aggregateId: 'page-47',
    payload: { contentType: 'page', source: 'migration', initialStatus: 'draft' } });
  await bus.publish({ ...base, id: 'second', name: 'content.saved', aggregateId: 'wrong-id',
    payload: { contentType: 'post', entryId: 'post-53', actorId: 'editor', source: 'assistant' } });
  await bus.publish({ ...base, id: 'other', name: 'content.saved', aggregateId: 'widget-5',
    payload: { contentType: 'widget' } });
  await bus.publish({ ...base, id: 'unkeyed', name: 'content.saved', payload: { contentType: 'post' } });
  assert.deepEqual(events, [
    { name: 'page_created', userId: 'system:newsroom', properties: { eventId: 'first', resourceKind: 'page',
      resourceId: 'page-47', source: 'service', initialStatus: 'draft' } },
    { name: 'content_saved', userId: 'editor', properties: { eventId: 'second', resourceKind: 'post',
      resourceId: 'post-53', source: 'assistant' } },
  ]);
});
