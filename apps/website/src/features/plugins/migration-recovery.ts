import { recoverIncompleteDataModuleMigrations as recover, restoreSqliteSnapshots as restore, type RecoveryResult, type JournalEntry } from "@jini-ai/db/data-modules";
export type { RecoveryResult } from "@jini-ai/db/data-modules";

export function recoverIncompleteDataModuleMigrations(required: Parameters<typeof recover>[0]): Promise<RecoveryResult> { return recover(required); }
export function restoreSqliteSnapshots({ dbPath, entries }: { dbPath: string; entries: readonly JournalEntry[] }, _optional = {}): void { restore({ dbPath, entries }); }
