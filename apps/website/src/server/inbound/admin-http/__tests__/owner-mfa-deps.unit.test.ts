import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerMfaDepsFrom } from '../owner-mfa-deps.js';

const scope = { workspaceId: 'site', principalId: 'owner' };
const envelope = { keyId: 'fixture-key', alg: 'aes-256-gcm', nonce: 'fixture-nonce', ciphertext: 'fixture-ciphertext' };

/** Only the crypto adapter is exercised; no identity method or persistence operation runs here. */
function fixture() {
  const calls: unknown[] = [];
  const key = { keyId: 'fixture-key' };
  const sealer = {
    seal: async (input: unknown) => { calls.push({ operation: 'seal', input }); return envelope; },
    open: async (input: unknown, options: unknown) => { calls.push({ operation: 'open', input, options }); return 'fixture-secret'; },
  };
  const keyring = { activeKey: async () => { calls.push({ operation: 'active-key' }); return key; },
    derive: async () => assert.fail('MFA must reuse the active site key'),
    deriveSigningSecret: async () => assert.fail('MFA must not derive a signing key'),
  };
  const deps = { workspaceId: scope.workspaceId, identityReady: Promise.resolve(), ownerPrincipalId: Promise.resolve(scope.principalId),
    mfaStore: {},
  } as unknown as Parameters<typeof ownerMfaDepsFrom>[0]['deps'];
  return { deps, sealer, keyring, key, calls };
}

for (const missing of ['both', 'keyring', 'sealer'] as const) {
  test(`MFA crypto composes lazily and refuses ${missing} missing ports before seal or open`, async () => {
    const f = fixture();
    if (missing === 'keyring') f.deps.siteAssistantSecretSealer = f.sealer;
    if (missing === 'sealer') f.deps.siteAssistantSecretKeyring = f.keyring;
    const mfa = await ownerMfaDepsFrom({ deps: f.deps });
    assert.deepEqual(f.calls, [], 'constructing pending-login dependencies must not touch crypto');
    const expected = { message: 'The site key is unavailable for owner authenticator verification' };
    await assert.rejects(async () => mfa.secrets.seal({ ...scope, secret: 'fixture-secret' }), expected);
    await assert.rejects(async () => mfa.secrets.open({ ...scope, sealedSecret: JSON.stringify(envelope) }), expected);
    assert.deepEqual(f.calls, [], 'a partially available crypto pair must never be used');
  });
}

test('MFA resolves late-bound ports and preserves the exact owner scope AAD for seal and open', async () => {
  const f = fixture();
  const mfa = await ownerMfaDepsFrom({ deps: f.deps });
  f.deps.siteAssistantSecretSealer = f.sealer;
  f.deps.siteAssistantSecretKeyring = f.keyring;
  const sealedSecret = await mfa.secrets.seal({ ...scope, secret: 'fixture-secret' });
  assert.equal(sealedSecret, JSON.stringify(envelope));
  assert.equal(await mfa.secrets.open({ ...scope, sealedSecret }), 'fixture-secret');
  const aad = JSON.stringify(['owner-totp-v1', scope.workspaceId, scope.principalId]);
  assert.deepEqual(f.calls, [
    { operation: 'active-key' },
    { operation: 'seal', input: { plaintext: 'fixture-secret', key: f.key, aad } },
    { operation: 'open', input: { sealed: envelope }, options: { aad } },
  ]);
  delete f.deps.siteAssistantSecretKeyring;
  await assert.rejects(async () => mfa.secrets.open({ ...scope, sealedSecret }), {
    message: 'The site key is unavailable for owner authenticator verification',
  });
  assert.equal(f.calls.length, 3, 'open must recheck both ports even after earlier successful actions');
});
