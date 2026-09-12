/**
 * @file Filesystem-reading/writing helpers `scripts/stage-payload.mjs` uses to walk source trees,
 * resolve Jini's pnpm-hoisted transitive dependencies, and verify the staged tree is complete —
 * extracted for the same reason `shell-staleness.js` was: `stage-payload.mjs` itself runs its
 * entire staging pipeline (real `rmSync`/`cpSync` against the live repo) the moment it is
 * imported, so nothing defined inside it can be exercised by a test that imports the script
 * directly. **This module has no import-time side effects at all** — importing it does nothing to
 * the filesystem; every effectful function here only acts when called, with paths the caller
 * supplies.
 *
 * `stageTransitiveDependencies` and `assertClosureComplete` (added in later commits) take `outDir`
 * as an explicit parameter rather than closing over `scripts/stage-payload.mjs`'s module-level
 * constant of the same name, so a test can point them at a throwaway `fs.mkdtempSync` directory
 * instead of the real `staging/tovu-payload` tree.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { isBundleInput } from "./shell-staleness.js";

/** Whether to descend into / consider one directory entry at all.
 *  @complexity O(1). */
function isWalkable(entry) {
  if (entry.name === "node_modules" || entry.name.startsWith(".")) return false;
  return isBundleInput(entry.isDirectory() ? `${entry.name}/` : entry.name);
}

/** Newest mtime under a directory tree, or 0 if it does not exist.
 *  @complexity O(n) in files walked. */
export function newestMtime(abs) {
  if (!existsSync(abs)) return 0;
  const stat = statSync(abs);
  if (!stat.isDirectory()) return isBundleInput(abs) ? stat.mtimeMs : 0;
  let newest = 0;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (isWalkable(entry)) newest = Math.max(newest, newestMtime(path.join(abs, entry.name)));
  }
  return newest;
}
