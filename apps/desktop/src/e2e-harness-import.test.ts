/** Import the journey harness without launching Electron, a server, or a build. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('the desktop journey harness loads through Playwright on the supported Node runtime', async t => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const launches: Array<{ env: NodeJS.ProcessEnv }> = [];
  const childProcess = t.mock.module('node:child_process', { namedExports: {
    spawnSync: (_executable: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
      launches.push(options);
      return { status: 0 };
    },
  } });
  const exit = t.mock.method(process, 'exit', () => undefined as never);
  const previous = process.env.TOVU_E2E_DESKTOP_APP;
  const previousLoader = process.env.PLAYWRIGHT_FORCE_ASYNC_LOADER;
  process.env.TOVU_E2E_DESKTOP_APP = '/unused/Tovu.app';
  delete process.env.PLAYWRIGHT_FORCE_ASYNC_LOADER;
  try {
    await import(new URL('../../../development/e2e/support/run-packaged-desktop.mjs', import.meta.url).href);
  } finally {
    if (previous === undefined) delete process.env.TOVU_E2E_DESKTOP_APP;
    else process.env.TOVU_E2E_DESKTOP_APP = previous;
    if (previousLoader === undefined) delete process.env.PLAYWRIGHT_FORCE_ASYNC_LOADER;
    else process.env.PLAYWRIGHT_FORCE_ASYNC_LOADER = previousLoader;
    childProcess.restore();
    exit.mock.restore();
  }
  const launch = launches[0];
  assert.ok(launch, 'capture the real launcher environment without starting a journey');
  const script = `const path = require('node:path');
    const { requireOrImport } = require('playwright/lib/common').transform;
    requireOrImport(path.resolve('development/e2e/desktop/_fixtures.ts')).then(m => {
      if (typeof m.launchDesktop !== 'function') throw Error('harness exports missing');
      process.exit(0);
    }).catch(e => { console.error(e); process.exit(1); });`;
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { ...launch.env, NODE_OPTIONS: '', TOVU_DESKTOP_E2E_APP: '' },
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
