import { SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { bindCredentialVaultAdapters, createCredentialVaultBinding } from "@jini-ai/integrations/vendor-credentials/vault-adapter";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";

const registry = createTovuVaultKinds({ policy: {
  // Credential catalogs/connection shapes remain validated by the feature stores. This adapter
  // registers their plain metadata with the common safe-field policy; subtype filtering
  // keeps custom API keys outside vendor-only DTO assumptions.
  validateMeta: ({ meta }) => meta,
  legacyPublishCredential: () => undefined,
  tokenField: () => undefined,
} });
const policy: Parameters<typeof createCredentialVaultBinding>[0]["policy"] = { ownerKey: "tovu", acceptedKinds: ["vendor", "custom", "source-control"], metaParsers: registry.metaParsers,
  openService: required => new SecretsVaultService({ ...required, now: () => required.now({}), newId: () => required.newId({}) }) };
export const { credentialVault, credentialScope, SourceControlCredentialSetVaultAdapter, VendorCredentialSetVaultRepo } = bindCredentialVaultAdapters({ policy });
export type VendorCredentialSetVaultRepo = InstanceType<typeof VendorCredentialSetVaultRepo>;
export type SourceControlCredentialSetVaultAdapter = InstanceType<typeof SourceControlCredentialSetVaultAdapter>;
