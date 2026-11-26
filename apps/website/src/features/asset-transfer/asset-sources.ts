/** Tovu asset source adapter: existing fs root/deny rules or the media owner's original reader.
 * Generic guarded I/O stays in Jini; this adapter only selects Tovu's source and permission.
 */
import { relative } from "node:path";
import { ToolInputError, requireInputRecord, requireString, type ToolExecutionContext } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { refuseUnexpectedKeys } from "@jini-ai/core";
import { findMediaByIdOrSlug } from "../media/index.js";
import { readStoredBytes } from "@jini-ai/cms/media/site/original-bytes";
import { FS_FILES_READ_PERMISSION } from "@jini-ai/cms/fs-files/agent-tools";
import { inspectWriteTarget } from "@jini-ai/cms/fs-files/write-files";
import { openFsFileForRead, resolveFsFilePath } from "../fs-files/fs-files.js";
import { resolvePickedFolder } from "../fs-files/tool-registrations.js";

import type { AssetTheme } from '@jini-ai/core/contracts/site/asset-transfer-tool-ports';
import type { DocumentArchiveReaderPort } from '@jini-ai/cms/media';
import type { FsFilesToolDeps } from '../fs-files/tool-registrations.js';
import type { MediaImportToolDeps } from '@jini-ai/cms/media/site-import/bindings';
import type { HttpClientPort } from '#src/platform/http/index';
import type { persistImportedMedia } from '../media-import/tool-registrations.js';
import type { fetchImage } from '../media-import/fetch-image.js';

/** The host's theme policy and Library saver for asset tools, bound once at the tool composition root.
 * Method syntax on purpose: the host binds it over its own richer theme type. */
export interface AssetHostPort<T extends AssetTheme = AssetTheme> {
  readonly themeWritePermission: string;
  /** @throws the theme owner's unknown-theme error, a caller shape error. */
  findTheme(required: { themeId: string }): T;
  /** Theme write scope and themes-root containment for one path; never writes. */
  checkThemeWrite(required: { theme: T; relativePath: string }): void;
  writeThemeFile(required: { theme: T; relativePath: string; bytes: Buffer }): void;
  reloadTheme(required: { theme: T; themeId: string }): T;
  sniffThemeImportType(required: { bytes: Uint8Array }): string;
  /** The theme owner's safe-fetch byte/type policy and Accept header for URL copies into a theme. */
  readonly themeImportFetch: NonNullable<Parameters<typeof fetchImage>[1]>;
  isThemeShapeRejection(required: { error: unknown }): boolean;
  saveLibraryDocument(required: { bytes: Uint8Array; name: string; principalId: string }, optional: { archiveReader?: DocumentArchiveReaderPort }): Promise<{ document: unknown }>;
}
export type AssetToolDeps = FsFilesToolDeps & MediaImportToolDeps & { mediaImportHttpClient: HttpClientPort; assetHost: AssetHostPort; documentArchiveReader?: DocumentArchiveReaderPort; resolveImportedMediaUrls: Parameters<typeof persistImportedMedia>[0]["resolvePublicUrls"] };

export const ASSET_SOURCE_SCHEMA = { type: "object", additionalProperties: false, required: ["root", "path"], properties: {
  root: { type: "string", enum: ["site", "picked", "theme", "media"] },
  path: { type: "string", minLength: 1, description: "Relative file path; media: item id or slug." },
  themeId: { type: "string", minLength: 1, description: "Required for root theme; path is relative to this theme." },
} } as const;

/** The folder a local source reads from. The picked folder uses fs_write_files' folder rule (it
 * lies outside the site); a theme must sit inside the site (owner 2026-10-23: site agents read only
 * this site). @throws Root, theme and containment refusals. @complexity O(path depth). */
function sourceFolder({ deps, source }: { deps: AssetToolDeps; source: Record<string, unknown> }): string {
  const root = requireString({ input: source, key: "root" });
  const siteDir = deps.siteBinding.dir;
  if (root === "site") return siteDir;
  if (root === "picked") return resolvePickedFolder({ routeDeps: deps });
  if (root !== "theme") throw new ToolInputError({ message: "source.root must be site, picked, theme, media or url" });
  return resolveFsFilePath({ rootPath: siteDir, relativePath: relative(siteDir, deps.assetHost.findTheme({ themeId: requireString({ input: source, key: "themeId" }) }).dir) });
}

/** Authorize and select a local source folder; callers lstat-walk each file before reading it.
 * @returns The folder and the requested relative path. @complexity O(path depth). */
export async function resolveAssetSource({ deps, ctx, source }: { deps: AssetToolDeps; ctx: ToolExecutionContext; source: Record<string, unknown> }, _options = {}) {
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: FS_FILES_READ_PERMISSION }, { entityType: "fs-root", entityId: String(source.root) });
  return { rootPath: sourceFolder({ deps, source }), relativePath: requireString({ input: source, key: "path" }) };
}

/** One local file: the writer's lstat walk refuses every symlink (even one pointing inside), then
 * the guarded reader re-checks denylist/containment and the byte cap. @complexity O(bytes). */
export async function readLocalFile({ rootPath, relativePath, maxBytes }: { rootPath: string; relativePath: string; maxBytes: number }, _options = {}): Promise<Buffer> {
  inspectWriteTarget({ folder: rootPath, path: relativePath, resolveFsFilePath });
  return Buffer.from(await openFsFileForRead({ rootPath, relativePath, maxBytes }));
}

/** Read a bounded original image/file. Media reads reuse library identity and storage owners.
 * @returns Bytes and a display filename. @throws ToolInputError and existing guarded I/O errors.
 * @complexity O(bytes), capped before reads. @example await readAssetSource({ deps, ctx, input, maxBytes: 1000000 }); */
export async function readAssetSource({ deps, ctx, input, maxBytes }: { deps: AssetToolDeps; ctx: ToolExecutionContext; input: unknown; maxBytes: number }, _options = {}) {
  const source = requireInputRecord({ input });
  refuseUnexpectedKeys({ input: source, allowed: ["root", "path", "themeId"] });
  const path = requireString({ input: source, key: "path" });
  if (source.root !== "media") return { path, bytes: await readLocalFile({ ...await resolveAssetSource({ deps, ctx, source }), maxBytes }) };
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "media.read" }, { entityType: "media" });
  const media = await findMediaByIdOrSlug({ deps, input: { workspaceId: deps.workspaceId, idOrSlug: path } });
  if (!media || media.status !== "active") throw new ToolInputError({ message: "Restore this media item from Trash before using its file" });
  const bytes = Buffer.from(await readStoredBytes({ deps, asset: media, errorPrefix: "media_view_image" }, { maxBytes }));
  const type = deps.assetHost.sniffThemeImportType({ bytes });
  const extension = ({ "image/jpeg": "jpg", "image/svg+xml": "svg", "image/x-icon": "ico" } as Record<string, string>)[type] ?? type.split("/")[1];
  return { path: `${media.slug}.${extension}`, bytes };
}
