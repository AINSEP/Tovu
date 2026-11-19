import { accessSync, chmodSync, constants as fsConstants, copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileDigest } from "@jini-ai/platform/fs";
import { ThemeFileChangedError, reviewedWriteScope } from "./reviewed-write-commit.js";
import { statOrThemePathError, resolveThemeFilePath, ThemePathError } from "./theme-files.js";


/**
 * Replace `target` by filling a sibling temp file in the SAME directory and `renameSync`-ing it over
 * `target`, instead of truncating `target` in place. `fillTemp` creates that temp file at the path it
 * is given: {@link writeThemeFile} writes text there, and {@link resetThemeFileToOriginal} copies a
 * catalog original's bytes there.
 *
 * Why this matters: a plain `writeFileSync(target, …, "w")` truncates `target`'s own inode the
 * instant it opens, before any content lands — a crash or a concurrent reader mid-write can then
 * observe an empty or partial file. For `theme.json`, the file `loadTheme()` must parse whole,
 * that turns one torn write into a broken WHOLE theme. Renaming a fully-written temp file over
 * `target` instead swaps the directory entry atomically: a reader that already has `target` open
 * by descriptor keeps reading the old, complete inode; a reader that opens `target` by path
 * afterward sees either the fully-old or fully-new content, never a partial one.
 *
 * The temp file is a sibling of `target` (same directory), not under a shared system tmp dir,
 * because `renameSync` requires both paths on the SAME filesystem — a cross-device rename throws
 * `EXDEV` instead of renaming.
 *
 * Checks write access on an existing `target` up front: `rename()` only needs write permission on
 * the DIRECTORY, not the destination file, so a bare temp-then-rename would otherwise silently
 * succeed over a read-only target — regressing the permission-denied refusal a `"w"`-flag
 * `writeFileSync` open gave callers before this change. The temp file also inherits `target`'s
 * existing mode before the rename, so replacing a file does not silently change its permissions.
 * When `target` does not exist yet, the new file keeps the mode `fillTemp` created it with.
 *
 * @throws whatever `accessSync`, `fillTemp`, `chmodSync` or `renameSync` throws, or
 * {@link ThemePathError} if the pre-write stat on `target` hits a circular symlink (see
 * {@link statOrThemePathError}). The temp file is removed before the error propagates,
 * so a failed write leaves no artifact behind in the theme folder.
 * @complexity O(s + r log r + r*d) time and O(r + d) space for s written/copied bytes, r revisions and path depth d.
 */
export function writeFileAtomically({ target, relativePathForError, fillTemp }: { target: string; relativePathForError: string; fillTemp: (tempPath: string) => void }, { stat = statSync, revisionFile, options = {} }: { stat?: typeof statSync; revisionFile?: ThemeRevisionFile; options?: { now?: () => number } } = {}): string | undefined {
  // statOrThemePathError, NEVER a bare statSync — same circular-symlink ELOOP escape the other
  // post-resolve stat calls in this file were fixed for (see that wrapper's own doc). In practice
  // both callers (`writeThemeFile`, `resetThemeFileToOriginal`) already run an identical stat on the
  // same `target` just before and throw first for a circular symlink, so this call is shadowed
  // under ordinary single-process execution; it still guards a genuine TOCTOU window (an external
  // process replacing `target` with a symlink cycle between the two calls) and any future caller
  // that skips that earlier check. Still follows a symlink pointing at a real file inside the theme,
  // matching `renameSync` below, which replaces that symlink's own directory entry.
  const existing = statOrThemePathError({ target, relativePath: relativePathForError }, { stat });
  if (existing) {
    accessSync(target, fsConstants.W_OK);
  }
  const tempPath = join(dirname(target), `.${basename(target)}.${process.pid}-${randomUUID()}.tmp`);
  let revision: string | undefined;
  try {
    fillTemp(tempPath);
    if (existing) chmodSync(tempPath, existing.mode);
    // Source I/O and authorization may have yielded since approval. Check in the persistence
    // owner, with no await before revision capture and replacement.
    assertReviewedThemeFileCurrent({ target });
    // The temp file holds exactly what the rename publishes: its digest, taken before the rename, is the version this write commits.
    const committed = reviewedCommitDigest({ tempPath });
    if (existing && revisionFile) revision = saveThemeFileRevision({ ...revisionFile, target }, options);
    renameSync(tempPath, target);
    recordReviewedCommit({ committed });
  } catch (err) {
    rmSync(tempPath, { force: true });
    if (revision) rmSync(revision, { recursive: true, force: true });
    throw err;
  }
  pruneCommittedThemeRevision({ revision, revisionFile, target });
  // A direct replacement remains reversible within the bounded revision store. Manual trash is
  // retained until the owner explicitly permanently deletes it through the confirmation path.
  return revision;
}

