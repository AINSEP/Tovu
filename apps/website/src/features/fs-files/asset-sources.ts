/** Tovu asset source adapter: existing fs root/deny rules or the media owner's original reader.
 * Generic guarded I/O stays in Jini; this adapter only selects Tovu's source and permission.
 */
import { relative } from "node:path";
import { ToolInputError, requireInputRecord, requireString, type ToolExecutionContext } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import { refuseUnexpectedKeys } from "#src/contracts/core/human-confirm";
import { findMediaByIdOrSlug } from "../media/index.js";
import { readStoredBytes } from "../media/view-image-tool.js";
import { findThemeOrThrow } from "../theme/tool-registrations.js";
import { sniffThemeImportType } from "../theme/theme-file-import.js";
import { FS_FILES_READ_PERMISSION } from "./agent-tools.js";
import { inspectWriteTarget } from "./write-files.js";
import { openFsFileForRead, resolveFsFilePath } from "./fs-files.js";
import { resolvePickedFolder } from "./tool-registrations.js";
import type { AssetToolDeps } from "./asset-destinations.js";

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
  return resolveFsFilePath({ rootPath: siteDir, relativePath: relative(siteDir, findThemeOrThrow(deps, requireString({ input: source, key: "themeId" })).dir) });
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
  inspectWriteTarget({ folder: rootPath, path: relativePath });
  return Buffer.from(await openFsFileForRead({ rootPath, relativePath, maxBytes }));
}

/** Read a bounded original image/file. Media reads reuse library identity and storage owners.
 * @returns Bytes and a display filename. @throws ToolInputError and existing guarded I/O errors.
 * @complexity O(bytes), capped before reads. @example await readAssetSource({ deps, ctx, input, maxBytes: 1000000 }); */
export async function readAssetSource({ deps, ctx, input, maxBytes }: { deps: AssetToolDeps; ctx: ToolExecutionContext; input: unknown; maxBytes: number }, _options = {}) {
  const source = requireInputRecord({ input });
  refuseUnexpectedKeys(source, ["root", "path", "themeId"]);
  const path = requireString({ input: source, key: "path" });
  if (source.root !== "media") return { path, bytes: await readLocalFile({ ...await resolveAssetSource({ deps, ctx, source }), maxBytes }) };
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "media.read" }, { entityType: "media" });
  const media = await findMediaByIdOrSlug({ deps, input: { workspaceId: deps.workspaceId, idOrSlug: path } });
  if (!media || media.status !== "active") throw new ToolInputError({ message: "Restore this media item from Trash before using its file" });
  const bytes = Buffer.from(await readStoredBytes({ deps, asset: media }, { maxBytes }));
  const type = sniffThemeImportType({ bytes });
  const extension = ({ "image/jpeg": "jpg", "image/svg+xml": "svg", "image/x-icon": "ico" } as Record<string, string>)[type] ?? type.split("/")[1];
  return { path: `${media.slug}.${extension}`, bytes };
}
