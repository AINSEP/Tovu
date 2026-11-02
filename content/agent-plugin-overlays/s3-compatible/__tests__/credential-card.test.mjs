import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import path from 'node:path';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';

// s3-compatible ships from @jini-ai/agent-plugins/s3-compatible: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: 's3-compatible' });

const card = (target = 's3-compatible') => JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8')).extensions.tovu.credentialCards.find(c => c.target === target);
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
  // Publish-host cards use their deploy target's form; the card does not own those inputs.
  const target = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'tovu-deploy-targets.json'), 'utf8')).targets.find(entry => entry.id === 's3-compatible');
  assert.equal(card().fields, undefined);
  assert.deepEqual(target.credential.fields.filter(f => !f.secret).map(f => f.name), ['endpoint', 'region', 'bucket', 'accessKeyId', 'publicUrl', 'mediaBucket', 'mediaKeyPrefix']);
  assert.equal(target.credential.tokenField, 'secretAccessKey');
});

test('every credential card parses its task purposes', () => {
  const parsed = parsePluginCredentialCards({ raw: readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8') });
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
