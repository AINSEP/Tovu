import { describe, expect, it, vi } from 'vitest';
import { createSecurityHostPorts, createSecurityTranslator, securityApi, securitySessionGrants, describeSecurityError, securityRefreshSignal } from '../security-ports';
import { tSecurity as translateSecurity } from "../../../lib/i18n-common";
import { publishContentRefresh, resetContentRefreshBus } from '@jini-ai/admin/shell/lib/content-refresh-bus';

/** A transport that records the wire (method, path, JSON body) and answers with a fixed reply. */
function recordingTransport({ reply = {} }: { reply?: unknown } = {}) {
  const calls: { method: string; path: string; body: string | undefined }[] = [];
  const transport = { request: vi.fn(async ({ method, path, body }: { method: string; path: string; body?: unknown }) => {
    calls.push({ method, path, body: body === undefined ? undefined : JSON.stringify(body) });
    return reply as never;
  }) };
  return { transport, calls };
}

describe('security host grants (D6)', () => {
  it('grants every security affordance to a wildcard session once grants are ready', () => {
    expect(securitySessionGrants({ permissions: ['*'] }, { grantsReady: true })).toEqual([
      'security.read', 'admin.security.tokens.manage', 'system.publish', 'source-control.credentials.write',
      'custom-credentials.write', 'admin.assistant.manage', 'admin.integrations.manage',
    ]);
  });

  it('withholds the root-key grant from an editor without the site-key permission', () => {
    const grants = securitySessionGrants({ permissions: ['system.publish', 'custom-credentials.write'] }, { grantsReady: true });
    expect(grants).toEqual(['security.read', 'system.publish', 'custom-credentials.write']);
    expect(grants).not.toContain('admin.security.tokens.manage');
  });

  it('grants exactly security.read while the session grants are still loading', () => {
    expect(securitySessionGrants({ permissions: ['*'] }, { grantsReady: false })).toEqual(['security.read']);
  });
});

describe('security host translator (D7 alias table)', () => {
  it('maps Jini keys whose English differs to the host dictionary keys', () => {
    const en = createSecurityTranslator({ locale: 'en' });
    expect(en('rootKey')).toBe('Site key');
    expect(en('accessTokens')).toBe('Access Tokens');
    expect(en('security')).toBe('Secrets');
    expect(en('kicker')).toBe('Operations');
  });

  it('follows the locale through the relocated dictionary and interpolates Jini placeholders', () => {
    const es = createSecurityTranslator({ locale: 'es' });
    expect(es('rootKey')).toBe(translateSecurity({ locale: 'es', key: 'Site key' }));
    expect(es('rootKey')).not.toBe('Site key');
    expect(createSecurityTranslator({ locale: 'en' })('tokenCountMany', { count: 3 })).toBe('3 tokens saved');
  });
});

describe('security host ports', () => {
  it('keeps the host site-key wire: /system/site-key paths and a { siteKey } import body', async () => {
    const { transport, calls } = recordingTransport({ reply: { outcome: 'imported', fingerprint: 'f', keyFilePath: '/k', runtimeMode: 'local' } });
    const { rootKey } = createSecurityHostPorts({ transport }, { workspaceId: 'ws-1' });
    await rootKey.importToken({ token: 'fixture-site-key' });
    expect(calls).toEqual([{ method: 'POST', path: '/workspaces/ws-1/system/site-key/import', body: '{"siteKey":"fixture-site-key"}' }]);
    expect(typeof rootKey.reveal).toBe('function');
  });

  it('writes media keys in the host order (replaced-last)', async () => {
    const { transport, calls } = recordingTransport({ reply: { a: { model: 'a-model' }, b: { baseUrl: 'https://b' } } });
    const { otherCredentials } = createSecurityHostPorts({ transport }, { workspaceId: 'ws-1' });
    await otherCredentials!.replace({ store: 'media-provider', id: 'a', token: 'fixture-key' });
    const write = calls.find(call => call.method === 'PUT');
    expect(write).toEqual({ method: 'PUT', path: '/workspaces/ws-1/media/providers', body: '{"b":{"baseUrl":"https://b"},"a":{"apiKey":"fixture-key","model":"a-model"}}' });
  });

  it("exposes exactly the host client's 11 method names", () => {
    expect(Object.keys(securityApi).sort()).toEqual([
      'copyCredentials', 'createCustomCredential', 'createPublishCredential', 'deleteCustomCredential', 'deletePublishCredential',
      'listCredentialCopySources', 'listCustomCredentials', 'listPublishCredentials', 'updateCustomCredential', 'updatePublishCredential',
      'verifyPublishCredential',
    ]);
  });

  it('reloads on an access-tokens content refresh only', () => {
    const onRefresh = vi.fn();
    const stop = securityRefreshSignal.subscribe({ onRefresh });
    publishContentRefresh({ resources: ['media'] });
    publishContentRefresh({ resources: ['access-tokens'] });
    stop(); resetContentRefreshBus();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('describes a credential failure from the server message, never a submitted secret', () => {
    const text = describeSecurityError({ error: new Error('DUPLICATE_LABEL') });
    expect(text).toBe('DUPLICATE_LABEL');
    // A thrown non-Error (for example a raw value) carries no server message: fixed copy shows instead.
    expect(describeSecurityError({ error: 'fixture-secret-value' })).toBeUndefined();
  });
});
