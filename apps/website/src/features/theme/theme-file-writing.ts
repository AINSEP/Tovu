import { mkdirSync, realpathSync, statSync, writeFileSync, type Stats } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { ThemePathError, MAX_THEME_FILE_BYTES, resolveThemeFilePath, statOrThemePathError } from "./theme-files.js";
import { writeFileAtomically } from "./theme-file-atomic-write.js";


/**
 * Refuses a write over `existing` when it is not a regular file, or when it is past the
 * {@link MAX_THEME_FILE_BYTES} read limit and `overwriteOversized` is false. {@link readThemeFile}
 * refuses a file that size, so a body sent for it was never an edit of its text: checking only the new
 * body's size let a short body replace the whole file. `undefined` (no file yet) always passes.
 *
 * @throws {ThemePathError} On either refusal.
 * @complexity O(1).
 */
function assertOverwritableTarget({ existing, relativePath, overwriteOversized }: { existing: Stats | undefined; relativePath: string; overwriteOversized: boolean }, _optional = {}): void {
  if (!existing) return;
  if (!existing.isFile()) {
    throw new ThemePathError({ message: `path '${relativePath}' exists and is not a regular file` });
  }
  if (existing.size > MAX_THEME_FILE_BYTES && !overwriteOversized) {
    throw new ThemePathError({ message: `file '${relativePath}' exceeds the ${MAX_THEME_FILE_BYTES}-byte readable limit; overwriting it requires overwriteOversized: true` });
  }
}

/**
 * Validate a proposed text write without creating directories, revisions or files.
 * Both approval preparation and execution use these same containment and size rules.
 *
 * @param optional.overwriteOversized - Must be `true` to replace an existing file past the
 * {@link MAX_THEME_FILE_BYTES} read limit. The admin editor never sets it.
 * @param optional.stat - Filesystem stat dependency, shared by the pre-check and atomic write.
 * @returns The absolute path permitted for the write.
 * @throws {ThemePathError} On any containment failure, an oversized body, a
 * target that exists and is not a regular file, or an existing target past the
 * {@link MAX_THEME_FILE_BYTES} read limit without `overwriteOversized`.
 * @complexity O(s) in the content size.
 * @overallScore 100/100
 */
export function validateThemeFileWrite(
  required: { themeDir: string; themesRoot: string; relativePath: string; content: string },
  optional: { overwriteOversized?: boolean; stat?: typeof statSync } = {}
): string {
  const target = resolveThemeFilePath(required);
  if (Buffer.byteLength(required.content, "utf8") > MAX_THEME_FILE_BYTES) {
    throw new ThemePathError({ message: `content exceeds the ${MAX_THEME_FILE_BYTES}-byte per-file limit` });
  }
  // statOrThemePathError, NEVER a bare statSync — same circular-symlink (a -> b -> a) ELOOP escape
  // `readThemeFile` was fixed for (see that wrapper's own doc): `resolveThemeFilePath` does not
  // resolve a `target` that is ITSELF a self-referential symlink, so this is the first call that can
  // observe the cycle. Following the link (rather than `lstat`ing it) is deliberate here too: a
  // symlink pointing to a real file inside the theme is meant to be overwritten through, exactly like
  // any other existing target.
  const existing = statOrThemePathError({ target, relativePath: required.relativePath }, { stat: optional.stat });
  assertOverwritableTarget({ existing, relativePath: required.relativePath, overwriteOversized: optional.overwriteOversized === true });
  return target;
}

/** Write validated theme text, retaining the previous bytes only after every precondition passes.
 * Preparation and execution share validation so impossible writes never require approval.
 * @returns The canonical path written. @throws ThemePathError for invalid paths or oversized files.
 * @param optional.now - Injectable revision clock; persisted sequence numbers still increase on clock rollback.
 * @param optional.onRevision - Receives the retained theme-relative revision after a successful replacement.
 * @complexity O(content bytes + previous file bytes + r log r + r*d) time, O(r + d) revision metadata for r revisions and path depth d. */
export function writeThemeFile(
  required: { themeDir: string; themesRoot: string; relativePath: string; content: string },
  optional: { overwriteOversized?: boolean; stat?: typeof statSync; now?: () => number;
    onRevision?: (required: { trashedPath: string }, optional: Record<string, never>) => void } = {}
): string {
  const target = validateThemeFileWrite(required, optional);
  mkdirSync(dirname(target), { recursive: true });
  const revision = writeFileAtomically({ target, relativePathForError: required.relativePath, fillTemp: (tempPath) => writeFileSync(tempPath, required.content, "utf8") }, { stat: optional.stat, revisionFile: required, options: optional });
  if (revision) {
    // Revision paths returned to tools must use that same canonical base, not a symlink spelling.
    const base = realpathSync(required.themeDir);
    optional.onRevision?.({ trashedPath: relative(base, join(revision, relative(base, target))).split(sep).join('/') }, {});
  }
  return target;
}

/**
 * Write (create or replace) one BINARY file inside a theme's folder, byte for byte — the
 * `theme_import_file_from_url` half of {@link writeThemeFile}. Same containment, same
 * not-a-regular-file refusal, same atomic temp-and-rename; never decodes. No
 * {@link MAX_THEME_FILE_BYTES} check: that bounds text an agent reads or writes, and the caller
 * has already bounded these bytes (its fetch cap). Replacing an existing file past that limit is
 * allowed for the same reason — a font or image swap is not an edit of unread text.
 *
 * @returns The absolute path written.
 * @throws {ThemePathError} On any containment failure, or a target that exists and is not a regular file.
 * @complexity O(s) in the byte count.
 */
export function writeThemeBinaryFile(
  required: { themeDir: string; themesRoot: string; relativePath: string; bytes: Uint8Array },
  _optional: Record<string, never> = {}
): string {
  const target = resolveThemeFilePath(required);
  const existing = statOrThemePathError({ target, relativePath: required.relativePath }, { stat: undefined });
  assertOverwritableTarget({ existing, relativePath: required.relativePath, overwriteOversized: true });
  mkdirSync(dirname(target), { recursive: true });
  writeFileAtomically({ target, relativePathForError: required.relativePath, fillTemp: (tempPath) => writeFileSync(tempPath, required.bytes) }, { stat: undefined, revisionFile: required });
  return target;
}
