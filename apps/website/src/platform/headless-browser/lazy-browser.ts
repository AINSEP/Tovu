import type { ImageCodecPort } from "@jini-ai/cms/media";
/**
 * @file The shared core of every headless-Chromium capture in this server: one lazily launched
 * browser per owner, reused across captures and closed when idle, plus the JPEG encoding both
 * screenshot paths store or return.
 *
 * Two owners today, each with its OWN instance because their launch flags differ on purpose:
 * - Sites card previews (`features/sites/site-preview/`) open only loopback URLs this server built,
 *   so they may run Chromium unsandboxed in a container.
 * - `web_screenshot_page` (`features/web-screenshot/`) opens arbitrary public pages, so it keeps
 *   Chromium's sandbox on and routes every request through the egress guard.
 *
 * The generic lazy owner now lives in `@jini-ai/diagnostics/web-evidence`; this module retains
 * host module resolution and JPEG encoding. Jini must be released before the host consumes its
 * new export, because an import of an unbuilt Jini export crashes the dev server.
 *
 * Cost: one Chromium process (~150–250 MB RSS) while in use; nothing at all between uses.
 */

import { playwrightModuleLoader } from "./playwright-loader.js";

export { createLazyBrowser } from "@jini-ai/diagnostics/web-evidence/playwright";
export type { ClosableBrowser, LazyBrowser, LazyBrowserTimers } from "@jini-ai/diagnostics/web-evidence/playwright";

/** Dynamic so a deployment without Playwright gets a rejected capture, not a boot failure. */
export async function importPlaywrightChromium(): Promise<{ launch(options: Record<string, unknown>): Promise<unknown> }> {
  const { chromium } = await playwrightModuleLoader.load({ moduleName: "playwright" });
  return chromium as unknown as { launch(options: Record<string, unknown>): Promise<unknown> };
}

/**
 * Re-encodes a screenshot as JPEG no wider than `maxWidth` (never enlarged).
 * @complexity O(pixels) — one decode and one encode.
 */
export async function encodeJpeg(
  { image, maxWidth, imageCodec }: { image: Buffer; maxWidth: number; imageCodec: ImageCodecPort },
  { quality = 72 }: { quality?: number } = {},
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const encoded = await imageCodec.encode({ source: image, format: "jpeg", quality, resize: { width: maxWidth, withoutEnlargement: true } });
  return { ...encoded, bytes: Buffer.from(encoded.bytes) };
}
