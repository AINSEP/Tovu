import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from '@jini-ai/agent-plugins/lifecycle';

test('browser sign-in and operator read trust are declared without a token', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'));
  const config = JSON.parse(await readFile(new URL('../mcp.json', import.meta.url), 'utf8'));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(parseAgentPluginMcpConfig({ value: config }).ok, true);
  assert.deepEqual(config.mcpServers.higgsfield, { type: 'streamable-http', url: 'https://mcp.higgsfield.ai/mcp' });
  const metadata = manifest.extensions.tovu.mcpServers.higgsfield;
  assert.equal(metadata.tovuAuthMode, 'oauth');
  assert.deepEqual(metadata.tovuDefaultTools.read, ['models_explore', 'job_status']);
  assert.equal(metadata.tovuDefaultTools.allow, undefined, 'the package must not pre-grant generation');
  const skill = await readFile(new URL('../skills/higgsfield-media/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /agent_plugin_connect/);
  assert.match(skill, /media_import_from_url/);
  assert.match(skill, /Never store credentials/);
});
