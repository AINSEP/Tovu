import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
function resolveDestinationMode(filePath: string): number {
  try {
    return fs.statSync(filePath).mode & 0o777;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return 0o600;
  }
}

/**
 * Write `content` to `filePath`, atomically: write to a temp file in the SAME directory (so
 * `renameSync` stays on one filesystem, where POSIX rename is atomic), then rename it over
 * `filePath` in one step. The shared primitive {@link writeJsonFileAtomic} and
 * `active-site.ts`'s `.env` upsert both build on — introduced 2026-09-04 (sites-switcher
 * decision) when a second atomic-write caller needed the identical temp-file+rename discipline
 * for plain text rather than JSON.
 *
 * The temp file (and so `filePath`) is given {@link resolveDestinationMode}'s mode: `filePath`'s
 * own existing mode when it already exists, `0600` for a brand-new path — never the loose
 * `0666 & ~umask` `fs.writeFileSync` would otherwise pick (2026-09-05 site-dir env perms audit,
 * F1). The mode is set via an explicit `fs.chmodSync`, not only `writeFileSync`'s own `mode`
 * option, because that option is itself still subject to umask masking and cannot be relied on
 * to reproduce an exact preserved mode.
 *
 * @param filePath - absolute path of the file to (over)write.
 * @param content - raw file content.
 * @throws whatever the underlying `fs` call throws (e.g. `EACCES` when the containing directory
 *   cannot accept a new temp-file entry) — callers rely on this surfacing BEFORE any rename, so a
 *   blocked write never partially updates `filePath` (INV-04). `resolveDestinationMode` runs
 *   first and shares this same contract: its own non-`ENOENT` failures also surface before any
 *   write is attempted.
 * @complexity O(1) — one payload, three fs syscalls (stat + write + rename), plus a chmod.
 * @overallScore 100
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const mode = resolveDestinationMode(filePath);
  fs.writeFileSync(tempPath, content, { mode });
  fs.chmodSync(tempPath, mode);
  fs.renameSync(tempPath, filePath);
}

/**
 * Write `data` as pretty-printed JSON to `filePath`, atomically — see {@link writeFileAtomic},
 * which this now delegates to (behavior unchanged: same temp-file naming, same two syscalls).
 *
 * @param filePath - absolute path of the JSON file to (over)write.
 * @param data - JSON-serializable value.
 * @throws see {@link writeFileAtomic}.
 * @complexity O(1) — one small JSON payload, two fs syscalls (write + rename).
 * @overallScore 100
 */
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}
