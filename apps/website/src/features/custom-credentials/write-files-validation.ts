import { CustomCredentialValidationError } from "./store.js";

/**
 * @file Shape/path/size validation for `custom_credential_write_files` — every check here runs
 * BEFORE the credential is resolved or any network call is made, mirroring this domain's own
 * established ordering (`tool-registrations.ts`'s `rejectUnexpectedSetTokenFields`/
 * `requireUsernameOrClearSentinel` both run before `requireToolPermission`/any I/O) and
 * `features/agent-plugins/package-paths.ts`'s "cheap majority of attempts caught before any
 * filesystem call" split.
 *
 * `OWNER_PATTERN`/`REPO_PATTERN`/`BRANCH_PATTERN`/`MAX_COMMIT_MESSAGE_LENGTH` are byte-identical to
 * `features/source-control/commit-site.ts`'s own constants of the same name — copied, not imported,
 * per this codebase's established convention for a tiny cross-feature constant (that file's own
 * `OWNER_PATTERN` doc: "copied, not imported... no dependency on `features/deployments/**`"; the
 * same reasoning applies here in reverse — this domain has no dependency on `features/source-control`,
 * and the dispatch that added this file was explicitly told not to add one).
 *
 * The path-safety rule set is the LEXICAL half of `package-paths.ts`'s `normalizePackageEntryPath`
 * (reject NUL, absolute paths, a Windows drive prefix, `..` segments) — never its filesystem half
 * (`assertContainedOnDisk`'s `realpath` containment check), because there is no local filesystem
 * write here to protect: every validated path becomes a `path` field in a GitHub git-tree entry, a
 * remote API call this process never resolves against its own disk. One rule has no
 * `package-paths.ts` analog: a normalized path that IS (or is nested under) `.git` — case-insensitively
 * — is refused outright. That directory name is git's own reserved metadata location; committing a
 * tracked FILE at a path like `.git/config` or `.GIT/hooks/pre-commit` is exactly the shape of the
 * case-insensitive-filesystem `.git` collision class git itself started refusing at clone/checkout
 * time (CVE-2021-21300 and related) — refusing it here, at write time, is cheap and closes the same
 * hole from the other direction for any client that has not been patched.
 */

/** GitHub owner/org name: alphanumeric, may contain single hyphens, cannot start with one, capped at
 *  GitHub's own 39-character username limit. */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** GitHub repo name: letters, digits, `.`/`-`/`_`, capped at GitHub's own 100-character limit. */
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
/** Git branch name — permissive (real branch names allow far more), but refuses whitespace/control
 *  characters before the value reaches a URL path segment. */
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,250}$/;
const MAX_COMMIT_MESSAGE_LENGTH = 500;

/**
 * Bounds on one `custom_credential_write_files` call. Concrete numbers, each justified rather than
 * left unbounded (an operator-controlled write into a real repository must never be unbounded — same
 * reasoning `agent-plugins/install.ts`'s own `LIMITS` gives for its structurally identical problem):
 *
 * - `maxFiles`: the confirmation dialog this tool opens (`write-files-confirmation-ui.ts`) lists
 *   every path by name so a human can actually read and approve each one before anything is written;
 *   past a few dozen rows that review stops being real. The one caller that exists today
 *   (`tovu-deploy-fly`) writes exactly 2 files. 25 is generous headroom above that for any plausible
 *   future caller while keeping the dialog reviewable.
 * - `maxPathLength`: far beyond any real repository path, while still bounding one hostile field.
 * - `maxFileBytes`: every known caller writes small hand-authored or LLM-authored text config
 *   (`fly.toml`, a GitHub Actions workflow YAML) — 1 MiB is generous for that class of file while
 *   keeping a single blob-creation request body bounded.
 * - `maxTotalBytes`: bounds the call's AGGREGATE payload independent of how the per-file cap is
 *   split across files — the same "per-item cap AND total cap" shape `agent-plugins/install.ts`'s
 *   `maxFileBytes`/`maxTotalExtractedBytes` pair uses for the identical reason.
 */
