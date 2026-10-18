import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRunStartContextRef } from '../run-start-context.js';

test('run start preserves bounded cold-session history alongside the compact prompt', () => {
  const coldStartContext = '## user\nAdd animations\n\n## assistant\n[antigravity run failed]\npermission denied';
  const decoded = parseRunStartContextRef(JSON.stringify({ prompt: 'please continue', principalId: 'owner', coldStartContext }));
  assert.equal(decoded.coldStartContext, coldStartContext);
  assert.equal(decoded.prompt, 'please continue');
});
