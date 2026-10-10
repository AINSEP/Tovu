/** Operator-invoked only. Dry-run performs no stop, mkdir, lock cleanup, registry write or move. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { verifySqliteIntegrity } from "@jini-ai/db/sqlite";
import { resolveSiteDatabasePaths } from "../../apps/website/src/platform/site-dir/site-databases.js";
import { withFileLock, moveDirectoryVerified } from "@jini-ai/platform/fs";
import { createSitesWorkspace, type SitesWorkspace } from "../../apps/website/src/platform/site-dir/sites-home.js";
import { readSiteDir } from "../../apps/website/src/platform/site-dir/read-site-dir.js";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";

interface MovePlan { from: string; to: string; id: string; name: string; running: DirectoryRunningRecord | null;
  databases: { from: string; to: string }[];
}
export interface SitesMovePorts {
  workspace: SitesWorkspace;
  /** Kept for source compatibility; running sites are now always refused, never stopped. */
  stop(required: { dir: string; running: DirectoryRunningRecord }): Promise<void>;
  verifyDatabase(required: { path: string }): string;
}
/** Selection/reporting for checkout discovery; an absent or empty selection includes all sites. */
interface SitesMovePlanOptions {
  workspace?: SitesWorkspace;
  sites?: readonly string[];
  onSkipped?: (required: { dir: string }) => void;
}
/** Inspect validated immediate checkout children. Symlinked roots/sites and target collisions
 * are refused. No valid metadata is guessed for a legacy folder; initialize/repair it first.
 * Dot-folders and folders without config.json are reported through onSkipped, without validation.
 * @param options.sites - Optional checkout folder names to include, rather than display names.
 * @returns Move plans for selected sites; reads files only and preserves all real-site errors.
 * @example planSitesMove({ repoRoot }, { sites: ["tovu-dev"] });
 * @complexity O(n + s) directory/selection work and O(n) plan storage for n children, s selections,
 * plus the existing per-site metadata/catalog reads.
 */
