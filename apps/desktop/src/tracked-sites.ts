/**
 * @file Which sites the operator considers "theirs" — the list the Projects screen renders cards
 * from. A JSON file in `userData`, not a sqlite table: porting Tovu-Runner's `project-registry.ts`
 * wholesale would drag `@jini-ai/sqlite` + `better-sqlite3` into a shell that has twice, in writing,
 * decided not to have them (`site-dir-store.ts`'s own header makes the same call for its MRU list).
 *
 * Status is deliberately NOT stored here. `openSites.has(siteDir)` in `main.ts` is ground truth for
 * "running" — a status written to this file would go stale the moment Electron is killed hard,
 * exactly the failure mode `site-process-registry.ts`'s crash-safety design exists to avoid for the
 * supervision side of the same problem. `buildSiteRecord` (`main.ts`) is what joins one row here
 * with `openSites` to produce the `SiteRecord` the renderer actually gets.
 *
 * **Durability and who else is writing (2026-09-20).** This file is USER DATA — the operator built
 * this list up by adding folders, and losing it empties the Projects screen. It used to be written
 * with a plain `writeFileSync`, read back as an EMPTY list whenever it was torn or corrupt, and then
 * rewritten from that empty state by the very next change: one crash partway through a write, and
 * every card was gone. Three things answer that, all of them `durable-json-file.ts`'s, shared with
 * `site-process-registry.ts` and `site-dir-store.ts` rather than copied here:
 *
 * 1. Every write is temp file + `fsync` + `rename`, so a reader sees the whole old file or the whole
 *    new one and a crash can no longer tear this file at all.
 * 2. A damaged file is never read as empty. Readers show the longest part of it that still parses
 *    (see {@link readProjectsFile}), so the operator sees the projects that survived rather than none.
 * 3. The first change after the damage moves the damaged bytes aside to `<file>.corrupt-<ms>` and
 *    writes the recovered list plus that change. A file that cannot be moved aside is not written
 *    over: the change is refused, out loud, instead of destroying what is left.
 *
 * Several processes write this ONE file — every app instance (the owner runs several on purpose, and
 * ruled out a single-instance lock), `bin/tovu-desktop.ts add-site`, and the MCP bridge's
 * `add_site_pointer`. A per-instance file, the shape `site-process-registry.ts` chose for its own
 * rows, is wrong here: the operator expects every window to show the same projects, and a removal in
 * one window to hold everywhere. So every read-modify-write below runs inside one cross-process lock
 * ({@link updateProjectsFile}), which is also what makes "is this dir already known?" and "add it"
 * one decision rather than two a sibling process can slip between.
 *
 * No `electron` import, so this is testable under plain `node --test` — same convention as
 * `site-dir-store.ts` and `site-process-registry.ts`.
 */
import fs from "node:fs";
import path from "node:path";

import { readJsonFile, quarantineUnreadableFile, salvageJsonPrefix, withFileLock, writeJsonFileAtomic } from "./durable-json-file.ts";
import type { QuarantineNotice } from "./durable-json-file.ts";

const SITES_FILE_NAME = "desktop-projects.json";

/** How a damaged projects list is announced on stderr. The mechanism and the message's shape are
 *  `durable-json-file.ts`'s; only this sentence is this store's. */
const PROJECTS_QUARANTINE_NOTICE: QuarantineNotice = {
  label: "projects list",
  consequence: "every project that could still be read from it was kept, and anything past the damage is only in that copy.",
};

/**
 * A tracked row's PROVENANCE — who made the directory it points at. Recorded because project delete
 * ends in a recursive `fs.rm` (`project-ipc.ts`'s `handleDelete`), and that is only ever a correct
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
 * FACT; `project-delete-guard.ts` owns the policy over it.
 */
const SITE_ORIGIN = Object.freeze({
  /** This app ran `tovu init` into an empty folder — every byte under it is ours. */
  created: "created",
  /** The directory already existed as a site when this app started tracking it. Never erased. */
  adopted: "adopted",
} as const);

