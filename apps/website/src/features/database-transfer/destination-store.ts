import { normalizeCredentialToken, type CredentialTokenHint } from '../../contracts/core/credential-token.js';
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { InMemoryVaultRepo, SecretsVaultService, VaultError, type VaultRepoPort, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { InMemoryKeyring } from "../webhooks/index.js";
import { AesGcmSecretSealer } from "../webhooks/index.js";
import type { TargetDescription } from "./postgres-target.js";

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

export interface SavedDatabaseDestination {
  readonly connectionString: string;
  readonly tokenHint?: CredentialTokenHint;
  readonly description: TargetDescription;
  readonly savedAt: string;
}

/** What `database_transfer_status` reports about the last run. Never row data, never the address. */
export type DatabaseTransferRunSummary =
  | { readonly copied: true; readonly snapshotAt: string; readonly tableCount: number; readonly rowCount: number }
  | { readonly copied: false; readonly snapshotAt: string; readonly code: string; readonly message: string };

export interface DatabaseDestinationStorePort {
  /** @throws {DestinationUnreadableError} When a saved address exists but cannot be opened. */
  get(workspaceId: string): Promise<SavedDatabaseDestination | null>;
  /** Replaces any earlier destination for the workspace, and forgets its last run. */
  save(workspaceId: string, destination: SavedDatabaseDestination): Promise<void>;
  lastRun(workspaceId: string): Promise<DatabaseTransferRunSummary | null>;
  recordRun(workspaceId: string, summary: DatabaseTransferRunSummary): Promise<void>;
}

/** A saved address that no longer opens: another site key, or a row moved between workspaces. */
export class DestinationUnreadableError extends Error {
  constructor() {
    super("the saved destination database could not be unlocked (the site's key may have changed); save it again with database_transfer_set_destination");
  }
}

/** Internal persistence follows the shared vault port; public store methods stay unchanged.
 * The destination is a singleton (`secrets_vault_singleton`), so it is read with `findOne`, never
 * `findDefault`: 0012 copied legacy rows with is_default=false (the old table had no such column),
 * and a default-only read made an upgraded site's destination invisible (parity finding R1). */
export type DatabaseDestinationRepoPort = VaultRepoPort & Required<Pick<VaultRepoPort, "findOne">>;
const destinationScope = { kind: "database-destination" as const, ownerKey: "tovu", principalId: null, provider: null, binding: null };
const destinationKinds = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined,
} });

export class SealedDatabaseDestinationStore implements DatabaseDestinationStorePort {
  private readonly vault: SecretsVaultService;
  private readonly deps: { readonly repo: DatabaseDestinationRepoPort; readonly sealer: SecretSealerPort; readonly keyring: KeyringPort };
  constructor(deps: { readonly repo: DatabaseDestinationRepoPort; readonly sealer: SecretSealerPort; readonly keyring: KeyringPort }, _options = {}) {
    this.deps = deps;
    this.vault = new SecretsVaultService({ ...deps, metaParsers: destinationKinds.metaParsers,
      now: () => new Date().toISOString(), newId: () => 'vault:["database-destination",null]',
      authorize: async ({ context }) => {
        if (context.kind !== destinationScope.kind || context.ownerKey !== "tovu" || context.principalId !== null) throw new VaultError({ code: "context" });
      } });
  }

  /** One indexed singleton read and at most one open; raw crypto errors never leave the store. */
  async get(workspaceId: string): Promise<SavedDatabaseDestination | null> {
    try {
      const opened = await this.vault.findOne({ ...destinationScope, workspaceId });
      if (!opened) return null;
      if (typeof opened.payload?.connectionString !== "string") throw new VaultError({ code: "invalid-record" });
      const meta = opened.summary.meta;
      // An address is not a token: even its length or suffix can expose connection details.
      return { connectionString: opened.payload.connectionString, description: meta.description as unknown as TargetDescription,
        savedAt: (meta.savedAt ?? opened.summary.createdAt) as string };
    } catch {
      throw new DestinationUnreadableError();
    }
  }

  /** Replaces the singleton through Jini's seal/CAS lifecycle and clears the previous last run. */
  async save(workspaceId: string, destination: SavedDatabaseDestination): Promise<void> {
    const existing = await this.deps.repo.findOne({ ...destinationScope, workspaceId });
    if (destination.connectionString === '' && existing) return;
    const connectionString = normalizeCredentialToken({ value: destination.connectionString, field: "address", hosted: false });
    await this.vault.put({ ...destinationScope, workspaceId, id: existing?.id,
      expectedRevision: existing?.revision ?? null, label: existing?.label ?? "Database destination", isDefault: true,
      meta: { ...existing?.meta, description: { ...destination.description }, savedAt: destination.savedAt, lastRun: null },
      payload: { connectionString } });
  }

  /** Status is validated metadata, so it remains readable even when the site key is unavailable. */
  async lastRun(workspaceId: string): Promise<DatabaseTransferRunSummary | null> {
    const existing = await this.deps.repo.findOne({ ...destinationScope, workspaceId });
    if (!existing) return null;
    const meta = destinationKinds.metaParsers["database-destination"]({ meta: existing.meta });
    return meta.lastRun as unknown as DatabaseTransferRunSummary | null;
  }

  /** Targeted jsonSet + CAS never rewrites a credential. A replacement or deletion wins over the
   * old run; competing metadata patches may retry against the same envelope, at most three times.
   * @complexity At most three indexed reads/validated CAS patches, no decryption.
   */
  async recordRun(workspaceId: string, summary: DatabaseTransferRunSummary): Promise<void> {
    let original: VaultRecord | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.deps.repo.findOne({ ...destinationScope, workspaceId });
      if (!existing || (original && !isSameDestination({ existing, original }))) return;
      original ??= existing;
      try {
        await this.vault.patchMeta({ ...destinationScope, workspaceId, id: existing.id,
          expectedRevision: existing.revision, patch: { lastRun: { ...summary } } });
        return;
      } catch (error) {
        if (!(error instanceof VaultError) || error.code !== "conflict" || attempt === 2) throw error;
      }
    }
  }
}

function isSameDestination({ existing, original }: { existing: VaultRecord; original: VaultRecord }, _options = {}): boolean {
  return existing.id === original.id && JSON.stringify(existing.sealed) === JSON.stringify(original.sealed);
}

/** Same store lifecycle, with Jini's cloned/CAS memory repo and an ephemeral site key. */
export class InMemoryDatabaseDestinationStore extends SealedDatabaseDestinationStore {
  constructor(_required = {}, _options = {}) {
    const keyring = new InMemoryKeyring();
    super({ repo: new InMemoryVaultRepo({}), sealer: new AesGcmSecretSealer(keyring), keyring });
  }
}

/** The process-wide fallback for compositions without a database; the live server passes SQL. */
export const databaseDestinationStore: DatabaseDestinationStorePort = new InMemoryDatabaseDestinationStore();
