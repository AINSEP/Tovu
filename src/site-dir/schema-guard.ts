import fs from "node:fs";
import path from "node:path";

import { SiteNewerThanRuntimeError } from "./errors";

/**
 * @file SPEC-003 C-006 — the runtime's bundled-migration identity, and the guard that compares a
 * site's `.site-meta.json` stamp against it.
 *
 * Purpose:
 * `state.spec.md §7`'s "schema version source of truth" is the latest Drizzle migration this
 * runtime bundles under `drizzle/` (read from `drizzle/meta/_journal.json`). This is the ONE
 * implementation of the index+tag comparison RT-005 requires — an index-only comparison would
 * falsely pass two runtime builds that share an index but bundle different migrations (CIC
 * U-002-B1).
 *
 * How it relates to the project:
 * `site-dir/boot-site-dir.ts` calls both exports here as part of BR-05's validation chain.
 *
 * Architectural role:
 * `site-dir` domain logic. Reads exactly one small, already-generated JSON file (no Drizzle
 * import, no db handle) — this module never touches `content.db`.
 */

/** Resolved from this file's own location: `src/infra/drizzle/meta/_journal.json`. */
const JOURNAL_PATH = path.resolve(__dirname, "../infra/drizzle/meta/_journal.json");

interface DrizzleJournal {
  entries: Array<{ idx: number; tag: string }>;
}

export interface RuntimeSchemaVersion {
  /** The latest bundled migration's integer index (ordering) — REQ-05/state.spec.md §7. */
  index: number;
  /** The latest bundled migration's tag/hash (identity) — divergence detection, RT-005. */
  tag: string;
}

/**
 * Read this runtime's bundled-migration identity from the generated Drizzle journal.
 *
 * @returns `{ index, tag }` of the journal's LAST entry (`drizzle-kit generate` appends one
 *   entry per migration, in order — the last entry is always the latest).
 * @complexity O(1) — one small JSON file read; the entries array is not scanned, only indexed
 *   at its last position.
 * @overallScore 100
 */
export function runtimeSchemaVersion(): RuntimeSchemaVersion {
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as DrizzleJournal;
  const latest = journal.entries[journal.entries.length - 1];
  return { index: latest.idx, tag: latest.tag };
}

export interface CompareSchemaVersionRequired {
  schemaVersion: number;
  schemaTag: string;
}

/**
 * Compare a site's `.site-meta.json` stamp to this runtime's bundled-migration identity.
 *
 * @param required.schemaVersion - the site's stamped migration index.
 * @param required.schemaTag - the site's stamped migration tag.
 * @returns `"migrate"` when the site is strictly older (any tag); `"compatible"` when the index
 *   matches AND the tag matches.
 * @throws {SiteNewerThanRuntimeError} when the site's index is strictly greater than the
 *   runtime's (REQ-05(a)), OR when the index is equal but the tag diverges (REQ-05(b), RT-005,
 *   CIC U-002-B1 — "equal index but different tag" is treated identically to "newer", never as
 *   `"compatible"`).
 * @complexity O(1) — reads the runtime identity once via `runtimeSchemaVersion()`, then a
 *   constant number of comparisons; not a function of any caller-controlled collection.
 * @overallScore 100
 */
export function compareSchemaVersion(required: CompareSchemaVersionRequired): "migrate" | "compatible" {
  const { schemaVersion, schemaTag } = required;
  const runtime = runtimeSchemaVersion();

  if (schemaVersion > runtime.index) {
    throw new SiteNewerThanRuntimeError(
      `site schema (v${schemaVersion}) is newer than this runtime supports (v${runtime.index}) — upgrade tovu`
    );
  }
  if (schemaVersion === runtime.index) {
    if (schemaTag !== runtime.tag) {
      throw new SiteNewerThanRuntimeError(
        `site schema index (v${schemaVersion}) matches this runtime, but its schemaTag ("${schemaTag}") diverges from the runtime's ("${runtime.tag}") — divergent lineage, refusing rather than guessing`
      );
    }
    return "compatible";
  }
  return "migrate";
}
