import { normalizeCredentialToken } from '@jini-ai/platform/secrets/credential-token';
import type { KeyringPort } from "@jini-ai/core/contracts/vault";
import type { SecretSealerPort } from "@jini-ai/integrations/secrets";
import { InMemoryVaultRepo, SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { InMemoryKeyring } from "../webhooks/keyring.env.js";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SealedDatabaseDestinationStore as JiniSealedDatabaseDestinationStore, authorizeDestinationVaultContext as authorizeVaultContext } from "@jini-ai/db/transfer/destination-store";
import type { DatabaseDestinationRepoPort, DatabaseDestinationStorePort } from "@jini-ai/db/transfer/destination-store";

/**
 * @file Where a site's database copy goes: one saved destination per workspace. The human types the
 * address into `database_transfer_set_destination`'s private form, so the connection string (and its
 * password) never passes through the model. Tools read it from here and only ever return its
 * {@link TargetDescription}.
 *
 * {@link SealedDatabaseDestinationStore} is the real one: the address is sealed whole (AES-GCM under
 * the site's site key, context-bound AAD owned by Jini) in
 * `secrets_vault`, so it survives a restart and is never readable at rest.
 * {@link InMemoryDatabaseDestinationStore} backs compositions without a database (route tests).
 */

const destinationScope = { kind: "database-destination" as const, ownerKey: "tovu", principalId: null, provider: null, binding: null };
const destinationKinds = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined,
} });

/** The vault's access check: only the site-wide (`principalId: null`) Tovu database-destination
 * scope may open the sealed address; any other kind, owner or principal is refused with `context`. */
export function authorizeDestinationVaultContext(
  { context }: { readonly context: { readonly kind: string; readonly ownerKey: string; readonly principalId: string | null } },
  _options = {}
): Promise<void> {
  return authorizeVaultContext({ context, scope: destinationScope });
}

export class SealedDatabaseDestinationStore extends JiniSealedDatabaseDestinationStore {
  constructor(deps: { readonly repo: DatabaseDestinationRepoPort; readonly sealer: SecretSealerPort; readonly keyring: KeyringPort }, _options = {}) {
    const vault = new SecretsVaultService({ ...deps, metaParsers: destinationKinds.metaParsers,
      now: () => new Date().toISOString(), newId: () => 'vault:["database-destination",null]',
      authorize: authorizeDestinationVaultContext });
    super({ repo: deps.repo, vault, scope: destinationScope,
      parseMeta: destinationKinds.metaParsers["database-destination"],
      normalizeAddress: ({ value }) => normalizeCredentialToken({ value, field: "address", hosted: false }) });
  }
}

/** Same store lifecycle, with Jini's cloned/CAS memory repo and an ephemeral site key. */
export class InMemoryDatabaseDestinationStore extends SealedDatabaseDestinationStore {
  constructor(_required = {}, _options = {}) {
    const keyring = new InMemoryKeyring();
    super({ repo: new InMemoryVaultRepo({}), sealer: new AesGcmSecretSealer({ keyring }), keyring });
  }
}

/** The process-wide fallback for compositions without a database; the live server passes SQL. */
export const databaseDestinationStore: DatabaseDestinationStorePort = new InMemoryDatabaseDestinationStore();
