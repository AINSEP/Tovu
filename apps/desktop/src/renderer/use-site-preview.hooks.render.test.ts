import assert from 'node:assert/strict';
import test from 'node:test';

import { deferred } from './app-hooks.test-support.js';
import { installDom, renderHook, settle } from './dom-hook-harness.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { useSitePreview } from './use-site-preview.hooks.js';

test('the preload preview follows capture versions, ignoring a late reply and clearing when the capture is removed', async (t) => {
  const window = installDom();
  const old = deferred<string>();
  const current = deferred<string>();
  const siteId = '/sites/preview-shop';
  const requests: { id: string }[] = [];
  const bridge = {
    getSitePreview: (input: { id: string }) => {
      requests.push(input);
      return requests.length === 1 ? old.promise : current.promise;
    },
  } satisfies Pick<RunnerInventoryBridge, 'getSitePreview'>;
  Object.defineProperty(window, 'tovuRunner', { configurable: true, value: bridge });
  t.after(() => Reflect.deleteProperty(window, 'tovuRunner'));

  let version: number | null = 42;
  const hook = renderHook({ t, useHook: () => useSitePreview({ id: siteId, previewVersion: version }) });
  assert.equal(hook.current(), null);
  assert.deepEqual(requests, [{ id: siteId }]);
  version = 19; // A restored capture can move the token backward.
  hook.rerender();
  assert.deepEqual(requests, [{ id: siteId }, { id: siteId }]);

  current.resolve('data:image/png;base64,YQ==');
  await settle();
  assert.equal(hook.current(), 'data:image/png;base64,YQ==');
  old.resolve('data:image/png;base64,Yg==');
  await settle();
  assert.equal(hook.current(), 'data:image/png;base64,YQ==');

  version = null;
  hook.rerender();
  assert.equal(hook.current(), null);
  assert.deepEqual(requests, [{ id: siteId }, { id: siteId }]);
});
