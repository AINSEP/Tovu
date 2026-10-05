// Containment and bounded I/O live in Jini packages/platform/src/fs/guarded-reader.ts.
/** Tovu's read-only file policy and adapters over Jini's guarded filesystem reader.
 * Roots stay owner-selected; deny rules, listing exclusions, and resource budgets stay here.
 * Jini owns containment, symlink checks, filename folding, and bounded text/binary reads.
 */
import { resolve } from "node:path";
import {
  createGuardedFileReader,
  createNodeGuardedReaderFilesystem,
  type GuardedFileReader,
  type GuardedReaderFilesystem,
} from "@jini-ai/platform/fs/guarded-reader";
export { FsFilePathError } from "@jini-ai/platform/fs/guarded-reader";

// The owner widened repo/site/custom roots to default-allow; credential-bearing files are now
// protected by FS_FILES_DENYLIST rather than a curated location allowlist. New credential shapes
// must be added there. File tools remain read-only because arbitrary files have no downstream
// validator like theme writes do; the safety argument for theme_write_file does not transfer.
// One megabyte bounds inline model input and refuses pathological uploads before reading them.
export const MAX_FS_FILE_BYTES = 1_000_000;
// Bound the response independently of traversal: mostly denied entries can consume work without
// contributing any result, so a result-only cap would leave a synchronous walk unbounded.
const MAX_LISTED_FILES = 2_000;
const READER_LIMITS = {
  maxFileBytes: MAX_FS_FILE_BYTES,
  // Inspect enough leading structure to detect NULs without scanning the entire file for type.
  binarySniffBytes: 8_000,
  maxListedFiles: MAX_LISTED_FILES,
  // Real directory trees need a depth bound even though the reader never follows symlink loops.
  maxWalkDepth: 12,
  // Derive the entry budget from the result budget so traversal cannot make that cap unreachable.
  maxWalkEntries: MAX_LISTED_FILES * 10,
};
// Listing ergonomics only: dependencies/history/build output otherwise bury useful results and
// exhaust the listing budget. A known path here is still readable subject to the security denylist.
const EXCLUDED_LISTING_DIR_NAMES = new Set(["node_modules", ".git", "dist"]);

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
   * AND skipped entirely by the `fs_list_files` walk (in Jini's guarded reader) — its contents are
   * never even enumerated, not merely refused once named. Besides `secrets`, the set names the
   * well-known credential-store directories a home-directory `custom` root can expose: `.aws`
   * (`credentials`), `.docker` (`config.json` with registry auth), `.kube` (`config`), and
   * `gcloud`/`gh` for `.config/gcloud/application_default_credentials.json` and
   * `.config/gh/hosts.yml`. Denied by SEGMENT rather than by leaf filename on purpose: `config`,
   * `config.json`, and `hosts.yml` are generic names that appear harmlessly elsewhere, so denying the
   * directory is the narrower of the two mistakes.
   *
   * `.tovu` (2026-09-24) — the install-wide site key's own directory. `keyring.env.ts`'s
   * `siteKeySources` resolves to `<cwd>/sites/.tovu/site-key.hex` in production
   * (a SIBLING of every `sites/<name>/` folder, on the durable Fly volume) and to
   * `~/.tovu/site-keys/<siteKeyId>.hex` in local/dev (reachable through the operator-set `custom`
   * root, `layout.ts`'s home-directory case). `TOVU_SITE_KEY` is the one secret the
   * "site key" admin UI, webhook/newsletter signing secrets, and site-key
   * permission checks all derive from (see `keyring.env.ts`'s own header) — the owner's standing rule
   * is that the agent must never be able to read it off disk. Denying the whole `.tovu` segment, not
   * merely the generated filename, also keeps `fs_list_files` from ever enumerating that directory's
   * contents in the first place (in Jini's guarded reader), the same "never even advertise it"
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
   *   Belt-and-braces for these three: they are binary, so Jini's binary sniff would refuse a read
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
   * - `*-key*.hex` (2026-09-24) — belt-and-braces for the site key file itself, independent of
   *   the `.tovu` SEGMENT deny above: a copy, backup, or rename of `site-key.hex` sitting
   *   anywhere else in the tree (outside a `.tovu` directory, where the segment deny would not fire)
   *   is still the same live `TOVU_SITE_KEY` material and must stay unreadable.
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
   * - `.storage-secret.json` (exact basename, R1f) — a Postgres site's connection string, sealed with
   *   the site key in the site folder (`server/runtime/composition/storage-secret.ts`). Ciphertext,
   *   but no agent file tool reads, lists or copies it: it is the database's password. The pattern
   *   also covers the `..storage-secret.json.<pid>.<uuid>.tmp` a crashed write could leave behind.
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
    /-key[^/]*\.hex$/i,
    /^\.credentials\.json$/i,
    /^\.(?:bash_profile|bashrc|bash_login|zshrc|zprofile|zshenv|zlogin|profile)$/i,
    /^\.?\.storage-secret\.json(?:\..*)?$/i,
  ] as readonly RegExp[],
} as const;


/** Supplies host policy and an explicit filesystem port to the package reader. */
function createReader(
  { rootPath }: { rootPath: string },
  { filesystem = createNodeGuardedReaderFilesystem({}) }: { filesystem?: GuardedReaderFilesystem } = {}
): GuardedFileReader {
  return createGuardedFileReader({
    rootPath, denyRules: FS_FILES_DENYLIST, limits: READER_LIMITS, filesystem,
  }, { excludedListingDirs: EXCLUDED_LISTING_DIR_NAMES });
}

/** Checks a filename using Jini's host-filesystem folding and Tovu's deny rules. */
export function isDeniedFsFileName(fileName: string): boolean {
  return createReader({ rootPath: resolve(".") }).isDeniedFileName({ fileName });
}

/** Checks one segment, including Windows aliases and Unicode case folding. */
export function isDeniedFsPathSegment(segmentName: string): boolean {
  return createReader({ rootPath: resolve(".") }).isDeniedPathSegment({ segmentName });
}

/** Resolves a relative path with lexical, symlink, and effective-target checks.
 * @throws {FsFilePathError} On a malformed, denied, or escaped path.
 */
export function resolveFsFilePath(
  { rootPath, relativePath }: { rootPath: string; relativePath: string },
  optional: { filesystem?: GuardedReaderFilesystem } = {}
): string {
  return createReader({ rootPath }, optional).resolve({ relativePath });
}

export interface ListFsFilesResult {
  readonly files: string[];
  readonly truncated: boolean;
}

/** Lists bounded, sorted paths relative to the requested directory; skips symlinks and secrets.
 * @complexity Bounded by 20,000 entries, 2,000 results, and depth 12; filesystem reads are synchronous.
 */
export function listFsFiles(
  { rootPath, relativePath }: { rootPath: string; relativePath?: string },
  optional: { filesystem?: GuardedReaderFilesystem } = {}
): ListFsFilesResult {
  return createReader({ rootPath }, optional).list({}, { relativePath });
}

export interface ReadFsFileResult {
  readonly content: string;
  readonly bytes: number;
}

/** Reads bounded UTF-8 text; refuses denied, binary, missing, nonregular, or oversized files.
 * @complexity O(n) in bytes read, bounded by MAX_FS_FILE_BYTES plus one byte.
 * @example readFsFile({ rootPath, relativePath: "README.md" })
 */
export function readFsFile(
  { rootPath, relativePath }: { rootPath: string; relativePath: string },
  optional: { filesystem?: GuardedReaderFilesystem } = {}
): ReadFsFileResult {
  return createReader({ rootPath }, optional).read({ relativePath });
}

/** Reads complete binary bytes through the same guard; rejects rather than truncates over-limit files.
 * @complexity O(n) time and space, bounded by maxBytes plus one stream chunk.
 * @example await openFsFileForRead({ rootPath, relativePath: "hero.png", maxBytes: 52428800 })
 */
export function openFsFileForRead(
  { rootPath, relativePath, maxBytes }: { rootPath: string; relativePath: string; maxBytes: number },
  optional: { filesystem?: GuardedReaderFilesystem } = {}
): Promise<Uint8Array> {
  return createReader({ rootPath }, optional).readBytes({ relativePath, maxBytes });
}
