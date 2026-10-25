/** Stopped-site CLI owner, reused by automatic desktop startup relocation. Dry-run performs no stop, mkdir, lock cleanup, registry write or move. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { verifySqliteIntegrity } from "@jini-ai/db/sqlite";
import { checkpointStoppedSqliteWal } from "../db/kernel/checkpoint-stopped-wal.js";
import { resolveSiteDatabasePaths } from "./site-databases.js";
import { withFileLock, moveDirectoryVerified } from "@jini-ai/platform/fs";
import { createSitesWorkspace, type SitesWorkspace } from "./sites-home.js";
import { readSiteDir } from "./read-site-dir.js";
import { sitesProjectReferences } from "./sites-project-references.js";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";
import { assertLocalSiteName } from "./local-site-supervisor.js";
import { ValidationError } from "./errors.js";

export interface MovePlan { from: string; to: string; id: string; name: string; running: DirectoryRunningRecord | null;
  databases: { from: string; to: string }[];
}
export interface SitesMovePorts {
  workspace: SitesWorkspace;
  /** Kept for source compatibility; running sites are now always refused, never stopped. */
  stop(required: { dir: string; running: DirectoryRunningRecord }): Promise<void>;
  relocateDirectory: typeof moveDirectoryVerified;
  verifyDatabase(required: { path: string }): string;
}
/** Selection/reporting for legacy discovery; an absent or empty selection includes all sites. */
interface SitesMovePlanOptions {
  workspace?: SitesWorkspace;
  sites?: readonly string[];
  onSkipped?: (required: { dir: string }) => void;
  onRunning?: (required: { dir: string; running: DirectoryRunningRecord }) => void;
  /** Explicit roots select one validated site from the released nested default. */
  sourceRoots?: readonly string[];
  projectsPaths?: readonly string[];

}
/** Inspect validated immediate children in the released nested default. Symlinked roots/sites and target collisions
 * are refused. No valid metadata is guessed for a legacy folder; initialize/repair it first.
 * Dot-folders and folders without both markers are reported through onSkipped, without validation.
 * @param options.sites - Optional checkout folder names to include, rather than display names.
 * @returns Move plans for selected sites; reads files only and preserves all real-site errors.
 * @example planSitesMove({ repoRoot }, { sites: ["tovu-dev"] });
 * @complexity O(n + s) directory/selection work and O(n) plan storage for n children, s selections,
 * plus the existing per-site metadata/catalog reads.
 */
export function planSitesMove({ repoRoot }: { repoRoot: string }, { workspace = createSitesWorkspace({}, { cwd: repoRoot, catalogRecovery: false }), sites, onSkipped, sourceRoots }: SitesMovePlanOptions = {}): MovePlan[] {
  const home = workspace.home({});
  const nestedRoot = workspace.nestedSitesRoot({});
  const formerRoots = nestedRoot ? [nestedRoot] : [];
  const selectedNames = new Set(sites);
  return [...new Set(sourceRoots ?? formerRoots)].flatMap((candidate) => {
    const root = openSourceRoot({ candidate, formerRoots, repoRoot, home });
    return root ? planRootMoves({ root, home, workspace, selectedNames }, { onSkipped }) : [];
  });
}

/** Validate one source root before any of its children are read.
 * @returns The real root, or undefined when it is absent or already is the sites home.
 * @throws A root outside the former default, a symlinked root, or a checkout root holding the home.
 * @complexity O(1) filesystem probes.
 */
function openSourceRoot({ candidate, formerRoots, repoRoot, home }: { candidate: string; formerRoots: readonly string[]; repoRoot: string; home: string }): string | undefined {
  // Relocate within the implicit Documents home family only: local ~/Tovu sites must never be silently
  // transferred into synced Documents. Checkout compatibility roots remain discovery sources.
  if (!formerRoots.includes(path.resolve(candidate))) throw new Error("Only sites inside the former default sites/ folder can be moved to Documents/Tovu.");
  if (!fs.existsSync(candidate)) return undefined;
  if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error("The source sites folder must not be a symlink.");
  const root = fs.realpathSync(candidate);
  if (path.resolve(candidate) === path.join(repoRoot, "sites") && (home === root || home.startsWith(root + path.sep))) throw new Error("Sites home must be outside the checkout sites folder.");
  return home === root ? undefined : root;
}

