/** Tovu asset-tool destination adapter. Both copy and transform call the existing guarded batch,
 * theme writer/reloader or media importer; no parallel persistence or approval lifecycle.
 * Site paths share fs_write_files' exact-batch approval because they lack theme/media validators.
 */
import { basename } from "node:path";
import { ToolInputError, requireInputRecord, requireString, type ToolExecutionContext } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { refuseUnexpectedKeys } from "#src/contracts/core/human-confirm";
import { persistImportedMedia, type MediaImportToolDeps } from "../media-import/tool-registrations.js";
import { validateImageBytes } from "../media-import/fetch-image.js";
import { THEME_WRITE_PERMISSION } from "../theme/agent-tools.js";
import { resolveThemeFilePath, writeThemeBinaryFile, nextAvailableFileName } from "../theme/theme-files.js";
import { assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, type ThemeToolDeps } from "../theme/tool-registrations.js";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "./custom-root-permission.js";
import { inspectWriteTarget, prepareFileWrites, writePreparedFiles } from "./write-files.js";
import { preparePickedFolderBatch, type FsFilesToolDeps, type PreparedWriteBatch } from "./tool-registrations.js";

export type AssetToolDeps = FsFilesToolDeps & ThemeToolDeps & MediaImportToolDeps;
export interface AssetFile { path: string; bytes: Buffer; sourceUrl?: string }
export interface AssetDestination { kind: "site" | "theme" | "media" | "picked"; themeId?: string }
export interface PreparedAssets { destination: AssetDestination; files: AssetFile[]; skipped: string[]; batch?: PreparedWriteBatch }
export type OverwritePolicy = "skip" | "overwrite" | "rename";
const PERMISSION = { site: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION, picked: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION, theme: THEME_WRITE_PERMISSION, media: "media.upload" };

/** Authorize the destination before reading sources. @throws ToolInputError or permission refusal.
 * @complexity O(1). @example await requireAssetDestination({ deps, ctx, input: { kind: 'theme', themeId: 'basic' } }); */
export async function requireAssetDestination({ deps, ctx, input }: { deps: AssetToolDeps; ctx: ToolExecutionContext; input: unknown }, _options = {}): Promise<AssetDestination> {
  if (input === undefined) throw new ToolInputError({ message: "A write needs destination.kind: site, theme, media or picked" });
  const value = requireInputRecord({ input });
  refuseUnexpectedKeys(value, ["kind", "themeId", "path"]);
  const kind = requireString({ input: value, key: "kind" }) as AssetDestination["kind"];
  if (!Object.hasOwn(PERMISSION, kind)) throw new ToolInputError({ message: "destination.kind must be site, theme, media or picked" });
  const themeId = kind === "theme" ? requireString({ input: value, key: "themeId" }) : undefined;
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: PERMISSION[kind] }, { entityType: kind === "picked" ? "fs-root" : kind, entityId: themeId ?? kind });
  return { kind, themeId };
}

/** Decide collisions against disk AND earlier entries; rename uses the existing file-name owner.
 * No writes occur. Bounded to 1000 suffix probes rather than an unbounded directory scan. */
function choosePath({ folder, path, policy, reserved }: { folder: string; path: string; policy: OverwritePolicy; reserved: Set<string> }): string | undefined {
  let candidate = path;
  const occupiedPaths = new Set<string>();
  for (let attempt = 0; attempt < 1000; attempt++) {
    const alreadyInBatch = reserved.has(candidate.toLowerCase());
    if (alreadyInBatch && policy === "overwrite") throw new ToolInputError({ message: `${candidate}: duplicate destination in this batch` });
    const occupied = inspectWriteTarget({ folder, path: candidate }).overwrite || alreadyInBatch;
    if (!occupied || policy === "overwrite") { reserved.add(candidate.toLowerCase()); return candidate; }
    if (policy === "skip") return undefined;
    occupiedPaths.add(candidate);
    candidate = nextAvailableFileName({ desiredPath: path, existingPaths: occupiedPaths });
  }
  throw new ToolInputError({ message: `${path}: too many filename collisions` });
}