/** The two values {@link SITE_ORIGIN} can take. See that constant's own doc. */
type SiteOrigin = (typeof SITE_ORIGIN)[keyof typeof SITE_ORIGIN];

/** What `site-dir-store.ts`'s `classifySiteDir` returns — injected, not imported; see {@link discoverSiteDirs}. */
type SiteClassification = "site" | "incomplete" | "empty" | "occupied";

/** Injected classifier shape every function below takes instead of importing `site-dir-store.ts`.
 *  `"unreadable"` is `classifySiteDirSafely`'s extra verdict, which every caller here treats as "not a site". */
type ClassifySiteDirFn = (dir: string) => SiteClassification | "unreadable";

/** One row as {@link readTrackedSites} returns it. `siteId` is set only per {@link buildTrackedRow}'s doc. */
interface TrackedSiteRow {
  siteDir: string;
  createdAt: string;
  origin: SiteOrigin;
  siteId?: string;
}

/** The raw shape parsed off disk, before {@link readProjectsFile} validates it. */
interface RawProjectsFile {
  projects?: unknown;
  dismissed?: unknown;
}

/** The file as every reader and writer here sees it, whatever state it is in. */
interface ProjectsFile {
  /** `unreadable`: the file exists but is damaged, and `rows`/`dismissed` are what could be recovered
   *  from it — never an empty list standing in for "nobody knows". */
  state: "ok" | "missing" | "unreadable";
  rows: TrackedSiteRow[];
  dismissed: string[];
  /** Whether the file records removals AT ALL, which is a different question from having none —
   *  see {@link migrateLegacyDismissals}. */
  dismissedRecorded: boolean;
}

/** What a change {@link updateProjectsFile} applies leaves behind. */
interface ProjectsUpdate {
  rows: WritableTrackedRow[];
  dismissed: string[];
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
 * Read the file — the ONE place it is read from disk, so no two readers can disagree about what state
 * it is in. The distinction between "no file at all", "a file holding an empty list" and "a damaged
 * file" is load-bearing (for {@link migrateLegacyDismissals}, and for whether the next write moves the
 * bytes aside), and independent readers would eventually drift on it.
 *
 * **A damaged file is not an empty one.** It yields the longest prefix of itself that still parses
 * ({@link salvageJsonPrefix}) — every row completely written before a crash cut the write, or before a
 * hand edit broke it — so the Projects screen shows the operator what survived, and the next write
 * keeps exactly what they were shown. Recovered rows lose their PROVENANCE
 * ({@link stripProvenance}): damaged bytes may not authorize erasing a directory.
 *
 * @complexity O(n) in file size, plus {@link salvageJsonPrefix}'s bounded retries for a damaged file.
 */
function readProjectsFile(projectsPath: string): ProjectsFile {
  const read = readJsonFile(projectsPath);
  if (read.state === "missing") return { state: "missing", rows: [], dismissed: [], dismissedRecorded: false };
  if (read.state === "ok" && isProjectsShape(read.value)) return { state: "ok", ...contentsOf(read.value) };
  const salvaged = read.state === "ok" ? read.value : salvageJsonPrefix(read.text ?? "");
  return { state: "unreadable", ...contentsOf(stripProvenance(salvaged)) };
}

/** Whether a parsed value is a projects file this app could itself have written. Anything else —
 *  `null`, an array, an object whose `projects` is not a list — is damaged, not empty.
 *  @complexity O(1). */
function isProjectsShape(value: unknown): value is RawProjectsFile {
  return typeof value === "object" && value !== null && Array.isArray((value as RawProjectsFile).projects);
}

/**
 * The usable rows and dismissals in one parsed file. A row needs both `siteDir` and `createdAt` as
 * strings to be usable at all; every row that is comes back with a definite {@link SITE_ORIGIN}
 * value, since a row written before provenance existed, or carrying an unrecognized value, reads as
 * `adopted`. That fail-closed default lives here alone, so no consumer has to remember it — see
 * {@link normalizeOrigin}.
 *
 * @complexity O(n) in the row and dismissal count.
 */
