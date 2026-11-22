/**
 * @file Read-only measurement of one website folder, in the categories and classes the owner sees.
 *
 * The caller passes paths it has already resolved (this module never guesses a layout); the generic
 * walk is Jini's `measureStorageTree`, which skips symlinks and reports unreadable paths as unknown.
 * What Tovu adds is product policy: which category each path is, which class each category belongs
 * to, and that a SQLite database's `-wal` and `-shm` files are shown apart from the main file.
 * Nothing here opens a database, writes, cleans or asks for approval.
 */
import path from "node:path";
import { measureStorageTree, type StorageTally, type StorageTarget, type StorageTreeFs } from "@jini-ai/platform/retention";

/** `automatic`: Tovu may clean it by a rule; `yours`: only an owner action removes it;
 * `report-only`: shown, never removed by Tovu. Follows the P11 inventory's Auto? column. */
export type SiteStorageClass = "automatic" | "yours" | "report-only";

export const SITE_STORAGE_CATEGORY_CLASS = {
  "content-database": "yours",
  "chat-database": "yours",
  "database-wal": "report-only",
  "database-shm": "report-only",
  uploads: "yours",
  themes: "yours",
  plugins: "yours",
  "agent-plugins": "yours",
  "theme-rollbacks": "yours",
  screenshots: "yours",
  shares: "yours",
  "pre-migration-copies": "automatic",
  "restore-points": "automatic",
  logs: "automatic",
  exports: "report-only",
  temporary: "report-only",
  other: "report-only",
} as const satisfies Record<string, SiteStorageClass>;

export type SiteStorageCategory = keyof typeof SITE_STORAGE_CATEGORY_CLASS;
/** Sidecars are derived from database paths and `other` is whatever no path claimed. */
export type SiteStorageLocationCategory = Exclude<SiteStorageCategory, "database-wal" | "database-shm" | "other">;

export interface SiteStoragePath { readonly category: SiteStorageLocationCategory; readonly path: string }
export interface SiteStorageAmount { readonly bytes: number | null; readonly knownBytes: number; readonly files: number }
export interface SiteDatabaseSize {
  readonly category: SiteStorageLocationCategory;
  readonly path: string;
  readonly mainBytes: number | null;
  readonly walBytes: number | null;
  readonly shmBytes: number | null;
}

export interface SiteStorageReport {
  readonly siteDir: string;
  readonly totalBytes: number | null;
  readonly knownBytes: number;
  readonly categories: Readonly<Record<SiteStorageCategory, SiteStorageAmount & { readonly class: SiteStorageClass }>>;
  readonly classes: Readonly<Record<SiteStorageClass, SiteStorageAmount>>;
  readonly databases: readonly SiteDatabaseSize[];
  readonly skippedSymlinks: readonly string[];
  readonly unknownPaths: readonly string[];
}

const DATABASE_CATEGORIES: ReadonlySet<SiteStorageLocationCategory> = new Set(["content-database", "chat-database"]);

interface PlannedTarget extends StorageTarget { readonly category: SiteStorageCategory }

/**
 * Measures `siteDir` once and groups the bytes by category and class.
 * @param required.paths - already-resolved absolute paths inside `siteDir`; a category may repeat.
 * @throws TypeError / RangeError in plain words for a relative path or one outside the website folder.
 * @complexity O(n · p) for n entries and p paths; one sequential walk.
 * @example await measureSiteStorage({ siteDir, paths: [{ category: "uploads", path: uploadsDir }] });
 */
export async function measureSiteStorage(
  { siteDir, paths }: { siteDir: string; paths: readonly SiteStoragePath[] },
  { fs }: { fs?: StorageTreeFs } = {},
): Promise<SiteStorageReport> {
  const targets = planTargets({ siteDir, paths });
  const tree = await measureStorageTree({ root: siteDir, targets }, fs ? { fs } : {});
  const byCategory = new Map<SiteStorageCategory, StorageTally[]>([["other", [tree.other]]]);
  for (const target of targets) byCategory.set(target.category, [...(byCategory.get(target.category) ?? []), tree.targets[target.id]!]);
  const categories = Object.fromEntries(Object.entries(SITE_STORAGE_CATEGORY_CLASS).map(([category, storageClass]) => (
    [category, { ...sumAmounts({ amounts: (byCategory.get(category as SiteStorageCategory) ?? []).map(tally => toAmount({ tally })) }), class: storageClass }]
  ))) as SiteStorageReport["categories"];
  const classes = Object.fromEntries((["automatic", "yours", "report-only"] as const).map(storageClass => (
    [storageClass, sumAmounts({ amounts: Object.values(categories).filter(amount => amount.class === storageClass) })]
  ))) as SiteStorageReport["classes"];
  return {
    siteDir,
    totalBytes: tree.total.bytes,
    knownBytes: tree.total.knownBytes,
    categories,
    classes,
    databases: databaseSizes({ paths, tallies: tree.targets }),
    skippedSymlinks: tree.total.skippedSymlinks,
    unknownPaths: tree.total.unknownPaths,
  };
}

/** One target per path, plus `-wal`/`-shm` targets beside each database so they never count as the main file. */
function planTargets(
  { siteDir, paths }: { siteDir: string; paths: readonly SiteStoragePath[] },
  _optional: Record<string, never> = {},
): PlannedTarget[] {
  const root = path.resolve(siteDir);
  return paths.flatMap(({ category, path: location }, index) => {
    if (!path.isAbsolute(location)) throw new TypeError(`This storage location must be a full path: ${location}`);
    const relative = path.relative(root, path.resolve(location));
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new RangeError(`This storage location is outside the website folder: ${location}`);
    }
    const main: PlannedTarget = { id: `${index}`, category, path: location };
    if (!DATABASE_CATEGORIES.has(category)) return [main];
    return [main, { id: `${index}-wal`, category: "database-wal", path: `${location}-wal` }, { id: `${index}-shm`, category: "database-shm", path: `${location}-shm` }];
  });
}

function databaseSizes(
  { paths, tallies }: { paths: readonly SiteStoragePath[]; tallies: Readonly<Record<string, StorageTally>> },
  _optional: Record<string, never> = {},
): SiteDatabaseSize[] {
  return paths.flatMap(({ category, path: location }, index) => (DATABASE_CATEGORIES.has(category)
    ? [{ category, path: location, mainBytes: tallies[`${index}`]!.bytes, walBytes: tallies[`${index}-wal`]!.bytes, shmBytes: tallies[`${index}-shm`]!.bytes }]
    : []));
}

function toAmount({ tally }: { tally: StorageTally }, _optional: Record<string, never> = {}): SiteStorageAmount {
  return { bytes: tally.bytes, knownBytes: tally.knownBytes, files: tally.files };
}

/** Unknown stays unknown when added: one unreadable part makes the sum `null`, never a smaller number. */
function sumAmounts({ amounts }: { amounts: readonly SiteStorageAmount[] }, _optional: Record<string, never> = {}): SiteStorageAmount {
  const knownBytes = amounts.reduce((sum, amount) => sum + amount.knownBytes, 0);
  const files = amounts.reduce((sum, amount) => sum + amount.files, 0);
  return { bytes: amounts.some(amount => amount.bytes === null) ? null : knownBytes, knownBytes, files };
}
