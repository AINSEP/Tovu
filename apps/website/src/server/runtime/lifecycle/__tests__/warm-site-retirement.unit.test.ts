import assert from 'node:assert/strict';
import test from 'node:test';
import { createWarmSiteRetirement, isPendingWarmSiteResponse } from '../warm-site-retirement.js';

test('an export job returned with HTTP 200 stays protected just like an HTTP 202 job', () => {
  assert.equal(isPendingWarmSiteResponse({ status: 200, body: { jobId: 'export-id' } }), true);
  assert.equal(isPendingWarmSiteResponse({ status: 202, body: {} }), true);
  assert.equal(isPendingWarmSiteResponse({ status: 200, body: { ok: true } }), false);
  assert.equal(isPendingWarmSiteResponse({ status: 200, body: null }), false);
});

test('warm LRU retirement fences new work before checking whether an assistant is running', async () => {
  let guard!: ReturnType<typeof createWarmSiteRetirement>;
  guard = createWarmSiteRetirement({ hasWork: async () => {
    assert.equal(guard.accepting(), false);
    return true;
  } });
  assert.equal(await guard.retire(), false);
  assert.equal(guard.accepting(), true, 'busy site resumes intake');
});

test('an active job, failed activity check, or accepted background job prevents warm eviction', async () => {
  const guard = createWarmSiteRetirement({ hasWork: async () => false });
  const release = guard.begin();
  assert.equal(await guard.retire(), false);
  release({ background: true });
  assert.equal(await guard.retire(), false);
  const uncertain = createWarmSiteRetirement({ hasWork: async () => { throw new Error('unavailable'); } });
  assert.equal(await uncertain.retire(), false);
});

test('an idle warm site stays fenced until its process is stopped', async () => {
  const guard = createWarmSiteRetirement({ hasWork: async () => false });
  const release = guard.begin(); release({}); release({});
  assert.equal(await guard.retire(), true);
  assert.equal(guard.accepting(), false);
  guard.cancel();
  assert.equal(guard.accepting(), true, 'a canceled eviction must restore the live site');
});

test('an unreadable activity source cannot strand a warm site with intake fenced', async () => {
  const guard = createWarmSiteRetirement({ hasWork: () => new Promise<boolean>(() => {}) }, { activityTimeoutMs: 1 });
  assert.equal(await guard.retire(), false);
  assert.equal(guard.accepting(), true);
});
