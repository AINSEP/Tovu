import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { buildPluginCredentialForm } from "../../../../apps/website/src/contracts/core/plugin-credential-card.js";
import { readPluginCredentialValues } from "../../../../apps/website/src/features/custom-credentials/plugin-credential-card.js";
import path from 'node:path';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// render ships from @jini-ai/agent-plugins/render: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: 'render' });

const raw = readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8');
const skill = readFileSync(path.join(PLUGIN_DIR, 'skills/render/SKILL.md'), 'utf8');

test('Render declares one owned API card with a fixed destination, accepted by the real parser', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(card => card.providerId), ['render']);
  const card = parsed.descriptors[0];
  assert.equal(card.title, 'Connect Render');
  assert.equal(card.label, 'Render API');
  assert.equal(card.ownedApiLabel, card.label, 'the trusted loader requires ownership of the API row');
  assert.equal(card.saveKind, 'api');
  assert.equal(card.baseUrl, 'https://api.render.com/v1');
  assert.doesNotMatch(card.intro, /being added/);
  assert.match(card.intro, /Untested/);
  const form = buildPluginCredentialForm({ card });
  assert.deepEqual(form.fields.map(field => [field.name, field.required, field.secret]), [['token', true, true]]);
  assert.deepEqual(readPluginCredentialValues({ card, values: { token: 'test-value', baseUrl: 'https://other.invalid' } }), {
    label: 'Render API', category: 'hosting', baseUrl: 'https://api.render.com/v1', username: undefined, token: 'test-value',
  });
});

test('Render guidance opens its own card, deploys only through the tools and never offers an unasked replacement', () => {
  assert.ok(skill.includes('open the secure connection card; it saves as `Render API`.'));
  assert.ok(skill.includes('Writing `render.yaml` needs **no'));
  assert.match(skill, /assistant uses tools[\s\S]*Then use `start a deployment`/);
  assert.doesNotMatch(skill, /being added|Config generation only/);
  assert.match(skill, /Never offer to replace a working (token|key) unless asked/);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "render",
      "usedFor": [
        "Looks up your Render services",
        "Deploys your server"
      ]
    }
  ]);
});
