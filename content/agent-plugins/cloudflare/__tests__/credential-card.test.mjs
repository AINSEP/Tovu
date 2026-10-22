import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
