/** Owner dispatch: the host's composition of the native screenshot channel. The native mapping and
 * routing rules are tested beside their code in the integrations package; this wire test keeps the
 * host's real Playwright adapter and desktop channel resolution behind that composition. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RenderServiceError, type UrlCapturePort } from '@jini-ai/desktop-host';
import { createPageCaptureForHost } from '@jini-ai/integrations/web-screenshot/desktop-page-capture';
import { VIEWPORT_PRESETS, type PageCaptureRequest } from '@jini-ai/integrations/web-screenshot/web-screenshot';
import type { HttpClientPort } from '#src/platform/http/index';
import { desktopRenderForHost } from '#src/platform/headless-browser/desktop-render';
import { createPlaywrightPageCapture, type PlaywrightPageCaptureOptions } from '../playwright-page-capture.js';

const request: PageCaptureRequest = { url: 'http://127.0.0.1:4200/about', viewport: VIEWPORT_PRESETS.mobile,
  fullPage: true, maxPageHeightPx: 8000, settleMs: 1200, allowedOrigins: ['http://127.0.0.1:4200'] };
const result = { png: Buffer.from('native png'), finalUrl: request.url, title: 'About', status: null, pageHeight: 9000, capturedHeight: 8000, blockedRequests: 2 };

/** The same composition `tool-catalog-manifest.ts` binds for `web_screenshot_page`. */
function hostCapture(
  required: { httpClient: HttpClientPort },
  { env = process.env, nativeCapture = desktopRenderForHost({ env }), ...options }: PlaywrightPageCaptureOptions & { env?: NodeJS.ProcessEnv; nativeCapture?: UrlCapturePort | null } = {},
) {
  return createPageCaptureForHost({ playwright: createPlaywrightPageCapture(required, options), nativeCapture,
    isRenderServiceError: (error): error is RenderServiceError => error instanceof RenderServiceError });
}

test('an absent desktop channel retains lazy Playwright and its unavailable-browser error', async () => {
  let launches = 0;
  const port = hostCapture({ httpClient: {} as HttpClientPort }, { env: {}, loadLauncher: async () => {
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
  const port = hostCapture({ httpClient: {} as HttpClientPort }, {
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
  const port = hostCapture({ httpClient: {} as HttpClientPort }, { env: { JINI_DESKTOP_RENDER_URL: 'https://evil.example/capture' },
    loadLauncher: async () => { launches++; throw new Error('must not launch'); } });
  await assert.rejects(port.capture(request), /invalid desktop capture channel/);
  assert.equal(launches, 0);
  await port.close();
});
