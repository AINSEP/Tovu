/**
 * @file Which sites the operator considers "theirs" — the list the Projects screen renders cards
 * from. A JSON file in `userData`, not a sqlite table: porting Tovu-Runner's `project-registry.ts`
 * wholesale would drag `@jini-ai/sqlite` + `better-sqlite3` into a shell that has twice, in writing,
 * decided not to have them (`site-dir-store.js`'s own header makes the same call for its MRU list).
 *
 * Status is deliberately NOT stored here. `openSites.has(siteDir)` in `main.js` is ground truth for
 * "running" — a status written to this file would go stale the moment Electron is killed hard,
 * exactly the failure mode `site-process-registry.js`'s crash-safety design exists to avoid for the
 * supervision side of the same problem. `buildSiteRecord` (`main.js`) is what joins one row here
 * with `openSites` to produce the `SiteRecord` the renderer actually gets.
 *
 * No `electron` import, so this is testable under plain `node --test` — same convention as
 * `site-dir-store.js` and `site-process-registry.js`.
 */
import fs from "node:fs";
import path from "node:path";

const SITES_FILE_NAME = "desktop-projects.json";

/**
 * A tracked row's PROVENANCE — who made the directory it points at. Recorded because project delete
 * ends in a recursive `fs.rm` (`project-ipc.js`'s `handleDelete`), and that is only ever a correct
 * thing to do to a directory this app itself created.
 *
 * Two values, and the split is exactly `classifySiteDir`'s: `handleCreate` classifies the picked
 * folder BEFORE `adoptSiteDir` runs, so `"empty"` (which `tovu init` is about to fill) is the one
 * case that becomes `created`, and a folder that was already a site becomes `adopted` — the same
 * value `seedDevFallbackSite` writes. `adoptSiteDir` alone cannot tell the two apart: it returns
 * the same path either way.
 *
 * Not a boolean, because a boolean would have to be named for the CONSEQUENCE ("removable") and
 * would then have to change meaning if the deletion policy ever gains another rule. This records the
 * FACT; `project-delete-guard.js` owns the policy over it.
 */
const SITE_ORIGIN = Object.freeze({
  /** This app ran `tovu init` into an empty folder — every byte under it is ours. */
  created: "created",
  /** The directory already existed as a site when this app started tracking it. Never erased. */
  adopted: "adopted",
} as const);

/** The two values {@link SITE_ORIGIN} can take. See that constant's own doc. */
type SiteOrigin = (typeof SITE_ORIGIN)[keyof typeof SITE_ORIGIN];

/** What `site-dir-store.js`'s `classifySiteDir` returns — injected, not imported; see {@link discoverSiteDirs}. */
type SiteClassification = "site" | "incomplete" | "empty" | "occupied";

/** Injected classifier shape every function below takes instead of importing `site-dir-store.js`. */
type ClassifySiteDirFn = (dir: string) => SiteClassification;

/** One row as {@link readTrackedSites} returns it. `siteId` is set only per {@link buildTrackedRow}'s doc. */
interface TrackedSiteRow {
  siteDir: string;
  createdAt: string;
  origin: SiteOrigin;
  siteId?: string;
}

/** The raw shape parsed off disk, before {@link readTrackedSites}/{@link readDismissedSites} validate it. */
interface RawRegistryFile {
  projects?: unknown;
  dismissed?: unknown;
}

/** A raw parsed row, before {@link readTrackedSites} checks which fields are actually usable strings. */
interface RawTrackedRow {
  siteDir?: unknown;
  createdAt?: unknown;
  origin?: unknown;
  siteId?: unknown;
}

/** @returns the tracked-projects file's path inside Electron's per-user `userData` directory. */
function sitesFilePath(userDataDir: string): string {
  return path.join(userDataDir, SITES_FILE_NAME);
}

/**
 * Coerce a row's stored `origin` to a known {@link SITE_ORIGIN} value, FAIL-CLOSED: anything that
 * is not literally `"created"` — absent (a row written before provenance existed), misspelled, or a
 * non-string a hand-edited file put there — reads as `adopted`, the value that never erases files.
 *
 * @complexity O(1).
 */
function normalizeOrigin(origin: unknown): SiteOrigin {
  return origin === SITE_ORIGIN.created ? SITE_ORIGIN.created : SITE_ORIGIN.adopted;
}

/**
 * Parse the registry file, or `undefined` when it is absent, unreadable, or not a JSON object.
 *
 * The one place the file is read from disk, so {@link readTrackedSites} and
 * {@link readDismissedSites} can never disagree about whether a given file exists — the
 * distinction between "no file at all" and "a file holding an empty list" is load-bearing for
 * {@link migrateLegacyDismissals}, and two independent readers would eventually drift on it.
 *
 * @complexity O(n) in file size.
 */
