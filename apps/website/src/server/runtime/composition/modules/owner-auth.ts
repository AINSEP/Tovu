/**
 * @file Owner authenticator composition: binds this site's deps to Jini's owner MFA composer
 * (`@jini-ai/user-management/admin-http/owner/mfa-deps`). Sign-in, enrollment, passkey and recovery
 * all call `ownerMfaDepsFrom`, so they share one server-selected owner and the site's sealing ports.
 */
import { composeOwnerMfaDeps } from "@jini-ai/user-management/admin-http/owner/mfa-deps";
import { createOtplibTotp, createSealedMfaSecrets, type OwnerMfaDeps } from "@jini-ai/user-management/server";
import type { ClockDeps, IdentityDeps } from "#src/server/routes/types";
import type { CredentialsDeps } from "#src/server/routes/route-deps/credentials-deps";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";

/** Sign-in needs identity only; enrollment/verification also needs the site's existing sealer. */
export type OwnerMfaRouteDeps = ClockDeps & IdentityDeps & Partial<Pick<CredentialsDeps,
  "siteAssistantSecretSealer" | "siteAssistantSecretKeyring">>;

/**
 * The site's owner MFA deps. Getters keep every field late-bound: storage is read after identity
 * bootstrap and the sealer/keyring on every seal/open, so ports attached after composition are used
 * and ports removed later refuse (tests rely on both).
 * @complexity O(1) composition, waiting for the existing seed promise; no added polling.
 */
export async function ownerMfaDepsFrom(
  { deps }: { deps: OwnerMfaRouteDeps },
  _options: Record<string, never> = {},
): Promise<OwnerMfaDeps> {
  return composeOwnerMfaDeps({
    deps: {
      get identityReady() { return deps.identityReady; },
      get mfaStore() { return deps.mfaStore; },
      get ownerPrincipalId() { return deps.ownerPrincipalId; },
      get secretSealer() { return deps.siteAssistantSecretSealer; },
      get secretKeyring() { return deps.siteAssistantSecretKeyring; },
    },
    authServiceDeps: () => identityServiceDepsFrom(deps),
    totp: createOtplibTotp({}, {}),
    sealedSecrets: createSealedMfaSecrets,
  });
}
