/**
 * @file Real bindings for the compaction-recovery flow's filesystem, journal, SQLite admission, integrity
 * check and migration-ledger ports. The lease (`claim`, needing the serving lease's `isHeld`) and the
 * per-database marker store are bound by the caller: they belong to the stopped-site compaction wiring.
 */
import { constants as fsConstants, createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { assertDatabaseStopped, inspectStoppedDatabase } from "#src/platform/db/kernel/stopped-database";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { CHAT_LEDGER_TABLE, CHAT_MIGRATIONS, CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { LEDGER_TABLE } from "#src/platform/db/migrations/runner";
import type { CompactionDatabaseName, LedgerRead, ResolveCompactionAttentionRequired, RestoreFs, RestoreJournal, RestoreJournalEntry } from "./compaction-recovery.types.js";

const LINK_UNSUPPORTED = new Set(["EPERM", "ENOTSUP", "EXDEV", "EOPNOTSUPP"]);
const codeOf = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;

async function fsyncPath(file: string): Promise<void> {
  const handle = await fs.open(file, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

/** The node `fs/promises` binding of `RestoreFs`. */
export const nodeRestoreFs: RestoreFs = {
  async lstatKind(file) {
    try {
      const stat = await fs.lstat(file);
      return stat.isSymbolicLink() ? "symlink" : stat.isFile() ? "file" : "other";
    } catch (error) {
      if (codeOf(error) === "ENOENT") return "missing";
      throw error;
    }
  },
  exists: (file) => fs.lstat(file).then(() => true, (error: unknown) => { if (codeOf(error) === "ENOENT") return false; throw error; }),
  size: async (file) => (await fs.stat(file)).size,
  freeBytes: async (directory) => { const stat = await fs.statfs(directory); return stat.bavail * stat.bsize; },
  identity: async (file) => { const stat = await fs.stat(file); return `${stat.dev}:${stat.ino}`; },
  sha256: (file) => new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("error", reject).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex")));
  }),
  async copyExclusive(from, to) {
    await fs.copyFile(from, to, fsConstants.COPYFILE_EXCL);
    await fsyncPath(to);
  },
  async link(existing, alias) {
    try {
      await fs.link(existing, alias);
      await fsyncPath(path.dirname(alias));
      return "linked";
    } catch (error) {
      if (LINK_UNSUPPORTED.has(codeOf(error) ?? "")) return "unsupported";
      throw error;
    }
  },
  async renameAtomic(from, to) {
    await fs.rename(from, to);
    await fsyncPath(path.dirname(to));
  },
  async removeOwn(file) {
    // `unlink` removes a symlink itself, never its target.
    await fs.unlink(file).catch((error: unknown) => { if (codeOf(error) !== "ENOENT") throw error; });
  },
};

type JournalFile = { v: 1; entries: Partial<Record<CompactionDatabaseName, RestoreJournalEntry>> };
const EMPTY_JOURNAL: JournalFile = { v: 1, entries: {} };

async function readJournalFile(file: string): Promise<JournalFile | "damaged"> {
  let text: string;
  try { text = await fs.readFile(file, "utf8"); } catch (error) { if (codeOf(error) === "ENOENT") return EMPTY_JOURNAL; throw error; }
  try {
    const parsed = JSON.parse(text) as Partial<JournalFile>;
    return parsed.v === 1 && typeof parsed.entries === "object" && parsed.entries !== null ? parsed as JournalFile : "damaged";
  } catch { return "damaged"; }
}

/** temp → fsync → rename → fsync dir, so a crash leaves either the old or the new record, never half of one. */
async function writeJournalFile(file: string, record: JournalFile): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, JSON.stringify(record));
  await fsyncPath(temp);
  await fs.rename(temp, file);
  await fsyncPath(path.dirname(file));
}

/** `<site>/ops/compaction-restore.json`, holding one entry per database. */
export function siteRestoreJournal({ dir, database }: { dir: string; database: CompactionDatabaseName }, _optional: Record<string, never> = {}): RestoreJournal {
  const file = path.join(dir, "ops", "compaction-restore.json");
  const update = async (entry: RestoreJournalEntry | undefined): Promise<void> => {
    const current = await readJournalFile(file);
    if (current === "damaged") throw new Error(`The restore record ${file} is damaged; it needs a person before anything else is written.`);
    const entries = { ...current.entries };
    if (entry === undefined) delete entries[database]; else entries[database] = entry;
    await writeJournalFile(file, { v: 1, entries });
  };
  return {
    async read() { const current = await readJournalFile(file); return current === "damaged" ? current : current.entries[database]; },
    write: (entry) => update(entry),
    clear: () => update(undefined),
  };
}

/** Ledger rows `{ id, checksum }` ordered by `applied_at, id`; any read error is "unreadable", which refuses. */
function readLedgerAt({ path: file, table }: { path: string; table: string }): LedgerRead {
  try {
    const db = openNativeSqlite(file, { readonly: true, fileMustExist: true });
    try {
      const rows = db.prepare(`SELECT id, checksum FROM "${table}" ORDER BY applied_at, id`).all() as { id: unknown; checksum: unknown }[];
      if (!rows.every((row) => typeof row.id === "string" && typeof row.checksum === "string")) return { kind: "unreadable" };
      return { kind: "ok", steps: rows.map((row) => ({ id: row.id as string, checksum: row.checksum as string })) };
    } finally { db.close(); }
  } catch { return { kind: "unreadable" }; }
}

const LEDGERS: Record<CompactionDatabaseName, { table: string; steps: readonly { id: string }[] }> = {
  content: { table: LEDGER_TABLE, steps: CONTENT_MIGRATIONS },
  chat: { table: CHAT_LEDGER_TABLE, steps: CHAT_MIGRATIONS },
};

/** The SQLite and ledger ports for one database. */
export function compactionRecoverySqlitePorts(
  { database }: { database: CompactionDatabaseName },
  _optional: Record<string, never> = {},
): Pick<ResolveCompactionAttentionRequired, "admitStopped" | "inspect" | "readLedger" | "isKnownStep"> {
  const ledger = LEDGERS[database];
  const known = new Set(ledger.steps.map((step) => step.id));
  return {
    admitStopped: ({ path: file }) => {
      try { assertDatabaseStopped({ path: file }); return "stopped"; } catch (error) {
        if (error instanceof Error && error.message.startsWith("Database is open in another process")) return "busy";
        throw error;
      }
    },
    inspect: ({ path: file }) => { try { inspectStoppedDatabase({ path: file }); return "ok"; } catch { return "failed"; } },
    readLedger: ({ path: file }) => readLedgerAt({ path: file, table: ledger.table }),
    isKnownStep: ({ id }) => known.has(id),
  };
}
