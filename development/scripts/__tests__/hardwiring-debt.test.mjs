import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { collectHardwiring } from '../check-hardwiring.mjs';

// Shares the existing standalone hardwiring suite: registry releases without the new inspector
// exports keep this informational gate separate from the required npm test command.

test('the hardwiring report contains no stale debt rows after ownership fixes land', async () => {
  const { api, violations } = await collectHardwiring();
  const baseline = JSON.parse(readFileSync(new URL('../hardwiring-debt.json', import.meta.url), 'utf8'));
  const { removed } = api.diffHardwiringDebt({ baseline: baseline.violations, current: violations });
  assert.deepEqual(removed, []);
});
