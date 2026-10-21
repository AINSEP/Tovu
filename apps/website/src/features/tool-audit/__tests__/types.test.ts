import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOL_ATTEMPT_PHASES as daemonPhases } from '@jini-ai/daemon/tool-audit';
import { TOOL_ATTEMPT_PHASES } from '../types.js';

/** The phase vocabulary is the daemon's, re-exported unchanged: one list, never a Tovu copy. */
test('tool-audit types re-export the daemon phase list itself', () => {
  assert.equal(TOOL_ATTEMPT_PHASES, daemonPhases);
  assert.ok(Array.isArray(TOOL_ATTEMPT_PHASES) && TOOL_ATTEMPT_PHASES.length > 0);
  assert.ok(TOOL_ATTEMPT_PHASES.includes('requested'), 'the phase the audit sink records first must be in the vocabulary');
});
