import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * @file Path containment and read-only file I/O for the `fs_list_files`/`fs_read_file` agent-tool
 * domain (`agent-tools.ts`/`tool-registrations.ts`).
 *
 * Purpose:
 * The domain's whole safety argument is "the assistant may look inside a fixed, named set of
 * directories (`layout.ts`'s five roots) and nowhere else." This module is where that is made true —
 * the only place here that resolves a caller-supplied string into a filesystem path — mirroring
 * `features/theme/theme-files.ts`'s identical role for the `theme_*` domain, whose own header this
 * one follows structurally (same three containment failure modes, same fix).
 *
 * Why containment is not a string prefix check — verbatim from `theme-files.ts`, because the same
 * three independently-exploitable defects apply to any "is this path inside that folder" check:
 *   1. A prefix match admits a SIBLING directory whose name extends the root's own
 *      (`agent-plugins-evil` starts with `agent-plugins`).
 *   2. Comparing an un-normalized path compares the wrong string (`agent-plugins/../../etc/passwd`
 *      must be resolved BEFORE any comparison, not after).
 *   3. A prefix match is blind to symlinks — `node_modules/@jini-ai/*` really does symlink out of
 *      this repo to a sibling checkout (`/Users/la/Programming/Jini`), so a file or directory inside
 *      an allowed root that links elsewhere is not hypothetical here.
 * {@link resolveFsFilePath} handles all three exactly as `resolveThemeFilePath` does: resolve first,
 * compare with `path.relative` (immune to the sibling-name defect), then re-check the `realpath` of
 * the deepest existing ancestor against the root (catches a symlink escape for a path that does not
 * exist yet).
 *
 * Read-only, deliberately: this module exports no write/rename/delete function at all. Unlike the
 * `theme_*` domain, there is no per-file runtime validator downstream of an fs-files write (a theme
 * template is re-validated by `loadTheme` on every write; a `.env` or a plugin manifest has no
 * equivalent), so the safety argument that lets `theme_write_file` exist does not transfer here — see
 * `agent-tools.ts`'s own header.
 *
 * Secondary defense in depth, WITHIN an allowed root: {@link isDeniedFsFileName} refuses a small,
 * fixed set of filename patterns — `*.db`/`*.db-wal`/`*.db-shm`, `.env*`, `*.pem`/`*.key`/`*.p12` —
 * even though none of `layout.ts`'s five roots is expected to legitimately contain one. This is
 * explicitly NOT the primary gate (the root allowlist is, per this domain's own design brief: "never
 * a denylist of secrets") — it is a second, independent check that costs nothing if the allowlist
 * already holds and catches a future root whose directory grows a matching file nobody anticipated.
 *
 * How it relates to the project:
 * Used only by `tool-registrations.ts`'s two handlers. Nothing else in the codebase reads a file
 * through this module.
 */

/** Thrown for any path/content rejection. Distinct class so the tool layer can map it to a shape
 *  rejection (worth publishing the schema back to the model) rather than an internal error —
 *  mirrors `theme-files.ts`'s `ThemePathError`. */
export class FsFilePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FsFilePathError";
  }
}

/** Ceiling on one read file. A file this large is not something a model should be asked to reason
 *  about inline, and it rules out the pathological case (a multi-gigabyte upload) outright before
 *  any read is attempted. */
export const MAX_FS_FILE_BYTES = 1_000_000;

/** How many leading bytes {@link looksBinary} inspects. Large enough to catch a binary file's magic
 *  bytes/structure even when they do not appear in the very first few bytes; bounded so the sniff
 *  itself is never proportional to a large file's full size. */
const BINARY_SNIFF_BYTES = 8_000;

/** Ceiling on one `listFsFiles` walk, so a pathological directory cannot produce an unbounded response. */
const MAX_LISTED_FILES = 2_000;

/** Depth ceiling on the same walk — a symlink loop inside an allowed root cannot spin forever
 *  (symlinked directories are never followed at all, see {@link visitFsDirEntry}, but an ordinary
 *  deeply-nested real tree is still bounded). */
const MAX_WALK_DEPTH = 12;

/**
 * Filename patterns refused within an allowed root even though the root itself is already
 * allowlisted — see this file's own header for why this is defense in depth, not the primary gate.
 * Matched against the path's own BASENAME only (never a directory segment): a directory legitimately
 * named e.g. `keys/` is not itself a secret, only a leaf file matching one of these shapes is.
 */
