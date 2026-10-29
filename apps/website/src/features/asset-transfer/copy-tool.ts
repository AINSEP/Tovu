/** One bounded asset copy/import tool, parameterized across Tovu source and destination owners.
 * Native path.matchesGlob filters the existing bounded fs listing; all bytes are staged before writes.
 */
import { basename, matchesGlob } from "node:path";
import { ToolInputError, buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolDefinition, type DerivedRiskByToolId, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { MAX_DOCUMENT_BYTES, MediaValidationError, validateDocumentIngress } from "@jini-ai/cms/media";
import type { ToolContributor } from "@jini-ai/core";
import { approvalToolHandler, refuseUnexpectedKeys } from "#src/contracts/core/human-confirm";
import { toolMetadata } from "#src/contracts/core/tool-metadata/files-copy";
import { isShapeRejection as isThemeShapeRejection } from "../theme/asset-operations.js";
import { fetchImage, MEDIA_IMPORT_POLICY } from "../media-import/fetch-image.js";
import { isImportShapeRejection, withCallerSafeEgressRefusal } from "../media-import/tool-registrations.js";
import { THEME_IMPORT_MAX_BYTES, THEME_IMPORT_POLICY, THEME_IMPORT_ACCEPT } from "../theme/asset-operations.js";
import { ASSET_SOURCE_SCHEMA, readAssetSource, readLocalFile, resolveAssetSource } from "./asset-sources.js";
import { prepareAssetWrites, requireAssetDestination, writeAssetFiles, type AssetFile, type AssetToolDeps, type OverwritePolicy, type PreparedAssets } from "./asset-destinations.js";
import { FS_FILES_READ_PERMISSION } from "../fs-files/agent-tools.js";
import { FsFilePathError, listFsFiles } from "../fs-files/fs-files.js";
import { FsWriteInputError } from "../fs-files/write-files.js";
import { describeWriteBatch } from "../fs-files/tool-registrations.js";
import { createDocumentArchiveReader } from "../media/document-archive.js";

export const FILES_COPY_LIMITS = { maxFiles: 50, maxFileBytes: THEME_IMPORT_MAX_BYTES, maxTotalBytes: 25 * 1024 * 1024 } as const;
const catalog: AgentToolDefinition = {
  name: "files_copy",
  description: "Copy/import assets without Bash cp or Python. sources:[{root:'picked'|'site'|'theme'|'media',path,themeId?,glob?}|{root:'url',url,path?}]. " +
    "For a folder, glob filters paths relative to that folder (e.g. '**/*.{png,woff2}'); directory structure is preserved. No glob means one file. " +
    "destination:{kind:'theme',themeId,path:'assets'} | {kind:'site',path:'public/images'} | {kind:'media'} | {kind:'library'}. path is a destination folder for site/theme only. " +
    "Save documents from picked/site/theme files to the private, assistant-only Library with kind:'library'; never publishes them. Supports the Library document allow-list (.md, .txt, .pdf, .docx, etc.), at most 10 MiB/document; filesystem .key files (including Keynote) are refused by the secret guard. Folder paths are flattened to filenames. URL sources remain image/font imports and cannot target Library. For generated text use library_save_attachment {name,content}. " +
    "overwrite:'skip' (default), 'overwrite' or 'rename' for site/theme paths; media and Library documents are always added as new items. " +
    "Returns written/skipped paths, private documents, media URLs or theme status. Theme/media/Library edits use their existing permissions; site files use fs_write_files batch approval. Never writes to picked folders: use fs_write_files. " +
    "All sources are checked before writing; secrets, symlinks, escapes and truncated folder listings are refused. URLs use the existing SSRF-guarded image/font fetch. " +
    `Caps: ${FILES_COPY_LIMITS.maxFiles} files, ${FILES_COPY_LIMITS.maxFileBytes} bytes/asset (Library: 10 MiB/document), ${FILES_COPY_LIMITS.maxTotalBytes} bytes total; site writer additionally caps 2 MiB/file and 10 MiB/batch.`,
  sideEffects: "mutates-durable-state", authorization: { permission: FS_FILES_READ_PERMISSION },
  inputSchema: { type: "object", additionalProperties: false, required: ["sources", "destination"], properties: {
    sources: { type: "array", minItems: 1, maxItems: FILES_COPY_LIMITS.maxFiles, items: { type: "object", additionalProperties: false, required: ["root"], properties: {
      ...ASSET_SOURCE_SCHEMA.properties, root: { type: "string", enum: [...ASSET_SOURCE_SCHEMA.properties.root.enum, "url"] },
      url: { type: "string", minLength: 1 }, glob: { type: "string", minLength: 1, maxLength: 256 },
    } } },
    destination: { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["site", "theme", "media", "library"] }, path: { type: "string", minLength: 1 }, themeId: { type: "string", minLength: 1 } } },
    overwrite: { type: "string", enum: ["skip", "overwrite", "rename"] },
  } },
};
export const filesCopyAgentToolCatalog: AgentToolDefinition[] = [catalog];
export const filesCopyDerivedRisk: DerivedRiskByToolId = new Map([["files_copy", "mutates-durable-state"]]);
const byId = indexCatalogById({ catalog: filesCopyAgentToolCatalog });
const callerError = (error: unknown) => {
  if (error instanceof FsFilePathError || error instanceof FsWriteInputError || error instanceof MediaValidationError) return true;
  return isThemeShapeRejection(error) || isImportShapeRejection({ error });
};