/** Apply retention only after a replacement commits; cleanup failures never hide a saved edit.
 * @complexity Inherits the per-file retention scan; no work for a new file or a write in trash. */
function pruneCommittedThemeRevision({ revision, revisionFile, target }: {
  revision: string | undefined; revisionFile: ThemeRevisionFile | undefined; target: string;
}, _options = {}): void {
  if (!revision || !revisionFile) return;
  try { pruneThemeFileRevisions({ ...revisionFile, target }); }
  catch (error) {
    // The rename already committed. Report cleanup separately so callers still reload; the
    // next replacement retries retention, including revisions left by this attempt.
    console.warn('[theme-files] File saved; revision cleanup failed and will retry on the next replacement.', error);
  }
}

/** The digest to report for a write inside a tool's reviewed scope; no work for a write outside one. */
function reviewedCommitDigest({ tempPath }: { tempPath: string }, _options = {}): string | undefined {
  return reviewedWriteScope() ? fileDigest({ path: tempPath }).toString('hex') : undefined;
}

function recordReviewedCommit({ committed }: { committed: string | undefined }, _options = {}): void {
  const scope = reviewedWriteScope();
  if (scope) scope.committed = committed;
}

function assertReviewedThemeFileCurrent({ target }: { target: string }, _options = {}): void {
  const prepared = reviewedWriteScope()?.prepared;
  if (!prepared) return;
  const current = readThemeFileVersion(prepared.file);
  if (target !== prepared.target || current.target !== prepared.target || current.version !== prepared.version) {
    throw new ThemeFileChangedError();
  }
}

/** Pin contained theme bytes for a replacement review, including binaries past the text read cap.
 * @returns Canonical target and SHA-256; null means a new file. Symlinks use the normal theme rules.
 * @throws ThemePathError for invalid/nonregular paths; other read failures propagate.
 * @complexity O(file bytes) time, O(64 KiB) space through Jini's shared digest reader. */
export function readThemeFileVersion(required: { themeDir: string; themesRoot: string; relativePath: string }, _options = {}): { target: string; version: string | null } {
  const target = resolveThemeFilePath(required);
  const existing = statOrThemePathError({ target, relativePath: required.relativePath });
  if (!existing) return { target, version: null };
  if (!existing.isFile()) throw new ThemePathError({ message: `path '${required.relativePath}' exists and is not a regular file` });
  return { target, version: fileDigest({ path: target }).toString('hex') };
}

/** Replacement revisions are separate from manually trashed files, which retention never deletes. */
const THEME_REVISION_ROOT = '.trash/revisions';
const MAX_THEME_FILE_REVISIONS = 20;
type ThemeRevisionFile = { themeDir: string; themesRoot: string; relativePath: string };

/** Real numeric revision directories only; never follow or delete a symlink during retention.
 * @complexity O(r log r) time and O(r) space for r stored revision directories. */
function themeRevisionDirectories({ root }: { root: string }, _options = {}): string[] {
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name) && Number.isSafeInteger(Number(entry.name)))
    .map(entry => entry.name).sort((a, b) => Number(a) - Number(b));
}

/** Copies current theme bytes to the existing restorable trash layout before replacement.
 * Numeric directory creation is exclusive; parallel writes cannot overwrite a previous revision.
 * @returns The owned revision directory, or undefined for a write already inside trash.
 * @throws Containment/copy failures before the live file changes; partial revisions are removed.
 * @complexity O(file bytes + r log r + timestamp collisions) time, O(r) space for r revisions; copyFileSync never buffers the whole file. */