export const WRITE_FILES_LIMITS = {
  maxFiles: 25,
  maxPathLength: 1024,
  maxFileBytes: 1_048_576,
  maxTotalBytes: 4 * 1_048_576,
} as const;

/** One validated, normalized file this call will write. */
export interface NormalizedWriteFile {
  readonly path: string;
  readonly content: string;
}

/** The fully validated, normalized shape {@link validateWriteFilesInput} returns. */
export interface ValidatedWriteFilesInput {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly commitMessage: string;
  readonly files: readonly NormalizedWriteFile[];
}

export function validateOwner(value: unknown): string {
  if (typeof value !== "string" || !OWNER_PATTERN.test(value)) {
    throw new CustomCredentialValidationError(`invalid GitHub owner '${typeof value === "string" ? value.slice(0, 60) : String(value)}'`);
  }
  return value;
}

export function validateRepo(value: unknown): string {
  if (typeof value !== "string" || !REPO_PATTERN.test(value) || value === "." || value === "..") {
    throw new CustomCredentialValidationError(`invalid GitHub repo '${typeof value === "string" ? value.slice(0, 100) : String(value)}'`);
  }
  return value;
}

export function validateBranch(value: unknown): string {
  if (typeof value !== "string" || !BRANCH_PATTERN.test(value)) {
    throw new CustomCredentialValidationError(`invalid branch name '${typeof value === "string" ? value.slice(0, 60) : String(value)}'`);
  }
  // BRANCH_PATTERN alone would admit these — `.`, `-`, and `/` are all in its character class — but a
  // `..` or empty `/`-separated segment is a dot-segment the URL constructor normalizes away, so a
  // branch like '../tags/release' would silently retarget the ref read/update into another namespace.
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "..")) {
    throw new CustomCredentialValidationError(`invalid branch name '${value.slice(0, 60)}' — must not contain an empty or '..' path segment`);
  }
  return value;
}

export function validateCommitMessage(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_COMMIT_MESSAGE_LENGTH) {
    throw new CustomCredentialValidationError(`commitMessage must be 1-${MAX_COMMIT_MESSAGE_LENGTH} characters`);
  }
  return value;
}

/** Rejects a `.git`-named or `.git/`-nested path, case-insensitively — see this file's header for
 *  the collision class this closes. Applied AFTER lexical normalization, so `./.git`/`.GIT/x` are
 *  both caught the same way regardless of how the caller spelled the segment. */
function isReservedGitPath(normalized: string): boolean {
  const lower = normalized.toLowerCase();
  return lower === ".git" || lower.startsWith(".git/");
}

/**
 * Rejects an absolute path, a NUL byte, a Windows drive prefix, a lexical `..`/`.` segment, or a
 * path naming/nesting under `.git` — BEFORE any network call. See this file's header for why this
 * is the lexical half only of `package-paths.ts`'s `normalizePackageEntryPath`, with one addition
 * that function has no analog for.
 *
 * @throws {CustomCredentialValidationError} The path is unsafe by construction.
 * @complexity O(n) in the path's own length.
 */
export function normalizeWriteFilePath(rawPath: string): string {
  if (rawPath.length > WRITE_FILES_LIMITS.maxPathLength) {
    throw new CustomCredentialValidationError(`file path exceeds the ${WRITE_FILES_LIMITS.maxPathLength}-character cap: '${rawPath.slice(0, 80)}...'`);
  }
  if (rawPath.includes("\0")) {
    throw new CustomCredentialValidationError(`file path contains a NUL byte: '${rawPath.slice(0, 80)}'`);
  }

  const portable = rawPath.replaceAll("\\", "/");

  if (portable.startsWith("/") || /^[a-zA-Z]:/.test(portable)) {
    throw new CustomCredentialValidationError(`file path must be relative, not absolute: '${rawPath}'`);
  }

  const segments = portable.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new CustomCredentialValidationError(`file path escapes the repository root: '${rawPath}'`);
  }
  const normalized = segments.filter((segment) => segment !== "." && segment !== "").join("/");
  if (normalized === "") {
    throw new CustomCredentialValidationError(`file path is empty or resolves to nothing: '${rawPath}'`);
  }

  if (isReservedGitPath(normalized)) {
    throw new CustomCredentialValidationError(`file path names or nests under the reserved '.git' directory: '${rawPath}'`);
  }

  return normalized;
}

