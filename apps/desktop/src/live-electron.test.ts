/** @file Launch configuration and cleanup contracts for the live verifier adapter. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { withTovuVerificationApp, type ElectronApplication } from '../scripts/adapters/live-electron.ts';

for (const runner of [false, true]) {
  for (const rejects of [false, true]) {
    test(`runner=${runner}, rejecting probe=${rejects}: preserves launch options and closes once after the probe`, { timeout: 2_000 }, async () => {
      const app = {
        firstWindow: mock.fn<ElectronApplication['firstWindow']>(),
        evaluate: mock.fn<ElectronApplication['evaluate']>(),
        close: mock.fn(async () => {}),
      };
      const launch = mock.fn(async () => app);
      const failure = new Error('probe failed');
      let finishProbe!: () => void;
      let startProbe!: () => void;
      const started = new Promise<void>((resolve) => { startProbe = resolve; });
      const probe = new Promise<void>((resolve) => { finishProbe = resolve; });
      const run = mock.fn(async ({ app: launchedApp }: { app: ElectronApplication }) => {
        assert.equal(launchedApp, app);
        startProbe();
        await probe;
        if (rejects) throw failure;
      });
      const desktopDir = path.resolve('/tmp/tovu-verification-desktop');
      const userDataDir = path.resolve('/tmp/tovu-verification-profile');
      const env = { CALLER_SETTING: 'preserved', TOVU_DESKTOP_UI: 'caller-ui', TOVU_DESKTOP_USER_DATA_DIR: 'old-profile' };
      const pending = withTovuVerificationApp({ desktopDir, userDataDir, run }, { env, launch, ...(runner ? { runner } : {}) });
      const outcome = rejects ? assert.rejects(pending, (error) => error === failure) : pending;
      await started;
      assert.equal(app.close.mock.callCount(), 0);
      assert.deepEqual(launch.mock.calls.map(({ arguments: args }) => args), [[{
        executablePath: path.join(desktopDir, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        args: ['.'], cwd: desktopDir,
        env: { ...env, TOVU_DESKTOP_USER_DATA_DIR: userDataDir, TOVU_DESKTOP_UI: runner ? 'runner' : 'caller-ui' },
      }]]);
      assert.equal(env.TOVU_DESKTOP_USER_DATA_DIR, 'old-profile');
      assert.equal(env.TOVU_DESKTOP_UI, 'caller-ui');
      finishProbe();
      await outcome;
      assert.equal(run.mock.callCount(), 1);
      assert.equal(app.close.mock.callCount(), 1);
    });
  }
}

for (const rejects of [false, true]) {
  test(`waits for close before settling a rejecting probe=${rejects}`, { timeout: 2_000 }, async () => {
    let startClose!: () => void;
    let finishClose!: () => void;
    const closing = new Promise<void>((resolve) => { startClose = resolve; });
    const closed = new Promise<void>((resolve) => { finishClose = resolve; });
    const app = {
      firstWindow: mock.fn<ElectronApplication['firstWindow']>(),
      evaluate: mock.fn<ElectronApplication['evaluate']>(),
      close: mock.fn(async () => { startClose(); await closed; }),
    };
    const failure = new Error('probe failed');
    let settled = false;
    const pending = withTovuVerificationApp({
      desktopDir: '/tmp/tovu-desktop', userDataDir: '/tmp/tovu-profile',
      run: async () => { if (rejects) throw failure; },
    }, { launch: async () => app });
    const observed = pending.finally(() => { settled = true; });
    const outcome = rejects ? assert.rejects(observed, (error) => error === failure) : observed;
    await closing;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    finishClose();
    await outcome;
    assert.equal(app.close.mock.callCount(), 1);
  });
}
