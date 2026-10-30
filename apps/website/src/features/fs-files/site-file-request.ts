import { isAbsolute, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { FsFilePathError, resolveFsFilePath } from './fs-files.js';
import { FS_ROOT_IDS, resolveFsRoots, type FsRootId } from './layout.js';

export interface SiteFileRequestDeps {
  workspaceId: string;
  siteBinding: { readonly dir: string };
  resolveRoots?: () => Record<FsRootId, string | undefined>;
}

/** The human selects the grant; tools only consume it. There is no model-controlled picker tool. */
export const FS_FOLDER_READ_RECOVERY = 'Ask the owner to pick that folder with the chat composer folder button (or drop the folder onto the composer), then call fs_list_files with root:"custom" and media_import_local_file with root:"custom" and the file path relative to that folder. Alternatively, ask the owner to attach the file to this chat, then use media_promote_chat_attachment.';

/** Raised when `root` does not name one of {@link FS_ROOT_IDS} — a different `root` is exactly what
 *  would fix this, so it is a shape rejection like {@link FsFilePathError}. */
export class FsRootNotFoundError extends Error {
  constructor({ message }: { message: string }, _options = {}) {
    super(message);
    this.name = "FsRootNotFoundError";
  }
}

function isFsRootId({ value }: { value: string }, _optional = {}): boolean {
  return (FS_ROOT_IDS as readonly string[]).includes(value);
}

/**
 * Resolves `root` to its real absolute directory, refusing an unrecognized id outright rather than
 * letting an invalid string reach `resolveFsRoots`'s own record lookup as `undefined` — and refusing
 * a recognized id that resolved to `undefined` (today, only `custom` before an operator has set one)
 * with a message that tells the caller what would fix it, rather than throwing a raw lookup failure.
 */
function resolveRootPathOrThrow({ routeDeps, root }: { routeDeps: SiteFileRequestDeps; root: string }, _optional = {}): string {
  if (!isFsRootId({ value: root }, {})) {
    throw new FsRootNotFoundError({ message: `'${root}' is not a recognized root — expected one of: ${FS_ROOT_IDS.join(", ")}. ${FS_FOLDER_READ_RECOVERY}` }, {});
  }
  // Owner 2026-10-23 supersedes the September 10 broad-root decision for site-agent tools.
  // The catalog is descriptive; enforce here so direct and delegated executions share the gate.
  if (root === 'repo') throw new FsRootNotFoundError({ message: `repo is unavailable to site agents; use site or the owner-picked custom root. ${FS_FOLDER_READ_RECOVERY}` }, {});
  // The real resolver needs `workspaceId` to look up THIS workspace's persisted `custom` root
  // (`custom-root-store.ts` keys its map by it) — a test's own `resolveRoots` override ignores it.
  const roots = (routeDeps.resolveRoots ?? (() => resolveFsRoots({ siteDir: routeDeps.siteBinding.dir, workspaceId: routeDeps.workspaceId })))();
  const rootPath = roots[root as FsRootId];
  if (rootPath === undefined) {
    throw new FsRootNotFoundError({ message: `no folder has been set for the '${root}' root yet — ask the operator to set one from the chat composer, then retry. ${FS_FOLDER_READ_RECOVERY}` }, {});
  }
  return rootPath;
}

/** Select the final read base separately from root-id lookup. Every target is checked again by
 * Jini's guarded reader during I/O. @throws FsFilePathError for an unsafe selected root.
 * @complexity O(path depth) for bounded containment checks; no file contents are read.
 */
function resolveReadScope({ siteDir, siteRoot, root, rootPath }: {
  siteDir: string; siteRoot: string; root: string; rootPath: string;
}, _options = {}): { rootPath: string; selectedRoot: string; inputRoot: string } {
  const fromSite = relative(siteDir, rootPath);
  // Owner s5 (2026-10-29): the persisted picked folder is an additional READ grant.
  // Keep the site base for in-site custom roots, so replacing a custom symlink cannot widen it.
  const externalPicked = root === 'custom' && (fromSite.split(sep).includes('..') || isAbsolute(fromSite));
  const ioRoot = externalPicked ? resolveFsFilePath({ rootPath, relativePath: '.' }) : siteRoot;
  const selectedRoot = resolveFsFilePath({ rootPath: ioRoot, relativePath: externalPicked ? '.' : fromSite || '.' });
  return { rootPath: ioRoot, selectedRoot, inputRoot: rootPath };
}

/** Keep the site as the final I/O root for site reads. An external owner-picked folder uses its
 * canonical directory as the read base; no write authority is added. Jini checks the selected-root
 * contract and checks the target again during the actual read/list. Absolute/~/ paths are accepted
 * only for the picked folder and must resolve inside it. O(path depth), bounded by reader limits.
 */
export function resolveSiteFileRequest({ routeDeps, root, relativePath }: {
  routeDeps: SiteFileRequestDeps; root: string; relativePath?: string;
}, { homeDir = homedir() }: { homeDir?: string } = {}): { rootPath: string; relativePath: string } {
  try {
    const siteRoot = resolveFsFilePath({ rootPath: routeDeps.siteBinding.dir, relativePath: '.' });
    const selected = resolveRootPathOrThrow({ routeDeps, root }, {});
    const { rootPath, selectedRoot, inputRoot } = resolveReadScope({ siteDir: routeDeps.siteBinding.dir, siteRoot, root, rootPath: selected });
    const requestedPath = (relativePath ?? '.').replace(/^~\//, () => homeDir + sep);
    const selectedPath = root === 'custom' && isAbsolute(requestedPath) ? relative(inputRoot, requestedPath) || '.' : requestedPath;
    const target = resolveFsFilePath({ rootPath: selectedRoot, relativePath: selectedPath });
    return { rootPath, relativePath: relative(rootPath, target) || '.' };
  } catch (error) {
    if (error instanceof FsFilePathError) throw new FsFilePathError({ message: `${error.message}. ${FS_FOLDER_READ_RECOVERY}` });
    throw error;
  }
}

