import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalSiteError } from '#src/platform/site-dir/local-site-supervisor';
import { stopServingSite } from '../stop-serving.js';

const REQUIRED = { switcherBase: '/repo', name: 'owner', currentSiteName: 'owner', dirOverridden: false };
const RUNNING = { name: 'beta', status: 'running' as const, pid: 7, port: 3101, daemonPort: 3102, adminUrl: 'http://localhost:3101/admin/' };

function ports(overrides: { latest?: typeof RUNNING | undefined; accepted?: boolean; refuseActivation?: boolean } = {}) {
  const log: string[] = [];
  return { log, ports: {
    supervisor: {
      latestRunning: () => ('latest' in overrides ? overrides.latest : RUNNING),
      stop: async ({ name }: { name: string }) => { log.push(`stop:${name}`); return { ...RUNNING, status: 'stopped' as const }; },
      start: async ({ name }: { name: string }) => { log.push(`start:${name}`); return RUNNING; },
    },
    listSites: () => [{ name: 'beta', dir: '/sites/beta', displayName: 'Beta', createdAt: '', active: false }],
    readSiteRunning: () => (overrides.refuseActivation ? ({ pid: 9, port: 3101, app: 'Web', started: '', scheme: 'http' } as never) : null),
    persistActiveSite: ({ name }: { name: string }) => { log.push(`persist:${name}`); },
    devRestart: { requestRestart: async (_: { reason: string }, optional?: { awaitAcceptance?: boolean }) => {
      log.push(`restart:${optional?.awaitAcceptance === true ? 'awaited' : 'blind'}`);
      return overrides.accepted === false ? { accepted: false as const, reason: 'no' } : { accepted: true as const };
    } },
  } };
}
const hasCode = (code: string) => (error: unknown) => error instanceof LocalSiteError && error.code === code;

test('frees the most recent running site, selects it, then asks for the restart', async () => {
  const fake = ports();
  const result = await stopServingSite(REQUIRED, fake.ports);
  assert.equal(result.activeSiteName, 'beta');
  assert.equal(result.restarting, true);
  // The lease must be gone before the selection and the supervisor's precheck see the target.
  assert.deepEqual(fake.log, ['stop:beta', 'persist:beta', 'restart:awaited']);
});

test('refuses when nothing else is running and touches nothing', async () => {
  const fake = ports({ latest: undefined });
  await assert.rejects(stopServingSite(REQUIRED, fake.ports), hasCode('SITE_NO_SWITCH_TARGET'));
  assert.deepEqual(fake.log, []);
});

test('only the site this server is serving can be handed over', async () => {
  const fake = ports();
  await assert.rejects(stopServingSite({ ...REQUIRED, name: 'other' }, fake.ports), hasCode('SITE_NOT_SERVING'));
  assert.deepEqual(fake.log, []);
});

test('a refused restart puts the selection back and starts the target again', async () => {
  const fake = ports({ accepted: false });
  await assert.rejects(stopServingSite(REQUIRED, fake.ports), hasCode('SITE_STOP_FAILED'));
  assert.deepEqual(fake.log, ['stop:beta', 'persist:beta', 'restart:awaited', 'persist:owner', 'start:beta']);
});

test('a refused activation leaves the selection alone and starts the target again', async () => {
  const fake = ports({ refuseActivation: true });
  await assert.rejects(stopServingSite(REQUIRED, fake.ports), hasCode('SITE_STOP_FAILED'));
  assert.deepEqual(fake.log, ['stop:beta', 'start:beta']);
});
