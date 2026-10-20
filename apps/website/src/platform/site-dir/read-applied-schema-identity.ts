import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tableExists } from "../db/kernel/dialect.js";
import { openSqliteFileKernel } from "../db/kernel/drivers/sqlite.js";
import type { StorageKernel } from "../db/kernel/port.js";
import { CONTENT_MIGRATIONS } from "../db/migrations/index.js";
import { LEDGER_TABLE } from "../db/migrations/runner.js";

/**
 * @file Shared "what has this content.db actually had applied to it" reader — the ONE
 * implementation of reading the content ledger, falling back to matching a legacy db's latest
 * `__drizzle_migrations` row to the bundled journal. Extracted 2026-09-06 so a THIRD copy is never
 * needed. The file wrapper explicitly retains the legacy identity used by site-meta stamps.
 *
 * Two call sites already needed this exact match before this file existed:
 * `server/runtime/boot/content-db-schema-guard.ts` (the non-CLI boot path's schema guard, which
 * now imports {@link readAppliedSchemaIdentity} instead of keeping its own private copy) and
 * `database-introspection-adapter.sqlite.ts`'s `readAppliedSnapshot()` (a third, INDEPENDENT
 * implementation that stays as-is: it collapses "never migrated" and "diverged" into one `null` —
 * a different contract this module's three-way {@link AppliedSchemaIdentity} deliberately does not
 * share). `repair-site.ts` is the third caller, and the reason this stopped being one guard's
 * private helper: it needs the identical match to derive a trustworthy `.site-meta.json` stamp for
 * a site directory that has none.
 *
 * Architectural role:
 * `site-dir` domain logic (INV-06) — no `express`/`cli` import, so both a `server/runtime/boot/**`
 * caller and a `platform/site-dir/**` caller can depend on it (the allowed dependency-cruiser
 * direction is `server -> site-dir`, never the reverse).
 */

/** Resolved from this file's own location: `src/platform/db/drizzle/meta/_journal.json` — the SAME
 *  file `schema-guard.ts`'s `runtimeSchemaVersion()` reads, but this needs every entry (to match an
 *  arbitrary applied row), not just the last one. */
const JOURNAL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/drizzle/meta/_journal.json");

interface DrizzleJournalEntry {
  idx: number;
  when: number;
  tag: string;
}

interface DrizzleJournal {
  entries: DrizzleJournalEntry[];
}

/**
 * `"none"` — the db has never had a migration applied (table absent or empty): there is no applied
 * schema state to report at all. `"diverged"` — the table has an applied row whose `created_at`
 * matches no entry in this runtime's bundled journal at all: a divergent lineage no caller of this
 * function should guess at. Otherwise the matched `{idx, tag}` pair, the db's real applied identity.
 *
 * On an adopted SQLite or Postgres/PGlite kernel the ledger is `tovu_migrations` (ADR-066):
 * `{idx, tag}` is then the ledger head's position and id in `CONTENT_MIGRATIONS`, and `"diverged"`
 * means the head is an id this runtime does not have.
 */
export type AppliedSchemaIdentity = "none" | "diverged" | { idx: number; tag: string };

interface SchemaLedgers {
  __drizzle_migrations: { created_at: number };
  tovu_migrations: { id: string };
}

async function readContentLedgerIdentity(
  { ledgers, hasContentLedger }: { ledgers: StorageKernel<SchemaLedgers>; hasContentLedger: boolean },
  _options = {},
): Promise<AppliedSchemaIdentity> {
  if (!hasContentLedger) return "none";
  const head = await ledgers.run((db) => db.selectFrom("tovu_migrations").select("id").orderBy("id", "desc").limit(1).executeTakeFirst());
  if (head === undefined) return "none";
  const idx = CONTENT_MIGRATIONS.findIndex((step) => step.id === head.id);
  return idx === -1 ? "diverged" : { idx, tag: head.id };
}

/**
 * Read the kernel's database's OWN actually-applied migration identity, straight from its ledger —
 * never from a `.site-meta.json` stamp (which may be missing, stale, or simply never written; see
 * `repair-site.ts`) and never a guess. Reads only.
 *
 * @param options.identity `current` prefers the content ledger; `legacy-stamp` requests SQLite's
 *   frozen journal identity for existing stamp consumers. Postgres always uses its content ledger.
 * @returns see {@link AppliedSchemaIdentity}.
 * @complexity O(m) in bundled migration entries — bounded catalog lookups,
 *   one bounded ledger query, at most one small JSON read; not a function of any caller-controlled
 *   collection.
 */
export async function readAppliedSchemaIdentity<DB>(
  kernel: StorageKernel<DB>, { identity = "current" }: { identity?: "current" | "legacy-stamp" } = {},
): Promise<AppliedSchemaIdentity> {
  const ledgers = kernel as unknown as StorageKernel<SchemaLedgers>;
  const hasContentLedger = await tableExists(kernel, LEDGER_TABLE);
  if (kernel.dialect === "postgres" || (identity === "current" && hasContentLedger)) {
    return readContentLedgerIdentity({ ledgers, hasContentLedger });
  }

  if (!(await tableExists(kernel, "__drizzle_migrations"))) return "none";
  const latest = await ledgers.run((db) =>
    db.selectFrom("__drizzle_migrations").select("created_at").orderBy("created_at", "desc").limit(1).executeTakeFirst()
  );
  if (latest === undefined) return "none";

  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as DrizzleJournal;
  const matchingEntry = journal.entries.find((entry) => entry.when === Number(latest.created_at));
  return matchingEntry ? { idx: matchingEntry.idx, tag: matchingEntry.tag } : "diverged";
}

/**
 * The SQLite file's legacy stamp identity, on a read-only connection closed before returning.
 * Boot/repair/key-only-meta consumers compare this with runtimeSchemaVersion's frozen Drizzle
 * journal. Keep that compatibility view explicit instead of comparing content-step indexes to
 * journal indexes; callers needing the current content identity use readAppliedSchemaIdentity.
 *
 * @throws whatever `better-sqlite3` throws opening a malformed/locked file read-only, or if
 *   `dbPath` does not exist at all — a caller that needs a distinct "no file" outcome checks
 *   `fs.existsSync(dbPath)` itself first.
 */
export async function readAppliedSchemaIdentityOfFile(dbPath: string): Promise<AppliedSchemaIdentity> {
  const kernel = openSqliteFileKernel(dbPath, { readOnly: true });
  try {
    return await readAppliedSchemaIdentity(kernel, { identity: "legacy-stamp" });
  } finally {
    await kernel.close();
  }
}
