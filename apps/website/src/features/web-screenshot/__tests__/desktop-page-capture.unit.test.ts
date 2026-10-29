/** Owner dispatch: native screenshots use the existing feature port; no real Electron/browser. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RenderServiceError, type UrlCapturePort } from '@jini-ai/desktop-host';
import { createDesktopPageCapture, createPageCaptureForHost } from '../desktop-page-capture.js';
import { VIEWPORT_PRESETS, type PageCaptureRequest } from '../web-screenshot.js';
import type { HttpClientPort } from '#src/platform/http/index';

const request: PageCaptureRequest = { url: 'http://127.0.0.1:4200/about', viewport: VIEWPORT_PRESETS.mobile,
  fullPage: true, maxPageHeightPx: 8000, settleMs: 1200, allowedOrigins: ['http://127.0.0.1:4200'] };
const result = { png: Buffer.from('native png'), finalUrl: request.url, title: 'About', status: null, pageHeight: 9000, capturedHeight: 8000, blockedRequests: 2 };

test('passes viewport/full-page settings and cancellation to the native port, preserves PNG facts', async () => {
  let received: unknown;
  const controller = new AbortController();
  const port = createDesktopPageCapture({ capture: { async captureUrl(input, options) { received = { input, options }; return result; } } });
  assert.deepEqual(await port.capture(request, { signal: controller.signal }), result);
  assert.deepEqual(received, { input: { url: request.url, viewport: request.viewport, fullPage: true,
    maxPageHeightPx: 8000, settleMs: 1200 }, options: { signal: controller.signal } });
  await port.close();
});

test('public reference URLs never reach native Electron', async () => {
  let calls = 0;
  const port = createDesktopPageCapture({ capture: { async captureUrl() { calls++; return result; } } });
  await assert.rejects(port.capture({ ...request, url: 'https://example.com/', allowedOrigins: [] }), { kind: 'refused' });
  assert.equal(calls, 0);
});

test('maps native timeout, cancellation, refusal and failure onto screenshot errors', async () => {
  for (const [code, kind] of [['timeout', 'timeout'], ['aborted', 'timeout'], ['navigation-blocked', 'refused'], ['load-failed', 'failed']] as const) {
    const capture: UrlCapturePort = { async captureUrl() { throw new RenderServiceError({ code, message: 'native failure' }); } };
    await assert.rejects(createDesktopPageCapture({ capture }).capture(request), { kind, message: 'native failure' });
  }
});

test('an absent desktop channel retains lazy Playwright and its unavailable-browser error', async () => {
  let launches = 0;
  const port = createPageCaptureForHost({ httpClient: {} as HttpClientPort }, { env: {}, loadLauncher: async () => {
    launches++; throw new Error('Chromium is not installed');
  } });
  assert.equal(launches, 0);
  await assert.rejects(port.capture(request), { kind: 'unavailable' });
  assert.equal(launches, 1);
  await port.close();
});

test('the host selects native own-site captures and preserves guarded Playwright for public references', async () => {
  let nativeCalls = 0;
  let launches = 0;
  const port = createPageCaptureForHost({ httpClient: {} as HttpClientPort }, {
    nativeCapture: { async captureUrl() { nativeCalls++; return result; } },
    loadLauncher: async () => { launches++; throw new Error('Chromium is not installed'); },
  });
  assert.deepEqual(await port.capture(request), result);
  assert.equal(nativeCalls, 1);
  assert.equal(launches, 0);
  await assert.rejects(port.capture({ ...request, url: 'https://example.com/', allowedOrigins: [] }), { kind: 'unavailable' });
  assert.equal(nativeCalls, 1);
  assert.equal(launches, 1);
  await port.close();
});

test('a malformed channel cannot silently choose Playwright', async () => {
  let launches = 0;
  const port = createPageCaptureForHost({ httpClient: {} as HttpClientPort }, { env: { JINI_DESKTOP_RENDER_URL: 'https://evil.example/capture' },
    loadLauncher: async () => { launches++; throw new Error('must not launch'); } });
  await assert.rejects(port.capture(request), /invalid desktop capture channel/);
  assert.equal(launches, 0);
  await port.close();
});

test('native option guards precede transport and numeric waits override settling without a signal', async () => {
  const received: Array<{ input: Parameters<UrlCapturePort['captureUrl']>[0]; options: Parameters<UrlCapturePort['captureUrl']>[1] }> = [];
  const capture: UrlCapturePort = { async captureUrl(input, options) { received.push({ input, options }); return result; } };
  const port = createDesktopPageCapture({ capture });
  for (const override of [{ dismissCookieBanners: true }, { waitFor: '#ready' }]) {
    await assert.rejects(port.capture({ ...request, ...override }), { kind: 'failed', message: 'native capture does not support consent clicks or selector waits' });
  }
  await assert.rejects(port.capture({ ...request, allowedOrigins: [], dismissCookieBanners: true }),
    { kind: 'refused', message: 'desktop capture requires sitePath on this site' });
  assert.deepEqual([...received], []);
  await port.capture({ ...request, waitFor: 0, dismissCookieBanners: false });
  await port.capture({ ...request, waitFor: 1.5 });
  assert.deepEqual(received.map(({ input, options }) => [input.settleMs, options]), [[0, {}], [1500, {}]]);
});

test('native unexpected failures discard transport details while all render codes retain their message', async () => {
  for (const code of ['aborted', 'timeout', 'navigation-blocked', 'load-failed', 'not-implemented'] as const) {
    const capture: UrlCapturePort = { async captureUrl() { throw new RenderServiceError({ code, message: 'render detail' }); } };
    const kind = code === 'aborted' || code === 'timeout' ? 'timeout' : code === 'navigation-blocked' ? 'refused' : 'failed';
    await assert.rejects(createDesktopPageCapture({ capture }).capture(request), { kind, message: 'render detail' });
  }
  const capture: UrlCapturePort = { async captureUrl() { throw new Error('private transport detail'); } };
  await assert.rejects(createDesktopPageCapture({ capture }).capture(request), { kind: 'failed', message: 'native capture failed' });
});
