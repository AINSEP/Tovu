import { ProjectKeyCreateConflictError } from "../project-keys/create-vault.js";
import { normalizeCredentialWorksFor, VaultError } from "@jini-ai/platform/secrets/credential-sets";
import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken } from '../../contracts/core/credential-token.js';
import { isUniqueViolation } from "@jini-ai/db/kernel";
import { byVaultLabel, createTovuStoreVault, parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { credentialCreateTarget, credentialScopes } from "../vendor-credentials/index.js";
import { CUSTOM_CREDENTIAL_CATEGORIES, type CustomCredentialCategoryId } from "../../contracts/core/custom-credential-categories.js";
import type { CredentialSetStoreHost, CredentialSetVaultPolicy } from "@jini-ai/integrations/credentialed-http/sets";
import { CustomCredentialSecretStoreUnconfiguredError } from "@jini-ai/integrations/credentialed-http/sets";

/**
 * @file Tovu's wiring of the credential-set store (`@jini-ai/integrations/credentialed-http/sets`). Every product input lives here: the
 * `tovu` vault owner, Tovu's store vault and metadata rules, project/vendor scope policy, the
 * storage kernel's UNIQUE detector, Shared Keys conflict errors, token policy with Tovu's
 * application-key detector, the Access Tokens category list and Tovu wording. `store.ts` and
 * `vault-repo.ts` keep their historical exports by binding these.
 */

/** Owner `tovu`, Tovu's complete-shape metadata parser and label order, canonical `VaultError`. */
export const tovuCredentialSetVaultPolicy: CredentialSetVaultPolicy = {
  ownerKey: "tovu",
  parseMeta: input => parseTovuStoreMeta(input),
  compareLabels: byVaultLabel,
  vaultErrors: {
    create: ({ code }) => new VaultError({ code }),
    codeOf: error => error instanceof VaultError ? error.code : undefined,
  },
  labelConflict: () => new Error("UNIQUE constraint failed: secrets_vault.workspace_id, secrets_vault.kind, secrets_vault.label"),
};

/** The store host for Tovu's custom credentials (Access Tokens / Shared Keys). */
export const tovuCredentialSetHost: CredentialSetStoreHost<CustomCredentialCategoryId> = {
  vault: tovuCredentialSetVaultPolicy,
  /** Constrain one feature service; permission checks remain in routes/tools. */
  openVault: ({ deps, kind }) => createTovuStoreVault({ ...deps, kind,
    storageError: () => new CustomCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) }),
  scopes: credentialScopes,
  createTarget: credentialCreateTarget,
  isUniqueViolation,
  isCreateConflict: (error): error is Error => error instanceof ProjectKeyCreateConflictError,
  token: {
    normalize: ({ value }) => normalizeCredentialToken({ value }),
    assertFreeField: required => assertCredentialFreeField(required),
    isInputError: (error): error is Error => error instanceof CredentialInputError,
  },
  normalizeWorksFor: ({ value }) => normalizeCredentialWorksFor({ value }),
  categories: CUSTOM_CREDENTIAL_CATEGORIES,
  messages: {
    storage: CREDENTIAL_MESSAGES.storage,
    worksForInvalid: "worksFor must be an array of provider IDs",
    sharedReplacementReadOnly: "Change this saved key in Shared Keys, or open its secure key card in the owner session. Details: P25_OWNER_KEY_READ_ONLY.",
    sharedDeleteReadOnly: "To stop using this key here, revoke its site grant. Manage the saved key itself in Shared Keys. Details: P25_OWNER_KEY_READ_ONLY.",
    duplicateLabel: ({ label }) => `a custom credential labeled '${label}' already exists in this workspace`,
    projectDuplicateLabel: ({ label }) => `Your project already has a key named '${label}'. Use it here, or pick another name.`,
    notFound: ({ id }) => `no custom credential '${id}' in this workspace`,
  },
};
