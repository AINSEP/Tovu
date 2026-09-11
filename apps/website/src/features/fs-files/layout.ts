// Both from the site-dir BARREL, never the file directly: `no-deep-imports:platform/site-dir` is
// `error`-severity (`.dependency-cruiser.mjs`'s `PROMOTED_NO_DEEP_IMPORTS`), and `resolveProductRoot`
// was added to the barrel (`platform/site-dir/index.ts`) alongside this file for exactly this import.
import { resolveProductRoot, resolveSiteRoot } from "../../platform/site-dir/index.js";

/**
 * @file Filesystem layout for the `fs_list_files`/`fs_read_file` agent-tool domain
 * (`agent-tools.ts`/`fs-files.ts`) — TWO broad roots, resolved without any `server/**` import
 * (`.dependency-cruiser.mjs`'s `feature-no-server-or-framework-imports` forbids that from
 * `features/**`). Mirrors `features/skills/layout.ts`/`features/agent-plugins/layout.ts`, which solve
 * the identical "a feature needs a real site-relative directory but must not import the composition
 * root" problem by calling {@link resolveSiteRoot} directly.
 *
 * ## Default-allow, not a curated allowlist (2026-09-10 owner decision)
 *
 * This domain SHIPPED (commit `68d7e525`) as a five-member named-root allowlist — `<site>/agent-plugins`,
 * `<site>/themes`, `<site>/skills`, `<site>/uploads`, and the bundled `content/agent-plugins` — with
 * everything else, including the site directory itself and the whole repo, structurally unreachable.
 * The product owner judged that too restrictive: her call is that the assistant should be able to
 * read most of the repository and site tree by default, and that the real boundary belongs on a
 * DENYLIST of what must never be read (secrets, `.env`, private keys, database files), not on a
 * pre-enumerated list of what may. This file now implements that half of it — two roots wide enough
 * to cover "most things" — and `fs-files.ts`'s `FS_FILES_DENYLIST` is where the actual off-limits
 * list lives; read that file's header for the denylist itself.
 *
 * - `repo` — {@link resolveProductRoot}'s directory: this installation's whole repository/product
 *   tree (source, docs, config, every app and package, and the product's own bundled `content/`) —
 *   everything OUTSIDE the active site.
 * - `site` — {@link resolveSiteRoot}'s directory: THIS site's entire data folder, not merely its
 *   `agent-plugins`/`themes`/`skills`/`uploads` subdirectories as before.
 *
 * ## What this trades away
 *
 * The site directory holds `chat.db` (every conversation the assistant has ever had) and
 * `content.db` directly, as siblings of `agent-plugins/`/`themes/`/etc. Under the old model those
 * were unreachable because the site directory itself was never a root — a location-based guarantee.
 * Under this model that guarantee is gone: `site` includes them. The only thing standing between the
 * assistant and those files now is `fs-files.ts`'s filename-pattern denylist (`*.db`/`*.db-wal`/
 * `*.db-shm`) plus its binary sniff (a SQLite file reliably contains a NUL byte in its first page).
 * State this plainly for the next reader: the protection moved from "never a root" to "denied by
 * pattern," which is a strictly weaker guarantee — a pattern can miss a shape nobody anticipated,
 * a missing root cannot. The owner made this trade deliberately; see `fs-files.ts`'s own header for
 * the full denylist and the reasoning behind each entry.
 *
 * `node_modules`, `.git`, and build output are excluded from `fs_list_files`'s WALK for ergonomics (a
 * listing that dumps `node_modules` is noise, not a useful result) — that exclusion is NOT a security
 * boundary and does not apply to `fs_read_file`; see `fs-files.ts`'s `EXCLUDED_LISTING_DIR_NAMES` for
 * the one place it is spelled out.
 *
 * `root` stays a closed, small id enum rather than an accepted arbitrary directory string, for the
 * same reason it always was: a caller-supplied root would make root SELECTION itself untrusted input.
 * Widening the enum is still a reviewed source change, never a runtime argument — only the SIZE of
 * what each of the two roots covers changed, not that principle.
 *
 * Architectural role: `fs-files` domain logic. Pure path computation — no I/O, no `server`/`express`
 * import. `fs-files.ts` performs the actual reads, re-validates containment, and applies the
 * denylist independently of this file ever having been called correctly.
 */

export const FS_ROOT_IDS = ["repo", "site"] as const;

export type FsRootId = (typeof FS_ROOT_IDS)[number];

export interface FsRootDescriptor {
  readonly id: FsRootId;
  /** Model-facing explanation of what lives here — folded into the tool schema's enum description. */
  readonly description: string;
}

/** Model-facing description of each root, kept next to the id list so the schema and the resolver
 *  can never name a root differently from what the enum actually contains. */
export const FS_ROOT_DESCRIPTORS: readonly FsRootDescriptor[] = [
  {
    id: "repo",
    description:
      "This installation's repository/product tree, outside the active site — source, docs, config, every app and package, and the product's own bundled content/ (themes, templates, agent-plugins). Secrets, .env files, private keys, and database files are refused wherever they appear.",
  },
  {
    id: "site",
    description:
      "This site's entire data directory (<site>/) — its agent-plugins, themes, skills, uploads, and configuration. Secrets, .env files, private keys, and database files (including this site's own chat/content databases) are refused wherever they appear.",
  },
];

export interface ResolveFsRootsOptional {
  /** Defaults to `process.cwd()` — injectable so this function is testable without `process.chdir()`. */
  readonly cwd?: string;
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolves both allowed roots to their real absolute directory for this Tovu instance.
 *
 * Each root is computed independently and does not need to exist on disk — `fs-files.ts`'s own
 * `listFsFiles` treats a missing root as an empty listing, matching `listThemeFiles`'s identical
 * "not created yet" handling.
 *
 * @complexity O(1).
 */
export function resolveFsRoots(optional: ResolveFsRootsOptional = {}): Record<FsRootId, string> {
  const { cwd, env } = optional;
  // `resolveProductRoot` walks up from ITS OWN module location by default, which is correct in both
  // the source (tsx) and compiled (dist) trees — see that function's own header. It takes no
  // `cwd`/`env` override because the product root is a fact about where this package's own code is
  // installed, not about which site is active.
  return {
    repo: resolveProductRoot(),
    site: resolveSiteRoot({ cwd, env }),
  };
}
