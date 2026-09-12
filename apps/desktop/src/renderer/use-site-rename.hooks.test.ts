/**
 * @file Coverage for `use-site-rename.hooks.ts`.
 *
 * Two halves, for two different kinds of mistake — same split `use-add-site.hooks.test.ts` makes
 * for its own stateful hook:
 *
 * 1. **`isValidSiteName`**, the one pure rule this file exports, asserted directly against real
 *    boundary values. This is where the feature could go quietly wrong: it exists specifically to
 *    mirror `validateConfig`'s bound (main's own rule, per this file's own doc), so a Save button
 *    that agreed with itself but not with main would enable on a name the NEXT boot then refuses.
 * 2. **The wiring**, asserted against the source text: that `canSave` is actually built FROM
 *    `isValidSiteName`, not a re-implementation of the same rule that could drift from it.
 *
 * `useSiteRename` itself calls `useState`, so — like `useAddSite` in this same package — it cannot
 * be invoked directly here: this package has no React renderer (no jsdom, no testing-library, no
 * react-test-renderer), and calling a hook outside a component render throws ("Invalid hook call",
 * verified against this exact package's React 19 at 2026-09-12). Importing the module still gives it
 * a coverage record; the stateful body itself is exercised only by the wiring assertions below, the
 * same limitation `App.hooks.ts`'s many untested `useEffect`/`useState` hooks already carry in this
 * package.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isValidSiteName, useSiteRename } from './use-site-rename.hooks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hookSource = fs.readFileSync(path.join(here, 'use-site-rename.hooks.ts'), 'utf8');

test('the module exports the hook function it claims to', () => {
  // Trivial, but real: catches a renamed or accidentally-removed export before anything downstream
  // does, and is the one statement in this file that actually touches `useSiteRename` itself rather
  // than only its source text.
  assert.equal(typeof useSiteRename, 'function');
});

test('an empty name is rejected', () => {
  assert.equal(isValidSiteName(''), false);
});

test('a name that is only whitespace is rejected — trims BEFORE measuring, not after', () => {
  // The exact defect this file's own doc warns about: measuring length first would let "   " (length
  // 3) through as valid, then fail at the NEXT boot with an error naming a file the operator never
  // touched.
  assert.equal(isValidSiteName('   '), false);
  assert.equal(isValidSiteName('\t\n '), false);
});

test('a single visible character is accepted', () => {
  assert.equal(isValidSiteName('a'), true);
});

test('exactly 200 characters (the boundary) is accepted', () => {
  assert.equal(isValidSiteName('a'.repeat(200)), true);
});

test('201 characters is rejected — one past the boundary', () => {
  assert.equal(isValidSiteName('a'.repeat(201)), false);
});

test('200 characters of CONTENT survives surrounding whitespace that would otherwise push it over', () => {
  // Trimming happens first, so padding around a name that is exactly at the limit must not
  // disqualify it — this is the positive case for the same trim-before-measure rule above.
  assert.equal(isValidSiteName(`  ${'a'.repeat(200)}  `), true);
});

test('201 characters of content is still rejected once surrounding whitespace is trimmed away', () => {
  assert.equal(isValidSiteName(`  ${'a'.repeat(201)}  `), false);
});

test('canSave is built FROM isValidSiteName, not a second, independently-drifting rule', () => {
  // A regression here is exactly "the Save button and main's own validator quietly disagree" — the
  // one this hook is documented to exist to prevent. Structural, because `canSave`'s composition
  // cannot be observed by calling the hook in this package (see this file's own header).
  assert.match(hookSource, /canSave: isValidSiteName\(draft\) && !saving,/);
});

test('a missing bridge sets the error WITHOUT ever flashing a saving state', () => {
  // `submitRename`'s documented contract: a call that never reached the bridge did not start, so
  // `saving` must never flip true for it. Asserted on the source because this branch runs inside a
  // stateful hook body this package cannot invoke directly (see header).
  const submit = hookSource.slice(hookSource.indexOf('const submitRename ='));
  const missingBridgeBranch = submit.slice(submit.indexOf('if (!bridge)'), submit.indexOf('setSaving(true);'));
  assert.doesNotMatch(missingBridgeBranch, /setSaving/, 'the missing-bridge branch must not touch saving at all');
  assert.match(missingBridgeBranch, /setRenameError\('The desktop bridge is unavailable/);
});
