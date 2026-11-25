/**
 * @file Types for the owner's decision on a database whose compaction rewrite failed its check
 * (`needs-attention`): put the pre-compaction recovery copy back (`restore-copy`), or keep the current
 * file after a fresh integrity check (`keep-current`). Staged and disabled until compaction is cleared
 * for use (G1–G3): only the storage CLI may import the flow, and nothing schedules it.
 */
import type { SqliteCompactionMarker } from "@jini-ai/core/contracts/storage";

export type CompactionDatabaseName = "content" | "chat";

/** What the owner saw and confirmed. Every field is re-checked; any mismatch is refused as "stale". */
export interface RestoreConfirmation {
  readonly action: "restore-copy" | "keep-current";
  readonly database: CompactionDatabaseName;
  /** `marker.at` shown on the card. */
  readonly markerAt: number;
  /** `marker.recoveryCopyPath` shown on the card. */
  readonly recoveryCopyPath: string;
  /** `fs.identity(main)` when the card was built. */
  readonly mainIdentity: string;
}

/** One applied migration row, as read from the ledger of a stopped file. */
export interface AppliedStep { readonly id: string; readonly checksum: string }

export type LedgerRead = { readonly kind: "ok"; readonly steps: readonly AppliedStep[] } | { readonly kind: "unreadable" };

export type RestoreJournalStep = "staging" | "staged" | "preserved" | "published";

/** The write-ahead record of one restore: written durably BEFORE each irreversible filesystem step. */
export interface RestoreJournalEntry {
  readonly v: 1;
  readonly database: CompactionDatabaseName;
  readonly step: RestoreJournalStep;
  readonly mainPath: string;
  readonly stagedPath: string;
  readonly preservedPath: string;
  readonly recoveryCopyPath: string;
  /** SHA-256 of the recovery copy. */
  readonly sha256: string;
  /** SHA-256 of `JSON.stringify(steps)` of the recovery copy's ledger. */
  readonly ledgerDigest: string;
  /** identity(main) before publish. */
  readonly oldMainIdentity: string;
  /** identity(staged) once staged and flushed; null before. */
  readonly stagedIdentity: string | null;
  readonly at: number;
}

export type RestoreRefusal =
  | "stale" | "running" | "busy" | "not-needs-attention" | "copy-missing" | "copy-not-whole"
  | "schema-unknown" | "low-disk" | "verify-failed" | "publish-verify-failed" | "journal-pending";

export type RestoreOutcome =
  | { readonly status: "restored"; readonly preservedPath: string; readonly recoveryCopyPath: string; readonly message: string }
  | { readonly status: "kept-current"; readonly message: string }
  | { readonly status: "refused"; readonly reason: RestoreRefusal; readonly message: string };

/** Filesystem effects, all injected. The real binding is `compaction-recovery-ports.ts`. */
export interface RestoreFs {
  lstatKind(path: string): Promise<"file" | "symlink" | "other" | "missing">;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  freeBytes(directory: string): Promise<number>;
  /** `${dev}:${ino}` */
  identity(path: string): Promise<string>;
  /** Streaming, O(bytes). */
  sha256(path: string): Promise<string>;
  /** COPYFILE_EXCL, then fsync(to). */
  copyExclusive(from: string, to: string): Promise<void>;
  /** EPERM/ENOTSUP/EXDEV answer "unsupported". */
  link(existing: string, alias: string): Promise<"linked" | "unsupported">;
  /** rename, then fsync(dirname(to)). */
  renameAtomic(from: string, to: string): Promise<void>;
  /** ENOENT is fine; never follows symlinks. Only for files this flow itself created. */
  removeOwn(path: string): Promise<void>;
}

export interface RestoreJournal {
  read(): Promise<RestoreJournalEntry | undefined | "damaged">;
  /** temp → fsync → rename → fsync dir */
  write(entry: RestoreJournalEntry): Promise<void>;
  /** Writes the empty versioned record. */
  clear(): Promise<void>;
}

/** The per-database compaction marker store, read plus clear. */
export interface RecoveryMarkerStore {
  read(): Promise<SqliteCompactionMarker | undefined>;
  clear(): Promise<void>;
}

/** The site's running lease, claimed for maintenance; `attached` is the serving record when a site already runs. */
export interface MaintenanceLease { readonly attached: object | null; readonly isHeld: () => boolean; readonly release: () => void }

export interface ResolveCompactionAttentionRequired {
  /** The site folder. */
  readonly dir: string;
  /** The resolved live database file. */
  readonly mainPath: string;
  readonly confirmation: RestoreConfirmation;
  readonly claim: (required: { dir: string; purpose: "maintenance" }) => MaintenanceLease;
  readonly marker: RecoveryMarkerStore;
  readonly journal: RestoreJournal;
  readonly fs: RestoreFs;
  /** `assertSqliteStopped`; SQLITE_BUSY answers "busy". */
  readonly admitStopped: (required: { path: string }) => "stopped" | "busy";
  /** `inspectStoppedSqlite`; a throw answers "failed". */
  readonly inspect: (required: { path: string }) => "ok" | "failed";
  readonly readLedger: (required: { path: string }) => LedgerRead;
  /** The migration step ids this binary knows. */
  readonly isKnownStep: (required: { id: string }) => boolean;
  /** `processCopyCoordinator.holdCopy`, so no pruner removes the copy mid-read. */
  readonly holdCopy: <T>(required: { path: string; work: () => Promise<T> }) => Promise<T>;
  readonly now: () => number;
}

export type ResumeCompactionRestoreRequired = Omit<ResolveCompactionAttentionRequired, "confirmation"> & { readonly database: CompactionDatabaseName };

/** One file the owner may delete through the approval card. */
export interface LeftoverItem {
  readonly path: string;
  readonly kind: "preserved-failed-main" | "recovery-copy";
  readonly identity: string;
  readonly bytes: number;
}

/** The approval-card token: exactly what the owner saw. */
export interface DiscardConfirmation {
  readonly paths: readonly string[];
  readonly identities: readonly string[];
  readonly markerState: SqliteCompactionMarker["state"] | "none";
}

export type DiscardOutcome =
  | { readonly status: "discarded"; readonly paths: readonly string[]; readonly message: string }
  | { readonly status: "refused"; readonly reason: "stale" | "running" | "needs-attention"; readonly message: string };
