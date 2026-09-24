import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import {
  checkTreeFiles,
  MAX_SECRET_SCAN_BYTES,
  normalizeMode,
  resolveTreeRelativePath,
  type FileTreeFileInput,
} from "#src/features/publish-content/file-tree-policy";
import type { FileBlobIndexPort } from "#src/features/publish-content/file-blob-index";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler } from "#src/features/publish-content/type-registry";

import { MIGRATION_STAGING_DIR_PREFIX } from "./theme.js";
import { isGeneratedThemePath } from "./theme-files.js";

/**
 * @file `publish-files-plan-2026-09-24.md` §6 S-F3 — `theme-files`'s publish-content contribution:
 * the SOURCE half only (`pack()`, plus `inspect`/`precheck`/`apply` as throwing stubs S-F4 replaces).
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
 * `__original-themes__`/`__marketplace__`/a bare root `README.md` never need an explicit exclusion
 * here at all: both catalog dirs and the themes-root `README.md` are SIBLINGS of `static/`/
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
    let entries;
    try {
      entries = await readdir(tierDir, { withFileTypes: true });
    } catch (err) {
      if (isMissing(err)) continue;
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(MIGRATION_STAGING_DIR_PREFIX)) continue;
      if (!entry.isDirectory()) continue;
      found.push({ tier, id: entry.name, absDir: path.join(tierDir, entry.name) });
    }
  }
  return found.sort((a, b) => (a.tier === b.tier ? a.id.localeCompare(b.id) : a.tier.localeCompare(b.tier)));
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
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (err) {
      if (isMissing(err)) return;
      throw err;
    }
    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir.length > 0 ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue; // never followed, never part of the tree.
      if (entry.isDirectory()) {
        await recurse(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue; // a socket, fifo, or other non-regular entry — never a theme file.
      if (isGeneratedThemePath(relPath)) continue; // regenerated on every build; never real source.

      const info = await lstat(absPath);
      if (info.isSymbolicLink() || !info.isFile()) continue; // defends a TOCTOU swap between readdir and here.
      const bytes = await readFile(absPath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const mode = normalizeMode(info.mode);
      files.push({
        path: relPath,
        size: bytes.length,
        mode,
        sha256,
        absPath,
        textSample: bytes.length <= MAX_SECRET_SCAN_BYTES ? bytes.toString("utf8") : undefined,
      });
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
}

/** @complexity O(1). */
function treeTitle(treeKey: string): string {
  return `Theme: ${treeKey}`;
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

  if (resolveTreeRelativePath("theme-files", [input.tier, input.id]) === null) {
    return { skippedTree: { treeKey, reason: `${title} was not published: '${treeKey}' is not a valid theme tree address` } };
  }

  const walked = await walkThemeTree(input.absDir);
  const policyInputs: FileTreeFileInput[] = walked.map((file) => ({
    path: file.path,
    size: file.size,
    mode: file.mode,
    textSample: file.textSample,
  }));
  const blockReason = checkTreeFiles("theme-files", policyInputs);
  if (blockReason) {
    return { skippedTree: { treeKey, reason: `${title} was not published: ${blockReason}` } };
  }

  const sortedFiles = [...walked].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const stateFiles = sortedFiles.map((file) => ({ path: file.path, sha256: file.sha256, size: file.size, mode: file.mode }));
  const state: Record<string, unknown> = { title, kind: "theme-files", treeKey, files: stateFiles };

  for (const file of sortedFiles) {
    input.fileBlobIndex?.set(file.sha256, { absPath: file.absPath, size: file.size });
  }

  return {
    entity: {
      entityType: "theme-files",
      id: treeKey,
      schemaVersion: 1,
      contentHash: contentHash("theme-files", state),
      hashVersion: CONTENT_HASH_VERSION,
      requiredBlobs: sortedFiles.map((file) => file.sha256),
      state,
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

function buildHandler(deps: PublishContentDeps): PublishContentHandler {
  const entityType = "theme-files";
  const schemaVersion = 1;

  async function* pack(): AsyncIterable<PackedEntity> {
    // Absent `themesDir` degrades to "nothing to export" — the same convention every other optional
    // `PublishContentDeps` field already follows (`type-registry.ts`'s own header on `mediaRepo` etc).
    if (!deps.themesDir) return;
    const { entities } = await packThemeFilesEntities({ themesDir: deps.themesDir, fileBlobIndex: deps.fileBlobIndex });
    for (const entity of entities) yield entity;
  }

  // S-F4 replaces these three. Never registered while they throw (`publish-content-manifest.ts`'s own
  // header rule: registration and a working `apply()` land in the same commit) — see this file's
  // header for why `inspect`/`precheck` still need a real (if throwing) body to satisfy
  // `PublishContentHandler`'s required shape in the meantime.
  async function inspect(): Promise<{ version: number; hash: string } | null> {
    throw new Error("theme-files inspect() lands in S-F4");
  }
  async function precheck(): Promise<string | null> {
    throw new Error("theme-files precheck() lands in S-F4");
  }
  async function apply(): Promise<{ changeSetId: string }> {
    throw new Error("theme-files apply() lands in S-F4");
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
  };
}

/**
 * `theme-files`'s publish-content contribution. Called from a composition root
 * (`server/runtime/composition/publish-content-manifest.ts`), NOT from within `features/theme` itself
 * — see this file's header. Left unregistered until S-F4's real `apply()` lands (this file's own
 * `inspect`/`precheck`/`apply` doc).
 */
export function contributeThemeFilesPublish(): PublishContentContributor {
  return { entityType: "theme-files", dependsOn: THEME_FILES_DEPENDS_ON, build: buildHandler };
}
