import { basename } from "node:path";
import { toolMetadata } from '../../contracts/core/tool-metadata/fs-files.js';
import { ToolInputError, buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission, type AuthorizeFn } from "@jini-ai/cms/core";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";

import type { ToolContributor } from "#src/assistant/index";
import { approvalToolHandler, refuseUnexpectedKeys, type HumanConfirmSpec } from '#src/contracts/core/human-confirm';

import {
  FS_FILES_READ_PERMISSION,
  FS_LIST_FILES_TOOL_ID,
  FS_READ_FILE_TOOL_ID,
  FS_WRITE_FILES_TOOL_ID,
  getFsFilesAgentToolCatalog,
} from "./agent-tools.js";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "./custom-root-permission.js";
import { FsFilePathError, listFsFiles, readFsFile } from "./fs-files.js";
import { FS_ROOT_IDS, resolveFsRoots, type FsRootId } from "./layout.js";
import { FsRootNotFoundError, resolveSiteFileRequest } from "./site-file-request.js";
import { FsWriteInputError, prepareFileWrites, requirePickedFolder, writePreparedFiles, type PreparedFileWrite } from "./write-files.js";

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
 * No live-state coupling: unlike `theme_write_file`, nothing here replaces an in-memory `routeDeps`
 * entry — both read handlers are pure reads, and `fs_write_files` (owner 2026-10-27) only writes
 * files into the picked folder after the human approves the exact batch on one card.
 */

const CATALOG_BY_ID = indexCatalogById({ catalog: getFsFilesAgentToolCatalog() });

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

/** Errors a DIFFERENT input would fix, and therefore worth publishing the schema back with — mirrors
 *  `theme/tool-registrations.ts`'s identical `isShapeRejection` predicate for this domain's own two
 *  error classes. A genuine I/O failure (a permission-denied disk) is not one of these. */
function isShapeRejection(error: unknown): boolean {
  return error instanceof FsFilePathError || error instanceof FsRootNotFoundError;
}

/** Raw exported handlers can bypass schema normalization; keep this execution guard.
 * Filesystem tools cannot retarget another site's binding, even through a delegated call.
 * O(1); throws a caller-correctable rejection before any filesystem access.
 */
function requireCurrentSite({ input }: { input: Record<string, unknown> }, _optional = {}): void {
  if (input.site !== undefined) throw new ToolInputError({ message: 'Filesystem tools use only the active site; a site selector is not accepted' });
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
  // -> writePreparedFiles(): creates or replaces files in the picked folder after one approval.
  [FS_WRITE_FILES_TOOL_ID, "mutates-durable-state"],
]);

/** Require the caller to choose a filesystem scope; never guess a root from an empty call.
 * @returns The supplied non-empty root, for the existing resolver and authorization gate.
 * @throws ToolInputError with the allowed roots and a complete listing example.
 * @complexity O(1), no effects.
 */
function requireFsRootInput({ input, toolId }: { input: Record<string, unknown>; toolId: string }, _options = {}): string {
  if (typeof input.root !== "string" || input.root.length === 0) {
    throw new ToolInputError({ message: `${toolId}: 'root' (non-empty string) is required. Choose one of: ${FS_ROOT_IDS.join(", ")}. Example: fs_list_files({"root":"site"}); fs_read_file({"root":"site","path":"README.md"}).` });
  }
  return input.root;
}

/** `find` has no equivalent in this full-file reader: explain how to read the text instead.
 * @throws ToolInputError before policy or filesystem I/O when find is supplied.
 * @complexity O(1); returns the caller input unchanged when no correction is needed.
 */
function normalizeFsReadInput({ input }: { input: Record<string, unknown> }, _options = {}) {
  if (Object.hasOwn(input, "find")) {
    throw new ToolInputError({ message: `Unknown input 'find'. Accepted properties: root, path (both required); also site if listed in this tool's input schema. fs_read_file returns full file content and has no text-search parameter. Send fs_read_file({"root":"site","path":"README.md"}) and search the returned content.` });
  }
  return { input, notes: [] };
}

interface PreparedWriteBatch { readonly folder: string; readonly writes: readonly PreparedFileWrite[] }

const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/** The existing approval card, one per batch: a line per file (new/overwrite, size, path) and the
 * total. No `rememberKey`, so no "always allow" — every batch gets its own card. O(n) in files. */
