/**
 * @file Coverage for `use-site-rename.hooks.ts`'s pure decision logic.
 *
 * `useSiteRename` itself calls `useState`, so it cannot be invoked directly in this package: there
 * is no React renderer here at all (no jsdom, no testing-library, no react-test-renderer), and
 * calling a hook outside a component render throws "Invalid hook call" (verified empirically against
 * this exact React 19 install). But every DECISION the hook makes is a plain function it calls
 * rather than logic inlined in its own body — `isValidSiteName`, `canSubmitRename`,
 * `renameSubmission`, `describeRenameFailure` — pulled out for exactly the reason `folder-drop.ts`
 * was pulled out of `App.hooks.ts` (see that file's own header): so real behaviour is testable
 * without a renderer. Every test below calls one of those functions directly with real inputs and
 * asserts an exact output. Nothing here asserts against source text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSubmitRename,
  describeRenameFailure,
  isValidSiteName,
  NO_BRIDGE_RENAME_MESSAGE,
  renameSubmission,
} from './use-site-rename.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';

// ---------------------------------------------------------------------------------------------
// isValidSiteName
// ---------------------------------------------------------------------------------------------

test('an empty name is rejected', () => {
  assert.equal(isValidSiteName(''), false);
});

test('a name that is only whitespace is rejected — trims BEFORE measuring, not after', () => {
  // The exact defect this file's own doc warns about: measuring length first would let "   "
  // (length 3) through as valid, then fail at the NEXT boot with an error naming a file the
  // operator never touched.
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
  // disqualify it — the positive case for the same trim-before-measure rule above.
  assert.equal(isValidSiteName(`  ${'a'.repeat(200)}  `), true);
});

test('201 characters of content is still rejected once surrounding whitespace is trimmed away', () => {
  assert.equal(isValidSiteName(`  ${'a'.repeat(201)}  `), false);
});

// ---------------------------------------------------------------------------------------------
// canSubmitRename
// ---------------------------------------------------------------------------------------------

test('Save is enabled for a valid name that is not already saving', () => {
  assert.equal(canSubmitRename('My Site', false), true);
});

test('Save is disabled while a save is already in flight, even with a valid name', () => {
  assert.equal(canSubmitRename('My Site', true), false);
});

test('Save is disabled for an invalid name, even when nothing is in flight', () => {
  assert.equal(canSubmitRename('   ', false), false);
});

test('Save is disabled when BOTH the name is invalid and a save is in flight', () => {
  assert.equal(canSubmitRename('', true), false);
});

// ---------------------------------------------------------------------------------------------
// renameSubmission
// ---------------------------------------------------------------------------------------------

test('with no bridge, submission refuses with the exact operator-facing message', () => {
  const decision = renameSubmission(undefined, 'site-1', 'New Name');
  assert.deepEqual(decision, { kind: 'refused', message: NO_BRIDGE_RENAME_MESSAGE });
});

test('with a bridge, submission carries that SAME bridge reference and the id/name payload', () => {
  const fakeBridge = {} as unknown as RunnerInventoryBridge;
  const decision = renameSubmission(fakeBridge, 'site-7', 'Renamed Site');
  assert.equal(decision.kind, 'submit');
  if (decision.kind !== 'submit') throw new Error('unreachable — asserted above');
  assert.equal(decision.bridge, fakeBridge, 'must be the SAME bridge, not a copy');
  assert.deepEqual(decision.payload, { id: 'site-7', name: 'Renamed Site' });
});

test('the payload carries the RAW draft, untrimmed — main trims and validates its own copy', () => {
  // `RenameSiteInput`'s own doc (`contracts/project.ts`): "name is the RAW operator input,
  // untrimmed". Trimming here would make what main receives and what the operator typed silently
  // diverge from what main's error messages (and the disabled-Save state) are both talking about.
  const fakeBridge = {} as unknown as RunnerInventoryBridge;
  const decision = renameSubmission(fakeBridge, 'site-1', '  Padded Name  ');
  assert.equal(decision.kind, 'submit');
  if (decision.kind !== 'submit') throw new Error('unreachable — asserted above');
  assert.equal(decision.payload.name, '  Padded Name  ');
});

// ---------------------------------------------------------------------------------------------
// describeRenameFailure
// ---------------------------------------------------------------------------------------------

test('an Error rejection surfaces its message verbatim, fix and all', () => {
  const real = '1 to 200 characters once surrounding spaces are removed.';
  assert.equal(describeRenameFailure(new Error(real)), real);
});

test('a non-Error rejection is coerced with String(), not left as [object Object]', () => {
  assert.equal(describeRenameFailure('offline'), 'offline');
  assert.equal(describeRenameFailure(42), '42');
});
