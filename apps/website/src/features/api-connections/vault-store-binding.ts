import { createHash } from "node:crypto";
import { createVaultMetaParsers, type VaultArchiveEntry, SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { VaultError, type VaultRepoPort, type KeyringPort, type SecretSealerPort } from "@jini-ai/core/contracts/vault";
import { authorizeScopedVaultContext } from "@jini-ai/core/contracts/site/vault-context";
import type { Clock } from "@jini-ai/core/primitives";
import type { ApiConnectionRecordStore, ApiConnectionTokenStore } from "@jini-ai/integrations/api-connections";
import {
  createApiConnectionVaultRecordStore as createRecordStore,
  createApiConnectionVaultTokenStore as createTokenStore,
  rebindApiConnectionArchive as rebindArchive,
  type ApiConnectionVaultPolicy,
  type ApiConnectionVaultRecordStore,
} from "@jini-ai/integrations/api-connections/vault-stores";
import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import {
  API_CONNECTION_RECORD_FORMAT as RECORD_FORMAT, API_CONNECTION_ATTEMPT_FORMAT as ATTEMPT_FORMAT, PLUGIN_STATE_FORMAT,
  API_CONNECTION_VAULT_KIND, apiConnectionVaultScope,
} from "#src/platform/secrets/vault-api-connection-meta";

export const API_CONNECTION_VAULT_POLICY: ApiConnectionVaultPolicy = {
  scope: apiConnectionVaultScope,
  recordFormat: RECORD_FORMAT,
  attemptFormat: ATTEMPT_FORMAT,
  pluginStateFormat: PLUGIN_STATE_FORMAT,
  // State is sealed inside the attempt only: row ids and labels are visible to vault listings.
  hashState: ({ state }) => createHash("sha256").update(state).digest("hex"),
  /**
   * Vault labels are unique per scope, and one scope holds every connection's record plus every open
   * sign-in attempt, so each label is derived from what makes its row unique: the record's key, and
   * for an attempt its key plus a digest of the state (the state itself is the callback's bearer
   * value and is kept out of anything listed).
   */
  recordLabel: ({ key }) => `API connection ${key}`,
  attemptLabel: ({ attempt }) =>
    `API connection sign-in ${attempt.key} ${createHash("sha256").update(attempt.state).digest("hex").slice(0, 16)}`,
  /** Owner references are site authority, never portable plugin preferences. */
  isOwnerReference: ({ id }) => id.startsWith("plugin-state:tovu-key-references:") || id.startsWith("plugin-state:tovu-shared-oauth-binding:")
    || id.startsWith("plugin-state:tovu-shared-oauth:"),
  omittedNotice: ({ count }) => `${count} unsupported API connection(s) were left out.`,
};

export interface ApiConnectionVaultDeps {
  readonly repo: VaultRepoPort;
  readonly keyring: KeyringPort;
  readonly sealer: SecretSealerPort;
  readonly clock: Clock;
  readonly workspaceId: string;
}

/**
 * A vault service confined to one workspace's api-connection rows. Every other kind, owner or
 * workspace is refused before any metadata parser or crypto runs.
 * @complexity O(1) setup.
 */
export function createApiConnectionVault(required: ApiConnectionVaultDeps, _optional: Record<string, never> = {}): SecretsVaultService {
  const scope = apiConnectionVaultScope({ workspaceId: required.workspaceId });
  return new SecretsVaultService({
    repo: required.repo, keyring: required.keyring, sealer: required.sealer,
    metaParsers: createVaultMetaParsers({}, { parsers: { [API_CONNECTION_VAULT_KIND]: input => parseTovuStoreMeta({ ...input, kind: API_CONNECTION_VAULT_KIND }) } }),
    authorize: ({ context }) => authorizeScopedVaultContext({ context, scope }),
    now: () => new Date(required.clock.nowMs()).toISOString(),
    newId: () => { throw new VaultError({ code: "invalid-record" }); },
  });
}

export function createApiConnectionVaultRecordStore(
  required: { readonly vault: SecretsVaultService; readonly workspaceId: string; readonly clock: Clock },
  _optional: Record<string, never> = {},
): ApiConnectionVaultRecordStore {
  return createRecordStore({ ...required, policy: API_CONNECTION_VAULT_POLICY });
}

export function createApiConnectionVaultTokenStore(
  required: {
    readonly vault: SecretsVaultService; readonly records: ApiConnectionRecordStore; readonly clock: Clock;
    readonly owner: { readonly workspaceId: string; readonly pluginId: string; readonly connectionId: string; readonly clientId: string };
  },
  _optional: Record<string, never> = {},
): ApiConnectionTokenStore {
  return createTokenStore({ ...required, policy: API_CONNECTION_VAULT_POLICY });
}

export function rebindApiConnectionArchive(required: { entries: readonly VaultArchiveEntry[]; workspaceId: string }, _optional: Record<string, never> = {}): { entries: VaultArchiveEntry[]; notices: string[] } {
  return rebindArchive({ ...required, policy: API_CONNECTION_VAULT_POLICY }) as { entries: VaultArchiveEntry[]; notices: string[] };
}
