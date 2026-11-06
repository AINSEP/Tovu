import assert from 'node:assert/strict';
import test from 'node:test';
import { FormNotificationError, FORM_NOTIFY_DELIVERY_EVENT } from '@jini-ai/cms/forms';
import { outboxRetryPolicyForEvent } from '../outbox-retry-policies.js';
import { formsMailOutboxReady } from '#src/features/forms/mail-outbox-readiness';

test('notification jobs use the external delivery policy and permanent failures are terminal', () => {
  const event = { id: 'n', name: FORM_NOTIFY_DELIVERY_EVENT, workspaceId: 'w', occurredAt: 'now', payload: {} };
  const policy = outboxRetryPolicyForEvent({ event });
  assert.ok(policy);
  assert.equal(policy.retryable!({ error: new FormNotificationError({ submissionId: 's', retryable: false }) }), false);
  assert.equal(policy.retryable!({ error: new FormNotificationError({ submissionId: 's', retryable: true }) }), true);
});
test('only the forms capability advertises the wired durable email path', () => {
  assert.equal(formsMailOutboxReady('forms'), true);
  assert.equal(formsMailOutboxReady('newsletter'), false);
});

for (const retryable of [true, false]) test(`outbox persists notification failure as ${retryable ? 'pending retry' : 'terminal failed'}`, async () => {
  const { InMemoryEventBus, processOutbox } = await import('../index.js');
  const now = '2026-11-04T00:00:00.000Z';
  const event = { id: 'n', name: FORM_NOTIFY_DELIVERY_EVENT, workspaceId: 'w', occurredAt: now, payload: {} };
  const failures: { nextStatus: string; error: string; nextAttemptAt: string }[] = [];
  const bus = new InMemoryEventBus();
  await bus.subscribe({ eventName: event.name, handler: async () => { throw new FormNotificationError({ submissionId: 's', retryable }); } });
  const outbox = { enqueue: async () => {}, claimPending: async () => [{ id: event.id, event, status: 'processing' as const, attempts: 1, nextAttemptAt: now, createdAt: now }], markDelivered: async () => assert.fail('failed mail is never delivered'), markFailed: async (failure: { nextStatus: 'pending' | 'failed'; error: string; nextAttemptAt: string }) => { failures.push(failure); } };
  await processOutbox({ outbox, bus, clock: { nowMs: () => Date.parse(now) } }, { random: () => 0 });
  assert.equal(failures[0]!.nextStatus, retryable ? 'pending' : 'failed');
  assert.match(failures[0]!.error, /Form notification failed/);
  assert.ok(Date.parse(failures[0]!.nextAttemptAt) > Date.parse(now));
});
