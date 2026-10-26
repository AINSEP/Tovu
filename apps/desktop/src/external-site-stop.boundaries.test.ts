/** F9 (Stryker L15 external-site-stop 83.5 %): what may be signalled is decided by start times and
 * an ancestor walk, so each edge is pinned: start == claim (ours) vs claim+1 ms (a reused pid), the
 * walk's pid>1 / null / 6-ancestor bounds, the dev-launcher regex per side, the token/command
 * re-checks before kill, the 64-entry launcher cache, and the `ps` start-time reader. Fake ports only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalSiteStopper, EXTERNAL_STOP_UNCONFIRMED, readProcessStartMs, resolveExternalStopTarget, stopExternalSite } from './external-site-stop.ts';

const STARTED = '2026-10-24T12:00:00.000Z';
const CLAIM = Date.parse(STARTED);
const lease = { pid: 100, token: 'tok', started: STARTED };
const DEV = 'node development/scripts/dev.mjs';

/** A process table: pid → [command, parentPid, startMs]. */
function ports(table: Record<number, [string | null, number | null, number | null]>, extra: Record<string, unknown> = {}) {
  const killed: [number, string][] = [];
  const calls = { resolve: 0 };
  return {
    killed, calls,
    readCommand: (pid: number) => { if (pid === lease.pid) calls.resolve++; return table[pid]?.[0] ?? null; },
    readParentPid: (pid: number) => table[pid]?.[1] ?? null,
    readStartMs: (pid: number) => table[pid]?.[2] ?? null,
    kill: (pid: number, signal: string) => { killed.push([pid, signal]); },
    sleep: async () => {}, nowMs: () => 0,
    ...extra,
  };
}

test('a process that started at the claim is ours; one ms later is a reused pid and is never targeted', () => {
  assert.deepEqual(resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 1, CLAIM] }) }), { pid: 100, launcher: 'other', command: 'node server' });
  assert.equal(resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 1, CLAIM + 1] }) }), null);
  assert.equal(resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 1, null] }) }), null);
  assert.equal(resolveExternalStopTarget({ lease: { ...lease, started: 'not a date' } }, { ports: ports({ 100: ['node server', 1, CLAIM] }) }), null);
  // A dev launcher found up the tree must ALSO predate the claim.
  assert.equal(resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 50, CLAIM], 50: [DEV, 1, CLAIM + 1] }) }), null);
});

test('the dev-launcher regex: start or after a space/slash, then end or a space', () => {
  for (const [command, launcher] of [
    ['development/scripts/dev.mjs', 'npm-run-dev'], [DEV, 'npm-run-dev'], ['node /repo/development/scripts/dev.mjs --port 1', 'npm-run-dev'],
    ['node xdevelopment/scripts/dev.mjs', 'other'], ['node development/scripts/dev.mjsx', 'other'], ['node development/scripts/dev.mjs/x', 'other'],
    ['node development/scripts/devXmjs', 'other'],
  ] as const) {
    const target = resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 50, CLAIM], 50: [command, 1, CLAIM] }) });
    assert.equal(target?.launcher, launcher, command);
  }
});

test('the ancestor walk stops at pid 1, a missing parent, and after 6 ancestors', () => {
  // pid 1 itself is never a launcher candidate, even with a matching command.
  assert.equal(resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 1, CLAIM], 1: [DEV, null, CLAIM] }) })?.launcher, 'other');
  // pid 0 as a parent ends the walk too.
  assert.equal(resolveExternalStopTarget({ lease }, { ports: ports({ 100: ['node server', 0, CLAIM], 0: [DEV, null, CLAIM] }) })?.launcher, 'other');
  const chain = (depth: number) => {
    const table: Record<number, [string | null, number | null, number | null]> = { 100: ['node server', 201, CLAIM] };
    for (let i = 1; i <= depth; i++) table[200 + i] = [i === depth ? DEV : 'sh', 200 + i + 1, CLAIM];
    return ports(table);
  };
  assert.deepEqual(resolveExternalStopTarget({ lease }, { ports: chain(6) }), { pid: 206, launcher: 'npm-run-dev', command: DEV });
  assert.equal(resolveExternalStopTarget({ lease }, { ports: chain(7) })?.launcher, 'other');
});

