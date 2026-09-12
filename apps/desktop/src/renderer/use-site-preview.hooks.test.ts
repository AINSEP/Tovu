/**
 * @file Coverage for `use-site-preview.hooks.ts`'s pure decision logic.
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
 * The ONE thing left as a source-text assertion is the effect's `[id, previewVersion]` dependency
 * array itself — that is React's own wiring, not a decision this module makes, and there is no way
 * to observe "did the effect re-run on a dependency change" without a renderer to run it in.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { nextPreviewUrl, previewFetchPlan } from './use-site-preview.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookSource = fs.readFileSync(path.join(here, 'use-site-preview.hooks.ts'), 'utf8');

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
