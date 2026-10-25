import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPluginToolPointer } from '../../bundled-catalog.js';

test('explicit skill and supporting-file pointers name Tovu’s registered loader', () => {
  assert.equal(formatPluginToolPointer({ pluginId: 'synthetic', skill: 'other', file: 'references/permissions.md' }),
    'load_agent_plugin({"pluginId":"synthetic","skill":"other","file":"references/permissions.md"})');
  assert.equal(formatPluginToolPointer({ pluginId: 'synthetic', file: 'SKILL.md' }),
    'load_agent_plugin({"pluginId":"synthetic","file":"SKILL.md"})');
});
