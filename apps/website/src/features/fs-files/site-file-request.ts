import { relative } from 'node:path';
import { resolveFsFilePath } from './fs-files.js';
import { FS_ROOT_IDS, resolveFsRoots, type FsRootId } from './layout.js';

export interface SiteFileRequestDeps {
  workspaceId: string;
  siteBinding: { readonly dir: string };
  resolveRoots?: () => Record<FsRootId, string | undefined>;
}

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
    throw new FsRootNotFoundError({ message: `'${root}' is not a recognized root — expected one of: ${FS_ROOT_IDS.join(", ")}` }, {});
  }
  // Owner 2026-10-23 supersedes the September 10 broad-root decision for site-agent tools.
  // The catalog is descriptive; enforce here so direct and delegated executions share the gate.
  if (root === 'repo') throw new FsRootNotFoundError({ message: 'Site agents may only read inside this site folder; repo is unavailable' }, {});
  // The real resolver needs `workspaceId` to look up THIS workspace's persisted `custom` root
  // (`custom-root-store.ts` keys its map by it) — a test's own `resolveRoots` override ignores it.
  const roots = (routeDeps.resolveRoots ?? (() => resolveFsRoots({ siteDir: routeDeps.siteBinding.dir, workspaceId: routeDeps.workspaceId })))();
  const rootPath = roots[root as FsRootId];
  if (rootPath === undefined) {
    throw new FsRootNotFoundError({ message: `no folder has been set for the '${root}' root yet — ask the operator to set one from the chat composer, then retry` }, {});
  }
  return resolveFsFilePath({ rootPath: routeDeps.siteBinding.dir,
    relativePath: relative(routeDeps.siteBinding.dir, rootPath) || '.' });
}

/** Keep the site as the final I/O root. A custom-root symlink replaced after validation must not
 * become a new trusted reader base. Jini checks the selected-root contract, then checks the target
 * again against the site during the actual read/list. O(path depth), bounded by its reader limits.
 */
export function resolveSiteFileRequest({ routeDeps, root, relativePath }: {
  routeDeps: SiteFileRequestDeps; root: string; relativePath?: string;
}, _optional = {}): { rootPath: string; relativePath: string } {
  const siteRoot = resolveFsFilePath({ rootPath: routeDeps.siteBinding.dir, relativePath: '.' });
  const selectedRoot = resolveRootPathOrThrow({ routeDeps, root }, {});
  const target = resolveFsFilePath({ rootPath: selectedRoot, relativePath: relativePath ?? '.' });
  return { rootPath: siteRoot, relativePath: relative(siteRoot, target) || '.' };
}