/** Plan every selected site folder directly inside one validated root, reporting non-site folders.
 * @complexity O(n) children of the root plus each selected site's metadata/catalog reads.
 */
function planRootMoves({ root, home, workspace, selectedNames }: { root: string; home: string; workspace: SitesWorkspace; selectedNames: ReadonlySet<string> }, { onSkipped }: Pick<SitesMovePlanOptions, "onSkipped"> = {}): MovePlan[] {
  const plans: MovePlan[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const from = path.join(root, entry.name);
    if (!isSiteFolder({ name: entry.name, dir: from })) onSkipped?.({ dir: from });
    else if (isSelected({ name: entry.name, selectedNames })) plans.push(planSiteMove({ from, to: path.join(home, entry.name), workspace }));
  }
  return plans;
}

/** A site folder is visible (no dot prefix) and carries both site markers. */
function isSiteFolder({ name, dir }: { name: string; dir: string }): boolean {
  return !name.startsWith(".") && fs.existsSync(path.join(dir, "config.json")) && fs.existsSync(path.join(dir, ".site-meta.json"));
}

/** An absent or empty selection includes all sites. */
function isSelected({ name, selectedNames }: { name: string; selectedNames: ReadonlySet<string> }): boolean {
  return selectedNames.size === 0 || selectedNames.has(name);
}

/** Read one site's identity and plan its folder and database moves without writing anything.
 * @throws Invalid metadata, a target collision, or a database that cannot move safely.
 */
function planSiteMove({ from, to, workspace }: { from: string; to: string; workspace: SitesWorkspace }): MovePlan {
  const { meta, config } = readSiteDir({ dir: from });
  assertMoveTargetAbsent({ to });
  const databases = planDatabaseMoves({ from, to, siteId: meta.siteId, workspace });
  return { from, to, id: meta.siteId, name: config.name, databases, running: workspace.running({ path: from }).peek({}) };
}

