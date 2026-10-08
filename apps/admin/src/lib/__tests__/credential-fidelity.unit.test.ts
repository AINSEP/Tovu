import { describe, expect, it } from 'vitest';
import { ADMIN_LOCALES } from '../../../../website/src/contracts/core/admin-locales';
import { CREDENTIAL_COPY } from '../../../../website/src/contracts/core/credential-copy';
import { credentialDraftError, credentialText, formatCredentialHint, storedCredentialHint } from '../credential-copy';
import { buildSourceControlConnectionInput } from '../../features/source-control/rules';
import { buildCredentialConnectionInput } from '../../features/deployment/rules';
import { describeStoredCredentials, toAccessTokenWriteBody } from '../../features/settings/hooks/use-external-mcp.hooks';
import type { AdminExternalMcpServer } from '../api';

describe('credential byte preservation and safe admin hints', () => {
  it('uses server hints for both BYOK placeholders and separates a literal dot from the ellipsis', () => {
    const stored = { isSet: true, masked: '••••a9F2', tokenHint: { length: 18, last4: 'a9F2' } };
    expect(storedCredentialHint({ stored })).toBe('…a9F2, 18 chars');
    expect(storedCredentialHint({ stored }, { locale: 'fr' })).toBe('…a9F2, 18 caractères');
    expect(storedCredentialHint({ stored, storedKeyIsForOtherEndpoint: true })).toBeUndefined();
    expect(storedCredentialHint({ stored: { ...stored, masked: null, tokenHint: { length: 4, last4: null } } })).toBe('4 chars');
    expect(formatCredentialHint({ hint: { length: 21, last4: '.com' } })).toBe('…\u202f.com, 21 chars');
  });
  it('sends the original entered token to the store; blank and whitespace stay distinct', () => {
    for (const token of [' \nabc+/=._-~\n ', '', '   ']) {
      expect(buildSourceControlConnectionInput({ providerId: 'github', token, values: {} }, []).token === token).toBe(true);
      const published = buildCredentialConnectionInput('fixture-host', { tokenField: 'apiKey', fields: [{ name: 'apiKey', label: 'Key', required: true, secret: true }] }, { apiKey: token });
      expect(token === '' ? !('apiKey' in published) : published.apiKey === token).toBe(true);
      expect(toAccessTokenWriteBody({ authMode: 'static_env', accessToken: token })).toEqual(token === '' ? {} : { accessToken: token });
    }
  });
  it('gives a clear draft error while keeping exact blank updates valid', () => {
    expect(credentialDraftError({ value: '' })).toBe(null);
    expect(credentialDraftError({ value: '' }, { required: true })).toBe('Enter a token. Spaces alone are not a token.');
    expect(credentialDraftError({ value: '   ' })).toBe('Enter a token. Spaces alone are not a token.');
    expect(credentialDraftError({ value: 'x'.repeat(8193) })).toBe('The token exceeds the 8192-character limit. Copy only the token.');
    expect(credentialDraftError({ value: 'café' }, { locale: 'fr' })).toBe(CREDENTIAL_COPY.fr.ascii);
  });
  it('renders only a supplied server hint and hides every character of a short secret', () => {
    const row = { envNames: [], hasAccessToken: true, accessTokenHint: { length: 1184, last4: 'a9F2' } } as unknown as AdminExternalMcpServer;
    expect(describeStoredCredentials({ server: row }, { locale: 'en' })).toBe('Access token set (…a9F2, 1,184 chars)');
    expect(describeStoredCredentials({ server: { ...row, accessTokenHint: { length: 5, last4: null } } }, { locale: 'en' })).toBe('Access token set (5 chars)');
    expect(formatCredentialHint({ hint: { length: 5, last4: null }, locale: 'fr' })).toBe('5 caractères');
  });
  it.each(ADMIN_LOCALES.map(({ code }) => code))('has credential errors and outcomes for offered locale %s', locale => {
    for (const id of ['blank', 'limit', 'ascii', 'plain', 'saved', 'auth', 'timeout', 'unreachable'] as const) {
      const expected = locale === 'en' ? credentialText({ id }) : CREDENTIAL_COPY[locale as keyof typeof CREDENTIAL_COPY][id];
      expect(credentialText({ id, locale })).toBe(expected);
      if (locale !== 'en') expect(expected).not.toBe(credentialText({ id }));
    }
  });
});
