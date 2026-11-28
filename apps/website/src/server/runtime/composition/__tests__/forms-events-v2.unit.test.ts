import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductEvent } from '@jini-ai/core/contracts/observability';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from '@jini-ai/cms/forms';
import { InMemoryEventBus } from '@jini-ai/infra/events/memory-bus';
import { createFormsModule } from '../modules/forms.js';

test('committed forms require original and still-active consent; delayed events never contain receipt data', async () => {
  const bus = new InMemoryEventBus(), events: ProductEvent[] = [];
  const definitions = new InMemoryFormDefinitionRepo();
  await definitions.create({ id: 'form-1', workspaceId: 'workspace-1', name: 'Contact', slug: 'contact',
    fields: [], notify: { enabled: false, recipients: [] }, status: 'active', version: 1,
    createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' });
  let current = true;
  createFormsModule({ bus, formDefinitionRepo: definitions, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    tracker: createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } }),
    visitorAnalyticsDeliveryAllowed: async () => current,
    mailer: {
      capabilities: () => ({ driver: 'memory', supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error('Notifications disabled'); }, sendBatch: async () => { throw new Error('Notifications disabled'); },
    },
  }).start!();
  const base = { id: 'event-1', name: 'form.submission.received', aggregateId: 'submission-1', workspaceId: 'workspace-1', occurredAt: '2026-10-26T00:00:00Z' };
  const payload = { workspaceId: 'workspace-1', formDefinitionId: 'form-1', submissionId: 'submission-1' };
  await bus.publish({ ...base, payload }); assert.deepEqual(events, []);
  const analyticsProvenance = { granted: true as const, subjectId: 'visitor:opaque', consentProof: {
    receiptId: ['fake', 'receipt', '0123456789'].join('_'), policyVersion: '1',
  } };
  current = false;
  await bus.publish({ ...base, payload: { ...payload, analyticsProvenance } }); assert.deepEqual(events, []);
  current = true;
  await bus.publish({ ...base, payload: { ...payload, analyticsProvenance } });
  assert.deepEqual(events, [{ name: 'form_submitted', userId: 'visitor:opaque', properties: {
    eventId: 'event-1', formId: 'form-1', formSlug: 'contact', deliveryMode: 'live',
  } }]);
  const find = definitions.findById.bind(definitions);
  definitions.findById = async input => { const definition = await find(input); current = false; return definition; };
  await bus.publish({ ...base, payload: { ...payload, analyticsProvenance } });
  assert.deepEqual(events, [{ name: 'form_submitted', userId: 'visitor:opaque', properties: {
    eventId: 'event-1', formId: 'form-1', formSlug: 'contact', deliveryMode: 'live',
  } }], 'a revoke during the definition read suppresses the delayed delivery');
});

test('form_submitted needs every proof clause: a granted subject id, a consent receipt and a host consent check', async () => {
  const definitions = new InMemoryFormDefinitionRepo();
  await definitions.create({ id: 'form-1', workspaceId: 'workspace-1', name: 'Contact', slug: 'contact',
    fields: [], notify: { enabled: false, recipients: [] }, status: 'active', version: 1,
    createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' });
  const mailer = {
    capabilities: () => ({ driver: 'memory', supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async () => { throw new Error('Notifications disabled'); }, sendBatch: async () => { throw new Error('Notifications disabled'); },
  };
  const start = ({ consentCheck }: { consentCheck?: () => Promise<boolean> }) => {
    const bus = new InMemoryEventBus(), events: ProductEvent[] = [];
    createFormsModule({ bus, formDefinitionRepo: definitions, formSubmissionRepo: new InMemoryFormSubmissionRepo(), mailer,
      tracker: createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } }),
      ...(consentCheck ? { visitorAnalyticsDeliveryAllowed: consentCheck } : {}) }).start!();
    return { bus, events };
  };
  const base = { id: 'event-2', name: 'form.submission.received', aggregateId: 'submission-2', workspaceId: 'workspace-1', occurredAt: '2026-10-26T00:00:00Z' };
  const payload = { workspaceId: 'workspace-1', formDefinitionId: 'form-1', submissionId: 'submission-2' };
  const consentProof = { receiptId: 'receipt-a', policyVersion: '1' };
  const valid = { granted: true as const, subjectId: 'visitor:opaque', consentProof };
  let checks = 0;
  const allowed = start({ consentCheck: async () => { checks++; return true; } });
  for (const analyticsProvenance of [{ ...valid, granted: false }, { ...valid, subjectId: '' }, { granted: true as const, subjectId: 'visitor:opaque' }]) {
    await allowed.bus.publish({ ...base, payload: { ...payload, analyticsProvenance } });
  }
  assert.deepEqual(allowed.events, []);
  assert.equal(checks, 0, 'a proof without a receipt never reaches the consent check');
  await allowed.bus.publish({ ...base, payload: { ...payload, deliveryMode: 'remote_import', analyticsProvenance: valid } });
  assert.deepEqual(allowed.events, [{ name: 'form_submitted', userId: 'visitor:opaque', properties: {
    eventId: 'event-2', formId: 'form-1', formSlug: 'contact', deliveryMode: 'remote_import',
  } }]);
  assert.equal(checks, 1);

  const unchecked = start({});
  await unchecked.bus.publish({ ...base, payload: { ...payload, analyticsProvenance: valid } });
  assert.deepEqual(unchecked.events, [], 'a host without a consent check never delivers');
});

test('a notify failure with no error value is logged as its fixed line alone', async (t) => {
  const definitions = new InMemoryFormDefinitionRepo();
  definitions.findById = () => Promise.reject(undefined);
  const bus = new InMemoryEventBus();
  createFormsModule({ bus, formDefinitionRepo: definitions, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    tracker: createTracker({ productAnalytics: { capture() {}, identify() {} } }),
    mailer: {
      capabilities: () => ({ driver: 'memory', supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error('unused'); }, sendBatch: async () => { throw new Error('unused'); },
    } }).start!();
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  await bus.publish({ id: 'event-3', name: 'form.submission.received', aggregateId: 'submission-3', workspaceId: 'workspace-1',
    occurredAt: '2026-10-26T00:00:00Z', payload: { workspaceId: 'workspace-1', formDefinitionId: 'form-1', submissionId: 'submission-3' } });
  assert.deepEqual(warnings, [['[forms:notify] subscriber failed:']]);
});
