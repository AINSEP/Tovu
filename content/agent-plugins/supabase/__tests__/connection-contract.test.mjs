import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from '@jini-ai/agent-plugins/lifecycle';

test('OAuth and token fallback target the hosted service without inline secrets', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'));
  const config = JSON.parse(await readFile(new URL('../mcp.json', import.meta.url), 'utf8'));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(parseAgentPluginMcpConfig({ value: config }).ok, true);
  const server = config.mcpServers.supabase;
  assert.equal(server.type, 'streamable-http');
  assert.equal(new URL(server.url).origin, 'https://mcp.supabase.com');
  assert.equal(server.tovuAuthMode, 'oauth');
  assert.equal(server.tovuTokenAuth.helpUrl, 'https://supabase.com/dashboard/account/tokens');
  assert.equal(server.tovuTokenAuth.probeUrl, 'https://api.supabase.com/v1/projects');
  assert.equal(server.headers, undefined);
  assert.equal(server.env, undefined);
  const skill = await readFile(new URL('../skills/supabase/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /agent_plugin_connect/);
  assert.match(skill, /Never show a key or password/);
  const recovery = await readFile(new URL('../skills/supabase/references/failure-modes.md', import.meta.url), 'utf8');
  assert.match(recovery, /credential_save/);
});
