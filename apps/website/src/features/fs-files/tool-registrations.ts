import {
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type AuthorizeFn,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";

import {
  FS_FILES_READ_PERMISSION,
  FS_LIST_FILES_TOOL_ID,
  FS_READ_FILE_TOOL_ID,
  getFsFilesAgentToolCatalog,
} from "./agent-tools.js";
import { FsFilePathError, listFsFiles, readFsFile } from "./fs-files.js";
import { FS_ROOT_IDS, resolveFsRoots, type FsRootId } from "./layout.js";

/**
 * @file Wires `fs_list_files`/`fs_read_file` into the assistant's tool catalog, through the same
 * `buildDomainRegistrations` gate and `registerToolContributor` seam every other first-party domain
 * uses (`theme/tool-registrations.ts`, `site-evidence/tool-registrations.ts`).
 *
 * Authorization shape: neither `fs-files.ts` nor `layout.ts` accepts an `authorize` dependency — like
 * `theme-files.ts`, they are pure discovery/filesystem functions with no notion of a principal, so
 * both handlers below call `requireToolPermission` inline, ADR-021 §2's single evaluator located at
 * the handler rather than inside the domain function.
 *
 * No live-state coupling: unlike `theme_write_file`, nothing here writes anything or replaces an
 * in-memory `routeDeps` entry — both handlers are pure reads.
 */

const CATALOG_BY_ID = indexCatalogById(getFsFilesAgentToolCatalog());

export interface FsFilesToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /**
   * Test seam — defaults to the real {@link resolveFsRoots}. Overriding this is how a test points
   * `fs_list_files`/`fs_read_file` at a temporary fixture tree instead of a real `sites/<name>/`
   * directory, mirroring `SiteEvidenceToolDeps.siteEvidenceBrowser`'s identical "optional field,
   * real implementation by default" shape for the same reason: the real resolver reads
   * `process.cwd()`/`process.env` and this repo's own `content/` tree, neither of which a unit test
   * should have to stage.
   */
  resolveRoots?: () => Record<FsRootId, string>;
}

/** Raised when `root` does not name one of {@link FS_ROOT_IDS} — a different `root` is exactly what
 *  would fix this, so it is a shape rejection like {@link FsFilePathError}. */
class FsRootNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FsRootNotFoundError";
  }
}

function isFsRootId(value: string): value is FsRootId {
  return (FS_ROOT_IDS as readonly string[]).includes(value);
}

/** Errors a DIFFERENT input would fix, and therefore worth publishing the schema back with — mirrors
 *  `theme/tool-registrations.ts`'s identical `isShapeRejection` predicate for this domain's own two
 *  error classes. A genuine I/O failure (a permission-denied disk) is not one of these. */
function isShapeRejection(error: unknown): boolean {
  return error instanceof FsFilePathError || error instanceof FsRootNotFoundError;
}

/**
 * Resolves `root` to its real absolute directory, refusing an unrecognized id outright rather than
 * letting an invalid string reach `resolveFsRoots`'s own record lookup as `undefined`.
 */
function resolveRootPathOrThrow(routeDeps: FsFilesToolDeps, root: string): string {
  if (!isFsRootId(root)) {
    throw new FsRootNotFoundError(`'${root}' is not a recognized root — expected one of: ${FS_ROOT_IDS.join(", ")}`);
  }
  const roots = (routeDeps.resolveRoots ?? resolveFsRoots)();
  return roots[root];
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually does.
 * See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own `sideEffects`
 * declaration.
 */
export const fsFilesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listFsFiles(): a bounded readdir walk under one allowed root, no writes.
  [FS_LIST_FILES_TOOL_ID, "none"],
  // -> readFsFile(): one readFileSync under one allowed root, no writes.
  [FS_READ_FILE_TOOL_ID, "none"],
]);

export function buildFsFilesRegistrations(routeDeps: FsFilesToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [FS_LIST_FILES_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const root = requireString(input, "root");
      const relativePath = optionalString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: FS_FILES_READ_PERMISSION,
        entityType: "fs-root",
        entityId: root,
      });

      return withSchemaOnRejection({ toolId: FS_LIST_FILES_TOOL_ID, catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const rootPath = resolveRootPathOrThrow(routeDeps, root);
        const files = listFsFiles({ rootPath, relativePath });
        return { root, path: relativePath ?? "", files };
      });
    },

    [FS_READ_FILE_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const root = requireString(input, "root");
      const relativePath = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: FS_FILES_READ_PERMISSION,
        entityType: "fs-root",
        entityId: root,
      });

      return withSchemaOnRejection({ toolId: FS_READ_FILE_TOOL_ID, catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const rootPath = resolveRootPathOrThrow(routeDeps, root);
        const { content, bytes } = readFsFile({ rootPath, relativePath });
        return { root, path: relativePath, content, bytes };
      });
    },
  };

  return buildDomainRegistrations({
    domain: "fs-files",
    catalogModule: "features/fs-files/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: fsFilesDerivedRisk,
  });
}

/**
 * Contributes the `fs-files` domain's AI tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not
 * by importing this module.
 */
export function contributeFsFilesTools(): ToolContributor {
  return { domain: "fs-files", build: buildFsFilesRegistrations, risk: fsFilesDerivedRisk };
}