/** URL sources reuse fetchImage and its safe egress port, with the existing theme font sniffer. */
async function readUrl({ deps, source, media }: { deps: AssetToolDeps; source: Record<string, unknown>; media: boolean }): Promise<AssetFile> {
  if (source.glob !== undefined) throw new ToolInputError({ message: "URL sources do not accept glob" });
  const url = requireString({ input: source, key: "url" });
  const fetched = await withCallerSafeEgressRefusal(deps.mediaImportEgressRefusalLog ?? console.warn, () => fetchImage(
    { deps: { httpClient: deps.mediaImportHttpClient, plainHttpTestOrigins: deps.outboundTestOrigins }, url },
    media ? { policy: { ...MEDIA_IMPORT_POLICY, maxBytes: FILES_COPY_LIMITS.maxFileBytes } } : { policy: THEME_IMPORT_POLICY, accept: THEME_IMPORT_ACCEPT },
  ), { toolId: "files_copy" });
  return { bytes: Buffer.from(fetched.bytes), path: source.path === undefined ? basename(fetched.url.pathname) : requireString({ input: source, key: "path" }), sourceUrl: fetched.url.href };
}

/** Validate the native glob input separately from filesystem I/O. */
function requireGlob({ glob, root }: { glob: unknown; root: unknown }): string {
  if (typeof glob !== "string" || !glob || glob.length > 256 || root === "media") throw new ToolInputError({ message: "glob must be 1..256 characters and target a filesystem folder" });
  return glob;
}

/** Expand folders through the existing bounded listing. A truncated listing cannot imply completeness.
 * The listing skips symlinks; each entry is re-walked on read because it may have changed since. */
async function readLocal({ deps, ctx, source, maxBytes }: { deps: AssetToolDeps; ctx: ToolExecutionContext; source: Record<string, unknown>; maxBytes: number }, _options = {}): Promise<AssetFile[]> {
  const { glob, ...input } = source;
  if (glob === undefined) {
    const file = await readAssetSource({ deps, ctx, input, maxBytes });
    return [{ ...file, path: basename(file.path) }];
  }
  const pattern = requireGlob({ glob, root: source.root });
  const { rootPath, relativePath: folder } = await resolveAssetSource({ deps, ctx, source: input });
  const listing = listFsFiles({ rootPath, relativePath: folder });
  const paths = listing.files.filter((path) => matchesGlob(path, pattern));
  if (listing.truncated || paths.length > FILES_COPY_LIMITS.maxFiles) throw new ToolInputError({ message: "Folder glob exceeds the file-count/traversal cap; narrow the folder or glob" });
  const files: AssetFile[] = [];
  let total = 0;
  for (const path of paths) {
    const bytes = await readLocalFile({ rootPath, relativePath: folder === "." ? path : `${folder}/${path}`, maxBytes });
    total += bytes.length;
    if (total > FILES_COPY_LIMITS.maxTotalBytes) throw new ToolInputError({ message: "Folder glob exceeds the total byte cap" });
    files.push({ path, bytes });
  }
  return files;
}

/** Authorize, stage and validate the complete aggregate before any card or write.
 * @throws Input/root/permission errors. @complexity O(total bytes + bounded folder entries). */
async function prepare({ deps, ctx }: { deps: AssetToolDeps; ctx: ToolExecutionContext }, _options = {}): Promise<PreparedAssets> {
  const input = requireInputRecord({ input: ctx.input });
  refuseUnexpectedKeys(input, ["sources", "destination", "overwrite"]);
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > FILES_COPY_LIMITS.maxFiles) throw new ToolInputError({ message: "sources must list 1..50 entries" });
  const { destination, prefix } = await requireCopyDestination({ deps, ctx, input: input.destination });
  const maxFileBytes = destination.kind === "library" ? MAX_DOCUMENT_BYTES : FILES_COPY_LIMITS.maxFileBytes;
  const policy = (input.overwrite ?? "skip") as OverwritePolicy;
  if (!["skip", "overwrite", "rename"].includes(policy)) throw new ToolInputError({ message: "overwrite must be skip, overwrite or rename" });
  const files: AssetFile[] = [];
  for (const raw of input.sources) {
    const group = await readGroup({ deps, ctx, raw, kind: destination.kind, maxFileBytes });
    appendFiles({ files, group, prefix }, { maxFileBytes });
  }
  return prepareAssetWrites({ deps, destination, files: destination.kind === "library" ? await prepareLibraryFiles({ deps, files }) : files, policy });
}

