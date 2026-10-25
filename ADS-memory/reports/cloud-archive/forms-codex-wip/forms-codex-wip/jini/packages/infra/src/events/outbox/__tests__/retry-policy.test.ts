import { expect, test } from 'vitest';
import { processOutbox, type OutboxRetryPolicyResolver } from '../index.js';
import { fixture, row } from './fixtures.js';

const resolver: OutboxRetryPolicyResolver = ({ event }) => event.name === 'demo.event' ? { maxAttempts: 12, backoffMs: () => 90_000 } : undefined;

test('per-event retry policy changes both schedule and cap; default behavior stays at six', async () => {
  const custom = fixture([row('custom', 6)]);
  custom.bus.publish.mockRejectedValue(new Error('offline'));
  await processOutbox(custom.args, { retryPolicyForEvent: resolver });
  expect(custom.outbox.markFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 'custom', nextStatus: 'pending', nextAttemptAt: '2026-02-21T12:01:30.000Z' }));
  const baseline = fixture([row('default', 6)]);
  baseline.bus.publish.mockRejectedValue(new Error('offline'));
  await processOutbox(baseline.args);
  expect(baseline.outbox.markFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 'default', nextStatus: 'failed', nextAttemptAt: '2026-02-21T12:08:00.000Z' }));
});

test('non-retryable failures seal only their own child and later children still deliver', async () => {
  const f = fixture([row('bad'), row('good')]);
  f.bus.publish.mockRejectedValueOnce(new Error('reconnect'));
  await processOutbox(f.args, { retryPolicyForEvent: () => ({ maxAttempts: 12, backoffMs: () => 1000, retryable: () => false }) });
  expect(f.outbox.markFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 'bad', nextStatus: 'failed' }));
  expect(f.outbox.markDelivered).toHaveBeenCalledWith({ id: 'good' });
});

test('expired claim above default cap still publishes under custom cap, preserving event identity', async () => {
  const record = row('recovered', 7);
  const f = fixture([record]);
  await processOutbox(f.args, { retryPolicyForEvent: resolver });
  expect(f.bus.publish.mock.calls[0]![0].event).toBe(record.event);
  expect(f.outbox.markDelivered).toHaveBeenCalledWith({ id: 'recovered' });
});
