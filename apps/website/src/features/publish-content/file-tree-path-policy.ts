/** §2 deny-list — path SEGMENTS (never just the leaf name) that block a tree at any depth: a nested
 *  `.git` checkout, a vendored `node_modules`, or this feature's own staging/backup directories
 *  (never legitimately part of a source tree — {@link normalizeMode}'s caller stages under exactly
 *  these names, so a tree that already contains one is either corrupt or hostile). */
const DENY_SEGMENTS: ReadonlySet<string> = new Set([".git", "node_modules", ".publish-staging", ".publish-previous"]);

/** §2 deny-list — file EXTENSIONS (case-insensitive) that block a tree at any depth: private key
 *  material and raw database files, neither of which belongs in a published content/code tree. */
const DENY_EXTENSIONS: ReadonlySet<string> = new Set(["pem", "key", "p12", "pfx", "db", "sqlite", "db-wal", "db-shm"]);

/** Matches `.mcp.<anything>.json` — an MCP server config file, which can carry secrets in its own
 *  right (§2's separate "Structural secret rule" governs the one shape of that file this module still
 *  allows through: an `agent-plugin`'s own `mcp.json`/`.mcp.json`, checked by
 *  {@link checkMcpJsonSecretPlaceholders} instead of being denied outright). */
const MCP_CONFIG_NAME_PATTERN = /^\.mcp\..*\.json$/;

/**
 * OS-generated junk names (macOS Finder, Windows Explorer, AppleDouble sidecar files) that a real
 * contributor never means to publish and that reappear on disk on their own (macOS recreates
 * `.DS_Store` the moment a folder is opened in Finder again). These are IGNORED, not denied: a
 * caller walking a tree ({@link ../../theme/publish-content.ts}'s `walkThemeTree`) excludes them
 * before a file ever becomes a candidate at all. {@link checkTreeFiles} REFUSES one that still
 * reaches it (a sender whose walker did not skip it): the destination writes every file it is sent,
 * so a filtered-out name would be written without any check. Never blocking a tree the WALKER
 * found one of these in is the point of this set existing separately from
 * {@link deniedFileNameReason} — see `publish-files-plan-2026-09-24.md`'s real-world case: a theme's
 * `.DS_Store`, recreated by Finder, silently refused a legitimate publish with no reason shown.
 *
 * @complexity O(1).
 */
export function isIgnoredTreeFileName({ name }: { name: string }, _optional = {}): boolean {
  if (name === ".DS_Store" || name === "Thumbs.db" || name === "desktop.ini") return true;
  if (name === ".Spotlight-V100" || name === ".Trashes") return true;
  if (name.startsWith("._")) return true; // AppleDouble sidecar, e.g. "._photo.png".
  return false;
}

/**
 * Whether `name` (a bare file name, not a path) is denied at ANY depth within a tree, and why.
 * `.env`/`.env.*` (any suffix), `.npmrc`/`.netrc` (package manager credentials), `.mcp.*.json`
 * (MCP server env — never THIS shape; an agent-plugin's own `mcp.json`/`.mcp.json` is a different,
 * unprefixed name and is checked by {@link checkMcpJsonSecretPlaceholders} instead),
 * `.fs-custom-root.json` (a local absolute path), `.storage-secret.json` (a Postgres site's sealed
 * connection string, `storage-secret.ts`), and any `id_rsa`/`id_ed25519` private key file
 * (with or without an extension, e.g. `id_rsa.bak`). macOS's `.DS_Store` and its siblings are NOT
 * here — see {@link isIgnoredTreeFileName}: they are silently excluded, never a whole-tree DENY.
 *
 * @complexity O(1).
 */
function deniedFileNameReason({ name }: { name: string }, _optional = {}): string | null {
  // Judged on the name a backup/editor copy still means (`.npmrc.bak`, `.env~`, any case).
  const base = credentialBaseName({ name });
  if (base === ".env" || base.startsWith(".env.")) return "looks like an environment file";
  if (base === ".npmrc" || base === ".netrc") return "is a package-manager credential file";
  if (MCP_CONFIG_NAME_PATTERN.test(base)) return "is an MCP server configuration file, which can hold secrets";
  if (base === ".fs-custom-root.json") return "holds a local filesystem path, never portable across machines";
  if (base.includes(".storage-secret.json")) return "is a site's sealed database connection string";
  if (["id_rsa", "id_ed25519"].some((prefix) => base === prefix || base.startsWith(`${prefix}.`))) {
    return "looks like a private SSH key";
  }
  return null;
}

/** Editor/backup suffixes that leave a credential file's meaning intact, stacked or alone. */
const BACKUP_SUFFIX_PATTERN = /(?:\.(?:bak|old|orig)|~)+$/;

