import assert from 'node:assert/strict';
import { test } from 'vitest';
import { withFormPullLease, type FormPullLeasePort } from '../pull-coordinator.js';

class Leases implements FormPullLeasePort {
  held = false;
  last: number | undefined;
  async claim(input: Parameters<FormPullLeasePort['claim']>[0]) {
    if (this.held || (this.last !== undefined && Date.parse(input.nowIso) - this.last < input.debounceMs)) return false;
    this.held = true; this.last = Date.parse(input.nowIso); return true;
  }
  async release() { this.held = false; }
}

test('manual and automatic calls exclude one another; manual bypasses recent-pull debounce only', async () => {
  const leases = new Leases();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let pulls = 0;
  const input = { leases, workspaceId: 'w', receiverKey: 'r', token: 't', nowIso: '2026-10-20T00:00:00.000Z',
    trigger: 'manual' as const, pull: async () => { pulls++; entered(); await gate; return 'done'; } };
  const manual = withFormPullLease(input);
  await started;
  assert.deepEqual(await withFormPullLease({ ...input, trigger: 'automatic' }), { ran: false });
  assert.deepEqual(await withFormPullLease(input), { ran: false });
  finish(); await manual;
  assert.deepEqual(await withFormPullLease({ ...input, trigger: 'automatic' }), { ran: false });
  assert.equal((await withFormPullLease(input)).ran, true);
  assert.equal(pulls, 2);
  assert.equal((await withFormPullLease({ ...input, trigger: 'automatic', nowIso: '2026-10-20T00:01:00.000Z' })).ran, true);
});

test('a failed pull releases its lease and counts toward the automatic debounce', async () => {
  const leases = new Leases();
  const input = { leases, workspaceId: 'w', receiverKey: 'r', token: 't', nowIso: '2026-10-20T00:00:00.000Z', trigger: 'automatic' as const,
    pull: async () => { throw new Error('offline'); } };
  await assert.rejects(withFormPullLease(input), /offline/);
  assert.equal(leases.held, false);
  assert.deepEqual(await withFormPullLease(input), { ran: false });
});