function readRegistryFile(projectsPath: string): RawRegistryFile | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as RawRegistryFile) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the tracked project list, treating any unreadable or malformed file as "nothing tracked yet".
 *
 * Deliberately forgiving, the same rule `site-dir-store.js`'s `readDesktopState` follows: this file
 * is a convenience list over sites that still exist for real on disk, not the sites themselves, so a
 * truncated or corrupt copy should read as empty rather than crash the Projects screen.
 *
 * Every row comes back with a definite {@link SITE_ORIGIN} value: a row written before
 * provenance existed, or one carrying an unrecognized value, reads as `adopted`. That is the single
 * place the fail-closed rule lives, so no consumer has to remember to default it — see
 * {@link normalizeOrigin}.
 *
 * @returns rows shaped `{siteDir, createdAt, origin}`, oldest first.
 * @complexity O(n) in file size.
 */
function readTrackedSites(projectsPath: string): TrackedSiteRow[] {
  const parsed = readRegistryFile(projectsPath);
  const rows: unknown[] = Array.isArray(parsed?.projects) ? parsed.projects : [];
  return rows
    .filter((row) => typeof (row as RawTrackedRow)?.siteDir === "string" && typeof (row as RawTrackedRow)?.createdAt === "string")
    .map((row) => ({ ...(row as RawTrackedRow), origin: normalizeOrigin((row as RawTrackedRow).origin) })) as TrackedSiteRow[];
}

/**
 * Directories the operator has REMOVED on purpose — the tombstone list, and the reason a removal
 * survives the row it removed.
 *
 * Nothing automatic may ever add a directory named here: not {@link seedDevFallbackSite}, not
 * {@link adoptDiscoveredSites} on boot, not a rescan. Only {@link trackSite} — the explicit
 * adder, reached by the operator picking the folder themselves — clears an entry.
 *
 * A file with no `dismissed` key at all reads as an empty list here rather than as something
 * inferred, because the inference is not this function's to make: see
 * {@link migrateLegacyDismissals}, which converts a pre-dismissals file exactly once and leaves
 * every later reader looking at one uniform shape.
 *
 * @returns the dismissed site dirs, in the order they were removed.
 * @complexity O(n) in file size.
 */
function readDismissedSites(projectsPath: string): string[] {
  const dismissed = readRegistryFile(projectsPath)?.dismissed;
  return Array.isArray(dismissed) ? dismissed.filter((dir): dir is string => typeof dir === "string") : [];
}

/**
 * A row as {@link writeTrackedSites} accepts it: `origin` is optional here even though
 * {@link readTrackedSites} always returns one — {@link normalizeOrigin} fills the gap on read, so a
 * hand-built row (or one written before provenance existed) is a valid thing to persist.
 */
interface WritableTrackedRow {
  siteDir: string;
  createdAt: string;
  origin?: SiteOrigin;
  siteId?: string;
}

/**
 * @param dismissed the tombstone list to write. Defaults to whatever is already on disk, so a
 *   caller that only means to change the ROWS cannot silently erase the operator's removals — the
 *   failure mode that would quietly resurrect every dismissed project on the next scan.
 * @complexity O(n) in the row count.
 */
function writeTrackedSites(projectsPath: string, rows: WritableTrackedRow[], dismissed: string[] = readDismissedSites(projectsPath)): void {
  fs.mkdirSync(path.dirname(projectsPath), { recursive: true });
  fs.writeFileSync(projectsPath, JSON.stringify({ projects: rows, dismissed }, null, 2));
}

/** {@link trackSite}'s own extra, provenance-only field. See its param doc. */
interface TrackSiteOptions {
  siteId?: string;
}

/**
 * Track `siteDir`, if it is not already tracked. Idempotent — re-tracking an existing dir returns
 * the list unchanged rather than duplicating or bumping its row (and therefore never upgrades an
 * `adopted` row to `created` behind the operator's back).
 *
 * @param origin see {@link SITE_ORIGIN}. Defaults to `adopted` — the value that forbids erasing
 *   the directory — so a call site that forgets to state provenance fails CLOSED rather than
 *   handing a stranger's folder to `fs.rm`. Only a caller that positively knows this app created
 *   the directory may pass `created`.
 * @param options.siteId the identity of the site this app just created here — `.site-meta.json`'s
 *   own `siteId`, read by `project-delete-guard.js`'s `readSiteIdentity`. Recorded ONLY alongside
 *   `created`, because it exists for exactly one reader: the guard, proving before an `fs.rm` that
 *   the site at this path is still the one whose creation wrote this row (SEC-01/D-04). An
 *   `adopted` row can never erase anything, so stamping one would record a fact nothing reads and
 *   that a future rule could misread as permission. Omitted or unusable leaves the row without it,
 *   and the guard then refuses the erase — the fail-closed direction.
 * @returns the new row list.
 * @complexity O(n) in the row count.
 */
