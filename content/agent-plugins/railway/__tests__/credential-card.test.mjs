import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { buildPluginCredentialForm, readPluginCredentialValues } from '../../../../apps/website/src/features/custom-credentials/plugin-credential-card.ts';

const raw = readFileSync(new URL('../plugin.json', import.meta.url), 'utf8');
const skill = readFileSync(new URL('../skills/railway/SKILL.md', import.meta.url), 'utf8');

test('Railway declares one owned API card with a fixed destination, accepted by the real parser', () => {
  const parsed = parsePluginCredentialCards({ raw });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(card => card.providerId), ['railway']);
  const card = parsed.descriptors[0];
  assert.equal(card.title, 'Connect Railway');
  assert.equal(card.label, 'Railway API');
  assert.equal(card.ownedApiLabel, card.label, 'the trusted loader requires ownership of the API row');
  assert.equal(card.saveKind, 'api');
  assert.equal(card.baseUrl, 'https://backboard.railway.com/graphql/v2');
  assert.doesNotMatch(card.intro, /being added/);
  assert.match(card.intro, /Untested/);
  const form = buildPluginCredentialForm({ card });
  assert.deepEqual(form.fields.map(field => [field.name, field.required, field.secret]), [['token', true, true]]);
  assert.deepEqual(readPluginCredentialValues({ card, values: { token: 'test-value', baseUrl: 'https://other.invalid' } }), {
    label: 'Railway API', category: 'hosting', baseUrl: 'https://backboard.railway.com/graphql/v2', username: undefined, token: 'test-value',
  });
});

test('Railway guidance opens its own card, deploys only through the tools and never offers an unasked replacement', () => {
  assert.ok(skill.includes('credential_save { kind: "plugin-provider", target: "railway" }'));
  assert.ok(skill.includes('Writing `railway.json` needs **no'));
  assert.ok(skill.includes('deployment_ops_deploy'));
  assert.doesNotMatch(skill, /being added|Config generation only/);
  assert.match(skill, /Never offer to replace a working (token|key) unless asked/);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL('../plugin.json', import.meta.url), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "railway",
      "usedFor": [
        "Looks up your Railway projects",
        "Deploys your server"
      ]
    }
  ]);
});