function describeWriteBatch({ folder, writes }: PreparedWriteBatch): HumanConfirmSpec {
  const overwrites = writes.filter((write) => write.overwrite).length;
  const total = writes.reduce((sum, write) => sum + write.bytes.length, 0);
  const lines = writes.map((write) => `${write.overwrite ? "overwrite" : "new      "}  ${kb(write.bytes.length).padStart(9)}  ${write.path}`);
  return { toolId: FS_WRITE_FILES_TOOL_ID, errorCode: "FS_WRITE", title: `Write ${writes.length} file(s) to ${basename(folder)}?`,
    details: [{ label: "Folder", value: folder }, { label: "Files", value: lines.join("\n"), format: "code" }, { label: "Total", value: kb(total) }],
    ...(overwrites > 0 ? { warning: `Replaces ${overwrites} existing file(s). There is no undo.`, danger: true } : {}),
    confirmLabel: "Write files" };
}

export function buildFsFilesRegistrations(
  routeDeps: FsFilesToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [FS_LIST_FILES_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      requireCurrentSite({ input }, {});
      const root = requireFsRootInput({ input, toolId: FS_LIST_FILES_TOOL_ID });
      const relativePath = optionalString({ input: input, key: "path" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: FS_FILES_READ_PERMISSION }, { entityType: "fs-root", entityId: root });

      return withSchemaOnRejection({ toolId: FS_LIST_FILES_TOOL_ID, catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection(error), fn: async () => {
        const fileRequest = resolveSiteFileRequest({ routeDeps, root, ...(relativePath === undefined ? {} : { relativePath }) }, {});
        // `truncated` is forwarded rather than dropped: `listFsFiles` stops at its own bounds, and a
        // caller handed only a short array cannot tell a small directory from a cut-off listing —
        // which is exactly the wrong thing for a model about to conclude "that file does not exist".
        const { files, truncated } = listFsFiles(fileRequest);
        return { root, path: relativePath ?? "", files, truncated };
      } });
    },

    [FS_READ_FILE_TOOL_ID]: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      requireCurrentSite({ input }, {});
      const root = requireFsRootInput({ input, toolId: FS_READ_FILE_TOOL_ID });
      const relativePath = requireString({ input: input, key: "path" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: FS_FILES_READ_PERMISSION }, { entityType: "fs-root", entityId: root });

      return withSchemaOnRejection({ toolId: FS_READ_FILE_TOOL_ID, catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection(error), fn: async () => {
        const fileRequest = resolveSiteFileRequest({ routeDeps, root, relativePath }, {});
        const { content, bytes } = readFsFile(fileRequest);
        return { root, path: relativePath, content, bytes };
      } });
    },

    [FS_WRITE_FILES_TOOL_ID]: approvalToolHandler<PreparedWriteBatch>({ surfaces,
      prepare: async ({ ctx }) => {
        const input = requireInputRecord({ input: ctx.input });
        refuseUnexpectedKeys(input, ["files"]);
        await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId,
          principalId: ctx.principal.id, permission: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION }, { entityType: "fs-root", entityId: "custom" });
        const custom = (routeDeps.resolveRoots ?? (() => resolveFsRoots({ siteDir: routeDeps.siteBinding.dir, workspaceId: routeDeps.workspaceId })))().custom;
        try {
          if (custom === undefined) throw new FsWriteInputError({ message: "No folder is picked — ask the person to pick one with the composer's folder button" });
          const folder = requirePickedFolder({ dir: custom, siteDir: routeDeps.siteBinding.dir });
          return { folder, writes: prepareFileWrites({ folder, files: input.files }) };
        } catch (error) {
          throw error instanceof FsWriteInputError ? new ToolInputError({ message: error.message }) : error;
        }
      },
      describe: ({ prepared }) => describeWriteBatch(prepared),
      run: async ({ prepared }) => {
        const outcome = writePreparedFiles(prepared);
        return { applied: outcome.failed === undefined, ...outcome };
      },
    }, { flag: "applied" }),
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "fs-files",
    catalogModule: "features/fs-files/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    inputNormalizers: { [FS_READ_FILE_TOOL_ID]: normalizeFsReadInput },
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
