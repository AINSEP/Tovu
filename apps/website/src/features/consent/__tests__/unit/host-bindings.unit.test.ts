/** @file Pins the host-owned `[consent]` console lines that `@jini-ai/cookie-consent/site/*` reports through
 * injected reporters: the package passes a plain message, the host adds the prefix and redaction. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { reportConsentFailure, reportConsentPluginFailure } from '../../host-bindings.js';

const secret = () => new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET');

test('service failures warn with the [consent] prefix and a redacted cause', (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  reportConsentFailure({ message: 'The page could not be rendered; readiness remains unavailable.', error: secret() });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.length, 2);
  assert.equal(warnings[0]?.[0], '[consent] The page could not be rendered; readiness remains unavailable.');
  assert.match(String(warnings[0]?.[1]), /boom/);
  assert.doesNotMatch(String(warnings[0]?.[1]), /SECRETSECRETSECRETSECRET/);
});

test('plugin contribution failures log an error with the [consent] prefix and a redacted cause', (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  reportConsentPluginFailure({ message: 'browser bridges could not be loaded', error: secret() });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.length, 2);
  assert.equal(errors[0]?.[0], '[consent] browser bridges could not be loaded');
  assert.match(String(errors[0]?.[1]), /boom/);
  assert.doesNotMatch(String(errors[0]?.[1]), /SECRETSECRETSECRETSECRET/);
});
