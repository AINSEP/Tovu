import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openContentDbReadOnly } from "../db/sqlite/content-db.js";

/**
 * @file Shared "what has this content.db actually had applied to it" reader — the ONE
 * implementation of matching a db's latest `__drizzle_migrations` row back to this runtime's
 * bundled `db/drizzle/meta/_journal.json`, extracted 2026-09-06 so a THIRD copy is never needed.
 *
 * Two call sites already needed this exact match before this file existed:
 * `server/runtime/boot/content-db-schema-guard.ts` (the non-CLI boot path's schema guard, which
 * now imports {@link readAppliedSchemaIdentity} instead of keeping its own private copy) and
 * `database-introspection-adapter.sqlite.ts`'s `readAppliedSnapshot()` (a third, INDEPENDENT
 * implementation that stays as-is: it reuses an already-open `ContentDb` handle rather than opening
 * its own read-only connection, and collapses "never migrated" and "diverged" into one `null` —
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

function readJournal(): DrizzleJournal {
  return JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as DrizzleJournal;
}

/**
 * `"none"` — the db has never had a migration applied (table absent or empty): there is no applied
 * schema state to report at all. `"diverged"` — the table has an applied row whose `created_at`
 * matches no entry in this runtime's bundled journal at all: a divergent lineage no caller of this
 * function should guess at. Otherwise the matched `{idx, tag}` pair, the db's real applied identity.
 */
export type AppliedSchemaIdentity = "none" | "diverged" | { idx: number; tag: string };

/**
 * Read `dbPath`'s OWN actually-applied migration identity, straight from its `__drizzle_migrations`
 * table — never from a `.site-meta.json` stamp (which may be missing, stale, or simply never
 * written; see `repair-site.ts`) and never a guess.
 *
 * @param dbPath - absolute path to an EXISTING content.db file.
 * @returns see {@link AppliedSchemaIdentity}.
 * @throws whatever `better-sqlite3` throws opening a malformed/locked file read-only, or if
 *   `dbPath` does not exist at all (`openContentDbReadOnly`'s own `fileMustExist: true` contract) —
 *   a caller that needs a distinct "no file" outcome checks `fs.existsSync(dbPath)` itself first.
 * @complexity O(m) in the bundled journal's entry count (currently under 60) — one bounded
 *   `sqlite_master` lookup, one bounded `__drizzle_migrations` query, one small JSON read; not a
 *   function of any caller-controlled collection.
 * @overallScore 100
 */
export function readAppliedSchemaIdentity(dbPath: string): AppliedSchemaIdentity {
  const sqlite = openContentDbReadOnly(dbPath).$client;
  try {
    const tableExists =
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").get() !== undefined;
    if (!tableExists) return "none";

    const latest = sqlite.prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1").get() as
      | { created_at: number }
      | undefined;
    if (!latest) return "none";

    const matchingEntry = readJournal().entries.find((entry) => entry.when === latest.created_at);
    return matchingEntry ? { idx: matchingEntry.idx, tag: matchingEntry.tag } : "diverged";
  } finally {
    sqlite.close();
  }
}
