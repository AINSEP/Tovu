import {
  createNodeAtomicFilesystem,
  writeFileAtomic as writeAtomic,
  writeJsonFileAtomic as writeJsonAtomic,
} from "@jini-ai/platform/fs";
import type { AtomicFilesystemPort, AtomicWriteOptions } from "@jini-ai/platform/fs";

/** Host filesystem seam; Jini owns the complete atomic replacement lifecycle. */
export type SiteAtomicWriteOptions = AtomicWriteOptions & { filesystem?: AtomicFilesystemPort };

/**
 * @file SPEC-003 — shared atomic JSON-write helper for the install-dir domain.
 *
 * Purpose:
 * state.spec.md §7: "Atomicity: JSON files are written via temp-file + rename (best-effort
 * atomic on POSIX)." Used by `init-site.ts` (`.site-meta.json`'s initial write) and
 * `boot-site-dir.ts` (CIC U-002-B2's `schemaVersion`+`schemaTag` stamp rewrite, which must land
 * both fields in one atomic operation, never a torn partial write).
 *
 * Architectural role:
 * `site-dir` internal utility — no exported contract in the Implementation Outline's Contract
 * Map; both callers are within this same module.
 *
 * Permissions (2026-09-05 site-dir env perms audit, F1): the rename target's mode is preserved
 * across an overwrite, and a brand-new file defaults to `0600` — never the loose
 * `0666 & ~umask` `fs.writeFileSync` gives an unmoded write. See {@link writeFileAtomic}'s own doc.
 */

/**
 * The mode `writeFileAtomic` gives its temp file, and therefore `filePath` itself once the rename
 * lands (2026-09-05 site-dir env perms audit, F1): `filePath`'s OWN existing mode when it already
 * exists — an overwrite must never widen (or narrow) an established file's permissions, e.g. a
 * `0600` `.env` must stay `0600` across every `persistActiveSite` upsert — or `0600` when it does
 * not exist yet, since this is a generic writer with callers ranging from `.env` (secrets) to
 * `.site-meta.json` (not secret): it cannot tell which a brand-new path will hold, and owner-only
 * is the safe default in either case (the caller can always chmod loosen afterward; this function
 * choosing loose-by-default and a later caller having to remember to tighten it is the direction
 * that leaks). Any `fs.statSync` failure other than "the file is not there" (e.g. `EACCES` on the
 * containing directory) propagates rather than being read as "doesn't exist" — the same
 * non-swallowing discipline this fix applies to `active-site.ts`'s readers (F2), per INV-04 below.
 *
 * @throws whatever `fs.statSync` throws, except `ENOENT`.
 * @complexity O(1) — one stat syscall.
 */

/**
 * Write `content` to `filePath`, atomically: write to a temp file in the SAME directory (so
 * `renameSync` stays on one filesystem, where POSIX rename is atomic), then rename it over
 * `filePath` in one step. The shared primitive {@link writeJsonFileAtomic} and
 * `active-site.ts`'s `.env` upsert both build on — introduced 2026-09-04 (sites-switcher
 * decision) when a second atomic-write caller needed the identical temp-file+rename discipline
 * for plain text rather than JSON.
 *
 * The temp file (and so `filePath`) is given the existing destination mode: `filePath`'s
 * own existing mode when it already exists, `0600` for a brand-new path — never the loose
 * `0666 & ~umask` `fs.writeFileSync` would otherwise pick (2026-09-05 site-dir env perms audit,
 * F1). The mode is set via an explicit `fs.chmodSync`, not only `writeFileSync`'s own `mode`
 * option, because that option is itself still subject to umask masking and cannot be relied on
 * to reproduce an exact preserved mode.
 *
 * @param required.filePath - absolute path of the file to (over)write.
 * @param required.content - raw file content.
 * @throws whatever the underlying `fs` call throws (e.g. `EACCES` when the containing directory
 *   cannot accept a new temp-file entry) — callers rely on this surfacing BEFORE any rename, so a
 *   blocked write never partially updates `filePath` (INV-04). The owner's destination stat runs
 *   first and shares this same contract: its own non-`ENOENT` failures also surface before any
 *   write is attempted. A directory-flush failure is reported after the replacement
 *   has landed; Jini does not pretend it can safely undo a completed rename.
 * @complexity O(1) — one payload; the owner also flushes bytes and directory metadata.
 * @overallScore 100
 */
export function writeFileAtomic(required: { filePath: string; content: string }, optional: SiteAtomicWriteOptions = {}): void {
  const { filesystem = createNodeAtomicFilesystem({}, {}), ...options } = optional;
  writeAtomic({ ...required, fs: filesystem }, options);
}

/**
 * Write `data` as pretty-printed JSON to `filePath`, atomically — see {@link writeFileAtomic},
 * which this now delegates to (behavior unchanged: same pretty JSON and permission rules; the owner also flushes the replacement).
 *
 * @param required.filePath - absolute path of the JSON file to (over)write.
 * @param required.data - JSON-serializable value.
 * @throws see {@link writeFileAtomic}.
 * @complexity O(1) — one small JSON payload plus the owner's atomic-write syscalls.
 * @overallScore 100
 */
export function writeJsonFileAtomic(required: { filePath: string; data: unknown }, optional: SiteAtomicWriteOptions = {}): void {
  const { filesystem = createNodeAtomicFilesystem({}, {}), ...options } = optional;
  writeJsonAtomic({ ...required, fs: filesystem }, options);
}