/** `true` when `normalizedPath` is a GitHub Actions workflow file — the exact, case-sensitive
 *  directory GitHub itself recognizes (workflows outside this exact path are never executed), so
 *  this check can never over- or under-match what actually controls CI. Used by
 *  `write-files-confirmation-ui.ts` to render an extra, more emphatic warning for this path class. */
export function isWorkflowPath(normalizedPath: string): boolean {
  return normalizedPath.startsWith(".github/workflows/");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireStringFileEntry(raw: unknown): { readonly path: string; readonly content: string } {
  if (!isPlainObject(raw) || typeof raw.path !== "string" || typeof raw.content !== "string") {
    throw new CustomCredentialValidationError("each entry in 'files' must be an object with a string 'path' and a string 'content'");
  }
  return { path: raw.path, content: raw.content };
}

function addFileBytesWithinLimits(normalized: string, content: string, totalBytes: number): number {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > WRITE_FILES_LIMITS.maxFileBytes) {
    throw new CustomCredentialValidationError(`file '${normalized}' is ${bytes} bytes, over the ${WRITE_FILES_LIMITS.maxFileBytes}-byte per-file cap`);
  }
  const nextTotalBytes = totalBytes + bytes;
  if (nextTotalBytes > WRITE_FILES_LIMITS.maxTotalBytes) {
    throw new CustomCredentialValidationError(`'files' totals over the ${WRITE_FILES_LIMITS.maxTotalBytes}-byte aggregate cap`);
  }
  return nextTotalBytes;
}

/**
 * Validates and normalizes the `files` array: shape, per-file path safety, per-file and aggregate
 * size caps, the file-count cap, and duplicate-path detection within the same call — mirroring
 * `agent-plugins/install.ts`'s own "duplicate archive entry... refusing a second write over an
 * already-vetted first one" rule, adapted from an archive's entries to this call's own file list.
 *
 * @throws {CustomCredentialValidationError} Any shape, path, or size violation.
 * @complexity O(n) in the number of files, plus O(m) in each file's own content length.
 */
function validateFiles(rawFiles: unknown): readonly NormalizedWriteFile[] {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    throw new CustomCredentialValidationError("'files' must be a non-empty array of {path, content} objects");
  }
  if (rawFiles.length > WRITE_FILES_LIMITS.maxFiles) {
    throw new CustomCredentialValidationError(`'files' has ${rawFiles.length} entries, over the ${WRITE_FILES_LIMITS.maxFiles}-file cap`);
  }

  const seen = new Set<string>();
  const files: NormalizedWriteFile[] = [];
  let totalBytes = 0;

  for (const raw of rawFiles) {
    const { path, content } = requireStringFileEntry(raw);

    const normalized = normalizeWriteFilePath(path);
    if (seen.has(normalized)) {
      throw new CustomCredentialValidationError(`duplicate file path '${normalized}' — refusing a second write over an already-vetted first one`);
    }
    seen.add(normalized);

    totalBytes = addFileBytesWithinLimits(normalized, content, totalBytes);

    files.push({ path: normalized, content });
  }

  return files;
}

/**
 * The single entry point every `custom_credential_write_files` call validates through before the
 * credential is resolved or any network call is made — `owner`/`repo`/`branch`/`commitMessage` shape,
 * plus every file's path safety and the count/size caps. Mirrors this domain's own established
 * ordering (see this file's header) of "shape/security validation before permission check or I/O".
 *
 * @throws {CustomCredentialValidationError} Any field fails its own validation.
 * @complexity O(n) in the number of files, plus O(m) in each file's own content length.
 */
export function validateWriteFilesInput(input: { owner: unknown; repo: unknown; branch: unknown; commitMessage: unknown; files: unknown }): ValidatedWriteFilesInput {
  return {
    owner: validateOwner(input.owner),
    repo: validateRepo(input.repo),
    branch: validateBranch(input.branch),
    commitMessage: validateCommitMessage(input.commitMessage),
    files: validateFiles(input.files),
  };
}
