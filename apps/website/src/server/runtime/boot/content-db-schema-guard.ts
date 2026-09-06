import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openContentDbReadOnly } from "../../../platform/db/sqlite/content-db.js";
import { compareSchemaVersion } from "../../../platform/site-dir/schema-guard.js";
import { SiteNewerThanRuntimeError } from "../../../platform/site-dir/errors.js";

/**
 * @file Closes the boot-path gap between `tovu serve` and the non-CLI boot path (`index.ts`, run
 * by both `npm run dev` and `npm start`).
 *
 * `tovu serve` never opens `content.db` at all until `boot-site-dir.ts`'s `bootSiteDir` has
 * already compared the site's persisted `.site-meta.json` stamp against this runtime's bundled
 * migration identity (`schema-guard.ts`'s `compareSchemaVersion`) and thrown
 * `SiteNewerThanRuntimeError` if the site is newer than, or has diverged from, this runtime — see
 * that file's own header for why the check must run BEFORE the db is ever opened. `index.ts`'s
 * boot path has no such stamp file to read (`sites/<name>/` under the default site-root model is
 * not a `tovu init`/`tovu serve <dir>` install directory — no `.site-meta.json` is ever written
 * there), so `deps.ts`'s `createSqliteRouteDeps()` calls `openContentDb()` directly, which
 * unconditionally runs Drizzle's `migrate()` with no schema-version check of any kind first.
 *
 * This module reuses `compareSchemaVersion` itself — the exact same policy `tovu serve` enforces,
 * unchanged — sourcing its `{schemaVersion, schemaTag}` input from the db's OWN
 * `__drizzle_migrations` table instead of a `.site-meta.json` stamp: the latest applied row's
 * `created_at` is matched back to the bundled `db/drizzle/meta/_journal.json` (the same match
 * `database-introspection-adapter.sqlite.ts`'s `readAppliedSnapshot()` already performs for the
 * Database admin tools — confirmed there, empirically, against `drizzle-orm`'s own migrator, that
 * `created_at` is stamped from the journal entry's own `when` epoch-millis value verbatim). A db
 * that has never been migrated (the table is absent or empty) has nothing to compare and is left
 * alone — `openContentDb()`'s own first-boot create+migrate+seed path handles it exactly as before.
 *
 * Architectural role:
 * A boot-time guard, mirroring `production-readiness-gate.ts`'s own shape: this module makes no
 * process-exit decision itself (testable, pure) — the caller (`index.ts`) decides what "refuse"
 * means for that boot path.
 */

export type ContentDbSchemaGuardResult =
  | { status: "no-file" }
  | { status: "unmigrated" }
  | { status: "ok" }
  | { status: "refuse"; message: string };

/** Resolved from this file's own location: `src/platform/db/drizzle/meta/_journal.json` — the
 *  SAME file `schema-guard.ts`'s `runtimeSchemaVersion()` reads, but (like the introspection
 *  adapter) this needs every entry, not just the last one, to match an arbitrary applied row. */
const JOURNAL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../platform/db/drizzle/meta/_journal.json");

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

/** `"none"` — the db has never had a migration applied (table absent or empty): nothing to guard,
 *  `openContentDb()`'s normal migrate path is exactly correct. `"diverged"` — the table has an
 *  applied row whose `created_at` matches no entry in this runtime's bundled journal at all: a
 *  divergent lineage this function refuses to guess at, mirroring `readAppliedSnapshot()`'s own
 *  documented posture. Otherwise the matched `{idx, tag}` pair, ready for `compareSchemaVersion`. */
function readAppliedMigrationIdentity(dbPath: string): "none" | "diverged" | { idx: number; tag: string } {
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

/**
 * Checks whether `dbPath` (an existing content.db this process is ABOUT to open with
 * `openContentDb()`, which migrates unconditionally) is safe to migrate forward, using the exact
 * same version/tag comparison `tovu serve` applies via `compareSchemaVersion` before it ever opens
 * a site's db.
 *
 * @param dbPath - absolute path to the content.db this boot is about to open.
 * @returns `"no-file"` when nothing exists yet at `dbPath` (first boot — `openContentDb()` will
 *   create it); `"unmigrated"` when the file exists but carries no applied-migration history yet
 *   (also safe to proceed); `"ok"` when the db's latest applied migration matches or is behind this
 *   runtime's bundled identity — `compareSchemaVersion`'s own "migrate"/"compatible" distinction is
 *   deliberately collapsed into this one "safe to open" signal, since (unlike `bootSiteDir`) this
 *   guard has no `.site-meta.json` stamp of its own to conditionally rewrite; `"refuse"` (with an
 *   explanatory `message`) when the db is newer than, or has diverged from, this runtime — the
 *   caller decides what to do with that.
 * @throws Only for a genuinely unexpected I/O error opening an EXISTING file read-only (a
 *   corrupt/locked db) — `openContentDb()` would hit the identical failure moments later on its
 *   own read-write open, so letting it propagate here surfaces the same error, just slightly
 *   earlier, rather than masking it as "no-file".
 * @complexity O(m) in the bundled journal's entry count (currently under 60) — one bounded
 *   `sqlite_master` lookup, one bounded `__drizzle_migrations` query, one small JSON read; not a
 *   function of any caller-controlled collection.
 */
export function checkContentDbSchema(dbPath: string): ContentDbSchemaGuardResult {
  if (!fs.existsSync(dbPath)) return { status: "no-file" };

  const applied = readAppliedMigrationIdentity(dbPath);
  if (applied === "none") return { status: "unmigrated" };
  if (applied === "diverged") {
    return {
      status: "refuse",
      message:
        `content.db at ${dbPath} has an applied migration that this runtime's bundled ` +
        `db/drizzle/meta/_journal.json does not recognize at all — refusing to guess at a ` +
        `divergent schema lineage rather than risk corrupting it (the same posture ` +
        `'tovu serve' takes via compareSchemaVersion's RT-005 divergent-tag check).`,
    };
  }

  try {
    compareSchemaVersion({ schemaVersion: applied.idx, schemaTag: applied.tag });
    return { status: "ok" };
  } catch (err) {
    if (err instanceof SiteNewerThanRuntimeError) {
      return { status: "refuse", message: err.message };
    }
    throw err;
  }
}
