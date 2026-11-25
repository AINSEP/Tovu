import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { resolveDirectoryTarget } from "@jini-ai/platform/fs";
import { measureSiteStorage, type SiteStorageLocationCategory, type SiteStoragePath, type SiteStorageReport } from "#src/features/storage/measure";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { MIGRATION_BACKUP_PREFIX } from "#src/platform/db/sqlite/content-db";
import { mediaUploadsDir, pluginsInstallDir, siteThemesDir } from "#src/server/runtime/composition/site-paths";

/**
 * @file `tovu storage report <dir> [--json]` (P11 ST-16, report half). Measures one website folder
 * without booting it. `clean` and `compact` arrive with ST-6 / ST-7b.
 *
 * Why this is safe beside a running site: a running site owns its databases, its running lease and its
 * registry identity, and the report touches none of them. It opens no database (so nothing migrates and
 * no `-wal`/`-shm` appears), claims no lease (so it never contends with, or blocks, the live server),
 * resolves database paths with `reserveIdentity: false` (so the registry is never written) and derives
 * the share folder instead of calling `resolveShareDirectory`, which would create it. Every read is a
 * stat or a directory listing, so the worst a concurrent writer can do is make a number slightly stale.
 */

type DatabasePaths = { contentDbPath: string; chatDbPath: string };
/** Resolves where the site's databases live; called with `reserveIdentity: false`, so it never writes. */
export type StorageReportPaths = (required: { dir: string }, optional: { reserveIdentity: false }) => DatabasePaths;
export type StorageReportMeasure = (required: Parameters<typeof measureSiteStorage>[0]) => Promise<SiteStorageReport>;

/** A database the site keeps outside its own folder (app-data placement): sized, not walked. `null` = unreadable. */
export interface ElsewhereDatabase {
  readonly category: "content-database" | "chat-database";
  readonly path: string;
  readonly mainBytes: number | null;
  readonly walBytes: number | null;
  readonly shmBytes: number | null;
}
/** The report's JSON document (`--json`), which the desktop app reads: the measure plus `elsewhere`. */
export type StorageReportResult = SiteStorageReport & { readonly elsewhere: readonly ElsewhereDatabase[] };

const CLASS_LABELS = { automatic: "Cleaned automatically", yours: "Yours", "report-only": "Shown only" } as const;

/**
 * Every location the report walks inside `siteDir`, plus the databases stored elsewhere.
 * @param optional.env the same `TOVU_*_DIR` overrides the server reads (default: none).
 * @complexity O(entries in the database's `ops/` folder), one directory read.
 */
export function resolveSiteStorageLocations(
  required: { siteDir: string } & DatabasePaths,
  { env = {} }: { env?: NodeJS.ProcessEnv } = {},
): { paths: SiteStoragePath[]; elsewhere: ElsewhereDatabase[] } {
  const { siteDir } = required;
  const opsDir = path.join(path.dirname(required.contentDbPath), "ops");
  const declared: SiteStoragePath[] = [
    { category: "content-database", path: required.contentDbPath },
    { category: "chat-database", path: required.chatDbPath },
    { category: "uploads", path: mediaUploadsDir({ siteDir, env }) },
    { category: "themes", path: siteThemesDir({ siteDir, env }) },
    { category: "plugins", path: pluginsInstallDir({ siteDir }, { env }) },
    { category: "screenshots", path: path.join(siteDir, ".captures") },
    // Derived exactly as resolveShareDirectory derives it; that resolver also creates the folder, a report must not.
    { category: "shares", path: path.join(opsDir, "shares") },
    { category: "logs", path: path.join(siteDir, "ops", "logs") },
    ...preMigrationCopies({ opsDir }),
  ];
  const candidates = declared.map(entry => ({ ...entry, path: path.resolve(entry.path) }));
  const inside = (target: string) => { const relative = path.relative(siteDir, target); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); };
  return {
    paths: candidates.filter(entry => inside(entry.path)),
    elsewhere: candidates.filter(entry => isDatabase(entry.category) && !inside(entry.path))
      .map(entry => sizeDatabase({ category: entry.category as ElsewhereDatabase["category"], file: entry.path })),
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

/** A missing sidecar is 0 bytes; any other failure is unknown (`null`), never a smaller number. */
function fileSize({ target }: { target: string }): number | null {
  try { return statSync(target).size; } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? 0 : null; }
}

function sizeDatabase({ category, file }: { category: ElsewhereDatabase["category"]; file: string }): ElsewhereDatabase {
  return { category, path: file, mainBytes: fileSize({ target: file }), walBytes: fileSize({ target: `${file}-wal` }), shmBytes: fileSize({ target: `${file}-shm` }) };
}

const megabytes = (bytes: number | null) => (bytes === null ? "unknown" : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);
const sumOrUnknown = (parts: readonly (number | null)[]) => (parts.includes(null) ? null : (parts as number[]).reduce((a, b) => a + b, 0));

function plainLines({ report }: { report: StorageReportResult }): string[] {
  const lines = [`Storage for ${report.siteDir}: ${megabytes(report.totalBytes)}`];
  for (const [cls, label] of Object.entries(CLASS_LABELS) as Array<[keyof typeof CLASS_LABELS, string]>) lines.push(`  ${label}: ${megabytes(report.classes[cls].bytes)}`);
  for (const db of report.elsewhere) lines.push(`  ${db.category} kept outside this folder at ${db.path}: ${megabytes(sumOrUnknown([db.mainBytes, db.walBytes, db.shmBytes]))}`);
  if (report.unknownPaths.length > 0) lines.push(`  Could not read ${report.unknownPaths.length} location(s); their sizes are shown as unknown.`);
  return lines;
}

/**
 * Measures the website folder `dir` and prints the report (plain lines, or one JSON document).
 * @param required.resolvePaths where the databases live; always called with `reserveIdentity: false`.
 * @param optional.env the `TOVU_*_DIR` overrides to honour (default: none).
 * @throws when `dir` is not a directory (from `resolveDirectoryTarget`).
 * @complexity one walk of the website folder.
 */
export async function runStorageReportCommand(
  { dir, measureSiteStorage: measure, resolvePaths, stdout }: {
    dir: string; measureSiteStorage: StorageReportMeasure; resolvePaths: StorageReportPaths; stdout: { write(chunk: string): unknown };
  },
  { json = false, env = {} }: { json?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<StorageReportResult> {
  const siteDir = resolveDirectoryTarget({ dirArg: dir });
  const locations = resolveSiteStorageLocations({ siteDir, ...resolvePaths({ dir: siteDir }, { reserveIdentity: false }) }, { env });
  const report: StorageReportResult = { ...await measure({ siteDir, paths: locations.paths }), elsewhere: locations.elsewhere };
  const lines = json ? [JSON.stringify(report)] : plainLines({ report });
  for (const line of lines) stdout.write(`${line}\n`);
  return report;
}

/**
 * The CLI composition edge: binds the real measure and the real (boot-only) database resolver, which
 * the `platform/site-dir` barrel deliberately does not re-export, so this file is a CLI composition root.
 * @complexity one walk of the website folder.
 */
export async function runStorageReportCli(
  { dir, stdout, env }: { dir: string; stdout: { write(chunk: string): unknown }; env: NodeJS.ProcessEnv },
  { json = false }: { json?: boolean } = {},
): Promise<StorageReportResult> {
  return runStorageReportCommand({ dir, measureSiteStorage, resolvePaths: resolveSiteDatabasePaths, stdout }, { json, env });
}