const DENIED_FILENAME_PATTERNS: readonly RegExp[] = [
  /\.db$/i,
  /\.db-wal$/i,
  /\.db-shm$/i,
  /^\.env(?:\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
];

/**
 * Whether a bare filename (no directory component) matches one of {@link DENIED_FILENAME_PATTERNS}.
 *
 * @complexity O(p) in the fixed, tiny pattern count.
 */
export function isDeniedFsFileName(fileName: string): boolean {
  return DENIED_FILENAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * Collapse a root-relative path to comparable segments: `/` separators, no `.`, no `..`, no empty
 * segments — verbatim copy of `theme-files.ts`'s `normalizeThemeRelativePath` (kept as an independent
 * copy rather than a shared import, matching that file's own reasoning for not sharing predicates
 * across domains: a gate and the writer/reader it guards must resolve a name the same way, and this
 * domain has no writer to stay in step with, only its own reader).
 *
 * Split on either separator explicitly, not `path.sep`, so the cross-platform guarantee holds even
 * when `sep` is `/` on the machine actually running this.
 */
function normalizeFsRelativePath(relativePath: string): string {
  const segments: string[] = [];
  for (const segment of relativePath.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** Lexical containment: is `target` at or beneath `base`? Uses `path.relative`, which — unlike a
 *  prefix match — cannot be satisfied by a sibling whose name merely extends the base's. Verbatim
 *  copy of `theme-files.ts`'s `isWithin`. */
function isWithin(base: string, target: string): boolean {
  if (base === target) return true;
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

/**
 * Walks up from `path` to the deepest existing ancestor, `realpath`s it, and confirms that ancestor
 * is still inside `base` — catches a symlinked directory anywhere along the chain even though the
 * lexical path is clean. `path` need not exist. Verbatim copy of `theme-files.ts`'s
 * `assertNoSymlinkEscape`, raising this module's own error class.
 */
function assertNoSymlinkEscape(base: string, path: string, relativePathForError: string): void {
  let probe = path;
  for (let i = 0; i < MAX_WALK_DEPTH * 4 && !existsSync(probe); i += 1) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!existsSync(probe)) return;
  const realProbe = realpathSync(probe);
  if (!isWithin(base, realProbe)) {
    throw new FsFilePathError(`path '${relativePathForError}' resolves outside the allowed root through a symbolic link`);
  }
}

/**
 * Resolve one caller-supplied relative path against one allowed root, refusing anything that
 * escapes it or matches a denied filename pattern.
 *
 * Rejects, in order: an empty path, a NUL byte, an absolute path, a path whose basename matches
 * {@link isDeniedFsFileName}, a path that resolves outside the root (traversal), and a path whose
 * deepest existing ancestor `realpath`s outside the root (symlink escape). The root itself is also
 * re-`realpath`ed first, so a root reached through a symlink (this repo's own
 * `node_modules/@jini-ai/*` shape) still compares correctly rather than failing every read.
 *
 * @param required.rootPath - One of `layout.ts`'s five resolved root directories.
 * @param required.relativePath - The caller-supplied path, relative to that root.
 * @returns The absolute, verified-contained path.
 * @throws {FsFilePathError} On any escape, denied-pattern match, or malformed input.
 * @complexity O(d) in the path's directory depth, for the existing-ancestor probe.
 */
export function resolveFsFilePath(required: { rootPath: string; relativePath: string }): string {
  const { rootPath, relativePath } = required;

  if (relativePath.length === 0) {
    throw new FsFilePathError("path is required");
  }
  if (relativePath.includes("\0")) {
    throw new FsFilePathError("path must not contain a NUL byte");
  }
  if (isAbsolute(relativePath)) {
    throw new FsFilePathError(`path '${relativePath}' must be relative to the root, not absolute`);
  }

  const normalized = normalizeFsRelativePath(relativePath);
  const leafName = normalized.length === 0 ? "" : (normalized.split("/").pop() ?? "");
  if (leafName.length > 0 && isDeniedFsFileName(leafName)) {
    throw new FsFilePathError(`path '${relativePath}' matches a denied filename pattern and cannot be accessed`);
  }

  // `realpath` the root so one reached through a symlink (e.g. a `node_modules/@jini-ai/*` package
  // symlinked to a sibling checkout) compares against the same canonical form the ancestor probe
  // below produces.
  const base = existsSync(rootPath) ? realpathSync(rootPath) : resolve(rootPath);
  const target = resolve(base, relativePath);

  if (!isWithin(base, target)) {
    throw new FsFilePathError(`path '${relativePath}' resolves outside the allowed root`);
  }

  assertNoSymlinkEscape(base, target, relativePath);

  return target;
}

/**
 * One directory entry's contribution to {@link walkFsDir}'s file listing: skip symlinks entirely
 * (neither descended nor reported — a link out of the root can neither enumerate nor leak anything
 * beyond it), recurse into real subdirectories, and record real files that do not match a denied
 * filename pattern. Verbatim shape of `theme-files.ts`'s `visitThemeDirEntry`.
 */
function visitFsDirEntry(dir: string, name: string, depth: number, base: string, found: string[]): void {
  const full = resolve(dir, name);
  // lstatSync, NEVER statSync — statSync follows the link, so a circular symlink would throw ELOOP
  // straight out of this "throws only FsFilePathError" module. lstatSync reports the link itself,
  // so `isSymbolicLink()` catches every shape (normal, broken, circular) before anything follows it.
  const stat = lstatSync(full, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    walkFsDir(full, depth + 1, base, found);
    return;
  }
  if (!stat.isFile()) return;
  if (isDeniedFsFileName(name)) return;
  found.push(relative(base, full).split(sep).join("/"));
}

/** Descends real directories under `base` only, collecting relative file paths into `found`
 *  (mutated in place), bounded by {@link MAX_WALK_DEPTH} and {@link MAX_LISTED_FILES}. */
function walkFsDir(dir: string, depth: number, base: string, found: string[]): void {
  if (depth > MAX_WALK_DEPTH || found.length >= MAX_LISTED_FILES) return;
  for (const name of readdirSync(dir)) {
    if (found.length >= MAX_LISTED_FILES) return;
    visitFsDirEntry(dir, name, depth, base, found);
  }
}

/**
 * List every regular file under one allowed root (or a subdirectory of it), as paths relative to
 * the root. Descends real directories only — a symlinked directory is never followed. Files matching
 * a denied filename pattern are silently excluded (not merely refused on read), so a listing never
 * advertises a secret file's existence in the first place.
 *
 * @param required.rootPath - One of `layout.ts`'s five resolved root directories.
 * @param required.relativePath - Optional subdirectory within the root to list; omit (or `""`) to
 *   list from the root itself.
 * @returns Relative paths, sorted, using `/` separators. Empty when the root (or subdirectory)
 *   does not exist on disk yet — a freshly-created site has no `agent-plugins/` at all, and that is
 *   not an error.
 * @throws {FsFilePathError} If `relativePath` escapes the root, matches a denied pattern, or exists
 *   but is not a directory.
 * @complexity O(n) in the file count under the directory.
 */
export function listFsFiles(required: { rootPath: string; relativePath?: string }): string[] {
  const { rootPath } = required;
  const relativePath = required.relativePath ?? "";

  const startDir = relativePath.length === 0 ? resolve(rootPath) : resolveFsFilePath({ rootPath, relativePath });
  if (!existsSync(startDir)) return [];

  const startStat = statOrFsPathError(startDir, relativePath || ".");
  if (!startStat) return [];
  if (!startStat.isDirectory()) {
    throw new FsFilePathError(`path '${relativePath || "."}' is not a directory`);
  }

  const base = realpathSync(startDir);
  const found: string[] = [];
  walkFsDir(base, 0, base, found);

  // Listed relative to the WALK's own base (the requested subdirectory), matching
  // `theme_list_files`'s "paths relative to what you asked to list" contract — a caller that listed
  // `agent-plugins/site-compliance` gets `references/checklist.md`, not the full
  // `site-compliance/references/checklist.md`.
  return found.sort();
}

/**
 * `statSync(target, { throwIfNoEntry: false })`, converting any OTHER thrown error into this
 * module's own {@link FsFilePathError} instead of letting it escape raw — the realistic other case
 * is `ELOOP` from `target` itself being a circular symlink. Verbatim shape of `theme-files.ts`'s
 * `statOrThemePathError`.
 */
function statOrFsPathError(target: string, relativePath: string): Stats | undefined {
  try {
    return statSync(target, { throwIfNoEntry: false });
  } catch (err) {
    throw new FsFilePathError(`path '${relativePath}' could not be read: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Whether `buffer`'s leading {@link BINARY_SNIFF_BYTES} contain a NUL byte — the same heuristic git
 * itself uses to classify a file as binary. A text file (source, JSON, Markdown, `.template.*`
 * assets) never legitimately contains one; a database, image, archive, or font typically does within
 * the first few thousand bytes.
 *
 * @complexity O(min(n, {@link BINARY_SNIFF_BYTES})).
 */
function looksBinary(buffer: Buffer): boolean {
  const sniffLength = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < sniffLength; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export interface ReadFsFileResult {
  readonly content: string;
  readonly bytes: number;
}

/**
 * Read one file inside an allowed root as UTF-8 text.
 *
 * @throws {FsFilePathError} On any containment/denied-pattern failure, when the path does not exist
 *   or is not a regular file, when it exceeds {@link MAX_FS_FILE_BYTES}, or when it sniffs as binary.
 * @complexity O(s) in the file size (bounded by {@link MAX_FS_FILE_BYTES}).
 */
export function readFsFile(required: { rootPath: string; relativePath: string }): ReadFsFileResult {
  const target = resolveFsFilePath(required);
  const stat = statOrFsPathError(target, required.relativePath);
  if (!stat) throw new FsFilePathError(`file '${required.relativePath}' does not exist`);
  if (!stat.isFile()) throw new FsFilePathError(`path '${required.relativePath}' is not a regular file`);
  if (stat.size > MAX_FS_FILE_BYTES) {
    throw new FsFilePathError(`file '${required.relativePath}' exceeds the ${MAX_FS_FILE_BYTES}-byte readable limit`);
  }

  const buffer = readFileSync(target);
  if (looksBinary(buffer)) {
    throw new FsFilePathError(`file '${required.relativePath}' looks like a binary file and cannot be read as text`);
  }

  return { content: buffer.toString("utf8"), bytes: buffer.byteLength };
}
