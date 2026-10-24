import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';

const card = (target = 's3-compatible') => JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
for (const [target, kind, title, permissions, helpUrl] of [
  ['s3-compatible', 'publish-host', 'Connect S3-compatible storage', /ListBucket.*GetObject.*PutObject.*DeleteObject/, undefined],
]) test(`s3-compatible/${target}: correct title, destination, key page and minimum access guidance`, () => {
  const value = card(target);
  assert.ok(value);
  assert.equal(value.saveKind, kind);
  assert.equal(value.title, title);
  assert.match(value.keyHint, permissions);
  assert.equal(value.helpUrl, helpUrl);
  assert.ok(value.intro);
});

test('non-secret connection fields are declared explicitly', () => {
  assert.deepEqual(card().fields.map(f => f.name), ['endpoint', 'region', 'bucket', 'accessKeyId', 'publicUrl', 'mediaBucket', 'mediaKeyPrefix']);
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(new URL('../plugin.json', import.meta.url), 'utf8') });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.map(({ providerId, usedFor }) => ({ providerId, usedFor })), [
    {
      "providerId": "s3-compatible",
      "usedFor": [
        "Publishes your website to your public storage bucket",
        "Stores and retrieves site media in your configured private bucket"
      ]
    }
  ]);
});
