/** @file Compatibility facade for site-key recovery over the vault. */
export {
  countVaultCredentialsOpening as countSealedCredentialsOpening,
  discardVaultCredentialsNotOpening as discardSealedCredentialsNotOpening,
  resealVaultCredentialsOpeningUnder as resealCredentialsOpeningUnder,
  type SealedCredentialKeyDeps, type ResealCredentialsDeps,
} from "./vault-credential-recovery.js";
