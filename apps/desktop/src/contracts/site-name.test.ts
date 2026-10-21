import assert from 'node:assert/strict';
import test from 'node:test';
import { SITE_NAME_ERROR, SITE_NAME_MAX_LENGTH, namePasteHandler, siteNameError } from './site-name.js';

test('siteNameError accepts 1..200 characters after trimming and refuses everything else', () => {
  assert.equal(siteNameError({ name: 'Blog' }), null);
  assert.equal(siteNameError({ name: `  ${'x'.repeat(SITE_NAME_MAX_LENGTH)}  ` }), null, 'surrounding spaces do not count');
  for (const name of ['', '   ', 'x'.repeat(SITE_NAME_MAX_LENGTH + 1), 42, null, undefined]) {
    assert.equal(siteNameError({ name }), SITE_NAME_ERROR, JSON.stringify(name));
  }
});

/** A paste event over an input holding `value` with the given selection. */
function paste(value: string, pasted: string, selectionStart: number | null, selectionEnd: number | null) {
  let prevented = false;
  return {
    event: {
      clipboardData: { getData: (format: string) => { assert.equal(format, 'text'); return pasted; } },
      currentTarget: { value, selectionStart, selectionEnd },
      preventDefault: () => { prevented = true; },
    },
    prevented: () => prevented,
  };
}

test('a paste that fits is left to the browser untouched', () => {
  const names: string[] = [];
  const onPaste = namePasteHandler({ setName: (name) => names.push(name) });
  const fits = paste('My ', 'Site', 3, 3);
  onPaste(fits.event);
  assert.equal(fits.prevented(), false);
  assert.deepEqual(names, []);
});

test('an over-long paste keeps the WHOLE draft (replacing the selection) instead of letting maxlength truncate it', () => {
  const names: string[] = [];
  const onPaste = namePasteHandler({ setName: (name) => names.push(name) });
  const long = 'y'.repeat(SITE_NAME_MAX_LENGTH);
  const replacing = paste('abcdef', long, 1, 5);
  onPaste(replacing.event);
  assert.equal(replacing.prevented(), true);
  assert.deepEqual(names, [`a${long}f`]);
});

test('with no selection reported, the paste lands at the end of the current value', () => {
  const names: string[] = [];
  const onPaste = namePasteHandler({ setName: (name) => names.push(name) });
  const long = 'z'.repeat(SITE_NAME_MAX_LENGTH);
  onPaste(paste('start-', long, null, null).event);
  // A start with no end collapses the selection to the start.
  onPaste(paste('start-', long, 2, null).event);
  assert.deepEqual(names, [`start-${long}`, `st${long}art-`]);
});
