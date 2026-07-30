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
 * Write `data` as pretty-printed JSON to `filePath`, atomically: write to a temp file in the
 * SAME directory (so `renameSync` stays on one filesystem, where POSIX rename is atomic), then
 * rename it over `filePath` in one step.
 *
 * @param filePath - absolute path of the JSON file to (over)write.
 * @param data - JSON-serializable value.
 * @throws whatever the underlying `fs` call throws (e.g. `EACCES` when the containing directory
 *   cannot accept a new temp-file entry) — the caller (`boot-site-dir.ts`) relies on this
 *   surfacing BEFORE any rename, so a blocked write never partially updates `filePath` (INV-04).
 * @complexity O(1) — one small JSON payload, two fs syscalls (write + rename).
 * @overallScore 100
 */
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}
