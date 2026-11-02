import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { importFixture } from '#src/features/site-backup/__tests__/import.fixture';
import { peerFixture } from '#src/server/runtime/composition/__tests__/peer-site-reads.fixture';
import { assetToolHarness } from '#src/features/fs-files/__tests__/asset-tool-fixture';
import type { ToolExecutionContext, ToolRegistration } from '@jini-ai/core';

// Run only from resource-teardown.unit.test.ts. These are real helper calls and real node:test
// hooks: the injected cleanup failure must fail the child while every owned resource is released.
test('helper cleanup failure', async t => {
  const fault = new Error('injected teardown failure');
  if (process.env.TEARDOWN_HELPER === 'import') {
    const fixture = await importFixture(t);
    const remove = fs.rmSync;
    t.mock.method(fs, 'rmSync', ((...args: Parameters<typeof fs.rmSync>) => {
      if (args[0] === fixture.root) throw fault;
      return remove(...args);
    }) as typeof fs.rmSync);
    process.once('exit', () => {
      console.log(`database closed: ${!fixture.db.$client.open}`);
      remove(fixture.root, { recursive: true, force: true });
    });
  } else if (process.env.TEARDOWN_HELPER === 'asset') {
    let signal: AbortSignal | undefined;
    const fixture = await assetToolHarness(t, { toolId: 'probe', build: () => [{
      descriptor: { id: 'probe' }, handler: async (ctx: ToolExecutionContext) => { signal = ctx.signal; },
    } as unknown as ToolRegistration] });
    await fixture.call({});
    const remove = fs.rmSync;
    t.mock.method(fs, 'rmSync', ((...args: Parameters<typeof fs.rmSync>) => {
      if (args[0] === fixture.base) throw fault;
      return remove(...args);
    }) as typeof fs.rmSync);
    process.once('exit', () => {
      console.log(`work aborted: ${signal?.aborted}`);
      remove(fixture.base, { recursive: true, force: true });
    });
  } else {
    const fixture = await peerFixture(t);
    // Registered last, so this runs before the real handles in the reverse disposal order.
    fixture.close.push(() => { throw fault; });
    assert.equal(fixture.a.db.$client.open, true);
    process.once('exit', () => {
      console.log(`database closed: ${!fixture.a.db.$client.open && !fixture.b.db.$client.open}`);
      console.log(`folder removed: ${!fs.existsSync(fixture.home)}`);
      fs.rmSync(fixture.home, { recursive: true, force: true });
    });
  }
});
