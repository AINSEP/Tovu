import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { childProcessCoverageEnv } from '../../child-process-coverage-env.js';
import { InMemoryEventBus, InMemoryOutbox } from '../memory-bus.js';
import { startOutboxDrainer } from '../outbox-drainer.js';

// Author Checklist: scheduling before drain completion must deliver 'second' while 'first' is
// held, failing the intermediate assertion; removing timer.unref() must time out the child.
// The clock is pinned, held work is released on cleanup, and the child has a bounded lifetime.
const NOW = '2026-10-01T00:00:00.000Z';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// F7.1/F6.2: enqueue a second event while the first handler is held; force many idle periods.
test('a newly enqueued event cannot start another drain while the current delivery is in flight', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(NOW) });
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  let finish!: () => void;
  const held = new Promise<void>((resolve) => { finish = resolve; });
  const received: string[] = [];
  await bus.subscribe('entry.updated', async (event) => {
    received.push(event.id);
    if (event.id === 'first') await held;
  });
  await outbox.enqueue({ id: 'first', name: 'entry.updated', workspaceId: 'ws', occurredAt: NOW, payload: {} });
  const drainer = startOutboxDrainer({ outbox, bus, clock: { nowIso: () => NOW } }, { batchSize: 1, intervalMs: 10 });
  t.after(async () => { finish(); await drainer.stop(); });
  t.mock.timers.tick(0);
  await tick();
  assert.deepEqual(received, ['first']);
  await outbox.enqueue({ id: 'second', name: 'entry.updated', workspaceId: 'ws', occurredAt: NOW, payload: {} });
  t.mock.timers.tick(100);
  await tick();
  assert.deepEqual(received, ['first'], 'the second delivery must wait for the held first delivery');
  finish();
  await tick();
  t.mock.timers.tick(0);
  await tick();
  assert.deepEqual(received, ['first', 'second']);
});

// F3.5: use the real process lifecycle. A test that calls stop() cannot detect a missing unref().
test('an idle drainer does not keep its otherwise finished process alive', (t) => {
  const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-b04-drainer-coverage-'));
  t.after(() => fs.rmSync(coverageDir, { recursive: true, force: true }));
  const script = `
    import { startOutboxDrainer } from ${JSON.stringify(new URL('../outbox-drainer.ts', import.meta.url).href)};
    import { InMemoryEventBus, InMemoryOutbox } from ${JSON.stringify(new URL('../memory-bus.ts', import.meta.url).href)};
    startOutboxDrainer({ outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(), clock: { nowIso: () => '${NOW}' } });
    process.stdout.write('ready\\n');
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 5_000, env: childProcessCoverageEnv(coverageDir),
  });
  assert.equal(result.error, undefined, 'a referenced drainer timer would keep the child alive until timeout');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'ready\n');
});
