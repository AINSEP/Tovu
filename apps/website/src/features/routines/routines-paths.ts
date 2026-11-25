import { dirname, join } from "node:path";

/**
 * @file Where a site's routine sidecar and beacon live.
 *
 * Why beside the ACTUAL content database rather than `<siteDir>`: content can be relocated into
 * `data.nosync` or app-data, and the operational journals follow it (`site-paths.ts`'s
 * `defaultDatabaseJournalDbPath`). Keeping routines in the same `ops/` folder means every existing
 * private-path rule (backup, portable copy, publish) already covers them, and the desktop main
 * process resolves the beacon from the same registered content path the site child uses.
 */

/** The routine files for one site: the `ops/` folder, the sidecar database, and the desktop beacon. */
export interface RoutinesPaths {
  readonly dir: string;
  readonly db: string;
  readonly beacon: string;
}

export function routinesPaths({ contentDbPath }: { contentDbPath: string }, _optional: Record<string, never> = {}): RoutinesPaths {
  const dir = join(dirname(contentDbPath), "ops");
  return { dir, db: join(dir, "routines.db"), beacon: join(dir, "routines-beacon.json") };
}
