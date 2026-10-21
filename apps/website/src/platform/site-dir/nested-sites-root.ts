import fs from "node:fs";
import path from "node:path";
import { createDurableJsonFile, createNodeDurableJsonPorts, type createNodeDirectoryWorkspace, type DurableJsonNotices, type DurableJsonPorts } from "@jini-ai/platform/fs";

type DirectoryWorkspace = ReturnType<typeof createNodeDirectoryWorkspace>;
/** Folder reads behind the nested-sites probe; node:fs in production, a typed fake in tests. */
export interface NestedSitesFolders {
  readdirSync(dir: string): string[];
  existsSync(file: string): boolean;
  lstatSync(file: string): { isDirectory(): boolean };
}

/** The released 0.1.14 default nested sites in Documents/Tovu/sites; desktop startup moves them back up.
 * Explicit homes (saved setting or environment override) keep their contracts and never qualify.
 * Sites the move skips (running, locked, name clash) stay discoverable without saving an extra root.
 * @complexity O(n) immediate children of the nested folder; never writes settings.
 */
export function nestedSitesCompat(
  { workspace }: { workspace: Pick<DirectoryWorkspace, "config" | "home" | "roots"> },
  { ports = createNodeDurableJsonPorts({}), folders = fs }: { ports?: DurableJsonPorts; folders?: NestedSitesFolders } = {},
) {
  const nestedSitesRoot = (_required: Record<string, never>) => nestedRoot({ workspace }, { ports, folders });
  return { nestedSitesRoot, roots: (_required: Record<string, never>) => {
    const roots = workspace.roots({}), nested = nestedSitesRoot({});
    return nested && holdsSites({ folder: nested }, { folders }) ? [...new Set([...roots, nested])] : roots;
  } };
}

/** True when an immediate child is a site; an unlistable folder contributes nothing. */
function holdsSites({ folder }: { folder: string }, { folders }: { folders: NestedSitesFolders }): boolean {
  try {
    return folders.readdirSync(folder).some((name) => folders.existsSync(path.join(folder, name, ".site-meta.json")));
  } catch { return false; }
}

function nestedRoot(
  { workspace }: { workspace: Pick<DirectoryWorkspace, "config" | "home"> },
  { ports, folders }: { ports: DurableJsonPorts; folders: NestedSitesFolders },
): string | undefined {
  const config = workspace.config({});
  if (config.overrides.sitesHome || savedHomeOrUnknown({ configPath: config.configPath }, { ports })) return undefined;
  const root = path.join(workspace.home({}), "sites");
  try {
    if (!folders.lstatSync(root).isDirectory()) return undefined;
    // A real website named "sites" is a website, never a compatibility container.
    if (folders.existsSync(path.join(root, ".site-meta.json"))) return undefined;
    return root;
  } catch { return undefined; }
}

/** Notices for the sites settings store. This probe only reads (reads never lock), so the lock
 * notice is the store's contract for its locked writers, not something this probe reaches. */
export const SITES_SETTINGS_NOTICES: DurableJsonNotices = Object.freeze({
  prefix: "Tovu sites", lockTimeout: () => "Tovu sites settings are locked.",
});

/** True when the saved setting chooses a home, or cannot be read. */
function savedHomeOrUnknown({ configPath }: { configPath: string }, { ports }: { ports: DurableJsonPorts }): boolean {
  const saved = createDurableJsonFile({ ...ports, filePath: configPath, notices: SITES_SETTINGS_NOTICES }).read({});
  // An unreadable setting may contain a custom pointer: discovery must not authorize a move.
  if (saved.state === "unreadable") return true;
  return saved.state === "ok" && (saved.value as { sitesHome?: unknown } | null)?.sitesHome !== undefined;
}
