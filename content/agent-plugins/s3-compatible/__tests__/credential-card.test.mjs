import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
