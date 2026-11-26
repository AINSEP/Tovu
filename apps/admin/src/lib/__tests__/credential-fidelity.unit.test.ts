import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { describeApiError } from "@/lib/admin-http/request";
import { VERSION_CONFLICT_MESSAGE } from "@jini-ai/admin/shell/lib/version-conflict";
import { isVersionConflict } from "@/lib/shell-collaborators";
import { t as tExternalMcp } from "@jini-ai/admin/screens/settings/external-mcp-i18n";
import { mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, resolveExternalMcpEffectiveTransport, validateExternalMcpOAuthIdentity } from "@jini-ai/admin/screens/settings/rules";
import { describe, expect, it } from 'vitest';
import { ADMIN_LOCALES } from '@tovu/contracts/admin-locales';
import { CREDENTIAL_COPY, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from '@tovu/contracts/credential-copy';
import { credentialDraftError, storedCredentialHint } from '../credential-copy';
import { buildSourceControlConnectionInput } from '@jini-ai/devops/source-control/react/rules';
import { buildCredentialConnectionInput } from '@jini-ai/devops/deploy/react/rules';
import { describeStoredCredentials, toAccessTokenWriteBody } from '@jini-ai/mcp/react/external-mcp/hooks/use-external-mcp.hooks';
import type { AdminExternalMcpServer } from '@jini-ai/core/contracts/site/cms-external-mcp';

const mcpDeps = { port: integrationsApi, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage,
  credentialDraftError, describeApiError, VERSION_CONFLICT_MESSAGE, isVersionConflict, translate: tExternalMcp,
  mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, resolveExternalMcpEffectiveTransport,
  validateExternalMcpOAuthIdentity, now: Date.now };

describe('credential byte preservation and safe admin hints', () => {
  it('uses server hints for both BYOK placeholders and separates a literal dot from the ellipsis', () => {
    const stored = { isSet: true, masked: '••••a9F2', tokenHint: { length: 18, last4: 'a9F2' } };
    expect(storedCredentialHint({ stored })).toBe('…a9F2, 18 chars');
    expect(storedCredentialHint({ stored }, { locale: 'fr' })).toBe('…a9F2, 18 caractères');
    expect(storedCredentialHint({ stored, storedKeyIsForOtherEndpoint: true })).toBeUndefined();
    expect(storedCredentialHint({ stored: { ...stored, masked: null, tokenHint: { length: 4, last4: null } } })).toBe('4 chars');
    expect(formatCredentialHint({ hint: { length: 21, last4: '.com' } })).toBe('…\u202f.com, 21 chars');
  });
  it('falls back to a legacy server mask, and shows no hint for a set key with neither hint nor mask or an unset key', () => {
    expect(storedCredentialHint({ stored: { isSet: true, masked: '••••a9F2' } })).toBe('••••a9F2');
    expect(storedCredentialHint({ stored: { isSet: true, masked: null, tokenHint: null } })).toBeUndefined();
    expect(storedCredentialHint({ stored: { isSet: false, masked: '••••a9F2' } })).toBeUndefined();
    expect(storedCredentialHint({ stored: null })).toBeUndefined();
  });
  it('rethrows a validator failure that is not a credential input error instead of displaying it', () => {
    expect.assertions(3);
    const failure = new RangeError('validator bug');
    expect(() => credentialDraftError({ value: 'abc' }, { assertToken: () => { throw failure; } })).toThrow(failure);
    try {
      credentialDraftError({ value: 'abc' }, { assertToken: () => { throw failure; } });
    } catch (error) {
      expect(error).toBe(failure);
    }
    expect(credentialDraftError({ value: 'abc' }, { assertToken: () => {} })).toBe(null);
  });
  it('sends the original entered token to the store; blank and whitespace stay distinct', () => {
    for (const token of [' \nabc+/=._-~\n ', '', '   ']) {
      expect(buildSourceControlConnectionInput({ fields: { providerId: 'github', token, values: {} }, declaredFields: [] }).token === token).toBe(true);
      const published = buildCredentialConnectionInput({ providerId: 'fixture-host', spec: { tokenField: 'apiKey', fields: [{ name: 'apiKey', label: 'Key', required: true, secret: true }] }, values: { apiKey: token } });
      expect(token === '' ? !('apiKey' in published) : published.apiKey === token).toBe(true);
      expect(toAccessTokenWriteBody({ fields: { authMode: 'static_env', accessToken: token }, deps: mcpDeps })).toEqual(token === '' ? {} : { accessToken: token });
    }
  });
  it('validates the untrimmed draft bytes (M-trim-secret-before-validation)', () => {
    const seen: string[] = [];
    expect(credentialDraftError({ value: ' \nabc \n' }, { assertToken: ({ value }) => { seen.push(value); } })).toBe(null);
    expect(seen).toEqual([' \nabc \n']);
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
    expect(describeStoredCredentials({ deps: mcpDeps, server: row }, { locale: 'en' })).toBe('Access token set (…a9F2, 1,184 chars)');
    expect(describeStoredCredentials({ deps: mcpDeps, server: { ...row, accessTokenHint: { length: 5, last4: null } } }, { locale: 'en' })).toBe('Access token set (5 chars)');
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
