import fs from "node:fs";
import path from "node:path";

/**
 * @file SPEC-003 CIC U-004-B1 — path-containment resolution shared by `init-site.ts` and
 * `boot-site-dir.ts` (and re-used by `cli/commands/serve.ts`, which needs the SAME resolved
 * target to compute `content.db`'s path for `createSqliteRouteDeps`'s `dbPath` parameter,
 * consistent with whatever real destination `bootSiteDir` itself resolved and wrote to).
 *
 * Purpose:
 * Resolve a caller-supplied `dir` argument to the ONE real target path every subsequent fs
 * operation must derive from — never re-derived from the raw, unresolved argument (INV-01).
 * Handles the three cases the CIC's test suite exercises:
 *   1. An ordinary path (existing or not, and NOT itself a symlink) — `path.resolve` collapses
 *      any embedded `..` segments purely lexically, with no filesystem access needed. Returned
 *      as-is, deliberately WITHOUT canonicalizing every ancestor segment (`fs.realpathSync` on
 *      the whole path would also resolve unrelated, pre-existing OS-level symlinks the caller
 *      never named — e.g. macOS aliases `/var` to `/private/var` — which would silently change
 *      an already-unambiguous, non-symlinked target path for no containment benefit).
 *   2. `dirArg` itself IS an existing symlink whose destination already exists — `fs.realpathSync`
 *      is authoritative here and handles nested symlinks / relative link targets in one call.
 *   3. `dirArg` itself IS an existing symlink whose destination does NOT exist yet (e.g. a
 *      dangling symlink at an `init` target) — `fs.realpathSync` cannot resolve this (it requires
 *      the final path to exist), so this falls back to one `readlinkSync` level, which is enough
 *      for the "symlink at the target" shape this feature's containment guarantee covers.
 *
 * Architectural role:
 * `site-dir` internal utility — no exported contract in the Implementation Outline's Contract
 * Map. Exported for reuse by `cli` (an allowed dependency direction: `cli` -> `site-dir`, never
 * the reverse — INV-06, dependency-cruiser's `site-dir-no-server-express-or-cli-imports` rule).
 */

/**
 * Resolve `dirArg` to the real target path every subsequent write must be derived from.
 *
 * @complexity O(1) — at most one `lstatSync` plus one `realpathSync`/`readlinkSync` call, plus a
 *   constant number of `path` operations; not a function of any caller-controlled collection.
 * @overallScore 100
 */
export function resolveInstallDirTarget(dirArg: string): string {
  const lexicallyResolved = path.resolve(dirArg);

  let lst: fs.Stats;
  try {
    lst = fs.lstatSync(lexicallyResolved);
  } catch {
    // Doesn't exist at all — the common `init` case. Nothing to resolve beyond the lexical form.
    return lexicallyResolved;
  }

  if (!lst.isSymbolicLink()) {
    // An ordinary existing file/dir — return as-is, without canonicalizing unrelated ancestor
    // symlinks (see file header).
    return lexicallyResolved;
  }

  try {
    // The target IS a symlink whose destination exists — resolve it fully and authoritatively.
    return fs.realpathSync(lexicallyResolved);
  } catch {
    // A dangling symlink — its destination doesn't exist yet. Follow the link one level instead
    // of requiring the destination to already exist.
    const linkTarget = fs.readlinkSync(lexicallyResolved);
    return path.isAbsolute(linkTarget) ? linkTarget : path.resolve(path.dirname(lexicallyResolved), linkTarget);
  }
}
