import type { VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { SiteGrantedVault } from "../project-keys/attached-vault.js";
import type { CustomCredentialCategoryId } from "../../contracts/core/custom-credential-categories.js";
import { CredentialSetVaultRepo, credentialSetVaultRecord, credentialSetVaultScope } from "./sets/vault-repo.js";
import { tovuCredentialSetVaultPolicy as policy } from "./tovu-credential-sets.js";
import type { CustomCredentialProjectScope, CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "./types.js";

/**
 * @file Tovu's custom-credential vault repository: the historical exports, bound to Tovu's owner
 * (`tovu`), metadata parser, label order and `VaultError` (`./tovu-credential-sets.ts`). The
 * repository logic lives in the host-wired `./sets/vault-repo.ts`.
 */

type VaultPutRecord = Parameters<VaultRepoPort["put"]>[0]["record"];

export function customVaultScope({ workspaceId, id, kind = "vendor" }: { workspaceId: string; id?: string; kind?: "vendor" | "custom" }, _options = {}) {
  return credentialSetVaultScope({ workspaceId, kind, ownerKey: policy.ownerKey, ...(id === undefined ? {} : { id }) });
}

/** Username belongs exclusively to metadata after normalization; no sealed fallback can resurrect
 * an explicit clear. The private envelope/revision never becomes a public summary field.
 */
export function customVaultRecord({ row, expectedRevision }: { row: VaultPutRecord; expectedRevision?: number | null }, _options = {}): CustomCredentialSetRecord {
  return credentialSetVaultRecord<CustomCredentialCategoryId>({ row, policy, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
}

/** Fixed owner/provider scope keeps custom labels unique across the workspace in both adapters.
 * A site-granted reader's indexed `findByLabel` (same vault object) is used for label lookups.
 */
export class CustomCredentialVaultRepo extends CredentialSetVaultRepo<CustomCredentialCategoryId> implements CustomCredentialSetRepoPort {
  /** @param optional.project The project store this site's rows fall back to (`types.ts`). */
  constructor({ vault }: { vault: VaultRepoPort }, optional: { project?: CustomCredentialProjectScope } = {}) {
    const reader = vault as SiteGrantedVault;
    super({ vault, policy }, { ...(optional.project ? { project: optional.project } : {}),
      ...(reader.findByLabel ? { findRowByLabel: input => reader.findByLabel!(input) } : {}) });
  }
}
