import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const lifecycle = await import('@jini-ai/agent-plugins/lifecycle');
let calls = 0;
mock.module('@jini-ai/agent-plugins/lifecycle', { namedExports: { ...lifecycle, createAutomaticAgentPluginUse: () => ({
  prepare: async () => { if (calls++ === 0) return ''; throw Object.assign(new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET'), { code: 'EIO' }); },
}) } });
const { createAutomaticPluginRuns } = await import('../../automatic-agent-plugins.js');

test('tool guidance failure leaves the run usable and logs a redacted cause', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => undefined);
  const deps = { workspaceId: 'ws', siteTitleReady: Promise.resolve(), preferences: { mode: async () => 'auto' } };
  const runs = createAutomaticPluginRuns({ deps, surfaces: {}, askAgentPluginChoice: async () => { throw new Error('unexpected prompt'); } } as unknown as Parameters<typeof createAutomaticPluginRuns>[0]);
  const signal = new AbortController().signal;
  const context = { principal: { id: 'owner' }, conversationId: 'chat', state: { decision: null, excluded: [] }, query: 'question', pinned: [], signal,
    emitSurface: async () => {}, publish: async () => {} };
  await runs.start({ runId: 'run', context });
  const prepare = runs.prepareGuidance;
  const result = await prepare({ run: { id: 'run' }, tool: {}, signal } as unknown as Parameters<typeof prepare>[0]);
  assert.equal(result, '');
  assert.equal(warnings.mock.calls[0]?.arguments[0], '[agent-plugins] automatic tool guidance unavailable');
  assert.match(String(warnings.mock.calls[0]?.arguments[1]), /Error.*EIO/);
  assert.doesNotMatch(String(warnings.mock.calls[0]?.arguments[1]), /boom|SECRETSECRETSECRETSECRET/);
  runs.forget({ runId: 'run' });
});
