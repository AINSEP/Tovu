import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDENTIAL_MESSAGES, CredentialInputError, assertCredentialFreeField, normalizeCredentialToken, credentialTokenHint } from '../credential-token.js';
import { ADMIN_LOCALES } from '../admin-locales.js';
import { CREDENTIAL_COPY, credentialText, formatCredentialHint } from '../credential-copy.js';

const rejected = (message: string) => (error: unknown) => error instanceof CredentialInputError && error.message === message;
for (const value of [undefined, '', ' \n\t ']) test(`blank token refused (${typeof value === 'string' ? value.length : 'missing'})`, () => {
  assert.throws(() => normalizeCredentialToken({ value }), rejected(CREDENTIAL_MESSAGES.blank));
});
test('normalization changes only the edges, and preserves the entire accepted alphabet', () => {
  const entered = ' \n+/=._-~ABCxyz09\n ';
  assert.equal(normalizeCredentialToken({ value: entered }) === '+/=._-~ABCxyz09', true);
  assert.equal(normalizeCredentialToken({ value: '  abc def  ', hosted: false }) === 'abc def', true);
  assert.equal(normalizeCredentialToken({ value: '  café_東京  ', hosted: false }) === 'café_東京', true);
  assert.throws(() => normalizeCredentialToken({ value: 'abc def' }), rejected(CREDENTIAL_MESSAGES.ascii));
  assert.throws(() => normalizeCredentialToken({ value: 'café_東京' }), rejected(CREDENTIAL_MESSAGES.ascii));
});
test('8192 stored characters accepted, 8193 rejected with the exact limit', () => {
  assert.equal(normalizeCredentialToken({ value: 'x'.repeat(8192) }).length, 8192);
  assert.throws(() => normalizeCredentialToken({ value: 'x'.repeat(8193) }), rejected(CREDENTIAL_MESSAGES.limit));
});
for (const value of [
  'https://example.test/mcp?api_key=canary-value',
  'https://example.test/mcp?token=canary-value',
  'https://user:canary-value@example.test/mcp',
  '--api-key canary-value', '--token=canary-value',
  // Assemble the reviewed fixture at runtime so tracked source carries no complete PAT shape.
  'ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
]) test(`plaintext metadata refused (${['url', 'arg', 'label'][value.startsWith('https') ? 0 : value.startsWith('--') ? 1 : 2]})`, () => {
  assert.throws(() => assertCredentialFreeField({ value, field: 'metadata' }), rejected(CREDENTIAL_MESSAGES.plain));
});
test('ordinary labels, URLs and arguments remain usable', () => {
  for (const value of ['Customer API', 'https://example.test/mcp?project=alpha', '--project alpha']) assertCredentialFreeField({ value, field: 'metadata' });
});
test('server-derived hints hide every character of a short token', () => {
  assert.deepEqual(credentialTokenHint({ token: 'short' }), { length: 5, last4: null });
  assert.equal(formatCredentialHint({ hint: credentialTokenHint({ token: 'short' }), locale: 'en' }), '5 chars');
  assert.equal(formatCredentialHint({ hint: { length: 1184, last4: 'a9F2' }, locale: 'en' }), '…a9F2, 1,184 chars');
});
test('new credential copy is translated for every supported admin locale', () => {
  assert.deepEqual(Object.keys(CREDENTIAL_COPY).sort(), ADMIN_LOCALES.map(({ code }) => code).filter(code => code !== 'en').sort());
  for (const [locale, copy] of Object.entries(CREDENTIAL_COPY)) {
    for (const id of Object.keys(CREDENTIAL_MESSAGES) as Array<keyof typeof CREDENTIAL_MESSAGES>) {
      assert.equal(credentialText({ id, locale }), copy[id]);
      assert.notEqual(copy[id], CREDENTIAL_MESSAGES[id]);
    }
  }
  assert.equal(credentialText({ id: 'auth', locale: 'en' }), 'The server rejected this token.');
  assert.equal(credentialText({ id: 'auth', locale: 'fr' }), 'Le serveur a refusé ce jeton.');
});
