/**
 * @file Filesystem layout for installed standalone Agent Skills (the agentskills.io `SKILL.md`
 * format). Sibling of, and deliberately independent from, `src/features/agent-plugins/layout.ts` —
 * see this file's own header below for what carries over and what does not.
 *
 * ---------------------------------------------------------------------------
 * Why this is a FLAT layout, not content-addressed (owner decision, verbatim: "they are different
 * things. there should be a skills/ and a separate agent-plugins/ directory.")
 * ---------------------------------------------------------------------------
 * Standalone skills live in flat named folders. The install service validates uploads and GitHub
 * content before publishing them atomically; installation metadata records provenance and enabled
 * state. Agent Plugins retain their separate content-addressed packaging and runtime.
 *
 * ---------------------------------------------------------------------------
 * Env override and `sites/<name>/` convention (same shape as every other `TOVU_*_DIR`)
 * ---------------------------------------------------------------------------
 * `TOVU_SKILLS_DIR` is required to be ABSOLUTE, for the identical reason `TOVU_AGENT_PLUGINS_DIR` is
 * (`agent-plugins/layout.ts`'s own header): a relative override resolved against an unpredictable
 * `cwd` is a correctness footgun, not a convenience. Defaults to `<site>/skills`, the same
 * `ws/<workspaceId>/` shape `<site>/uploads/` and `<site>/agent-plugins/` already use
 * (`sites/README.md`), where `<site>` is {@link resolveSiteRoot}'s answer — NOT `<cwd>/infra/skills`
 * as it was until 2026-08-27. Installed skills are site data: they must move with the site and
 * survive an upgrade, which a repo-relative `infra/` could not promise.
 *
 * The private id-segment guard now belongs to Jini `skills/install/layout.ts`. This adapter
 * supplies the site root and state-file name; Agent Skills and Agent Plugins retain separate
 * directories and host bindings.
 *
 * Architectural role:
 * Pure path computation. No I/O — `tool-registrations.ts` reads the directory tree this resolves.
 */
import path from "node:path";
import { createSkillLayout } from "@jini-ai/agentic/skills/install";

import { resolveSiteRoot } from "../../platform/site-dir/index.js";

/** One workspace's flat directory of installed skill folders: `<root>/ws/<workspaceId>/<skill-dir>/
 *  SKILL.md`, one subdirectory per skill. Not content-addressed — see this module's header. */
export interface SkillWorkspaceLayout {
  /** `<instance root>/ws/<workspaceId>` */
  readonly root: string;
}

export interface SkillLayout {
  /** `<site>/skills` (or `TOVU_SKILLS_DIR`) — the whole tree this feature owns. */
  readonly root: string;
  /**
   * Resolves the workspace-scoped skills directory for one workspace.
   *
   * @throws {Error} If `workspaceId` does not match the safe path-segment grammar (see
   * Jini skills/install/layout.ts's SAFE_ID_SEGMENT_PATTERN).
   */
  forWorkspace(workspaceId: string): SkillWorkspaceLayout;
}

export interface ResolveSkillLayoutOptional {
  /** Defaults to `process.cwd()` — injectable so this function is testable without `process.chdir()`. */
  readonly cwd?: string;
  /** Booted site directory; defaults are anchored here when supplied. */
  readonly siteDir?: string;
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolves the Agent Skills filesystem layout for this Tovu instance.
 *
 * @throws {Error} If `TOVU_SKILLS_DIR` is set to a relative path.
 * @complexity O(1).
 */
export function resolveSkillLayout(optional: ResolveSkillLayoutOptional = {}): SkillLayout {
  const cwd = optional.cwd ?? process.cwd();
  const env = optional.env ?? process.env;
  const override = env.TOVU_SKILLS_DIR;

  if (override !== undefined && !path.isAbsolute(override)) {
    throw new Error(`TOVU_SKILLS_DIR must be an absolute path, got '${override}'`);
  }

  const root = path.resolve(override ?? path.join(optional.siteDir ?? resolveSiteRoot({ cwd, env }), "skills"));

  const layout = createSkillLayout({ root, stagingRoot: path.join(root, ".staging"), workspaceDirectory: "ws", stateFileName: ".tovu-install.json" });
  return { root, forWorkspace(workspaceId) {
    try { return { root: layout.resolve({ workspaceId }).workspaceRoot }; }
    catch {
      // Quotes the RAW input, not the normalized one, so the message names what the caller passed.
      throw new Error(`forWorkspace: '${workspaceId}' is not a valid workspace id`);
    }
  } };
}
