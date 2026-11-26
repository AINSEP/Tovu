import { buildFsFilesRegistrations as buildWithPorts, resolvePickedFolder as resolveWithPorts,
  preparePickedFolderBatch as prepareWithPorts, fsFilesDerivedRisk } from '@jini-ai/cms/fs-files/tool-registrations';
import type { ToolContributor } from '@jini-ai/core';
import type { AuthorizeFn } from '@jini-ai/core/contracts/events';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import { createRandomUuidGenerator, createSystemClock } from '@jini-ai/platform/system';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { FsFilePathError } from '@jini-ai/platform/fs/guarded-reader';
import { writePreparedFiles } from '@jini-ai/cms/fs-files/write-files';
import { approvalToolHandler } from '#src/contracts/core/human-confirm';
import { refuseUnexpectedKeysPort as refuseUnexpectedKeys, type AgentToolDefinition } from '@jini-ai/core';
import { FS_FILES_READ_PERMISSION, getFsFilesAgentToolCatalog } from '@jini-ai/cms/fs-files/agent-tools';
import { listFsFiles, MAX_FS_FILE_BYTES, readFsFile, resolveFsFilePath } from './fs-files.js';
import { FS_ROOT_DESCRIPTORS, FS_ROOT_IDS, resolveFsRoots, type FsRootId } from './layout.js';
import { FsRootNotFoundError, resolveSiteFileRequest } from './site-file-request.js';

/**
 * This host's `fs-files` catalog: Jini's catalog bound to Tovu's three roots (`repo`/`site`/`custom`,
 * see `layout.ts` for why they are broad and the denylist in `fs-files.ts` is the primary gate) and
 * to the same byte ceiling `readFsFile` enforces, so the published schema and description cannot
 * drift from what the handlers accept.
 *
 * @complexity O(r) in the number of host roots.
 */
export function getHostFsFilesAgentToolCatalog(): AgentToolDefinition[] {
  return getFsFilesAgentToolCatalog({ rootIds: FS_ROOT_IDS, rootDescriptors: FS_ROOT_DESCRIPTORS, maxFileBytes: MAX_FS_FILE_BYTES });
}

const catalog = getHostFsFilesAgentToolCatalog();

export interface FsFilesToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  siteBinding: { readonly dir: string };
  /**
   * Test seam — defaults to the real {@link resolveFsRoots}. Overriding this is how a test points
   * `fs_list_files`/`fs_read_file` at a temporary fixture tree instead of a real `sites/<name>/`
   * directory, mirroring `SiteEvidenceToolDeps.siteEvidenceBrowser`'s identical "optional field,
   * real implementation by default" shape: the real resolver reads the injected
   * site binding and this repo's own `content/` tree, which a unit test need not stage. A root mapped to `undefined` (only ever `custom`, unset — see
   * `layout.ts`'s `resolveFsRoots` doc) is refused by {@link resolveRootPathOrThrow} rather than
   * dereferenced.
   */
  resolveRoots?: () => Record<FsRootId, string | undefined>;
}

export const resolvePickedFolder = ({ routeDeps }: { routeDeps: FsFilesToolDeps }, _optional = {}) =>
  resolveWithPorts({ routeDeps: { resolveFsRoots,
    get resolveRoots() { return routeDeps.resolveRoots; }, get siteBinding() { return routeDeps.siteBinding; },
    get workspaceId() { return routeDeps.workspaceId; },
  } });

export const preparePickedFolderBatch = ({ routeDeps, files }: { routeDeps: FsFilesToolDeps; files: unknown }, _optional = {}) =>
  prepareWithPorts({ routeDeps: { resolveFsRoots, resolveFsFilePath,
    get resolveRoots() { return routeDeps.resolveRoots; }, get siteBinding() { return routeDeps.siteBinding; },
    get workspaceId() { return routeDeps.workspaceId; },
  }, files });

export const buildFsFilesRegistrations = (
  routeDeps: FsFilesToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
) => buildWithPorts({ surfaces, resolveFsRoots, resolveFsFilePath, listFsFiles, readFsFile,
  get authorize() { return routeDeps.authorize; }, get workspaceId() { return routeDeps.workspaceId; },
  get siteBinding() { return routeDeps.siteBinding; }, get resolveRoots() { return routeDeps.resolveRoots; },
  resolveSiteFileRequest: ({ root, relativePath }, options) => resolveSiteFileRequest({ routeDeps, root, relativePath }, options),
  /** Errors a DIFFERENT input would fix, and therefore worth publishing the schema back with — mirrors
   *  `theme/tool-registrations.ts`'s identical `isShapeRejection` predicate for this domain's own two
   *  error classes. A genuine I/O failure (a permission-denied disk) is not one of these. */
  isShapeRejection: ({ error }) => error instanceof FsFilePathError || error instanceof FsRootNotFoundError,
  rootIds: FS_ROOT_IDS, readPermission: FS_FILES_READ_PERMISSION, catalog,
  approvalToolHandler, refuseUnexpectedKeys, writePreparedFiles,
});

export const contributeFsFilesTools = (): ToolContributor<FsFilesToolDeps, AssistantSurfaceDeps> =>
  ({ domain: 'fs-files', build: buildFsFilesRegistrations, risk: fsFilesDerivedRisk });
