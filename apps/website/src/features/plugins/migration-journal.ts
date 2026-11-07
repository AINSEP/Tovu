import {
  isIncompletePhase as checkPhase, ensureMigrationJournal as ensureJournal,
  findIncompleteJournalEntries as findEntries, journalEntryOf as entryOf,
  type PluginStore, type JournalEntry,
} from "@jini-ai/db/data-modules";
export { beginJournalEntry, stageJournalPhase, advanceJournalPhase, type JournalPhase, type JournalEntry } from "@jini-ai/db/data-modules";

export function isIncompletePhase(phase: string): boolean { return checkPhase({ phase }); }
export function ensureMigrationJournal(store: PluginStore): Promise<void> { return ensureJournal({ store }); }
export function findIncompleteJournalEntries(store: PluginStore): Promise<JournalEntry[]> { return findEntries({ store }); }
export function journalEntryOf(row: Parameters<typeof entryOf>[0]["row"]): JournalEntry { return entryOf({ row }); }