/** Per-destination checks that need no write: theme scope/containment, media file name and type. */
function checkFile({ deps, destination, path, bytes }: { deps: AssetToolDeps; destination: AssetDestination; path: string; bytes: Buffer }): void {
  if (destination.kind === "theme") {
    const theme = findThemeOrThrow(deps, destination.themeId!);
    assertThemeFileWritable(theme, path);
    resolveThemeFilePath({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path });
  }
  if (destination.kind !== "media") return;
  if (path !== basename(path)) throw new ToolInputError({ message: "Media destinations use a filename, not a folder path" });
  validateImageBytes({ source: path, bytes, bytesTruncated: false });
}

/** Validate the whole batch before persistence. Media are always new imports (the importer names
 * and dedups them), so `policy` applies to site and theme paths; picked writes show overwrites on
 * the card. @returns Frozen bytes/paths and the approval batch for site/picked writes; no writes.
 * @throws Existing writer/input errors. @complexity O(files × path depth), bounded collision probes. */
export function prepareAssetWrites({ deps, destination, files, policy = "overwrite" }: { deps: AssetToolDeps; destination: AssetDestination; files: AssetFile[]; policy?: OverwritePolicy }, _options = {}): PreparedAssets {
  const prepared: PreparedAssets = { destination, files: [], skipped: [] };
  const folder = destination.kind === "site" ? deps.siteBinding.dir : destination.kind === "theme" ? findThemeOrThrow(deps, destination.themeId!).dir : undefined;
  const reserved = new Set<string>();
  for (const file of files) {
    const path = folder ? choosePath({ folder, path: file.path, policy, reserved }) : file.path;
    if (path === undefined) { prepared.skipped.push(file.path); continue; }
    checkFile({ deps, destination, path, bytes: file.bytes });
    prepared.files.push({ ...file, path });
  }
  prepared.batch = approvalBatch({ deps, destination, files: prepared.files });
  return prepared;
}

/** Site and picked-folder writes become one fs_write_files batch (and its card); others need none. */
function approvalBatch({ deps, destination, files }: { deps: AssetToolDeps; destination: AssetDestination; files: AssetFile[] }): PreparedWriteBatch | undefined {
  const encoded = files.map(({ path, bytes }) => ({ path, content: bytes.toString("base64"), encoding: "base64" }));
  if (!encoded.length) return undefined;
  if (destination.kind === "picked") return preparePickedFolderBatch({ routeDeps: deps, files: encoded });
  const folder = deps.siteBinding.dir;
  return destination.kind === "site" ? { folder, writes: prepareFileWrites({ folder, files: encoded }) } : undefined;
}

/** Execute prepared writes via the owning writers. Partial failures remain visible to callers.
 * @returns Written/skipped paths and media or theme status. @throws Storage failures.
 * @complexity O(total bytes), sequential output I/O.
 * @example await writeAssetFiles({ deps, ctx, prepared }); */
export async function writeAssetFiles({ deps, ctx, prepared }: { deps: AssetToolDeps; ctx: ToolExecutionContext; prepared: PreparedAssets }, _options = {}) {
  const { destination, files, skipped, batch } = prepared;
  if (batch) return { ...writePreparedFiles(batch), skipped };
  if (destination.kind === "media") {
    const media = [];
    for (const file of files) {
      const contentType = validateImageBytes({ source: file.path, bytes: file.bytes, bytesTruncated: false });
      media.push((await persistImportedMedia({ routeDeps: deps, actorId: ctx.principal.id, sourceUrl: file.sourceUrl ?? "", input: { workspaceId: deps.workspaceId, bytes: file.bytes, filename: file.path, contentType, createdByPrincipal: ctx.principal.id } })).media);
    }
    return { written: files.map(({ path }) => path), skipped, media };
  }
  const theme = findThemeOrThrow(deps, destination.themeId!);
  for (const file of files) writeThemeBinaryFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: file.path, bytes: file.bytes });
  const reloaded = files.length ? reloadThemeInPlace(deps, theme, destination.themeId!) : theme;
  return { written: files.map(({ path }) => path), skipped, status: reloaded.status, errors: reloaded.errors };
}
