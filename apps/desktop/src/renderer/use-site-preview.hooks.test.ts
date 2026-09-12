/**
 * @file Coverage for `use-site-preview.hooks.ts`.
 *
 * `useSitePreview` exports nothing but itself — no pure helper split out of it the way
 * `use-site-rename.hooks.ts` splits out `isValidSiteName`. Its whole body lives behind `useState`/
 * `useEffect`, and this package has no React renderer at all (no jsdom, no testing-library, no
 * react-test-renderer): calling a hook directly outside a component render throws ("Invalid hook
 * call", verified against this exact package's React 19 at 2026-09-12, the same finding
 * `use-site-rename.hooks.test.ts`'s header records). `App.hooks.ts` carries the identical gap for
 * most of its own hooks today — this file is not a new exception, it is the existing one.
 *
 * So this suite does what it can for real (confirms the export exists, which is what actually
 * imports the module and gives it a coverage record) and asserts everything else — the null-version
 * short-circuit, the per-effect-run cancellation guard, and the exact dependency list — against the
 * source text, the same convention `use-add-site.hooks.test.ts` and `SiteGrid.hooks.test.ts`'s
 * wiring test use for logic this package cannot otherwise drive. These do not add line/branch
 * coverage for the effect body; they exist to catch the shape of a real regression (see each test's
 * own comment for which one), and are reported to the coordinator as source-text guards rather than
 * executed behavior.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { useSitePreview } from './use-site-preview.hooks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookSource = fs.readFileSync(path.join(here, 'use-site-preview.hooks.ts'), 'utf8');
const effectBody = hookSource.slice(hookSource.indexOf('useEffect(() => {'), hookSource.indexOf('}, [id, previewVersion]);') + 1);

test('the module exports the hook function it claims to', () => {
  // Trivial, but real: the one statement in this file that actually touches `useSitePreview` rather
  // than only its source text, and what registers this module in the coverage report at all.
  assert.equal(typeof useSitePreview, 'function');
});

test('a null previewVersion clears any URL held from a prior id/version BEFORE fetching anything', () => {
  // The regression this guards: a card that no longer has a capture must not keep showing a PREVIOUS
  // card's image just because React reused this component instance. Asserted as "checked first,
  // before any bridge call" — reordering it after the bridge lookup would fetch for a site with
  // nothing to fetch.
  const nullCheck = effectBody.slice(0, effectBody.indexOf('const bridge = runnerInventoryBridge();'));
  assert.match(nullCheck, /if \(previewVersion === null\) \{/);
  assert.match(nullCheck, /setUrl\(null\);/);
  assert.match(nullCheck, /return;/);
});

test('a stale fetch cannot overwrite state once a newer effect run has started — both the success AND failure paths check `cancelled`', () => {
  // Regression: an older `previewVersion`'s slow request resolving AFTER a newer one started must
  // not clobber the newer image (or blank it out via a stale failure). Both branches are checked —
  // a fix that only guarded `.then` and left `.catch` open would still be a real bug.
  assert.match(effectBody, /\.then\(\(result\) => \{\s*if \(!cancelled\) setUrl\(result\);/);
  assert.match(effectBody, /\.catch\(\(\) => \{\s*if \(!cancelled\) setUrl\(null\);/);
  assert.match(effectBody, /cancelled = true;/);
});

test('the effect refetches on id changing too, not only previewVersion', () => {
  // Regression: if the dependency array narrowed to `[previewVersion]` alone, two different sites
  // that happen to share a version NUMBER (a filesystem mtime — see this file's own header on why
  // it is not monotonic) would silently keep showing whichever site fetched first.
  assert.match(hookSource, /\}, \[id, previewVersion\]\);/);
});

test('no bridge means no fetch is attempted at all — the effect returns instead of throwing on undefined', () => {
  const afterNullCheck = effectBody.slice(effectBody.indexOf('const bridge = runnerInventoryBridge();'));
  const bridgeGuard = afterNullCheck.slice(0, afterNullCheck.indexOf('let cancelled'));
  assert.match(bridgeGuard, /if \(!bridge\) return;/);
});
