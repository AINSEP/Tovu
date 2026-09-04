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
 */

/**
 * Write `content` to `filePath`, atomically: write to a temp file in the SAME directory (so
 * `renameSync` stays on one filesystem, where POSIX rename is atomic), then rename it over
 * `filePath` in one step. The shared primitive {@link writeJsonFileAtomic} and
 * `active-site.ts`'s `.env` upsert both build on — introduced 2026-09-04 (sites-switcher
 * decision) when a second atomic-write caller needed the identical temp-file+rename discipline
 * for plain text rather than JSON.
 *
 * @param filePath - absolute path of the file to (over)write.
 * @param content - raw file content.
 * @throws whatever the underlying `fs` call throws (e.g. `EACCES` when the containing directory
 *   cannot accept a new temp-file entry) — callers rely on this surfacing BEFORE any rename, so a
 *   blocked write never partially updates `filePath` (INV-04).
 * @complexity O(1) — one payload, two fs syscalls (write + rename).
 * @overallScore 100
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, content);
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
