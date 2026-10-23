import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseAgentPluginManifest } from '@jini-ai/agent-plugins/lifecycle';
import { parseAgentPluginMcpConfig } from '../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts';

test('the hosted connection supports browser sign-in without inline credentials', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'));
  const config = JSON.parse(await readFile(new URL('../mcp.json', import.meta.url), 'utf8'));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(parseAgentPluginMcpConfig({ value: config }, { pluginManifest: manifest }).ok, true);
  assert.deepEqual(config.mcpServers.composio, {
    type: 'streamable-http', url: 'https://connect.composio.dev/mcp', tovuAuthMode: 'oauth',
  });
  const skill = await readFile(new URL('../skills/composio/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /agent_plugin_connect/);
  assert.match(skill, /Do not grant.*COMPOSIO_REMOTE_WORKBENCH/s);
  assert.match(skill, /COMPOSIO_REMOTE_BASH_TOOL/);
  assert.match(skill, /Never ask the user for a Composio API key/);
});
