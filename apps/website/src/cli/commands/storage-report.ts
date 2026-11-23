import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { measureSiteStorage, type SiteStorageLocationCategory, type SiteStoragePath, type SiteStorageReport } from "#src/features/storage/measure";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { resolveInstallDirTarget } from "#src/platform/site-dir/resolve-install-dir-target";
import { MIGRATION_BACKUP_PREFIX } from "#src/platform/db/sqlite/content-db";
import { mediaUploadsDir, pluginsInstallDir, siteThemesDir } from "#src/server/runtime/composition/site-paths";

/**
 * @file `tovu storage report <dir> [--json]` (P11 ST-16, report half). Measures one website folder
 * without booting it: no database is opened (so nothing migrates), no running lease is claimed, no
 * registry identity is reserved and no folder is created — the share folder is derived, never made.
 * That is why it is safe beside a running site. `clean` and `compact` arrive with ST-6 / ST-7b.
 */

/** A database the site keeps outside its own folder (app-data placement): sized, not walked. */
export interface ElsewhereDatabase {
  readonly category: "content-database" | "chat-database";
  readonly path: string;
  readonly mainBytes: number;
  readonly walBytes: number;
  readonly shmBytes: number;
}
export type StorageReportResult = SiteStorageReport & { readonly elsewhere: readonly ElsewhereDatabase[] };
type DatabasePaths = { contentDbPath: string; chatDbPath: string };

export interface RunStorageReportInput {
  dir: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
  write?: (required: { line: string }, optional?: Record<string, never>) => void;
  /** Injected for tests; defaults to the site's real layout with identity reservation OFF (read-only). */
  resolveDatabases?: (required: { dir: string }) => DatabasePaths;
}

const CLASS_LABELS = { automatic: "Cleaned automatically", yours: "Yours", "report-only": "Shown only" } as const;

/**
 * Every location the report walks inside `siteDir`, plus the databases stored elsewhere.
 * @param _optional.env the same `TOVU_*_DIR` overrides the server reads (default `process.env`).
 * @complexity O(entries in the database's `ops/` folder), one directory read.
 */
export function resolveSiteStorageLocations(
  required: { siteDir: string } & DatabasePaths,
  _optional: { env?: NodeJS.ProcessEnv } = {},
): { paths: SiteStoragePath[]; elsewhere: ElsewhereDatabase[] } {
  const { siteDir } = required;
  const env = _optional.env ?? process.env;
  const opsDir = path.join(path.dirname(required.contentDbPath), "ops");
  const candidates: SiteStoragePath[] = [
    { category: "content-database", path: required.contentDbPath },
    { category: "chat-database", path: required.chatDbPath },
    { category: "uploads", path: mediaUploadsDir({ siteDir, env }) },
    { category: "themes", path: siteThemesDir({ siteDir, env }) },
    { category: "plugins", path: pluginsInstallDir({ siteDir }, { env }) },
    { category: "screenshots", path: path.join(siteDir, ".captures") },
    // Derived like resolveShareDirectory, which would also create the folder; a report must not.
    { category: "shares", path: path.join(opsDir, "shares") },
    { category: "logs", path: path.join(siteDir, "ops", "logs") },
    ...preMigrationCopies({ opsDir }),
  ];
  const inside = (target: string) => { const relative = path.relative(siteDir, target); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); };
  return {
    paths: candidates.filter(entry => inside(path.resolve(entry.path))).map(entry => ({ ...entry, path: path.resolve(entry.path) })),
    elsewhere: candidates.filter(entry => isDatabase(entry.category) && !inside(path.resolve(entry.path)))
      .map(entry => sizeDatabase({ category: entry.category as ElsewhereDatabase["category"], file: path.resolve(entry.path) })),
  };
}

function isDatabase(category: SiteStorageLocationCategory): boolean {
  return category === "content-database" || category === "chat-database";
}

function preMigrationCopies({ opsDir }: { opsDir: string }): SiteStoragePath[] {
  let names: string[];
  try { names = readdirSync(opsDir); } catch { return []; }
  return names.filter(name => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db"))
    .map(name => ({ category: "pre-migration-copies" as const, path: path.join(opsDir, name) }));
}

function sizeDatabase({ category, file }: { category: ElsewhereDatabase["category"]; file: string }): ElsewhereDatabase {
  const size = (target: string) => { try { return statSync(target).size; } catch { return 0; } };
  return { category, path: file, mainBytes: size(file), walBytes: size(`${file}-wal`), shmBytes: size(`${file}-shm`) };
}

const megabytes = (bytes: number | null) => (bytes === null ? "unknown" : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

function plainLines({ report }: { report: StorageReportResult }): string[] {
  const lines = [`Storage for ${report.siteDir}: ${megabytes(report.totalBytes)}`];
  for (const [cls, label] of Object.entries(CLASS_LABELS) as Array<[keyof typeof CLASS_LABELS, string]>) lines.push(`  ${label}: ${megabytes(report.classes[cls].bytes)}`);
  for (const db of report.elsewhere) lines.push(`  ${db.category} kept outside this folder at ${db.path}: ${megabytes(db.mainBytes + db.walBytes + db.shmBytes)}`);
  if (report.unknownPaths.length > 0) lines.push(`  Could not read ${report.unknownPaths.length} location(s); their sizes are shown as unknown.`);
  return lines;
}

/**
 * @throws {ValidationError} when `dir` is not a website folder (from `resolveInstallDirTarget`).
 * @complexity one walk of the website folder.
 */
export async function runStorageReportCommand(input: RunStorageReportInput): Promise<StorageReportResult> {
  const siteDir = resolveInstallDirTarget({ dirArg: input.dir });
  // Default ports are wired here, at the command's composition edge; tests inject their own.
  const {
    write = ({ line }) => { process.stdout.write(`${line}\n`); },
    resolveDatabases = ({ dir }) => resolveSiteDatabasePaths({ dir }, { reserveIdentity: false }),
  } = input;
  const locations = resolveSiteStorageLocations({ siteDir, ...resolveDatabases({ dir: siteDir }) }, { env: input.env });
  const report: StorageReportResult = { ...await measureSiteStorage({ siteDir, paths: locations.paths }), elsewhere: locations.elsewhere };
  if (input.json) write({ line: JSON.stringify(report) });
  else for (const line of plainLines({ report })) write({ line });
  return report;
}
