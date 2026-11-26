import { SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { CredentialSetVaultAdapter, VendorCredentialSetVaultRepo as VendorRepo, createCredentialVaultBinding, toVendorCredentialRecord, toSourceControlCredentialRecord } from "@jini-ai/integrations/vendor-credentials/vault-adapter";
import type { VaultRepoPort } from "@jini-ai/core/contracts/vault";
import type { SourceControlCredentialSetRecord } from "@jini-ai/core/contracts/site/source-control-credentials";
import type { VendorCredentialProjectScope, VendorCredentialSetRecord } from "@jini-ai/core/contracts/site/vendor-credentials";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";

type Record = SourceControlCredentialSetRecord | VendorCredentialSetRecord;
type Kind = "vendor" | "source-control";
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
const binding = createCredentialVaultBinding({ policy });
export const credentialVault = binding.open;
export const credentialScope = binding.scope;

export class TovuCredentialSetVaultAdapter<R extends Record> extends CredentialSetVaultAdapter<R> {
  constructor({ vault, kind, vendor = false }: { vault: VaultRepoPort; kind: Kind; vendor?: boolean }, _optional = {}) {
    super({ vault, kind, policy, projectRecord: (vendor ? toVendorCredentialRecord : toSourceControlCredentialRecord) as (required: Parameters<typeof toVendorCredentialRecord>[0]) => R });
  }
}
export class VendorCredentialSetVaultRepo extends VendorRepo {
  constructor(required: { vault: VaultRepoPort; kind: Kind; vendor?: boolean }, optional: { project?: VendorCredentialProjectScope } = {}) {
    super({ vault: required.vault, policy }, optional);
  }
}
