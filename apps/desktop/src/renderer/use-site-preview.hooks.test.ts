/**
 * @file Coverage for `use-site-preview.hooks.ts`: its pure decision logic and the actual
 * `useSitePreview` effect body.
 *
 * `useSitePreview` itself calls `useState`/`useEffect`, so it cannot be invoked directly in this
 * package: there is no React renderer here at all (no jsdom, no testing-library, no
 * react-test-renderer), and calling a hook outside a component render throws "Invalid hook call"
 * (verified empirically against this exact React 19 install). Every decision the effect makes,
 * though, is a plain function it calls — `previewFetchPlan` (whether to clear, skip, or fetch) and
 * `nextPreviewUrl` (what a settled fetch should write, respecting cancellation) — pulled out for
 * exactly the reason `folder-drop.ts` was pulled out of `App.hooks.ts` (see that file's own header).
 * Both are tested here directly, with real inputs and exact expected outputs.
 *
 * The effect body itself runs through the injected hook harness in `source-test-harness.ts`, with
 * deferred responses, so dependency changes and cancellation of a late result are observed without
 * a renderer.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hookHarness, sourceFunction } from './source-test-harness.js';

import { nextPreviewUrl, previewFetchPlan } from './use-site-preview.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookSource = fs.readFileSync(path.join(here, 'use-site-preview.hooks.ts'), 'utf8');

for (const staleOutcome of ['resolve', 'reject'] as const) {
  test(`the preview effect refetches a new id and ignores the cancelled request's late ${staleOutcome}`, async () => {
    const harness = hookHarness();
    const requests: Array<{ id: string; resolve: (url: string) => void; reject: (error: Error) => void }> = [];
    const bridge = {
      getSitePreview(id: string) {
        return new Promise<string>((resolve, reject) => requests.push({ id, resolve, reject }));
      },
    };
    const hook = sourceFunction(hookSource, 'useSitePreview', {
      ...harness.bindings, previewFetchPlan, nextPreviewUrl, runnerInventoryBridge: () => bridge,
    });
    let id = 'site-a';
    const render = () => harness.render(() => hook(id, 7));
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    try {
      assert.equal(render(), null);
      id = 'site-b';
      assert.equal(render(), null);
      assert.deepEqual(requests.map((request) => request.id), ['site-a', 'site-b']);
      requests[1]!.resolve('data:image/png;base64,new');
      await flush();
      assert.equal(render(), 'data:image/png;base64,new');
      if (staleOutcome === 'resolve') requests[0]!.resolve('data:image/png;base64,old');
      else requests[0]!.reject(new Error('late stale failure'));
      await flush();
      assert.equal(render(), 'data:image/png;base64,new');
      assert.equal(requests.length, 2, 'unchanged id/version must not refetch');
    } finally { harness.cleanup(); }
  });
}

// ---------------------------------------------------------------------------------------------
// previewFetchPlan
// ---------------------------------------------------------------------------------------------

test('a null previewVersion clears, even when a bridge IS available', () => {
  // Regression: if the bridge check ran first, a site with a live bridge but no capture for this
  // version would fall through to fetching instead of clearing — checked with a present fake bridge
  // specifically so this test cannot pass merely because the bridge happened to be undefined too.
  const fakeBridge = {} as unknown as RunnerInventoryBridge;
  assert.deepEqual(previewFetchPlan('site-1', null, fakeBridge), { kind: 'clear' });
});

test('a null previewVersion clears with no bridge either', () => {
  assert.deepEqual(previewFetchPlan('site-1', null, undefined), { kind: 'clear' });
});

test('a real previewVersion with no bridge skips — no fetch attempted, but nothing is cleared', () => {
  assert.deepEqual(previewFetchPlan('site-1', 42, undefined), { kind: 'skip' });
});

test('a real previewVersion with a bridge plans a fetch, carrying that SAME bridge reference and the id', () => {
  const fakeBridge = {} as unknown as RunnerInventoryBridge;
  const plan = previewFetchPlan('site-7', 42, fakeBridge);
  assert.equal(plan.kind, 'fetch');
  if (plan.kind !== 'fetch') throw new Error('unreachable — asserted above');
  assert.equal(plan.bridge, fakeBridge, 'must be the SAME bridge, not a copy');
  assert.equal(plan.id, 'site-7');
});

test('previewVersion 0 is a real version, not treated like null', () => {
  // A falsy-but-real value — the exact class of bug a `!previewVersion` check (instead of
  // `=== null`) would introduce.
  const fakeBridge = {} as unknown as RunnerInventoryBridge;
  assert.deepEqual(previewFetchPlan('site-1', 0, fakeBridge), { kind: 'fetch', bridge: fakeBridge, id: 'site-1' });
});

// ---------------------------------------------------------------------------------------------
// nextPreviewUrl
// ---------------------------------------------------------------------------------------------

test('a cancelled run writes nothing on success — a stale resolve must not clobber a newer run', () => {
  assert.equal(nextPreviewUrl(true, { ok: true, url: 'data:image/png;base64,fake' }), undefined);
});

test('a cancelled run writes nothing on failure either', () => {
  assert.equal(nextPreviewUrl(true, { ok: false }), undefined);
});

test('a live run writes the resolved url on success', () => {
  assert.equal(nextPreviewUrl(false, { ok: true, url: 'data:image/png;base64,fake' }), 'data:image/png;base64,fake');
});

test('a live run writes null on success when there genuinely is no capture yet', () => {
  // `getSitePreview` resolving `null` is not a failure — it is "nothing captured yet" — and must
  // still be written (as null), not treated the same as "do nothing" the way a cancelled run is.
  assert.equal(nextPreviewUrl(false, { ok: true, url: null }), null);
});

test('a live run writes null on failure', () => {
  assert.equal(nextPreviewUrl(false, { ok: false }), null);
});

// ---------------------------------------------------------------------------------------------
// The one thing that stays a source-text guard: the effect's dependency array
// ---------------------------------------------------------------------------------------------

test('the effect refetches on id changing too, not only previewVersion', () => {
  // Regression: if the dependency array narrowed to `[previewVersion]` alone, two different sites
  // that happen to share a version NUMBER (a filesystem mtime — see this file's own header on why
  // it is not monotonic) would silently keep showing whichever site fetched first. There is no way
  // to observe a dependency array's effect without a renderer, so this one thing stays a source-text
  // assertion rather than a call — see this file's own header.
  assert.match(hookSource, /\}, \[id, previewVersion\]\);/);
});
