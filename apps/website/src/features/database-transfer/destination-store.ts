import { normalizeCredentialToken, credentialTokenHint, type CredentialTokenHint } from '../../contracts/core/credential-token.js';
import type { KeyringPort, SealedSecret, SecretSealerPort } from "../webhooks/index.js";
import { buildDatabaseDestinationAad, DATABASE_DESTINATION_AAD_VERSION } from "./destination-aad.js";
import type { TargetDescription } from "./postgres-target.js";

/**
 * @file Where a site's database copy goes: one saved destination per workspace. The human types the
 * address into `database_transfer_set_destination`'s private form, so the connection string (and its
 * password) never passes through the model. Tools read it from here and only ever return its
 * {@link TargetDescription}.
 *
 * {@link SealedDatabaseDestinationStore} is the real one: the address is sealed whole (AES-GCM under
 * the site's site key, AAD bound to the workspace — `destination-aad.ts`) in
 * `database_transfer_destinations`, so it survives a restart and is never readable at rest.
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

export class InMemoryDatabaseDestinationStore implements DatabaseDestinationStorePort {
  private readonly destinations = new Map<string, SavedDatabaseDestination>();
  private readonly runs = new Map<string, DatabaseTransferRunSummary>();

  async get(workspaceId: string): Promise<SavedDatabaseDestination | null> {
    return this.destinations.get(workspaceId) ?? null;
  }

  async save(workspaceId: string, destination: SavedDatabaseDestination): Promise<void> {
    if (destination.connectionString === '' && this.destinations.has(workspaceId)) return;
    const connectionString = normalizeCredentialToken({ value: destination.connectionString, field: "address", hosted: false });
    this.destinations.set(workspaceId, { ...destination, connectionString, tokenHint: credentialTokenHint({ token: connectionString }) });
    this.runs.delete(workspaceId);
  }

  async lastRun(workspaceId: string): Promise<DatabaseTransferRunSummary | null> {
    return this.runs.get(workspaceId) ?? null;
  }

  async recordRun(workspaceId: string, summary: DatabaseTransferRunSummary): Promise<void> {
    this.runs.set(workspaceId, summary);
  }
}

/** One stored row: the description in the clear, the address sealed. */
export interface DatabaseDestinationRecord {
  readonly workspaceId: string;
  readonly description: TargetDescription;
  readonly sealed: SealedSecret;
  readonly aadVersion: number;
  readonly savedAt: string;
  readonly lastRunJson: string | null;
}

export interface DatabaseDestinationRepoPort {
  find(workspaceId: string): Promise<DatabaseDestinationRecord | null>;
  upsert(record: DatabaseDestinationRecord): Promise<void>;
  setLastRun(workspaceId: string, lastRunJson: string): Promise<void>;
}

export class SealedDatabaseDestinationStore implements DatabaseDestinationStorePort {
  constructor(private readonly deps: { readonly repo: DatabaseDestinationRepoPort; readonly sealer: SecretSealerPort; readonly keyring: KeyringPort }) {}

  /** @complexity One row read and one AES-GCM open. */
  async get(workspaceId: string): Promise<SavedDatabaseDestination | null> {
    const record = await this.deps.repo.find(workspaceId);
    if (record === null) return null;
    if (record.aadVersion !== DATABASE_DESTINATION_AAD_VERSION) throw new DestinationUnreadableError();
    let connectionString: string;
    try {
      connectionString = await this.deps.sealer.open({ sealed: record.sealed, aad: buildDatabaseDestinationAad({ workspaceId }) });
    } catch {
      // The sealer's own error may describe the key; it is replaced, never passed on.
      throw new DestinationUnreadableError();
    }
    return { connectionString, tokenHint: credentialTokenHint({ token: connectionString }), description: record.description, savedAt: record.savedAt };
  }

  /** @complexity One AES-GCM seal and one upsert. */
  async save(workspaceId: string, destination: SavedDatabaseDestination): Promise<void> {
    if (destination.connectionString === '' && await this.deps.repo.find(workspaceId)) return;
    const connectionString = normalizeCredentialToken({ value: destination.connectionString, field: "address", hosted: false });
    const key = await this.deps.keyring.activeKey();
    const sealed = await this.deps.sealer.seal({ plaintext: connectionString, key, aad: buildDatabaseDestinationAad({ workspaceId }) });
    await this.deps.repo.upsert({ workspaceId, description: destination.description, sealed, aadVersion: DATABASE_DESTINATION_AAD_VERSION, savedAt: destination.savedAt, lastRunJson: null });
  }

  async lastRun(workspaceId: string): Promise<DatabaseTransferRunSummary | null> {
    const json = (await this.deps.repo.find(workspaceId))?.lastRunJson ?? null;
    return json === null ? null : (JSON.parse(json) as DatabaseTransferRunSummary);
  }

  async recordRun(workspaceId: string, summary: DatabaseTransferRunSummary): Promise<void> {
    await this.deps.repo.setLastRun(workspaceId, JSON.stringify(summary));
  }
}

/** The process-wide fallback for compositions without a database; the live server passes a sealed store. */
export const databaseDestinationStore: DatabaseDestinationStorePort = new InMemoryDatabaseDestinationStore();
