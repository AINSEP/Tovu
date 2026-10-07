import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueSiteName, duplicateSiteNameError } from './site-name-policy.ts';

test('D-10: normalized collisions use the first free suffix and preserve casing', () => {
  assert.equal(uniqueSiteName({ name: ' Bakery ', names: ['bakery', ' BAKERY 2 ', 'Bakery 4'] }), 'Bakery 3');
  assert.equal(uniqueSiteName({ name: ' Bakery ', names: ['Bakery 2'] }), 'Bakery');
  assert.equal(uniqueSiteName({ name: 'Bakery', names: ['Bakery', 'Bakery 3'] }), 'Bakery 2');
  assert.equal(uniqueSiteName({ name: 'Bakery 2', names: ['Bakery 2'] }), 'Bakery 2 2');
});
test('D-10: suffixing respects the CLI name length without colliding after truncation', () => {
  const name = 'x'.repeat(200);
  assert.equal(uniqueSiteName({ name, names: [name, `${'x'.repeat(198)} 2`] }), `${'x'.repeat(198)} 3`);
});
test('D-10: Rename refuses exact normalized duplicate and accepts a free name', () => {
  assert.equal(duplicateSiteNameError({ name: ' BAKERY ', names: ['Bakery'] }), 'A website named "BAKERY" is already tracked. Choose a different name.');
  assert.equal(duplicateSiteNameError({ name: 'Bakery', names: ['Bakery 2'] }), null);
});
