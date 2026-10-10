import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('unpublished hardwiring exports cannot fail the required CI summary', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.equal(workflow.includes('check "${{ steps.gate-hardwiring.outcome }}"'), false);
  // Keep the informational run visible while release adoption is pending.
  assert.match(workflow, /id: gate-hardwiring\s+continue-on-error: true/);
  assert.match(workflow, /node development\/scripts\/check-hardwiring\.mjs/);
});
