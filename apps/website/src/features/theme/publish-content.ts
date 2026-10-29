import { createHash } from "node:crypto";
import { constants as fsConstants, type Dirent, type Stats } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "@jini-ai/cms/core";

import { computeBlobStorageKey, isDocumentOnlyBlob } from "#src/features/media/index";
import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import {
  checkTreeFiles,
  checkTreePath,
  isIgnoredTreeFileName,
  MAX_SECRET_SCAN_BYTES,
  normalizeMode,
  resolveTreeRelativePath,
  wrapTreePolicyReason,
  type FileTreeFileInput,
} from "#src/features/publish-content/file-tree-policy";
import type { FileBlobIndexPort } from "#src/features/publish-content/file-blob-index";
import type {
  PackedEntity,
  PublishContentContributor,
  PublishContentDeps,
  PublishContentHandler,
  SkippedPackEntity,
} from "#src/features/publish-content/type-registry";

import { MIGRATION_STAGING_DIR_PREFIX, PUBLISH_PREVIOUS_DIR, PUBLISH_STAGING_DIR, THEME_CATALOG_DIR } from "./theme.js";
import { isGeneratedThemePath } from "./theme-files.js";

const THEME_FILES_KIND = "theme-files";

/**
 * @file `publish-files-plan-2026-09-24.md` §6 S-F3/S-F4 — `theme-files`'s publish-content
 * contribution: the SOURCE half (`pack()`) and the DESTINATION half (`inspect`, `seedHash`,
 * `precheck`, and `apply`'s stage/verify/swap under the themes root's `.publish-staging`).
 * Mirrors `features/media/publish-content.ts`/`features/redirects/publish-content.ts` exactly: a DATA
 * export (`{entityType, dependsOn, build}`) that imports only `type-registry.ts`'s TYPES, never
 * `registerPublishContentContributor` itself — see `type-registry.ts`'s own header for why a value
 * edge here would reopen a real module cycle.
 *
 * `dependsOn` is empty — no other publish-content type depends on a theme's own file tree, and a
 * theme depends on nothing else either.
 *
 * ## What "the tree" means here, and where each exclusion actually lives
 *
 * A theme tree is `<themesDir>/<tier>/<id>/**` for `tier` in {@link THEME_FILE_TREE_TIERS} — a
 * deliberate narrowing to 3 of `theme.ts`'s 4 `ENGINE_SUBFOLDERS` (never `handlebars`, per the plan's
 * own inventory table; flagged, not silently overridden, by the S17 handoff this file continues from).
 * `__original-themes__`/a bare root `README.md` never need an explicit exclusion
 * here at all: the catalog dir and the themes-root `README.md` are SIBLINGS of `static/`/
 * `templated/`/`declarative/` (`theme.ts`'s own `discoverAllBuiltInThemes` scans them at the themes
 * ROOT, separately from each engine subfolder) — walking `themesDir/<tier>/*` for theme ids never
 * reaches any of them. What DOES land inside a tier folder is `MIGRATION_STAGING_DIR_PREFIX` scratch
 * output (a migration's staging dir is a SIBLING of the real theme folder it is migrating, i.e. inside
 * the same tier) — {@link discoverThemeTreeDirs} skips it by the same prefix `discoverThemes` itself
 * checks. Generated build output INSIDE a real theme's own tree (`preview/**`, root `index.html`) is
 * excluded per-file by {@link isGeneratedThemePath} while walking that one tree.
 *
 * ## Why a blocked tree is reported once, for the whole tree, not per file
 *
 * `checkTreeFiles` (`file-tree-policy.ts`) already returns one reason for the first offending file in
 * a tree — see that module's own header for why a tree is never silently trimmed. This file just
 * prefixes that reason with `"<title> was not published: "`, the exact prefixing S17's handoff flagged
 * as this slice's job (`file-tree-policy.ts`'s own header deliberately leaves the title out).
 *
 * ## `packThemeFilesEntities` is exported in its own right
 *
 * `PublishContentHandler.pack()` is a bare `AsyncIterable<PackedEntity>` with no channel to report a
 * blocked tree — {@link pack} below silently does not yield one. A caller (today, only this module's
 * own test) that needs to see WHY a tree did not travel calls {@link packThemeFilesEntities} directly,
 * which is the one real implementation `pack()` is a thin wrapper over.
 */

/** No other type depends on a theme's own files, and a theme depends on nothing else. */
const THEME_FILES_DEPENDS_ON: readonly string[] = [];

/** §1's inventory table, narrowed to 3 of `theme.ts`'s 4 `ENGINE_SUBFOLDERS` — see this file's own
 *  header for the deliberate `handlebars` omission. */
const THEME_FILE_TREE_TIERS: readonly string[] = ["static", "templated", "declarative"];

/** One theme tree {@link discoverThemeTreeDirs} found on disk, not yet packed. */
interface ThemeTreeLocation {
  readonly tier: string;
  readonly id: string;
  readonly absDir: string;
}