export function planSitesMove({ repoRoot }: { repoRoot: string }, { workspace = createSitesWorkspace({}, { cwd: repoRoot }), sites, onSkipped }: SitesMovePlanOptions = {}): MovePlan[] {
  const checkoutSites = path.join(repoRoot, "sites");
  if (!fs.existsSync(checkoutSites)) return [];
  if (fs.lstatSync(checkoutSites).isSymbolicLink()) throw new Error("The checkout sites folder must not be a symlink.");
  const root = fs.realpathSync(checkoutSites);
  const home = workspace.home({});
  if (home === root || home.startsWith(root + path.sep)) throw new Error("Sites home must be outside the checkout sites folder.");
  const plans: MovePlan[] = [];
  const selectedNames = new Set(sites);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const from = path.join(root, entry.name), to = path.join(home, entry.name);
    if (entry.name.startsWith(".") || !fs.existsSync(path.join(from, "config.json"))) {
      onSkipped?.({ dir: from });
      continue;
    }
    if (selectedNames.size > 0 && !selectedNames.has(entry.name)) continue;
    const { meta, config } = readSiteDir({ dir: from });
    try { fs.lstatSync(to); throw new Error(`Move target already exists: ${to}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const existing = resolveSiteDatabasePaths({ dir: from, siteId: meta.siteId }, { workspace, reserveIdentity: false });
    const selected = resolveSiteDatabasePaths({ dir: to, siteId: meta.siteId }, { workspace, placement: workspace.config({}).databases });
    if (selected.contentDbPath.startsWith(from + path.sep)) throw new Error("App-data databases must be outside the site being moved.");
    const databases = [{ from: existing.contentDbPath, to: selected.contentDbPath }, { from: existing.chatDbPath, to: selected.chatDbPath }].filter((db) => fs.existsSync(db.from));
    for (const db of databases) {
      for (const suffix of ["", "-wal", "-shm"]) {
        if (fs.existsSync(db.from + suffix) && !fs.lstatSync(db.from + suffix).isFile()) throw new Error(`Database move requires a regular file: ${db.from + suffix}`);
        if (db.from !== db.to && fs.existsSync(db.to + suffix)) throw new Error(`Database move target already exists: ${db.to + suffix}`);
        if (fs.existsSync(db.to + suffix + ".home2-backup")) throw new Error(`Database backup target already exists: ${db.to + suffix}.home2-backup`);
      }
    }
    plans.push({ from, to, id: meta.siteId, name: config.name, databases, running: workspace.running({ path: from }).peek({}) });
  }
  return plans;
}
/** Require the site stopped, reserve both identities against boots, then verify and commit.
 * A crashed apply retains a verified destination or the original; it never silently overwrites.
 * @param options.sites - Optional checkout folder names, retained across every locked re-plan.
 * @returns The initial plans; dry runs only read, apply moves folders/databases and updates the registry.
 * @throws Existing validation, collision, running-site and database-integrity errors.
 * @example await moveSitesHome({ repoRoot }, { sites: ["tovu-dev"] });
 * @complexity O(total site bytes + SQLite verification), plus registry I/O.
 */
export async function moveSitesHome(
  { repoRoot }: { repoRoot: string }, { apply = false, workspace = createSitesWorkspace({}, { cwd: repoRoot }), verifyDatabase = inspectStoppedDatabase, sites, onSkipped }: Partial<SitesMovePorts> & SitesMovePlanOptions & { apply?: boolean } = {},
): Promise<MovePlan[]> {
  const plans = planSitesMove({ repoRoot }, { workspace, sites, onSkipped });
  if (!apply) return plans;
  const home = workspace.home({});
  // Lock parents can create directories too; refuse an absent volume before acquiring any lane.
  if (!fs.existsSync(path.dirname(home))) throw new Error(`Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`);
  await withFileLock({ lockPath: `${home}.move.lock`, run: async () => {
    // Fail before changing any site if another one is still running: a mixed batch must not
    // leave the operator with half a migration merely because the running item sorted last.
    for (const plan of planSitesMove({ repoRoot }, { workspace, sites })) {
      if (plan.running) throw new Error(`Site is running in ${plan.running.app}: ${plan.from}. Stop it before moving it.`);
      for (const db of plan.databases) assertDatabaseStopped({ path: db.from });
    }
    // Re-plan after obtaining the migration lane: another apply may have completed while waiting.
    for (const plan of planSitesMove({ repoRoot }, { workspace, sites })) {
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
          const registry = workspace.registry({});
          registry.merge({ entries: [{ id: plan.id, name: plan.name, path: plan.from, createdBy: "migrated", lastOpened: null }] });
          moveDirectoryVerified({ from: plan.from, to: plan.to, commit: () => {
            const verified = readSiteDir({ dir: plan.to });
            if (verified.meta.siteId !== plan.id) throw new Error("Moved site's identity did not match.");
            registry.relocate({ from: plan.from, to: plan.to });
          } }, { excluded: [".tovu-running.json", ".tovu-running.json.lock"],
            relocateFiles: ({ target }) => plan.databases.map((db) => ({
              from: db.from.startsWith(plan.from + path.sep) ? path.join(target, path.relative(plan.from, db.from)) : db.from,
              to: db.to, sidecars: ["-wal", "-shm"],
            })), verifyFile: verifyDatabase,
          });
        } finally {
          // Release at the new path only after the move, so cleanup never recreates the source.
          // Leases now live in app-data, so release both identities even after the source moves.
          workspace.running({ path: plan.from }).release({ token: reservation.record.token });
          if (targetToken) workspace.running({ path: plan.to }).release({ token: targetToken });
        }
      } }, { createParent: true, staleMs: Infinity });
    }
  } }, { createParent: true, staleMs: Infinity });
  return plans;
}
/** Released hosts have no lease. SQLite's exclusive lock is the admission proof, and surviving
 * journals require the owner to close/checkpoint the DB first. Never copy a live SQLite inode.
 * @complexity O(1) probes per DB; no rows are read or changed.
 */
export function assertDatabaseStopped({ path: file }: { path: string }, _options = {}): void {
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(file + suffix)) throw new Error(`Database journal exists: ${file + suffix}. Stop the site and close/checkpoint its database before moving it.`);
  }
  const db = new Database(file, { fileMustExist: true, timeout: 0 });
  try {
    db.exec("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; ROLLBACK;");
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith("SQLITE_BUSY")) throw new Error(`Database is open in another process: ${file}. Stop it before moving it.`);
    throw error;
  } finally { db.close(); }
}
/** Read-only verification of every user table plus SQLite's full integrity check through Jini's
 * existing SQLite inspector. It now supports strict counts; its diagnostics mode still reports
 * partial results. No process is signalled: a recycled PID is not permission to stop another app.
 * Row counts include tables with unusual quoted names and distinguish identical totals per table.
 * @complexity O(database pages + all table rows), one stopped connection per verification.
 */
export function inspectStoppedDatabase({ path: file }: { path: string }, _options = {}): string {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const checked = verifySqliteIntegrity({ db }, { includeRowCounts: true });
    if (!checked.ok) throw new Error(`SQLite integrity_check failed for ${path.basename(file)}: ${checked.issues.map((issue) => issue.message).join('; ')}`);
    if (!checked.rowCounts) throw new Error("Build @jini-ai/db before running the stopped-site database mover.");
    return JSON.stringify(checked.rowCounts);
  } finally { db.close(); }
}
/** Parse this mover's flags without performing discovery or I/O.
 * @returns Dry-run/apply mode, help mode and repeatable checkout folder names (empty means all).
 * @throws TypeError for unknown flags, positional arguments or missing site values.
 * @example parseSitesMoveArgs({ argv: ["--site", "tovu-dev", "--site", "luvira"] });
 * @complexity O(a) time and space for a argument tokens.
 */
export function parseSitesMoveArgs({ argv }: { argv: string[] }, _options = {}): { apply: boolean; help: boolean; sites: string[] } {
  const { values } = parseArgs({ args: argv, options: {
    apply: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    site: { type: "string", multiple: true, default: [] },
  } });
  return { apply: values.apply, help: values.help, sites: values.site };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseSitesMoveArgs({ argv: process.argv.slice(2) });
  if (args.help) {
    console.log(`Usage: npm run sites:move-home -- [--apply] [--site <name>]... [--help]

Move checkout sites/ folders to the configured sites home.
Default: all sites, dry run only. Dot-folders and folders without config.json are skipped.

Flags:
  --apply         Move sites; refuses running sites and keeps database backups.
  --site <name>   Limit to this checkout folder name; repeat to include more sites.
  --help, -h      Show this usage without planning or moving sites.`);
  } else {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const plans = await moveSitesHome({ repoRoot }, { apply: args.apply, sites: args.sites,
      onSkipped: ({ dir }) => console.log(`${dir}: skipped (not a site)`),
    });
    for (const plan of plans) console.log(`${args.apply ? "Moved" : "Would move"}: ${plan.from} -> ${plan.to}`);
    if (!args.apply) console.log("Dry run only. Stop every site (including npm run dev) first; --apply refuses running sites and keeps database backups.");
  }
}
