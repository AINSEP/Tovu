import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { nativeToolMetadata } from '../../../../apps/website/src/contracts/core/tool-metadata/index.ts';

/**
 * @file Tovu's overlay for the portable `google-workspace` plugin (now
 * `@jini-ai/plugin-google-workspace`). The plugin's skill names jobs; this overlay names Tovu's
 * tools, screens and OAuth callback route for them. The skill pins that lived in the plugin's
 * `credential-card.test.mjs` (connect call, own-client card call, no `custom_credential_create`)
 * run here now, plus a drift guard: a renamed native tool would leave the guidance telling every
 * agent to call something that does not exist, and nothing else would notice (this is markdown).
 */
const overlayRoot = path.resolve(import.meta.dirname, '..');
const guidance = () => readFile(path.join(overlayRoot, 'GUIDANCE.md'), 'utf8');

/** Snake_case identifiers (including `p_<plugin>__<tool>` ids) opening a backtick span, alone or as a
 *  `tool_name {` call. */
function citedToolIds(markdown) {
  const toolId = String.raw`[a-z][a-z0-9]*(?:_{1,2}[a-z0-9]+)+`;
  return new Set([...markdown.matchAll(new RegExp(String.raw`\`(${toolId})(?=\`| \{)`, 'g'))].map(match => match[1]));
}

test('every native tool the overlay cites exists; plugin tools carry the google-workspace prefix', async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const ids = citedToolIds(await guidance());
  const unknown = [...ids].filter(id => !declared.has(id) && !/^p_google_workspace__[a-z0-9_]+$/.test(id));
  for (const tool of ['agent_plugin_connect', 'credential_save', 'plugins_set_enabled']) assert.ok(ids.has(tool), tool);
  assert.deepEqual(unknown, [], 'the overlay tells agents to call tools that do not exist');
});

test('the overlay keeps the connect and own-client calls the skill used to name', async () => {
  const text = await guidance();
  assert.ok(text.includes('agent_plugin_connect { pluginId: "google-workspace" }'));
  assert.ok(text.includes('credential_save { kind: "plugin-provider", target: "google-workspace-oauth-client" }'));
  assert.ok(text.includes('`p_google_workspace__account_info { connectionRef }`'));
  assert.doesNotMatch(text, /custom_credential_create/);
});

test('the overlay carries the Tovu-only screens and the OAuth callback route', async () => {
  const text = await guidance();
  assert.match(text, /\*\*Agent Plugins → Google Workspace\*\*/);
  assert.match(text, /`<this site's address>\/api\/agent-plugins\/connections\/oauth\/callback`/);
  assert.match(text, /\*\*Admin → Access Tokens → Add custom provider\*\*/);
  assert.match(text, /"this site" and "the host" mean Tovu/);
});
