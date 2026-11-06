import { createOtplibTotp, createSealedMfaSecrets, type OwnerMfaDeps } from '@jini-ai/user-management/server';
import type { ClockDeps, CredentialsDeps, IdentityDeps } from '../../routes/types.js';
import { identityServiceDepsFrom } from './routes/users/deps.js';

/** Sign-in needs identity only; enrollment/verification also needs the site's existing sealer. */
type OwnerMfaRouteDeps = ClockDeps & IdentityDeps & Partial<Pick<CredentialsDeps,
  'siteAssistantSecretSealer' | 'siteAssistantSecretKeyring'>>;

/** Bind server-selected owner and existing sealing ports; never accept scope from a request.
 * Sealing capability is checked on use so launcher sign-in can issue a pending proof without
 * touching a secret. Missing ports refuse verification, never grant an owner session.
 * @complexity O(1) composition, waiting for the existing seed promise; no added polling.
 */
export async function ownerMfaDepsFrom(
  { deps }: { deps: OwnerMfaRouteDeps },
  _options: Record<string, never> = {},
): Promise<OwnerMfaDeps> {
  await deps.identityReady;
  if (!deps.mfaStore) throw new Error('Owner authenticator storage is unavailable');
  const sealingPorts = () => {
    if (!deps.siteAssistantSecretSealer || !deps.siteAssistantSecretKeyring) {
      throw new Error('The site key is unavailable for owner authenticator verification');
    }
    return { sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring };
  };
  const secrets = createSealedMfaSecrets({
    get sealer() { return sealingPorts().sealer; },
    get keyring() { return sealingPorts().keyring; },
  }, {});
  return { auth: identityServiceDepsFrom(deps), store: deps.mfaStore,
    seededOwnerPrincipalId: await deps.ownerPrincipalId, totp: createOtplibTotp({}, {}), secrets };
}
