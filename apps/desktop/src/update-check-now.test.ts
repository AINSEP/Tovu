/** Settings › Check for updates…: one manual check per click, from any copy, with DI fakes for the updater. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL } from './contracts/app-version.ts';
import { createUpdateCheckNow, plainUpdateError, registerUpdateCheckIpc } from './update-check-now.ts';
import type { CheckableUpdater, UpdateCheckNowDeps, UpdateNotice } from './update-check-now.ts';

type CheckResult = Awaited<ReturnType<CheckableUpdater['checkForUpdates']>>;

function harness({ result = Promise.resolve<CheckResult>(null), ...overrides }: Partial<UpdateCheckNowDeps> & { result?: Promise<CheckResult> } = {}) {
  const notices: UpdateNotice[] = [];
  const logs: string[] = [];
  const prompts: string[] = [];
  let loads = 0;
  let checks = 0;
  const updater: CheckableUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: () => { checks++; return result; },
  };
  const deps: UpdateCheckNowDeps = {
    isPackaged: true,
    currentVersion: () => '0.1.22',
    skipReason: () => null,
    automaticUpdates: () => true,
    readyVersion: () => null,
    loadUpdater: async () => { loads++; return updater; },
    showReadyPrompt: async ({ version }) => { prompts.push(version); },
    notify: (notice) => { notices.push(notice); },
    log: ({ message }) => { logs.push(message); },
    ...overrides,
  };
  return { check: createUpdateCheckNow(deps), updater, notices, logs, prompts, loads: () => loads, checks: () => checks };
}

const available = (version: string, downloadPromise: Promise<unknown> | null = new Promise(() => {})): CheckResult =>
  ({ isUpdateAvailable: true, updateInfo: { version }, downloadPromise });

test('dev launch: says updates only work in the installed app and never loads the updater', async () => {
  const h = harness({ isPackaged: false, skipReason: () => 'not packaged (dev launch)' });
  assert.deepEqual(await h.check.checkNow(), { kind: 'unavailable', reason: 'not packaged (dev launch)' });
  assert.equal(h.notices[0]!.message, 'Updates only work in the installed app');
  assert.equal(h.loads(), 0);
});

test('a packaged copy the updater skips names the reason', async () => {
  const h = harness({ skipReason: () => 'Microsoft Store build (the Store updates it)' });
  await h.check.checkNow();
  assert.deepEqual(h.notices, [{ type: 'info', message: 'Updates are off for this copy of Tovu', detail: 'Reason: Microsoft Store build (the Store updates it).' }]);
});

test('no newer release: up to date with the running version', async () => {
  const h = harness({ result: Promise.resolve({ isUpdateAvailable: false, updateInfo: { version: '0.1.22' } }) });
  assert.deepEqual(await h.check.checkNow(), { kind: 'up-to-date', version: '0.1.22' });
  assert.equal(h.notices[0]!.message, 'You’re up to date (0.1.22)');
  assert.equal(h.updater.autoDownload, true, 'with updates on the controller keeps its own settings');
});

test('a newer release downloads through the shared updater; the controller prompts when it lands', async () => {
  const h = harness({ result: Promise.resolve(available('0.1.23')) });
  assert.deepEqual(await h.check.checkNow(), { kind: 'downloading', version: '0.1.23' });
  assert.equal(h.notices[0]!.message, 'Downloading Tovu 0.1.23…');
  assert.match(h.notices[0]!.detail, /You have 0\.1\.22\. Tovu asks you to restart/);
  assert.deepEqual(h.prompts, [], 'the controller, not this check, opens Update ready');
});

test('a failed download is reported in plain words', async () => {
  const h = harness({ result: Promise.resolve(available('0.1.23', Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')))) });
  await h.check.checkNow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.notices[1], {
    type: 'error', message: 'Couldn’t download Tovu 0.1.23',
    detail: 'Tovu couldn’t reach the update server. Check your internet connection and try again.',
  });
  assert.match(h.logs[0]!, /ERR_INTERNET_DISCONNECTED/);
});

test('an update this copy already downloaded shows the existing Update ready prompt instead of checking', async () => {
  const h = harness({ readyVersion: () => '0.1.23' });
  assert.deepEqual(await h.check.checkNow(), { kind: 'ready', version: '0.1.23' });
  assert.deepEqual(h.prompts, ['0.1.23']);
  assert.equal(h.checks(), 0);
  assert.deepEqual(h.notices, []);
});

test('automatic updates off: checks on demand, downloads nothing, and says updates are off', async () => {
  const h = harness({ automaticUpdates: () => false, readyVersion: () => '0.1.23', result: Promise.resolve(available('0.1.24')) });
  assert.deepEqual(await h.check.checkNow(), { kind: 'available', version: '0.1.24' });
  assert.equal(h.updater.autoDownload, false);
  assert.equal(h.updater.autoInstallOnAppQuit, false);
  assert.deepEqual(h.prompts, [], 'no install prompt while updates are off');
  assert.equal(h.notices[0]!.message, 'Tovu 0.1.24 is available');
  assert.match(h.notices[0]!.detail, /Automatic updates are off\. Turn on Settings › Automatically update Tovu/);

  const latest = harness({ automaticUpdates: () => false, result: Promise.resolve({ isUpdateAvailable: false, updateInfo: { version: '0.1.22' } }) });
  await latest.check.checkNow();
  assert.match(latest.notices[0]!.detail, /Automatic updates are off\./);
});

test('check errors read in plain words; the raw message goes to the log', async () => {
  const h = harness({ result: Promise.reject(new Error('HttpError: 403 rate limit exceeded')) });
  assert.deepEqual(await h.check.checkNow(), { kind: 'error' });
  assert.deepEqual(h.notices, [{ type: 'error', message: 'Couldn’t check for updates', detail: 'Something went wrong while checking. Try again in a few minutes.' }]);
  assert.match(h.logs[0]!, /403 rate limit/);
  const offline = harness({ loadUpdater: async () => { throw new Error('getaddrinfo ENOTFOUND github.com'); } });
  await offline.check.checkNow();
  assert.match(offline.notices[0]!.detail, /couldn’t reach the update server/);
  assert.match(plainUpdateError({ message: 'net::ERR_NAME_NOT_RESOLVED' }), /internet connection/);
});

test('clicks while a check runs join it: one check, one notice', async () => {
  let finish!: (value: CheckResult) => void;
  const h = harness({ result: new Promise<CheckResult>((resolve) => { finish = resolve; }) });
  const first = h.check.checkNow();
  const second = h.check.checkNow();
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  finish({ isUpdateAvailable: false, updateInfo: { version: '0.1.22' } });
  await first;
  assert.equal(h.checks(), 1);
  assert.equal(h.notices.length, 1);
  await h.check.checkNow();
  assert.equal(h.checks(), 2, 'a later click checks again');
});

test('the IPC handler registers the contract channel and resolves after the check', async () => {
  const handlers = new Map<string, () => Promise<void>>();
  let checks = 0;
  registerUpdateCheckIpc({
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); } },
    checkNow: async () => { checks++; return { kind: 'up-to-date', version: '1' }; },
  });
  assert.equal(RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL, 'runner:app:check-for-updates');
  assert.deepEqual([...handlers.keys()], [RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL]);
  assert.equal(await handlers.get(RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL)!(), undefined);
  assert.equal(checks, 1);
});