function saveThemeFileRevision(
  required: ThemeRevisionFile & { target: string }, { now = Date.now }: { now?: () => number } = {},
): string | undefined {
  // The resolver canonicalizes the target; use the same base for roots reached through symlinks.
  const normalized = relative(realpathSync(required.themeDir), required.target).split(sep).join('/');
  if (normalized.split('/')[0] === '.trash') return undefined;
  const root = resolveThemeFilePath({ ...required, relativePath: THEME_REVISION_ROOT });
  mkdirSync(root, { recursive: true });
  const previous = themeRevisionDirectories({ root });
  const { directory, sequence } = createThemeRevisionDirectory({ root, next: Math.max(now(), Number(previous.at(-1) ?? 0) + 1) });
  try {
    const destination = resolveThemeFilePath({ ...required, relativePath: `${THEME_REVISION_ROOT}/${sequence}/${normalized}` });
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(required.target, destination, fsConstants.COPYFILE_EXCL);
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Reserve a numeric directory exclusively; parallel writes cannot overwrite an old revision.
 * @returns The owned directory and sequence. Only collisions retry; other filesystem errors and
 * exhausted sequence numbers propagate before any live-file change.
 * @complexity O(timestamp collisions) time, O(1) space. */
function createThemeRevisionDirectory({ root, next }: { root: string; next: number }, _options = {}): { directory: string; sequence: number } {
  for (;;) {
    if (!Number.isSafeInteger(next)) throw new ThemePathError({ message: 'theme revision sequence is exhausted' });
    const directory = join(root, String(next));
    try { mkdirSync(directory); return { directory, sequence: next }; }
    catch (error) {
      if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST')) throw error;
      next++;
    }
  }
}

/** Keep the latest 20 replacements per canonical file; manual trash and other files survive.
 * Remove only that file from a revision directory, since restored/legacy directories may contain
 * multiple files. Symlink ancestors are skipped rather than followed during retention.
 * @throws Filesystem/containment errors; the committed-write caller reports these separately.
 * @complexity O(r log r + r*d + removed bytes) time, O(r) space for r revisions and path depth d. */
function pruneThemeFileRevisions(required: ThemeRevisionFile & { target: string }, _options = {}): void {
  const normalized = relative(realpathSync(required.themeDir), required.target);
  const root = resolveThemeFilePath({ ...required, relativePath: THEME_REVISION_ROOT });
  const files = themeRevisionDirectories({ root }).flatMap(directory => {
    const file = regularRevisionFile({ root: join(root, directory), normalized });
    return file ? [file] : [];
  });
  for (const file of files.slice(0, -MAX_THEME_FILE_REVISIONS)) {
    rmSync(file);
    removeEmptyRevisionParents({ directory: dirname(file), root });
  }
}

/** Walk real directories only so retention cannot delete through even an in-theme symlink.
 * @returns The regular revision file, or undefined for missing/nonregular/symlink paths.
 * @complexity O(d) time and space for path depth d; metadata reads only. */
function regularRevisionFile({ root, normalized }: { root: string; normalized: string }, _options = {}): string | undefined {
  const parts = normalized.split(sep);
  let file = root;
  for (const part of parts.slice(0, -1)) {
    file = join(file, part);
    if (!lstatSync(file, { throwIfNoEntry: false })?.isDirectory()) return undefined;
  }
  const name = parts.at(-1);
  if (name === undefined) throw new Error("Theme file path has no filename");
  file = join(file, name);
  return lstatSync(file, { throwIfNoEntry: false })?.isFile() ? file : undefined;
}

/** Remove only empty revision parents after pruning; never erase a sibling file or manual trash.
 * @throws Filesystem failures so the next replacement can retry cleanup.
 * @complexity O(d + directory entries) metadata reads for the removed file's parent chain. */
function removeEmptyRevisionParents({ directory, root }: { directory: string; root: string }, _options = {}): void {
  while (directory !== root && readdirSync(directory).length === 0) {
    rmdirSync(directory);
    directory = dirname(directory);
  }
}
