/**
 * @file Filesystem layout for installed standalone Agent Skills (the agentskills.io `SKILL.md`
 * format). Sibling of, and deliberately independent from, `src/features/agent-plugins/layout.ts` —
 * see this file's own header below for what carries over and what does not.
 *
 * ---------------------------------------------------------------------------
 * Why this is a FLAT layout, not content-addressed (owner decision, verbatim: "they are different
 * things. there should be a skills/ and a separate agent-plugins/ directory.")
 * ---------------------------------------------------------------------------
 * `agent-plugins/layout.ts` keys every installed package by `packages/sha256/<digest>/` because an
 * Agent Plugin arrives as a downloaded archive — `install.ts` extracts bytes it did not author, so
 * content-addressing plus a frozen, read-only tree is what makes re-installs idempotent and
 * tampering detectable. A standalone Agent Skill has no equivalent origin: per the spec
 * (agentskills.io), "a single skill doesn't require a plugin wrapper" — it is a folder an operator
 * drops directly onto disk (`SKILL.md` plus optional `references/`, `scripts/`, `assets/`), with no
 * archive, no manifest digest, and no install pipeline of this feature's own. There is nothing to
 * content-address: the folder an operator creates IS the install. This layout therefore only
 * resolves WHERE that per-workspace directory of skill folders lives, not how one got there.
 *
 * ---------------------------------------------------------------------------
 * Env override and `infra/` convention (same shape as every other `TOVU_*_DIR`)
 * ---------------------------------------------------------------------------
 * `TOVU_SKILLS_DIR` is required to be ABSOLUTE, for the identical reason `TOVU_AGENT_PLUGINS_DIR` is
 * (`agent-plugins/layout.ts`'s own header): a relative override resolved against an unpredictable
 * `cwd` is a correctness footgun, not a convenience. Defaults to `<cwd>/infra/skills`, the same
 * `infra/ws/<workspaceId>/` shape `infra/uploads/` and `infra/agent-plugins/` already use
 * (`infra/README.md`).
 *
 * Deliberately does NOT import anything from `src/features/agent-plugins/` — Agent Skills and Agent
 * Plugins are different things with their own directories (owner decision, above), and this file's
 * small id-segment guard is duplicated rather than shared, for the same reason
 * `capability-projection.ts`/`capability-source.ts` already duplicate their own `humanize` helper
 * between themselves: a private guard belonging to one small module, not a promise to keep two
 * independent features' internals in sync.
 *
 * Architectural role:
 * Pure path computation. No I/O — `tool-registrations.ts` reads the directory tree this resolves.
 */
import path from "node:path";

/**
 * One safe, indivisible path segment: lowercase alphanumerics in `-`/`.`-separated runs, with no
 * leading, trailing, or doubled separator. Mirrors `agent-plugins/layout.ts`'s own
 * `SAFE_ID_SEGMENT_PATTERN` — duplicated rather than imported (see this file's header) — and accepts
 * this instance's real workspace id (`workspace-local`, per `infra/uploads/ws/workspace-local/`) as
 * well as every UUID.
 */
const SAFE_ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/** Bounds the segment so a caller cannot drive a pathological path length. */
const MAX_ID_SEGMENT_LENGTH = 64;

/** One workspace's flat directory of installed skill folders: `<root>/ws/<workspaceId>/<skill-dir>/
 *  SKILL.md`, one subdirectory per skill. Not content-addressed — see this module's header. */
export interface SkillWorkspaceLayout {
  /** `<instance root>/ws/<workspaceId>` */
  readonly root: string;
}

export interface SkillLayout {
  /** `infra/skills` (or `TOVU_SKILLS_DIR`) — the whole tree this feature owns. */
  readonly root: string;
  /**
   * Resolves the workspace-scoped skills directory for one workspace.
   *
   * @throws {Error} If `workspaceId` does not match the safe path-segment grammar (see
   * {@link SAFE_ID_SEGMENT_PATTERN}).
   */
  forWorkspace(workspaceId: string): SkillWorkspaceLayout;
}

export interface ResolveSkillLayoutOptional {
  /** Defaults to `process.cwd()` — injectable so this function is testable without `process.chdir()`. */
  readonly cwd?: string;
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

  const root = path.resolve(override ?? path.join(cwd, "infra", "skills"));

  return {
    root,
    forWorkspace(workspaceId: string): SkillWorkspaceLayout {
      // Normalize BEFORE validating, not after — see `agent-plugins/layout.ts`'s own comment at the
      // identical line: the pattern is deliberately lowercase-only, and the normalized value is the
      // one that actually becomes the path segment, so it is the only value worth asserting about.
      const normalizedWorkspaceId = workspaceId.toLowerCase();
      if (!SAFE_ID_SEGMENT_PATTERN.test(normalizedWorkspaceId) || normalizedWorkspaceId.length > MAX_ID_SEGMENT_LENGTH) {
        // Quotes the RAW input, not the normalized one, so the message names what the caller passed.
        throw new Error(`forWorkspace: '${workspaceId}' is not a valid workspace id`);
      }
      return { root: path.join(root, "ws", normalizedWorkspaceId) };
    },
  };
}
