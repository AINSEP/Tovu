/** Reverse the shipped 0.1.14 nesting at startup through the existing stopped-site CLI owner. */
import fs from "node:fs";
import path from "node:path";
import { moveSiteHome } from "./move-site-home.ts";
import type { CliMode } from "./tovu-server.ts";

/** The slice of `shared-sites.ts`'s `SitesWorkspace` the migration reads; the real workspace satisfies it structurally. */
type MigrationWorkspace = {
  nestedSitesRoot: (required: Record<string, never>) => string | undefined;
  home: (required: Record<string, never>) => string;
  running: (required: { path: string }) => { peek: (required: Record<string, never>) => unknown };
  config: (required: Record<string, never>) => { configPath: string };
};
type RemoveDir = (dir: string) => void;

function migrationTargetExists({ to }: { to: string }): boolean {
  // lstat also sees dangling symlinks: an existing name is never an available target.
  try { fs.lstatSync(to); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return false;
}

async function migrateNestedSite(
  { workspace, home, dir, to, repoRoot, cliMode, projectsPath }: { workspace: MigrationWorkspace; home: string; dir: string; to: string; repoRoot: string; cliMode: CliMode; projectsPath: string },
  { move, report }: { move: typeof moveSiteHome; report: (message: string) => void },
): Promise<void> {
  try {
    if (migrationTargetExists({ to })) return;
    if (workspace.running({ path: dir }).peek({})) return;
    if ([`${home}.move.lock`, `${to}.creation.lock`, `${workspace.config({}).configPath}.lock`, path.join(dir, ".tovu-running.json.lock")].some((lock) => fs.existsSync(lock))) return;
    await move({ dir, repoRoot, cliMode, projectsPath });
  } catch (error) {
    // Never stop a site, overwrite a clash, or ask the owner to repair a refused move by hand.
    report(`Tovu kept ${dir} in place; automatic relocation will retry next launch. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function removeDisposableNestedCache({ root }: { root: string }): void {
  // 0.1.14 cached sibling thumbnails in sites/.tovu; they regenerate, so only they never keep the old folder alive.
  const cache = path.join(root, ".tovu"), disposable = (names: string[], allowed: string[]) => names.every((name) => allowed.includes(name));
  try {
    if (disposable(fs.readdirSync(root), [".tovu", ".DS_Store"]) && (!fs.existsSync(cache) || disposable(fs.readdirSync(cache), ["site-previews", "theme-previews"]))) {
      fs.rmSync(cache, { recursive: true, force: true }); fs.rmSync(path.join(root, ".DS_Store"), { force: true });
    }
  } catch { /* The rmdir below keeps the container whenever anything remains. */ }
}

function removeNestedSitesContainer({ root }: { root: string }, { report, removeDir }: { report: (message: string) => void; removeDir: RemoveDir }): void {
  // rmdir is non-recursive: a race or any retained site/file keeps the container intact.
  try { removeDir(root); }
  catch (error) {
    if (!["ENOTEMPTY", "EEXIST", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) report("Tovu kept the former sites folder because it could not be removed safely.");
  }
}

/** Move eligible siblings independently; refused sites stay at their recorded paths and are retried.
 * The CLI repeats admission under its locks, verifies SQLite/files, and commits both catalogs.
 * @param required.workspace The shared settings and running-lease owner.
 * @param options.move Existing CLI adapter, injectable without loading SQLite into Electron.
 * @param options.removeDir Non-recursive directory removal for the emptied container; defaults to `fs.rmdirSync`.
 * @returns Nothing; failures preserve discovery and must not prevent desktop startup.
 * @complexity O(n log n) ordered immediate candidates plus the existing mover's verification cost per stopped site.
 */
export async function migrateNestedSitesHome(
  { workspace, repoRoot, cliMode, projectsPath }: { workspace: MigrationWorkspace; repoRoot: string; cliMode: CliMode; projectsPath: string },
  { move = moveSiteHome, report = console.warn, removeDir = fs.rmdirSync }: { move?: typeof moveSiteHome; report?: (message: string) => void; removeDir?: RemoveDir } = {},
): Promise<void> {
  try {
    const root = workspace.nestedSitesRoot({});
    if (!root) return;
    const home = workspace.home({});
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const dir = path.join(root, entry.name), to = path.join(home, entry.name);
      await migrateNestedSite({ workspace, home, dir, to, repoRoot, cliMode, projectsPath }, { move, report });
    }
    removeDisposableNestedCache({ root });
    removeNestedSitesContainer({ root }, { report, removeDir });
  } catch {
    report("Tovu could not inspect the former sites folder; existing website paths remain available.");
  }
}