test('stop re-checks before signalling: a replaced lease is left alone, a changed command is refused', async () => {
  const p1 = ports({ 100: ['node server', 1, CLAIM] });
  await stopExternalSite({ lease, readLease: () => ({ token: 'someone-else' }) }, { ports: p1 as never });
  assert.deepEqual(p1.killed, []);
  let reads = 0;
  const p2 = ports({ 100: ['node server', 1, CLAIM] }, { readCommand: () => (++reads === 1 ? 'node server' : 'node other') });
  await assert.rejects(stopExternalSite({ lease, readLease: () => ({ token: 'tok' }) }, { ports: p2 as never }), { message: EXTERNAL_STOP_UNCONFIRMED });
  assert.deepEqual(p2.killed, []);
  const p3 = ports({});
  await assert.rejects(stopExternalSite({ lease, readLease: () => ({ token: 'tok' }) }, { ports: p3 as never }), { message: EXTERNAL_STOP_UNCONFIRMED });
});

test('stop signals SIGTERM once and waits until the lease is gone and the pid no longer predates the claim', async () => {
  let polls = 0;
  let exited = false;
  let leaseLive = true;
  // The lease disappears on the first poll, but the old process is still alive until the second.
  const p = ports({}, {
    readCommand: () => 'node server', readParentPid: () => 1, readStartMs: () => (exited ? null : CLAIM),
    sleep: async () => { polls++; if (polls === 1) leaseLive = false; if (polls === 2) exited = true; },
  });
  await stopExternalSite({ lease, readLease: () => (leaseLive ? { token: 'tok' } : null) }, { ports: p as never, timeoutMs: 1000, pollMs: 1 });
  assert.deepEqual(p.killed, [[100, 'SIGTERM']]);
  assert.equal(polls, 2);
  const stuck = { ...ports({ 100: ['node server', 1, CLAIM] }), nowMs: (() => { let t = 0; return () => (t += 600); })() };
  await assert.rejects(stopExternalSite({ lease, readLease: () => ({ token: 'tok' }) }, { ports: stuck as never, timeoutMs: 1000, pollMs: 1 }), { message: 'The site did not stop within 1 s. Stop it where it was started.' });
});

test('the launcher cache keeps 64 tokens and evicts the oldest on the 65th', () => {
  const p = ports({ 100: ['node server', 1, CLAIM] });
  const stopper = createExternalSiteStopper({}, { ports: p as never });
  for (let i = 0; i < 64; i++) assert.equal(stopper.launcherOf({ lease: { ...lease, token: `t${i}` } }), 'other');
  assert.equal(p.calls.resolve, 64);
  stopper.launcherOf({ lease: { ...lease, token: 't0' } });
  assert.equal(p.calls.resolve, 64, 't0 is cached while 64 entries fit');
  stopper.launcherOf({ lease: { ...lease, token: 't64' } });
  assert.equal(p.calls.resolve, 65);
  stopper.launcherOf({ lease: { ...lease, token: 't1' } });
  assert.equal(p.calls.resolve, 65, 't1 survived the eviction');
  stopper.launcherOf({ lease: { ...lease, token: 't0' } });
  assert.equal(p.calls.resolve, 66, 't0, the oldest, was evicted');
  const none = createExternalSiteStopper({}, { ports: ports({}) as never });
  assert.equal(none.launcherOf({ lease }), null);
});

test('readProcessStartMs: ps lstart in the C locale for exactly this pid; win32, a failure or garbage is null', () => {
  const asked: string[][] = [];
  assert.equal(readProcessStartMs(42, 'darwin', { runPs: (args) => { asked.push(args); return ' Sat Oct 24 12:00:00 2026\n'; } }), Date.parse('Sat Oct 24 12:00:00 2026'));
  assert.deepEqual(asked, [['-o', 'lstart=', '-p', '42']]);
  assert.equal(readProcessStartMs(42, 'win32', { runPs: () => assert.fail('must not run ps on win32') }), null);
  assert.equal(readProcessStartMs(42, 'linux', { runPs: () => { throw new Error('no such process'); } }), null);
  assert.equal(readProcessStartMs(42, 'linux', { runPs: () => 'garbage' }), null);
});
