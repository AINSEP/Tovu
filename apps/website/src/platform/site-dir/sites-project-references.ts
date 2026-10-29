/** Tovu's desktop catalog wire adapter. JSON locking/replacement/rollback belongs to Jini. */
import path from "node:path";
import type { DurableJsonChange } from "@jini-ai/platform/fs";

/** Cover installed and source desktop profiles, or only an explicitly selected profile.
 * Linux Electron uses XDG config while shared storage uses XDG data; both must be updated.
 * @complexity O(1); derives paths only, never touches a profile.
 */
export function desktopProjectPaths({ homeDir, appData, env, platform }: {
  homeDir: string; appData: string; env: NodeJS.ProcessEnv; platform: NodeJS.Platform;
}, _options = {}): string[] {
  const paths = platform === "win32" ? path.win32 : path;
  // Scratch profiles must never repoint the owner's real installed/source catalogs during a move.
  const override = env.TOVU_DESKTOP_USER_DATA_DIR?.trim();
  if (override) return [paths.join(appData, "desktop-projects.json")];
  const root = platform === "linux" ? env.XDG_CONFIG_HOME ?? paths.join(homeDir, ".config") : paths.dirname(appData);
  return [...new Set([appData, paths.join(root, "Tovu"), paths.join(root, "tovu-desktop")].map((dir) => paths.join(dir, "desktop-projects.json")))];
}

/** Repoint complete desktop rows and dismissal tombstones, preserving aliases and provenance.
 * This explicit verified migration retains creation authority; unproven Finder moves still use
 * desktop's Locate owner, which deliberately downgrades provenance. Missing profiles stay absent.
 * @throws Invalid catalog schema; unknown records must never be treated as an empty list.
 * @complexity O(n) catalog rows/tombstones; no I/O.
 */
export function relocateDesktopProjects({ value, from, to }: { value: unknown; from: string; to: string }, _options = {}): unknown {
  if (value === undefined) return undefined;
  const state = desktopCatalog({ value });
  if (state.projects.some((row) => isProjectRow(row) && row.siteDir === to) && state.projects.some((row) => isProjectRow(row) && row.siteDir === from)) throw new Error("Desktop move target is already tracked.");
  return { ...state, projects: state.projects.map((row) => isProjectRow(row) && row.siteDir === from ? { ...row, siteDir: to } : row),
    ...(state.dismissed ? { dismissed: [...new Set(state.dismissed.map((dir) => dir === from ? to : dir))] } : {}),
  };
}

interface DesktopCatalog { projects: unknown[]; dismissed?: string[]; [field: string]: unknown }

/** @throws When the catalog is not an object with a projects array and string dismissals. */
function desktopCatalog({ value }: { value: unknown }): DesktopCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Desktop projects catalog is invalid.");
  const state = value as { projects?: unknown; dismissed?: unknown };
  if (!Array.isArray(state.projects) || !validDismissals(state.dismissed)) throw new Error("Desktop projects catalog is invalid.");
  return state as DesktopCatalog;
}

/** Dismissal tombstones are optional, but when present every entry is a folder path. */
function validDismissals(dismissed: unknown): boolean {
  return dismissed === undefined || (Array.isArray(dismissed) && dismissed.every((dir) => typeof dir === "string"));
}

// Match desktop's reader: unusable rows are invisible to the app, so retain their bytes'
// values instead of making unrelated damage block a valid site's explicit relocation.
function isProjectRow(row: unknown): row is { siteDir: string; createdAt: string } {
  return !!row && typeof row === "object" && typeof (row as { siteDir?: unknown }).siteDir === "string" && typeof (row as { createdAt?: unknown }).createdAt === "string";
}

/** Build the product's reference participants for the shared locked relocation transaction. */
export function sitesProjectReferences({ workspace, from, to }: { workspace: { projectsPaths: readonly string[] }; from: string; to: string },
  { projectsPaths = workspace.projectsPaths }: { projectsPaths?: readonly string[] } = {},
): DurableJsonChange[] {
  return [...new Set(projectsPaths)].map((filePath) => ({ filePath, transform: (value) => relocateDesktopProjects({ value, from, to }) }));
}
