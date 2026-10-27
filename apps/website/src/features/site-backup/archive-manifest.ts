import { SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";
import { claimSharePath } from "./share-file-policy.js";
import type { SiteBackupInclude } from "./sources.js";

export const ARCHIVE_MANIFEST_PATH = "manifest.json";
export const ARCHIVE_DATABASE_PATH = "content.db";
export interface ArchiveFile { readonly path: string; readonly bytes: number; readonly sha256: string }
export interface ArchiveMedia { readonly id: string; readonly slug: string; readonly path: string; readonly sha256: string }
export interface ArchivePlugin {
  readonly kind: "agent" | "site";
  readonly id: string;
  readonly version: string;
  readonly digest: string;
  readonly enabled: boolean;
  readonly shipped: boolean;
}
export interface ArchiveManifest {
  readonly formatVersion: 2;
  readonly profile: "share";
  readonly schema: { readonly index: number; readonly tag: string };
  readonly site: { readonly name: string };
  readonly scopes: SiteBackupInclude;
  readonly media: readonly ArchiveMedia[];
  readonly plugins: readonly ArchivePlugin[];
  readonly files: readonly ArchiveFile[];
}
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const ROOT = /^(?:media\/[^/]+|themes\/.+|plugins\/[^/]+\/(?:package|memory\/(?:notes|learned))\/.+|agent-plugins\/[^/]+\/(?:package|memory\/(?:notes|learned))\/.+|skills\/.+)$/;

function invalid(): never { throw new SiteShareRefusal({ code: "INVALID_ARCHIVE", message: "Invalid v2 share manifest, inventory or schema identity." }); }

/** Serializes the sole importable ZIP contract; repository backup retains its own manifest. */
export function buildArchiveManifest(required: Omit<ArchiveManifest, "formatVersion" | "profile">, _optional = {}): string {
  const manifest: ArchiveManifest = { formatVersion: 2, profile: "share", ...required };
  validateManifest({ manifest, schema: required.schema });
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** Parses untrusted JSON and validates identity, paths, hashes and cross-record uniqueness.
 * @throws SiteShareRefusal for v1, malformed records or a different runtime schema.
 * @complexity O(files² + media + plugins), bounded by the shared 2,000-entry cap.
 */
export function parseArchiveManifest(required: { bytes: Buffer; schema: ArchiveManifest["schema"] }, _optional = {}): ArchiveManifest {
  if (required.bytes.length > SHARE_LIMITS.maxManifestBytes) invalid();
  let manifest: unknown;
  try { manifest = JSON.parse(required.bytes.toString("utf8")); } catch { invalid(); }
  validateManifest({ manifest, schema: required.schema });
  return manifest as ArchiveManifest;
}

// The manifest is untrusted JSON of any shape; each predicate reads it exactly as the archive gave it.
function validateManifest({ manifest: m, schema }: { manifest: any; schema: ArchiveManifest["schema"] }): void {
  validateIdentity({ manifest: m, schema });
  validateSiteName({ name: m.site?.name });
  if (!["database", "media", "themes", "plugins", "settings"].every(scope => m.scopes?.[scope] === true)) invalid();
  if (!Array.isArray(m.files) || m.files.length + 1 > SHARE_LIMITS.maxFiles) invalid();
  const files = validateFiles({ files: m.files });
  if (!Array.isArray(m.media) || !Array.isArray(m.plugins)) invalid();
  validateMedia({ media: m.media, files });
  validatePlugins({ plugins: m.plugins, files });
}

function validateFiles({ files }: { files: any[] }): Map<string, ArchiveFile> {
  const aliases = new Map<string, string>(), names = new Set<string>();
  const inventory = new Map<string, ArchiveFile>();
  claimSharePath({ path: ARCHIVE_MANIFEST_PATH, directory: false, aliases, files: names });
  for (const record of files) {
    const file = requireArchiveFileRecord({ file: record });
    if (![ARCHIVE_DATABASE_PATH, "settings.json"].includes(file.path) && !ROOT.test(file.path)) invalid();
    claimSharePath({ path: file.path, directory: false, aliases, files: names });
    inventory.set(file.path, file);
  }
  if (!inventory.has(ARCHIVE_DATABASE_PATH) || !inventory.has("settings.json")) invalid();
  return inventory;
}

function validateMedia({ media, files }: { media: any[]; files: Map<string, ArchiveFile> }): void {
  const ids = new Set<string>(), paths = new Set<string>();
  for (const row of media) {
    if (!validMediaIdentity({ row, ids })) invalid();
    if (!validMediaPath({ row, paths })) invalid();
    if (files.get(row.path)?.sha256 !== row.sha256) invalid();
    ids.add(row.id); paths.add(row.path);
  }
  if ([...files.keys()].filter(path => path.startsWith("media/")).length !== paths.size) invalid();
}

function validatePlugins({ plugins, files }: { plugins: any[]; files: Map<string, ArchiveFile> }): void {
  const ids = new Set<string>();
  for (const row of plugins) {
    if (!validPluginIdentity({ row })) invalid();
    const key = row.kind + "/" + row.id;
    if (ids.has(key)) invalid();
    if (!validPluginVersion({ row })) invalid();
    if (typeof row.enabled !== "boolean" || row.shipped !== true) invalid();
    const root = (row.kind === "agent" ? "agent-plugins/" : "plugins/") + row.id + "/package/";
    if (![...files.keys()].some(path => path.startsWith(root))) invalid();
    ids.add(key);
  }
  requirePluginCoverage({ files, ids });
}

function validateSiteName(required: { name: unknown }): void {
  if (typeof required.name !== "string" || !required.name.trim() || required.name.length > 200) invalid();
}
function validMediaIdentity({ row, ids }: { row: any; ids: ReadonlySet<string> }): boolean {
  return typeof row?.id === "string" && Boolean(row.id) && !ids.has(row.id) && typeof row.slug === "string";
}
function validMediaPath({ row, paths }: { row: any; paths: ReadonlySet<string> }): boolean {
  return typeof row.path === "string" && /^media\/[^/]+$/.test(row.path) && !paths.has(row.path) && HASH.test(row.sha256);
}
function validPluginIdentity({ row }: { row: any }): boolean {
  return ["agent", "site"].includes(row?.kind) && typeof row.id === "string" && row.id.length <= 64 && ID.test(row.id);
}
function validPluginVersion({ row }: { row: any }): boolean {
  return typeof row.version === "string" && Boolean(row.version) && HASH.test(row.digest);
}

function requirePluginCoverage(required: { files: ReadonlyMap<string, ArchiveFile>; ids: ReadonlySet<string> }): void {
  for (const file of required.files.keys()) {
    const match = /^(agent-plugins|plugins)\/([^/]+)\/package\//.exec(file);
    if (match && !required.ids.has((match[1] === "agent-plugins" ? "agent" : "site") + "/" + match[2])) invalid();
  }
}

function validateIdentity({ manifest: m, schema }: { manifest: any; schema: ArchiveManifest["schema"] }): void {
  if (m?.formatVersion !== 2 || m.profile !== "share") invalid();
  // Library added columns, not a new manifest identity. Historical database compatibility
  // belongs to the worker's trusted schema matcher, never invented migration-ID aliases.
  if (m.schema?.index !== schema.index || m.schema?.tag !== schema.tag) invalid();
}

/** The single file-record contract shared by manifest parsing and inventory construction.
 * @returns A path/size/hash record, or throws SiteShareRefusal for malformed input.
 */
export function requireArchiveFileRecord(required: { file: unknown }, _optional = {}): ArchiveFile {
  const file = required.file as any;
  if (typeof file?.path !== "string" || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !HASH.test(file.sha256)) invalid();
  return file as ArchiveFile;
}
