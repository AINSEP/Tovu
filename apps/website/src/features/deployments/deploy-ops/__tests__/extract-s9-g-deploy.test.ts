import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fingerprintSiteKeyHex, parseSiteKeyHex } from '../../../webhooks/index.js';
import { recordDeployOps, S9_SITE_KEY, S9_PLAIN } from './extract-s9-g-deploy.support.js';

test('G-deploy real-tool results, card bytes, history, and I/O counts equal the immutable pre-seam recording', async () => {
  const text = readFileSync(new URL('./fixtures/extract-s9/recordings.json', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'), 'b616c77f065734bdaa64a007eb507117f7ce65666eb8a98cd61afc520bbceb58');
  const actual = await recordDeployOps();
  assert.equal(JSON.stringify(actual, null, 2) + '\n', text);
  const site = parseSiteKeyHex(S9_SITE_KEY); assert.ok(site.ok);
  const created = actual.cases.create!.result as { fingerprint: string; fingerprintKind: string };
  assert.deepEqual({ fingerprint: created.fingerprint, fingerprintKind: created.fingerprintKind }, { fingerprint: fingerprintSiteKeyHex(site.hex), fingerprintKind: 'site-key' });
  const plain = actual.cases.plain!.result as { fingerprint: string; fingerprintKind: string };
  assert.deepEqual({ fingerprint: plain.fingerprint, fingerprintKind: plain.fingerprintKind }, { fingerprint: createHash('sha256').update(S9_PLAIN, 'utf8').digest('hex').slice(0, 12), fingerprintKind: 'sha256' });
});
