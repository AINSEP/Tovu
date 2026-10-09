import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Electron cannot import under node. Execute the actual registered callbacks with native effects
// injected, like main-quickwins-wiring.test.ts, so an unconditional quit/stop cannot pass.
const source = fs.readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const sf = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function handler(event: string, functionName?: string): string {
  let result: string | undefined;
  const root = functionName ? sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === functionName) : sf;
  assert.ok(root);
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && n.expression.name.text === 'on' && n.arguments[0]?.getText(sf) === JSON.stringify(event)) {
      result = n.arguments[1]?.getText(sf);
    }
    ts.forEachChild(n, visit);
  }
  visit(root);
  assert.ok(result, event);
  return ts.transpile(`return (${result});`, { target: ts.ScriptTarget.ES2022 });
}

test('closing all windows quits Windows/Linux, while macOS keeps the app alive', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    let quits = 0;
    new Function('process', 'app', handler('window-all-closed'))({ platform }, { quit: () => quits++ })();
    assert.equal(quits, platform === 'darwin' ? 0 : 1);
  }
});

test('macOS site-window close retains the supervised server and releases only its window', () => {
  const window = {};
  const entry = { window, server: {} };
  const openSites = new Map([['/site', entry]]);
  const forbidden = () => assert.fail('macOS window close must not stop/revoke/untrack a live site');
  const close = new Function('process', 'quitPhase', 'openSites', 'siteDir', 'window',
    'pendingTeardowns', 'endSiteSession', 'server', 'recordSiteClosed',
    handler('closed', 'openSiteWindow'))(
    { platform: 'darwin' }, 'idle', openSites, '/site', window,
    { track: forbidden }, forbidden, { stop: forbidden }, forbidden);
  close();
  assert.equal(openSites.get('/site'), entry);
  assert.equal(entry.window, undefined);
});

test('standalone admin windows enforce useful minimum width and height', () => {
  const create = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'createWindow');
  assert.ok(create);
  const text = create.getText(sf);
  assert.match(text, /minWidth:\s*1024/);
  assert.match(text, /minHeight:\s*700/);
});

function declaration(name: string): string {
  const node = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name);
  return ts.transpile(node.getText(sf), { target: ts.ScriptTarget.ES2022 });
}

test('turning automatic updates OFF persists first, stops the coordinator, and disables native installs/downloads', () => {
  const calls: string[] = [];
  const native = { autoDownload: true, autoInstallOnAppQuit: true };
  const runtime = new Function('writeAutomaticUpdates', 'desktopPreferencesPath', 'autoUpdate', 'nativeAutoUpdater', 'startAutoUpdater',
    `${declaration('setAutomaticUpdates')}; return { setAutomaticUpdates, controller: () => autoUpdate };`)(
      ({ enabled }: { enabled: boolean }) => calls.push(`save:${enabled}`), () => '/prefs',
      { willQuit: () => calls.push('stop') }, native, () => assert.fail('must not start'));
  runtime.setAutomaticUpdates({ enabled: false });
  assert.deepEqual(calls, ['save:false', 'stop']);
  assert.equal(runtime.controller(), null);
  assert.equal(native.autoDownload, false);
  assert.equal(native.autoInstallOnAppQuit, false);
});

test('a failed preference save does not shut down an enabled updater', () => {
  const native = { autoDownload: true, autoInstallOnAppQuit: true };
  const set = new Function('writeAutomaticUpdates', 'desktopPreferencesPath', 'autoUpdate', 'nativeAutoUpdater',
    `${declaration('setAutomaticUpdates')}; return setAutomaticUpdates;`)(
      () => { throw new Error('disk full'); }, () => '/prefs',
      { willQuit: () => assert.fail('must preserve actual state') }, native);
  assert.throws(() => set({ enabled: false }), /disk full/);
  assert.equal(native.autoDownload, true);
  assert.equal(native.autoInstallOnAppQuit, true);
});

