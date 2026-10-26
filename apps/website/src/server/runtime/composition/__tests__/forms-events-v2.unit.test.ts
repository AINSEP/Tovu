import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductEvent } from '@jini-ai/analytics/product';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from '@jini-ai/cms/forms';
import { InMemoryEventBus } from '#src/contracts/core/events/index';
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
