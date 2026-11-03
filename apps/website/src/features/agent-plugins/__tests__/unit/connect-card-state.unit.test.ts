import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentPluginConnectCard, type AgentPluginConnectCardSpec } from '../../connect-card-ui.js';

test('completed and skipped sign-in cards need no sign-in URL or credential fields', () => {
  const connected: Extract<AgentPluginConnectCardSpec, { state: 'connected' }> = {
    pluginId: 'example', pluginDisplayName: 'Example', state: 'connected',
  };
  const skipped: Extract<AgentPluginConnectCardSpec, { state: 'skipped' }> = {
    pluginId: 'example', pluginDisplayName: 'Example', state: 'skipped',
  };
  const success = buildAgentPluginConnectCard(connected).resource.text;
  const dismissed = buildAgentPluginConnectCard(skipped).resource.text;
  assert.equal(typeof success, 'string');
  assert.equal(typeof dismissed, 'string');
  assert.match(String(success), /Example connected/);
  assert.match(String(dismissed), /Sign-in skipped/);
  assert.doesNotMatch(String(success), /data-mcpui-action="open-link"/);
  assert.doesNotMatch(String(dismissed), /data-mcpui-action="open-link"/);
});