test('disabled preference skips lazy updater loading on launch', async () => {
  const start = new Function('autoUpdate', 'autoUpdaterStarting', 'readAutomaticUpdates', 'desktopPreferencesPath',
    `${declaration('startAutoUpdater')}; return startAutoUpdater;`)(null, false, () => false, () => '/prefs');
  // Every effect beyond the preference guard is deliberately absent, including native import.
  await start();
});

test('a persisted OFF choice suppresses installation of an already downloaded update on final quit', () => {
  const native = { autoInstallOnAppQuit: true };
  const finalQuit = new Function('readAutomaticUpdates', 'desktopPreferencesPath', 'nativeAutoUpdater', 'autoUpdate',
    `${declaration('finalQuitHeldForUpdate')}; return finalQuitHeldForUpdate;`)(
      () => false, () => '/prefs', native, { beforeFinalQuit: () => assert.fail('must not install') });
  assert.equal(finalQuit(), false);
  assert.equal(native.autoInstallOnAppQuit, false);
});

test('a queued download prompt respects the OFF preference', async () => {
  const prompt = new Function('readAutomaticUpdates', 'desktopPreferencesPath',
    `${declaration('promptUpdateReady')}; return promptUpdateReady;`)(() => false, () => '/prefs');
  assert.equal(await prompt('1.2.3'), false);
});

test('reopening a macOS site window reuses its server and cookie partition', async () => {
  const server = { adminUrl: 'http://127.0.0.1:4100/admin', port: 4100 };
  const sites = new Map([['/site', { server }]]);
  let creations = 0;
  const previewSyncs: string[] = [];
  const window = { on: () => {}, isDestroyed: () => false, show: () => {}, focus: () => {} };
  const reopen = new Function('openSites', 'sitePartition', 'startSiteBackend', 'createWindow', 'readSiteName', 'scheduleSitePreview', 'siteThemePreviews',
    `${declaration('openSiteWindow')}; return openSiteWindow;`)(sites, () => 'persist:site',
      () => assert.fail('must not start a second server'),
      (url: string, title: string, partition: string) => {
        assert.equal(url, server.adminUrl); assert.equal(title, 'Site'); assert.equal(partition, 'persist:site');
        creations++; return window;
      }, () => 'Site', () => {}, { sync: ({ siteDir }: { siteDir: string }) => previewSyncs.push(siteDir) });
  assert.equal(await reopen('/site', {}), window);
  assert.equal(sites.get('/site')?.server, server);
  assert.equal(await reopen('/site', {}), window);
  assert.equal(creations, 1);
  assert.deepEqual(previewSyncs, ['/site']);
});

test('Dock activation restores retained site windows even if their recent-site entries were cleared', () => {
  const restored: string[] = [];
  const activate = new Function('BrowserWindow', 'quitPhase', 'openSites', 'ctx', 'serializer', 'openSiteWindow', 'promptAndOpenNewSite', 'reportBootFailure',
    handler('activate', 'bootOwnServerMode'))(
      { getAllWindows: () => [] }, 'idle', new Map([['/a', { siteDir: '/a' }], ['/b', { siteDir: '/b' }]]), {},
      { run: (_key: string, work: () => Promise<void>) => work() },
      async (dir: string) => { restored.push(dir); }, () => assert.fail('must not prompt for a new site'),
      () => assert.fail('restore should succeed'));
  activate();
  assert.deepEqual(restored, ['/a', '/b']);
});

test('turning automatic updates back ON starts the eligible updater after saving', () => {
  const calls: string[] = [];
  const set = new Function('writeAutomaticUpdates', 'desktopPreferencesPath', 'autoUpdate', 'nativeAutoUpdater', 'startAutoUpdater',
    `${declaration('setAutomaticUpdates')}; return setAutomaticUpdates;`)(
      () => calls.push('save'), () => '/prefs', null, null,
      async () => { calls.push('start'); });
  set({ enabled: true });
  assert.deepEqual(calls, ['save', 'start']);
});
