import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { packAgentPluginDirectory } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';

const root = path.resolve(import.meta.dirname, '..');
const raw = readFileSync(path.join(root, 'plugin.json'), 'utf8');

test('sentry: one provider-settings card that saves the observability-sentry provider plugin through the host', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true, parsed.reason);
  const [card, ...rest] = parsed.descriptors;
  assert.equal(rest.length, 0);
  assert.equal(card.providerId, 'sentry');
  assert.equal(card.saveKind, 'provider-settings');
  assert.equal(card.saveTarget, 'observability-sentry');
  assert.equal(card.title, 'Connect Sentry');
  assert.match(card.helpUrl, /^https:\/\//);
  assert.equal(card.baseUrl, '', 'the provider plugin owns every destination');
  assert.equal(card.fields, undefined, 'the provider plugin declares the fields');
  assert.equal(JSON.parse(raw).extensions.tovu.displayName, 'Sentry');
});

test('sentry: the skill opens that card, checks provider_status first, and never takes a key in chat', () => {
  const skill = readFileSync(path.join(root, 'skills/sentry/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: sentry\ndescription: .+\n---\n/);
  assert.ok(skill.includes('credential_save {kind:"plugin-provider", target:"sentry"}'));
  assert.ok(skill.includes('provider_status {pluginId:"observability-sentry"}'));
  assert.match(skill, /Never ask for (a|the) .+ in chat/);
});

test('sentry: packs as a bundled plugin with no MCP servers and no code', async () => {
  const packed = await packAgentPluginDirectory(root);
  assert.ok(packed.files.includes('skills/sentry/SKILL.md'));
  assert.ok(packed.files.every(file => !/\.(m?js|ts)$/.test(file) || file.startsWith('__tests__/')), 'guidance only');
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'mcp.json'), 'utf8')).mcpServers, {});
});