function trackSite(projectsPath: string, siteDir: string, origin: SiteOrigin = SITE_ORIGIN.adopted, options: TrackSiteOptions = {}): TrackedSiteRow[] {
  const rows = readTrackedSites(projectsPath);
  // Clearing the tombstone is safe HERE and only here, and that is an invariant rather than a
  // convenience: this is the EXPLICIT adder, reached when the operator picks the folder in the
  // dialog themselves, and picking a folder they once removed is them asking for it back. Every
  // AUTOMATIC adder must consult `isSiteDirKnown` before calling this, so a dismissed directory
  // never reaches this line by machine.
  const dismissed = readDismissedSites(projectsPath).filter((dir) => dir !== siteDir);
  if (rows.some((row) => row.siteDir === siteDir)) {
    if (dismissed.length !== readDismissedSites(projectsPath).length) writeTrackedSites(projectsPath, rows, dismissed);
    return rows;
  }
  const next = [...rows, buildTrackedRow(siteDir, normalizeOrigin(origin), options.siteId)];
  writeTrackedSites(projectsPath, next, dismissed);
  return next;
}

/**
 * One row in the shape {@link readTrackedSites} returns, with `siteId` present only when this
 * row is `created` AND a usable id was supplied — see {@link trackSite}'s own param doc.
 *
 * @complexity O(1).
 */
function buildTrackedRow(siteDir: string, origin: SiteOrigin, siteId: string | undefined): TrackedSiteRow {
  const row = { siteDir, createdAt: new Date().toISOString(), origin };
  const stampable = origin === SITE_ORIGIN.created && typeof siteId === "string" && siteId !== "";
  return stampable ? { ...row, siteId } : row;
}

/**
 * Stop tracking `siteDir`. A no-op, not an error, when it was never tracked — the caller (project
 * delete) wants this to be idempotent too.
 *
 * @returns the new row list.
 * @complexity O(n) in the row count.
 */
function untrackSite(projectsPath: string, siteDir: string): TrackedSiteRow[] {
  const rows = readTrackedSites(projectsPath).filter((row) => row.siteDir !== siteDir);
  // The removal is RECORDED, not just applied. Dropping the row alone was enough while the list was
  // the only thing that could add a project; with a boot scan and a rescan also adding, a bare
  // deletion would be undone by the very next one. See {@link readDismissedSites}.
  writeTrackedSites(projectsPath, rows, [...new Set([...readDismissedSites(projectsPath), siteDir])]);
  return rows;
}

/**
 * Whether the operator's stored state already has an ANSWER about `siteDir` — it is tracked, or
 * they removed it on purpose. The single predicate every automatic adder consults before adding
 * anything, so "already there" and "deliberately not there" cannot drift apart between the seed,
 * the boot scan, and a rescan.
 *
 * @complexity O(n) in the row + dismissal count.
 */
function isSiteDirKnown(projectsPath: string, siteDir: string): boolean {
  if (readTrackedSites(projectsPath).some((row) => row.siteDir === siteDir)) return true;
  return readDismissedSites(projectsPath).includes(siteDir);
}

/**
 * Convert a registry file written BEFORE removals were recorded into one that records them, once.
 *
 * This exists to preserve one property across the format change. The old
 * {@link seedDevFallbackSite} guard was `if (fs.existsSync(projectsPath)) return false;` — file
 * existence, deliberately, because `trackSite`/`untrackSite` both write unconditionally, so
 * an operator who tracked and then removed every project still has a file (holding
 * `{projects: []}`) and must never be re-seeded against their will. Replacing that guard with a
 * per-directory question would, on its own, LOSE exactly that: an empty legacy file says nothing
 * about `devFallbackDir`, so the seed would fire again and hand back the card they deleted.
 *
 * So the fact is recovered before it is needed. `seedDevFallbackSite` is the ONLY mechanism that
 * could have added a directory without being asked before this field existed, and `devFallbackDir`
 * is the only directory it could ever add. A legacy file that does not track it is therefore a file
 * whose operator removed it — the precise fact the existence check encoded — and it is written down
 * as a dismissal, where every later reader can see it.
 *
 * Deliberately narrow. Every OTHER untracked directory is left alone: nothing automatic had ever
 * offered those, so the first boot scan is their first offer, not a resurrection. The bounded cost
 * of that choice, stated rather than hidden: on a legacy install, a site the operator adopted by
 * hand and later removed can reappear once, and removing it again records a dismissal that sticks.
 *
 * A no-op when there is no file at all (a fresh install has removed nothing) and when the file
 * already carries a `dismissed` key (already migrated — running again would manufacture a tombstone
 * for a directory the operator has simply never seen).
 *
 * @returns the dismissals this call added — empty when nothing needed migrating.
 * @complexity O(n) in file size.
 */
