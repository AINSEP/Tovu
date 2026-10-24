import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';

const card = (target = 'github') => JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['github', 'api', 'Connect GitHub', /Contents.*Workflows.*Actions/, 'https://github.com/settings/personal-access-tokens/new'],
  ['github-source-control', 'source-control', 'Connect GitHub for source control', /Contents.*Read and write/, 'https://github.com/settings/personal-access-tokens/new'],
]) test(`github/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('source control uses the GitHub save destination', () => {
  assert.equal(card('github-source-control').saveTarget, 'github');
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL('../plugin.json', import.meta.url), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "github",
      "usedFor": [
        "Reads and updates repository files",
        "Starts workflows and checks their results and logs",
        "Backs up your site to a private repository"
      ]
    },
    {
      "providerId": "github-source-control",
      "usedFor": [
        "Commits your site's exported website files to a repository"
      ]
    }
  ]);
});
