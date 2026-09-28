import type { TargetDescription } from "./postgres-target.js";

/**
 * @file Where a site's database copy goes: one saved destination per workspace. The human types the
 * address into `database_transfer_set_destination`'s private form, so the connection string (and its
 * password) never passes through the model. Tools read it from here and only ever return its
 * {@link TargetDescription}.
 *
 * The port exists so a sealed, persistent adapter (the `SecretSealerPort` pattern the other
 * credential stores use) can replace {@link InMemoryDatabaseDestinationStore} without touching the
 * tools. Until then a server restart forgets the destination, and the assistant asks for it again.
 */

export interface SavedDatabaseDestination {
  readonly connectionString: string;
  readonly description: TargetDescription;
  readonly savedAt: string;
}

/** What `database_transfer_status` reports about the last run. Never row data, never the address. */
export type DatabaseTransferRunSummary =
  | { readonly copied: true; readonly snapshotAt: string; readonly tableCount: number; readonly rowCount: number }
  | { readonly copied: false; readonly snapshotAt: string; readonly code: string; readonly message: string };

export interface DatabaseDestinationStorePort {
  get(workspaceId: string): SavedDatabaseDestination | null;
  /** Replaces any earlier destination for the workspace. */
  save(workspaceId: string, destination: SavedDatabaseDestination): void;
  lastRun(workspaceId: string): DatabaseTransferRunSummary | null;
  recordRun(workspaceId: string, summary: DatabaseTransferRunSummary): void;
}

export class InMemoryDatabaseDestinationStore implements DatabaseDestinationStorePort {
  private readonly destinations = new Map<string, SavedDatabaseDestination>();
  private readonly runs = new Map<string, DatabaseTransferRunSummary>();

  get(workspaceId: string): SavedDatabaseDestination | null {
    return this.destinations.get(workspaceId) ?? null;
  }

  save(workspaceId: string, destination: SavedDatabaseDestination): void {
    this.destinations.set(workspaceId, destination);
  }

  lastRun(workspaceId: string): DatabaseTransferRunSummary | null {
    return this.runs.get(workspaceId) ?? null;
  }

  recordRun(workspaceId: string, summary: DatabaseTransferRunSummary): void {
    this.runs.set(workspaceId, summary);
  }
}

/** The process-wide default; tests pass their own. */
export const databaseDestinationStore: DatabaseDestinationStorePort = new InMemoryDatabaseDestinationStore();
