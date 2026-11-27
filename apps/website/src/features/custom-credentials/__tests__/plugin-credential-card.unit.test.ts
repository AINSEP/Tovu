import assert from 'node:assert/strict';
import test from 'node:test';
import type { PluginCredentialCard } from '@jini-ai/core/contracts/credentials';
import { CredentialInputError } from '@jini-ai/platform/secrets/credential-token';
import { readPluginCredentialValues } from '../plugin-credential-card.js';
import { CustomCredentialValidationError } from '../store.js';

const card: PluginCredentialCard = {
  providerId: 'acme', label: 'Acme API', category: 'general', baseUrl: 'https://acme.example.test',
  title: 'Connect Acme', fields: [{ name: 'username', label: 'Account', required: true }],
};

test('a missing declared account uses the same validation error as the credential store', () => {
  assert.throws(() => readPluginCredentialValues({ card, values: { token: 'fixture-key' } }), (error: unknown) =>
    error instanceof CustomCredentialValidationError && error.message === 'username is required');
});

test('the card rejects a Tovu-shaped secret pasted in the public account field', () => {
  const value = 'tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET';
  assert.throws(() => readPluginCredentialValues({ card, values: { username: value, token: 'fixture-key' } }), (error: unknown) =>
    error instanceof CredentialInputError && error.field === 'username' && error.rule === 'plain' &&
    error.message === 'Put credentials in the secret field, not in this field.');
  assert.deepEqual(readPluginCredentialValues({ card, values: { username: 'acme-operator', token: 'fixture-key' } }), {
    label: 'Acme API', category: 'general', baseUrl: 'https://acme.example.test', username: 'acme-operator', token: 'fixture-key',
  });
});