/** The lowercased name with trailing backup suffixes removed: `.NPMRC.bak~` → `.npmrc`. Shared with
 *  the raw-file backstop so both policies recognise the same credential copies. @complexity O(k). */
export function credentialBaseName({ name }: { name: string }, _optional: Record<string, never> = {}): string {
  return name.toLowerCase().replace(BACKUP_SUFFIX_PATTERN, "");
}

/** Key and database files by name, including a stemless `.pem`/`.key` and backups such as
 *  `site.db.bak` or `content.sqlite3`, which the extension rule alone does not see. @complexity O(k). */
function deniedKeyOrDatabaseReason({ base }: { base: string }, _optional: Record<string, never> = {}): string | null {
  if (/\.(?:pem|key|p12|pfx)$/.test(base)) return "looks like a private key or certificate file";
  if (/\.(?:db|sqlite3?)$/.test(base)) return "looks like a database file";
  return null;
}

/** §2: `.site-meta.json` and `config.json` are denied only AT THE TREE ROOT (depth 0) — both are a
 *  site's own per-install identity/host config, never a real theme/skill/plugin file, but the name
 *  alone is not suspicious at depth inside a tree (a theme could legitimately have its own nested
 *  `config.json` fixture). `${path}` here is already known to contain no `/` when this is checked. */
const ROOT_ONLY_DENIED_NAMES: ReadonlySet<string> = new Set([".site-meta.json", "config.json"]);

/** @complexity O(1). */
export function extensionOf({ relPath }: { relPath: string }, _optional = {}): string {
  const base = relPath.slice(relPath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}


/**
 * §3's "path shape (source AND destination)" rule for ONE relative path, plus §2's deny-list. Applied
 * identically on the packing side and the destination's `precheck` re-check (this file's own header),
 * so a path either side would refuse is refused by both.
 *
 * @returns A human-readable reason `relPath` is not publishable, or `null` when it is clean of every
 *   shape/deny-list rule this function checks — {@link checkTreeFiles} additionally applies the
 *   per-kind extension allow-list, caps, and content scan, none of which a single path can answer on
 *   its own.
 * @complexity O(k) in `relPath`'s length (segment split, one deny-list lookup per segment).
 */
export function checkTreePath({ relPath }: { relPath: string }, _optional = {}): string | null {
  const shapeReason = treePathShapeReason({ relPath });
  if (shapeReason) return shapeReason;
  const segments = relPath.split("/");
  const segmentReason = treePathSegmentReason({ relPath, segments });
  if (segmentReason) return segmentReason;

  const name = segments[segments.length - 1] as string;
  const deniedReason = deniedFileNameReason({ name });
  if (deniedReason) return `"${relPath}" ${deniedReason}`;
  if (segments.length === 1 && ROOT_ONLY_DENIED_NAMES.has(name)) {
    return `"${relPath}" is a per-install site file, never part of a published tree`;
  }

  const ext = extensionOf({ relPath });
  if (DENY_EXTENSIONS.has(ext)) return `"${relPath}" has a '.${ext}' extension, which is never published`;
  const keyOrDatabase = deniedKeyOrDatabaseReason({ base: credentialBaseName({ name }) });
  if (keyOrDatabase) return `"${relPath}" ${keyOrDatabase}`;

  return null;
}

/** Checks raw path shape before interpreting segments. @complexity O(k) in path length. */
function treePathShapeReason({ relPath }: { relPath: string }, _options = {}): string | null {
  if (relPath.length === 0) return `"${relPath}" is empty`;
  if (relPath.length > 512) return `"${relPath}" is longer than the 512-character path limit`;
  if (relPath.startsWith("/")) return `"${relPath}" must be relative, not start with '/'`;
  if (relPath.includes("\\")) return `"${relPath}" contains a backslash, which is never allowed in a tree path`;
  // Deliberately reject a literal NUL byte.
  if (relPath.includes("\0")) return `"${relPath}" contains a NUL byte`;

  return null;
}

/** Checks depth and every directory component. @complexity O(k) in path length. */
function treePathSegmentReason({ relPath, segments }: { relPath: string; segments: string[] }, _options = {}): string | null {
  if (segments.length > 16) return `"${relPath}" is nested deeper than the 16-level limit`;

  for (const segment of segments) {
    if (segment.length === 0) return `"${relPath}" contains an empty path segment`;
    if (segment === "." || segment === "..") return `"${relPath}" contains a '${segment}' segment, which is never allowed`;
    if (DENY_SEGMENTS.has(segment)) return `"${relPath}" contains a '${segment}' segment, which is never published`;
  }

  return null;
}
