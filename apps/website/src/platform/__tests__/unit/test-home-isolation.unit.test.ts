import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertTestHomeIsolation } from '../../test-home-isolation.js';

/**
 * @file The guard that keeps node:test processes away from the owner's real Tovu storage. It runs
 * before any site or site-key I/O; it never touches the filesystem, so these cases only name paths.
 */

const REFUSAL = { message: /^Test home isolation required: refusing the real user home for Tovu sites or site keys\./ };
const realHome = path.resolve(os.userInfo().homedir);
const isolatedHome = path.join(os.tmpdir(), 'tovu-isolated-home-fixture');

test('inside a node:test process the real home itself is refused, as the home or as a listed path', () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'the runner marks its test processes');
  assert.throws(() => assertTestHomeIsolation({ homeDir: realHome }), REFUSAL);
  assert.throws(() => assertTestHomeIsolation({ homeDir: `${realHome}${path.sep}` }), REFUSAL, 'a trailing separator is the same home');
  assert.throws(() => assertTestHomeIsolation({ homeDir: isolatedHome }, { paths: [realHome] }), REFUSAL);
});

test('an isolated home is still refused when a listed path is inside one of the owner storage roots', () => {
  for (const target of ['.tovu', '.tovu/site-keys/site-1.hex', 'Documents/Tovu/sites', 'Tovu', 'Tovu Sites/blog',
    'Library/Application Support/Tovu', 'AppData/Roaming/Tovu/x', '.local/share/Tovu', '.config/Tovu/settings.json']) {
    assert.throws(() => assertTestHomeIsolation({ homeDir: isolatedHome }, { paths: [path.join(realHome, target)] }), REFUSAL, target);
  }
  assert.throws(() => assertTestHomeIsolation({ homeDir: path.join(realHome, '.tovu') }), REFUSAL, 'a home inside a storage root is refused');
});

test('paths outside the storage roots pass, including a checkout under the real home and look-alike names', () => {
  assert.equal(assertTestHomeIsolation({ homeDir: isolatedHome }), undefined);
  assert.equal(assertTestHomeIsolation({ homeDir: isolatedHome }, { paths: [
    path.join(isolatedHome, '.tovu', 'site-keys'),
    path.join(realHome, 'Programming', 'Tovu-checkout'),
    path.join(realHome, '.tovu-other'),
    path.join(realHome, 'Tovu Sites Archive'),
  ] }), undefined);
});

test('outside a node:test process the guard does nothing, even for the real home', (t) => {
  const previous = process.env.NODE_TEST_CONTEXT;
  t.after(() => { if (previous === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = previous; });
  delete process.env.NODE_TEST_CONTEXT;
  assert.equal(assertTestHomeIsolation({ homeDir: realHome }, { paths: [path.join(realHome, '.tovu')] }), undefined);
});
