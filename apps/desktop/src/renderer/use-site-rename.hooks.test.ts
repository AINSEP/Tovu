/**
 * @file Coverage for `use-site-rename.hooks.ts`: its pure decision logic, IME key handling, and the
 * actual `useSiteRename` submit flow.
 *
 * There is no React renderer in this package at all (no jsdom, no testing-library, no
 * react-test-renderer), and calling a hook outside a component render throws "Invalid hook call"
 * (verified empirically against this exact React 19 install). So every DECISION the hook makes is a
 * plain function it calls rather than logic inlined in its own body — `isValidSiteName`,
 * `canSubmitRename`, `renameSubmission`, `describeRenameFailure` — pulled out for exactly the reason
 * `folder-drop.ts` was pulled out of `App.hooks.ts` (see that file's own header): so real behaviour
 * is testable without a renderer. Those tests call the functions directly with real inputs and assert
 * exact outputs. The submit flow (saving, failure, retry, success) instead runs the hook's real body
 * through the injected hook harness in `source-test-harness.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hookHarness, sourceFunction } from './source-test-harness.js';

import {
  canSubmitRename,
  describeRenameFailure,
  isValidSiteName,
  NO_BRIDGE_RENAME_MESSAGE,
  renameInputKeyDown,
  renameSubmission,
  showsInvalidNameHint,
} from './use-site-rename.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';

test('submitRename preserves the draft on failure, clears saving, and closes with the returned record on retry', async () => {
  const harness = hookHarness();
  const calls: unknown[] = [];
  const renamed: unknown[] = [];
  const pending: Array<{ resolve: (record: unknown) => void; reject: (error: Error) => void }> = [];
  const bridge = { renameSite(payload: unknown) {
    calls.push(payload);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  } };
  const hook = sourceFunction(readFileSync(new URL('./use-site-rename.hooks.ts', import.meta.url), 'utf8'), 'useSiteRename', {
    ...harness.bindings, renameSubmission, describeRenameFailure, canSubmitRename, runnerInventoryBridge: () => bridge,
  });
  const render = () => harness.render(() => hook((record: unknown) => renamed.push(record)));
  try {
    render().startRename({ id: 'site-7', displayName: 'Old name' });
    render().setDraft('New name');
    const first = render().submitRename('site-7');
    assert.equal(render().saving, true);
    assert.equal(render().canSave, false);
    assert.deepEqual(calls, [{ id: 'site-7', name: 'New name' }]);
    pending[0]!.reject(new Error('Folder is unavailable'));
    await first;
    assert.equal(render().renamingId, 'site-7');
    assert.equal(render().draft, 'New name');
    assert.equal(render().renameError, 'Folder is unavailable');
    assert.equal(render().saving, false);
    assert.equal(render().canSave, true);
    assert.deepEqual(renamed, []);
    const second = render().submitRename('site-7');
    assert.equal(render().renameError, null);
    assert.equal(render().saving, true);
    const record = { id: 'site-7', displayName: 'New name' };
    pending[1]!.resolve(record);
    await second;
    assert.equal(render().renamingId, null);
    assert.equal(render().saving, false);
    assert.equal(render().renameError, null);
    assert.deepEqual(renamed, [record]);
    assert.equal(renamed[0], record);
    assert.deepEqual(calls, [{ id: 'site-7', name: 'New name' }, { id: 'site-7', name: 'New name' }]);
  } finally { harness.cleanup(); }
});

test('Enter that commits IME composition cannot submit; the subsequent ordinary Enter can', () => {
  for (const composing of [{ nativeEvent: { isComposing: true } }, { isComposing: true }, { keyCode: 229 }]) {
    const { calls, rename } = recordingRename(true);
    const handler = renameInputKeyDown(rename, 'site-ime');
    handler({ key: 'Enter', ...composing });
    assert.deepEqual(calls, [], 'committing composition must leave rename open');
    handler({ key: 'Enter', nativeEvent: { isComposing: false } });
    assert.deepEqual(calls, ['submit:site-ime']);
  }
});

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

// ---------------------------------------------------------------------------------------------
// showsInvalidNameHint
// ---------------------------------------------------------------------------------------------

test('the invalid-name hint shows for a non-empty draft Tovu would reject', () => {
  assert.equal(showsInvalidNameHint('   '), true);
  assert.equal(showsInvalidNameHint('a'.repeat(201)), true);
});

test('no invalid-name hint for an empty draft', () => {
  assert.equal(showsInvalidNameHint(''), false);
});

test('no invalid-name hint for a valid draft, including one exactly at the 200 boundary', () => {
  assert.equal(showsInvalidNameHint('My Site'), false);
  assert.equal(showsInvalidNameHint('a'.repeat(200)), false);
});

// ---------------------------------------------------------------------------------------------
// renameInputKeyDown
// ---------------------------------------------------------------------------------------------

/** A rename state that records every call the key handler makes, in order. */
function recordingRename(canSave: boolean) {
  const calls: string[] = [];
  const rename = {
    canSave,
    cancelRename: () => {
      calls.push('cancel');
    },
    submitRename: async (id: string) => {
      calls.push(`submit:${id}`);
    },
  };
  return { calls, rename };
}

test('Escape cancels the rename, whether or not Save is enabled', () => {
  for (const canSave of [true, false]) {
    const { calls, rename } = recordingRename(canSave);
    renameInputKeyDown(rename, 'site-1')({ key: 'Escape' });
    assert.deepEqual(calls, ['cancel'], `canSave=${canSave}`);
  }
});

test('Enter submits the card being renamed when Save is enabled', () => {
  const { calls, rename } = recordingRename(true);
  renameInputKeyDown(rename, 'site-3')({ key: 'Enter' });
  assert.deepEqual(calls, ['submit:site-3']);
});

test('Enter does nothing while Save is disabled', () => {
  const { calls, rename } = recordingRename(false);
  renameInputKeyDown(rename, 'site-3')({ key: 'Enter' });
  assert.deepEqual(calls, []);
});

test('every other key is left alone', () => {
  const { calls, rename } = recordingRename(true);
  const onKeyDown = renameInputKeyDown(rename, 'site-1');
  for (const key of ['a', ' ', 'Tab', 'Esc', 'NumpadEnter']) onKeyDown({ key });
  assert.deepEqual(calls, []);
});

test('building the handler runs nothing', () => {
  const { calls, rename } = recordingRename(true);
  renameInputKeyDown(rename, 'site-1');
  assert.deepEqual(calls, []);
});
