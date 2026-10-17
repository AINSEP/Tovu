/** Native SDK binding only: fake Electron surfaces, no windows, services or application boot. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { desktopCaptureWindowFactory } from './desktop-capture.ts';

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
