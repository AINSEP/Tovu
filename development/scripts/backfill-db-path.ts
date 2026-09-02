/**
 * @file The one place the AAD backfill scripts turn a `--db` argument into a database they are
 * willing to open.
 *
 * ## Why this exists
 *
 * All five scripts defaulted to `<repo>/infra/content.db`. There is no `infra/` directory in this
 * repository, and `openContentDb` creates-and-migrates on open. So running any of them without
 * `--db` built a brand-new empty database at that path, found zero rows in it, and printed
 * "0 row(s) would be migrated" — a security-remediation script reporting a clean all-clear about
 * data it had never read. A script that fails is strictly better than one that manufactures a
 * false negative, so this refuses to proceed rather than creating anything.
 *
 * Kept as a single shared function rather than five copied existence checks: the resolution rule
 * is one behaviour, and a later change to it (a config-file default, an env var, a Postgres URL)
 * should be one edit, not five.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * The exact operator-facing text for an unusable database path. Exported so tests assert on the
 * real string rather than a paraphrase of it.
 */
export function missingDbPathMessage(resolvedPath: string): string {
  return (
    `content database not found at ${resolvedPath} — refusing to create one. ` +
    `An empty database would report zero rows to migrate and look like success. ` +
    `Pass --db pointing at the real site database (e.g. sites/<site>/content.db).`
  );
}

/**
 * Resolves `dbPath` to an absolute path, and proves a regular file is already there.
 *
 * @param dbPath Path as supplied on the command line (absolute or relative to the process cwd).
 * @returns The resolved absolute path, safe to hand to `openContentDb`.
 * @throws `Error(missingDbPathMessage(resolved))` when nothing exists at the path, or when it is
 *   not a regular file (a directory would fail later, deeper, and less clearly).
 * @complexity O(1) — one `statSync`.
 */
export function resolveExistingDbPath(dbPath: string): string {
  const resolved = path.resolve(dbPath);
  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch {
    throw new Error(missingDbPathMessage(resolved));
  }
  if (!stats.isFile()) {
    throw new Error(missingDbPathMessage(resolved));
  }
  return resolved;
}
