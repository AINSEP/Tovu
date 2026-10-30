import { SharpImageTransformer } from "@jini-ai/cms/media/node";
/** Native previews share the existing resize, storage and queue contracts without Chromium. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSitePreviewCaptureForHost } from '../site-preview/playwright-site-preview-capture.js';

test('Sites/Themes preview passes the native PNG through the established JPEG resize', async () => {
  let received: unknown;
  const port = createSitePreviewCaptureForHost({ imageCodec: new SharpImageTransformer() }, { capture: { async captureUrl(input) {
    received = input;
    return { png: Buffer.from('png'), finalUrl: input.url, title: '', status: null, pageHeight: 800, capturedHeight: 800, blockedRequests: 0 };
  } }, resize: async ({ png, width }) => { assert.equal(png.toString(), 'png'); assert.equal(width, 640); return Buffer.from('jpeg'); } });
  assert.equal((await port.capture({ url: 'http://127.0.0.1:4200/' }))?.toString(), 'jpeg');
  assert.deepEqual(received, { url: 'http://127.0.0.1:4200/', viewport: { width: 1280, height: 800 }, fullPage: false, maxPageHeightPx: 800, settleMs: 1200 });
  await port.close();
});

test('native preview failure remains a null preview with a safe diagnostic', async () => {
  const logs: string[] = [];
  const port = createSitePreviewCaptureForHost({ imageCodec: new SharpImageTransformer() }, { capture: { async captureUrl() { throw new Error('sensitive address'); } }, log: text => logs.push(text) });
  assert.equal(await port.capture({ url: 'http://127.0.0.1:4200/' }), null);
  assert.deepEqual(logs, ['[site-preview] native capture failed']);
});
