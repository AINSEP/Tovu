import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTovuObservabilityExport } from '../observability-export.js';

test('Tovu host facts deny checkouts before production labels and admit only packaged or deployed runtimes', () => {
  const cases: { name: string; env: NodeJS.ProcessEnv; checkout: boolean; packagedDesktop?: boolean; expected: boolean }[] = [
    { name: 'web checkout', env: {}, checkout: true, expected: false },
    { name: 'fake-test-site / NODE_ENV production', env: { NODE_ENV: 'production', TOVU_RUNTIME_MODE: 'production', FLY_APP_NAME: 'fixture' }, checkout: true, expected: false },
    { name: 'inherited packaging hint in checkout', env: { TOVU_PACKAGED_DESKTOP: '1' }, checkout: true, expected: false },
    { name: 'unpackaged desktop with config', env: { TOVU_PRODUCT_TELEMETRY_CONFIG: '/fake/config.json', TOVU_PACKAGED_DESKTOP: '1' }, checkout: false, packagedDesktop: false, expected: false },
    { name: 'main ignores inherited unpackaged fact', env: { TOVU_PACKAGED_DESKTOP: '0' }, checkout: false, packagedDesktop: true, expected: true },
    { name: 'packaged desktop', env: {}, checkout: false, packagedDesktop: true, expected: true },
    { name: 'supervised packaged child', env: { TOVU_PACKAGED_DESKTOP: '1', ELECTRON_RUN_AS_NODE: '1' }, checkout: false, expected: true },
    { name: 'unpackaged child with production hints', env: { TOVU_PACKAGED_DESKTOP: '0', TOVU_RUNTIME_MODE: 'production', FLY_APP_NAME: 'fixture' }, checkout: false, expected: false },
    { name: 'Fly production', env: { TOVU_RUNTIME_MODE: 'production', FLY_APP_NAME: 'fixture' }, checkout: false, expected: true },
    { name: 'self-hosted production', env: { TOVU_RUNTIME_MODE: 'production' }, checkout: false, expected: true },
    { name: 'hosted without canonical production', env: { NODE_ENV: 'production', FLY_APP_NAME: 'fixture' }, checkout: false, expected: false },
    { name: 'missing facts', env: {}, checkout: false, expected: false },
    { name: 'debug override', env: { TOVU_TELEMETRY_FORCE_ENABLE: '1' }, checkout: true, expected: true },
    { name: 'override requires exact 1', env: { TOVU_TELEMETRY_FORCE_ENABLE: 'true' }, checkout: true, expected: false },
  ];
  for (const { name, env, checkout, packagedDesktop, expected } of cases) {
    assert.equal(resolveTovuObservabilityExport({ env, packagedDesktop }, { checkout }), expected, name);
  }
});

test('dev and test launch signals beat packaged and deployed hints', () => {
  for (const signal of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { npm_lifecycle_event: 'dev:server' },
    { npm_lifecycle_event: 'desktop' }, { npm_lifecycle_event: 'test:ci' }, { npm_lifecycle_event: 'e2e:journeys' }, { TOVU_DEV_SUPERVISOR_PID: '123' }, { VITEST: 'true' }, { NODE_TEST_CONTEXT: 'child-v8' }]) {
    const env = { ...signal, TOVU_PACKAGED_DESKTOP: '1', TOVU_RUNTIME_MODE: 'production', FLY_APP_NAME: 'fixture' };
    assert.equal(resolveTovuObservabilityExport({ env }, { checkout: false }), false, JSON.stringify(signal));
    assert.equal(resolveTovuObservabilityExport({ env: { ...env, TOVU_TELEMETRY_FORCE_ENABLE: '1' } }, { checkout: false }), true);
  }
});

test('the actual checkout cannot export by relabelling its build as Fly production', () => {
  assert.equal(resolveTovuObservabilityExport({ env: { TOVU_RUNTIME_MODE: 'production', NODE_ENV: 'production', FLY_APP_NAME: 'fixture' } }), false);
});

test('denied export preserves console output, the local buffer and file persistence', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createLogBuffer, installConsoleTee, createRotatingLogFileSink, readLogFileTail } = await import('../../../../platform/server-logs/index.js');
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-local-observability-'));
  const filePath = path.join(root, 'server.log');
  const lines: unknown[][] = [];
  const target = { log() {}, info() {}, debug() {}, warn() {}, error: (...args: unknown[]) => { lines.push(args); } };
  const buffer = createLogBuffer({ redact: text => text });
  const file = createRotatingLogFileSink({ filePath });
  const unsubscribe = buffer.subscribe(entry => file.write(entry));
  const uninstall = installConsoleTee({ buffer }, { target });
  try {
    assert.equal(resolveTovuObservabilityExport({ env: {} }), false);
    target.error('local diagnostic stays available');
    assert.deepEqual(lines, [['local diagnostic stays available']]);
    assert.equal(buffer.entries()[0]!.message, 'local diagnostic stays available');
    assert.equal(readLogFileTail({ filePath })![0]!.message, 'local diagnostic stays available');
    assert.equal(file.isHealthy(), true);
  } finally { uninstall(); unsubscribe(); await rm(root, { recursive: true, force: true }); }
});
