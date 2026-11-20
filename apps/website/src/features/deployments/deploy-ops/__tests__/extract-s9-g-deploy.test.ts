import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fingerprintSiteKeyHex, parseSiteKeyHex } from '../../../webhooks/index.js';
import { recordDeployOps, S9_SITE_KEY, S9_PLAIN } from './extract-s9-g-deploy.support.js';

test('G-deploy real-tool results, card bytes, history, and I/O counts equal the immutable pre-seam recording', async () => {
  const text = readFileSync(new URL('./fixtures/extract-s9/recordings.json', import.meta.url), 'utf8');
  // Re-pinned once (combine-6): the only change is Jini's history-failure log line gaining the error
  // class label (log-safety); results, card bytes, history and I/O counts are byte-identical.
  assert.equal(createHash('sha256').update(text).digest('hex'), 'b1b973eadf6e3591bcfb699e2a035161d2dbc9901e5d78d9a74589e2da3042ae');
  const actual = await recordDeployOps();
  assert.equal(JSON.stringify(actual, null, 2) + '\n', text);
  const site = parseSiteKeyHex({ raw: S9_SITE_KEY }); assert.ok(site.ok);
  const created = actual.cases.create!.result as { fingerprint: string; fingerprintKind: string };
  assert.deepEqual({ fingerprint: created.fingerprint, fingerprintKind: created.fingerprintKind }, { fingerprint: fingerprintSiteKeyHex({ hex: site.hex }), fingerprintKind: 'site-key' });
  const plain = actual.cases.plain!.result as { fingerprint: string; fingerprintKind: string };
  assert.deepEqual({ fingerprint: plain.fingerprint, fingerprintKind: plain.fingerprintKind }, { fingerprint: createHash('sha256').update(S9_PLAIN, 'utf8').digest('hex').slice(0, 12), fingerprintKind: 'sha256' });
});
