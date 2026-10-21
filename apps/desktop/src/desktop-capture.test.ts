/** Native SDK binding only: fake Electron surfaces, no windows, services or application boot. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { desktopCaptureWindowFactory, startDesktopCaptureBridge } from './desktop-capture.ts';

test('capture bindings deny popups/permissions/downloads and clear the private session on destroy', async () => {
  let popup!: () => unknown;
  let permission!: (contents: unknown, permission: string, callback: (allowed: boolean) => void) => void;
  let check!: () => boolean;
  let verifyCertificate!: (request: { hostname: string }, callback: (result: number) => void) => void;
  let webRtc = '';
  let cleared = 0;
  let destroyed = false;
  const nativeSession = Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: (handler: typeof permission) => { permission = handler; },
    setPermissionCheckHandler: (handler: typeof check) => { check = handler; },
    setCertificateVerifyProc: (handler: typeof verifyCertificate) => { verifyCertificate = handler; },
    clearStorageData: async () => { cleared++; },
    webRequest: { onBeforeRequest: () => {} },
  });
  const page = Object.assign(new EventEmitter(), {
    session: nativeSession,
    setWindowOpenHandler: (handler: typeof popup) => { popup = handler; },
    setWebRTCIPHandlingPolicy: (policy: string) => { webRtc = policy; },
  });
  const native = { webContents: page, destroy: () => { destroyed = true; } } as unknown as BrowserWindow;
  const factory = desktopCaptureWindowFactory({ createWindow: () => native });
  const bound = factory({}, { show: false, webPreferences: { partition: 'capture-test' } });
  assert.deepEqual(popup(), { action: 'deny' });
  assert.equal(check(), false);
  let allowed = true;
  permission({}, 'camera', result => { allowed = result; });
  assert.equal(allowed, false);
  assert.equal(webRtc, 'disable_non_proxied_udp');
  for (const hostname of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
    let result: number | undefined;
    verifyCertificate({ hostname }, value => { result = value; });
    assert.equal(result, 0, hostname);
  }
  for (const hostname of ['example.com', 'localhost.evil.example', '10.0.0.1', '169.254.169.254']) {
    let result: number | undefined;
    verifyCertificate({ hostname }, value => { result = value; });
    assert.equal(result, -3, hostname);
  }
  let prevented = 0;
  nativeSession.emit('will-download', { preventDefault: () => { prevented++; } });
  page.emit('will-attach-webview', { preventDefault: () => { prevented++; } });
  assert.equal(prevented, 2);
  bound.destroy();
  await Promise.resolve();
  assert.equal(destroyed, true);
  assert.equal(cleared, 1);
});

test('capture factory destroys the hidden window and rethrows when native setup fails', () => {
  for (const failingStep of ['popup', 'webrtc', 'permission-request', 'permission-check', 'certificate', 'download', 'webview']) {
    const failure = new Error(`setup failed: ${failingStep}`);
    let destroyed = 0;
    const setup = (step: string) => { if (step === failingStep) throw failure; };
    const session = {
      setPermissionRequestHandler: () => setup('permission-request'),
      setPermissionCheckHandler: () => setup('permission-check'),
      setCertificateVerifyProc: () => setup('certificate'),
      on: () => setup('download'),
    };
    const native = {
      webContents: {
        session,
        setWindowOpenHandler: () => setup('popup'),
        setWebRTCIPHandlingPolicy: () => setup('webrtc'),
        on: () => setup('webview'),
      },
      destroy: () => { destroyed++; },
    } as unknown as BrowserWindow;
    const factory = desktopCaptureWindowFactory({ createWindow: () => native });
    assert.throws(() => factory({}), error => error === failure);
    assert.equal(destroyed, 1, failingStep);
  }
});

test('the returned window adapts every Jini call onto the native window and page, with Jini argument shapes', async () => {
  const calls: unknown[][] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return `${name}-result`; };
  let requestFilter: unknown = 'unset';
  let clearFailure = false;
  const nativeSession = Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {}, setCertificateVerifyProc: () => {},
    clearStorageData: () => (clearFailure ? Promise.reject(new Error('session already gone')) : Promise.resolve()),
    webRequest: { onBeforeRequest: (filter: unknown) => { requestFilter = filter; } },
  });
  const page = Object.assign(new EventEmitter(), {
    session: nativeSession,
    setWindowOpenHandler: () => {}, setWebRTCIPHandlingPolicy: () => {},
    loadURL: record('page.loadURL'), printToPDF: record('printToPDF'), capturePage: record('capturePage'),
    getURL: record('getURL'), getTitle: record('getTitle'), executeJavaScript: record('executeJavaScript'),
    debugger: { attach: record('debugger.attach'), sendCommand: record('debugger.sendCommand') },
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: page,
    loadURL: record('window.loadURL'), show: record('show'), hide: record('hide'), focus: record('focus'),
    close: record('close'), isDestroyed: () => false, destroy: record('destroy'),
  });
  const bound = desktopCaptureWindowFactory({ createWindow: () => window as unknown as BrowserWindow })({}, {});
  const contents = bound.webContents;

  // Request filtering: null clears the native filter; a listener receives Jini's object shape.
  contents.session.webRequest.onBeforeRequest({ listener: null });
  assert.equal(requestFilter, null);
  const seen: unknown[] = [];
  contents.session.webRequest.onBeforeRequest({ listener: (args) => seen.push(args) });
  const nativeCallback = () => {};
  (requestFilter as (details: unknown, callback: unknown) => void)({ url: 'http://127.0.0.1/' }, nativeCallback);
  assert.deepEqual(seen, [{ details: { url: 'http://127.0.0.1/' }, callback: nativeCallback }]);

  // Load lifecycle: a failed load reports its code and description; a finished one reports nothing.
  const loads: unknown[] = [];
  contents.once({ event: 'did-fail-load', listener: (args?: unknown) => loads.push(args) });
  contents.once({ event: 'did-finish-load', listener: (args?: unknown) => loads.push(args ?? 'finished') });
  page.emit('did-fail-load', 'native-event', -105, 'ERR_NAME_NOT_RESOLVED');
  page.emit('did-finish-load');
  assert.deepEqual(loads, [{ event: 'native-event', errorCode: -105, errorDescription: 'ERR_NAME_NOT_RESOLVED' }, 'finished']);
  const navigations: unknown[] = [];
  contents.on({ event: 'will-navigate', listener: (args) => navigations.push(args) });
  page.emit('will-navigate', 'nav-event', 'http://127.0.0.1/next');
  assert.deepEqual(navigations, [{ event: 'nav-event', url: 'http://127.0.0.1/next' }]);

  assert.equal(await contents.loadURL({ url: 'http://127.0.0.1/a' }), 'page.loadURL-result');
  assert.equal(await contents.printToPDF({ printBackground: true }), 'printToPDF-result');
  await contents.capturePage({}, { rect: { x: 0, y: 0, width: 10, height: 20 } });
  await contents.capturePage({});
  assert.equal(contents.getURL(), 'getURL-result');
  assert.equal(contents.getTitle(), 'getTitle-result');
  await contents.executeJavaScript('document.title');
  contents.debugger.attach('1.3');
  await contents.debugger.sendCommand('Page.enable', { a: 1 });
  await bound.loadURL({ url: 'http://127.0.0.1/b' });
  bound.show(); bound.hide(); bound.focus(); bound.close();
  assert.equal(bound.isDestroyed(), false);
  let closed = 0;
  bound.on({ event: 'closed', listener: () => { closed++; } });
  window.emit('closed');
  assert.equal(closed, 1);
  assert.deepEqual(calls, [
    ['page.loadURL', 'http://127.0.0.1/a'],
    ['printToPDF', { printBackground: true }],
    ['capturePage', { x: 0, y: 0, width: 10, height: 20 }],
    ['capturePage', undefined],
    ['getURL'], ['getTitle'],
    ['executeJavaScript', 'document.title'],
    ['debugger.attach', '1.3'],
    ['debugger.sendCommand', 'Page.enable', { a: 1 }],
    ['window.loadURL', 'http://127.0.0.1/b'],
    ['show'], ['hide'], ['focus'], ['close'],
  ]);

  // A session that cannot be cleared (already torn down) must not surface an unhandled rejection.
  clearFailure = true;
  bound.destroy();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.at(-1), ['destroy']);
});

test('the capture bridge refuses a non-loopback URL before any window opens, and sends loopback URLs to the native factory', async () => {
  const { renderBridgeFromEnv } = await import('@jini-ai/desktop-host/render-bridge');
  let windows = 0;
  const bridge = await startDesktopCaptureBridge({ createWindow: () => { windows++; throw new Error('no native window in tests'); } });
  try {
    const client = renderBridgeFromEnv({ env: bridge.env });
    assert.ok(client);
    const request = { viewport: { width: 800, height: 600 }, fullPage: false, maxPageHeightPx: 2000, settleMs: 0 };
    // The refusal crosses the private HTTP bridge as its code (the message stays on the desktop side).
    await assert.rejects(client.captureUrl({ ...request, url: 'https://example.com/' }), { name: 'RenderServiceError', code: 'navigation-blocked' });
    assert.equal(windows, 0);
    await assert.rejects(client.captureUrl({ ...request, url: 'http://127.0.0.1:9/' }));
    assert.equal(windows, 1, 'a loopback page reaches the native window factory');
  } finally {
    bridge.close();
  }
});