function contentsOf(file: RawProjectsFile): Omit<ProjectsFile, "state"> {
  const rows = (Array.isArray(file.projects) ? file.projects : [])
    .filter((row) => typeof (row as RawTrackedRow)?.siteDir === "string" && typeof (row as RawTrackedRow)?.createdAt === "string")
    .map((row) => ({ ...(row as RawTrackedRow), origin: normalizeOrigin((row as RawTrackedRow).origin) })) as TrackedSiteRow[];
  const dismissedRecorded = Array.isArray(file.dismissed);
  const dismissed = dismissedRecorded ? (file.dismissed as unknown[]).filter((dir): dir is string => typeof dir === "string") : [];
  return { rows, dismissed, dismissedRecorded };
}

/**
 * Everything recoverable from a damaged file, with every row's provenance removed: no `origin` (so
 * {@link normalizeOrigin} reads it as `adopted`) and no `siteId`.
 *
 * Fail-closed, and the one thing recovery deliberately does NOT restore. `created` plus a matching
 * `siteId` is what lets a delete erase a directory outright (`project-delete-guard.ts`), and a file
 * this app has just found damaged is not evidence it may delete someone's folder. The operator keeps
 * every card; a recovered one can only be removed from the list.
 *
 * @complexity O(n) in the recovered row count.
 */
function stripProvenance(value: unknown): RawProjectsFile {
  if (typeof value !== "object" || value === null) return { projects: [] };
  const file = value as RawProjectsFile;
  const projects = (Array.isArray(file.projects) ? file.projects : []).map((row) => {
    if (typeof row !== "object" || row === null) return row;
    const bare = { ...(row as RawTrackedRow) };
    delete bare.origin;
    delete bare.siteId;
    return bare;
  });
  return { projects, dismissed: file.dismissed };
}

/**
 * Read the tracked project list.
 *
 * Never throws and never refuses to answer: this runs on the boot path and behind every Projects
 * screen render, so a damaged file shows what it still holds (see {@link readProjectsFile}) rather
 * than taking the screen down — or, as it used to, reading as "nothing tracked" and being persisted
 * as that by the next change.
 *
 * @returns rows shaped `{siteDir, createdAt, origin}`, oldest first.
 * @complexity O(n) in file size.
 */
