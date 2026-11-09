import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { createCredentialSet, deleteCredentialSet, describeCredentialSet, describeCredentialSetByLabel, listCredentialSetInventory,
  listCredentialSets, resolveCredentialSetByLabel, updateCredentialSet } from "@jini-ai/integrations/credentialed-http/sets";
import { tovuCredentialSetHost as host } from "./tovu-credential-sets.js";
import type { CustomCredentialCategoryId, CustomCredentialSetRepoPort, CustomCredentialSummary, CustomProviderConnectionInput } from "./types.js";

/**
 * @file Tovu's custom-credential store: the historical exports, bound to Tovu's host inputs
 * (`./tovu-credential-sets.ts`). Validation and CRUD live in the host-wired `@jini-ai/integrations/credentialed-http/sets` store; public
 * summaries contain saved origins, usernames and safe hints only, and label selection and origin
 * checks never open unrelated credentials. The error classes are the same objects as `@jini-ai/integrations/credentialed-http/sets`.
 */

export { CustomCredentialValidationError, CustomCredentialDuplicateLabelError, CustomCredentialConcurrentModificationError,
  CustomCredentialSecretStoreUnconfiguredError, CustomCredentialNotFoundError } from "@jini-ai/integrations/credentialed-http/sets";

/** Presence inventory never needs a sealer or write ports. */
export interface CustomCredentialInventoryDeps {
  repo: Pick<CustomCredentialSetRepoPort, "listByWorkspace" | "project">;
}

export interface CustomCredentialReadDeps {
  repo: CustomCredentialSetRepoPort;
  sealer?: SecretSealerPort;
}

/** The read model for ONE credential set; never opens an envelope. See `describeCredentialSet`. */
export function describeCredential(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSummary | null> {
  return describeCredentialSet({ host, deps, input });
}

/** Non-decrypting label lookup. See `describeCredentialSetByLabel`. */
export function describeCredentialByLabel(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; label: string }): Promise<CustomCredentialSummary | null> {
  return describeCredentialSetByLabel({ host, deps, input });
}

/** The effective credential sets this workspace uses; never decrypts. See `listCredentialSets`. */
export function listCustomCredentials(deps: CustomCredentialInventoryDeps, input: { workspaceId: UUID }): Promise<CustomCredentialSummary[]> {
  return listCredentialSets({ host, deps, input });
}

/** Admin inventory (unattached project keys, same-label site overrides); safe summaries only.
 * @example await listCustomCredentialInventory({ deps, workspaceId });
 */
export function listCustomCredentialInventory({ deps, workspaceId }: {
  deps: CustomCredentialInventoryDeps; workspaceId: UUID;
}, _optional = {}): Promise<CustomCredentialSummary[]> {
  return listCredentialSetInventory({ host, deps, workspaceId });
}

export interface CustomCredentialWriteDeps extends CustomCredentialReadDeps {
  /** Trusted owner session after human submission; never populated from tool/request input. */
  allowSharedKeyReplacement?: boolean;
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  idGen: { newId(): string };
}

export interface CreateCustomCredentialInput {
  workspaceId: UUID;
  label: unknown;
  category: unknown;
  baseUrl: unknown;
  connection: unknown;
  /** Omitted = no extra hosts beyond `baseUrl`. See `validateAdditionalHosts`'s own doc. */
  additionalHosts?: unknown;
  worksFor?: unknown;
  /** `"site"` = a site-owned key. Omitted (or `"project"`) = the project store when one is
   *  attached, visible to attached sites only; this site's vault otherwise. */
  scope?: unknown;
}

/** Validates, seals, and inserts a new credential set. See `createCredentialSet`. */
export function createCustomCredential(deps: CustomCredentialWriteDeps, input: CreateCustomCredentialInput): Promise<CustomCredentialSummary> {
  return createCredentialSet({ host, deps, input });
}

export interface UpdateCustomCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the category unchanged. */
  category?: unknown;
  /** Omitted = leave the base URL unchanged. */
  baseUrl?: unknown;
  /** Omitted = leave the additional hosts unchanged. Supplying a value REPLACES the whole list
   *  (never merges) — same "full replace, not append" contract this store's other array-ish writes
   *  don't have to disclaim only because none existed before this field. */
  additionalHosts?: unknown;
  worksFor?: unknown;
  /** Omitted = leave the stored connection untouched — same "omitting `connection` keeps the
   *  secret" contract every sibling credential route documents. */
  connection?: unknown;
  /**
   * Independent, top-level control over the plaintext `username` column — added 2026-09-01 so an
   * operator can fix a saved credential's username (the name.com incident this field exists for: the
   * saved row had no username, so every request 401'd, and the only correct value was already known —
   * re-pasting the token to say so was pure friction) WITHOUT retyping the token. Before this field
   * existed, `username` only ever changed as a side effect of a full `connection` replacement (see
   * {@link connection}'s own doc) — correct when username lived inside the sealed blob, no longer
   * necessary now that it is its own column (`db/schema.sqlite.ts`'s `customCredentialSets.username` doc).
   *
   * Three states, validated by {@link validateUsernamePatch}: omitted (`undefined`) leaves the column
   * exactly as `connection` (if supplied) would otherwise have set it; `null` explicitly clears it;
   * any other value must be a non-empty string. See `updateCustomCredential`'s own doc for the
   * precedence rule when this field AND `connection` are both supplied in the same call.
   */
  username?: unknown;
}

/** Partial update with CAS. See `updateCredentialSet`. */
export function updateCustomCredential(deps: CustomCredentialWriteDeps, input: UpdateCustomCredentialInput): Promise<CustomCredentialSummary> {
  return updateCredentialSet({ host, deps, input });
}

/** Idempotent delete. See `deleteCredentialSet`. */
export function deleteCustomCredential(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  return deleteCredentialSet({ host, deps, input });
}

export interface CustomCredentialResolveDeps {
  repo: CustomCredentialSetRepoPort;
  sealer: SecretSealerPort;
}

/** Select by saved label without opening, then open only that row. See `resolveCredentialSetByLabel`. */
export function resolveCustomCredentialByLabel(
  deps: CustomCredentialResolveDeps,
  input: { workspaceId: UUID; label: string }
): Promise<{ id: UUID; category: CustomCredentialCategoryId; baseUrl: string; additionalHosts: readonly string[]; connection: CustomProviderConnectionInput } | null> {
  return resolveCredentialSetByLabel({ host, deps, input });
}
