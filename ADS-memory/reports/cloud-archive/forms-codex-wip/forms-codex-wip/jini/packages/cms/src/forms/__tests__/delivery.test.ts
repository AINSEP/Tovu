import assert from 'node:assert/strict';
import { test } from 'vitest';
import { deliverFormJob, FormDeliveryError, planFormDeliveries, createFormDeliverySubscriptions, type FormDeliveryBinding, type FormDeliveryJob, type FormDeliveryPlan, type FormDeliveryPlanPort } from '../delivery.js';
import { InMemoryEventBus } from './eventing.fixture.js';

const binding: FormDeliveryBinding = { bindingId: 'sheet-a', adapterId: 'sheets', connectionRef: 'conn-a', enabled: true, config: { tab: 'A' } };
const snapshot = { form: { slug: 'contact', fields: [] }, submission: { id: 's', answers: { text: '=hello' }, submittedAt: '2026-10-20T00:00:00.000Z' } };
/** Typed transactional fake: publish only a completed build; serialization comes from the SQL suite. */
class Plans implements FormDeliveryPlanPort {
  stored: FormDeliveryPlan | undefined;
  async once(input: Parameters<FormDeliveryPlanPort['once']>[0]): Promise<FormDeliveryPlan> {
    if (this.stored) return structuredClone(this.stored);
    this.stored = structuredClone(await input.build());
    return structuredClone(this.stored);
  }
}

test('replay keeps selection, configuration, payload, child identity and dedupe key after settings change', async () => {
  const plans = new Plans();
  let bindings = [binding, { ...binding, bindingId: 'off', enabled: false }, { ...binding, bindingId: 'other', formIds: ['another-form'] }];
  let n = 0;
  const deps = { plans, bindings: async () => bindings, snapshot: async () => snapshot, newId: () => `job-${++n}`, nowIso: () => snapshot.submission.submittedAt };
  const input = { deps, workspaceId: 'w', submissionId: 's', formDefinitionId: 'f' };
  const first = await planFormDeliveries(input);
  bindings = [{ ...binding, bindingId: 'new', config: { tab: 'B' } }];
  snapshot.submission.answers.text = 'edited';
  const second = await planFormDeliveries(input);
  assert.deepEqual(second, first);
  assert.equal(second.jobs.length, 1);
  assert.equal(second.jobs[0]!.payload.idempotencyKey, JSON.stringify(['s', 'sheet-a']));
  assert.equal(second.jobs[0]!.payload.snapshot.submission.answers.text, '=hello');
  assert.equal(n, 1);
});

test('an empty plan prevents newly added settings from backfilling an already handled submission', async () => {
  const plans = new Plans();
  let bindings: FormDeliveryBinding[] = [];
  const deps = { plans, bindings: async () => bindings, snapshot: async () => { throw new Error('must not read'); }, newId: () => 'unused', nowIso: () => 'now' };
  const input = { deps, workspaceId: 'w', submissionId: 's', formDefinitionId: 'f' };
  assert.deepEqual((await planFormDeliveries(input)).jobs, []);
  bindings = [binding];
  assert.deepEqual((await planFormDeliveries(input)).jobs, []);
});

test('adapter failures are structured and raw secrets never escape to the retry ledger', async () => {
  const job: FormDeliveryJob = { binding, snapshot, idempotencyKey: 'key' };
  await assert.rejects(deliverFormJob({ job, deliver: async () => { throw new Error('Bearer secret@example.com'); } }), error => error instanceof FormDeliveryError && error.message === 'delivery-failed' && error.retryable);
  await assert.rejects(deliverFormJob({ job, deliver: async () => ({ ok: false, error: { code: 'authorization-required', retryable: false } }) }), error => error instanceof FormDeliveryError && !error.retryable);
  await deliverFormJob({ job, deliver: async () => {} }); // additive compatibility with void adapters
});

test('repeated app creation installs one delivery handler; source handling only plans', async () => {
  const bus = new InMemoryEventBus();
  let planned = 0; let delivered = 0;
  const subscriptions = createFormDeliverySubscriptions({ bus, plan: async () => { planned++; }, deliver: async () => { delivered++; } });
  subscriptions.start({}); subscriptions.start({});
  const base = { id: 'event', workspaceId: 'w', occurredAt: 'now' };
  await bus.publish({ ...base, name: 'form.submission.received', payload: { submissionId: 's', formDefinitionId: 'f' } });
  assert.equal(planned, 1); assert.equal(delivered, 0);
  await bus.publish({ ...base, name: 'form.submission.delivery', payload: { binding, snapshot, idempotencyKey: 'key' } });
  assert.equal(delivered, 1);
});
