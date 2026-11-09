import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAgentPluginMcpError } from '../../mcp-host-bindings.js';

test('the host injects canonical unconfigured identity without a cross-feature store import', () => {
  class ForeignUnconfigured extends Error {}
  const error = new ForeignUnconfigured('host-private details');
  const seen: unknown[] = [];
  const classify = (input: { error: unknown }) => { seen.push(input.error); return input.error instanceof ForeignUnconfigured; };
  assert.equal(classifyAgentPluginMcpError({ error }, { isUnconfigured: classify }), 'unconfigured');
  assert.deepEqual(seen, [error]);
  assert.equal(classifyAgentPluginMcpError({ error: new Error('lookalike') }, { isUnconfigured: classify }), 'other');
});
