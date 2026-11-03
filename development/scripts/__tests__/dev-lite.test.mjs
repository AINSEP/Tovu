import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLiteAdmin } from '../dev-lite.mjs';
import { finishDevStartup } from '../dev.mjs';

test('dev:lite opens the ready API admin without starting an admin Vite process', async () => {
  assert.equal(await finishDevStartup({ apiPort: 3000, vitePort: 5173, scheme: 'http', lite: true }, {
    waitForReady: async () => true, isShuttingDown: () => false, log: () => {},
    startAdmin: () => assert.fail('lite must not start Vite'),
  }), true);
});

test('dev:lite reuses a current admin without starting Vite or rebuilding', async () => {
  const files = new Map([['/repo/apps/admin/dist/index.html', 'html'], ['/repo/apps/admin/dist/.dev-source-stamp', 'current']]);
  const result = await prepareLiteAdmin({ repoRoot: '/repo', env: {} }, {
    stamp: async () => 'current', read: async file => files.get(file) ?? '', lock: async ({ run }) => run(),
    build: () => assert.fail('current admin must be reused'), write: async () => {},
  });
  assert.equal(result, '/repo/apps/admin/dist');
});

test('dev:lite builds missing or stale admin once and marks only a successful build current', async () => {
  for (const previous of ['', 'old']) {
    const effects = [];
    await prepareLiteAdmin({ repoRoot: '/repo', env: {} }, {
      stamp: async () => 'new', read: async file => file.endsWith('index.html') ? 'html' : file.endsWith('package.json') ? '' : previous,
      lock: async ({ run }) => run(),
      build: async input => effects.push(['build', input.output]),
      write: async (_file, value) => effects.push(['stamp', value]),
    });
    assert.deepEqual(effects, [['build', '/repo/apps/admin/dist'], ['stamp', 'new']]);
  }
});

test('dev:lite rebuilds a missing admin entry even when its freshness marker survived', async () => {
  let builds = 0;
  await prepareLiteAdmin({ repoRoot: '/repo', env: {} }, {
    stamp: async () => 'current', read: async file => file.endsWith('.dev-source-stamp') ? 'current' : '',
    build: async () => { builds++; }, write: async () => {}, lock: async ({ run }) => run(),
  });
  assert.equal(builds, 1);
});

test('dev:lite never marks a failed build current', async () => {
  await assert.rejects(prepareLiteAdmin({ repoRoot: '/repo', env: {} }, {
    stamp: async () => 'current', read: async () => '',
    build: async () => { throw new Error('build failed'); }, write: () => assert.fail('failed admin must stay stale'),
    lock: async ({ run }) => run(),
  }), /build failed/);
});
