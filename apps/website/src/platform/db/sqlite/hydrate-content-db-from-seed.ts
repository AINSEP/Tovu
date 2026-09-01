import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @file `hydrateContentDbFromSeed()` — the first-boot copy that turns a deployed container's stock
 * `content.seed.db` into the site's live `content.db`.
 *
 * ---------------------------------------------------------------------------
 * The gap this closes
 * ---------------------------------------------------------------------------
 * `npm run seed:site` (development/scripts/seed-site.mjs) produces a pruned, VACUUMed
 * `sites/<site>/content.seed.db`, committed to git. Nothing previously connected it to the
 * `content.db` a deployed container actually boots from: a fresh volume mount has neither file, and
 * the site came up empty. This function is that missing connection — same shape as
 * `features/theme/seed-site-themes.ts`'s `seedSiteThemes()`, which solved the identical problem one
 * layer over for `themes/`: a read-only stock source shipped in the image, copied into the site's
 * own mutable copy exactly once, on the boot where that copy does not exist yet.
 *
 * ---------------------------------------------------------------------------
 * Why presence of `content.db` — not its contents — is the gate
 * ---------------------------------------------------------------------------
 * This is the single most important property here. Once a site has booted, its `content.db` is live
 * production data — real posts, real settings, real form submissions. Re-running this on every
 * later redeploy and overwriting it with the (now stale) seed would be silent, unrecoverable data
 * loss. `existsSync(dbPath)` is therefore the ONLY check: an existing file, however old or however
 * it got there, means "never touch this again."
 *
 * ---------------------------------------------------------------------------
 * WAL sidecars
 * ---------------------------------------------------------------------------
 * `seedDbPath` itself never carries a `-wal`/`-shm` sidecar — `seed-site.mjs`'s own
 * `vacuumAndVerify` TRUNCATE-checkpoints the scratch copy before publishing it. But the TARGET path
 * might: an interrupted prior hydration attempt, or a volume that lost its main file but not its
 * journal, can leave a stray sidecar sitting next to an absent `content.db`. Replaying a WAL against
 * a freshly-hydrated (and therefore unrelated) main file corrupts reads, so any such sidecar at
 * `dbPath` is removed before the fresh file lands, not left for `openContentDb`'s own WAL-mode
 * connection to trip over.
 *
 * Architectural role:
 * Pure filesystem effect, no domain logic and no port — mirrors `seedSiteThemes()` exactly, down to
 * the staging-file-then-atomic-rename shape, for the same crash-safety reason: an interrupted copy
 * must never leave a HALF-written `content.db` that the next boot's `existsSync` check then reads as
 * "already seeded".
 */

/** What a hydration attempt did. Every outcome is a normal, non-exceptional boot state. */
export type HydrateContentDbFromSeedStatus =
  /** `dbPath` was absent and now holds a copy of the stock seed. */
  | "seeded"
  /** `dbPath` already existed and was left exactly as it was. */
  | "already-present"
  /** No stock seed to copy from; nothing was written. */
  | "no-seed-source";

export interface HydrateContentDbFromSeedResult {
  readonly status: HydrateContentDbFromSeedStatus;
  /** Echoed back so a caller logging the outcome does not have to re-derive the path. */
  readonly dbPath: string;
}

export interface HydrateContentDbFromSeedRequired {
  /** The read-only stock seed shipped with the image (`builtInContentSeedDbPath()`). */
  readonly seedDbPath: string;
  /** Where this site's own `content.db` lives (`defaultContentDbPath()`). */
  readonly dbPath: string;
}

/**
 * Name of the sibling file the copy lands in before being renamed into place. A fixed name, not a
 * pid/random suffix: a crash mid-copy must leave exactly ONE recoverable path to clean up on the
 * next boot, not an accumulating pile of orphans — same rule `seedSiteThemes()`'s own
 * `STAGING_DIR_NAME` follows.
 */
const STAGING_FILE_SUFFIX = ".hydrate-seed-staging";

/** Removes a file and its `-wal`/`-shm` sidecars, if present. A no-op for anything absent. */
function removeWithSidecars(filePath: string): void {
  rmSync(filePath, { force: true });
  rmSync(`${filePath}-wal`, { force: true });
  rmSync(`${filePath}-shm`, { force: true });
}

/**
 * Copies the stock content seed into a site's own `content.db`, once, if that file does not exist
 * yet.
 *
 * @param required.seedDbPath - The image's read-only stock seed for this site.
 * @param required.dbPath - The site's own `content.db` path.
 * @returns Which of the three boot states occurred, plus the db path.
 * @throws Whatever `node:fs` throws on an unwritable site directory or a failed copy — a site whose
 *   `content.db` cannot be written has no working boot, so this is a real boot failure, not
 *   something to swallow. An absent stock seed is NOT such a case and returns `no-seed-source`.
 * @complexity O(bytes in the seed file) on a hydrating boot; O(1) on every boot after.
 */
export function hydrateContentDbFromSeed(required: HydrateContentDbFromSeedRequired): HydrateContentDbFromSeedResult {
  const { seedDbPath, dbPath } = required;

  if (existsSync(dbPath)) return { status: "already-present", dbPath };
  if (!existsSync(seedDbPath)) return { status: "no-seed-source", dbPath };

  const siteRoot = dirname(dbPath);
  const stagingPath = `${dbPath}${STAGING_FILE_SUFFIX}`;

  mkdirSync(siteRoot, { recursive: true });
  // Clears an orphan left by a previous interrupted boot, and any stale sidecar sitting next to the
  // (currently absent) target file — see this file's own header on why both matter.
  removeWithSidecars(stagingPath);
  removeWithSidecars(dbPath);

  copyFileSync(seedDbPath, stagingPath);
  // Same parent directory, so this is a same-filesystem rename: atomic, and the moment it returns
  // `dbPath` is complete or was never touched at all.
  renameSync(stagingPath, dbPath);

  return { status: "seeded", dbPath };
}