function migrateLegacyDismissals(projectsPath: string, devFallbackDir: string): string[] {
  const parsed = readRegistryFile(projectsPath);
  if (parsed === undefined) return [];
  if (Array.isArray(parsed.dismissed)) return [];
  const rows = readTrackedSites(projectsPath);
  const added = rows.some((row) => row.siteDir === devFallbackDir) ? [] : [devFallbackDir];
  writeTrackedSites(projectsPath, rows, added);
  return added;
}

/**
 * Seed `devFallbackDir` as a tracked project unless the operator's stored state already answers for
 * it — see {@link isSiteDirKnown}, and {@link migrateLegacyDismissals} for how a file written
 * before dismissals existed still answers.
 *
 * The guard USED to be file existence, which also blocked every legitimate case: once anything at
 * all was tracked, the dev fallback could never appear, even on an install that had never seen it.
 * Asking about the directory instead of the file fixes that without giving up the property the old
 * guard bought — a removed project stays removed, because the removal is now a recorded fact rather
 * than an inference from the file's existence.
 *
 * `classifySiteDir` is injected rather than required directly (`site-dir-store.js`) so this
 * deliberately dependency-light module (see this file's header) stays decoupled from it, and so
 * callers can test the seeding decision without a real directory on disk.
 *
 * @returns whether a row was seeded.
 * @complexity O(1) beyond `classifySiteDir`'s and `trackSite`'s own cost.
 */
function seedDevFallbackSite(projectsPath: string, devFallbackDir: string, classifySiteDir: ClassifySiteDirFn): boolean {
  if (isSiteDirKnown(projectsPath, devFallbackDir)) return false;
  // Guarded, not bare: this runs one line before `projectDeps` is built, inside the `whenReady()`
  // chain whose only handler is `reportBootFailure`. A fallback that cannot be examined is a
  // fallback to decline — never a launch to abort (D-01).
  if (!classifiesAsSite(devFallbackDir, classifySiteDir)) return false;
  // ALWAYS `adopted`, and stated rather than left to the default: this row points at a folder that
  // already held a site before this app ever ran — `<repo>/sites/tovu-com` in a checkout, someone's
  // real content. Deleting its card must never delete it.
  trackSite(projectsPath, devFallbackDir, SITE_ORIGIN.adopted);
  return true;
}

/** Input to {@link discoverSiteDirs}. */
interface DiscoverSiteDirsInput {
  scanRoots: string[];
  knownDirs: string[];
  classifySiteDir: ClassifySiteDirFn;
}

/**
 * Every directory that is really a Tovu site, out of `scanRoots`' immediate children plus
 * `knownDirs` themselves.
 *
 * This is the answer to "a site created by `tovu init` outside the shell never appears": the
 * Projects screen used to render `desktop-projects.json` and nothing else, with no scan, no
 * rescan and no fallback, so a site that existed on disk but had never been picked in this app's
 * folder dialog was invisible forever.
 *
 * Deliberately ONE level deep under each root. A recursive walk would descend into every site's own
 * `uploads/` and `node_modules/`, which is unbounded work at boot for directories that cannot be
 * sites; the flat layout is the convention `devFallbackDir` (`<repo>/sites/tovu-com`) already
 * follows. `knownDirs` covers the sites that do not live under any root — `site-dir-store.js`'s
 * recently-opened list, which own-server mode has been writing all along.
 *
 * Note this is NOT a port of a Tovu-Runner mechanism: Runner keeps its projects in a SQLite
 * registry and never scans `instancesRoot` at all — its `reconcile()` repairs the STATUS of rows it
 * already has and discovers nothing. There was no scheme to copy, so this is the shell's own, built
 * on the two directory conventions the shell already has.
 *
 * @param deps.scanRoots directories whose immediate children are candidates. Missing roots are
 *   skipped, not an error — `<repo>/sites` does not exist in a packaged app.
 * @param deps.knownDirs candidate directories themselves, already-known paths rather than parents.
 * @param deps.classifySiteDir `site-dir-store.js`'s classifier, injected — see
 *   {@link seedDevFallbackSite} on why this module takes it rather than requiring it.
 * @returns absolute site dirs, deduped and sorted.
 * @complexity O(n) in the roots' combined child count.
 */
