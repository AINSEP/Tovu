import path from 'node:path';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseAgentPluginManifest } from '@jini-ai/agent-plugins/lifecycle';
import { parseAgentPluginMcpConfig } from '../../../../apps/website/src/features/agent-plugins/mcp-metadata.ts';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// Moved from content/agent-plugins/supabase (D-W): the plugin ships as @jini-ai/agent-plugins/supabase; this Tovu-bound test reads it from there.
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: 'supabase' });

test('OAuth and token fallback target the hosted service without inline secrets', async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  const config = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'mcp.json'), 'utf8'));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(parseAgentPluginMcpConfig({ value: config }, { pluginManifest: manifest }).ok, true);
  const server = config.mcpServers.supabase;
  assert.equal(server.type, 'streamable-http');
  assert.equal(new URL(server.url).origin, 'https://mcp.supabase.com');
  assert.equal(server.tovuAuthMode, 'oauth');
  assert.equal(server.tovuTokenAuth.helpUrl, 'https://supabase.com/dashboard/account/tokens');
  assert.equal(server.tovuTokenAuth.probeUrl, 'https://api.supabase.com/v1/projects');
  assert.equal(server.headers, undefined);
  assert.equal(server.env, undefined);
  const skill = await readFile(path.join(PLUGIN_ROOT, 'skills/supabase/SKILL.md'), 'utf8');
  assert.match(skill, /agent_plugin_connect/);
  assert.match(skill, /Never show a key or password/);
  const recovery = await readFile(path.join(PLUGIN_ROOT, 'skills/supabase/references/failure-modes.md'), 'utf8');
  assert.match(recovery, /credential_save/);
});
