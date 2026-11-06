import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerPluginToolAccess } from '../../lower-tool-access.js';
import { notifyExternalMcpRosterChanged, onExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from '../../../../assistant/external-mcp-roster-change.js';

test('a provider OFF stops answers admitted to its assistant face as well as its own tools', async t => {
  resetExternalMcpRosterChangeListenersForTests(); t.after(resetExternalMcpRosterChangeListenersForTests);
  let seen: unknown; let reads = 0;
  onExternalMcpRosterChanged('serving', change => { seen = change; });
  await lowerPluginToolAccess({ pluginId: 'provider', notifyRosterChanged: notifyExternalMcpRosterChanged, providerFaces: { affectedPluginIds: async ({ pluginId }) => { reads++; assert.equal(pluginId, 'provider'); return ['provider', 'assistant-face']; } } }, {});
  assert.equal(reads, 1); assert.deepEqual(seen, { pluginIds: ['provider', 'assistant-face'] });
});