function discoverSiteDirs({ scanRoots, knownDirs, classifySiteDir }: DiscoverSiteDirsInput): string[] {
  const candidates: string[] = [];
  for (const root of scanRoots) {
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) candidates.push(path.join(root, entry));
  }
  candidates.push(...knownDirs);
  return [...new Set(candidates)].filter((dir) => isDiscoverableSite(dir, classifySiteDir)).sort();
}

/**
 * Whether one candidate is a real site, with every way of failing to find out treated as "no".
 *
 * The try/catch is the D-01 fix and it belongs HERE, in the scan, rather than only in the predicate
 * the scan is handed. The previous guard was `statSync(dir, {throwIfNoEntry: false})` plus
 * `isDirectory()`, which reads like a guard and is not one: `throwIfNoEntry` suppresses ENOENT
 * ALONE, so `statSync` itself still raises EACCES on an unreadable directory and ELOOP on a symlink
 * cycle — the guard's own line was one of the two throws that could quit the app before any window
 * existed. And `classifySiteDir` arrives INJECTED, so a scan that assumes it cannot throw has made
 * its own robustness the responsibility of a caller it does not control.
 *
 * One unexaminable candidate is not a site; it is also not a reason to discover nothing.
 *
 * @complexity O(1) beyond `classifySiteDir`'s own cost.
 */
function isDiscoverableSite(dir: string, classifySiteDir: ClassifySiteDirFn): boolean {
  try {
    // Following symlinks is the intent — a symlinked site dir is a site.
    const stat = fs.statSync(dir, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isDirectory()) return false;
  } catch {
    return false;
  }
  return classifiesAsSite(dir, classifySiteDir);
}

/**
 * `classifySiteDir(dir) === "site"`, with a throw counted as "no".
 *
 * Separate from {@link isDiscoverableSite} because the two callers need different amounts of it.
 * A scan over candidates it found itself must also survive `statSync` (D-01, and the arm the old
 * guard got wrong); {@link seedDevFallbackSite} is asking about ONE named directory through a
 * classifier that is injected exactly so the seeding decision can be tested without a real folder
 * on disk — adding a filesystem check there would break that contract to fix a throw.
 *
 * @complexity O(1) beyond `classifySiteDir`'s own cost.
 */
function classifiesAsSite(dir: string, classifySiteDir: ClassifySiteDirFn): boolean {
  try {
    return classifySiteDir(dir) === "site";
  } catch {
    return false;
  }
}

/**
 * Track every discovered directory the operator has no stored answer about.
 *
 * The merge rule, and the whole reason this is not just a loop over `trackSite`: a directory in
 * the dismissal list is SKIPPED and stays dismissed. Discovery is automatic, and an automatic adder
 * that resurrected deliberately-removed projects would be the same bug the seed guard exists to
 * prevent, wearing a different hat — worse here, because a rescan can be triggered repeatedly. The
 * operator's way back is the folder dialog, which reaches {@link trackSite} directly and clears
 * the tombstone, because that one IS them asking.
 *
 * Every discovery is recorded `adopted`, never `created`: this app did not make any of these
 * directories, so `project-delete-guard.js` must never let a delete erase one.
 *
 * @returns the dirs newly tracked by this call, in `siteDirs` order — empty when nothing was new.
 * @complexity O(n * m) in the discovered count and the registry size.
 */
function adoptDiscoveredSites(projectsPath: string, siteDirs: string[]): string[] {
  const adopted: string[] = [];
  for (const siteDir of siteDirs) {
    if (isSiteDirKnown(projectsPath, siteDir)) continue;
    trackSite(projectsPath, siteDir, SITE_ORIGIN.adopted);
    adopted.push(siteDir);
  }
  return adopted;
}

export {
  SITES_FILE_NAME,
  SITE_ORIGIN,
  normalizeOrigin,
  sitesFilePath,
  readTrackedSites,
  writeTrackedSites,
  trackSite,
  untrackSite,
  seedDevFallbackSite,
  readDismissedSites,
  isSiteDirKnown,
  migrateLegacyDismissals,
  discoverSiteDirs,
  isDiscoverableSite,
  classifiesAsSite,
  adoptDiscoveredSites,
};
