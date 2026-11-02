import path from 'node:path';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseAgentPluginManifest } from '@jini-ai/agent-plugins/lifecycle';
import { parseAgentPluginMcpConfig } from '../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/higgsfield-media (D-W): the plugin ships as @jini-ai/agent-plugins/higgsfield-media; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'higgsfield-media' });

test('browser sign-in and operator read trust are declared without a token', async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  const config = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'mcp.json'), 'utf8'));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(parseAgentPluginMcpConfig({ value: config }, { pluginManifest: manifest }).ok, true);
  assert.deepEqual(config.mcpServers.higgsfield, { type: 'streamable-http', url: 'https://mcp.higgsfield.ai/mcp' });
  const metadata = manifest.extensions.tovu.mcpServers.higgsfield;
  assert.equal(metadata.tovuAuthMode, 'oauth');
  assert.deepEqual(metadata.tovuDefaultTools.read, ['models_explore', 'job_status']);
  assert.equal(metadata.tovuDefaultTools.allow, undefined, 'the package must not pre-grant generation');
  const skill = await readFile(path.join(PLUGIN_ROOT, 'skills/higgsfield-media/SKILL.md'), 'utf8');
  assert.match(skill, /agent_plugin_connect/);
  assert.match(skill, /media_import_from_url/);
  assert.match(skill, /Never store credentials/);
});
