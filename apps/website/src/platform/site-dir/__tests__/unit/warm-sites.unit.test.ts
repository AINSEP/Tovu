import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalSiteSupervisor, type LocalSiteProcessPort } from '../../local-site-supervisor.js';

test('reopening a warm site makes the other idle site the next eviction candidate', async () => {
  const stopped: string[] = [];
  const host = createLocalSiteSupervisor({ servingName: 'root', scheme: 'http', processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async ({ name }) => ({ pid: 1, onExit() {}, ready: async () => true, tryRetire: async () => true,
      terminate: async () => { stopped.push(name); }, killNow() {} }),
  } }, { maxConcurrent: 2, evictIdle: true });
  await host.start({ name: 'alpha' });
  await host.start({ name: 'beta' });
  await host.start({ name: 'alpha' });
  await host.start({ name: 'gamma' });
  assert.deepEqual(stopped, ['beta']);
});

test('opening a fourth warm site evicts the least recently opened idle site and keeps busy work alive', async () => {
  const stopped: string[] = [];
  const processPort: LocalSiteProcessPort = {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async ({ name }) => ({ pid: 1, onExit() {}, ready: async () => true,
      tryRetire: async () => name !== 'busy', terminate: async () => { stopped.push(name); }, killNow() {} }),
  };
  const host = createLocalSiteSupervisor({ processPort, servingName: 'root', scheme: 'http' }, { maxConcurrent: 2, evictIdle: true });
  await host.start({ name: 'busy' });
  const first = await host.start({ name: 'idle' });
  assert.deepEqual(await host.start({ name: 'idle' }), first, 'warm reopen retains its URL and process');
  const next = await host.start({ name: 'new' });
  assert.deepEqual(stopped, ['idle']);
  assert.notEqual(next.adminUrl, first.adminUrl, 'an old tab must never reach a different site after eviction');
  assert.equal((await host.start({ name: 'idle' })).adminUrl, first.adminUrl, 'reopening retains the site URL');
  assert.equal(host.list().find(site => site.name === 'busy')?.status, 'starting');
});

test('a source-watch host restart retains the URLs of evicted sites too', async () => {
  let intent: import('../../local-site-intent.js').LocalSiteIntent | undefined;
  const options = { maxConcurrent: 1, evictIdle: true, devSession: 'session',
    intentPort: { read: () => intent, write: ({ intent: value }: { intent: NonNullable<typeof intent> }) => { intent = value; } } };
  const processPort: LocalSiteProcessPort = {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async () => ({ pid: 1, onExit() {}, ready: async () => true, tryRetire: async () => true, terminate: async () => {}, killNow() {} }),
  };
  const first = createLocalSiteSupervisor({ processPort, servingName: 'root', scheme: 'http' }, options);
  const a = await first.start({ name: 'alpha' });
  await first.start({ name: 'beta' });
  await first.shutdown();
  const restarted = createLocalSiteSupervisor({ processPort, servingName: 'root', scheme: 'http' }, options);
  assert.equal((await restarted.start({ name: 'alpha' })).adminUrl, a.adminUrl);
});

test('a full warm pool refuses admission when every child has active or unprovable work', async () => {
  const host = createLocalSiteSupervisor({ servingName: 'root', scheme: 'http', processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async () => ({ pid: 1, onExit() {}, ready: async () => true, tryRetire: async () => false,
      terminate: async () => assert.fail('busy site must survive'), killNow() {} }),
  } }, { maxConcurrent: 1, evictIdle: true });
  await host.start({ name: 'busy' });
  await assert.rejects(host.start({ name: 'next' }), /SITE_LIMIT/);
});
