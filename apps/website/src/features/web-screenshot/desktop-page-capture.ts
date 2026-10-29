/** Map Jini's native render capability onto the existing screenshot port. The site/theme opener,
 * serialization, JPEG tiles and saved files remain owned by the screenshot feature.
 */
import { RenderServiceError, type UrlCapturePort } from '@jini-ai/desktop-host';
import { desktopRenderForHost } from '#src/platform/headless-browser/desktop-render';
import type { HttpClientPort } from '#src/platform/http/index';
import { createPlaywrightPageCapture, type PlaywrightPageCaptureOptions } from './playwright-page-capture.js';
import { PageCaptureError, type PageCapturePort } from './web-screenshot.js';

/** A native window is owned per request; closing this port has no shared browser to terminate.
 * @throws PageCaptureError for every expected native/transport failure.
 * @complexity O(pixels), bounded by Jini's capture contract.
 */
export function createDesktopPageCapture({ capture }: { capture: UrlCapturePort }, _options = {}): PageCapturePort {
  return {
    async capture(request, { signal } = {}) {
      // Desktop's native channel is deliberately own-site only, including the ephemeral theme
      // render origin supplied by openOwnSite. A public-reference URL retains the clear refusal.
      if (!request.allowedOrigins.includes(new URL(request.url).origin)) {
        throw new PageCaptureError({ kind: 'refused', message: 'desktop capture requires sitePath on this site' });
      }
      if (request.dismissCookieBanners || typeof request.waitFor === 'string') {
        throw new PageCaptureError({ kind: 'failed', message: 'native capture does not support consent clicks or selector waits' });
      }
      try {
        const result = await capture.captureUrl({ url: request.url, viewport: request.viewport,
          fullPage: request.fullPage, maxPageHeightPx: request.maxPageHeightPx,
          settleMs: typeof request.waitFor === 'number' ? request.waitFor * 1000 : request.settleMs,
        }, signal ? { signal } : {});
        return { ...result, png: Buffer.from(result.png) };
      } catch (error) {
        throw nativeCaptureError({ error });
      }
    },
    async close() {},
  };
}

function nativeCaptureError({ error }: { error: unknown }, _options = {}): PageCaptureError {
  if (!(error instanceof RenderServiceError)) {
    return new PageCaptureError({ kind: 'failed', message: 'native capture failed' });
  }
  if (error.code === 'timeout' || error.code === 'aborted') {
    return new PageCaptureError({ kind: 'timeout', message: error.message });
  }
  const kind = error.code === 'navigation-blocked' ? 'refused' : 'failed';
  return new PageCaptureError({ kind, message: error.message });
}

/** Both compiled serve and source-mode desktop use this same composition decision. No channel
 * means the existing Playwright adapter (and its unavailable-browser error) is unchanged.
 * @complexity O(1).
 */
export function createPageCaptureForHost(
  required: { httpClient: HttpClientPort },
  { env = process.env, nativeCapture = desktopRenderForHost({ env }), ...options }: PlaywrightPageCaptureOptions & {
    env?: NodeJS.ProcessEnv; nativeCapture?: UrlCapturePort | null;
  } = {},
): PageCapturePort {
  const playwright = createPlaywrightPageCapture(required, options);
  if (!nativeCapture) return playwright;
  const desktop = createDesktopPageCapture({ capture: nativeCapture });
  return {
    capture(request, optional) {
      // Public references retain the guarded public browser. Explicit consent/selector interaction
      // also keeps its existing implementation; the native capability never broadens its policy.
      if (request.allowedOrigins.length === 0 || request.dismissCookieBanners || typeof request.waitFor === 'string') {
        return playwright.capture(request, optional);
      }
      return desktop.capture(request, optional);
    },
    async close() { await Promise.all([desktop.close(), playwright.close()]); },
  };
}