function readTrackedSites(projectsPath: string): TrackedSiteRow[] {
  return readProjectsFile(projectsPath).rows;
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
  return readProjectsFile(projectsPath).dismissed;
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
 * THE way this file changes: read it, decide, write it, all inside one cross-process lock so no
 * sibling instance, CLI run or MCP call can write between the read and the write and have its change
 * erased (`durable-json-file.ts`'s {@link withFileLock}, and this file's header for why the lock is
 * right here where per-instance files were right for the registry).
 *
 * `change` returning `null` means "nothing to do", and then NOTHING is touched — a damaged file is
 * not repaired by a call that had no change to make, so a no-op cannot cost the operator the
 * `.corrupt-<ms>` copy's bytes for no reason.
 *
 * @param change computed from the file's CURRENT contents, which for a damaged file are what could
 *   be recovered from it ({@link readProjectsFile}) — so a change applies on top of the recovered
 *   list and the write keeps both.
 * @returns what the file holds afterwards.
 * @throws {Error} when the file is damaged and could not be moved aside. The change is refused
 *   rather than written over bytes that could not be preserved first.
 * @complexity O(n) in the row count, plus the lock wait.
 */
function updateProjectsFile(projectsPath: string, change: (current: ProjectsFile) => ProjectsUpdate | null): ProjectsUpdate {
  return withFileLock(projectsPath, () => {
    const current = readProjectsFile(projectsPath);
    const next = change(current);
    if (next === null) return { rows: current.rows, dismissed: current.dismissed };
    if (current.state === "unreadable" && !quarantineUnreadableFile(projectsPath, PROJECTS_QUARANTINE_NOTICE)) {
      throw new Error(`The projects list ${projectsPath} is damaged and could not be moved aside, so this change was not saved. Nothing was written over it.`);
    }
    writeJsonFileAtomic(projectsPath, { projects: next.rows, dismissed: next.dismissed });
    return next;
  });
}

/**
 * Replace the rows outright.
 *
 * @param dismissed the tombstone list to write. Defaults to whatever is already on disk — read
 *   inside the same lock as the write, so a caller that only means to change the ROWS cannot
 *   silently erase the operator's removals, which would quietly resurrect every dismissed project
 *   on the next scan.
 * @complexity O(n) in the row count.
 */
function writeTrackedSites(projectsPath: string, rows: WritableTrackedRow[], dismissed?: string[]): void {
  updateProjectsFile(projectsPath, (current) => ({ rows, dismissed: dismissed ?? current.dismissed }));
}

/** {@link trackSite}'s own extra, provenance-only field. See its param doc. */
interface TrackSiteOptions {
  siteId?: string | null;
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
 *   own `siteId`, read by `project-delete-guard.ts`'s `readSiteIdentity`. Recorded ONLY alongside
 *   `created`, because it exists for exactly one reader: the guard, proving before an `fs.rm` that
 *   the site at this path is still the one whose creation wrote this row (SEC-01/D-04). An
 *   `adopted` row can never erase anything, so stamping one would record a fact nothing reads and
 *   that a future rule could misread as permission. Omitted or unusable leaves the row without it,
 *   and the guard then refuses the erase — the fail-closed direction.
 * @returns the new row list.
 * @complexity O(n) in the row count.
 */
function trackSite(projectsPath: string, siteDir: string, origin: SiteOrigin = SITE_ORIGIN.adopted, options: TrackSiteOptions = {}): TrackedSiteRow[] {
  let rows: TrackedSiteRow[] = [];
  updateProjectsFile(projectsPath, (current) => {
    // Clearing the tombstone is safe HERE and only here, and that is an invariant rather than a
    // convenience: this is the EXPLICIT adder, reached when the operator picks the folder in the
    // dialog themselves, and picking a folder they once removed is them asking for it back. Every
    // AUTOMATIC adder must consult `isSiteDirKnown` before calling this, so a dismissed directory
    // never reaches this line by machine.
    const dismissed = current.dismissed.filter((dir) => dir !== siteDir);
    rows = current.rows;
    if (current.rows.some((row) => row.siteDir === siteDir)) {
      return dismissed.length === current.dismissed.length ? null : { rows, dismissed };
    }
    rows = [...current.rows, buildTrackedRow(siteDir, normalizeOrigin(origin), options.siteId)];
    return { rows, dismissed };
  });
  return rows;
}

/**
 * One row in the shape {@link readTrackedSites} returns, with `siteId` present only when this
 * row is `created` AND a usable id was supplied — see {@link trackSite}'s own param doc.
 *
 * @complexity O(1).
 */
function buildTrackedRow(siteDir: string, origin: SiteOrigin, siteId: string | null | undefined): TrackedSiteRow {
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
  let rows: TrackedSiteRow[] = [];
  updateProjectsFile(projectsPath, (current) => {
    rows = current.rows.filter((row) => row.siteDir !== siteDir);
    // The removal is RECORDED, not just applied. Dropping the row alone was enough while the list was
    // the only thing that could add a project; with a boot scan and a rescan also adding, a bare
    // deletion would be undone by the very next one. See {@link readDismissedSites}.
    return { rows, dismissed: [...new Set([...current.dismissed, siteDir])] };
  });
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
  return isKnownIn(readProjectsFile(projectsPath), siteDir);
}

/** {@link isSiteDirKnown} against a file already read — the form {@link adoptDiscoveredSites} needs,
 *  so its check and its add are one decision inside one lock rather than two a sibling process can
 *  slip a removal between.
 *  @complexity O(n) in the row + dismissal count. */
function isKnownIn(file: ProjectsFile, siteDir: string): boolean {
  return file.rows.some((row) => row.siteDir === siteDir) || file.dismissed.includes(siteDir);
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
 * A no-op when there is no file at all (a fresh install has removed nothing), when the file already
 * carries a `dismissed` key (already migrated — running again would manufacture a tombstone for a
 * directory the operator has simply never seen), and when it is damaged (what it recorded is what
 * nobody can know).
 *
 * @returns the dismissals this call added — empty when nothing needed migrating.
 * @complexity O(n) in file size.
 */
function migrateLegacyDismissals(projectsPath: string, devFallbackDir: string): string[] {
  let added: string[] = [];
  updateProjectsFile(projectsPath, (current) => {
    // A DAMAGED file is not a legacy one: whether it recorded removals is exactly what its damage
    // makes unknowable, and converting it would manufacture a tombstone out of a gap. Left for the
    // first real change to move aside.
    if (current.state !== "ok" || current.dismissedRecorded) return null;
    added = current.rows.some((row) => row.siteDir === devFallbackDir) ? [] : [devFallbackDir];
    return { rows: current.rows, dismissed: added };
  });
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
 * `classifySiteDir` is injected rather than required directly (`site-dir-store.ts`) so this
 * deliberately dependency-light module (see this file's header) stays decoupled from it, and so
 * callers can test the seeding decision without a real directory on disk.
 *
 * @returns whether a row was seeded.
 * @complexity O(1) beyond `classifySiteDir`'s and {@link adoptDiscoveredSites}' own cost.
 */
function seedDevFallbackSite(projectsPath: string, devFallbackDir: string, classifySiteDir: ClassifySiteDirFn): boolean {
  if (isSiteDirKnown(projectsPath, devFallbackDir)) return false;
  // Guarded, not bare: this runs one line before `projectDeps` is built, inside the `whenReady()`
  // chain whose only handler is `reportBootFailure`. A fallback that cannot be examined is a
  // fallback to decline — never a launch to abort (D-01).
  if (!classifiesAsSite(devFallbackDir, classifySiteDir)) return false;
  // Through the automatic adder, not `trackSite`: it re-asks `isSiteDirKnown` inside the lock, so a
  // dismissal another instance records between the check above and this line still holds. It also
  // records `adopted`, which is the only correct value here — this row points at a folder that
  // already held a site before this app ever ran (`<repo>/sites/tovu-com` in a checkout, someone's
  // real content), and deleting its card must never delete it.
  return adoptDiscoveredSites(projectsPath, [devFallbackDir]).length > 0;
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
 * follows. `knownDirs` covers the sites that do not live under any root — `site-dir-store.ts`'s
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
 * @param deps.classifySiteDir `site-dir-store.ts`'s classifier, injected — see
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
 * Asked and answered inside ONE locked update, not one per directory: the check "does the operator
 * already have an answer about this dir" and the add are a single decision, so a removal made in
 * another window (or by the CLI) between the two cannot be undone by this scan. Duplicate entries in
 * `siteDirs` therefore collapse here rather than being caught by a re-read.
 *
 * Every discovery is recorded `adopted`, never `created`: this app did not make any of these
 * directories, so `project-delete-guard.ts` must never let a delete erase one.
 *
 * @returns the dirs newly tracked by this call, in `siteDirs` order — empty when nothing was new.
 * @complexity O(n * m) in the discovered count and the tracked-row count, in one read and one write.
 */
function adoptDiscoveredSites(projectsPath: string, siteDirs: string[]): string[] {
  let adopted: string[] = [];
  updateProjectsFile(projectsPath, (current) => {
    adopted = [...new Set(siteDirs)].filter((siteDir) => !isKnownIn(current, siteDir));
    if (adopted.length === 0) return null;
    return {
      rows: [...current.rows, ...adopted.map((siteDir) => buildTrackedRow(siteDir, SITE_ORIGIN.adopted, undefined))],
      dismissed: current.dismissed,
    };
  });
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
