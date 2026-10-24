import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';

const card = (target = 'cloudflare') => JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['cloudflare-workers', 'publish-host', 'Connect Cloudflare Workers', /Workers Scripts → Edit/, 'https://dash.cloudflare.com/profile/api-tokens'],
  ['cloudflare-pages', 'publish-host', 'Connect Cloudflare Pages', /Cloudflare Pages → Edit/, 'https://dash.cloudflare.com/profile/api-tokens'],
]) test(`cloudflare/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('domain-owned forms supply the connection fields', () => {
  for (const target of ['cloudflare-workers', 'cloudflare-pages']) assert.deepEqual(card(target).fields, undefined);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL('../plugin.json', import.meta.url), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "cloudflare-workers",
      "usedFor": [
        "Publishes your website on Cloudflare Workers",
        "Collects your site's form submissions",
        "Checks your domain and applies domain changes you approve"
      ]
    },
    {
      "providerId": "cloudflare-pages",
      "usedFor": [
        "Publishes your website on Cloudflare Pages",
        "Checks your domain and applies domain changes you approve"
      ]
    }
  ]);
});
