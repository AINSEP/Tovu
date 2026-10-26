import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductEvent } from '@jini-ai/analytics/product';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import { InMemoryEventBus } from '#src/contracts/core/events/index';
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
