import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = (target = 'supabase') => JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['supabase', 'agent-plugin-token', 'Connect Supabase with an access token', /Management API.*Project Settings.*Database.*Migrations/, 'https://supabase.com/dashboard/account/tokens'],
]) test(`supabase/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('browser sign-in uses the OAuth save destination', () => {
  assert.equal(card('supabase-sign-in').saveKind, 'oauth');
});
