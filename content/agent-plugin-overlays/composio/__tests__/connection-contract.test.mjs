import path from 'node:path';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseAgentPluginManifest } from '@jini-ai/agent-plugins/lifecycle';
import { parseAgentPluginMcpConfig } from '../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/composio (D-W): the plugin ships as @jini-ai/agent-plugins/composio; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'composio' });

test('the hosted connection supports browser sign-in without inline credentials', async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  const config = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'mcp.json'), 'utf8'));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(parseAgentPluginMcpConfig({ value: config }, { pluginManifest: manifest }).ok, true);
  assert.deepEqual(config.mcpServers.composio, {
    type: 'streamable-http', url: 'https://connect.composio.dev/mcp', authMode: 'oauth',
  });
  const skill = await readFile(path.join(PLUGIN_ROOT, 'skills/composio/SKILL.md'), 'utf8');
  assert.match(skill, /\*\*Sign in\.\*\* Connect the account\. It provisions the declared\s+connection, shows the secure browser sign-in card/);
  assert.match(skill, /Do not grant.*COMPOSIO_REMOTE_WORKBENCH/s);
  assert.match(skill, /COMPOSIO_REMOTE_BASH_TOOL/);
  assert.match(skill, /Never ask the user for a Composio API key/);
});
