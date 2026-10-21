/**
 * @file The renderer's hand-rolled test harness has one contract of its own worth pinning: a hook
 * that sets state on every render must fail loudly instead of looping forever. Every other path is
 * exercised by the many tests that use `hookHarness`/`sourceFunction`/`elements`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { hookHarness } from './source-test-harness.js';

test('hookHarness.render refuses a hook that never settles', () => {
  const harness = hookHarness();
  let renders = 0;
  const useRunaway = () => {
    const [count, setCount] = harness.bindings.useState(0);
    renders++;
    setCount(count + 1);
    return count;
  };
  assert.throws(() => harness.render(useRunaway), /hook did not settle/);
  assert.equal(renders, 20, 'it gives up after a bounded number of renders');
});

test('hookHarness.render returns once a state update stops changing anything', () => {
  const harness = hookHarness();
  const useOnce = () => {
    const [value, setValue] = harness.bindings.useState(() => 'initial');
    setValue('settled');
    return value;
  };
  assert.equal(harness.render(useOnce), 'settled');
});
