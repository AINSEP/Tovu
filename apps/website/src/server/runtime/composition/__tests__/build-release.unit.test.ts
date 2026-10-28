import assert from 'node:assert/strict';
import test from 'node:test';
import { readBuildRelease, telemetryEnvironment } from '../build-release.js';

test('release uses the running manifest version and short SHA, with bounded dev fallbacks', () => {
  const read = (file: string) => file.endsWith('runtime-manifest.json')
    ? JSON.stringify({ tovuVersion: '1.2.3', tovuSha: 'abcdef0123456789' }) : JSON.stringify({ version: '9.9.9' });
  assert.equal(readBuildRelease({ productRoot: '/built' }, { read }), 'tovu@1.2.3+abcdef0');
  const dev = (file: string) => { if (file.endsWith('runtime-manifest.json')) throw new Error('absent'); return '{"version":"0.1.0"}'; };
  assert.equal(readBuildRelease({ productRoot: '/source' }, { read: dev }), 'tovu@0.1.0-dev');
  for (const invalid of ['bad email@example.test', 'x'.repeat(200), '{']) {
    assert.equal(readBuildRelease({ productRoot: '/source' }, { read: () => invalid }), 'tovu@unknown-dev');
  }
  assert.equal(readBuildRelease({ productRoot: '/source' }, { read: () => '{"tovuVersion":"site@example.test","version":"site@example.test"}' }), 'tovu@unknown-dev');
});

test('telemetry environment retains the host bounded runtime selection', () => {
  assert.equal(telemetryEnvironment({ env: {} }), 'local');
  assert.equal(telemetryEnvironment({ env: { ELECTRON_RUN_AS_NODE: '1' } }), 'desktop');
  assert.equal(telemetryEnvironment({ env: { ELECTRON_RUN_AS_NODE: '1', TOVU_RUNTIME_MODE: 'production' } }), 'production');
  assert.equal(telemetryEnvironment({ env: { NODE_ENV: 'production', TOVU_RUNTIME_MODE: 'anything' } }), 'local');
});
