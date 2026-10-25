import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } from '../../../../apps/website/src/features/agent-plugins/bundled-catalog.ts';
import { bundledContributionSources } from '../../../../apps/website/src/features/agent-plugins/bundled-contribution-sources.ts';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));
const data = JSON.parse(readFileSync(new URL('../tovu-login-providers.json', import.meta.url), 'utf8'));

test('the bundled Google preset pins the identity protocol without API permissions or offline access', () => {
  assert.deepEqual(data, { schemaVersion: 1, providers: [{
    id: 'google', label: 'Google', issuer: 'https://accounts.google.com',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    scopes: ['openid', 'email', 'profile'], signingAlgorithm: 'RS256',
    clientAuthentication: 'client_secret_post', pkce: 'S256',
    credentialLabel: 'google-login/google OAuth client', credentialCardTarget: 'google-login-oauth-client',
    authoritativeEmailDomains: ['gmail.com', 'googlemail.com'], hostedDomainClaim: 'hd',
  }] });
  assert.deepEqual(JSON.parse(readFileSync(new URL('../mcp.json', import.meta.url), 'utf8')).mcpServers, {});
});

test('Google Login is discoverable as a bundled opt-in member provider and marked soon', () => {
  assert.equal(manifest.name, 'google-login');
  assert.equal(manifest.extensions.tovu.id, 'tovu/google-login');
  assert.equal(manifest.extensions.tovu.maturity, 'soon');
  assert.deepEqual(manifest.extensions.tovu.provides, ['member-login:google']);
  assert.deepEqual(manifest.keywords, ['google-login', 'sign-in-with-google', 'member-login', 'oidc']);
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has('google-login'), false);
  const sources = bundledContributionSources({
    sourceRoot: fileURLToPath(new URL('../../', import.meta.url)), filename: 'tovu-login-providers.json',
  });
  assert.ok(sources.some(source => source.pluginId === 'google-login'));
});