/** Preflight every document before saving any; Jini owns type/signature/archive and size guards.
 * Library has no directories; display filenames are flattened, and ingress rejects invalid names.
 * @throws MediaValidationError (the existing shape-rejection path). @complexity O(total bytes), bounded. */
async function prepareLibraryFiles({ deps, files }: { deps: AssetToolDeps; files: AssetFile[] }, _options = {}): Promise<AssetFile[]> {
  const documents = files.map(file => ({ ...file, path: basename(file.path) }));
  for (const file of documents) await validateDocumentIngress({ filename: file.path, bytes: file.bytes }, { archiveReader: deps.documentArchiveReader });
  return documents;
}

/** Authorized destination plus its folder prefix (theme default 'assets'); never the picked folder. */
async function requireCopyDestination({ deps, ctx, input }: { deps: AssetToolDeps; ctx: ToolExecutionContext; input: unknown }, _options = {}) {
  const raw = requireInputRecord({ input });
  if (raw.kind === "picked") throw new ToolInputError({ message: "Use fs_write_files to write to the picked folder" });
  const destination = await requireAssetDestination({ deps, ctx, input: raw });
  if ((destination.kind === "media" || destination.kind === "library") && raw.path !== undefined) throw new ToolInputError({ message: "Media and Library destinations do not have folders; omit destination.path" });
  const defaultPrefix = destination.kind === "theme" ? "assets" : "";
  const prefix = raw.path === undefined ? defaultPrefix : requireString({ input: raw, key: "path" });
  return { destination, prefix };
}

/** Select a source adapter after rejecting contradictory URL fields. */
async function readGroup({ deps, ctx, raw, kind, maxFileBytes }: { deps: AssetToolDeps; ctx: ToolExecutionContext; raw: unknown; kind: PreparedAssets['destination']['kind']; maxFileBytes: number }, _options = {}): Promise<AssetFile[]> {
  const source = requireInputRecord({ input: raw });
  refuseUnexpectedKeys(source, ["root", "path", "url", "themeId", "glob"]);
  if (source.root !== "url" && source.url !== undefined) throw new ToolInputError({ message: "url is only valid for root url" });
  if (source.root === "url" && kind === "library") throw new ToolInputError({ message: "Library copies need an allowed picked/site/theme file source, not an image URL" });
  if (source.root === "url") return [await readUrl({ deps, source, media: kind === "media" })];
  return readLocal({ deps, ctx, source, maxBytes: maxFileBytes });
}

/** Aggregate caps count all sources together; failure occurs before destination persistence. */
function appendFiles({ files, group, prefix }: { files: AssetFile[]; group: AssetFile[]; prefix: string }, { maxFileBytes = FILES_COPY_LIMITS.maxFileBytes }: { maxFileBytes?: number } = {}): void {
  for (const file of group) files.push({ ...file, path: prefix ? `${prefix}/${file.path}` : file.path });
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (files.length > FILES_COPY_LIMITS.maxFiles || total > FILES_COPY_LIMITS.maxTotalBytes || group.some((file) => file.bytes.length > maxFileBytes)) throw new ToolInputError({ message: "Copy exceeds file-count or byte caps; split the selection" });
}

/** Register one generic copy tool; site writes reuse the existing approval exchange.
 * @returns One registration. @complexity O(1). @example buildFilesCopyRegistrations(deps, surfaces); */
export function buildFilesCopyRegistrations(deps: AssetToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handler = approvalToolHandler<PreparedAssets>({ surfaces,
    prepare: ({ ctx }) => withSchemaOnRejection({ toolId: "files_copy", catalog: byId, isShapeRejection: ({ error }) => callerError(error), fn: () => prepare({ deps, ctx }) }),
    describe: ({ prepared }) => describeWriteBatch(prepared.batch ?? { folder: "", writes: [] }, { toolId: "files_copy" }),
    run: async ({ ctx, prepared }) => {
      if (!prepared.files.length) return { applied: false, written: [], skipped: prepared.skipped };
      const result = await writeAssetFiles({ deps, ctx, prepared });
      return { applied: !("failed" in result), ...result };
    },
  }, { flag: "applied", ask: ({ prepared }) => prepared.batch !== undefined });
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "files-copy", catalogModule: "features/fs-files/copy-tool.ts", catalog: byId, handlers: { files_copy: handler }, derivedRisk: filesCopyDerivedRisk });
}

/** Composition contribution; its own key preserves the existing fs-files catalog. */
export function contributeFilesCopyTools(): ToolContributor<AssetToolDeps, AssistantSurfaceDeps> {
  return { domain: "files-copy", build: (deps, surfaces) => buildFilesCopyRegistrations({ ...deps, documentArchiveReader: createDocumentArchiveReader({}) }, surfaces), risk: filesCopyDerivedRisk };
}
