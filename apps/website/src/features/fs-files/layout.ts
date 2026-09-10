import path from "node:path";

// Both from the site-dir BARREL, never the file directly: `no-deep-imports:platform/site-dir` is
// `error`-severity (`.dependency-cruiser.mjs`'s `PROMOTED_NO_DEEP_IMPORTS`), and `resolveProductRoot`
// was added to the barrel (`platform/site-dir/index.ts`) alongside this file for exactly this import.
import { resolveProductRoot, resolveSiteRoot } from "../../platform/site-dir/index.js";

/**
 * @file Filesystem layout for the `fs_list_files`/`fs_read_file` agent-tool domain
 * (`agent-tools.ts`/`fs-files.ts`) — a fixed, named allowlist of directories the assistant may look
 * inside, resolved without any `server/**` import (`.dependency-cruiser.mjs`'s
 * `feature-no-server-or-framework-imports` forbids that from `features/**`). Mirrors
 * `features/skills/layout.ts`/`features/agent-plugins/layout.ts`, which solve the identical "a
 * feature needs a real site-relative directory but must not import the composition root" problem by
 * calling {@link resolveSiteRoot} directly.
 *
 * ## Why a fixed, named enum of roots rather than free-form path input
 *
 * The bug this domain exists to fix: an Agent Plugin's own bundled `references/*.template.*` files
 * are unreachable to the assistant today, because the assistant has no filesystem access at all.
 * Every root below is a real, already-load-bearing site or product directory an operator already
 * expects an agent-authored change to be able to see — never the site directory itself (which holds
 * `chat.db`: every conversation the assistant has ever had) and never anything server-internal.
 *
 * `root` is a closed, five-member id rather than an accepted arbitrary directory string for the same
 * reason `theme_read_file` takes a `themeId` rather than a raw folder path: a caller-supplied root
 * would make the ALLOWLIST itself part of untrusted input. Naming the five roots here, in code, means
 * widening the surface is a reviewed source change, never a runtime argument.
 *
 * `<site>/` itself, `node_modules`, and the repo root are deliberately NOT on this list — see this
 * domain's own `agent-tools.ts` header for the full argument (`chat.db` alone is why the site
 * directory can never be a root).
 *
 * Architectural role: `fs-files` domain logic. Pure path computation — no I/O, no `server`/`express`
 * import. `fs-files.ts` performs the actual reads and re-validates containment independently of this
 * file ever having been called correctly.
 */

export const FS_ROOT_IDS = [
  "site-agent-plugins",
  "site-themes",
  "site-skills",
  "site-uploads",
  "bundled-agent-plugins",
] as const;

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
    id: "site-agent-plugins",
    description: "This site's installed Agent Plugins (<site>/agent-plugins) — manifests, skills, and each plugin's own bundled reference files.",
  },
  {
    id: "site-themes",
    description: "This site's themes (<site>/themes) — the same tree the theme_* tools already edit, exposed here read-only for cross-domain reads.",
  },
  {
    id: "site-skills",
    description: "This site's installed standalone Agent Skills (<site>/skills, the agentskills.io SKILL.md format).",
  },
  {
    id: "site-uploads",
    description: "This site's media upload payload (<site>/uploads) — the same files media_* tools manage, exposed here read-only.",
  },
  {
    id: "bundled-agent-plugins",
    description: "The product's own bundled Agent Plugins (content/agent-plugins in the installed package), shared by every site.",
  },
];

export interface ResolveFsRootsOptional {
  /** Defaults to `process.cwd()` — injectable so this function is testable without `process.chdir()`. */
  readonly cwd?: string;
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolves every allowed root to its real absolute directory for this Tovu instance.
 *
 * Each root is computed independently and does not need to exist on disk — `fs-files.ts`'s own
 * `listFsFiles` treats a missing root as an empty listing, matching `listThemeFiles`'s identical
 * "not created yet" handling.
 *
 * @complexity O(1).
 */
export function resolveFsRoots(optional: ResolveFsRootsOptional = {}): Record<FsRootId, string> {
  const { cwd, env } = optional;
  const site = resolveSiteRoot({ cwd, env });
  // `resolveProductRoot` walks up from ITS OWN module location by default, which is correct in both
  // the source (tsx) and compiled (dist) trees — see that function's own header. It takes no
  // `cwd`/`env` override because the product root is a fact about where this package's own code is
  // installed, not about which site is active.
  const product = resolveProductRoot();

  return {
    "site-agent-plugins": path.join(site, "agent-plugins"),
    "site-themes": path.join(site, "themes"),
    "site-skills": path.join(site, "skills"),
    "site-uploads": path.join(site, "uploads"),
    "bundled-agent-plugins": path.join(product, "content", "agent-plugins"),
  };
}