/** @complexity O(1). */
function isMissing(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

/** `readdir` with file types, or `[]` when the folder does not exist; any other error propagates.
 * @complexity O(entries). */
async function readDirIfPresent({ absDir }: { absDir: string }): Promise<Dirent[]> {
  try {
    return await readdir(absDir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

/** `lstat`, or `null` when nothing is there; any other error propagates. @complexity O(1). */
async function lstatIfPresent({ absPath }: { absPath: string }): Promise<Stats | null> {
  try {
    return await lstat(absPath);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/** `realpath`, or `null` when nothing is there; any other error propagates. @complexity O(path depth). */
async function realpathIfPresent({ absPath }: { absPath: string }): Promise<string | null> {
  try {
    return await realpath(absPath);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/** Ascending code-unit (or numeric) order as a sort comparator: -1, 0 or 1. Positional because
 *  `Array.prototype.sort` dictates the signature. @complexity O(1) per comparison. */
function compareAscending<T extends string | bigint>(a: T, b: T): number {
  return Number(a > b) - Number(a < b);
}

/** A tier-folder entry that is a theme tree: a real directory that is not migration scratch output. */
function isThemeTreeEntry({ entry }: { entry: Dirent }): boolean {
  return !entry.name.startsWith(MIGRATION_STAGING_DIR_PREFIX) && entry.isDirectory();
}

/** Tier first, then id, both by locale. */
function compareTreeLocations(a: ThemeTreeLocation, b: ThemeTreeLocation): number {
  return a.tier === b.tier ? a.id.localeCompare(b.id) : a.tier.localeCompare(b.tier);
}

/**
 * Every theme tree currently on disk under {@link THEME_FILE_TREE_TIERS} — directory NAMES only, no
 * manifest is loaded and no theme.json is parsed here (that happens implicitly: `theme.json` is just
 * another file {@link walkThemeTree} packs). A missing tier folder is treated as empty, mirroring
 * `discoverThemes`'s own "missing dir -> no themes there yet" convention.
 *
 * @complexity O(entries under each tier folder), 3 `readdir` calls.
 */
async function discoverThemeTreeDirs(themesDir: string): Promise<readonly ThemeTreeLocation[]> {
  const found: ThemeTreeLocation[] = [];
  for (const tier of THEME_FILE_TREE_TIERS) {
    const tierDir = path.join(themesDir, tier);
    for (const entry of await readDirIfPresent({ absDir: tierDir })) {
      if (isThemeTreeEntry({ entry })) found.push({ tier, id: entry.name, absDir: path.join(tierDir, entry.name) });
    }
  }
  return found.sort(compareTreeLocations);
}

/** One real file {@link walkThemeTree} found and read. `textSample` is the whole file decoded as
 *  UTF-8 when it is small enough to be worth scanning ({@link MAX_SECRET_SCAN_BYTES}) — `checkTreeFiles`
 *  itself decides, per extension, whether to actually scan it; handing every small file's text through
 *  unconditionally is harmless for a binary one (its extension is simply never in that check's
 *  text-like set) and avoids this walker having to duplicate that set. */
interface WalkedThemeFile {
  readonly path: string;
  readonly size: number;
  readonly mode: number;
  readonly sha256: string;
  readonly absPath: string;
  readonly textSample?: string;
}

/** @complexity O(1). */
function childRelPath({ relDir, name }: { relDir: string; name: string }): string {
  return relDir.length > 0 ? `${relDir}/${name}` : name;
}

/** What {@link walkThemeTree} does with one directory entry: skip it, descend into it, or read it. */
function walkStep({ entry, relPath }: { entry: Dirent; relPath: string }): "skip" | "descend" | "read" {
  if (entry.isSymbolicLink()) return "skip"; // never followed, never part of the tree.
  // OS junk (macOS's `.DS_Store`, `.Spotlight-V100`, `.Trashes`, AppleDouble `._*`; Windows'
  // `Thumbs.db`/`desktop.ini`) is excluded HERE, at the source of the file list every downstream
  // consumer (state, upload, contentHash, `inspect()`'s live re-hash) builds from — never a
  // whole-tree DENY (`file-tree-policy.ts`'s own header on `isIgnoredTreeFileName`).
  if (isIgnoredTreeFileName(entry.name)) return "skip";
  if (entry.isDirectory()) return "descend";
  if (!entry.isFile()) return "skip"; // a socket, fifo, or other non-regular entry — never a theme file.
  if (isGeneratedThemePath(relPath)) return "skip"; // regenerated on every build; never real source.
  return "read";
}

/** Reads and hashes one walked file, or `null` when it is no longer a regular file.
 * @complexity O(file bytes). */
async function readWalkedFile({ absPath, relPath }: { absPath: string; relPath: string }): Promise<WalkedThemeFile | null> {
  const info = await lstat(absPath);
  if (info.isSymbolicLink() || !info.isFile()) return null; // defends a TOCTOU swap between readdir and here.
  const bytes = await readFile(absPath);
  return {
    path: relPath,
    size: bytes.length,
    mode: normalizeMode(info.mode),
    sha256: sha256Of(bytes),
    absPath,
    textSample: bytes.length <= MAX_SECRET_SCAN_BYTES ? bytes.toString("utf8") : undefined,
  };
}

/**
 * Recursively collects every real, publishable-candidate file under one theme tree. Symlinks (to a
 * file or a directory) are never followed and never appear in the result — silently, the same "not
 * part of the tree at all" treatment {@link isGeneratedThemePath} paths get, since neither is a
 * anomaly worth a per-file report (contrast a DENY-LISTED file, which `checkTreeFiles` blocks the
 * WHOLE tree for — see this file's header). A generated path is excluded the same way, per-file,
 * before it is ever read.
 *
 * @complexity O(entries under `absTreeDir`) filesystem calls plus O(bytes) to hash/read each
 *   surviving file; recursion depth is the tree's own folder depth.
 */
async function walkThemeTree(absTreeDir: string): Promise<readonly WalkedThemeFile[]> {
  const files: WalkedThemeFile[] = [];

  async function recurse(absDir: string, relDir: string): Promise<void> {
    for (const entry of await readDirIfPresent({ absDir })) {
      const absPath = path.join(absDir, entry.name);
      const relPath = childRelPath({ relDir, name: entry.name });
      const step = walkStep({ entry, relPath });
      if (step === "descend") await recurse(absPath, relPath);
      if (step !== "read") continue;
      const file = await readWalkedFile({ absPath, relPath });
      if (file) files.push(file);
    }
  }

  await recurse(absTreeDir, "");
  return files;
}

/** One tree {@link packOneThemeTree} could not pack — the WHOLE tree, never a per-file entry (this
 *  file's own header). */
export interface SkippedThemeTree {
  readonly treeKey: string;
  readonly reason: string;
  /** The tree's `theme.json` name, when it has one — see {@link themeDisplayName}. */
  readonly label?: string;
}

/** @complexity O(1). */
function treeTitle(treeKey: string): string {
  return `Theme: ${treeKey}`;
}

/**
 * The walked tree's `theme.json` `name` (what the Themes screen calls it), or `undefined` when it has
 * no readable one. Row display text only: {@link buildTreeState} keeps {@link treeTitle} in `state`,
 * so a name change never changes a tree's hash (or disagrees with a live build that predates this).
 *
 * @complexity O(files) to find `theme.json`, plus O(its bytes) to read and parse it.
 */
async function themeDisplayName(walked: readonly WalkedThemeFile[]): Promise<string | undefined> {
  const manifest = walked.find((file) => file.path === "theme.json");
  if (!manifest) return undefined;
  try {
    const parsed: unknown = JSON.parse(manifest.textSample ?? (await readFile(manifest.absPath, "utf8")));
    const name = typeof parsed === "object" && parsed !== null ? (parsed as { name?: unknown }).name : undefined;
    return typeof name === "string" && name.trim().length > 0 ? name.trim() : undefined;
  } catch {
    return undefined; // a malformed theme.json is the policy pass's and the theme loader's concern, not a label's.
  }
}

/** @complexity O(n log n) in `files.length`. */
function sortByPath<T extends { readonly path: string }>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => compareAscending(a.path, b.path));
}

/**
 * The one `state` shape both sides hash (plan §0): the source's `pack()` and the destination's
 * `inspect()`/`seedHash()`/staged-tree check. One builder, so a tree that is byte-identical on both
 * machines always hashes identically. `files` must already be sorted by path.
 *
 * @complexity O(files).
 */
function buildTreeState(
  treeKey: string,
  sortedFiles: readonly { readonly path: string; readonly sha256: string; readonly size: number; readonly mode: number }[]
): Record<string, unknown> {
  const files = sortedFiles.map((file) => ({ path: file.path, sha256: file.sha256, size: file.size, mode: file.mode }));
  return { title: treeTitle(treeKey), kind: THEME_FILES_KIND, treeKey, files };
}

/**
 * Packs ONE theme tree into a {@link PackedEntity}, or reports why it was left out — the per-tree unit
 * both {@link packThemeFilesEntities} and (indirectly, via that function) `pack()` build on.
 *
 * Order matches `file-tree-policy.ts` §2: the tree's id shape is checked first (this module's own
 * concern — {@link resolveTreeRelativePath} is the same validator every other file-tree kind shares),
 * then {@link checkTreeFiles} runs the full allow-list/deny-list/cap/secret-scan pass over every file
 * the walk found. Only once both pass does this record entries into `fileBlobIndex` — a blocked tree's
 * files are never indexed, so a rejected tree can never be served to a peer by sha alone.
 *
 * @complexity O(files under the tree) — one walk, one policy pass, one sort, one hash.
 */
async function packOneThemeTree(input: {
  readonly tier: string;
  readonly id: string;
  readonly absDir: string;
  readonly fileBlobIndex?: FileBlobIndexPort;
}): Promise<{ entity: PackedEntity } | { skippedTree: SkippedThemeTree }> {
  const treeKey = `${input.tier}/${input.id}`;
  const title = treeTitle(treeKey);

  if (resolveTreeRelativePath(THEME_FILES_KIND, [input.tier, input.id]) === null) {
    return { skippedTree: { treeKey, reason: `${title} was not published: '${treeKey}' is not a valid theme tree address` } };
  }

  const walked = await walkThemeTree(input.absDir);
  const label = await themeDisplayName(walked);
  const policyInputs: FileTreeFileInput[] = walked.map((file) => ({
    path: file.path,
    size: file.size,
    mode: file.mode,
    textSample: file.textSample,
  }));
  const blockReason = checkTreeFiles(THEME_FILES_KIND, policyInputs);
  if (blockReason) {
    return { skippedTree: { treeKey, reason: wrapTreePolicyReason(title, blockReason), ...(label ? { label } : {}) } };
  }

  const sortedFiles = sortByPath(walked);
  const state = buildTreeState(treeKey, sortedFiles);

  for (const file of sortedFiles) {
    input.fileBlobIndex?.set(file.sha256, { absPath: file.absPath, size: file.size });
  }

  return {
    entity: {
      entityType: THEME_FILES_KIND,
      id: treeKey,
      schemaVersion: 1,
      contentHash: contentHash(THEME_FILES_KIND, state),
      hashVersion: CONTENT_HASH_VERSION,
      requiredBlobs: sortedFiles.map((file) => file.sha256),
      state,
      ...(label ? { displayLabel: label } : {}),
    },
  };
}

/**
 * Every theme tree on this machine, packed or reported as skipped — the one real implementation
 * `pack()` below wraps. Exported so a caller (today, this module's own test) can see WHY a tree did
 * not travel, a channel `PublishContentHandler.pack()`'s bare `AsyncIterable` has no room for (this
 * file's own header).
 *
 * @complexity O(trees) sequential `packOneThemeTree` calls (each already documented above).
 */
export async function packThemeFilesEntities(input: {
  readonly themesDir: string;
  readonly fileBlobIndex?: FileBlobIndexPort;
}): Promise<{ entities: readonly PackedEntity[]; skipped: readonly SkippedThemeTree[] }> {
  const trees = await discoverThemeTreeDirs(input.themesDir);
  const entities: PackedEntity[] = [];
  const skipped: SkippedThemeTree[] = [];
  for (const tree of trees) {
    const result = await packOneThemeTree({ tier: tree.tier, id: tree.id, absDir: tree.absDir, fileBlobIndex: input.fileBlobIndex });
    if ("entity" in result) entities.push(result.entity);
    else skipped.push(result.skippedTree);
  }
  return { entities, skipped };
}

// ---------------------------------------------------------------------------
// Destination half (S-F4): inspect, seedHash, precheck, apply
// ---------------------------------------------------------------------------

/** Plan §3 step 2's one link/escape refusal, shared by `precheck()` and `apply()`. */
const LINK_REASON = "live's themes folder contains a link; nothing was written";

/** Plan §3 step 6. */
const KEEP_PREVIOUS_COPIES = 2;

/** One entity id (`"<tier>/<themeId>"`) split and validated, or `null` for anything else. */
interface ThemeTreeAddress {
  readonly tier: string;
  readonly themeId: string;
  readonly treeKey: string;
}

/**
 * Parses an entity id through the same `resolveTreeRelativePath` validator `pack()` used, so an id
 * the source could never have produced (`../x`, a 3-segment path, the `handlebars` tier) never
 * resolves to a directory here.
 *
 * @complexity O(id length).
 */
function parseTreeAddress(id: string): ThemeTreeAddress | null {
  const segments = id.split("/");
  if (segments.length !== 2) return null;
  const [tier, themeId] = segments;
  if (!THEME_FILE_TREE_TIERS.includes(tier)) return null;
  if (resolveTreeRelativePath(THEME_FILES_KIND, [tier, themeId]) === null) return null;
  return { tier, themeId, treeKey: id };
}

/**
 * The `contentHash` of the tree at `absDir`, built exactly like `pack()` builds it, or `null` when
 * there is no real directory there. A symlinked tree root is treated as absent (never followed);
 * `precheck()` is what refuses it with a reason.
 *
 * @complexity O(files under `absDir`) reads + hashes.
 */
async function hashTreeAt(absDir: string, treeKey: string): Promise<string | null> {
  const info = await lstatIfPresent({ absPath: absDir });
  if (!info?.isDirectory()) return null;
  const walked = await walkThemeTree(absDir);
  return contentHash(THEME_FILES_KIND, buildTreeState(treeKey, sortByPath(walked)));
}

/**
 * Plan §3 step 2: `realpath(root) === root`, and every existing component from the root down to the
 * target (plus publish's own scratch dirs) is a real directory, never a link. Also refuses a tier
 * folder on a different device than the root, since the swap's renames must stay on one filesystem
 * (no `EXDEV` half-swap). A missing root or component is fine — apply creates it.
 *
 * @complexity O(1) — at most 5 `lstat`/`stat` calls.
 */
async function checkDestinationLinks(themesDir: string, address: ThemeTreeAddress): Promise<string | null> {
  const rootReal = await realpathIfPresent({ absPath: themesDir });
  if (rootReal === null) return null;
  if (rootReal !== path.resolve(themesDir)) return LINK_REASON;
  const rootDev = (await stat(themesDir)).dev;
  const components = [
    path.join(themesDir, address.tier),
    path.join(themesDir, address.tier, address.themeId),
    path.join(themesDir, PUBLISH_STAGING_DIR),
    path.join(themesDir, PUBLISH_PREVIOUS_DIR),
  ];
  for (const component of components) {
    const reason = componentLinkReason({ info: await lstatIfPresent({ absPath: component }), rootDev });
    if (reason) return reason;
  }
  return null;
}

/** One destination path component's refusal, or `null` when it is absent or a same-device real folder. */
function componentLinkReason({ info, rootDev }: { info: Stats | null; rootDev: number }): string | null {
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isDirectory()) return LINK_REASON;
  if (info.dev !== rootDev) return "live's themes folder spans two disks; nothing was written";
  return null;
}

/** One `state.files[]` entry after shape validation. */
interface IncomingThemeFile {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly mode: number;
}

/**
 * Validates an incoming entity's `state` shape — the destination never trusts the source (plan §3
 * step 1). Returns the files, or a reason (without the title prefix).
 *
 * @complexity O(files).
 */
function readIncomingFiles(entity: PackedEntity): { files: readonly IncomingThemeFile[] } | { reason: string } {
  const notDescribed = { reason: `its file list does not describe '${entity.id}'` };
  const { state } = entity;
  if (state.kind !== THEME_FILES_KIND || state.treeKey !== entity.id || !Array.isArray(state.files)) return notDescribed;
  const raws = state.files as unknown[];
  if (!raws.every(isIncomingFileShape)) return notDescribed;
  return { files: raws.map((file) => ({ path: file.path, sha256: file.sha256, size: file.size, mode: normalizeMode(file.mode) })) };
}

/** One raw `state.files[]` entry has the {@link IncomingThemeFile} shape (mode not yet normalized). */
function isIncomingFileShape(raw: unknown): raw is IncomingThemeFile {
  const file = raw as Partial<IncomingThemeFile> | null;
  if (!file || typeof file.path !== "string" || typeof file.sha256 !== "string") return false;
  return /^[0-9a-f]{64}$/.test(file.sha256) && typeof file.size === "number" && typeof file.mode === "number";
}

/** True when this site cannot vouch that `sha256` is not a library document: no media port wired,
 *  or media's own ownership policy says the blob is document-only.
 * @complexity O(workspace media rows), plus one indexed asset lookup. */
async function isBlockedLibraryBlob({ deps, sha256 }: { deps: PublishContentDeps; sha256: string }): Promise<boolean> {
  const media = deps.ports.media;
  return !media || isDocumentOnlyBlob({ deps: { mediaRepo: media.repo, blobRepo: media.assetBlobRepo },
    input: { workspaceId: deps.workspaceId, sha256 } });
}

/** Reads one staged blob, or `null` when this destination never received it.
 * Ownership is rechecked on each read because it can change after precheck.
 * @complexity O(workspace media rows + blob bytes), plus one indexed asset lookup. */
async function readBlob({ deps, sha256 }: { deps: PublishContentDeps; sha256: string },
  _optional: Record<string, never> = {}): Promise<Uint8Array | null> {
  // All readers share media's policy, including the authoritative read just before staging.
  if (await isBlockedLibraryBlob({ deps, sha256 })) {
    throw new PublishContentApplyRowError("blocked", "Library documents cannot be published");
  }
  const { blobStore } = deps.ports.media!;
  const workspaceId = deps.workspaceId;
  const storageKey = computeBlobStorageKey({ workspaceId, sha256 });
  if (!(await blobStore.exists({ storageKey }))) return null;
  return blobStore.get({ storageKey });
}

/** @complexity O(bytes). */
function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Removes every previous copy of `address` beyond the newest {@link KEEP_PREVIOUS_COPIES}, newest by
 * the key folder's own mtime (ns). Housekeeping only: it runs after the swap has landed, so a failure
 * here must never fail the publish — it leaves an extra copy on disk, nothing worse.
 *
 * @complexity O(previous key folders) `stat` calls.
 */
async function prunePreviousCopies(themesDir: string, address: ThemeTreeAddress): Promise<void> {
  const previousRoot = path.join(themesDir, PUBLISH_PREVIOUS_DIR);
  try {
    const copies: { keyDir: string; mtimeNs: bigint }[] = [];
    for (const key of await readdir(previousRoot)) {
      const keyDir = path.join(previousRoot, key);
      try {
        await lstat(path.join(keyDir, address.tier, address.themeId));
      } catch {
        continue;
      }
      copies.push({ keyDir, mtimeNs: (await stat(keyDir, { bigint: true })).mtimeNs });
    }
    copies.sort((a, b) => compareAscending(b.mtimeNs, a.mtimeNs)); // newest first.
    for (const { keyDir } of copies.slice(KEEP_PREVIOUS_COPIES)) {
      await rm(path.join(keyDir, address.tier, address.themeId), { recursive: true, force: true });
      for (const emptied of [path.join(keyDir, address.tier), keyDir]) {
        await rmdir(emptied).catch(() => undefined); // still holds another tree's copy — keep it.
      }
    }
  } catch {
    // See this function's doc: never fail a landed publish over housekeeping.
  }
}

/**
 * {@link precheck}'s policy inputs for every incoming file, or the library-document refusal.
 * @complexity O(files) ownership checks plus O(bytes) for the text files small enough to scan.
 */
async function incomingPolicyInputs({ deps, files }: { deps: PublishContentDeps; files: readonly IncomingThemeFile[] }):
  Promise<{ inputs: FileTreeFileInput[] } | { reason: string }> {
  const inputs: FileTreeFileInput[] = [];
  for (const file of files) {
    // Check even files too large for the secret scan, before staging creates any files.
    if (await isBlockedLibraryBlob({ deps, sha256: file.sha256 })) return { reason: "Library documents cannot be published" };
    inputs.push({ path: file.path, size: file.size, mode: file.mode, textSample: await incomingTextSample({ deps, file }) });
  }
  return { inputs };
}

/**
 * The bytes that actually arrived for one small, policy-clean path, decoded for the secret scan, or
 * `undefined` (too large, a refused path, or a blob not here yet — the planner's `hasBlob` leg).
 * Reads through `ports.media`'s blob store — the SAME ADR-027 instance a composition root threads to
 * both (see the comment above `buildHandler`'s `themePort`). `theme-files` has no blob store of its
 * own; media's ownership policy must be wired before any bytes can be read.
 * @complexity O(blob bytes).
 */
async function incomingTextSample({ deps, file }: { deps: PublishContentDeps; file: IncomingThemeFile }): Promise<string | undefined> {
  if (file.size > MAX_SECRET_SCAN_BYTES || checkTreePath(file.path) !== null) return undefined;
  const bytes = await readBlob({ deps, sha256: file.sha256 });
  return bytes && bytes.length <= MAX_SECRET_SCAN_BYTES ? Buffer.from(bytes).toString("utf8") : undefined;
}

/** `apply()`'s gateway wiring, or the error naming what to wire. @complexity O(1). */
function requireApplyWiring({ deps }: { deps: PublishContentDeps }) {
  const { changeSets, authorize, outbox } = deps;
  const themesDir = deps.ports[THEME_FILES_KIND]?.themesDir;
  const missingGateway = !changeSets || !authorize || !outbox;
  if (missingGateway || !deps.ports.media?.blobStore || !themesDir) {
    throw new Error(
      "publish-content: theme-files.apply() requires PublishContentDeps.changeSets/authorize/outbox, " +
        "ports.media.blobStore and ports['theme-files'].themesDir — wire them from the real " +
        "apply-loop composition root (features/publish-content/apply-loop.ts)."
    );
  }
  return { changeSets, authorize, outbox, themesDir };
}

/** Where the live tree and its kept previous copy live; empty for an invalid address, which
 *  `apply()`'s precheck refuses before either path is used. @complexity O(1). */
function swapPaths({ themesDir, address, keyHash }: { themesDir: string; address: ThemeTreeAddress | null; keyHash: string }) {
  if (!address) return { target: "", previousPath: "" };
  return {
    target: path.join(themesDir, address.tier, address.themeId),
    previousPath: path.join(themesDir, PUBLISH_PREVIOUS_DIR, keyHash, address.tier, address.themeId),
  };
}

function buildHandler(deps: PublishContentDeps): PublishContentHandler {
  const entityType = THEME_FILES_KIND;
  const schemaVersion = 1;
  // F2 — `theme-files`' own port. `blobStore` is deliberately NOT part of it: it reuses the SAME
  // ADR-027 store instance `ports.media` carries (one composition-root singleton, threaded to both).
  const themePort = deps.ports[THEME_FILES_KIND];

  async function* pack(): AsyncIterable<PackedEntity> {
    // Absent the port degrades to "nothing to export" — the same convention every other optional
    // port already follows (`type-registry.ts`'s own header on `PublishContentPorts`).
    if (!themePort) return;
    const { entities } = await packThemeFilesEntities({ themesDir: themePort.themesDir, fileBlobIndex: themePort.fileBlobIndex });
    for (const entity of entities) yield entity;
  }

  /**
   * `type-registry.ts`'s `PublishContentHandler.listSkipped` — every theme tree this machine found
   * but refused to pack, for an export envelope to surface as a non-selectable, reason-carrying row.
   *
   * Re-walks every theme tree via {@link packThemeFilesEntities} rather than sharing a single pass
   * with {@link pack}: `pack()` is a bare `AsyncIterable` with no room to also report a skip (this
   * file's own header), and `PublishContentHandler` gives no caller a way to ask for both from one
   * call. The extra walk costs one more `readFile`+`sha256` pass over every already-packed file,
   * which is bounded by this machine's own theme corpus (never remote, never per-request-multiplied)
   * — accepted here rather than restructuring `pack()`'s contract for every other handler to satisfy.
   *
   * @complexity O(trees) — see {@link packThemeFilesEntities}'s own doc.
   */
  async function listSkipped(): Promise<readonly SkippedPackEntity[]> {
    if (!themePort) return [];
    const { skipped } = await packThemeFilesEntities({ themesDir: themePort.themesDir });
    return skipped.map((tree) => ({ entityType, id: tree.treeKey, label: tree.label ?? treeTitle(tree.treeKey), reason: tree.reason }));
  }

  /** The destination's tree, hashed like `pack()` hashes it. `version` is always 0 (plan §3): the
   *  apply loop re-inspects and compares hashes before every write. */
  async function inspect(id: string): Promise<{ version: number; hash: string } | null> {
    const address = parseTreeAddress(id);
    if (!themePort || !address) return null;
    const hash = await hashTreeAt(path.join(themePort.themesDir, address.tier, address.themeId), address.treeKey);
    return hash === null ? null : { version: 0, hash };
  }

  /** What this destination was seeded with: its own `__original-themes__/<tier>/<id>` copy (plan §4). */
  async function seedHash(id: string): Promise<string | null> {
    const address = parseTreeAddress(id);
    if (!themePort || !address) return null;
    return hashTreeAt(path.join(themePort.themesDir, THEME_CATALOG_DIR, address.tier, address.themeId), address.treeKey);
  }

  /**
   * Plan §3 steps 1-2, read-only: the state's shape, the link check, then the whole
   * `file-tree-policy` pass again — including the secret scan, over the bytes that actually arrived
   * in this site's blob store (a blob not here yet is left to the planner's `hasBlob` leg).
   *
   * @complexity O(files) plus O(bytes) for the text files small enough to scan.
   */
  async function precheck(entity: PackedEntity): Promise<string | null> {
    const checked = await precheckIncoming(entity);
    return "reason" in checked ? checked.reason : null;
  }

  /** {@link precheck}'s whole pass, returning the validated files on success so `apply()` stages
   *  exactly what was checked. */
  async function precheckIncoming(entity: PackedEntity): Promise<{ reason: string } | { files: readonly IncomingThemeFile[] }> {
    const title = treeTitle(entity.id);
    const address = parseTreeAddress(entity.id);
    if (!address) return { reason: `${title} was not published: '${entity.id}' is not a valid theme tree address` };
    if (!themePort) return { reason: `${title} was not published: this site has no themes folder` };
    const incoming = readIncomingFiles(entity);
    if ("reason" in incoming) return { reason: `${title} was not published: ${incoming.reason}` };

    const linkReason = await checkDestinationLinks(themePort.themesDir, address);
    if (linkReason) return { reason: linkReason };

    const policy = await incomingPolicyInputs({ deps, files: incoming.files });
    if ("reason" in policy) return policy;
    const policyReason = checkTreeFiles(THEME_FILES_KIND, policy.inputs);
    return policyReason ? { reason: wrapTreePolicyReason(title, policyReason) } : incoming;
  }

  /**
   * Plan §3 steps 3-6, inside `executeCommand` (permission `theme.set`): stage every file into
   * `<themesDir>/.publish-staging/<keyHash>/` (`O_CREAT|O_EXCL|O_NOFOLLOW`, normalized mode, sha
   * re-verified), hash the staged tree against `entity.contentHash`, then swap with two renames —
   * the old tree to `<themesDir>/.publish-previous/<keyHash>/<tier>/<id>`, the staged tree into
   * place. Staging and previous copies live under the SAME themes root as the target, so both
   * renames stay on one filesystem. Any failure before the swap removes the staging folder and
   * leaves the old tree serving; `rollback` (a change-set record failing after the swap) moves the
   * old tree back.
   *
   * @complexity O(files) blob reads + writes, one staged-tree hash pass, O(previous copies) pruning.
   */
  async function apply(input: {
    entity: PackedEntity;
    expectedVersion: number | undefined;
    principalId: string;
    idempotencyKey: string;
  }): Promise<{ changeSetId: string }> {
    const { changeSets, authorize, outbox, themesDir } = requireApplyWiring({ deps });
    const { entity } = input;
    const title = treeTitle(entity.id);
    const address = parseTreeAddress(entity.id);
    const keyHash = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 32);
    const stagingRoot = path.join(themesDir, PUBLISH_STAGING_DIR);
    const stagingDir = path.join(stagingRoot, keyHash);
    const { target, previousPath } = swapPaths({ themesDir, address, keyHash });
    let swapped: { previous: string | null } | null = null;

    const blocked = (reason: string): never => {
      throw new PublishContentApplyRowError("blocked", reason);
    };

    async function stageFiles(files: readonly IncomingThemeFile[]): Promise<void> {
      await mkdir(stagingRoot, { recursive: true });
      await rm(stagingDir, { recursive: true, force: true }); // a crashed earlier attempt under this same key.
      await mkdir(stagingDir);
      for (const file of files) {
        const bytes = await readBlob({ deps, sha256: file.sha256 });
        if (!bytes) blocked(`${title} was not published: the bytes for "${file.path}" never reached this site`);
        if (sha256Of(bytes!) !== file.sha256) blocked(`${title} was not published: the bytes for "${file.path}" do not match their checksum`);
        const abs = path.join(stagingDir, ...file.path.split("/"));
        await mkdir(path.dirname(abs), { recursive: true });
        const handle = await open(abs, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, file.mode);
        try {
          await handle.writeFile(bytes!);
        } finally {
          await handle.close();
        }
        await chmod(abs, file.mode); // `open`'s mode is masked by the process umask.
      }
      if ((await hashTreeAt(stagingDir, entity.id)) !== entity.contentHash) {
        blocked(`${title} was not published: the copy written on this site does not match what was sent`);
      }
    }

    async function swapIntoPlace(): Promise<{ previous: string | null }> {
      await mkdir(path.dirname(target), { recursive: true });
      const hadTarget = (await lstatIfPresent({ absPath: target })) !== null;
      if (hadTarget) {
        await rm(previousPath, { recursive: true, force: true });
        await mkdir(path.dirname(previousPath), { recursive: true });
        await rename(target, previousPath);
      }
      try {
        await rename(stagingDir, target);
      } catch (err) {
        if (hadTarget) await rename(previousPath, target);
        throw err;
      }
      return { previous: hadTarget ? previousPath : null };
    }

    const { changeSetId } = await executeCommand({
      deps: { clock: deps.clock, idGen: deps.idGen, changeSets, outbox, authorize },
      command: {
        workspaceId: deps.workspaceId,
        actor: { id: input.principalId, kind: "user" as const },
        summary: `Publish ${title} via publish-content`,
        permission: "theme.set",
        idempotencyKey: input.idempotencyKey,
      },
      mutation: {
        entityType,
        entityId: entity.id,
        operation: input.expectedVersion === undefined ? "create" : "update",
        // The tree this publish replaces is kept on disk, not in the ledger — the inverse names where.
        captureInverse: async () => ({ treeKey: entity.id, previousPath: previousPath || null }),
        execute: async (): Promise<{ previous: string | null }> => {
          // Authoritative re-check inside the gateway, after `authorize` (same order as media).
          const incoming = await precheckIncoming(entity);
          if ("reason" in incoming) return blocked(incoming.reason);
          try {
            await stageFiles(incoming.files);
            swapped = await swapIntoPlace();
          } catch (err) {
            await rm(stagingDir, { recursive: true, force: true });
            throw err;
          }
          await prunePreviousCopies(themesDir, address!);
          // The renderer serves partials/pages from memory, not disk — re-read them now.
          await themePort?.onReplaced?.();
          return swapped;
        },
        captureEntityVersion: () => 0,
        // The gateway calls rollback only after `execute` resolved (`executeCommand` in
        // @jini-ai/cms core/commands/command.ts), and every resolving `execute` has swapped.
        rollback: async () => {
          const discard = `${stagingDir}.rollback`;
          await rename(target, discard);
          if (swapped!.previous) await rename(swapped!.previous, target);
          await rm(discard, { recursive: true, force: true });
          await themePort?.onReplaced?.();
        },
      },
    });
    return { changeSetId };
  }

  return {
    entityType,
    schemaVersion,
    // Theme content's own existing write permission (`features/theme/agent-tools.ts`,
    // `routes/themes/*`) — never a flat transport-wide permission, per
    // `PublishContentHandler.permission`'s own contract.
    permission: "theme.set",
    dependsOn: THEME_FILES_DEPENDS_ON,
    pack,
    inspect,
    precheck,
    apply,
    seedHash,
    listSkipped,
  };
}

/**
 * `theme-files`'s publish-content contribution. Called from a composition root
 * (`server/runtime/composition/publish-content-manifest.ts`), NOT from within `features/theme` itself
 * — see this file's header.
 */
export function contributeThemeFilesPublish(): PublishContentContributor {
  return { entityType: THEME_FILES_KIND, coversRoots: ["themes"], dependsOn: THEME_FILES_DEPENDS_ON, build: buildHandler };
}
