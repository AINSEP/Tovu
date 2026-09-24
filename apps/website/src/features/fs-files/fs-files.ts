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
 * @file Path containment, the off-limits denylist, and read-only file I/O for the
 * `fs_list_files`/`fs_read_file` agent-tool domain (`agent-tools.ts`/`tool-registrations.ts`).
 *
 * Purpose:
 * This domain shipped (commit `68d7e525`) as a five-member named-root ALLOWLIST — the model was "the
 * assistant may look inside a fixed, named set of directories and nowhere else," with a denylist
 * running only as defense in depth underneath it. The product owner reversed that on 2026-09-10: her
 * call is default-allow — the assistant should be able to read most of the repo/site tree without
 * anyone pre-listing a root — with the actual boundary moved onto an explicit denylist of what must
 * never be read. {@link FS_FILES_DENYLIST} below is that boundary now; `layout.ts`'s roots
 * (`repo`, `site`, and the operator-set `custom`) are deliberately broad, not a curated allowlist — see that file's own header for
 * what widening them traded away (most notably: the site directory's `chat.db`/`content.db` are no
 * longer excluded by LOCATION, only by the `*.db` pattern below plus the binary sniff).
 *
 * Why containment is still not a string prefix check — verbatim from `theme-files.ts`, because the
 * same three independently-exploitable defects apply to any "is this path inside that folder" check,
 * and root selection getting broader does not change any of them:
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
 * The denylist, now the PRIMARY gate: {@link isDeniedFsPathSegment} refuses any path with a `secrets`
 * segment at any depth (refused on read, and never even descended into by the `fs_list_files` walk —
 * see {@link visitFsDirEntry}), and {@link isDeniedFsFileName} refuses a small, fixed set of basename
 * patterns — `.env*`, `*.pem`/`*.key`/`*.p12`, `*.db`/`*.db-wal`/`*.db-shm`, `.mcp.json`/`.mcp.*.json`.
 * Both read {@link FS_FILES_DENYLIST}, the one place meant for editing this list. Separately,
 * {@link EXCLUDED_LISTING_DIR_NAMES} keeps `node_modules`/`.git`/build output out of `fs_list_files`
 * results — that exclusion is ergonomics only, NOT part of the security boundary, and does not apply
 * to `fs_read_file` at all.
 *
 * The general principle {@link FS_FILES_DENYLIST} exists to enforce: this is a DENYLIST over a
 * default-allow tree, not an allowlist with exceptions carved out. That means anything
 * credential-bearing that does NOT already match one of its patterns is readable today, silently,
 * until someone adds it here — the `.mcp.json`/`.mcp.jini-*.json` entry below was exactly that kind
 * of gap (discovered, not designed in, after this domain's roots were widened) and is not likely to
 * be the last one. Treat a new credential-shaped file discovered anywhere in `repo`/`site` as a
 * denylist gap to close here, not a one-off.
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
 * Ceiling on directory ENTRIES scanned by one `listFsFiles` walk — every `readdirSync` entry, before
 * the per-entry decision that may or may not record it. Deliberately separate from
 * {@link MAX_LISTED_FILES}: that cap stops the walk once enough RESULTS are collected, so it bounds
 * nothing about the traversal itself — a wide tree whose entries are denied, excluded, or simply not
 * regular files is still walked entry-by-entry (one `lstatSync` each, one `readdirSync` per
 * directory) with no result ever recorded, and the whole walk is synchronous.
 *
 * DERIVED from {@link MAX_LISTED_FILES} rather than written as its own number, and that is the point:
 * every recorded file costs exactly one entry, so a literal below the result cap would make the
 * result cap unreachable and silently halve the largest listing a caller can get. Expressed as a
 * multiple, the two can never invert — this bound can only ever fire on a tree whose entries are
 * mostly NOT results, which is the case it exists for.
 */
const MAX_WALK_ENTRIES = MAX_LISTED_FILES * 10;

/**
 * THE off-limits list. Everything else in this module governs WHERE a read may occur (root selection
 * in `layout.ts`, symlink containment below); this constant governs WHAT may never be read, no matter
 * where it lives — the owner's own boundary: default to allowing most things, deny secrets and
 * `.env`-shaped files specifically. This is the one place meant for editing it — add to it here, not
 * by scattering a new check elsewhere in this file.
 */
export const FS_FILES_DENYLIST = {
  /**
   * Exact path SEGMENT names refused at any depth, matched case-insensitively against each segment
   * of the caller-supplied path (never a substring — a directory named `not-secrets-actually` is not
   * a match). `secrets` is the owner's explicit example: whatever a site or app tree names its
   * credentials folder (`sites/**\/secrets/`, `apps/admin/**\/secrets/`, or anywhere else), it never
   * becomes reachable through this domain. A denied segment is refused by {@link resolveFsFilePath}
   * AND skipped entirely by the `fs_list_files` walk (see {@link visitFsDirEntry}) — its contents are
   * never even enumerated, not merely refused once named. Besides `secrets`, the set names the
   * well-known credential-store directories a home-directory `custom` root can expose: `.aws`
   * (`credentials`), `.docker` (`config.json` with registry auth), `.kube` (`config`), and
   * `gcloud`/`gh` for `.config/gcloud/application_default_credentials.json` and
   * `.config/gh/hosts.yml`. Denied by SEGMENT rather than by leaf filename on purpose: `config`,
   * `config.json`, and `hosts.yml` are generic names that appear harmlessly elsewhere, so denying the
   * directory is the narrower of the two mistakes.
   *
   * `.tovu` (2026-09-24) — the install-wide root key's own directory. `keyring.env.ts`'s
   * `defaultRootKeyFilePath` resolves to `<cwd>/sites/.tovu/integrations-root-key.hex` in production
   * (a SIBLING of every `sites/<name>/` folder, on the durable Fly volume) and to
   * `~/.tovu/integrations-root-key.hex` in local/dev (reachable through the operator-set `custom`
   * root, `layout.ts`'s home-directory case). `TOVU_INTEGRATIONS_ROOT_KEY` is the one secret the
   * "Site Token" admin UI, every webhook/analytics/newsletter signing secret, and site-token
   * permission checks all derive from (see `keyring.env.ts`'s own header) — the owner's standing rule
   * is that the agent must never be able to read it off disk. Denying the whole `.tovu` segment, not
   * merely the generated filename, also keeps `fs_list_files` from ever enumerating that directory's
   * contents in the first place (see {@link visitFsDirEntry}), the same "never even advertise it"
   * property `secrets` gets above.
   */
  segments: new Set(["secrets", ".aws", ".docker", ".kube", "gcloud", "gh", ".tovu"]),
  /**
   * Basename patterns refused wherever they appear, matched against the path's final segment only (a
   * directory legitimately named e.g. `keys/` is not itself a secret — only a leaf file matching one
   * of these shapes is):
   * - `.env` and every `.env.*` variant — this repo alone has `.env`, `.env.example`, and
   *   `.env.bak-before-forbid-bash` today; the pattern matches the FAMILY, never one literal name.
   * - `*.pem` / `*.key` / `*.p12` — private-key and certificate material.
   * - `*.db` / `*.db-wal` / `*.db-shm` — SQLite data files, including the site directory's own
   *   `chat.db`/`content.db` now that `site` is a whole-directory root (see `layout.ts`'s header).
   *   Belt-and-braces for these three: they are binary, so {@link looksBinary} would refuse a read
   *   anyway, but naming them here also keeps them out of `fs_list_files` results.
   * - `.mcp.json` and every `.mcp.*.json` variant — the agent daemon's own per-run MCP config
   *   (`mcp-injection.ts` writes one `.mcp.jini-<runId>.json` per spawned CLI at the repo root; the
   *   checked-in `.mcp.json` is the base config). NOT cosmetic filtering: every one of these files
   *   carries a live `JINI_DAEMON_TOKEN`, gitignored (`.gitignore`) for the identical reason `.env`
   *   is. Discovered as a gap AFTER `repo` became a whole-tree root (2026-09-10) — do not delete this
   *   entry thinking it is redundant with `.env*`; it is a distinct credential shape the `.env`
   *   pattern does not, and was not meant to, cover.
   * - `*.crt` / `*.cer` / `*.cert` / `*.pfx` / `*.jks` / `*.keystore` / `*.jwk` / `*.jwks` —
   *   certificate and keystore material, the same family `*.pem`/`*.key`/`*.p12` above only partially
   *   covers. None of these exist in this repo TODAY. Added anyway, proactively, per the owner's
   *   standing "secrets/.env and that type of stuff is off-limits" instruction — do NOT delete this
   *   entry because a grep for it comes up empty; empty is the point, not evidence it is dead weight.
   * - `.npmrc` / `.netrc` (exact basenames, not a suffix family) — package-registry and generic
   *   network auth tokens live in these by convention. Also currently absent from this repo; kept for
   *   the same proactive reason as the certificate family above.
   * - The `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519` SSH private-key family, INCLUDING named variants
   *   (`id_rsa_backup`, `id_rsa2`, ...) — but deliberately EXCLUDING their `*.pub` public halves,
   *   which are not secret and are routinely shared. The trailing `(?<!\.pub)` is load-bearing: an
   *   earlier, simpler version of this pattern would have denied `id_rsa.pub` too, which is the wrong
   *   direction of mistake (over-denying is the easy trap here, not under-denying).
   * - `credentials.json` and `credentials` (exact basenames) and `client_secret*.json` — Google
   *   Cloud/OAuth service-account and client-secret export conventions, plus the extension-less AWS
   *   shared-credentials file, which has no suffix family to match on.
   * - `.git-credentials` (exact basename) — git's own credential-store file, another extension-less
   *   name that none of the patterns above covers.
   * - `*root-key*.hex` (2026-09-24) — belt-and-braces for the root key file itself, independent of
   *   the `.tovu` SEGMENT deny above: a copy, backup, or rename of `integrations-root-key.hex` sitting
   *   anywhere else in the tree (outside a `.tovu` directory, where the segment deny would not fire)
   *   is still the same live `TOVU_INTEGRATIONS_ROOT_KEY` material and must stay unreadable.
   * - `.credentials.json` (exact basename, 2026-09-24) — Claude's own OAuth token store
   *   (`~/.claude/.credentials.json`), reachable through the operator-set `custom` root the same way
   *   `.aws`/`.docker`/`.kube` are. Distinct from the pre-existing `credentials.json` (no leading dot)
   *   pattern below, which is the Google Cloud/AWS convention — both are kept, neither replaces the
   *   other.
   * - The shell rc family (2026-09-24) — `.bash_profile`/`.bashrc`/`.bash_login`/`.zshrc`/`.zprofile`/
   *   `.zshenv`/`.zlogin`/`.profile`. These are where this machine's notarization credentials and other
   *   exported API tokens live (`export FOO=...` lines sourced on every shell start) — see
   *   `desktop_notarization_already_set_up` in the owner's own memory for a concrete example of what a
   *   `.bash_profile` on this machine carries. Exact basenames, not a suffix family: a project file
   *   that merely contains "profile" in its name (`profile.ts`) must not match.
   */
  filenamePatterns: [
    /^\.env(?:\..*)?$/i,
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /\.db$/i,
    /\.db-wal$/i,
    /\.db-shm$/i,
    /^\.mcp(?:\..*)?\.json$/i,
    /\.(?:crt|cer|cert|pfx|jks|keystore|jwk|jwks)$/i,
    /^\.(?:npmrc|netrc)$/i,
    /^id_(?:rsa|dsa|ecdsa|ed25519).*(?<!\.pub)$/i,
    /^credentials\.json$/i,
    /^credentials$/i,
    /^client_secret.*\.json$/i,
    /^\.git-credentials$/i,
    /root-key.*\.hex$/i,
    /^\.credentials\.json$/i,
    /^\.(?:bash_profile|bashrc|bash_login|zshrc|zprofile|zshenv|zlogin|profile)$/i,
  ] as readonly RegExp[],
} as const;

/**
 * Whether a bare filename (no directory component) matches one of
 * {@link FS_FILES_DENYLIST}'s `filenamePatterns`.
 *
 * @complexity O(p) in the fixed, tiny pattern count.
 */
export function isDeniedFsFileName(fileName: string): boolean {
  const folded = foldFsNameForDenylist(fileName);
  return FS_FILES_DENYLIST.filenamePatterns.some((pattern) => pattern.test(fileName) || pattern.test(folded));
}

/**
 * Whether one path SEGMENT (not a full path) matches one of {@link FS_FILES_DENYLIST}'s `segments`,
 * case-insensitively.
 *
 * @complexity O(1).
 */
export function isDeniedFsPathSegment(segmentName: string): boolean {
  return FS_FILES_DENYLIST.segments.has(segmentName.toLowerCase()) || FS_FILES_DENYLIST.segments.has(foldFsNameForDenylist(segmentName));
}

/**
 * A name as the host file system would OPEN it, for the denylist comparison only — never for the path
 * actually read. Two host behaviors let a spelling the denylist does not recognize open a denied file:
 * - macOS's default case-insensitive APFS folds Unicode case, so `.ba\u017Fhrc` (LONG S) opens
 *   `.bashrc` and `root-\u212Aey.hex` (KELVIN SIGN) opens `root-key.hex` — verified on the owner's
 *   machine 2026-09-24. `toLowerCase()` leaves both characters alone and a non-`u` `/i` regex does not
 *   fold them either; lower→upper→lower does (`\u017F` → `S` → `s`, `\u212A` → `k`).
 * - Windows (a shipped desktop target) drops trailing dots and spaces from every path component and
 *   reads `name::$DATA` as `name` itself, so `.env.`, `.tovu. ` and `.env::$DATA` all open the real file.
 * Callers test the raw name AND this folded one, so folding can only ever add a denial, never remove one.
 *
 * @complexity O(n) in the name's length.
 */
function foldFsNameForDenylist(name: string): string {
  const withoutStream = name.replace(/:[^]*$/, "");
  const withoutTrailing = withoutStream.replace(/[. ]+$/, "");
  return withoutTrailing.toLowerCase().toUpperCase().toLowerCase();
}

/**
 * Directory names {@link walkFsDir} never descends into — ERGONOMICS, not a security boundary. A
 * listing under the now-broad `repo`/`site` roots that walked `node_modules`, `.git`, or a compiled
 * `dist/` tree would bury the handful of files a caller actually wants inside thousands of irrelevant
 * ones (and for `node_modules` specifically would likely burn through {@link MAX_LISTED_FILES} before
 * reaching anything the caller cares about). `readFsFile`/`resolveFsFilePath` do NOT consult this set
 * at all — a caller who already knows a path inside one of these directories (inspecting one specific
 * vendored package's source, say) can still read it directly; only the LISTING walk stays out. Do not
 * mistake this for the denylist above — nothing here is refused for being a secret.
 */
const EXCLUDED_LISTING_DIR_NAMES = new Set(["node_modules", ".git", "dist"]);

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
 * escapes it or matches the denylist.
 *
 * Rejects, in order: an empty path, a NUL byte, an absolute path, a path with any segment matching
 * {@link isDeniedFsPathSegment} (e.g. `secrets/`), a path whose basename matches
 * {@link isDeniedFsFileName}, a path that resolves outside the root (traversal), a path whose
 * deepest existing ancestor `realpath`s outside the root (symlink escape), and a path whose resolved
 * real target itself matches either denylist half (a symlink alias such as `public.txt` -> `.env`).
 * The root itself is also
 * re-`realpath`ed first, so a root reached through a symlink (this repo's own
 * `node_modules/@jini-ai/*` shape) still compares correctly rather than failing every read.
 *
 * @param required.rootPath - One of `layout.ts`'s resolved root directories (`repo`, `site`, or the operator-set `custom`).
 * @param required.relativePath - The caller-supplied path, relative to that root.
 * @returns The absolute, verified-contained path.
 * @throws {FsFilePathError} On any escape, denylist match, or malformed input.
 * @complexity O(d) in the path's directory depth, for the segment scan and the existing-ancestor probe.
 */
export function resolveFsFilePath(required: { rootPath: string; relativePath: string }): string {
  const { rootPath, relativePath } = required;

  assertWellFormedRelativePath(relativePath);
  assertRequestedPathNotDenied(relativePath);

  // `realpath` the root so one reached through a symlink (e.g. a `node_modules/@jini-ai/*` package
  // symlinked to a sibling checkout) compares against the same canonical form the ancestor probe
  // below produces.
  const base = existsSync(rootPath) ? realpathSync(rootPath) : resolve(rootPath);
  const target = resolve(base, relativePath);

  if (!isWithin(base, target)) {
    throw new FsFilePathError(`path '${relativePath}' resolves outside the allowed root`);
  }

  assertNoSymlinkEscape(base, target, relativePath);
  assertEffectiveTargetNotDenied(base, target, relativePath);

  return target;
}

/**
 * The three shape refusals every resolve starts with, before any path arithmetic: empty, NUL byte,
 * absolute. Split out of {@link resolveFsFilePath} purely so its own body reads as the sequence of
 * checks its doc describes rather than as one long guard block.
 *
 * @throws {FsFilePathError} On any of the three.
 * @complexity O(n) in the path's length (the NUL scan).
 */
function assertWellFormedRelativePath(relativePath: string): void {
  if (relativePath.length === 0) {
    throw new FsFilePathError("path is required");
  }
  if (relativePath.includes("\0")) {
    throw new FsFilePathError("path must not contain a NUL byte");
  }
  if (isAbsolute(relativePath)) {
    throw new FsFilePathError(`path '${relativePath}' must be relative to the root, not absolute`);
  }
}

/**
 * Apply both denylist halves to the path AS THE CALLER SPELLED IT — every segment against
 * {@link isDeniedFsPathSegment}, the basename against {@link isDeniedFsFileName}. Runs before any
 * filesystem access, so a denied path is refused whether or not it exists.
 * {@link assertEffectiveTargetNotDenied} is the same pair applied to what the path RESOLVES to.
 *
 * @throws {FsFilePathError} When a segment or the basename is denied.
 * @complexity O(d) in the path's segment count.
 */
function assertRequestedPathNotDenied(relativePath: string): void {
  const normalized = normalizeFsRelativePath(relativePath);
  const segments = normalized.length === 0 ? [] : normalized.split("/");
  for (const segment of segments) {
    if (isDeniedFsPathSegment(segment)) {
      throw new FsFilePathError(`path '${relativePath}' contains a denied path segment ('${segment}') and cannot be accessed`);
    }
  }

  const leafName = segments.length === 0 ? "" : segments[segments.length - 1];
  if (leafName.length > 0 && isDeniedFsFileName(leafName)) {
    throw new FsFilePathError(`path '${relativePath}' matches a denied filename pattern and cannot be accessed`);
  }
}

/**
 * Apply the denylist to the EFFECTIVE target as well as the caller's spelling: a same-directory
 * symlink alias (`public.txt` -> `.env`) passes every other check (its own name is harmless and its
 * realpath is still inside the root), yet `readFsFile` would stat/read the lexical path and Node
 * would follow the link to the real, denied file.
 *
 * A path that does not exist is left alone — there is nothing to alias, and `readFsFile` fails on the
 * subsequent stat. `existsSync` follows links, so a broken or circular link is `false` here and this
 * never reaches `realpathSync` with a loop, preserving the module's "throws only `FsFilePathError`"
 * property.
 *
 * @param relativePath - The caller's own spelling, quoted in the refusal so the message names what
 *   was asked for rather than the host path it resolved to.
 * @throws {FsFilePathError} When the resolved real path matches either denylist half.
 * @complexity O(d) in the resolved path's depth.
 */
function assertEffectiveTargetNotDenied(base: string, target: string, relativePath: string): void {
  if (!existsSync(target)) return;

  const effectiveSegments = relative(base, realpathSync(target)).split(sep);
  for (const segment of effectiveSegments) {
    if (isDeniedFsPathSegment(segment)) {
      throw new FsFilePathError(`path '${relativePath}' resolves to a denied path segment ('${segment}') and cannot be accessed`);
    }
  }

  // `relative()` returns `""` when the target IS the base (`.`, `a/..`), and `"".split(sep)` yields
  // `[""]` — so the guard is on the leaf's length, not on the array's.
  const effectiveLeaf = effectiveSegments.length === 0 ? "" : effectiveSegments[effectiveSegments.length - 1];
  if (effectiveLeaf.length > 0 && isDeniedFsFileName(effectiveLeaf)) {
    throw new FsFilePathError(`path '${relativePath}' resolves to a denied filename pattern and cannot be accessed`);
  }
}

/**
 * One directory entry's contribution to {@link walkFsDir}'s file listing: skip symlinks entirely
 * (neither descended nor reported — a link out of the root can neither enumerate nor leak anything
 * beyond it); never descend into a denied path segment (e.g. `secrets/`) or an
 * {@link EXCLUDED_LISTING_DIR_NAMES} entry (e.g. `node_modules/`) — the former for security, the
 * latter for noise, see each constant's own doc; recurse into every other real subdirectory; and
 * record real files that do not match a denied filename pattern. `state` is the walk-wide
 * {@link MAX_WALK_ENTRIES} budget plus its truncation flag, shared with the parent loop so every
 * entry counts against it. Verbatim shape of
 * `theme-files.ts`'s `visitThemeDirEntry`, plus the two directory-level skips this domain's broader
 * roots now need.
 */
function visitFsDirEntry(dir: string, name: string, depth: number, base: string, found: string[], state: FsWalkState): void {
  const full = resolve(dir, name);
  // lstatSync, NEVER statSync — statSync follows the link, so a circular symlink would throw ELOOP
  // straight out of this "throws only FsFilePathError" module. lstatSync reports the link itself,
  // so `isSymbolicLink()` catches every shape (normal, broken, circular) before anything follows it.
  const stat = lstatSync(full, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    if (isDeniedFsPathSegment(name) || EXCLUDED_LISTING_DIR_NAMES.has(name)) return;
    walkFsDir(full, depth + 1, base, found, state);
    return;
  }
  if (!stat.isFile()) return;
  if (isDeniedFsFileName(name)) return;
  found.push(relative(base, full).split(sep).join("/"));
}

/** One walk's mutable state, threaded through the recursion: the remaining
 *  {@link MAX_WALK_ENTRIES} budget, and whether any bound has cut the walk short. */
interface FsWalkState {
  remaining: number;
  truncated: boolean;
}

/** Whether any of the three bounds has been reached — the single place they are read, so a caller
 *  cannot learn about one of them and miss another. */
function walkBoundReached(found: string[], state: FsWalkState, depth: number): boolean {
  return depth > MAX_WALK_DEPTH || found.length >= MAX_LISTED_FILES || state.remaining <= 0;
}

/** Descends real directories under `base` only, collecting relative file paths into `found`
 *  (mutated in place), bounded by {@link MAX_WALK_DEPTH}, {@link MAX_LISTED_FILES} (results), and
 *  {@link MAX_WALK_ENTRIES} (the traversal itself, via `state`). Every early return is a truncated
 *  listing and says so on `state`, so `listFsFiles` can report it instead of returning a short list
 *  that looks complete. */
function walkFsDir(dir: string, depth: number, base: string, found: string[], state: FsWalkState): void {
  if (walkBoundReached(found, state, depth)) {
    state.truncated = true;
    return;
  }
  for (const name of readdirSync(dir)) {
    // Checked per entry, not only on entry: the loop below both spends budget and records results,
    // and reaching a bound here means this directory still had entries left to offer.
    if (walkBoundReached(found, state, depth)) {
      state.truncated = true;
      return;
    }
    state.remaining -= 1;
    visitFsDirEntry(dir, name, depth, base, found, state);
  }
}

/** What one `listFsFiles` walk found, and whether it saw the whole directory. */
export interface ListFsFilesResult {
  readonly files: string[];
  /** `true` when {@link MAX_LISTED_FILES}, {@link MAX_WALK_ENTRIES}, or {@link MAX_WALK_DEPTH} cut
   *  the walk short. A caller that ignores this reports a partial listing as a complete one. */
  readonly truncated: boolean;
}

/**
 * List every regular file under one allowed root (or a subdirectory of it), as paths relative to
 * the root. Descends real directories only — a symlinked directory is never followed. Files matching
 * a denied filename pattern are silently excluded (not merely refused on read), so a listing never
 * advertises a secret file's existence in the first place.
 *
 * @param required.rootPath - One of `layout.ts`'s resolved root directories (`repo`, `site`, or the operator-set `custom`).
 * @param required.relativePath - Optional subdirectory within the root to list; omit (or `""`) to
 *   list from the root itself.
 * @returns `files` — relative paths, sorted, using `/` separators; empty when the root (or
 *   subdirectory) does not exist on disk yet, which is not an error (a freshly-created site has no
 *   `agent-plugins/` at all). `truncated` — `true` when a bound cut the walk short, so the caller
 *   can say the listing is partial instead of presenting a short list as the whole directory.
 * @throws {FsFilePathError} If `relativePath` escapes the root, matches a denied pattern, or exists
 *   but is not a directory.
 * @complexity O(n) in the file count under the directory.
 */
export function listFsFiles(required: { rootPath: string; relativePath?: string }): ListFsFilesResult {
  const { rootPath } = required;
  const relativePath = required.relativePath ?? "";

  const startDir = relativePath.length === 0 ? resolve(rootPath) : resolveFsFilePath({ rootPath, relativePath });
  if (!existsSync(startDir)) return { files: [], truncated: false };

  const startStat = statOrFsPathError(startDir, relativePath || ".");
  if (!startStat) return { files: [], truncated: false };
  if (!startStat.isDirectory()) {
    throw new FsFilePathError(`path '${relativePath || "."}' is not a directory`);
  }

  const base = realpathSync(startDir);
  const found: string[] = [];
  const state: FsWalkState = { remaining: MAX_WALK_ENTRIES, truncated: false };
  walkFsDir(base, 0, base, found, state);

  // Listed relative to the WALK's own base (the requested subdirectory), matching
  // `theme_list_files`'s "paths relative to what you asked to list" contract — a caller that listed
  // `agent-plugins/site-compliance` gets `references/checklist.md`, not the full
  // `site-compliance/references/checklist.md`.
  return { files: found.sort(), truncated: state.truncated };
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
