import assert from 'node:assert/strict';
import test from 'node:test';
import { readBuildRelease, readProductVersion, telemetryEnvironment } from '../build-release.js';

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

test('incident versions prefer the runtime manifest and fall back to the source package without adding a release suffix', () => {
  for (const [manifestVersion, packageVersion, expected] of [
    ['4.2.3-rc.1', '9.1.0', '4.2.3-rc.1'],
    ['operator@example.test', '9.1.0', '9.1.0'],
    [null, 'latest', undefined],
  ] as const) {
    const files: string[] = [];
    const result = readProductVersion({ productRoot: '/tovu-build' }, { read: (file, encoding) => {
      assert.equal(encoding, 'utf8');
      files.push(file);
      if (file === '/tovu-build/runtime-manifest.json') return JSON.stringify({ tovuVersion: manifestVersion, tovuSha: '0123456789' });
      if (file === '/tovu-build/package.json') return JSON.stringify({ version: packageVersion });
      assert.fail(`unexpected metadata path ${file}`);
    } });
    assert.equal(result, expected);
    assert.deepEqual(files, manifestVersion === '4.2.3-rc.1'
      ? ['/tovu-build/runtime-manifest.json']
      : ['/tovu-build/runtime-manifest.json', '/tovu-build/package.json']);
  }
});

test('telemetry uses the explicitly selected runtime mode instead of re-reading an inherited mode', () => {
  assert.equal(telemetryEnvironment({ env: { TOVU_RUNTIME_MODE: 'production', ELECTRON_RUN_AS_NODE: '1' }, runtimeMode: 'local' }), 'desktop');
  assert.equal(telemetryEnvironment({ env: {}, runtimeMode: 'production' }), 'production');
});

test('build metadata that parses to null or a bare value reads as empty: the release and version stay unknown', () => {
  for (const [manifest, pkg] of [['null', 'null'], ['"1.2.3"', '7']] as const) {
    const read = (file: string) => (file.endsWith('runtime-manifest.json') ? manifest : pkg);
    assert.equal(readBuildRelease({ productRoot: '/built' }, { read }), 'tovu@unknown-dev');
    assert.equal(readProductVersion({ productRoot: '/built' }, { read }), undefined);
  }
});
