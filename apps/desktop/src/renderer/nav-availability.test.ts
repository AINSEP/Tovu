import test from 'node:test';
import assert from 'node:assert/strict';
import { navAvailability } from './nav-availability.ts';

test('D-11: inert destinations expose exact hover and accessible Coming soon copy', () => {
  for (const label of ['Home', 'Marketplace', 'Media', 'Activity', 'Updates', 'Settings']) {
    assert.deepEqual(navAvailability({ label, disabled: true }), {
      'data-tip': `${label} — Coming soon`, title: 'Coming soon', 'aria-description': 'Coming soon',
    });
  }
});
test('D-11: Websites retains its existing tooltip attributes', () => {
  assert.deepEqual(navAvailability({ label: 'Websites', disabled: false }), { 'data-tip': 'Websites' });
});