/** Refuse any existing entry at the target, even a dangling symlink; other probe errors propagate. */
function assertMoveTargetAbsent({ to }: { to: string }): void {
  try { fs.lstatSync(to); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Move target already exists: ${to}`);
}

/** Pair each existing database with its destination under the configured placement.
 * @throws App-data placement inside the moved site, a non-file database/sidecar, or a target collision.
 * @complexity O(1): two databases with three files each.
 */
function planDatabaseMoves({ from, to, siteId, workspace }: { from: string; to: string; siteId: string; workspace: SitesWorkspace }): MovePlan["databases"] {
  const existing = resolveSiteDatabasePaths({ dir: from, siteId }, { workspace, reserveIdentity: false });
  const placement = workspace.config({}).databases;
  const selected = resolveSiteDatabasePaths({ dir: to, siteId }, { workspace, placement });
  if (selected.contentDbPath.startsWith(from + path.sep)) throw new Error("App-data databases must be outside the site being moved.");
  const databases = [{ from: existing.contentDbPath, to: selected.contentDbPath }, { from: existing.chatDbPath, to: selected.chatDbPath }]
    .filter((db) => fs.existsSync(db.from)).map((db) => ({ ...db,
      // Existing in-site placement wins: a folder rename carries the DB atomically, so a
      // folder-level move needs neither a new DB copy nor a second backup of those same bytes.
      to: placement === "inSite" && db.from.startsWith(from + path.sep) ? path.join(to, path.relative(from, db.from)) : db.to,
    }));
  for (const db of databases) assertDatabaseMovable({ db });
  return databases;
}

/** Each database file and sidecar must be a regular file, and a relocated one must not overwrite anything. */
function assertDatabaseMovable({ db }: { db: { from: string; to: string } }): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(db.from + suffix) && !fs.lstatSync(db.from + suffix).isFile()) throw new Error(`Database move requires a regular file: ${db.from + suffix}`);
    if (db.from !== db.to && fs.existsSync(db.to + suffix)) throw new Error(`Database move target already exists: ${db.to + suffix}`);
  }
}

/** Require the site stopped, reserve both identities against boots, then verify and commit.
 * A crashed apply retains a verified destination or the original; it never silently overwrites.
 * @param options.sites - Optional checkout folder names, retained across every locked re-plan.
 * @returns Dry-run plans or only successfully moved sites; dry runs only read, apply moves folders/databases and updates the registry.
 * @throws Existing validation, collision, running-site and database-integrity errors.
 * @example await moveSitesHome({ repoRoot }, { sites: ["tovu-dev"] });
 * @complexity O(total site bytes + SQLite verification), plus registry I/O.
 */
export async function moveSitesHome(
  { repoRoot }: { repoRoot: string }, { apply = false, workspace = createSitesWorkspace({}, { cwd: repoRoot, catalogRecovery: false }), verifyDatabase = inspectStoppedDatabase, relocateDirectory = moveDirectoryVerified, sites, onSkipped, onRunning = warnRunning, sourceRoots, projectsPaths }: Partial<SitesMovePorts> & SitesMovePlanOptions & { apply?: boolean } = {},
): Promise<MovePlan[]> {
  const plans = planSitesMove({ repoRoot }, { workspace, sites, onSkipped, sourceRoots });
  if (!apply) return plans;
  const home = workspace.home({});
  // Lock parents can create directories too; refuse an absent volume before acquiring any lane.
  if (!workspace.homeAvailable({})) throw new Error(`Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`);
  const replan = () => planSitesMove({ repoRoot }, { workspace, sites, sourceRoots });
  const moved: MovePlan[] = [];
  await withFileLock({ lockPath: `${home}.move.lock`, run: async () => {
    // Running sites are refused individually; stopped siblings can move without forcing a stop.
    // Journal/exclusive-lock admission still precedes every byte copied for stopped sites.
    admitStoppedSites({ plans: replan() }, { onRunning });
    // Re-plan after obtaining the migration lane: another apply may have completed while waiting.
    for (const plan of replan().filter((candidate) => !candidate.running)) {
      await moveOneSite({ plan, workspace }, { relocateDirectory, verifyDatabase, projectsPaths });
      moved.push(plan);
    }
  } }, { createParent: true, staleMs: Infinity });
  return moved;
}

/** Default running-site report for the CLI and desktop callers. */
function warnRunning({ dir, running }: { dir: string; running: DirectoryRunningRecord }): void {
  console.warn(`Skipped running site in ${running.app}: ${dir}. Stop it before moving it.`);
}

/** Report each running site, prove every stopped site's databases closed, and refuse a batch with only running sites.
 * @throws The first site's running error when every planned site is running, or a database admission error.
 * @complexity O(p) plans plus one exclusive probe per stopped database.
 */
function admitStoppedSites({ plans }: { plans: readonly MovePlan[] }, { onRunning }: { onRunning: NonNullable<SitesMovePlanOptions["onRunning"]> }): void {
  for (const plan of plans) {
    if (plan.running) onRunning({ dir: plan.from, running: plan.running });
    else for (const db of plan.databases) assertDatabaseStopped({ path: db.from });
  }
  const [first] = plans;
  if (first?.running && plans.every((plan) => plan.running)) throw new Error(`Site is running in ${first.running.app}: ${first.from}. Stop it before moving it.`);
}

/** Move one stopped site under its target creation lock while both identities are reserved.
 * @throws A site or target claimed by another app, a database admission error, or a failed verified move.
 * @complexity The site's bytes plus SQLite verification and catalog I/O.
 */
async function moveOneSite({ plan, workspace }: { plan: MovePlan; workspace: SitesWorkspace }, ports: SiteRelocationPorts): Promise<void> {
  await withFileLock({ lockPath: `${plan.to}.creation.lock`, run: async () => {
    const live = workspace.running({ path: plan.from }).peek({});
    if (live) throw new Error(`Site is running in ${live.app}: ${plan.from}. Stop it before moving it.`);
    for (const db of plan.databases) assertDatabaseStopped({ path: db.from });
    const reservation = workspace.claim({ path: plan.from, app: "Migration" });
    if (!reservation.acquired) throw new Error(`Another app started this site: ${plan.from}`);
    let targetToken: string | undefined;
    try {
      const targetReservation = workspace.claim({ path: plan.to, app: "Migration" });
      if (!targetReservation.acquired) throw new Error(`Another app started the move target: ${plan.to}`);
      targetToken = targetReservation.record.token;
      fs.mkdirSync(workspace.home({}), { recursive: true });
      relocateSite({ plan, workspace }, ports);
    } finally {
      // Release at the new path only after the move, so cleanup never recreates the source.
      // Leases now live in app-data, so release both identities even after the source moves.
      workspace.running({ path: plan.from }).release({ token: reservation.record.token });
      if (targetToken) workspace.running({ path: plan.to }).release({ token: targetToken });
    }
  } }, { createParent: true, staleMs: Infinity });
}

type SiteRelocationPorts = Pick<SitesMovePorts, "relocateDirectory" | "verifyDatabase"> & Pick<SitesMovePlanOptions, "projectsPaths">;

/** Verified folder move whose commit re-checks identity and updates the registry and desktop catalogs. */
function relocateSite({ plan, workspace }: { plan: MovePlan; workspace: SitesWorkspace }, { relocateDirectory, verifyDatabase, projectsPaths }: SiteRelocationPorts): void {
  relocateDirectory({ from: plan.from, to: plan.to, commit: () => {
    const verified = readSiteDir({ dir: plan.to });
    if (verified.meta.siteId !== plan.id) throw new Error("Moved site's identity did not match.");
    workspace.relocate({ from: plan.from, to: plan.to,
      entry: { id: plan.id, name: plan.name, path: plan.from, createdBy: "migrated", lastOpened: null },
      references: sitesProjectReferences({ workspace, from: plan.from, to: plan.to }, { projectsPaths }),
    });
  } }, { excluded: [".tovu-running.json", ".tovu-running.json.lock"],
    relocateFiles: ({ target }) => plan.databases.map((db) => ({
      from: db.from.startsWith(plan.from + path.sep) ? path.join(target, path.relative(plan.from, db.from)) : db.from,
      to: db.to, sidecars: ["-wal", "-shm"],
    })), verifyFile: verifyDatabase,
  });
}
/** Released hosts have no lease. SQLite's exclusive lock is the admission proof. Never copy a live SQLite inode.
 * A WAL/SHM that survives while this probe holds that lock was left by an unclean stop (no process has the DB):
 * its committed frames are checkpointed into the main file, exactly as the site's next open would, and the
 * stale SHM is removed under the lock; close deletes the emptied WAL. Any journal still present afterwards refuses.
 * @complexity O(1) probes per DB, plus one checkpoint of a leftover WAL; no rows are read.
 */
export function assertDatabaseStopped({ path: file }: { path: string }, _options = {}): void {
  const db = new Database(file, { fileMustExist: true, timeout: 0 });
  try {
    // EXCLUSIVE locking mode keeps the lock until close and uses a heap wal-index, never the stale SHM.
    db.exec("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; ROLLBACK;");
    checkpointStoppedSqliteWal({ db, path: file });
    fs.rmSync(file + "-shm", { force: true });
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith("SQLITE_BUSY")) throw new Error(`Database is open in another process: ${file}. Stop it before moving it.`);
    throw error;
  } finally { db.close(); }
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(file + suffix)) throw new Error(`Database journal exists: ${file + suffix}. Stop the site and close/checkpoint its database before moving it.`);
  }
}
/** Read-only verification of every user table plus SQLite's full integrity check through Jini's
 * existing SQLite inspector. It now supports strict counts; its diagnostics mode still reports
 * partial results. No process is signalled: a recycled PID is not permission to stop another app.
 * Row counts include tables with unusual quoted names and distinguish identical totals per table.
 * @param options.verifyIntegrity - Integrity/row-count inspector; defaults to Jini's SQLite inspector.
 * @complexity O(database pages + all table rows), one stopped connection per verification.
 */
export function inspectStoppedDatabase({ path: file }: { path: string }, { verifyIntegrity = verifySqliteIntegrity }: { verifyIntegrity?: typeof verifySqliteIntegrity } = {}): string {
  // SQLite can create WAL/SHM even for a readonly connection. Remember exactly what existed;
  // only this inspection's artifacts may be removed, never a pre-existing journal.
  const absentSidecars = ["-wal", "-shm"].map((suffix) => file + suffix).filter((sidecar) => !fs.existsSync(sidecar));
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const checked = verifyIntegrity({ db }, { includeRowCounts: true });
    if (!checked.ok) throw new Error(`SQLite integrity_check failed for ${path.basename(file)}: ${checked.issues.map((issue) => issue.message).join('; ')}`);
    if (!checked.rowCounts) throw new Error("Build @jini-ai/db before running the stopped-site database mover.");
    return JSON.stringify(checked.rowCounts);
  } finally {
    try { db?.close(); }
    finally { for (const sidecar of absentSidecars) fs.rmSync(sidecar, { force: true }); }
  }
}

/** Move one selected nested-default site through the existing stopped/verified mover.
 * Callers resolve the directory from their catalog; this boundary rejects arbitrary source roots.
 * @returns The verified destination; throws on a running site, missing marker or collision.
 * @example await moveLegacySite({ dir }, { workspace });
 * @complexity The selected site's bytes plus SQLite verification and catalog I/O.
 */
export async function moveLegacySite({ dir }: { dir: string }, { workspace = createSitesWorkspace({}), projectsPaths, repoRoot = process.cwd() }: {
  workspace?: SitesWorkspace; projectsPaths?: readonly string[]; repoRoot?: string;
} = {}): Promise<string> {
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error("The source site must not be a symlink.");
  const from = fs.realpathSync(dir), root = path.dirname(from);
  if (root !== workspace.nestedSitesRoot({})) throw new Error("Only sites inside the former default sites/ folder can be moved to Documents/Tovu.");
  const moved = await moveSitesHome({ repoRoot }, { apply: true, workspace, sites: [path.basename(from)], sourceRoots: [root], projectsPaths });
  if (moved.length !== 1) throw new Error("No site matched this move. Check its folder and the default Documents/Tovu home.");
  return moved[0]!.to;
}

/** Rename a direct child of the configured sites home, preserving display name and identity.
 * Uses the stopped-site mover, including leases, DB checks, verified rollback and Jini's
 * registry relocate transaction. Filesystem/planning/move ports permit tests without home I/O.
 * @returns The old/new folder paths after the verified move commits.
 * @throws Invalid names, unsafe source, existing target, live owner or relocation failure.
 * @example await renameSiteFolder({ oldName: "old-site", newName: "new-site" });
 * @complexity O(site bytes + SQLite verification + catalog/reference bytes), via the mover.
 */
export async function renameSiteFolder(
  { oldName, newName }: { oldName: string; newName: string },
  { workspace: suppliedWorkspace, filesystem = fs, planMove = planSiteMove, moveSite = moveOneSite }: {
    workspace?: SitesWorkspace;
    filesystem?: Pick<typeof fs, "lstatSync" | "realpathSync">;
    planMove?: typeof planSiteMove;
    moveSite?: typeof moveOneSite;
  } = {},
): Promise<{ from: string; to: string }> {
  assertLocalSiteName({ name: oldName });
  assertLocalSiteName({ name: newName });
  // Windows device names are invalid directories even when the command runs on another OS.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(newName)) throw new ValidationError("Site folder name is reserved on Windows.");
  const workspace = suppliedWorkspace ?? createSitesWorkspace({});
  const home = filesystem.realpathSync(workspace.home({}));
  const from = path.join(home, oldName), to = path.join(home, newName);
  if (!filesystem.lstatSync(from).isDirectory()) throw new ValidationError("The source site must be a real directory, not a symlink.");
  const plan = planMove({ from, to, workspace });
  if (plan.running) throw new Error(`Site is running in ${plan.running.app}: ${from}. Stop it before renaming it.`);
  await moveSite({ plan, workspace }, { relocateDirectory: moveDirectoryVerified, verifyDatabase: inspectStoppedDatabase });
  return { from, to };
}
