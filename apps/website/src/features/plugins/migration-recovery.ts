import { recoverIncompleteDataModuleMigrations as recover, restoreSqliteSnapshots as restore, type RecoveryResult, type JournalEntry } from "@jini-ai/db/data-modules";
export type { RecoveryResult } from "@jini-ai/db/data-modules";

export function recoverIncompleteDataModuleMigrations(required: Parameters<typeof recover>[0]): Promise<RecoveryResult> { return recover(required); }
export function restoreSqliteSnapshots(dbPath: string, entries: readonly JournalEntry[]): void { restore({ dbPath, entries }); }
