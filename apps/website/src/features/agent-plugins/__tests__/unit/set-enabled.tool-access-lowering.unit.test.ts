import assert from 'node:assert/strict';
import test from 'node:test';
import { setAgentPluginEnabled } from '../../set-enabled.js';
import { onExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests, ToolAccessLoweringError } from '../../../../assistant/external-mcp-roster-change.js';
import type { AgentPluginLayout } from '../../layout.js';

const layout: AgentPluginLayout = { root: '/unused', workspacesDir: '/unused', forWorkspace: () => { throw new Error('injected lifecycle must own storage'); } };

test('plugin OFF commits first, then awaits the affected answer cleanup', async t => {
  resetExternalMcpRosterChangeListenersForTests(); t.after(resetExternalMcpRosterChangeListenersForTests);
  let saved = false; let release!: () => void; let change: unknown;
  const held = new Promise<void>(resolve => { release = resolve; });
  onExternalMcpRosterChanged('serving', async lowered => { assert.equal(saved, true); change = lowered; await held; });
  const input = { agentPluginLayout: layout, workspaceId: 'ws', pluginId: 'mail', enabled: false, actor: 'owner' };
  let completed = false;
  const work = setAgentPluginEnabled(input, { links: { links: async () => new Map() }, lifecycle: { setAgentPluginEnabled: async () => { saved = true; return { pluginId: 'mail', enabled: false }; } } }).then(result => { completed = true; return result; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(change, { pluginIds: ['mail'] }); assert.equal(completed, false);
  release(); assert.equal((await work).enabled, false);
});

test('plugin OFF reports cleanup failure after retaining the saved decision', async t => {
  resetExternalMcpRosterChangeListenersForTests(); t.after(resetExternalMcpRosterChangeListenersForTests);
  let enabled = true;
  onExternalMcpRosterChanged('serving', () => { throw new Error('private-path-sentinel'); });
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: 'ws', pluginId: 'mail', enabled: false, actor: 'owner' }, {
    links: { links: async () => new Map() }, lifecycle: { setAgentPluginEnabled: async () => { enabled = false; return { pluginId: 'mail', enabled }; } },
  }), error => error instanceof ToolAccessLoweringError && !error.message.includes('sentinel'));
  assert.equal(enabled, false);
});
